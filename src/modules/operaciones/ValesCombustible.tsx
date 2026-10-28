import '../mantenimiento/mant.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleAlert, FileSpreadsheet, Fuel, Pencil, Plus, RefreshCw, RotateCcw, SearchX, Trash2, Upload, X } from 'lucide-react';
import { ImportarValesSheet } from './ImportarValesSheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import '../../core/ui/acciones-iconos.css';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';

interface Vale {
  id: number; fecha: string | null; estado: string; correlativo: string | null; estado_pago: string | null; viaje: string | null;
  vehiculo: string | null; conductor: string | null; ruta: string | null; estacion: string | null; tipo_combustible: string | null;
  proveedor: string | null; ruc: string | null; kilometraje: number | null; galones: number | string | null; costo_gl: number | string | null;
  tipo_pago: string | null; dias_credito: number | null; moneda: string | null; importe: number | string | null;
  numero_comprobante: string | null; observacion: string | null; tipo: string | null; clase_vehiculo: string | null; archivo_url: string | null;
  caja: string | null; estado_caja: string | null; departamento: string | null; provincia: string | null; distrito: string | null;
  peso_tn: number | string | null; tipo_cambio: number | string | null;
}
interface Respuesta { ok: boolean; data: Vale[]; total: number; totalPages: number; kpis: { totalVales: number; totalGalones: number; totalGasto: number; costoPromedioGalon: number } }
interface Catalogos { placas: string[]; conductores: string[]; combustibles: string[]; proveedores: { proveedor_razon_social: string; proveedor_ruc: string | null; estaciones_nombres: string | null }[]; siguienteCorrelativo: string }

const n = (v: unknown) => Number(v) || 0;
// Solo la empresa Marsisa tiene base externa; el servidor rechaza la sincronización en las demás (mismo criterio que la navegación)
const esMarsisa = typeof window !== 'undefined' && window.location.hostname.split('.')[0].toLowerCase().includes('marsisa');
const money = (v: unknown) => n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Soles con S/ y espacio no divisible; fecha peruana dd/mm/aaaa
const soles = (v: unknown) => 'S/\u00a0' + money(v);
const dia = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const ESTADOS = ['VÁLIDO', 'ANULADO'];
const PAGOS = ['NO PAGADO', 'PAGADO'];
const TIPOS_PAGO = ['ANTICIPO', 'CONTADO', 'CREDITO'];

// Tarjeta de indicador de la cabecera (mismo estilo que en Análisis de combustible)
function KpiCard({ titulo, valor, detalle, color }: { titulo: string; valor: string; detalle: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 16, padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>{titulo}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: color ?? 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{detalle}</span>
    </div>
  );
}

// Pastilla de color del tema (mismos tonos que el resto de la app)
function Pastilla({ color, children }: { color: string; children: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${color}-tint)`, color: `var(--${color}-ink)`, fontSize: '0.6875rem', fontWeight: 700 }}>{children}</span>;
}

// Operaciones › Vales de combustible. `marsisa` fija la tabla propia de Marsisa (?modulo=marsisa).
export function ValesCombustible({ marsisa = false }: { marsisa?: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const modulo = marsisa ? 'marsisa' : 'operaciones';
  const [busqueda, setBusqueda] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [combustible, setCombustible] = useState('');
  // Por defecto, los vales del día de hoy (hora de Lima); para otro periodo se cambian las fechas
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [desde, setDesde] = useState(hoyLima);
  const [hasta, setHasta] = useState(hoyLima);
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<Vale | null>(null);
  const [formulario, setFormulario] = useState<{ vale: Vale | null } | null>(null);
  const [porAnular, setPorAnular] = useState<Vale | null>(null);
  const [importando, setImportando] = useState(false);
  const [sincronizar, setSincronizar] = useState(false);
  const [resetear, setResetear] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [borrandoMasivo, setBorrandoMasivo] = useState(false);
  const [confirmarMasivo, setConfirmarMasivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { setPagina(1); }, [search, estado, combustible, desde, hasta]);

  const q = useQuery<Respuesta>({
    queryKey: ['operaciones', 'vales', modulo, search, estado, combustible, desde, hasta, pagina],
    queryFn: () => {
      const p = new URLSearchParams({ modulo, page: String(pagina), limit: '50' });
      if (search) p.set('search', search);
      if (estado) p.set('estado', estado);
      if (combustible) p.set('combustible', combustible);
      if (desde) p.set('fecha_desde', desde);
      if (hasta) p.set('fecha_hasta', hasta);
      return api<Respuesta>(`/combustible/vales?${p}`);
    },
    placeholderData: prev => prev,
    staleTime: 20_000,
  });
  const cat = useQuery<Catalogos>({
    queryKey: ['operaciones', 'vales-catalogos', modulo],
    queryFn: () => api<Catalogos>(`/combustible/catalogos?modulo=${modulo}`),
    staleTime: 5 * 60_000,
  });

  const lista = q.data?.data ?? [];
  const k = q.data?.kpis;
  const puedeCrear = can('combustible_vales.crear', 'combustible.crear');
  const puedeEditar = can('combustible_vales.editar', 'combustible_vales.crear', 'combustible.editar');
  const puedeEliminar = can('combustible_vales.eliminar', 'combustible.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones'] });

  // Selección múltiple: se marcan vales de la página; la selección se conserva al cambiar de página
  const idsPagina = lista.map(v => Number(v.id));
  const todosPagina = idsPagina.length > 0 && idsPagina.every(id => seleccion.has(id));
  const alternarVale = (id: number) => setSeleccion(prev => { const nx = new Set(prev); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx; });
  const alternarPagina = () => setSeleccion(prev => { const nx = new Set(prev); idsPagina.forEach(id => { if (todosPagina) nx.delete(id); else nx.add(id); }); return nx; });

  const columnas: ColumnaTabla[] = [
    { id: 'sel', titulo: <input type="checkbox" aria-label="Seleccionar todos los vales de esta página" checked={todosPagina} onChange={alternarPagina} style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />, ancho: 56, minimo: 56 },
    { id: 'correlativo', titulo: 'Correlativo', ancho: 150 },
    { id: 'fecha', titulo: 'Fecha', ancho: 120 },
    { id: 'estado', titulo: 'Estado', ancho: 110 },
    { id: 'vehiculo', titulo: 'Vehículo', ancho: 130 },
    { id: 'clase', titulo: 'Clase vehículo', ancho: 130 },
    { id: 'conductor', titulo: 'Conductor', ancho: 220 },
    { id: 'caja', titulo: 'Caja', ancho: 110 },
    { id: 'estado-caja', titulo: 'Estado caja', ancho: 120 },
    { id: 'ruta', titulo: 'Ruta', ancho: 200 },
    { id: 'departamento', titulo: 'Departamento', ancho: 130 },
    { id: 'provincia', titulo: 'Provincia', ancho: 120 },
    { id: 'distrito', titulo: 'Distrito', ancho: 120 },
    { id: 'estacion', titulo: 'Estación / proveedor', ancho: 220 },
    { id: 'ruc', titulo: 'RUC', ancho: 130 },
    { id: 'producto', titulo: 'Producto', ancho: 110 },
    { id: 'kilometraje', titulo: 'Kilometraje', ancho: 120, alinear: 'right' },
    { id: 'peso', titulo: 'Peso (TN)', ancho: 110, alinear: 'right' },
    { id: 'galones', titulo: 'Galones', ancho: 100, alinear: 'right' },
    { id: 'costo', titulo: 'Costo/gl', ancho: 110, alinear: 'right' },
    { id: 'tipo-pago', titulo: 'Tipo pago', ancho: 120 },
    { id: 'dias', titulo: 'Días crédito', ancho: 120, alinear: 'right' },
    { id: 'importe', titulo: 'Importe', ancho: 130, alinear: 'right' },
    { id: 'pago', titulo: 'Estado de pago', ancho: 130 },
    { id: 'comprobante', titulo: 'N° comprobante', ancho: 150 },
    { id: 'tipo-cambio', titulo: 'Tipo cambio', ancho: 120, alinear: 'right' },
    { id: 'observacion', titulo: 'Observación', ancho: 240, minimo: 120 },
    { id: 'viaje', titulo: 'N° viaje', ancho: 130 },
  ];

  // Estado de pago en lote: una sola petición con todos los vales seleccionados
  async function cambiarPago(estado: 'PAGADO' | 'NO PAGADO') {
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; actualizados?: number; error?: string }>('/combustible/vales/estado-pago', { method: 'PATCH', body: { ids: [...seleccion], estado_pago: estado } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo actualizar el estado de pago');
      haptic('success'); toast(`${r.actualizados ?? seleccion.size} vales marcados como ${estado === 'PAGADO' ? 'pagados' : 'no pagados'}`);
      setSeleccion(new Set());
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  // Anulación en lote: un DELETE por vale (el servidor lo deja como ANULADO)
  async function anularMasivo() {
    setOcupado(true);
    let anulados = 0;
    let fallidos = 0;
    for (const id of seleccion) {
      try {
        const r = await api<{ ok?: boolean; error?: string }>(`/combustible/vales/${id}?modulo=${modulo}`, { method: 'DELETE' });
        if (r.ok === false) throw new Error(r.error || 'No se pudo anular');
        anulados++;
      } catch {
        fallidos++;
      }
    }
    setOcupado(false);
    setConfirmarAnular(false);
    setSeleccion(new Set());
    haptic(fallidos ? 'warning' : 'success');
    toast(fallidos ? `${anulados} anulados · ${fallidos} con error` : `${anulados} vales anulados`, fallidos ? 'error' : 'success');
    await refrescar();
  }

  async function anular() {
    if (!porAnular) return;
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/combustible/vales/${porAnular.id}?modulo=${modulo}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo anular');
      haptic('success'); toast('Vale anulado'); setPorAnular(null); setAbierto(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar(filas: Vale[] = lista) {
    try {
      await exportarExcel(marsisa ? 'Vales-combustible-Marsisa' : 'Vales-combustible', 'Vales',
        ['Fecha', 'Correlativo', 'Estado', 'Pago', 'Viaje', 'Vehículo', 'Conductor', 'Ruta', 'Estación', 'Combustible', 'Proveedor', 'Km', 'Galones', 'Costo/gl', 'Importe', 'Moneda', 'Comprobante'],
        filas.map(v => [dia(v.fecha), v.correlativo, v.estado, v.estado_pago, v.viaje, v.vehiculo, v.conductor, v.ruta, v.estacion, v.tipo_combustible, v.proveedor,
          v.kilometraje, n(v.galones), n(v.costo_gl), n(v.importe), v.moneda, v.numero_comprobante]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow={marsisa ? 'Operaciones · Marsisa' : 'Operaciones'}
        title={marsisa ? 'Vales de combustible Marsisa' : 'Vales de combustible'}
        subtitle={q.isLoading ? 'Cargando…' : `${k?.totalVales ?? 0} vales`}
        actions={
          <>
            <div className="acciones-iconos">
              <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--verde"
                data-tip="Exportar Excel" aria-label="Exportar Excel" onClick={() => exportar()}>
                <FileSpreadsheet size={17} />
              </button>
              <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--violeta"
                data-tip="Importar desde Excel" aria-label="Importar desde Excel" onClick={() => setImportando(true)}>
                <Upload size={17} />
              </button>
              {esMarsisa && (
                <>
                  <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--azul"
                    data-tip="Sincronizar nuevos vales" aria-label="Sincronizar nuevos vales" onClick={() => setSincronizar(true)}>
                    <RefreshCw size={17} />
                  </button>
                  <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--rojo"
                    data-tip="Forzar resincronización completa" aria-label="Forzar resincronización completa" onClick={() => setResetear(true)}>
                    <RotateCcw size={17} />
                  </button>
                </>
              )}
            </div>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ vale: null })}>Nuevo vale</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-3)' }}>
          <KpiCard titulo="Galones" valor={n(k?.totalGalones).toLocaleString('es-PE', { maximumFractionDigits: 1 })} color="var(--accent)" detalle={`${q.data?.total ?? 0} vales en el periodo`} />
          <KpiCard titulo="Gasto" valor={soles(k?.totalGasto)} color="var(--green-ink)" detalle="Importe de los vales del periodo" />
          <KpiCard titulo="Costo por galón" valor={soles(k?.costoPromedioGalon)} color="var(--amber-ink)" detalle="Promedio ponderado por galón" />
        </div>

        <SearchField value={busqueda} placeholder="Correlativo, placa, viaje, conductor, proveedor o estación…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _vT?: number })._vT); (window as unknown as { _vT?: number })._vT = window.setTimeout(() => setSearch(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
            <option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
          <SelectInput value={combustible} onChange={e => setCombustible(e.target.value)} aria-label="Combustible" style={{ width: 'auto' }}>
            <option value="">Todo combustible</option>{(cat.data?.combustibles ?? []).map(c => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : lista.length === 0 ? (
          <EmptyState icon={search || estado || desde || hasta ? <SearchX size={22} /> : <Fuel size={22} />} title={search || estado || desde || hasta ? 'Sin coincidencias' : 'Sin vales'}>
            {puedeCrear && !search && !estado ? <>Registra el primero con <strong>Nuevo vale</strong>.</> : 'Prueba con otros filtros.'}
          </EmptyState>
        ) : (
          <>
            <TablaRedimensionable id={marsisa ? 'vales-marsisa' : 'vales'} columnas={columnas} ariaLabel="Vales de combustible" altoMax="none">
              {lista.map(v => {
                const anulado = v.estado === 'ANULADO';
                const marcado = seleccion.has(Number(v.id));
                return (
                  <tr key={v.id} className="tabla-redim__fila--click" style={{ opacity: anulado ? 0.6 : undefined }}
                    onClick={() => { haptic('selection'); setAbierto(v); }}>
                    <Celda>
                      <label onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, margin: -10, cursor: 'pointer' }}>
                        <input type="checkbox" aria-label={`Seleccionar vale ${v.correlativo ?? v.id}`} checked={marcado} onChange={() => alternarVale(Number(v.id))}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      </label>
                    </Celda>
                    <Celda mono>{v.correlativo || '—'}</Celda>
                    <Celda mono>{dia(v.fecha)}</Celda>
                    <Celda><Pastilla color={anulado ? 'gray' : 'green'}>{anulado ? 'ANULADO' : 'VÁLIDO'}</Pastilla></Celda>
                    <Celda><LicensePlate plate={v.vehiculo ?? ''} size="sm" /></Celda>
                    <Celda>{v.clase_vehiculo || '—'}</Celda>
                    <Celda>{v.conductor || '—'}</Celda>
                    <Celda mono>{v.caja || '—'}</Celda>
                    <Celda>{v.estado_caja || '—'}</Celda>
                    <Celda>{v.ruta || '—'}</Celda>
                    <Celda>{v.departamento || '—'}</Celda>
                    <Celda>{v.provincia || '—'}</Celda>
                    <Celda>{v.distrito || '—'}</Celda>
                    <Celda>{v.estacion || v.proveedor || '—'}</Celda>
                    <Celda mono>{v.ruc || '—'}</Celda>
                    <Celda>{v.tipo_combustible || '—'}</Celda>
                    <Celda alinear="right" mono>{n(v.kilometraje) ? n(v.kilometraje).toLocaleString('es-PE') : '—'}</Celda>
                    <Celda alinear="right" mono>{n(v.peso_tn) ? n(v.peso_tn).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</Celda>
                    <Celda alinear="right" mono>{n(v.galones).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</Celda>
                    <Celda alinear="right" mono>{money(v.costo_gl)}</Celda>
                    <Celda>{v.tipo_pago || '—'}</Celda>
                    <Celda alinear="right" mono>{v.dias_credito ?? '—'}</Celda>
                    <Celda alinear="right" mono>{v.moneda === 'DOLARES' ? 'US$ ' : 'S/ '}{money(v.importe)}</Celda>
                    <Celda><Pastilla color={anulado ? 'gray' : v.estado_pago === 'PAGADO' ? 'green' : 'amber'}>{anulado ? '—' : (v.estado_pago ?? '—')}</Pastilla></Celda>
                    <Celda mono>{v.numero_comprobante || '—'}</Celda>
                    <Celda alinear="right" mono>{n(v.tipo_cambio) ? n(v.tipo_cambio).toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 4 }) : '—'}</Celda>
                    <Celda>{v.observacion || '—'}</Celda>
                    <Celda mono>{v.viaje || '—'}</Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
            {(q.data?.totalPages ?? 1) > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--s-3)' }}>
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <span className="t-footnote c-secondary">Página {pagina} de {q.data?.totalPages}</span>
                <Button variant="secondary" disabled={pagina >= (q.data?.totalPages ?? 1)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbierto(null)} title={abierto ? `Vale ${abierto.correlativo || abierto.id}` : ''}
        footer={
          <>
            {puedeEditar && abierto && abierto.estado !== 'ANULADO' && <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setPorAnular(abierto)}>Anular</Button>}
            {puedeEditar && abierto && <Button variant="primary" icon={<Pencil size={16} />} onClick={() => { setFormulario({ vale: abierto }); setAbierto(null); }}>Editar</Button>}
            {!puedeEditar && <Button variant="secondary" onClick={() => setAbierto(null)}>Cerrar</Button>}
          </>
        }>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{n(abierto.galones).toLocaleString('es-PE')}</span><span className="inv-metrica__label">Galones</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{money(abierto.costo_gl)}</span><span className="inv-metrica__label">Costo/gl</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{abierto.moneda === 'DOLARES' ? 'US$\u00a0' : 'S/\u00a0'}{money(abierto.importe)}</span><span className="inv-metrica__label">Importe {abierto.moneda === 'DOLARES' ? 'US$' : 'S/'}</span></div>
            </div>
            <div className="tarjeta__lista">
              {fila('Estado', abierto.estado)}{fila('Pago', [abierto.estado_pago, abierto.tipo_pago, abierto.dias_credito ? `${abierto.dias_credito} días` : ''].filter(Boolean).join(' · '))}
              {fila('Fecha', dia(abierto.fecha), true)}{fila('Viaje', abierto.viaje, true)}{fila('Vehículo', abierto.vehiculo, true)}{fila('Conductor', abierto.conductor)}{fila('Ruta', abierto.ruta)}
              {fila('Estación', abierto.estacion)}{fila('Proveedor', [abierto.proveedor, abierto.ruc].filter(Boolean).join(' · '))}{fila('Combustible', abierto.tipo_combustible)}
              {fila('Kilometraje', abierto.kilometraje ? abierto.kilometraje.toLocaleString('es-PE') : '', true)}{fila('Comprobante', abierto.numero_comprobante, true)}{fila('Observación', abierto.observacion)}
            </div>
            {abierto.archivo_url && <a className="btn btn--secondary btn--sm" href={abierto.archivo_url} target="_blank" rel="noreferrer">Ver comprobante</a>}
          </div>
        )}
      </Sheet>

      <FormularioVale open={!!formulario} vale={formulario?.vale ?? null} cat={cat.data} modulo={modulo} onClose={() => setFormulario(null)} onGuardado={refrescar} />

      <ImportarValesSheet open={importando} onClose={() => setImportando(false)} marsisa={marsisa} />
      {seleccion.size > 0 && (
        <div role="toolbar" aria-label="Acciones de vales seleccionados"
          style={{ position: 'sticky', bottom: 'var(--s-3)', zIndex: 5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap',
            marginTop: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)', borderRadius: 999, background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
            backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)', border: '1px solid var(--separator)', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', padding: '0 var(--s-2)' }}>{seleccion.size} seleccionados</span>
          <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => {
            const filas = lista.filter(v => seleccion.has(Number(v.id)));
            if (filas.length) exportar(filas);
            else toast('Esos vales están en otra página: cámbiala para exportarlos', 'error');
          }}>Excel</Button>
          {puedeEditar && <Button variant="secondary" loading={ocupado} onClick={() => cambiarPago('PAGADO')}>Marcar pagado</Button>}
          {puedeEditar && <Button variant="secondary" loading={ocupado} onClick={() => cambiarPago('NO PAGADO')}>Marcar no pagado</Button>}
          {puedeEditar && <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setConfirmarAnular(true)}>Anular</Button>}
          {puedeEliminar && <Button variant="primary" icon={<Trash2 size={16} />} onClick={() => setConfirmarMasivo(true)}>Eliminar</Button>}
          <Button variant="secondary" icon={<X size={16} />} onClick={() => setSeleccion(new Set())}>Limpiar</Button>
        </div>
      )}
      <ConfirmSheet open={confirmarMasivo} onClose={() => !borrandoMasivo && setConfirmarMasivo(false)} loading={borrandoMasivo}
        title={`¿Eliminar ${seleccion.size} vales?`} message="Se borran definitivamente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar definitivamente"
        onConfirm={async () => {
          setBorrandoMasivo(true);
          try {
            const r = await api<{ ok?: boolean; mensaje?: string; error?: string }>('/combustible/vales/eliminar-masivo?hard=true', { method: 'POST', body: { ids: [...seleccion] } });
            if (r.ok === false) throw new Error(r.error || 'No se pudieron eliminar los vales');
            haptic('success'); toast(r.mensaje ?? 'Vales eliminados');
            setConfirmarMasivo(false); setSeleccion(new Set());
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setBorrandoMasivo(false); }
        }} />
      <ConfirmSheet open={resetear} onClose={() => !sincronizando && setResetear(false)} loading={sincronizando}
        title="¿Forzar la resincronización completa?"
        message="Se BORRAN todos los vales de Marsisa en esta base y se vuelven a traer desde MarsisaSoft. Los cambios hechos aquí (anulaciones, pagos marcados, vales cargados a mano) se pierden. Haz un respaldo antes."
        confirmLabel="Borrar y resincronizar"
        onConfirm={async () => {
          setSincronizando(true);
          try {
            const r = await api<{ mensaje?: string; error?: string; ok?: boolean }>('/combustible/sincronizar-remoto?reset=true', { method: 'POST' });
            if (r.ok === false) throw new Error(r.error || 'No se pudo resincronizar');
            haptic('success'); toast(r.mensaje ?? 'Resincronización completa');
            setResetear(false);
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setSincronizando(false); }
        }} />
      <ConfirmSheet open={sincronizar} onClose={() => !sincronizando && setSincronizar(false)} loading={sincronizando}
        title="¿Sincronizar vales con MarsisaSoft?" message="Trae los vales nuevos desde la base externa. Los que ya existen no se duplican."
        confirmLabel="Sincronizar"
        onConfirm={async () => {
          setSincronizando(true);
          try {
            const r = await api<{ mensaje?: string }>('/combustible/sincronizar-remoto', { method: 'POST' });
            haptic('success'); toast(r.mensaje ?? 'Sincronización completada');
            setSincronizar(false);
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setSincronizando(false); }
        }} />
      <ConfirmSheet open={confirmarAnular} onClose={() => !ocupado && setConfirmarAnular(false)} loading={ocupado}
        title={`¿Anular ${seleccion.size} vales?`} message="Quedan marcados como ANULADO y dejan de contar en los totales. Se puede revisar después en la tabla."
        confirmLabel="Anular" onConfirm={anularMasivo} />
      <ConfirmSheet open={!!porAnular} onClose={() => !ocupado && setPorAnular(null)} onConfirm={anular} loading={ocupado}
        title="¿Anular este vale?" message="Queda marcado como ANULADO y deja de contar en los totales." confirmLabel="Anular" />
    </Page>
  );
}

function FormularioVale({ open, vale, cat, modulo, onClose, onGuardado }: {
  open: boolean; vale: Vale | null; cat?: Catalogos; modulo: string; onClose: () => void; onGuardado: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampos, setErrCampos] = useState<Record<string, string | undefined>>({});
  const editando = !!vale;

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const base: Record<string, string> = {
      fecha: d.toISOString().slice(0, 16), estado: 'VÁLIDO', correlativo: cat?.siguienteCorrelativo ?? '', estado_pago: 'NO PAGADO', viaje: '', vehiculo: '',
      conductor: '', ruta: '', estacion: '', tipo_combustible: 'D2', proveedor: '', ruc: '', kilometraje: '', galones: '', costo_gl: '', importe: '',
      tipo_pago: 'ANTICIPO', dias_credito: '0', moneda: 'SOLES', numero_comprobante: '', observacion: '', tipo: 'RECARGA VUELTA', clase_vehiculo: 'TRACTO',
    };
    if (vale) for (const k of Object.keys(base)) { const x = (vale as unknown as Record<string, unknown>)[k]; if (x != null) base[k] = k === 'fecha' ? String(x).replace(' ', 'T').slice(0, 16) : String(x); }
    setV(base);
  }, [open, vale, cat]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  // Importe = galones × costo por galón (se recalcula al cambiar cualquiera de los dos)
  function cambiarCalculo(k: 'galones' | 'costo_gl', val: string) {
    setV(a => {
      const x = { ...a, [k]: val };
      const g = parseFloat(x.galones.replace(',', '.')), c = parseFloat(x.costo_gl.replace(',', '.'));
      if (Number.isFinite(g) && Number.isFinite(c)) x.importe = (g * c).toFixed(2);
      return x;
    });
  }

  async function guardar() {
    const e: Record<string, string> = {};
    if (!v.vehiculo.trim()) e.vehiculo = 'La placa del vehículo es obligatoria.';
    if (!(parseFloat(v.galones) > 0)) e.galones = 'Indica los galones.';
    setErrCampos(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const body = { ...v, vehiculo: v.vehiculo.toUpperCase().trim(), fecha: v.fecha.replace('T', ' ') + ':00', modulo };
      const r = vale
        ? await api<{ ok?: boolean; error?: string }>(`/combustible/vales/${vale.id}?modulo=${modulo}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string }>('/combustible/vales', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Vale actualizado' : 'Vale registrado');
      await onGuardado(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'decimal' | 'numeric'; list?: string; calc?: boolean; error?: string }) => (
    <Field label={label} wide={o?.wide} error={o?.error}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} value={v[k] ?? ''}
        onChange={e => (o?.calc ? cambiarCalculo(k as 'galones' | 'costo_gl', e.target.value) : set(k, e.target.value))} />}
    </Field>
  );
  const sel = (k: string, label: string, ops: string[]) => (
    <Field label={label}>
      {p => <SelectInput {...p} value={v[k] ?? ''} onChange={e => set(k, e.target.value)}>{[...new Set([...ops, ...(v[k] ? [v[k]] : [])])].map(o => <option key={o} value={o}>{o}</option>)}</SelectInput>}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar vale ${vale?.correlativo ?? ''}` : 'Nuevo vale de combustible'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {txt('correlativo', 'Correlativo')}
        {txt('fecha', 'Fecha y hora', { type: 'datetime-local' })}
        <Field label="Vehículo (placa)" error={errCampos.vehiculo}>
          {p => (<>
            <TextInput {...p} list="vale-placas" value={v.vehiculo ?? ''} onChange={e => set('vehiculo', e.target.value.toUpperCase())} />
            <datalist id="vale-placas">{(cat?.placas ?? []).map(x => <option key={x} value={x} />)}</datalist>
          </>)}
        </Field>
        {txt('viaje', 'N° de viaje')}
        <Field label="Conductor" wide>
          {p => (<>
            <TextInput {...p} list="vale-conductores" value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />
            <datalist id="vale-conductores">{(cat?.conductores ?? []).map(x => <option key={x} value={x} />)}</datalist>
          </>)}
        </Field>
        {txt('ruta', 'Ruta', { wide: true })}
        <Field label="Proveedor" wide>
          {p => (<>
            <TextInput {...p} list="vale-prov" value={v.proveedor ?? ''}
              onChange={e => { const val = e.target.value; const pr = (cat?.proveedores ?? []).find(x => x.proveedor_razon_social === val); setV(a => ({ ...a, proveedor: val, ruc: pr?.proveedor_ruc ?? a.ruc })); }} />
            <datalist id="vale-prov">{(cat?.proveedores ?? []).map(x => <option key={x.proveedor_razon_social} value={x.proveedor_razon_social} />)}</datalist>
          </>)}
        </Field>
        {txt('estacion', 'Estación')}
        {txt('ruc', 'RUC')}
        {sel('tipo_combustible', 'Combustible', cat?.combustibles ?? ['D2'])}
        {txt('kilometraje', 'Kilometraje', { mode: 'numeric' })}
        {txt('galones', 'Galones', { mode: 'decimal', calc: true, error: errCampos.galones })}
        {txt('costo_gl', 'Costo por galón', { mode: 'decimal', calc: true })}
        {txt('importe', 'Importe', { mode: 'decimal' })}
        {sel('moneda', 'Moneda', ['SOLES', 'DOLARES'])}
        {sel('tipo_pago', 'Tipo de pago', TIPOS_PAGO)}
        {txt('dias_credito', 'Días de crédito', { mode: 'numeric' })}
        {sel('estado_pago', 'Estado de pago', PAGOS)}
        {sel('estado', 'Estado', ESTADOS)}
        {txt('numero_comprobante', 'N° de comprobante')}
        {txt('observacion', 'Observación', { wide: true })}
      </div>
    </Sheet>
  );
}
