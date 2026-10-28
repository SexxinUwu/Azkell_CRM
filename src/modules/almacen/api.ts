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
  estado_art: 'Activo' | 'Inactivo' | 'Descontinuado';
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

/** Entrada tal como la devuelve el servidor (columnas de entradas_inv). El código es texto: ENT-2026-00120 */
export interface EntradaInv {
  id: string;
  fecha: string | null;
  tipo_orden: string | null;        // 'Orden de compra' | 'Entrada directa' | 'Ajuste' | …
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  documento_referencia: string | null;
  moneda: string;
  tipo_cambio: number | null;
  total_pen: number;
  condicion_pago: string | null;    // 'Al contado' | 'A crédito'
  dias_credito: number | null;
  estado: string | null;            // 'Registrado' (inicial) → 'Aprobado' | 'Anulado' | 'Rechazado'
  motivo_entrada: string | null;
  motivo_anulacion: string | null;
  solicitante: string | null;
  placa: string | null;
  observaciones: string | null;
  creado_por: string | null;
  created_at: string;
  items: ItemEntrada[];
  tipo_igv: string | null;          // 'sin_igv' | 'mas_igv'
  autoriza: string | null;          // quien aprobó (V°B° de gerencia)
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  total_recibido?: number;
  cant_recepciones?: number;
}

/** Aprueba (V°B°) una orden de compra. El servidor también avisa a Tesorería por WhatsApp (comportamiento de producción). */
export function aprobarEntrada(id: string | number, comentario: string | null, usuario: string) {
  return api(`/almacen/entradas/${encodeURIComponent(String(id))}/estado`, {
    method: 'PUT',
    body: { estado: 'Aprobado', comentario: comentario?.trim() || undefined, usuario },
  });
}

/** Datos de la empresa emisora (de la base de esta empresa) para el membrete del PDF */
export interface EmpresaDocumentos { nombre: string | null; ruc: string | null; direccion: string | null; telefono: string | null }
export function useEmpresaDocumentos() {
  return useQuery<EmpresaDocumentos>({
    queryKey: ['almacen', 'empresa-documentos'],
    queryFn: () => api('/almacen/empresa-documentos'),
    staleTime: 600_000,
  });
}

export const TIPOS_ENTRADA = ['Compra', 'Transferencia', 'Devolución', 'Donación', 'Ajuste', 'Otro'];
export const CONDICIONES_PAGO = ['Al contado', 'A crédito'];

/** Tipo de la interfaz → tipo_orden del servidor (el clásico guarda "Orden de compra" para las compras) */
export const tipoOrdenDe = (tipo: string): string => (tipo === 'Compra' ? 'Orden de compra' : tipo);

/** tipo_orden del servidor → tipo de la interfaz */
export function tipoDeOrden(tipoOrden: string | null | undefined): string {
  const t = (tipoOrden ?? '').trim().toLowerCase();
  if (t.startsWith('orden de compra')) return 'Compra';
  const hallado = TIPOS_ENTRADA.find(x => x.toLowerCase() === t);
  return hallado ?? 'Otro';
}

/**
 * Grupo de un estado de entrada para la pantalla. 'Registrado' y 'Pendiente' son sinónimos:
 * ambos esperan aprobación. La etiqueta muestra 'Registrada' para el estado inicial del servidor.
 */
export type GrupoEntrada = 'pendientes' | 'aprobadas' | 'anuladas' | 'otras';
export function grupoEntrada(estado: string | null | undefined): GrupoEntrada {
  const e = (estado ?? 'Registrado').trim().toLowerCase();
  if (e === 'registrado' || e === 'registrada' || e === 'pendiente') return 'pendientes';
  if (e.startsWith('aprob') || e.startsWith('autoriz') || e === 'procesado' || e === 'procesada' || e === 'pagado' || e === 'pagada') return 'aprobadas';
  if (e.startsWith('anul')) return 'anuladas';
  return 'otras';
}
export function etiquetaEstadoEntrada(estado: string | null | undefined): string {
  const e = (estado ?? 'Registrado').trim();
  const l = e.toLowerCase();
  if (l === 'registrado' || l === 'registrada') return 'Registrada';
  if (l === 'pendiente') return 'Pendiente';
  if (l.startsWith('aprob')) return 'Aprobada';
  if (l.startsWith('anul')) return 'Anulada';
  if (l.startsWith('rechaz')) return 'Rechazada';
  return e;
}

export function useEntradas() {
  return useQuery<EntradaInv[]>({
    queryKey: ['almacen', 'entradas'],
    queryFn: () => api('/almacen/entradas'),
    staleTime: 30_000,
  });
}

export async function guardarEntrada(data: Partial<EntradaInv> & { items: ItemEntrada[] }, id?: string | number) {
  if (id) return api(`/almacen/entradas/${id}`, { method: 'PUT', body: data });
  return api('/almacen/entradas', { method: 'POST', body: data });
}

export async function eliminarEntrada(id: string | number) {
  return api(`/almacen/entradas/${id}`, { method: 'DELETE' });
}

export async function anularEntrada(id: string | number, motivo = 'Anulada desde Almacén') {
  return api(`/almacen/entradas/${id}/anular`, { method: 'PUT', body: { motivo } });
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

/** Kardex de un artículo: movimientos y stock de apertura (antes de la primera operación registrada) */
export function useKardex(inventario_id: string | null) {
  return useQuery<{ items: KardexItem[]; stockBase: number }>({
    queryKey: ['almacen', 'kardex', inventario_id],
    queryFn: async () => {
      const r = await api<{ movimientos?: Record<string, unknown>[]; stock_base?: number | string }>(`/almacen/kardex/${inventario_id}`);
      return { items: (r.movimientos ?? []).map(aKardexItem), stockBase: Number(r.stock_base) || 0 };
    },
    enabled: !!inventario_id,
    staleTime: 30_000,
  });
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

/**
 * Proveedor como lo usa la interfaz. El servidor guarda numero_documento (RUC), email y razon_social,
 * y las cuentas bancarias en su propia tabla: esos campos se mapean aquí (useProveedores / guardarProveedor).
 * El "contacto" no tiene columna en el servidor: al guardar se anota al final de las observaciones.
 */
export interface ProveedorInv {
  id: string;
  nombre: string;
  razon_social: string | null;
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
  estado: string | null;
}

interface ProveedorServidor {
  id: string;
  nombre: string;
  razon_social: string | null;
  numero_documento: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: string | null;
  observaciones: string | null;
  cuentas?: Array<{ banco: string | null; moneda: string | null; numero_cuenta: string | null }>;
}

const MARCA_CONTACTO = 'Contacto: ';

function proveedorDesdeServidor(p: ProveedorServidor): ProveedorInv {
  const obs = p.observaciones ?? '';
  const linea = obs.split('\n').find(l => l.startsWith(MARCA_CONTACTO));
  const cuenta = p.cuentas?.[0];
  return {
    id: String(p.id),
    nombre: p.nombre,
    razon_social: p.razon_social,
    ruc: p.numero_documento,
    contacto: linea ? linea.slice(MARCA_CONTACTO.length) : null,
    telefono: p.telefono,
    correo: p.email,
    direccion: p.direccion,
    banco: cuenta?.banco ?? null,
    cuenta: cuenta?.numero_cuenta ?? null,
    cci: null,
    moneda_pago: cuenta?.moneda ?? null,
    observaciones: obs.split('\n').filter(l => !l.startsWith(MARCA_CONTACTO)).join('\n') || null,
    estado: p.estado,
  };
}

function proveedorAServidor(d: Partial<ProveedorInv>): Record<string, unknown> {
  const obs = [d.observaciones?.trim(), d.contacto?.trim() ? `${MARCA_CONTACTO}${d.contacto.trim()}` : ''].filter(Boolean).join('\n');
  return {
    nombre: d.nombre,
    razon_social: d.razon_social ?? null,
    tipo_documento: 'RUC',
    numero_documento: d.ruc ?? null,
    telefono: d.telefono ?? null,
    email: d.correo ?? null,
    direccion: d.direccion ?? null,
    estado: d.estado ?? 'Activo',
    observaciones: obs || null,
  };
}

export function useProveedores() {
  return useQuery<ProveedorInv[]>({
    queryKey: ['almacen', 'proveedores'],
    queryFn: async () => ((await api<ProveedorServidor[]>('/almacen/proveedores')) ?? []).map(proveedorDesdeServidor),
    staleTime: 120_000,
  });
}

export async function guardarProveedor(data: Partial<ProveedorInv>, id?: string | number) {
  // Las cuentas bancarias solo se envían al crear: al editar, el servidor reemplazaría todas las cuentas guardadas
  const cuerpo = proveedorAServidor(data);
  if (id) return api(`/almacen/proveedores/${id}`, { method: 'PUT', body: cuerpo });
  const cuentas = data.banco || data.cuenta ? [{ banco: data.banco ?? null, numero_cuenta: data.cuenta ?? null, moneda: data.moneda_pago ?? 'PEN' }] : undefined;
  return api('/almacen/proveedores', { method: 'POST', body: { ...cuerpo, cuentas } });
}

export async function eliminarProveedor(id: string | number) {
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

/** Tipo de cambio oficial de SUNAT del día (venta). Lo sirve el servidor con caché diaria. */
export interface TipoCambioSunat { ok: boolean; venta: number; compra: number | null; fecha: string; origen: string }

export function useTipoCambioSunat(enabled: boolean) {
  return useQuery<TipoCambioSunat>({
    queryKey: ['almacen', 'tipo-cambio-sunat'],
    queryFn: () => api<TipoCambioSunat>('/tipo-cambio/sunat'),
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
  });
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

/** Valor del filtro de la pantalla de almacenes para los artículos sin almacén válido */
export const SIN_ALMACEN = '__sin_almacen__';

/** Clave para comparar nombres de almacén: sin mayúsculas ni espacios sobrantes */
export const claveAlmacen = (nombre: string | null | undefined) => (nombre ?? '').trim().toLowerCase();

/**
 * Reparte los artículos entre los almacenes registrados. El campo almacén de un artículo es texto libre:
 * lo que no coincide con ningún almacén registrado (vacío, otra escritura, errores de tipeo) queda aparte.
 */
export function repartirPorAlmacen(items: ArticuloInv[], registrados: string[]) {
  const porClave = new Map(registrados.map(n => [claveAlmacen(n), n] as const));
  const porAlmacen = new Map<string, ArticuloInv[]>(registrados.map(n => [n, []] as const));
  const sinAlmacen: ArticuloInv[] = [];
  for (const i of items) {
    const nombre = porClave.get(claveAlmacen(i.almacen));
    if (nombre) porAlmacen.get(nombre)?.push(i);
    else sinAlmacen.push(i);
  }
  return { porAlmacen, sinAlmacen };
}
