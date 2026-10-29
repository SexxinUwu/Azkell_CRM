// Datos y reglas de "Pago de requerimientos" (OC de entradas_inv). Lo usan la pantalla y sus hojas.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface ItemOrden {
  inventario_id: string;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  moneda: string;
  importe: number;
}

// Forma que devuelve GET /api/tesoreria/pago-requerimientos (routes/tesoreria.js).
export interface OrdenPago {
  id: string | number;
  folio?: string | number;
  fecha?: string | null;
  fecha_vencimiento?: string | null;
  solicitante?: string;
  centro_costo?: string;
  sub_motivo?: string;
  autoriza?: string;
  motivo?: string;
  motivo_entrada?: string;
  tipo_orden?: string;
  moneda?: string;
  importe?: number | string;
  total_pen?: number | string;
  tipo_cambio?: number | string;
  /** sin_igv | mas_igv (el PDF la usa cuando no hay total en soles) */
  tipo_igv?: string;
  placa?: string;
  ot_id?: string;
  creado_por?: string;
  creador_nombre?: string;
  aprobado_por?: string;
  aprobador_nombre?: string;
  fecha_aprobacion?: string | null;
  dias_credito?: number;
  condicion_pago?: string;
  proveedor_nombre?: string;
  proveedor_ruc?: string;
  cuenta_bancaria_proveedor?: string;
  cuenta_destino_moneda?: string;
  cuenta_bancaria_empresa?: string;
  cuenta_origen_moneda?: string;
  estado?: string;
  numero_operacion?: string;
  fecha_pago?: string | null;
  pagado_por?: string;
  url_cotizacion_presigned?: string | null;
  url_factura_presigned?: string | null;
  url_voucher_presigned?: string | null;
  items?: ItemOrden[];
}

export type FiltroEstado = 'aprobado' | 'procesados' | 'todos';

export const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
export const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function esUSD(moneda?: string | null): boolean {
  const m = String(moneda ?? '').toUpperCase();
  return m.includes('DOL') || m.includes('DÓL') || m === 'USD' || m === 'US$';
}

export const esPendiente = (o: OrdenPago) => ['aprobado', 'autorizado'].includes(String(o.estado ?? '').toLowerCase());
export const esPagada = (o: OrdenPago) => ['procesado', 'pagado'].includes(String(o.estado ?? '').toLowerCase());
export const esCredito = (o: OrdenPago) => /cr[eé]dito/i.test(String(o.condicion_pago ?? ''));

/** Importe de la OC en su moneda (suma de renglones; si no hay, el total en soles). */
export const importeOC = (o: OrdenPago) => num(o.importe) || num(o.total_pen);

/** Código visible de la OC (el folio es el id de entradas_inv, sin el prefijo ENT-). */
export const codigoOC = (o: OrdenPago) => String(o.folio ?? o.id).replace(/^ENT-/i, '');

/** Monto que sale de caja, igual que el clásico: el total en soles; si la cuenta es en US$, se divide entre el T.C. */
export function montoAPagar(o: OrdenPago, cuentaUsd: boolean): number {
  const total = num(o.total_pen);
  if (!cuentaUsd) return redondear2(total);
  const tc = num(o.tipo_cambio);
  return tc > 0 ? redondear2(total / tc) : 0;
}

/** Semáforo de vencimiento. Al contado no tiene vencimiento: devuelve null. */
export function vencimiento(o: OrdenPago): { tono: 'green' | 'amber' | 'red' | 'gray'; texto: string } | null {
  if (!esCredito(o)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(o.fecha_vencimiento ?? ''));
  if (!m) return { tono: 'gray', texto: 'Sin fecha de vencimiento' };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(+m[1], +m[2] - 1, +m[3]);
  const dias = Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);
  if (dias < 0) return { tono: 'red', texto: `Vencida hace ${-dias} ${-dias === 1 ? 'día' : 'días'}` };
  if (dias === 0) return { tono: 'amber', texto: 'Vence hoy' };
  return { tono: dias <= 3 ? 'amber' : 'green', texto: `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}` };
}

/** Renglón con código y descripción separados (la descripción a veces trae "CODIGO — DESCRIPCIÓN"). */
export function renglonLimpio(it: ItemOrden) {
  let codigo = (it.inventario_id || '').trim();
  let descripcion = (it.descripcion || '').trim();
  const pref = descripcion.match(/^([A-Z0-9_\-.]+)\s*[—\-–]\s*(.+)$/i);
  if (pref) {
    if (!codigo || codigo.startsWith('INV-')) codigo = pref[1].trim();
    descripcion = pref[2].trim();
  } else if (codigo && (descripcion.startsWith(`${codigo} — `) || descripcion.startsWith(`${codigo} - `))) {
    descripcion = descripcion.slice(codigo.length + 3).trim();
  }
  return { codigo: codigo || '—', descripcion: descripcion || 'Artículo' };
}

// Importe en letras, como en las constancias: "MIL DOSCIENTOS CON 50/100" (luego se agrega la moneda).
const UNID = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECE = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const DIEZ_Y = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const CIENTOS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorDeMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  const partes: string[] = [];
  if (c) partes.push(CIENTOS[c]);
  if (d === 1) partes.push(DIEZ_Y[u]);
  else if (d) partes.push(u ? `${DECE[d]} Y ${UNID[u]}` : DECE[d]);
  else if (u) partes.push(UNID[u]);
  return partes.join(' ');
}

function enteroEnLetras(n: number): string {
  if (n === 0) return '';
  if (n >= 1_000_000) {
    const millones = Math.floor(n / 1_000_000), resto = n % 1_000_000;
    const cab = millones === 1 ? 'UN MILLÓN' : `${enteroEnLetras(millones)} MILLONES`;
    return resto ? `${cab} ${enteroEnLetras(resto)}` : cab;
  }
  if (n >= 1000) {
    const miles = Math.floor(n / 1000), resto = n % 1000;
    const cab = miles === 1 ? 'MIL' : `${menorDeMil(miles)} MIL`;
    return resto ? `${cab} ${menorDeMil(resto)}` : cab;
  }
  return menorDeMil(n);
}

export function numeroALetras(valor: number): string {
  const total = Math.round(Math.abs(valor) * 100);
  const entero = Math.floor(total / 100);
  const sufijo = `CON ${String(total % 100).padStart(2, '0')}/100`;
  return `${entero === 0 ? 'CERO' : enteroEnLetras(entero)} ${sufijo}`;
}

/** Lista de OC desde el servidor (ya filtrada por estado en el backend). */
export function usePagoRequerimientos(estado: FiltroEstado) {
  return useQuery<OrdenPago[]>({
    queryKey: ['tesoreria', 'pago-req', estado],
    queryFn: () =>
      api<{ data?: OrdenPago[] } | OrdenPago[]>('/tesoreria/pago-requerimientos', { query: { estado } }).then(r =>
        Array.isArray(r) ? r : (r.data ?? []),
      ),
    staleTime: 30_000,
  });
}
