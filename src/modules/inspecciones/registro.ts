// Registrar una inspección: mismos endpoints y formato que la versión actual.
//   GET  /api/mantenimiento/inspecciones/config       → secciones y puntos de la empresa
//   POST /api/mantenimiento/inspecciones/upload-url   → { ok, uploadUrl, finalUrl } (subida directa a S3)
//   POST /api/script/guardarInspeccion                → { data: 'Éxito', id: 'INSP-AAAA-NNNN' }
// El servidor numera la inspección y pasa las fallas a Reportes de fallas y a la OT activa.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { ESQUEMA_POR_DEFECTO } from './esquemaPorDefecto';
import type { PuntoRevisado } from './api';

export type TipoPunto = 'okfalla' | 'percent' | 'text';
export interface Seccion { titulo: string; items: Array<{ label: string; tipo: TipoPunto }> }

/** Respuesta de un punto mientras se llena el formulario */
export interface Respuesta {
  estado: 'OK' | 'FALLA' | '';
  observacion: string;
  porcentaje: string;
  texto: string;
  /** Foto reducida (data URL) aún no subida */
  foto: string;
}

export const respuestaVacia = (): Respuesta => ({ estado: '', observacion: '', porcentaje: '', texto: '', foto: '' });

export function useEsquema() {
  return useQuery({
    queryKey: ['inspecciones', 'esquema'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Seccion[]> => {
      try {
        const r = await api<{ ok?: boolean; data?: Array<{ titulo?: string; items_json?: unknown }> }>('/mantenimiento/inspecciones/config');
        if (r.ok && Array.isArray(r.data) && r.data.length) {
          return r.data.map(d => {
            let items: Array<{ label?: string; type?: string } | string> = [];
            try { items = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : (d.items_json as typeof items) ?? []; } catch { items = []; }
            return {
              titulo: (d.titulo || 'SISTEMA').toUpperCase(),
              items: items.map(it => (typeof it === 'string'
                ? { label: it, tipo: 'okfalla' as TipoPunto }
                : { label: it.label ?? '', tipo: (it.type as TipoPunto) || 'okfalla' })),
            };
          }).filter(s => s.items.length);
        }
      } catch { /* sin configuración: lista por defecto */ }
      return ESQUEMA_POR_DEFECTO;
    },
  });
}

/** Reduce una foto a 1600 px (JPEG) para subirla rápido desde el celular */
export async function reducirFoto(archivo: File, maximo = 1600): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo abrir la foto.')); i.src = url; });
    const escala = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sube una foto a S3; si no se puede, la deja en base64 (como la versión actual) */
async function subirFoto(dataUrl: string, idTemporal: string): Promise<string> {
  try {
    const r = await api<{ ok?: boolean; uploadUrl?: string; finalUrl?: string }>('/mantenimiento/inspecciones/upload-url', {
      method: 'POST', body: { idInsp: idTemporal, fileName: 'foto.jpg', fileType: 'image/jpeg' },
    });
    if (!r.ok || !r.uploadUrl || !r.finalUrl) return dataUrl;
    const blob = await (await fetch(dataUrl)).blob();
    const put = await fetch(r.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    return put.ok ? r.finalUrl : dataUrl;
  } catch {
    return dataUrl;
  }
}

export interface Cabecera { placa: string; fecha: string; km: string; cliente: string; tecnico: string; dias: string }

/** Arma los puntos en el formato de detalles_json de la versión actual */
export async function armarDetalles(esquema: Seccion[], respuestas: Record<string, Respuesta>, alSubir?: (hechas: number, total: number) => void) {
  const idTemporal = 'Insp_' + Date.now();
  const conFoto = Object.values(respuestas).filter(r => r.estado === 'FALLA' && r.foto).length;
  let subidas = 0;
  const detalles: PuntoRevisado[] = [];
  for (let s = 0; s < esquema.length; s++) {
    for (let i = 0; i < esquema[s].items.length; i++) {
      const it = esquema[s].items[i];
      const r = respuestas[claveRespuesta(s, i)] ?? respuestaVacia();
      let estado = 'SIN DATOS', observacion = '', foto = '';
      if (it.tipo === 'okfalla') {
        if (r.estado === 'OK') estado = 'OK';
        if (r.estado === 'FALLA') {
          estado = 'FALLA';
          observacion = r.observacion.trim();
          if (r.foto) { foto = await subirFoto(r.foto, idTemporal); alSubir?.(++subidas, conFoto); }
        }
      } else if (it.tipo === 'percent') {
        if (r.porcentaje !== '') estado = `${r.porcentaje}%`;
      } else if (it.tipo === 'text') {
        if (r.texto.trim()) { estado = 'REGISTRADO'; observacion = r.texto.trim(); }
      }
      detalles.push({ categoria: esquema[s].titulo, item: it.label, estado, observacion, foto });
    }
  }
  return detalles;
}

export const claveRespuesta = (seccion: number, item: number) => `${seccion}_${item}`;

export async function guardarInspeccion(cab: Cabecera, detalles: PuntoRevisado[], firma: string) {
  const usuario = localStorage.getItem('fleet_user') || cab.tecnico;
  const r = await api<{ data?: string; id?: string }>('/script/guardarInspeccion', {
    method: 'POST',
    body: {
      usuario,
      form: {
        id: '', id_ot: '', fecha_ingreso: cab.fecha, placa: cab.placa.toUpperCase(), km_tablero: cab.km, cliente: cab.cliente,
        tecnico: cab.tecnico, dias_propuestos: cab.dias || '30', detalles_json: JSON.stringify(detalles), firma_base64: firma, usuarioAutor: usuario,
      },
    },
  });
  if (r.data !== 'Éxito' || !r.id) throw new Error(r.data || 'No se pudo guardar la inspección');
  return r.id;
}

// ─── Borrador en el dispositivo (sin las fotos, que pesan) ───────────────────
const BORRADOR = 'azkell.inspeccion.borrador';
export interface Borrador { cabecera: Cabecera; respuestas: Record<string, Respuesta>; paso: number; guardado: number }

export function leerBorrador(): Borrador | null {
  try { const b = JSON.parse(localStorage.getItem(BORRADOR) || 'null'); return b && b.cabecera ? b : null; } catch { return null; }
}
export function guardarBorrador(b: Omit<Borrador, 'guardado'>) {
  try {
    const sinFotos = Object.fromEntries(Object.entries(b.respuestas).map(([k, r]) => [k, { ...r, foto: '' }]));
    localStorage.setItem(BORRADOR, JSON.stringify({ ...b, respuestas: sinFotos, guardado: Date.now() }));
  } catch { /* sin espacio: se sigue sin borrador */ }
}
export function borrarBorrador() { try { localStorage.removeItem(BORRADOR); } catch { /* nada */ } }

export const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
