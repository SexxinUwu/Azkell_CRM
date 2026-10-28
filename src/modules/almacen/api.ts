// Almacén: Inventario, Entradas, Salidas, Kardex, Recepción de compras, Proveedores
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { CuentaBancaria, ModoIgv } from './entradaReglas';

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

// ─── Entradas (órdenes de compra) ───────────────────────────────────────────
// Mismas reglas que el clásico (modulos/almacen/entradas). Las reglas puras están en entradaReglas.ts.

export interface ItemEntrada {
  id?: number;
  inventario_id: string | null;
  descripcion: string;
  cantidad: number;
  /** Precio unitario. Con IGV cuando la orden lleva IGV (así lo guarda el clásico). */
  costo_unitario: number;
  moneda: string;
  /** cantidad × costo_unitario */
  importe: number;
  item_unidad?: string;
  item_codigo_articulo?: string;
  cantidad_recibida?: number;
}

/** Entrada tal como la devuelve el servidor (columnas de entradas_inv + datos que arma el listado). Código: ENT-2026-00120 */
export interface EntradaInv {
  id: string;
  fecha: string | null;
  tipo_orden: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc?: string | null;
  documento_referencia: string | null;
  moneda: string;
  tipo_cambio: number | null;
  /** Total en soles (el listado lo convierte con el tipo de cambio) */
  total_pen: number;
  /** Total en la moneda de la orden */
  total_oc?: number;
  condicion_pago: string | null;
  dias_credito: number | null;
  dias_pagar?: number | null;
  estado: string | null;
  motivo_entrada: string | null;
  motivo_anulacion: string | null;
  solicitante: string | null;
  placa: string | null;
  ot_id?: string | null;
  observaciones: string | null;
  creado_por: string | null;
  creador_nombre?: string | null;
  created_at: string;
  items: ItemEntrada[];
  tipo_igv: string | null;
  autoriza: string | null;
  aprobado_por: string | null;
  aprobador_nombre?: string | null;
  fecha_aprobacion: string | null;
  centro_costo?: string | null;
  sub_motivo?: string | null;
  prioridad?: string | null;
  serie?: string | null;
  numero_correlativo?: string | null;
  cuenta_bancaria_proveedor?: string | null;
  cuenta_bancaria_empresa?: string | null;
  estado_factura?: string | null;
  numero_operacion?: string | null;
  url_cotizacion?: string | null;
  url_cotizacion_presigned?: string | null;
  url_factura?: string | null;
  url_factura_presigned?: string | null;
  url_voucher?: string | null;
  url_voucher_presigned?: string | null;
  total_recibido?: number;
  cant_recepciones?: number;
}

/** Ítem tal como se envía al servidor */
export interface ItemEnvio {
  inventario_id: string | null;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  moneda: string;
  importe: number;
}

/** Cuerpo de alta y edición de una orden (POST / PUT /almacen/entradas) */
export interface PayloadEntrada {
  fecha: string;
  serie?: string;
  numero_correlativo?: string;
  tipo_orden: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  cuenta_bancaria_proveedor: string | null;
  cuenta_bancaria_empresa: string | null;
  solicitante: string | null;
  autoriza: string;
  centro_costo: string;
  sub_motivo: string;
  motivo_entrada: string;
  placa: string | null;
  ot_id: string | null;
  documento_referencia: string | null;
  estado_factura?: string;
  moneda: string;
  tipo_cambio: number | null;
  tipo_igv: ModoIgv;
  condicion_pago: string;
  dias_credito: number;
  dias_pagar: number;
  prioridad: string;
  observaciones: string | null;
  creado_por: string | null;
  /** undefined: no se cambia; null: se quita */
  url_cotizacion?: string | null;
  items: ItemEnvio[];
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

export function useEntradas() {
  return useQuery<EntradaInv[]>({
    queryKey: ['almacen', 'entradas'],
    queryFn: () => api('/almacen/entradas'),
    staleTime: 30_000,
  });
}

export async function guardarEntrada(data: PayloadEntrada, id?: string | number) {
  if (id) return api(`/almacen/entradas/${encodeURIComponent(String(id))}`, { method: 'PUT', body: data });
  return api('/almacen/entradas', { method: 'POST', body: data });
}

export async function eliminarEntrada(id: string | number) {
  return api(`/almacen/entradas/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
}

export async function anularEntrada(id: string | number, motivo: string) {
  return api(`/almacen/entradas/${encodeURIComponent(String(id))}/anular`, { method: 'PUT', body: { motivo } });
}

/** Próximo correlativo de la orden (ENT-2026-00120). Se pide cada vez que se abre el formulario. */
export function useProximoCodigoEntrada(enabled: boolean) {
  return useQuery<{ codigo?: string }>({
    queryKey: ['almacen', 'entradas', 'proximo-codigo'],
    queryFn: () => api('/almacen/entradas/proximo-codigo', { query: { anio: new Date().getFullYear() } }),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

// ─── Adjuntos (cotización, factura, voucher) ────────────────────────────────

export type TipoAdjunto = 'cotizacion' | 'factura' | 'voucher';

/** Sube la cotización al abrir el archivo en el formulario: devuelve la URL final en S3 */
export async function subirCotizacion(file: File): Promise<string> {
  const q = { filename: file.name, contentType: file.type || 'application/pdf', tipo: 'cotizacion' };
  const url = await api<{ uploadUrl?: string; fileUrl?: string; error?: string }>('/almacen/entradas/upload-url', { query: q });
  if (!url.uploadUrl) throw new Error(url.error || 'No se obtuvo URL de subida');
  const put = await fetch(url.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/pdf' } });
  if (!put.ok) throw new Error('Error transfiriendo el archivo a AWS S3');
  return url.fileUrl ?? '';
}

export async function eliminarAdjunto(id: string, tipo: TipoAdjunto) {
  return api(`/almacen/entradas/${encodeURIComponent(id)}/archivo/${tipo}`, { method: 'DELETE' });
}

export interface AdjuntoNuevo { file: File; tipo: TipoAdjunto; documento_referencia?: string; numero_operacion?: string }

/**
 * Sube los archivos nuevos directo a S3 (URLs prefirmadas) y luego confirma en la base de datos.
 * Igual que el clásico: un voucher pasa la orden a "Procesado"; la factura guarda su N° de comprobante.
 */
export async function guardarAdjuntos(id: string, lista: AdjuntoNuevo[], extra: { documento_referencia: string; numero_operacion: string }) {
  const exitosos: Array<{ tipo: TipoAdjunto; finalUrl: string; s3Key: string; documento_referencia?: string; numero_operacion?: string }> = [];
  if (lista.length) {
    const pre = await api<{ urls?: Array<{ uploadUrl: string; finalUrl: string; s3Key: string; tipo: TipoAdjunto }> }>(
      `/almacen/entradas/${encodeURIComponent(id)}/archivos/presigned`,
      { method: 'POST', body: { archivos: lista.map(a => ({ fileName: a.file.name, contentType: a.file.type || 'application/pdf', tipo: a.tipo })) } },
    );
    const urls = pre.urls ?? [];
    if (!urls.length) throw new Error('No se generaron URLs de subida');
    await Promise.all(lista.map(async (a, i) => {
      const u = urls[i];
      if (!u?.uploadUrl) throw new Error(`No hay URL para ${a.tipo}`);
      const put = await fetch(u.uploadUrl, { method: 'PUT', body: a.file });
      if (!put.ok) throw new Error(`Error al transferir ${a.tipo} a AWS S3 (HTTP ${put.status})`);
      exitosos.push({ tipo: a.tipo, finalUrl: u.finalUrl, s3Key: u.s3Key, documento_referencia: a.documento_referencia, numero_operacion: a.numero_operacion });
    }));
  }
  return api(`/almacen/entradas/${encodeURIComponent(id)}/archivos/confirmar`, {
    method: 'POST',
    body: { exitosos, documento_referencia: extra.documento_referencia, numero_operacion: extra.numero_operacion },
  });
}

// ─── Catálogos para el formulario ───────────────────────────────────────────

export interface PlacaLista { placa: string; cliente: string | null }

/** Placas de la flota (las mismas que el clásico: el campo placa de la tabla placas) */
export function usePlacasLista() {
  return useQuery<PlacaLista[]>({
    queryKey: ['almacen', 'placas-lista'],
    queryFn: async () => {
      const r = await api<PlacaLista[] | { data?: PlacaLista[] }>('/placas-lista');
      const lista = Array.isArray(r) ? r : (r.data ?? []);
      return lista
        .map(p => ({ placa: String(p.placa ?? '').toUpperCase(), cliente: (p as { cliente?: string | null }).cliente ?? null }))
        .filter(p => p.placa)
        .sort((a, b) => a.placa.localeCompare(b.placa));
    },
    staleTime: 300_000,
  });
}

export interface OtLista { id_ot: string; placa: string | null }

/** Órdenes de trabajo del taller (para vincular una orden de servicio) */
export function useOrdenesTrabajoLista() {
  return useQuery<OtLista[]>({
    queryKey: ['almacen', 'ordenes-trabajo'],
    queryFn: async () => {
      const r = await api<Array<{ id_ot?: string | null; placa?: string | null }> | null>('/ordenes-trabajo');
      return (r ?? [])
        .map(o => ({ id_ot: String(o.id_ot ?? '').toUpperCase(), placa: o.placa ? String(o.placa).toUpperCase() : null }))
        .filter(o => o.id_ot);
    },
    staleTime: 120_000,
  });
}

export interface CuentaEmpresa extends CuentaBancaria { id?: number | string; banco: string | null }

/** Cuentas de la empresa; si el servidor no tiene ninguna, se usan los bancos de Tesorería activos (como el clásico) */
export function useEmpresaCuentas() {
  return useQuery<CuentaEmpresa[]>({
    queryKey: ['almacen', 'empresa-cuentas'],
    queryFn: async () => {
      const r = await api<CuentaEmpresa[] | { data?: CuentaEmpresa[] }>('/almacen/empresa-cuentas');
      const lista = Array.isArray(r) ? r : (r.data ?? []);
      if (lista.length) return lista;
      try {
        const bancos = await api<{ ok?: boolean; data?: Array<CuentaEmpresa & { estado?: string | null }> }>('/tesoreria/bancos');
        return (bancos.data ?? []).filter(b => b.estado === 'ACTIVO' || !b.estado);
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });
}

/** Cuentas bancarias de un proveedor cuando la lista de proveedores no las trae */
export function useCuentasProveedor(provId: string | null, enabled: boolean) {
  return useQuery<CuentaBancaria[]>({
    queryKey: ['almacen', 'proveedores', provId ?? '', 'cuentas'],
    queryFn: async () => (await api<CuentaBancaria[] | null>(`/almacen/proveedores/${encodeURIComponent(provId ?? '')}/cuentas`)) ?? [],
    enabled: enabled && !!provId,
    staleTime: 60_000,
  });
}

/** Configuración de almacén (tipo de cambio de respaldo) */
export function useConfiguracionAlmacen() {
  return useQuery<Record<string, string>>({
    queryKey: ['almacen', 'configuracion'],
    queryFn: () => api<Record<string, string>>('/almacen/configuracion'),
    staleTime: 5 * 60_000,
  });
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
  /** Solo lo muestra el clásico; el alta no lo guarda en el servidor */
  tipo_orden?: string | null;
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
  /** 'Despachado' | 'Anulado' | 'Pendiente'; vacío cuenta como pendiente (igual que el clásico) */
  estado?: string | null;
  motivo_anulacion?: string | null;
  total_pen: number;
  created_at: string;
  items: ItemSalida[];
}

export type EstadoSalida = 'Pendiente' | 'Despachado' | 'Anulado';

export function estadoSalida(s: Pick<SalidaInv, 'estado'>): EstadoSalida {
  if (s.estado === 'Despachado') return 'Despachado';
  if (s.estado === 'Anulado') return 'Anulado';
  return 'Pendiente';
}

/** Valores que guarda el servidor en tipo_destino (el clásico muestra "Vehículo / Unidad" y "Personal / Taller") */
export const TIPOS_DESTINO = ['Vehiculo', 'Personal'] as const;
export const ETIQUETA_DESTINO: Record<string, string> = { Vehiculo: 'Vehículo / Unidad', Personal: 'Personal / Taller' };

export const TIPO_ORDEN_SALIDA = 'Orden de Salida';
export const TIPO_ORDEN_AJUSTE = 'Ajuste de Inventario (Resta)';

/** Costo de salida: el costo en soles del artículo (igual que el servidor al crear la salida) */
export function costoSolesArticulo(a: Pick<ArticuloInv, 'costo_soles' | 'costo_referencial'>): number {
  return Number(a.costo_soles) || Number(a.costo_referencial) || 0;
}

export function useSalidas() {
  return useQuery<SalidaInv[]>({
    queryKey: ['almacen', 'salidas'],
    queryFn: () => api('/almacen/salidas'),
    staleTime: 30_000,
  });
}

/** Alta (POST) o edición (PUT con accion 'editar'; el servidor rechaza un PUT sin acción) */
export async function guardarSalida(data: Partial<SalidaInv> & { items: ItemSalida[] }, id?: number) {
  if (id) return api(`/almacen/salidas/${id}`, { method: 'PUT', body: { accion: 'editar', ...data } });
  return api('/almacen/salidas', { method: 'POST', body: data });
}

/** Despacha los ítems indicados (o todos si la lista va vacía). Lo no despachado pasa a una salida pendiente nueva. */
export async function despacharSalida(id: number, itemIds: number[], usuario: string) {
  return api<{ ok?: boolean; parcial?: boolean; nuevo_pendiente_id?: string | number }>(`/almacen/salidas/${id}`, {
    method: 'PUT', body: { accion: 'despachar', item_ids: itemIds, usuario },
  });
}

export async function anularSalida(id: number, motivo: string, usuario: string) {
  return api(`/almacen/salidas/${id}`, { method: 'PUT', body: { accion: 'anular', motivo, usuario } });
}

export async function eliminarSalida(id: number) {
  return api(`/almacen/salidas/${id}`, { method: 'DELETE' });
}

// ─── Catálogos de la solicitud de salida ────────────────────────────────────

/** Kit de mantenimiento: repuestos preconfigurados para una marca y modelo */
export interface KitItemSalida {
  id: number | string;
  marca_vehiculo: string;
  modelo_vehiculo: string;
  tipo_mp: string;
  nombre_kit: string | null;
  item_nombre: string;
  cantidad: number;
  unidad_medida: string | null;
  costo_unitario: number;
}

/** Kits de la marca y modelo (el servidor compara en mayúsculas) */
export function useKitsVehiculo(marca: string, modelo: string, enabled: boolean) {
  return useQuery<KitItemSalida[]>({
    queryKey: ['almacen', 'kits-salida', marca, modelo],
    queryFn: async () => (await api<{ data?: KitItemSalida[] }>('/mantenimiento-kits', { query: { marca, modelo } })).data ?? [],
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Placa con su marca y modelo (para el selector de placa y para los kits) */
export interface PlacaSalida {
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  modelo_uts?: string | null;
}

export function usePlacasSalida() {
  return useQuery<PlacaSalida[]>({
    queryKey: ['almacen', 'placas-salida'],
    queryFn: async () => (await api<{ data?: PlacaSalida[] }>('/placas-lista')).data ?? [],
    staleTime: 5 * 60_000,
  });
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
  /** Todas sus cuentas bancarias (la orden de compra elige una) */
  cuentas?: CuentaBancaria[];
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
  cuentas?: Array<{ banco: string | null; moneda: string | null; numero_cuenta: string | null; tipo_cuenta?: string | null; detraccion?: number | boolean | null }>;
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
    cuentas: (p.cuentas ?? []).map(c => ({
      banco: c.banco, moneda: c.moneda, numero_cuenta: c.numero_cuenta, tipo_cuenta: c.tipo_cuenta ?? null, detraccion: c.detraccion ?? null,
    })),
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
  /** Solo O/C en dólares: S/ por USD de la compra. `importe` viene siempre en soles (total_pen). */
  tipo_cambio?: number | null;
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

/**
 * Costo unitario en soles. Todo el inventario se valoriza en soles: un artículo en dólares se
 * convierte con el tipo de cambio que tiene guardado (costo_soles = costo × tipo de cambio de la entrada).
 */
export function costoUnitarioSoles(a: ArticuloInv): number {
  if (a.moneda === 'USD') {
    return Number(a.costo_soles) || (Number(a.costo_referencial) || 0) * (Number(a.tipo_cambio) || 0);
  }
  return Number(a.costo_referencial) || 0;
}

/** Valor del stock en soles. Solo cuentan los artículos con existencias positivas. */
export function valorEnStock(a: ArticuloInv): number {
  const stock = Number(a.stock_actual);
  return stock > 0 ? stock * costoUnitarioSoles(a) : 0;
}
