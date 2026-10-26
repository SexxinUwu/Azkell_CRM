import { formatDolares, formatSoles } from '../../core/lib/format';

// Helpers compartidos por Movimientos y Flujo de caja (Tesorería).
export const esDolar = (moneda?: string | null) => /DOL|USD|US\$/i.test(moneda ?? '');
export const num = (v: unknown) => Number(v) || 0;
// En los registros el '-' es el "vacío" del servidor
export const limpio = (v: unknown) => { const t = String(v ?? '').trim(); return t === '-' ? '' : t; };
// Importe en su propia moneda: US$ si el movimiento es en dólares, S/ en otro caso
export const importeMov = (v: unknown, moneda?: string | null) => (esDolar(moneda) ? formatDolares(num(v)) : formatSoles(num(v)));
// Fecha de hoy en Lima (AAAA-MM-DD), para los filtros
export const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export const primerDiaMesLima = () => `${hoyLima().slice(0, 8)}01`;
