// Gerencia: aprobación de órdenes de compra (entradas_inv) con sus datos completos.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface ItemOc {
  id: number;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  importe: number;
  unidad_medida: string;
  codigo_articulo: string;
  inventario_id: string;
}

/** Una fila de GET /api/almacen/entradas (SELECT e.* más los campos que calcula el servidor). */
export interface OrdenCompra {
  id: string;
  fecha: string | null;
  estado: string | null;
  moneda: 'PEN' | 'USD';
  tipo_cambio: number | null;
  /** Total en soles (ya convertido por el servidor) */
  total_pen: number;
  /** Total en la moneda de la orden (suma de ítems, o el total guardado si no hay ítems) */
  total_oc: number;
  tipo_igv: string | null;
  condicion_pago: string | null;
  dias_credito: number | null;
  prioridad: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc: string;
  proveedor_telefono: string;
  proveedor_email: string;
  solicitante: string | null;
  autoriza: string | null;
  creado_por: string | null;
  creador_nombre: string | null;
  centro_costo: string | null;
  motivo_entrada: string | null;
  observaciones: string | null;
  placa: string | null;
  ot_id: string | null;
  /** URLs de visualización del servidor (redirigen a S3 con URL firmada). Null si no hay archivo. */
  url_cotizacion_presigned: string | null;
  url_factura_presigned: string | null;
  url_voucher_presigned: string | null;
  items: ItemOc[];
}

export type CategoriaOc = 'pendiente' | 'observada' | 'aprobada' | 'rechazada' | 'otra';

/**
 * Clasificación de estados (guía de Aprobaciones, sección 4A).
 * Pendiente: Registrado / Registrada / Pendiente / vacío.
 * Observada: contiene "Observad".
 * Rechazada / Anulada: contiene "Rechazad" o "Anulad".
 * Aprobada: contiene "Aprobad" o "Autoriz". Además "Procesado" y "Pagado": en producción
 * casi todas las órdenes ya aprobadas pasan a "Procesado" al pagarse (pago-requerimientos
 * las busca como aprobadas), y el clásico también las cuenta como aprobadas.
 */
export function categoriaOc(estado: string | null | undefined): CategoriaOc {
  const s = (estado ?? '').trim().toLowerCase();
  if (s === '' || s.includes('registrad') || s.includes('pendiente')) return 'pendiente';
  if (s.includes('observad')) return 'observada';
  if (s.includes('aprobad') || s.includes('autoriz') || s.includes('procesad') || s.includes('pagad')) return 'aprobada';
  if (s.includes('rechazad') || s.includes('anulad')) return 'rechazada';
  return 'otra';
}

export type DecisionOc = 'Aprobado' | 'Rechazado' | 'Observado';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** MySQL devuelve DECIMAL como texto: se convierten aquí una sola vez. */
function normalizar(raw: Record<string, unknown>): OrdenCompra {
  const r = raw as unknown as OrdenCompra;
  return {
    ...r,
    id: String(r.id),
    tipo_cambio: r.tipo_cambio == null ? null : num(r.tipo_cambio),
    total_pen: num(r.total_pen),
    total_oc: num(r.total_oc),
    dias_credito: r.dias_credito == null ? null : num(r.dias_credito),
    proveedor_ruc: r.proveedor_ruc ?? '',
    proveedor_telefono: r.proveedor_telefono ?? '',
    proveedor_email: r.proveedor_email ?? '',
    items: (r.items ?? []).map(it => ({
      ...it,
      cantidad: num(it.cantidad),
      costo_unitario: num(it.costo_unitario),
      importe: num(it.importe),
    })),
  };
}

async function fetchOrdenes(): Promise<OrdenCompra[]> {
  const r = await api<unknown>('/almacen/entradas');
  const lista = Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? []);
  return (lista as Record<string, unknown>[]).map(normalizar);
}

/** Clave de caché compartida con el contador del menú (useNavBadges). */
export const CLAVE_OC = ['gerencia', 'aprobaciones-oc'] as const;

export function useOrdenesCompra() {
  return useQuery({ queryKey: CLAVE_OC, queryFn: fetchOrdenes, staleTime: 30_000 });
}

/** Aprobar, rechazar u observar. El servidor copia el comentario en observaciones y avisa a Tesorería si se aprueba. */
export function decidirOrden(id: string, estado: DecisionOc, comentario: string) {
  return api<{ ok: boolean; estado: string }>(`/almacen/entradas/${encodeURIComponent(id)}/estado`, {
    method: 'PUT',
    body: { estado, comentario, usuario: localStorage.getItem('fleet_user') ?? 'Gerencia' },
  });
}
