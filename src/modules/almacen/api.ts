// Almacén: Inventario, Entradas, Salidas, Kardex, Recepción de compras, Proveedores
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// ─── Inventario ─────────────────────────────────────────────────────────────

export interface ArticuloInv {
  id: string;              // INV-001 / SERV-001
  articulo: string;
  codigo_articulo: string | null;
  descripcion: string;
  familia: string | null;
  almacen: string | null;
  unidad: string | null;
  moneda: 'PEN' | 'USD';
  costo_referencial: number;
  costo_soles: number;
  tipo_cambio: number | null;
  tipo: string | null;     // 'Servicio' | 'Repuesto' | etc.
  sub_tipo: string | null;
  sistema: string | null;
  sub_sistema: string | null;
  marca: string | null;
  marca_unidad: string | null; // JSON array de marcas compatibles
  codigo_item: string | null;
  ubicacion: string | null;
  anaquel: string | null;
  stock_min: number;
  stock_max: number;
  stock_regularizado: number;
  stock_actual: number;    // calculado por el servidor
  fecha_regularizacion: string | null;
  estado_art: 'Activo' | 'Inactivo';
  codigo_barras: string | null;
  imagen_url: string | null;
  proveedor_id: number | null;
  ultimo_proveedor: string | null;
  observaciones: string | null;
  activo: number;
}

export type ArticuloNuevo = Omit<ArticuloInv, 'id' | 'stock_actual' | 'ultimo_proveedor' | 'activo'> & {
  cantidad_inicial?: number;
};

export function stockTono(a: ArticuloInv): 'ok' | 'warning' | 'critical' {
  if (a.stock_actual <= 0) return 'critical';
  if (a.stock_min > 0 && a.stock_actual <= a.stock_min) return 'warning';
  return 'ok';
}

export function stockLabel(a: ArticuloInv): string {
  const t = stockTono(a);
  if (t === 'critical') return 'Sin stock';
  if (t === 'warning') return 'Stock bajo';
  return 'OK';
}

export function coincideInv(a: ArticuloInv, q: string): boolean {
  if (!q) return true;
  const u = q.toUpperCase();
  return (
    a.id.toUpperCase().includes(u) ||
    (a.articulo ?? '').toUpperCase().includes(u) ||
    (a.codigo_articulo ?? '').toUpperCase().includes(u) ||
    (a.familia ?? '').toUpperCase().includes(u) ||
    (a.sistema ?? '').toUpperCase().includes(u) ||
    (a.codigo_barras ?? '').toUpperCase().includes(u)
  );
}

export function useInventario() {
  return useQuery<ArticuloInv[]>({
    queryKey: ['almacen', 'inventario'],
    queryFn: () => api('/almacen/inventario'),
    staleTime: 60_000,
  });
}

export async function guardarArticulo(data: Partial<ArticuloNuevo>, id?: string) {
  if (id) return api(`/almacen/inventario/${id}`, { method: 'PUT', body: data });
  return api('/almacen/inventario', { method: 'POST', body: data });
}

export async function eliminarArticulo(id: string) {
  return api(`/almacen/inventario/${id}`, { method: 'DELETE' });
}

export async function regularizarStock(id: string, stock_fisico: number, motivo: string) {
  return api(`/almacen/inventario/${id}/regularizar`, { method: 'POST', body: { stock_fisico, motivo } });
}

// ─── Entradas ───────────────────────────────────────────────────────────────

export interface ItemEntrada {
  id?: number;
  inventario_id: string | null;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  moneda: string;
  importe: number;
  item_unidad?: string;
  item_codigo_articulo?: string;
}

export interface EntradaInv {
  id: number;
  tipo_entrada: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc: string | null;
  nro_documento: string | null;
  almacen: string | null;
  fecha: string | null;
  total_pen: number;
  moneda: string;
  estado: string | null;          // 'Pendiente' | 'Aprobado' | 'Anulado'
  motivo_entrada: string | null;
  observaciones: string | null;
  solicitante: string | null;
  creado_por: string | null;
  created_at: string;
  items: ItemEntrada[];
}

export const TIPOS_ENTRADA = ['Compra', 'Transferencia', 'Devolución', 'Donación', 'Ajuste', 'Otro'];
export const ESTADOS_ENTRADA = ['Pendiente', 'Aprobado', 'Anulado'];

export function useEntradas() {
  return useQuery<EntradaInv[]>({
    queryKey: ['almacen', 'entradas'],
    queryFn: () => api('/almacen/entradas'),
    staleTime: 30_000,
  });
}

export async function guardarEntrada(data: Partial<EntradaInv> & { items: ItemEntrada[] }, id?: number) {
  if (id) return api(`/almacen/entradas/${id}`, { method: 'PUT', body: data });
  return api('/almacen/entradas', { method: 'POST', body: data });
}

export async function eliminarEntrada(id: number) {
  return api(`/almacen/entradas/${id}`, { method: 'DELETE' });
}

export async function anularEntrada(id: number) {
  return api(`/almacen/entradas/${id}/anular`, { method: 'PUT' });
}

// ─── Salidas ────────────────────────────────────────────────────────────────

export interface ItemSalida {
  id?: number;
  inventario_id: string | null;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  moneda: string;
  importe: number;
}

export interface SalidaInv {
  id: number;
  fecha: string | null;
  tipo_destino: string | null;
  placa: string | null;
  responsable: string | null;
  nro_documento: string | null;
  almacen: string | null;
  moneda: string;
  tipo_cambio: number | null;
  observaciones: string | null;
  ticket_ot: string | null;
  creado_por: string | null;
  total_pen: number;
  created_at: string;
  items: ItemSalida[];
}

export const TIPOS_DESTINO = ['Vehiculo', 'Taller', 'Obra', 'Oficina', 'Otro'];

export function useSalidas() {
  return useQuery<SalidaInv[]>({
    queryKey: ['almacen', 'salidas'],
    queryFn: () => api('/almacen/salidas'),
    staleTime: 30_000,
  });
}

export async function guardarSalida(data: Partial<SalidaInv> & { items: ItemSalida[] }, id?: number) {
  if (id) return api(`/almacen/salidas/${id}`, { method: 'PUT', body: data });
  return api('/almacen/salidas', { method: 'POST', body: data });
}

export async function eliminarSalida(id: number) {
  return api(`/almacen/salidas/${id}`, { method: 'DELETE' });
}

// ─── Kardex ─────────────────────────────────────────────────────────────────

export interface KardexItem {
  fecha: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'REGULARIZACION';
  documento: string | null;
  proveedor_destino: string | null;
  cantidad: number;
  saldo: number;
  costo_unitario: number | null;
  /** Costo promedio ponderado del artículo después del movimiento (S/) */
  costo_promedio: number | null;
  /** Saldo × costo promedio (S/) */
  valor_saldo: number | null;
  observaciones: string | null;
}

/** El servidor responde { movimientos, stock_base }; la pantalla trabaja con una lista plana. */
function aKardexItem(m: Record<string, unknown>): KardexItem {
  const tipoRaw = String(m.tipo ?? '');
  const tipo: KardexItem['tipo'] = tipoRaw === 'Salida' ? 'SALIDA' : (tipoRaw === 'Entrada' || tipoRaw === 'Recepción OC') ? 'ENTRADA' : 'REGULARIZACION';
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return {
    fecha: String(m.fecha ?? ''),
    tipo,
    documento: m.doc_id == null ? null : String(m.doc_id),
    proveedor_destino: m.contraparte == null ? null : String(m.contraparte),
    cantidad: Number(m.cantidad) || 0,
    saldo: Number(m.saldo) || 0,
    costo_unitario: num(m.costo_unitario_soles ?? m.costo_unitario),
    costo_promedio: num(m.costo_promedio),
    valor_saldo: num(m.valor_saldo),
    observaciones: null,
  };
}

export function useKardex(inventario_id: string | null) {
  return useQuery<KardexItem[]>({
    queryKey: ['almacen', 'kardex', inventario_id],
    queryFn: async () => {
      const r = await api<{ movimientos?: Record<string, unknown>[] }>(`/almacen/kardex/${inventario_id}`);
      return (r.movimientos ?? []).map(aKardexItem);
    },
    enabled: !!inventario_id,
    staleTime: 30_000,
  });
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

export interface ProveedorInv {
  id: number;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  banco: string | null;
  cuenta: string | null;
  cci: string | null;
  moneda_pago: string | null;
  observaciones: string | null;
}

export function useProveedores() {
  return useQuery<ProveedorInv[]>({
    queryKey: ['almacen', 'proveedores'],
    queryFn: () => api('/almacen/proveedores'),
    staleTime: 120_000,
  });
}

export async function guardarProveedor(data: Partial<ProveedorInv>, id?: number) {
  if (id) return api(`/almacen/proveedores/${id}`, { method: 'PUT', body: data });
  return api('/almacen/proveedores', { method: 'POST', body: data });
}

export async function eliminarProveedor(id: number) {
  return api(`/almacen/proveedores/${id}`, { method: 'DELETE' });
}

// ─── Recepción de compras ────────────────────────────────────────────────────

export interface ItemRecepcion {
  inventario_id: string;
  descripcion: string;
  unidad: string;
  pedido: number;
  recepcionado: number;
  pendiente: number;
  costo_unitario: number;
  moneda: string;
}

export interface HistorialRecepcion {
  recepcion_id: number;
  detalle_id: number;
  oc_id: string | number;
  fecha_recepcion: string;
  usuario: string | null;
  almacen: string | null;
  observacion: string | null;
  tipo_recepcion: string | null;
  inventario_id: string | null;
  descripcion: string | null;
  cantidad_recibida: number;
  sustento_url_presigned?: string | null;
}

export interface RecepcionOC {
  id: string | number;
  fecha: string | null;
  proveedor: string;
  solicitante: string;
  autoriza: string;
  almacen: string;
  moneda: string;
  importe: number;
  condicion_pago?: string | null;
  dias_credito?: number | null;
  estado_oc: string;
  total_pedido: number;
  total_recibido: number;
  estado_recepcion: 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';
  progreso_label: string;
  items: ItemRecepcion[];
  historial_recepciones: HistorialRecepcion[];
}

export function useRecepcionesOC() {
  return useQuery<RecepcionOC[]>({
    queryKey: ['almacen', 'recepciones-oc'],
    queryFn: () => api<RecepcionOC[]>('/almacen/recepciones-oc').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 30_000,
  });
}

export interface RecepcionItemEnvio {
  inventario_id: string;
  descripcion: string;
  cantidad_recibida: number;
  costo_unitario: number;
  moneda: string;
  almacen: string;
}

/** Registra una entrega (parcial o total) de una OC. Multipart: lleva la foto de sustento. */
export async function registrarRecepcion(d: {
  oc_id: string | number; fecha_recepcion: string; usuario: string; observacion: string;
  almacen: string; tipo_recepcion: 'TOTAL' | 'PARCIAL'; items: RecepcionItemEnvio[]; sustento?: File | null;
  /** Solo O/C en dólares: S/ por USD del día de recepción */
  tipo_cambio?: number;
}) {
  const f = new FormData();
  f.append('oc_id', String(d.oc_id));
  f.append('fecha_recepcion', d.fecha_recepcion);
  f.append('usuario', d.usuario);
  f.append('observacion', d.observacion);
  f.append('almacen', d.almacen);
  f.append('tipo_recepcion', d.tipo_recepcion);
  f.append('items_json', JSON.stringify(d.items));
  if (d.sustento) f.append('sustento', d.sustento);
  if (d.tipo_cambio) f.append('tipo_cambio', String(d.tipo_cambio));
  return api<{ ok?: boolean }>('/almacen/recepciones-oc/registrar', { method: 'POST', body: f });
}

/** Revierte una entrega: baja el stock ingresado y devuelve el saldo pendiente a la OC */
export async function eliminarRecepcion(recepcionId: number, usuario: string) {
  return api<{ ok?: boolean; error?: string }>(`/almacen/recepciones-oc/${recepcionId}`, { method: 'DELETE', body: { usuario } });
}

export interface AlmacenLista { id: number; nombre: string }
export function useAlmacenesLista() {
  return useQuery<AlmacenLista[]>({
    queryKey: ['almacen', 'almacenes-lista'],
    queryFn: () => api<AlmacenLista[]>('/almacen/almacenes-lista').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 5 * 60_000,
  });
}

// ─── Listas de opciones (catálogos) ──────────────────────────────────────────

export function familiasUnicas(items: ArticuloInv[]): string[] {
  return [...new Set(items.map(i => i.familia).filter(Boolean) as string[])].sort();
}

export function almacenesUnicos(items: ArticuloInv[]): string[] {
  return [...new Set(items.map(i => i.almacen).filter(Boolean) as string[])].sort();
}

export function tiposUnicos(items: ArticuloInv[]): string[] {
  return [...new Set(items.map(i => i.tipo).filter(Boolean) as string[])].sort();
}
