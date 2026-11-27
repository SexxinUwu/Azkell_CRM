// Seguridad de los PDF en el navegador, con qpdf compilado a WebAssembly: el cifrado y el descifrado ocurren en este equipo.
// El motor (1,3 MB) se carga solo cuando se usa Proteger o Desbloquear.
import wasmUrl from '@jspawn/qpdf-wasm/qpdf.wasm?url';
import { PDFDocument } from 'pdf-lib';
import type { Salida } from './motorPdf';

interface ModuloQpdf {
  FS: { writeFile: (ruta: string, datos: Uint8Array) => void; readFile: (ruta: string) => Uint8Array };
  callMain: (args: string[]) => number | void;
}

const sinExt = (n: string) => n.replace(/\.[^.]+$/, '');

interface Resultado { codigo: number; avisos: string; salida: Uint8Array | null }

/**
 * Corre qpdf una vez. Cada comando usa su propia instancia del motor: qpdf termina el programa al acabar cada comando
 * y una segunda llamada en la misma instancia ya no se comporta bien.
 * Códigos de salida: 0 bien, 3 bien con avisos, 2 error.
 */
async function qpdf(entrada: Uint8Array, args: string[], conSalida: boolean): Promise<Resultado> {
  // Se importa qpdf.js (CommonJS) y no qpdf.mjs: el envoltorio .mjs espera un script suelto y falla al empaquetarse
  const crear = (await import('@jspawn/qpdf-wasm/qpdf.js')).default as unknown as (o: object) => Promise<ModuloQpdf>;
  const avisos: string[] = [];
  const m = await crear({ locateFile: () => wasmUrl, print: () => undefined, printErr: (t: string) => { avisos.push(String(t)); } });
  m.FS.writeFile('/entrada.pdf', entrada);
  let codigo = 0;
  try { codigo = Number(m.callMain(args) ?? 0); }
  catch (e) {
    // Emscripten lanza ExitStatus cuando el programa termina con un código
    const st = (e as { status?: number }).status;
    if (typeof st !== 'number') throw e;
    codigo = st;
  }
  let salida: Uint8Array | null = null;
  if (conSalida && (codigo === 0 || codigo === 3)) { try { salida = m.FS.readFile('/salida.pdf'); } catch { salida = null; } }
  return { codigo, avisos: avisos.join(' '), salida };
}

const bytesDe = async (f: File) => new Uint8Array(await f.arrayBuffer());
const bien = (r: Resultado) => (r.codigo === 0 || r.codigo === 3) && !!r.salida;

/** Ponle contraseña al PDF (cifrado AES de 256 bits). Con `soloLectura` además se impide imprimir, copiar y editar. */
export async function protegerPdf(f: File, clave: string, soloLectura: boolean): Promise<Salida> {
  if (clave.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
  const entrada = await bytesDe(f);
  const restricciones = soloLectura ? ['--print=none', '--modify=none', '--extract=n', '--annotate=n', '--form=n', '--assemble=n'] : [];
  const r = await qpdf(entrada, ['--encrypt', clave, `${clave}-propietario`, '256', ...restricciones, '--', '/entrada.pdf', '/salida.pdf'], true);
  if (!bien(r)) {
    if (/password|encrypt/i.test(r.avisos)) throw new Error(`«${f.name}» ya tiene contraseña. Quítasela primero con «Desbloquear PDF».`);
    throw new Error(`No se pudo proteger «${f.name}»: ${r.avisos.slice(0, 160) || 'archivo no válido'}.`);
  }
  return { nombre: `${sinExt(f.name)}_protegido.pdf`, blob: new Blob([r.salida as BlobPart], { type: 'application/pdf' }), detalle: soloLectura ? 'Con contraseña y solo lectura' : 'Con contraseña' };
}

/** Quita la contraseña. Si el PDF solo tiene restricciones (no deja imprimir o copiar), no hace falta la clave. */
export async function desbloquearPdf(f: File, clave: string): Promise<Salida> {
  const entrada = await bytesDe(f);
  // Si pdf-lib lo abre sin problema, no está cifrado (qpdf --is-encrypted no es confiable en esta versión)
  const yaAbre = await PDFDocument.load(entrada).then(() => true, () => false);
  if (yaAbre) throw new Error(`«${f.name}» no tiene contraseña ni restricciones: no hay nada que quitar.`);
  const r = await qpdf(entrada, [...(clave ? [`--password=${clave}`] : []), '--decrypt', '/entrada.pdf', '/salida.pdf'], true);
  if (!bien(r)) {
    // El PDF sí está cifrado (se comprobó arriba) y qpdf no explica el motivo: un error aquí es, casi siempre, la contraseña
    if (r.codigo === 2 || /password/i.test(r.avisos)) throw new Error(clave ? 'La contraseña no es correcta.' : 'Este PDF pide contraseña para abrirse. Escríbela y vuelve a intentarlo.');
    throw new Error(`No se pudo desbloquear «${f.name}»: ${r.avisos.slice(0, 160) || 'archivo no válido'}.`);
  }
  return { nombre: `${sinExt(f.name)}_desbloqueado.pdf`, blob: new Blob([r.salida as BlobPart], { type: 'application/pdf' }), detalle: 'Sin contraseña ni restricciones' };
}
