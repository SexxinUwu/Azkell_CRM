import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronLeft, ChevronRight, FileSpreadsheet, RefreshCw, Route, SearchX, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';

// Órdenes de viaje de Marsisa: misma información y reglas que el clásico (modulos/operaciones/marsisa-ordenes-viaje).
// Solo consulta: los datos vienen sincronizados desde el sistema de Marsisa.

interface ViajeMarsisa {
  id: number; viaje: string; fecha_viaje: string | null; conductor: string | null; placa_tracto: string | null; placa_remolque: string | null;
  ruta: string | null; estado: string | null; peso: number | string | null; observaciones: string | null;
  cant_ordenes?: number; peso_ida?: number | string; peso_retorno?: number | string; peso_total_rutas?: number | string;
  ordenes_list?: string | null; rutas_list?: string | null;
  fecha_inicio?: string | null; fecha_fin?: string | null; kilometraje_inicial?: number | null; kilometraje_final?: number | null;
}

interface RutaMarsisa {
  id: number; viaje: string; orden: string | null; ruta: string | null; tipo_servicio: string | null; es_retorno: number | string;
  peso_total: number | string | null; fecha_viaje: string | null; conductor: string | null; placa_tracto: string | null;
  placa_remolque: string | null; estado: string | null;
}

type Modo = 'viajes' | 'rutas';
type Tramo = 'TODOS' | 'SOLO_IDA' | 'SOLO_RETORNO';

const POR_PAGINA = 25;
const n = (v: unknown) => Number(v) || 0;
const toneDeEstado = (e: string | null) => { const s = String(e ?? '').toUpperCase(); return s === 'FINALIZADO' ? 'green' : s === 'INICIADO' ? 'accent' : 'gray'; };
const estadoTexto = (e: string | null) => String(e || 'INICIADO').toUpperCase();
const TN = (kg: number) => `${(kg / 1000).toFixed(2)} TN`;

// Fecha como la muestra el clásico: dd/mm/aaaa hh:mm a. m. / p. m.
function fechaClasico(s?: string | null) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!m) return '—';
  const h = Number(m[4]);
  return `${m[3]}/${m[2]}/${m[1]} ${String(h % 12 || 12).padStart(2, '0')}:${m[5]} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
}

// Filtros idénticos al clásico (ovAplicarFiltros): N° de viaje exacto por texto, búsqueda general y tramo
function filtrarViajes(lista: ViajeMarsisa[], fViaje: string, q: string, tramo: Tramo) {
  return lista.filter(v => {
    if (fViaje && !String(v.viaje ?? '').toUpperCase().includes(fViaje)) return false;
    if (q && ![v.placa_tracto, v.placa_remolque, v.conductor, v.ruta, v.ordenes_list, v.rutas_list].some(x => String(x ?? '').toUpperCase().includes(q))) return false;
    if (tramo === 'SOLO_IDA' && n(v.peso_ida) <= 0 && (!v.ruta || v.ruta.toUpperCase().includes('RETORNO'))) return false;
    if (tramo === 'SOLO_RETORNO' && n(v.peso_retorno) <= 0 && (!v.rutas_list || !v.rutas_list.toUpperCase().includes('RETORNO'))) return false;
    return true;
  });
}

function filtrarRutas(lista: RutaMarsisa[], fViaje: string, q: string, tramo: Tramo) {
  return lista.filter(r => {
    if (fViaje && !String(r.viaje ?? '').toUpperCase().includes(fViaje)) return false;
    if (q && ![r.orden, r.ruta, r.tipo_servicio, r.conductor, r.placa_tracto, r.placa_remolque].some(x => String(x ?? '').toUpperCase().includes(q))) return false;
    if (tramo === 'SOLO_IDA' && Number(r.es_retorno) !== 0) return false;
    if (tramo === 'SOLO_RETORNO' && Number(r.es_retorno) !== 1) return false;
    return true;
  });
}

const COLUMNAS_VIAJES: ColumnaTabla[] = [
  { id: 'viaje', titulo: 'N° viaje', ancho: 150, minimo: 120 },
  { id: 'fecha', titulo: 'F. / H. programación', ancho: 200 },
  { id: 'tracto', titulo: 'Tracto', ancho: 130 },
  { id: 'carreta', titulo: 'Carreta', ancho: 130 },
  { id: 'conductor', titulo: 'Conductor asignado', ancho: 240, minimo: 160 },
  { id: 'ordenes', titulo: 'Órdenes y rutas', ancho: 340, minimo: 200 },
  { id: 'ida', titulo: 'Carga ida', ancho: 120, alinear: 'right' },
  { id: 'retorno', titulo: 'Carga retorno', ancho: 130, alinear: 'right' },
  { id: 'total', titulo: 'Peso total', ancho: 120, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 130, alinear: 'center' },
];

const COLUMNAS_RUTAS: ColumnaTabla[] = [
  { id: 'viaje', titulo: 'N° viaje', ancho: 150, minimo: 120 },
  { id: 'orden', titulo: 'N° orden serv.', ancho: 160 },
  { id: 'tramo', titulo: 'Tramo', ancho: 120, alinear: 'center' },
  { id: 'tracto', titulo: 'Tracto', ancho: 130 },
  { id: 'carreta', titulo: 'Carreta', ancho: 130 },
  { id: 'conductor', titulo: 'Conductor', ancho: 220, minimo: 160 },
  { id: 'ruta', titulo: 'Ruta despachada', ancho: 300, minimo: 180 },
  { id: 'servicio', titulo: 'Tipo de servicio', ancho: 160 },
  { id: 'peso', titulo: 'Peso carga', ancho: 120, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 130, alinear: 'center' },
];

// Operaciones › Órdenes de viaje Marsisa: órdenes sincronizadas desde el sistema de Marsisa (solo consulta).
export function MarsisaOrdenesViajePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [modo, setModo] = useState<Modo>('viajes');
  const [fViaje, setFViaje] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tramo, setTramo] = useState<Tramo>('TODOS');
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<ViajeMarsisa | null>(null);
  const [sync, setSync] = useState(false);

  const viajesQ = useQuery<ViajeMarsisa[]>({
    queryKey: ['operaciones', 'marsisa-ordenes-viaje'],
    queryFn: () => api<{ data?: ViajeMarsisa[] }>('/operaciones/marsisa-ordenes-viaje?limit=2500').then(r => r.data ?? []),
    staleTime: 30_000,
  });
  const rutasQ = useQuery<RutaMarsisa[]>({
    queryKey: ['operaciones', 'marsisa-ordenes-viaje', 'rutas'],
    queryFn: () => api<{ data?: RutaMarsisa[] }>('/operaciones/marsisa-ordenes-viaje?vista=rutas&limit=4000').then(r => r.data ?? []),
    staleTime: 30_000,
  });

  const viajes = viajesQ.data ?? [];
  const rutas = rutasQ.data ?? [];
  const cargando = viajesQ.isLoading || rutasQ.isLoading;
  const error = viajesQ.error ?? rutasQ.error;

  // KPIs igual que el clásico: viajes, O/S y peso de ida y de retorno (rutas en toneladas)
  const kpis = useMemo(() => {
    let ida = 0, retorno = 0;
    for (const r of rutas) {
      if (Number(r.es_retorno) === 1) retorno += n(r.peso_total); else ida += n(r.peso_total);
    }
    return { viajes: viajes.length, ordenes: rutas.length, ida, retorno };
  }, [viajes, rutas]);

  const q = busqueda.trim().toUpperCase();
  const fv = fViaje.trim().toUpperCase();
  const visiblesViajes = useMemo(() => filtrarViajes(viajes, fv, q, tramo), [viajes, fv, q, tramo]);
  const visiblesRutas = useMemo(() => filtrarRutas(rutas, fv, q, tramo), [rutas, fv, q, tramo]);
  const total = modo === 'viajes' ? visiblesViajes.length : visiblesRutas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const inicio = (pag - 1) * POR_PAGINA;
  const pagViajes = visiblesViajes.slice(inicio, inicio + POR_PAGINA);
  const pagRutas = visiblesRutas.slice(inicio, inicio + POR_PAGINA);

  function cambiarFiltro<T>(setter: (v: T) => void) {
    return (v: T) => { setPagina(1); setter(v); };
  }

  function limpiar() {
    setFViaje(''); setBusqueda(''); setTramo('TODOS'); setPagina(1);
  }

  async function sincronizar() {
    setSync(true);
    try {
      const r = await api<{ message?: string; insertados?: number; actualizados?: number }>('/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
      haptic('success');
      toast(r.message || `Sincronizado: ${r.insertados ?? 0} nuevas, ${r.actualizados ?? 0} actualizadas`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setSync(false); }
  }

  async function exportar() {
    try {
      if (modo === 'viajes') {
        await exportarExcel('Ordenes-de-viaje-Marsisa', 'Viajes',
          ['Viaje', 'Fecha', 'Estado', 'Conductor', 'Tracto', 'Carreta', 'Ruta', 'Carga ida (TN)', 'Carga retorno (TN)', 'Peso total (TN)', 'Órdenes'],
          visiblesViajes.map(v => [v.viaje, fechaClasico(v.fecha_viaje), estadoTexto(v.estado), v.conductor ?? 'SIN CONDUCTOR', v.placa_tracto ?? '', v.placa_remolque ?? '', v.rutas_list || v.ruta || '',
            n(v.peso_ida) / 1000, n(v.peso_retorno) / 1000, n(v.peso_total_rutas || v.peso) / 1000, v.ordenes_list ?? '']));
      } else {
        await exportarExcel('Ordenes-de-viaje-Marsisa-rutas', 'Órdenes y rutas',
          ['Viaje', 'N° orden serv.', 'Tramo', 'Tracto', 'Carreta', 'Conductor', 'Ruta despachada', 'Tipo de servicio', 'Peso carga (TN)', 'Estado'],
          visiblesRutas.map(r => [r.viaje, r.orden ?? '', Number(r.es_retorno) === 1 ? 'RETORNO' : 'IDA', r.placa_tracto ?? '', r.placa_remolque ?? '', r.conductor ?? '',
            r.ruta ?? '', r.tipo_servicio ?? 'ESTÁNDAR', n(r.peso_total) / 1000, estadoTexto(r.estado)]));
      }
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  function abrirViaje(viaje: string) {
    haptic('selection');
    setAbierto(viajes.find(v => v.viaje === viaje) ?? null);
  }

  const placa = (p: string | null) => (p ? <LicensePlate plate={p} size="sm" /> : <span style={{ color: 'var(--label-3)' }}>—</span>);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones · Marsisa"
        title="Órdenes de viaje y rutas"
        subtitle={cargando ? 'Cargando…' : `${kpis.viajes} viajes · ${kpis.ordenes} órdenes de servicio`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${total} ${modo === 'viajes' ? 'viajes' : 'órdenes'}`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('operaciones/marsisa-ordenes-viaje') },
            ]} />
            {can('op_ordenes_viaje.editar', 'op_ordenes_viaje.crear', 'op_programacion.editar') && (
              <Button variant="primary" icon={<RefreshCw size={16} />} onClick={sincronizar} loading={sync}>Sincronizar</Button>
            )}
          </>
        }
      />

      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num">{kpis.viajes.toLocaleString('es-PE')}</span><span className="inv-metrica__label">Viajes registrados</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{kpis.ordenes.toLocaleString('es-PE')}</span><span className="inv-metrica__label">Órdenes de servicio</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{(kpis.ida / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} TN</span><span className="inv-metrica__label">Carga ida</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num">{(kpis.retorno / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} TN</span><span className="inv-metrica__label">Carga retorno</span></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SegmentedControl label="Vista" value={modo} onChange={cambiarFiltro(setModo)} options={[{ value: 'viajes', label: 'Por viaje' }, { value: 'rutas', label: 'Por O/S y ruta' }]} />
          <TextInput placeholder="N° de viaje" value={fViaje} onChange={e => cambiarFiltro(setFViaje)(e.target.value)} style={{ width: 170 }} />
          <SearchField value={busqueda} onChange={cambiarFiltro(setBusqueda)} placeholder="Buscar orden, placa, conductor o ruta…" />
          <SelectInput value={tramo} onChange={e => cambiarFiltro(setTramo)(e.target.value as Tramo)} style={{ width: 170 }}>
            <option value="TODOS">Ida y retorno</option>
            <option value="SOLO_IDA">Solo ida</option>
            <option value="SOLO_RETORNO">Solo retorno</option>
          </SelectInput>
          <Button variant="secondary" icon={<Route size={15} />} onClick={limpiar}>Limpiar</Button>
        </div>

        {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : total === 0 ? (
          <EmptyState icon={q || fv || tramo !== 'TODOS' ? <SearchX size={22} /> : <Truck size={22} />} title={q || fv || tramo !== 'TODOS' ? 'Sin coincidencias' : 'Sin órdenes de viaje'}>
            {q || fv || tramo !== 'TODOS' ? <button type="button" className="placas-limpiar" onClick={limpiar}>Quitar filtros</button> : <>Usa <strong>Sincronizar</strong> para traer las órdenes de Marsisa.</>}
          </EmptyState>
        ) : modo === 'viajes' ? (
          <TablaRedimensionable id="marsisa-ordenes-viaje" columnas={COLUMNAS_VIAJES} ariaLabel="Órdenes de viaje Marsisa" altoMax="62vh">
            {pagViajes.map(v => {
              const rutaTexto = v.rutas_list || v.ruta || 'Sin rutas registradas';
              const cant = n(v.cant_ordenes);
              return (
                <tr key={v.viaje} onClick={() => abrirViaje(v.viaje)} style={{ cursor: 'pointer' }}>
                  <Celda mono>{v.viaje}</Celda>
                  <Celda>{fechaClasico(v.fecha_viaje)}</Celda>
                  <Celda>{placa(v.placa_tracto)}</Celda>
                  <Celda>{placa(v.placa_remolque)}</Celda>
                  <Celda>{v.conductor || 'Sin conductor'}</Celda>
                  <Celda>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minWidth: 0 }}>
                      {cant > 0 && <Badge tone="accent">{cant} O/S</Badge>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--label-2)' }}>{rutaTexto}</span>
                    </div>
                  </Celda>
                  <Celda alinear="right" mono>{TN(n(v.peso_ida))}</Celda>
                  <Celda alinear="right" mono>{TN(n(v.peso_retorno))}</Celda>
                  <Celda alinear="right" mono>{TN(n(v.peso_total_rutas || v.peso))}</Celda>
                  <Celda alinear="center"><Badge tone={toneDeEstado(v.estado)}>{estadoTexto(v.estado)}</Badge></Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        ) : (
          <TablaRedimensionable id="marsisa-ordenes-viaje-rutas" columnas={COLUMNAS_RUTAS} ariaLabel="Órdenes de servicio y rutas Marsisa" altoMax="62vh">
            {pagRutas.map(r => {
              const retorno = Number(r.es_retorno) === 1;
              return (
                <tr key={`${r.id}-${r.orden}`} onClick={() => abrirViaje(r.viaje)} style={{ cursor: 'pointer' }}>
                  <Celda mono>{r.viaje}</Celda>
                  <Celda mono>{r.orden || '—'}</Celda>
                  <Celda alinear="center"><Badge tone={retorno ? 'amber' : 'accent'}>{retorno ? 'RETORNO' : 'IDA'}</Badge></Celda>
                  <Celda>{placa(r.placa_tracto)}</Celda>
                  <Celda>{placa(r.placa_remolque)}</Celda>
                  <Celda>{r.conductor || '—'}</Celda>
                  <Celda>{r.ruta || '—'}</Celda>
                  <Celda>{r.tipo_servicio || 'ESTÁNDAR'}</Celda>
                  <Celda alinear="right" mono>{TN(n(r.peso_total))}</Celda>
                  <Celda alinear="center"><Badge tone={toneDeEstado(r.estado)}>{estadoTexto(r.estado)}</Badge></Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}

        {!cargando && !error && total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--label-2)' }}>
            <span>Mostrando {total.toLocaleString('es-PE')} {modo === 'viajes' ? 'viajes' : 'órdenes y rutas'} · página {pag} de {totalPaginas}</span>
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <Button variant="secondary" icon={<ChevronLeft size={15} />} disabled={pag <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="secondary" disabled={pag >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente <ChevronRight size={15} /></Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbierto(null)} title={abierto ? `Viaje ${abierto.viaje}` : ''} footer={<Button variant="secondary" onClick={() => setAbierto(null)}>Cerrar</Button>}>
        {abierto && (
          <div className="tarjeta__lista">
            {fila('Estado', abierto.estado)}{fila('Conductor', abierto.conductor)}{fila('Tracto', abierto.placa_tracto, true)}{fila('Remolque', abierto.placa_remolque, true)}
            {fila('Ruta', abierto.ruta)}{fila('Rutas', abierto.rutas_list)}{fila('Órdenes de servicio', abierto.ordenes_list)}
            {fila('Carga ida', TN(n(abierto.peso_ida)), true)}{fila('Carga retorno', TN(n(abierto.peso_retorno)), true)}
            {fila('Fecha del viaje', fechaClasico(abierto.fecha_viaje), true)}{fila('Inicio', abierto.fecha_inicio ? fechaClasico(abierto.fecha_inicio) : '', true)}{fila('Fin', abierto.fecha_fin ? fechaClasico(abierto.fecha_fin) : '', true)}
            {fila('Km inicial', abierto.kilometraje_inicial, true)}{fila('Km final', abierto.kilometraje_final, true)}{fila('Observaciones', abierto.observaciones)}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
