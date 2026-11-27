// Motor de las Herramientas PDF. TODO ocurre en el navegador del usuario: los archivos no se envían a ningún servidor.
// pdf-lib arma y modifica los PDF; pdf.js los dibuja (miniaturas, PDF a imagen, comprimir); JSZip junta varios resultados.
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Salida { nombre: string; blob: Blob; detalle?: string }
export type Avance = (hecho: number, total: number) => void;

export const MAX_ARCHIVO_MB = 200;

const sinExt = (n: string) => n.replace(/\.[^.]+$/, '');
const bytesDe = async (f: File) => new Uint8Array(await f.arrayBuffer());
const comoPdf = (bytes: Uint8Array, nombre: string, detalle?: string): Salida => ({ nombre, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), detalle });

export const tamano = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Mensaje claro cuando un PDF no se puede abrir (clave, archivo dañado) */
function errorDe(e: unknown, nombre: string): Error {
  const m = String((e as Error)?.message ?? e);
  if (/encrypt|password|contrase/i.test(m)) return new Error(`«${nombre}» está protegido con contraseña. Quítale la clave y vuelve a intentarlo.`);
  if (/Invalid PDF|No PDF header|Failed to parse|Unexpected|bad XRef/i.test(m)) return new Error(`«${nombre}» no se pudo leer: el archivo parece dañado o no es un PDF.`);
  return new Error(m || `No se pudo procesar «${nombre}».`);
}

async function abrir(f: File): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await bytesDe(f));
  } catch (e) {
    throw errorDe(e, f.name);
  }
}

export async function contarPaginas(f: File): Promise<number> {
  return (await abrir(f)).getPageCount();
}

/** Texto como «1-3, 5, 8-10» → lista de rangos con índices desde 0. «todas» da todo el documento. */
export function leerRangos(texto: string, total: number): number[][] {
  const t = texto.trim().toLowerCase();
  if (!t) throw new Error('Escribe las páginas, por ejemplo: 1-3, 5, 8-10.');
  if (t === 'todas') return [Array.from({ length: total }, (_, i) => i)];
  const rangos: number[][] = [];
  for (const parte of t.split(/[,;]+/).map(p => p.trim()).filter(Boolean)) {
    const m = parte.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`«${parte}» no es un rango válido. Usa números separados por comas, por ejemplo 1-3, 5.`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`El rango «${parte}» está fuera del documento (tiene ${total} páginas).`);
    const lista: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) lista.push(i - 1);
    else for (let i = a; i >= b; i--) lista.push(i - 1);
    rangos.push(lista);
  }
  return rangos;
}

async function zipDe(salidas: Salida[], nombre: string): Promise<Salida> {
  const z = new JSZip();
  salidas.forEach(s => z.file(s.nombre, s.blob));
  const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { nombre, blob, detalle: `${salidas.length} archivos` };
}

// ─── Unir ───────────────────────────────────────────────────────────────────

export async function unir(archivos: File[], alAvance?: Avance): Promise<Salida> {
  if (archivos.length < 2) throw new Error('Elige al menos 2 PDF para unir.');
  const salida = await PDFDocument.create();
  for (let i = 0; i < archivos.length; i++) {
    const doc = await abrir(archivos[i]);
    const paginas = await salida.copyPages(doc, doc.getPageIndices());
    paginas.forEach(p => salida.addPage(p));
    alAvance?.(i + 1, archivos.length);
  }
  return comoPdf(await salida.save(), 'unido.pdf', `${salida.getPageCount()} páginas`);
}

// ─── Dividir y extraer ──────────────────────────────────────────────────────

async function pdfDePaginas(origen: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  (await d.copyPages(origen, indices)).forEach(p => d.addPage(p));
  return d.save();
}

/** Cada rango sale como un PDF; si hay varios se entregan juntos en un ZIP */
export async function dividir(f: File, rangos: number[][], alAvance?: Avance): Promise<Salida> {
  const origen = await abrir(f);
  const base = sinExt(f.name);
  const salidas: Salida[] = [];
  for (let i = 0; i < rangos.length; i++) {
    const r = rangos[i];
    const etiqueta = r.length === 1 ? `pag-${r[0] + 1}` : `pag-${Math.min(...r) + 1}-a-${Math.max(...r) + 1}`;
    salidas.push(comoPdf(await pdfDePaginas(origen, r), `${base}_${etiqueta}.pdf`, `${r.length} páginas`));
    alAvance?.(i + 1, rangos.length);
  }
  return salidas.length === 1 ? salidas[0] : zipDe(salidas, `${base}_dividido.zip`);
}

export const cadaN = (total: number, n: number): number[][] => {
  const r: number[][] = [];
  for (let i = 0; i < total; i += n) r.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
  return r;
};

// ─── Organizar, rotar y borrar páginas ──────────────────────────────────────

export interface PaginaOrden { indice: number; giro: number }

/** Arma un PDF con las páginas en el orden dado, cada una con su giro adicional (0, 90, 180, 270). Las que no se incluyen quedan borradas. */
export async function reordenar(f: File, orden: PaginaOrden[], nombreSalida?: string): Promise<Salida> {
  if (!orden.length) throw new Error('El documento no puede quedar sin páginas.');
  const origen = await abrir(f);
  const d = await PDFDocument.create();
  const copiadas = await d.copyPages(origen, orden.map(o => o.indice));
  copiadas.forEach((p, i) => {
    if (orden[i].giro) p.setRotation(degrees((p.getRotation().angle + orden[i].giro) % 360));
    d.addPage(p);
  });
  return comoPdf(await d.save(), nombreSalida ?? `${sinExt(f.name)}_editado.pdf`, `${orden.length} páginas`);
}

/** Gira todo el documento, o solo los rangos dados */
export async function rotar(f: File, grados: number, indices: number[] | null): Promise<Salida> {
  const doc = await abrir(f);
  const sel = new Set(indices ?? doc.getPageIndices());
  doc.getPages().forEach((p, i) => {
    if (sel.has(i)) p.setRotation(degrees((((p.getRotation().angle + grados) % 360) + 360) % 360));
  });
  return comoPdf(await doc.save(), `${sinExt(f.name)}_girado.pdf`, `${sel.size} páginas giradas`);
}

// ─── Imagen → PDF ───────────────────────────────────────────────────────────

export interface OpcionesImagenPdf { hoja: 'ajustar' | 'a4' | 'carta'; orientacion: 'auto' | 'vertical' | 'horizontal'; margen: 'sin' | 'pequeno' | 'normal'; filtro?: 'color' | 'gris' | 'documento' }

const HOJAS: Record<'a4' | 'carta', [number, number]> = { a4: [595.28, 841.89], carta: [612, 792] };
const MARGENES = { sin: 0, pequeno: 18, normal: 36 } as const;

/** Imagen ya orientada (respeta la rotación de las fotos del celular) como PNG o JPG listo para PDF */
async function imagenParaPdf(f: File, filtro: OpcionesImagenPdf['filtro'] = 'color'): Promise<{ bytes: Uint8Array; png: boolean; w: number; h: number }> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`«${f.name}» no se pudo abrir como imagen.`); }
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar la imagen.');
  const png = f.type === 'image/png';
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bmp, 0, 0);
  // Escaneo: gris, o «documento» (gris con más contraste y el fondo llevado a blanco)
  if (filtro === 'gris' || filtro === 'documento') {
    const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = datos.data;
    for (let i = 0; i < px.length; i += 4) {
      let v = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      if (filtro === 'documento') v = Math.max(0, Math.min(255, ((v - 70) * 255) / (205 - 70)));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(datos, 0, 0);
  }
  const w = bmp.width; const h = bmp.height;
  bmp.close();
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92));
  if (!blob) throw new Error(`«${f.name}» no se pudo convertir.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), png, w, h };
}

export async function imagenesAPdf(archivos: File[], op: OpcionesImagenPdf, alAvance?: Avance): Promise<Salida> {
  if (!archivos.length) throw new Error('Elige al menos una imagen.');
  const d = await PDFDocument.create();
  const margen = MARGENES[op.margen];
  for (let i = 0; i < archivos.length; i++) {
    const im = await imagenParaPdf(archivos[i], op.filtro);
    const img = im.png ? await d.embedPng(im.bytes) : await d.embedJpg(im.bytes);
    if (op.hoja === 'ajustar') {
      const p = d.addPage([im.w + margen * 2, im.h + margen * 2]);
      p.drawImage(img, { x: margen, y: margen, width: im.w, height: im.h });
    } else {
      let [pw, ph] = HOJAS[op.hoja];
      const horizontal = op.orientacion === 'horizontal' || (op.orientacion === 'auto' && im.w > im.h);
      if (horizontal) [pw, ph] = [ph, pw];
      const p = d.addPage([pw, ph]);
      const k = Math.min((pw - margen * 2) / im.w, (ph - margen * 2) / im.h);
      const w = im.w * k; const h = im.h * k;
      p.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    alAvance?.(i + 1, archivos.length);
  }
  return comoPdf(await d.save(), archivos.length === 1 ? `${sinExt(archivos[0].name)}.pdf` : 'imagenes.pdf', `${archivos.length} ${archivos.length === 1 ? 'página' : 'páginas'}`);
}

// ─── pdf.js: miniaturas, PDF → imagen y comprimir ───────────────────────────

async function abrirParaDibujar(f: File) {
  const bytes = await bytesDe(f);
  try { return await pdfjs.getDocument({ data: bytes }).promise; }
  catch (e) { throw errorDe(e, f.name); }
}

type Pagina = Awaited<ReturnType<Awaited<ReturnType<typeof abrirParaDibujar>>['getPage']>>;

async function dibujar(p: Pagina, escala: number): Promise<HTMLCanvasElement> {
  const vp = p.getViewport({ scale: escala });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo dibujar la página.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  return c;
}

const aBlob = (c: HTMLCanvasElement, tipo: string, calidad?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('No se pudo generar la imagen.'))), tipo, calidad));

/** Miniaturas de todas las páginas, una por una (para que se vayan viendo). `cancelado` corta el trabajo si el usuario se fue. */
export async function miniaturas(f: File, ancho: number, alPagina: (indice: number, url: string, total: number) => void, cancelado: () => boolean) {
  const doc = await abrirParaDibujar(f);
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (cancelado()) return;
      const p = await doc.getPage(i);
      const base = p.getViewport({ scale: 1 });
      const c = await dibujar(p, ancho / base.width);
      const blob = await aBlob(c, 'image/jpeg', 0.7);
      p.cleanup();
      if (cancelado()) return;
      alPagina(i - 1, URL.createObjectURL(blob), doc.numPages);
    }
  } finally { void doc.loadingTask.destroy(); }
}

export async function pdfAImagenes(f: File, formato: 'jpg' | 'png', calidadDpi: number, indices: number[] | null, alAvance?: Avance): Promise<Salida> {
  const doc = await abrirParaDibujar(f);
  try {
    const lista = indices ?? Array.from({ length: doc.numPages }, (_, i) => i);
    const base = sinExt(f.name);
    const ancho = String(doc.numPages).length;
    const salidas: Salida[] = [];
    for (let k = 0; k < lista.length; k++) {
      const p = await doc.getPage(lista[k] + 1);
      const c = await dibujar(p, calidadDpi / 72);
      const blob = await aBlob(c, formato === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      p.cleanup();
      salidas.push({ nombre: `${base}_pag-${String(lista[k] + 1).padStart(ancho, '0')}.${formato}`, blob });
      alAvance?.(k + 1, lista.length);
    }
    return salidas.length === 1 ? salidas[0] : zipDe(salidas, `${base}_imagenes.zip`);
  } finally { void doc.loadingTask.destroy(); }
}

export type NivelCompresion = 'alta' | 'media' | 'baja';
// «alta» = más calidad y menos reducción. Se dibuja cada página a esa resolución y se guarda como JPG.
const NIVELES: Record<NivelCompresion, { dpi: number; jpg: number }> = { alta: { dpi: 150, jpg: 0.8 }, media: { dpi: 110, jpg: 0.65 }, baja: { dpi: 80, jpg: 0.5 } };

/** Reduce el peso volviendo cada página una imagen. Si el resultado no pesa menos, se devuelve el original sin cambios. */
export async function comprimir(f: File, nivel: NivelCompresion, alAvance?: Avance, forzar = false): Promise<Salida> {
  const { dpi, jpg } = NIVELES[nivel];
  const doc = await abrirParaDibujar(f);
  try {
    const salida = await PDFDocument.create();
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const base = p.getViewport({ scale: 1 });
      const c = await dibujar(p, dpi / 72);
      const blob = await aBlob(c, 'image/jpeg', jpg);
      p.cleanup();
      const img = await salida.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pag = salida.addPage([base.width, base.height]);
      pag.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      alAvance?.(i, doc.numPages);
    }
    const bytes = await salida.save();
    if (!forzar && bytes.length >= f.size) return { nombre: f.name, blob: f, detalle: 'Este PDF ya está optimizado: no se pudo reducir más, se conserva el original.' };
    const ahorro = Math.round((1 - bytes.length / f.size) * 100);
    return comoPdf(bytes, `${sinExt(f.name)}_comprimido.pdf`, `${tamano(f.size)} → ${tamano(bytes.length)} (−${ahorro} %)`);
  } finally { void doc.loadingTask.destroy(); }
}

// ─── Numerar páginas y marca de agua ────────────────────────────────────────

export interface OpcionesNumeros {
  posicion: 'abajo-centro' | 'abajo-derecha' | 'abajo-izquierda' | 'arriba-centro' | 'arriba-derecha' | 'arriba-izquierda';
  formato: 'n' | 'n-de-total' | 'pagina-n';
  desde: number;
  tamano: number;
}

const rotulo = (formato: OpcionesNumeros['formato'], n: number, total: number) => (formato === 'n' ? String(n) : formato === 'pagina-n' ? `Página ${n}` : `Página ${n} de ${total}`);

export async function numerar(f: File, op: OpcionesNumeros): Promise<Salida> {
  const doc = await abrir(f);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const paginas = doc.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    const { width, height } = p.getSize();
    const texto = rotulo(op.formato, i + op.desde, total + op.desde - 1);
    const w = fuente.widthOfTextAtSize(texto, op.tamano);
    const margen = 28;
    const x = op.posicion.endsWith('centro') ? (width - w) / 2 : op.posicion.endsWith('derecha') ? width - w - margen : margen;
    const y = op.posicion.startsWith('abajo') ? margen - op.tamano / 2 : height - margen - op.tamano / 2;
    p.drawText(texto, { x, y, size: op.tamano, font: fuente, color: rgb(0.2, 0.2, 0.2) });
  });
  return comoPdf(await doc.save(), `${sinExt(f.name)}_numerado.pdf`, `${total} páginas numeradas`);
}

export interface OpcionesMarca { texto: string; tamano: number; opacidad: number; angulo: number; color: 'gris' | 'rojo' | 'azul' | 'negro' }
const COLORES = { gris: rgb(0.5, 0.5, 0.5), rojo: rgb(0.8, 0.1, 0.1), azul: rgb(0.1, 0.3, 0.8), negro: rgb(0, 0, 0) };

export async function marcaDeAgua(f: File, op: OpcionesMarca): Promise<Salida> {
  const texto = op.texto.trim();
  if (!texto) throw new Error('Escribe el texto de la marca de agua.');
  const doc = await abrir(f);
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = (() => { try { return fuente.widthOfTextAtSize(texto, op.tamano); } catch { throw new Error('La marca de agua tiene un carácter que no se puede dibujar (por ejemplo un emoji). Usa letras y números.'); } })();
  const h = op.tamano * 0.7;
  const t = (op.angulo * Math.PI) / 180;
  doc.getPages().forEach(p => {
    const { width, height } = p.getSize();
    // Se centra el texto en la página aunque esté girado
    const x = width / 2 - ((w / 2) * Math.cos(t) - (h / 2) * Math.sin(t));
    const y = height / 2 - ((w / 2) * Math.sin(t) + (h / 2) * Math.cos(t));
    p.drawText(texto, { x, y, size: op.tamano, font: fuente, color: COLORES[op.color], opacity: op.opacidad, rotate: degrees(op.angulo) });
  });
  return comoPdf(await doc.save(), `${sinExt(f.name)}_marca.pdf`, `${doc.getPageCount()} páginas`);
}

// ─── Reparar ────────────────────────────────────────────────────────────────

/**
 * Reconstruye la tabla de objetos de un PDF que perdió su final (descargas cortadas, archivos truncados): busca cada «N G obj» en el
 * archivo, ubica el catálogo del documento y escribe una tabla nueva con los desplazamientos reales. Sirve para PDF sin objetos
 * comprimidos; devuelve null si no se puede (archivo muy grande, sin catálogo o con objetos comprimidos).
 */
function reconstruirTabla(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length > 60 * 1048576) return null;
  const txt = new TextDecoder('latin1').decode(bytes); // un carácter por byte: las posiciones coinciden con los bytes
  const inicios: Array<{ num: number; gen: number; pos: number }> = [];
  const re = /(?:^|[\s>\]])(\d{1,7})[ \t]+(\d{1,5})[ \t]+obj\b/g;
  for (let m = re.exec(txt); m; m = re.exec(txt)) {
    const pos = m.index + m[0].indexOf(m[1]);
    inicios.push({ num: Number(m[1]), gen: Number(m[2]), pos });
  }
  if (!inicios.length) return null;
  // Solo los objetos completos (con su «endobj» antes del siguiente); si un número se repite, vale el último
  const validos = new Map<number, { gen: number; pos: number; fin: number }>();
  let finMax = 0;
  for (let i = 0; i < inicios.length; i++) {
    const limite = i + 1 < inicios.length ? inicios[i + 1].pos : txt.length;
    const e = txt.indexOf('endobj', inicios[i].pos);
    if (e < 0 || e >= limite) continue;
    validos.set(inicios[i].num, { gen: inicios[i].gen, pos: inicios[i].pos, fin: e + 6 });
    finMax = Math.max(finMax, e + 6);
  }
  const cat = /\/Type\s*\/Catalog\b/.exec(txt);
  if (!cat) return null;
  const duenos = inicios.filter(x => x.pos <= cat.index);
  const raiz = duenos[duenos.length - 1];
  if (!raiz || !validos.has(raiz.num)) return null;
  // Si todos los objetos de páginas estuvieran comprimidos no habría «/Type /Page» a la vista
  if (!/\/Type\s*\/Page\b/.test(txt)) return null;
  const cuerpo = bytes.slice(0, finMax);
  const total = Math.max(...validos.keys()) + 1;
  let tabla = `\nxref\n0 ${total}\n`;
  const inicioTabla = cuerpo.length + 1;
  for (let n = 0; n < total; n++) {
    const o = validos.get(n);
    tabla += n === 0 || !o ? '0000000000 65535 f \n' : `${String(o.pos).padStart(10, '0')} ${String(o.gen).padStart(5, '0')} n \n`;
  }
  tabla += `trailer\n<< /Size ${total} /Root ${raiz.num} ${raiz.gen} R >>\nstartxref\n${inicioTabla}\n%%EOF\n`;
  const extra = new TextEncoder().encode(tabla);
  const out = new Uint8Array(cuerpo.length + extra.length);
  out.set(cuerpo, 0); out.set(extra, cuerpo.length);
  return out;
}

/** Reconstruye un PDF dañado: lee lo que se pueda con pdf-lib (rearmando antes la tabla de objetos si hace falta); si no abre, rehace cada página como imagen con pdf.js */
export async function reparar(f: File, alAvance?: Avance): Promise<Salida> {
  const base = sinExt(f.name);
  const bytes = await bytesDe(f);
  try {
    const opciones = { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false };
    let origen: PDFDocument;
    let reconstruido = false;
    try { origen = await PDFDocument.load(bytes, opciones); }
    catch {
      const arreglado = reconstruirTabla(bytes);
      if (!arreglado) throw new Error('sin tabla');
      origen = await PDFDocument.load(arreglado, opciones);
      reconstruido = true;
    }
    const n = origen.getPageCount();
    if (!n) throw new Error('sin páginas');
    const d = await PDFDocument.create();
    let bien = 0;
    for (let i = 0; i < n; i++) {
      try { const [p] = await d.copyPages(origen, [i]); d.addPage(p); bien++; } catch { /* esa página no se pudo recuperar */ }
      alAvance?.(i + 1, n);
    }
    if (!bien) throw new Error('ninguna página');
    return comoPdf(await d.save(), `${base}_reparado.pdf`, `${bien === n ? `${n} páginas recuperadas` : `${bien} de ${n} páginas recuperadas`}${reconstruido ? ' (se reconstruyó la tabla del archivo)' : ''}`);
  } catch {
    try {
      const r = await comprimir(f, 'alta', alAvance, true);
      return { ...r, nombre: `${base}_reparado.pdf`, detalle: 'Se rehizo cada página como imagen (el texto ya no se puede seleccionar).' };
    } catch {
      throw new Error(`«${f.name}» no se pudo reparar: el archivo está demasiado dañado.`);
    }
  }
}

// ─── Recortar ───────────────────────────────────────────────────────────────

export interface MargenesMm { arriba: number; abajo: number; izquierda: number; derecha: number }
const MM = 72 / 25.4;

/** Quita los márgenes dados (en mm, vistos con la página derecha) de todas las páginas o de las indicadas */
export async function recortar(f: File, m: MargenesMm, indices: number[] | null): Promise<Salida> {
  const doc = await abrir(f);
  const sel = new Set(indices ?? doc.getPageIndices());
  let mal = 0;
  doc.getPages().forEach((p, i) => {
    if (!sel.has(i)) return;
    const mb = p.getMediaBox();
    const a = m.arriba * MM, b = m.abajo * MM, l = m.izquierda * MM, r = m.derecha * MM;
    const rot = (((p.getRotation().angle % 360) + 360) % 360);
    // Márgenes de lo que se ve → márgenes de la página sin girar
    const [izq, arr, der, aba] = rot === 90 ? [a, r, b, l] : rot === 180 ? [r, b, l, a] : rot === 270 ? [b, l, a, r] : [l, a, r, b];
    const w = mb.width - izq - der, h = mb.height - arr - aba;
    if (w < 20 || h < 20) { mal++; return; }
    p.setCropBox(mb.x + izq, mb.y + aba, w, h);
  });
  if (mal === sel.size) throw new Error('Los márgenes son demasiado grandes: no quedaría nada de la página.');
  return comoPdf(await doc.save(), `${sinExt(f.name)}_recortado.pdf`, mal ? `${sel.size - mal} páginas recortadas (${mal} quedaron igual: margen demasiado grande)` : `${sel.size} páginas recortadas`);
}

// ─── Firmar ─────────────────────────────────────────────────────────────────

export interface OpcionesFirma { png: Uint8Array; ancho: number; posicion: 'abajo-derecha' | 'abajo-centro' | 'abajo-izquierda' | 'centro' | 'arriba-derecha' | 'arriba-centro' | 'arriba-izquierda'; paginas: number[] }

/** Pone la firma (imagen PNG con fondo transparente) en las páginas elegidas; `ancho` es el % del ancho de la página */
export async function firmar(f: File, op: OpcionesFirma): Promise<Salida> {
  if (!op.paginas.length) throw new Error('Elige en qué páginas va la firma.');
  const doc = await abrir(f);
  const img = await doc.embedPng(op.png);
  const sel = new Set(op.paginas);
  doc.getPages().forEach((p, i) => {
    if (!sel.has(i)) return;
    const { width, height } = p.getSize();
    const w = (width * op.ancho) / 100;
    const h = (w * img.height) / img.width;
    const margen = 36;
    const x = op.posicion.endsWith('derecha') ? width - w - margen : op.posicion.endsWith('izquierda') ? margen : (width - w) / 2;
    const y = op.posicion.startsWith('abajo') ? margen : op.posicion.startsWith('arriba') ? height - h - margen : (height - h) / 2;
    p.drawImage(img, { x, y, width: w, height: h });
  });
  return comoPdf(await doc.save(), `${sinExt(f.name)}_firmado.pdf`, `${sel.size} ${sel.size === 1 ? 'página firmada' : 'páginas firmadas'}`);
}

// ─── Texto: comparar y PDF a Markdown ───────────────────────────────────────

interface LineaTexto { texto: string; tam: number; y: number; pagina: number }

/** Líneas de texto de cada página, de arriba abajo, con el tamaño de letra (sirve para comparar y para detectar títulos) */
async function lineasDe(f: File, alAvance?: Avance): Promise<LineaTexto[]> {
  const doc = await abrirParaDibujar(f);
  try {
    const out: LineaTexto[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const c = await p.getTextContent();
      const items = (c.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>).filter(it => typeof it.str === 'string' && it.transform);
      const filas: Array<{ y: number; tam: number; piezas: Array<{ x: number; t: string }> }> = [];
      for (const it of items) {
        const t = it.transform as number[];
        const y = t[5]; const tam = Math.hypot(t[0], t[1]);
        let fila = filas.find(r => Math.abs(r.y - y) < Math.max(2, tam * 0.35));
        if (!fila) { fila = { y, tam, piezas: [] }; filas.push(fila); }
        fila.piezas.push({ x: t[4], t: it.str as string });
        fila.tam = Math.max(fila.tam, tam);
      }
      filas.sort((a, b) => b.y - a.y);
      for (const r of filas) {
        const texto = r.piezas.sort((a, b) => a.x - b.x).map(x => x.t).join('').replace(/\s+/g, ' ').trim();
        if (texto) out.push({ texto, tam: r.tam, y: r.y, pagina: n });
      }
      p.cleanup();
      alAvance?.(n, doc.numPages);
    }
    return out;
  } finally { void doc.loadingTask.destroy(); }
}

export interface LineaDiff { tipo: 'igual' | 'quitado' | 'agregado'; texto: string; pagina: number }

/** Compara el texto de dos PDF línea por línea (lo que está en A y no en B sale «quitado»; lo que solo está en B, «agregado») */
export async function compararPdf(a: File, b: File, alAvance?: Avance): Promise<LineaDiff[]> {
  const [la, lb] = [await lineasDe(a, (h, t) => alAvance?.(h, t * 2)), await lineasDe(b, (h, t) => alAvance?.(t + h, t * 2))];
  if (!la.length && !lb.length) throw new Error('Ninguno de los dos PDF tiene texto que se pueda comparar (puede ser un escaneo).');
  if (la.length > 4000 || lb.length > 4000) throw new Error('Los documentos son demasiado largos para compararlos aquí (más de 4000 líneas).');
  const n = la.length, m = lb.length;
  const w = m + 1;
  const T = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * w + j] = la[i].texto === lb[j].texto ? T[(i + 1) * w + j + 1] + 1 : Math.max(T[(i + 1) * w + j], T[i * w + j + 1]);
  const out: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (la[i].texto === lb[j].texto) { out.push({ tipo: 'igual', texto: la[i].texto, pagina: la[i].pagina }); i++; j++; }
    else if (T[(i + 1) * w + j] >= T[i * w + j + 1]) { out.push({ tipo: 'quitado', texto: la[i].texto, pagina: la[i].pagina }); i++; }
    else { out.push({ tipo: 'agregado', texto: lb[j].texto, pagina: lb[j].pagina }); j++; }
  }
  while (i < n) { out.push({ tipo: 'quitado', texto: la[i].texto, pagina: la[i].pagina }); i++; }
  while (j < m) { out.push({ tipo: 'agregado', texto: lb[j].texto, pagina: lb[j].pagina }); j++; }
  return out;
}

/** Texto del PDF como Markdown: los títulos se detectan por el tamaño de letra y las viñetas por su símbolo */
export async function pdfAMarkdown(f: File, alAvance?: Avance): Promise<Salida> {
  const lineas = await lineasDe(f, alAvance);
  if (!lineas.length) throw new Error('Este PDF no tiene texto (puede ser un escaneo): no hay nada que convertir.');
  const tams = lineas.map(l => l.tam).sort((a, b) => a - b);
  const cuerpo = tams[Math.floor(tams.length / 2)] || 10;
  const md: string[] = [];
  let parrafo: string[] = [];
  const cerrar = () => { if (parrafo.length) { md.push(parrafo.join(' ')); parrafo = []; } };
  let anterior: LineaTexto | null = null;
  for (const l of lineas) {
    const r = l.tam / cuerpo;
    const viñeta = /^[•·▪●◦\-–]\s+/.test(l.texto);
    if (r >= 1.6) { cerrar(); md.push(`# ${l.texto}`); }
    else if (r >= 1.3) { cerrar(); md.push(`## ${l.texto}`); }
    else if (r >= 1.12) { cerrar(); md.push(`### ${l.texto}`); }
    else if (viñeta) { cerrar(); md.push(`- ${l.texto.replace(/^[•·▪●◦\-–]\s+/, '')}`); }
    else {
      // Una línea nueva con un salto grande (o de otra página) abre otro párrafo
      if (anterior && (anterior.pagina !== l.pagina ? false : Math.abs(anterior.y - l.y) > l.tam * 2)) cerrar();
      parrafo.push(l.texto);
    }
    anterior = l;
  }
  cerrar();
  const texto = md.join('\n\n') + '\n';
  return { nombre: `${sinExt(f.name)}.md`, blob: new Blob([texto], { type: 'text/markdown;charset=utf-8' }), detalle: `${lineas.length} líneas` };
}

// ─── Formularios ────────────────────────────────────────────────────────────

export interface CampoForm { nombre: string; tipo: 'texto' | 'casilla' | 'lista' | 'opciones'; valor: string | boolean; opciones: string[] }

/** Campos rellenables del PDF (texto, casillas, listas y opciones); vacío si el PDF no es un formulario */
export async function leerCampos(f: File): Promise<CampoForm[]> {
  const form = (await abrir(f)).getForm();
  const out: CampoForm[] = [];
  for (const c of form.getFields()) {
    const nombre = c.getName();
    if (c instanceof PDFTextField) out.push({ nombre, tipo: 'texto', valor: c.getText() ?? '', opciones: [] });
    else if (c instanceof PDFCheckBox) out.push({ nombre, tipo: 'casilla', valor: c.isChecked(), opciones: [] });
    else if (c instanceof PDFDropdown) out.push({ nombre, tipo: 'lista', valor: c.getSelected()[0] ?? '', opciones: c.getOptions() });
    else if (c instanceof PDFOptionList) out.push({ nombre, tipo: 'lista', valor: c.getSelected()[0] ?? '', opciones: c.getOptions() });
    else if (c instanceof PDFRadioGroup) out.push({ nombre, tipo: 'opciones', valor: c.getSelected() ?? '', opciones: c.getOptions() });
  }
  return out;
}

export async function llenarFormulario(f: File, campos: CampoForm[], aplanar: boolean): Promise<Salida> {
  const doc = await abrir(f);
  const form = doc.getForm();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const c of campos) {
    try {
      if (c.tipo === 'texto') form.getTextField(c.nombre).setText(String(c.valor ?? ''));
      else if (c.tipo === 'casilla') { const x = form.getCheckBox(c.nombre); if (c.valor) x.check(); else x.uncheck(); }
      else if (c.tipo === 'lista') { const nom = c.nombre; const campo = form.getField(nom); if (c.valor) { if (campo instanceof PDFDropdown) campo.select(String(c.valor)); else if (campo instanceof PDFOptionList) campo.select(String(c.valor)); } }
      else if (c.tipo === 'opciones' && c.valor) form.getRadioGroup(c.nombre).select(String(c.valor));
    } catch (e) {
      throw new Error(`No se pudo llenar el campo «${c.nombre}»: ${String((e as Error).message ?? e)}`);
    }
  }
  form.updateFieldAppearances(fuente);
  if (aplanar) form.flatten();
  return comoPdf(await doc.save(), `${sinExt(f.name)}_lleno.pdf`, aplanar ? 'Formulario llenado y fijado (ya no se edita)' : 'Formulario llenado (se puede seguir editando)');
}

// ─── Descarga ───────────────────────────────────────────────────────────────

export function descargar(s: Salida) {
  const url = URL.createObjectURL(s.blob);
  const a = document.createElement('a');
  a.href = url; a.download = s.nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
