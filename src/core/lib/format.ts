// Formatos para Perú (es-PE, zona horaria de Lima).
const TZ = 'America/Lima';

const dateLong = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dateShort = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const time = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const money = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitPrice = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quantity = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** "S/ 50,000.00" — importes */
export function formatSoles(n: number | null | undefined) {
  return n == null ? '—' : `S/ ${money.format(n)}`;
}

/** "S/ 15.40" o "S/ 15.395" — precio por galón (hasta 4 decimales, sin ceros de más) */
export function formatPrice(n: number | null | undefined) {
  return n == null ? '—' : `S/ ${unitPrice.format(n)}`;
}

/** "1,250.5" — galones u otras cantidades */
export function formatQuantity(n: number | null | undefined) {
  return n == null ? '—' : quantity.format(n);
}

/** "Sábado, 10 de octubre" */
export function formatLongDate(d: Date | string = new Date()) {
  return capitalize(dateLong.format(new Date(d)));
}

/** "10 oct 2026" */
export function formatShortDate(d: Date | string) {
  return dateShort.format(new Date(d)).replace('.', '');
}

/** "13:42" */
export function formatTime(d: Date | string) {
  return time.format(new Date(d));
}

/** Clave de día en Lima: "2026-10-10" */
export function dayKey(d: Date | string) {
  return dayKeyFmt.format(new Date(d));
}

/** "Hoy", "Ayer" o "Jueves, 8 de octubre" */
export function formatDayHeading(d: Date | string) {
  const key = dayKey(d);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return 'Hoy';
  if (key === yesterday) return 'Ayer';
  return formatLongDate(d);
}

/** "hace 5 minutos", "ayer", "hace 3 días" */
export function formatRelative(d: Date | string | null | undefined) {
  if (!d) return 'Nunca';
  const diffSec = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'Hace un momento';
  if (abs < 3600) return capitalize(relative.format(Math.round(diffSec / 60), 'minute'));
  if (abs < 86400) return capitalize(relative.format(Math.round(diffSec / 3600), 'hour'));
  if (abs < 86400 * 30) return capitalize(relative.format(Math.round(diffSec / 86400), 'day'));
  return formatShortDate(d);
}

/** Saludo según la hora en Lima */
export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "MC" a partir de "María Castillo" */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(w => /^\p{L}/u.test(w)); // ignora "(demo)", números, etc.
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
