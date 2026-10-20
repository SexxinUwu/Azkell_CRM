import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { ImportarValidadoSheet, claveEncabezado, leerTabla, textoCelda, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import { clavePlaca, type Inspeccion, type PuntoRevisado } from './api';
import { useEsquema, type Seccion } from './registro';

// Inspecciones desde Excel (POST /api/importarInspeccionesMasivo, upsert por ID).
// Mismos encabezados que el clásico: ID, FECHA INGRESO, PLACA, KM TABLERO, CLIENTE, TECNICO, DIAS PROPUESTOS y,
// después, una columna por cada punto de la lista de inspección de la empresa ("OK", "FALLA | detalle", "50%" o texto).
interface Dato {
  id: string; fecha_ingreso: string; placa: string; km_tablero: string; cliente: string; tecnico: string;
  dias_propuestos: string; detalles_json: string;
}
interface Resultado { ok: number; errores: number; detalle?: string | null; error?: string }

const BASE = ['ID', 'FECHA INGRESO', 'PLACA', 'KM TABLERO', 'CLIENTE', 'TECNICO', 'DIAS PROPUESTOS'];
const puntosDe = (esquema: Seccion[]) => esquema.flatMap(s => s.items.map(it => ({ categoria: s.titulo, label: it.label })));

export async function descargarPlantillaInspecciones(esquema: Seccion[]) {
  const puntos = puntosDe(esquema);
  const ejemplo = ['(Dejar vacío para nuevo)', '2024-05-20', 'ABC-123', '150000', 'EMPRESA SAC', 'JUAN PEREZ', '30',
    ...puntos.map(p => (p.label.includes('Porcentaje') || p.label.includes('%') ? '50%' : 'OK'))];
  await exportarExcel('Plantilla_Importacion_Inspecciones', 'Plantilla_Inspecciones', [...BASE, ...puntos.map(p => p.label)], [ejemplo]);
}

// Fecha → AAAA-MM-DD. Acepta AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA y fechas reales de Excel (ya vienen como AAAA-MM-DD).
function fechaISO(s: string): string | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (d) m = [d[0], d[3], d[2].padStart(2, '0'), d[1].padStart(2, '0')];
  }
  if (!m) return null;
  const f = new Date(+m[1], +m[2] - 1, +m[3]);
  return f.getFullYear() === +m[1] && f.getMonth() === +m[2] - 1 && f.getDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Misma interpretación que el clásico: "OK ...", "FALLA ...", "50%" o texto libre
function punto(categoria: string, item: string, valor: string): PuntoRevisado {
  const mayus = valor.toUpperCase();
  const resto = (palabra: string) => valor.substring(mayus.indexOf(palabra) + palabra.length).replace(/^[\s|:-]+/, '').trim();
  if (mayus.includes('OK')) return { categoria, item, estado: 'OK', observacion: resto('OK'), foto: '' };
  if (mayus.includes('FALLA')) return { categoria, item, estado: 'FALLA', observacion: resto('FALLA'), foto: '' };
  if (valor.includes('%')) return { categoria, item, estado: valor, observacion: '', foto: '' };
  return { categoria, item, estado: 'REGISTRADO', observacion: valor, foto: '' };
}

export function ImportarInspeccionesSheet({ open, onClose, existentes, placasRegistradas }: {
  open: boolean; onClose: () => void; existentes: Inspeccion[]; placasRegistradas: string[];
}) {
  const qc = useQueryClient();
  const esquema = useEsquema();

  async function leer(archivo: File): Promise<FilaRevisada<Dato>[]> {
    if (!esquema.data) throw new Error('Aún se está cargando la lista de puntos de inspección. Espera un momento y vuelve a elegir el archivo.');
    const puntos = puntosDe(esquema.data);
    const { claves, datos } = await leerTabla(archivo);
    const col = (nombre: string) => claves.indexOf(claveEncabezado(nombre));
    const pos = { id: col('ID'), fecha: col('FECHA INGRESO'), placa: col('PLACA'), km: col('KM TABLERO'), cliente: col('CLIENTE'), tecnico: col('TECNICO'), dias: col('DIAS PROPUESTOS') };
    if (pos.placa < 0) throw new Error('El archivo no tiene la columna PLACA.');
    // Si un punto se llama igual en dos secciones (p. ej. "Otros"), cada aparición toma su propia columna, en orden
    const usadas = new Map<string, number>();
    const posPuntos = puntos.map(p => {
      const k = claveEncabezado(p.label);
      let desde = 0, pos = -1;
      for (let n = usadas.get(k) ?? 0; n >= 0; n--) { pos = claves.indexOf(k, desde); if (pos < 0) break; desde = pos + 1; }
      usadas.set(k, (usadas.get(k) ?? 0) + 1);
      return { ...p, pos };
    });
    const idsExistentes = new Set(existentes.map(i => i.id));
    const placas = new Set(placasRegistradas.map(clavePlaca));
    const idsVistos = new Map<string, number>();
    const lote = Date.now();

    return datos.map(({ fila, celdas }, n) => {
      const v = (p: number) => (p >= 0 ? textoCelda(celdas[p]) : '');
      const idCrudo = v(pos.id);
      const id = idCrudo && idCrudo !== '(Dejar vacío para nuevo)' ? idCrudo : `INSP-${lote}-${n}`;
      const placa = v(pos.placa).toUpperCase();
      const fecha = v(pos.fecha);
      const km = v(pos.km).replace(/,/g, '');
      const dias = v(pos.dias);
      const detalles: PuntoRevisado[] = posPuntos
        .map(p => ({ p, valor: p.pos >= 0 ? textoCelda(celdas[p.pos]) : '' }))
        .filter(x => x.valor !== '')
        .map(x => punto(x.p.categoria, x.p.label, x.valor));

      let error: string | undefined;
      if (!placa) error = 'Falta la PLACA.';
      else if (!fecha) error = 'Falta la FECHA INGRESO.';
      else if (!fechaISO(fecha)) error = 'FECHA INGRESO no válida (usa AAAA-MM-DD o DD/MM/AAAA).';
      else if (km && !/^\d+(\.\d+)?$/.test(km)) error = 'KM TABLERO debe ser un número.';
      else if (dias && !/^\d+$/.test(dias)) error = 'DIAS PROPUESTOS debe ser un número entero.';
      else if (idsVistos.has(id)) error = `El ID se repite en la fila ${idsVistos.get(id)} del archivo.`;
      if (!idsVistos.has(id)) idsVistos.set(id, fila);

      const avisos: string[] = [];
      if (!error) {
        if (idsExistentes.has(id)) avisos.push('Reemplaza la inspección existente (se pierden sus fotos)');
        if (!placas.has(clavePlaca(placa))) avisos.push('Placa no registrada en la flota');
        if (!detalles.length) avisos.push('Sin puntos revisados');
      }
      return {
        fila, error,
        nota: avisos.join(' · ') || undefined,
        celdas: [placa, fechaISO(fecha) ?? fecha, v(pos.tecnico), `${detalles.length} puntos`],
        dato: {
          id, fecha_ingreso: fechaISO(fecha) ?? '', placa, km_tablero: km, cliente: v(pos.cliente), tecnico: v(pos.tecnico),
          dias_propuestos: dias || '30', detalles_json: JSON.stringify(detalles),
        },
      };
    });
  }

  async function enviar(validas: Dato[]) {
    const r = await api<Resultado>('/importarInspeccionesMasivo', { method: 'POST', body: { registros: validas } });
    if (r.error) throw new Error(r.error);
    if (r.errores > 0 && r.ok === 0) throw new Error(`Importación fallida${r.detalle ? `: ${r.detalle}` : ''}`);
    return `${r.ok} inspecciones importadas${r.errores ? ` · ${r.errores} con error en el servidor${r.detalle ? ` (${r.detalle})` : ''}` : ''}`;
  }

  return (
    <ImportarValidadoSheet<Dato>
      open={open} onClose={onClose} titulo="Importar inspecciones desde Excel" plural="inspecciones"
      columnas={['Placa', 'Fecha', 'Técnico', 'Puntos']}
      leer={leer} enviar={enviar} plantilla={() => descargarPlantillaInspecciones(esquema.data ?? [])}
      alTerminar={() => qc.invalidateQueries({ queryKey: ['inspecciones'] })}
      ayuda="Si el ID ya existe, la inspección se reemplaza; con el ID vacío se crea una nueva."
    />
  );
}
