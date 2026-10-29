// Reglas de las órdenes de compra (entradas), igual que el clásico (modulos/almacen/entradas/logica.js).
// Sin React: estados, cálculo de IGV de cada línea, filtros, KPIs, etiquetas y número a letras.

/** IGV vigente en Perú */
export const TASA_IGV = 0.18;

/** Modo de IGV de la orden. En los dos modos con IGV, el costo unitario guardado ya incluye el IGV. */
export type ModoIgv = 'sin_igv' | 'incluido' | 'mas_igv';
export const MODOS_IGV: Array<{ value: ModoIgv; label: string }> = [
  { value: 'sin_igv', label: 'Sin IGV' },
  { value: 'incluido', label: 'Inc. IGV' },
  { value: 'mas_igv', label: '+ IGV 18 %' },
];

export const TIPOS_ORDEN = ['Orden de compra', 'Orden de servicio'] as const;
export const CONDICIONES_PAGO = ['Al contado', 'A crédito'] as const;
export const PRIORIDADES = ['Normal', 'Alta', 'Urgente', 'Baja'] as const;

/** Directivos que autorizan (lista fija del clásico) */
export const DIRECTIVOS = ['Marco Rosas', 'Janina Rosas', 'Leo Rosas', 'Saul Rosas'] as const;

export const CENTROS_COSTO = [
  { value: 'CC-100', label: 'CC-100 - Administración General' },
  { value: 'CC-200', label: 'CC-200 - Comercial & Ventas' },
  { value: 'CC-300', label: 'CC-300 - Operaciones & Flota en Ruta' },
  { value: 'CC-400', label: 'CC-400 - Mantenimiento & Taller' },
  { value: 'CC-500', label: 'CC-500 - Almacén Central' },
] as const;

export const MOTIVOS_GASTO = [
  'Mantenimiento y Auxilio',
  'Gastos Administrativos / Oficina',
  'Combustibles y Fluidos',
  'Gastos de Viaje y Ruta',
  'Servicios de Terceros',
  'Activos Fijos / Equipamiento',
  'Compras Generales Almacén',
] as const;

/** Sub motivos según el motivo de gasto (mapa del clásico, _entSubMotivosMap) */
export const SUB_MOTIVOS: Record<string, string[]> = {
  'Mantenimiento y Auxilio': [
    'Repuestos menores / Accesorios',
    'Mantenimiento preventivo programado',
    'Mantenimiento correctivo / Auxilio mecánico',
    'Llantas, neumáticos y enllante',
    'Frenos, suspensión y aire',
    'Aceites, filtros y lubricación',
    'Sistema eléctrico / Baterías',
    'Carrocería, pintura y soldadura',
  ],
  'Gastos Administrativos / Oficina': [
    'Útiles de escritorio y papelería',
    'Artículos de limpieza y aseo',
    'Comunicaciones, internet y telefonía',
    'Software, licencias y hosting',
    'Alquiler de locales / Oficinas',
    'Seguridad y vigilancia',
  ],
  'Combustibles y Fluidos': [
    'Diésel DB5 S-50',
    'Gasolina 90 / 95 / 97',
    'Gas Licuado / GNV',
    'Úrea / AdBlue',
    'Refrigerantes y anticongelantes',
  ],
  'Gastos de Viaje y Ruta': [
    'Peajes y pesajes',
    'Viáticos y alimentación en ruta',
    'Hospedaje y pernocte conductores',
    'Cocheras y estacionamientos',
    'Movilidad local / Taxis',
  ],
  'Servicios de Terceros': [
    'Servicios de tornería y rectificación',
    'Servicio técnico especializado externo',
    'Asesoría legal / Contable / Auditoría',
    'Fletes y transportes tercerizados',
    'Certificaciones y revisiones técnicas',
  ],
  'Activos Fijos / Equipamiento': [
    'Herramientas y maquinaria de taller',
    'Equipos de cómputo y tecnología',
    'Mobiliario y enseres',
    'Equipos de comunicación / GPS / Radios',
  ],
  'Compras Generales Almacén': [
    'Stock general de almacén',
    'EPPs y seguridad industrial',
    'Materiales de embalaje y estiba',
    'Insumos varios',
  ],
};

/** Naturaleza del gasto que se sugiere según el motivo: también fija el centro de costo (clásico) */
const CC_POR_MOTIVO: Record<string, string> = {
  'Mantenimiento y Auxilio': 'CC-400',
  'Gastos Administrativos / Oficina': 'CC-100',
  'Combustibles y Fluidos': 'CC-300',
  'Gastos de Viaje y Ruta': 'CC-300',
  'Compras Generales Almacén': 'CC-500',
};
export function centroCostoSugerido(motivo: string): string | null {
  return CC_POR_MOTIVO[motivo] ?? null;
}

/** Naturaleza (motivo de gasto) a la que pertenece un sub motivo */
export function naturalezaDeSubMotivo(sub: string | null | undefined): string {
  if (!sub) return '';
  return Object.keys(SUB_MOTIVOS).find(m => SUB_MOTIVOS[m].includes(sub)) ?? '';
}

// ─── Estados ────────────────────────────────────────────────────────────────

export type CategoriaEstado = 'registradas' | 'aprobadas' | 'procesadas' | 'anuladas';
export type FiltroEstado = CategoriaEstado | 'todas';

/** Mismo criterio que _entDeterminarCategoriaEstado del clásico. Lo no reconocido cuenta como registrada. */
export function categoriaEstado(estado: string | null | undefined): CategoriaEstado {
  const st = String(estado || 'REGISTRADA').toUpperCase().trim();
  if (['APROBADO', 'APROBADA', 'AUTORIZADO', 'AUTORIZADA'].includes(st)) return 'aprobadas';
  if (['PROCESADO', 'PROCESADA', 'PAGADO', 'PAGADA', 'RECIBIDO', 'RECIBIDA', 'FINALIZADO', 'FINALIZADA'].includes(st)) return 'procesadas';
  if (['ANULADO', 'ANULADA', 'RECHAZADO', 'RECHAZADA'].includes(st)) return 'anuladas';
  return 'registradas';
}

export type TonoEstado = 'gray' | 'green' | 'sky' | 'amber' | 'red';

/** Etiqueta y color del estado, como en el clásico (REGISTRADA, APROBADA, PROCESADA, OBSERVADA, ANULADA…) */
export function etiquetaEstado(estado: string | null | undefined): { texto: string; tono: TonoEstado } {
  const st = String(estado || 'REGISTRADA').toUpperCase().trim();
  if (st.includes('ANULAD')) return { texto: 'ANULADA', tono: 'red' };
  if (st.includes('RECHAZAD')) return { texto: 'RECHAZADA', tono: 'red' };
  if (['APROBADO', 'APROBADA', 'AUTORIZADO', 'AUTORIZADA'].includes(st)) return { texto: 'APROBADA', tono: 'green' };
  if (['PROCESADO', 'PROCESADA', 'PAGADO', 'PAGADA'].includes(st)) return { texto: 'PROCESADA', tono: 'sky' };
  if (st.includes('OBSERVAD')) return { texto: 'OBSERVADA', tono: 'amber' };
  if (['REGISTRADA', 'REGISTRADO', 'PENDIENTE'].includes(st)) return { texto: 'REGISTRADA', tono: 'gray' };
  return { texto: st, tono: 'gray' };
}

/** Solo se puede editar mientras no esté aprobada, procesada, despachada o anulada */
export function estadoEditable(estado: string | null | undefined): boolean {
  const st = String(estado || 'Registrado').toLowerCase().trim();
  return ['registrado', 'registrada', 'pendiente', 'observado', 'observada'].includes(st) || !estado;
}

/** Se puede confirmar el pago solo si la orden está aprobada o autorizada (mismo criterio que el servidor) */
export function estadoPagable(estado: string | null | undefined): boolean {
  return ['aprobado', 'autorizado'].includes(String(estado ?? '').toLowerCase().trim());
}

/** Crédito tiene plazo; cualquier otra condición (o ninguna) es al contado, como el clásico */
export const esCredito = (condicion: string | null | undefined) => /cr[eé]dito/i.test(String(condicion ?? ''));

/** Moneda en dólares (de la orden o de una cuenta bancaria) */
export function esDolares(moneda: string | null | undefined): boolean {
  const m = String(moneda ?? '').toUpperCase();
  return m.includes('DOL') || m.includes('DÓL') || m === 'USD' || m === 'US$';
}

/** Monto que sale de caja: el total en soles; si la cuenta es en US$, se divide entre el T/C (igual que Tesorería) */
export function montoPago(totalPen: number, tipoCambio: number, enDolares: boolean): number {
  if (!enDolares) return Math.round(totalPen * 100) / 100;
  return tipoCambio > 0 ? Math.round((totalPen / tipoCambio) * 100) / 100 : 0;
}

export const esServicio = (tipoOrden: string | null | undefined) =>
  String(tipoOrden ?? '').trim().toLowerCase() === 'orden de servicio';

/** Código sin el prefijo ENT- (el clásico lo muestra así) */
export const codigoLimpio = (id: string | number) => String(id ?? '').replace(/^ENT-/i, '');

// ─── Fechas ─────────────────────────────────────────────────────────────────

/** Fecha AAAA-MM-DD de una orden (la del registro, o la de creación si falta) */
export function fechaOrden(o: { fecha?: string | null; created_at?: string | null }): string {
  const raw = o.fecha || o.created_at || '';
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

/** Hoy en Lima (AAAA-MM-DD), para los filtros */
export function hoyLima(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Hoy en la zona local (AAAA-MM-DD), para la fecha de registro del formulario */
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rango de fechas que el clásico pone al elegir un estado: registradas y aprobadas desde la orden más antigua
 * de esa categoría hasta hoy; procesadas solo hoy. Con «todas» no cambia nada (lo decide quien llama).
 */
export function rangoParaCategoria(cat: CategoriaEstado, ordenes: Array<{ estado: string | null; fecha?: string | null; created_at?: string | null }>, hoy: string) {
  if (cat === 'procesadas') return { desde: hoy, hasta: hoy };
  if (cat === 'registradas' || cat === 'aprobadas') {
    const fechas = ordenes.filter(o => categoriaEstado(o.estado) === cat).map(fechaOrden).filter(Boolean).sort();
    return { desde: fechas[0] ?? hoy, hasta: hoy };
  }
  return null;
}

// ─── Filtros y KPIs ─────────────────────────────────────────────────────────

export interface FiltrosOC { busqueda: string; desde: string; hasta: string; estado: FiltroEstado }

/** Campos de la cabecera de una orden donde se busca (texto en minúsculas ya escrito por quien busca) */
export interface OrdenBuscable {
  id: string; estado: string | null; fecha?: string | null; created_at?: string | null;
  proveedor_nombre?: string | null; proveedor_ruc?: string | null; documento_referencia?: string | null;
  creado_por?: string | null; placa?: string | null; motivo_entrada?: string | null; centro_costo?: string | null;
  items?: Array<{ inventario_id: string | null; descripcion: string }>;
}

/** ¿La cabecera de la orden contiene el texto buscado? (q en minúsculas, sin espacios sobrantes) */
export function cabeceraCoincide(d: OrdenBuscable, q: string): boolean {
  return [d.id, d.proveedor_nombre, d.proveedor_ruc, d.documento_referencia, d.creado_por, d.placa, d.motivo_entrada, d.centro_costo]
    .some(x => String(x ?? '').toLowerCase().includes(q));
}

/** Búsqueda por texto y fechas, igual que filtrarEntradas del clásico (incluye los artículos de la orden) */
export function filtrarOrdenes<T extends OrdenBuscable>(lista: T[], f: FiltrosOC): T[] {
  const q = f.busqueda.toLowerCase().trim();
  return lista.filter(d => {
    if (f.estado !== 'todas' && categoriaEstado(d.estado) !== f.estado) return false;
    if (q) {
      const enItems = (d.items ?? []).some(it => String(it.inventario_id ?? '').toLowerCase().includes(q) || String(it.descripcion ?? '').toLowerCase().includes(q));
      if (!cabeceraCoincide(d, q) && !enItems) return false;
    }
    const fecha = fechaOrden(d);
    if (fecha) {
      if (f.desde && !f.hasta) { if (fecha < f.desde) return false; }
      else if (!f.desde && f.hasta) { if (fecha > f.hasta) return false; }
      else if (f.desde && f.hasta) { if (fecha < f.desde || fecha > f.hasta) return false; }
    }
    return true;
  });
}

/**
 * Descripción de un artículo sin el código que la versión anterior ponía al inicio ("INV-0001 — Filtro" → "Filtro"),
 * igual que _entDescLimpia del clásico.
 */
export function descripcionArticulo(desc: string | null | undefined, inventarioId?: string | null): string {
  const d = String(desc ?? '').trim();
  if (!d) return '';
  if (inventarioId && d.startsWith(`${inventarioId} —`)) return d.slice(inventarioId.length + 2).trim();
  return d.replace(/^[A-Z0-9]+-\d+\s*—\s*/i, '');
}

/** Artículos de una orden que coinciden con la búsqueda (si la cabecera ya coincide, se muestran todos) */
export function itemsVisibles<T extends { inventario_id: string | null; descripcion: string }>(
  items: T[], cabeceraCoincide: boolean, busqueda: string,
): T[] {
  const q = busqueda.toLowerCase().trim();
  if (!q || cabeceraCoincide) return items;
  return items.filter(it => `${it.inventario_id ?? ''} ${it.descripcion ?? ''}`.toLowerCase().includes(q));
}

export interface KpisOC { total: number; monto: number; proveedores: number; unidades: number }

/** Totales de las órdenes filtradas. El monto va en soles (total_pen), como el clásico. */
export function kpisOrdenes(lista: Array<{ total_pen?: number | null; proveedor_nombre?: string | null; proveedor_id?: string | null; items?: Array<{ cantidad: number }> }>): KpisOC {
  const provs = new Set<string>();
  let monto = 0;
  let unidades = 0;
  for (const o of lista) {
    monto += Number(o.total_pen) || 0;
    const p = String(o.proveedor_nombre || o.proveedor_id || '').trim();
    if (p) provs.add(p);
    for (const it of o.items ?? []) unidades += Number(it.cantidad) || 0;
  }
  return { total: lista.length, monto, proveedores: provs.size, unidades: Math.round(unidades) };
}

// ─── Líneas e IGV ───────────────────────────────────────────────────────────

/**
 * Una línea del formulario. Todos los valores son texto (lo que escribe la persona).
 * `refCosto`: costo de referencia del artículo, para avisar si el precio sube o baja.
 */
export interface LineaOC {
  key: string;
  inventario_id: string | null;
  descripcion: string;
  cantidad: string;
  vu: string;   // valor unitario (sin IGV)
  pu: string;   // precio unitario (con IGV cuando la orden lleva IGV)
  igv: string;  // solo lectura
  importe: string;
  refCosto: number | null;
  unidad?: string | null;
}

export type CampoLinea = 'cantidad' | 'vu' | 'pu' | 'importe';

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const num = (s: string) => parseFloat(s) || 0;

/**
 * Recalcula una línea después de que cambió `fuente`, con la misma lógica que _entCalcImporte del clásico.
 * Los campos que no son la fuente se reescriben; el campo que escribe la persona se respeta.
 */
export function calcularLinea(l: LineaOC, fuente: CampoLinea, modo: ModoIgv): LineaOC {
  const cant = num(l.cantidad);
  let vu = num(l.vu);
  let pu = num(l.pu);
  const imp = num(l.importe);
  const out: LineaOC = { ...l };
  // Solo se reescriben los campos que no escribe la persona
  const set = (campo: Exclude<CampoLinea, 'cantidad'>, valor: string) => {
    if (campo !== fuente) out[campo] = valor;
  };

  if (modo === 'sin_igv') {
    if (fuente === 'importe') {
      pu = cant > 0 ? r2(imp / cant) : 0;
      vu = pu;
      set('pu', pu.toFixed(2));
      set('vu', vu.toFixed(4));
    } else if (fuente === 'pu' || fuente === 'vu') {
      pu = r2(fuente === 'pu' ? pu : vu);
      vu = pu;
      set('pu', pu.toFixed(2));
      set('vu', vu.toFixed(4));
      set('importe', r2(cant * pu).toFixed(2));
    } else {
      pu = r2(pu);
      set('importe', r2(cant * pu).toFixed(2));
    }
    out.igv = (0).toFixed(2);
    return out;
  }

  // Con IGV (incluido y +IGV usan el mismo cálculo; la diferencia está en qué campo se escribe primero)
  if (fuente === 'importe') {
    pu = cant > 0 ? r2(imp / cant) : 0;
    vu = r4(pu / (1 + TASA_IGV));
    set('pu', pu.toFixed(2));
    set('vu', vu.toFixed(4));
    out.igv = r2(imp - cant * vu).toFixed(2);
    return out;
  }
  if (fuente === 'vu') {
    pu = r2(vu * (1 + TASA_IGV));
    const total = r2(cant * pu);
    set('pu', pu.toFixed(2));
    set('importe', total.toFixed(2));
    out.igv = r2(total - cant * vu).toFixed(2);
    return out;
  }
  // pu o cantidad: el VU sale del PU
  pu = r2(pu);
  vu = r4(pu / (1 + TASA_IGV));
  const total = r2(cant * pu);
  set('vu', vu.toFixed(4));
  set('importe', total.toFixed(2));
  out.igv = r2(total - cant * vu).toFixed(2);
  return out;
}

/** Totales del formulario: total (con IGV si lo lleva), IGV y gravado */
export function totalesLineas(lineas: LineaOC[]) {
  let total = 0;
  let igv = 0;
  for (const l of lineas) {
    total += num(l.importe);
    igv += num(l.igv);
  }
  return { total, igv, gravado: total - igv };
}

/** Importe de la línea como se guarda: cantidad × precio unitario */
export function importeLinea(l: LineaOC): number {
  return num(l.importe) || num(l.cantidad) * num(l.pu);
}

/** Desglose de un total guardado (la orden guarda los importes con IGV incluido cuando lleva IGV) */
export function desgloseIgv(total: number, tipoIgv: string | null | undefined) {
  if (tipoIgv === 'incluido' || tipoIgv === 'mas_igv') {
    const gravado = total / (1 + TASA_IGV);
    return { gravado, igv: total - gravado, conIgv: true };
  }
  return { gravado: total, igv: 0, conIgv: false };
}

/** Diferencia de precio frente a la referencia: null si no hay referencia o no cambia */
export function alertaPrecio(pu: number, refCosto: number | null): { subio: boolean; pct: number } | null {
  if (refCosto == null || !(refCosto > 0) || Math.abs(pu - refCosto) <= 0.001) return null;
  return { subio: pu > refCosto, pct: ((pu - refCosto) / refCosto) * 100 };
}

// ─── Cuentas bancarias ──────────────────────────────────────────────────────

export interface CuentaBancaria {
  banco?: string | null;
  tipo_cuenta?: string | null;
  moneda?: string | null;
  numero_cuenta?: string | null;
  detraccion?: number | boolean | string | null;
}

/** Texto de la cuenta del proveedor tal como lo guarda el clásico */
export function etiquetaCuentaProveedor(c: CuentaBancaria): string {
  const mon = String(c.moneda || 'SOLES').toUpperCase();
  const monLabel = mon.includes('DOL') || mon.includes('DÓL') || mon === 'USD' || mon === 'US$' ? 'DÓLARES' : 'SOLES';
  const tipo = String(c.tipo_cuenta || 'CUENTA CORRIENTE').toUpperCase();
  const det = c.detraccion ? ' [DETRACCIÓN]' : '';
  return `${c.banco ?? ''} - ${tipo} [${monLabel}] - ${(c.numero_cuenta ?? '').trim()}${det}`;
}

/** Texto de la cuenta de la empresa tal como lo guarda el clásico */
export function etiquetaCuentaEmpresa(c: CuentaBancaria): string {
  const mon = String(c.moneda || 'SOLES').toUpperCase();
  const monLabel = mon.includes('DOL') || mon === 'USD' || mon === 'US$' ? 'DÓLARES' : 'SOLES';
  const tipo = c.tipo_cuenta || 'CTA CTE';
  const det = c.detraccion ? ' [DETRACCIÓN]' : '';
  return `${c.banco ?? ''} - ${tipo} [${monLabel}] - ${(c.numero_cuenta ?? '').trim()}${det}`;
}

// ─── Número a letras (mismo algoritmo que numeroALetras del clásico) ────────

export function numeroALetras(num: number): string {
  const enteros = Math.floor(num);
  const centavos = Math.round(num * 100) - enteros * 100;
  const unidades = (n: number): string => (['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'][n] ?? '');
  const decenasY = (sin: string, u: number) => (u > 0 ? `${sin} Y ${unidades(u)}` : sin);
  const decenas = (n: number): string => {
    const d = Math.floor(n / 10);
    const u = n - d * 10;
    switch (d) {
      case 1:
        return ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE'][u] ?? `DIECI${unidades(u)}`;
      case 2:
        return u === 0 ? 'VEINTE' : `VEINTI${unidades(u)}`;
      case 3: return decenasY('TREINTA', u);
      case 4: return decenasY('CUARENTA', u);
      case 5: return decenasY('CINCUENTA', u);
      case 6: return decenasY('SESENTA', u);
      case 7: return decenasY('SETENTA', u);
      case 8: return decenasY('OCHENTA', u);
      case 9: return decenasY('NOVENTA', u);
      default: return unidades(u);
    }
  };
  const centenas = (n: number): string => {
    const c = Math.floor(n / 100);
    const d = n - c * 100;
    const nombres = ['', '', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    if (c === 1) return d > 0 ? `CIENTO ${decenas(d)}` : 'CIEN';
    if (c >= 2) return `${nombres[c]} ${decenas(d)}`;
    return decenas(d);
  };
  const seccion = (n: number, divisor: number, singular: string, plural: string) => {
    const c = Math.floor(n / divisor);
    if (c <= 0) return '';
    return c > 1 ? `${centenas(c)} ${plural}` : singular;
  };
  const miles = (n: number) => {
    const s = seccion(n, 1000, 'UN MIL', 'MIL');
    const r = centenas(n - Math.floor(n / 1000) * 1000);
    return s === '' ? r : `${s} ${r}`;
  };
  const millones = (n: number) => {
    const s = seccion(n, 1000000, 'UN MILLON', 'MILLONES');
    const r = miles(n - Math.floor(n / 1000000) * 1000000);
    return s === '' ? r : `${s} ${r}`;
  };
  const cents = String(centavos < 10 ? `0${centavos}` : centavos);
  if (enteros === 0) return `CERO CON ${cents}/100`;
  return `${millones(enteros).replace(/\s+/g, ' ').trim()} CON ${cents}/100`;
}
