// Vencimientos de documentos → archivo de calendario (.ics) que el teléfono abre y agrega a su calendario
// (iPhone, Android, Google Calendar, Outlook). Cada evento ocupa el día completo y tiene un identificador fijo:
// si vuelves a agregarlos, el calendario actualiza los que ya tenía en lugar de duplicarlos.
import { DOCS, estadoDeFecha } from './docsEstado';
import type { FilaExpediente } from './DocExpediente';

export interface EventoVencimiento { placa: string; documento: string; fecha: string; dias: number; vencido: boolean }

/** Documentos vencidos y por vencer (crítico o alerta: hasta 30 días) de las unidades dadas */
export function vencimientosParaCalendario(filas: FilaExpediente[]): EventoVencimiento[] {
  const out: EventoVencimiento[] = [];
  const agregar = (placa: string, documento: string, valor: unknown) => {
    const fecha = String(valor ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const e = estadoDeFecha(fecha);
    if (e.dias == null || e.score > 2) return; // vigentes con más de 30 días no se agregan
    out.push({ placa, documento, fecha, dias: e.dias, vencido: e.dias < 0 });
  };
  for (const { v, m } of filas) {
    for (const d of DOCS) agregar(v.placa, d.titulo, v[d.vencimiento]);
    for (const { doc } of m.personalizados) if (!/TIVE/i.test(doc.tipo)) agregar(v.placa, doc.tipo, doc.vencimiento);
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
}

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Las líneas del .ics no pasan de 75 caracteres: se parten con un espacio al inicio de la siguiente */
const plegar = (l: string) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join('\r\n '));
const compacta = (f: string) => f.replace(/-/g, '');
const sumarDia = (f: string) => {
  const [a, m, d] = f.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + 1));
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
};

export function construirIcs(eventos: EventoVencimiento[], empresa: string): string {
  const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const cuerpo = eventos.flatMap(e => {
    const cuando = e.vencido ? `Venció hace ${Math.abs(e.dias)} día${Math.abs(e.dias) === 1 ? '' : 's'}` : e.dias === 0 ? 'Vence hoy' : `Vence en ${e.dias} día${e.dias === 1 ? '' : 's'}`;
    const l = [
      'BEGIN:VEVENT',
      `UID:doc-${e.placa}-${compacta(e.fecha)}-${e.documento.replace(/[^A-Za-z0-9]+/g, '').slice(0, 24)}@azkell.com`,
      `DTSTAMP:${ahora}`,
      `DTSTART;VALUE=DATE:${compacta(e.fecha)}`,
      `DTEND;VALUE=DATE:${sumarDia(e.fecha)}`,
      `SUMMARY:${esc(`Vence ${e.documento} – ${e.placa}`)}`,
      `DESCRIPTION:${esc(`${e.documento} de la unidad ${e.placa}. ${cuando} (${e.fecha}).${empresa ? ` ${empresa}.` : ''} Generado desde Azkell Fleet.`)}`,
      'TRANSP:TRANSPARENT',
    ];
    if (!e.vencido) { // avisos una semana y un día antes (solo para los que aún no vencen)
      for (const antes of ['-P7D', '-P1D']) l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${e.documento} · ${e.placa}`)}`, `TRIGGER:${antes}`, 'END:VALARM');
    }
    l.push('END:VEVENT');
    return l;
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Azkell Fleet//Documentos de flota//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`Vencimientos de flota${empresa ? ` · ${empresa}` : ''}`)}`, ...cuerpo, 'END:VCALENDAR']
    .map(plegar).join('\r\n') + '\r\n';
}

/** En el teléfono abre la hoja de compartir (Agregar al calendario); en la computadora descarga el archivo */
export async function llevarAlCalendario(eventos: EventoVencimiento[], empresa: string): Promise<'compartido' | 'descargado'> {
  const archivo = new File([construirIcs(eventos, empresa)], 'vencimientos-flota.ics', { type: 'text/calendar' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Vencimientos de flota' }); return 'compartido'; }
    catch (err) { if ((err as Error).name === 'AbortError') return 'compartido'; /* otro error: se descarga */ }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'descargado';
}
