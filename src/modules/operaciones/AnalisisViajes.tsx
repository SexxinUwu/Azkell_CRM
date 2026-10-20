import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, Droplets, FileSpreadsheet, Fuel, RefreshCw, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { MatrizRendimientoSheet } from './MatrizRendimientoSheet';

interface Stats { kmInicio: number; kmFin: number; recorridoKm: number; totalGalones: number; totalGasto: number; rendimiento: number }
interface Voucher { id: number | string; fecha?: string; producto?: string; galones?: number; importe?: number; odometro?: number; estacion?: string; esPuntoPartida?: boolean }
interface Trip {
  viaje: string; placa: string; carreta: string; conductor: string; motor: string; marca: string; configuracion: string; ruta: string; rutaIda: string; rutaRetorno: string;
  ordenIda: string; ordenRetorno: string;
  estado: string; fechaInicio: string; fechaFin: string; kmInicio: number; kmFin: number; recorridoKm: number; odometroInconsistente: boolean;
  galonesIda: number; galonesRetorno: number; pesoIda: number; pesoRetorno: number; totalGalones: number; totalGasto: number; rendimiento: number;
  estadoAuditoria: string; observacionAuditoria: string; usuarioAuditoria?: string; vouchers: Voucher[]; fuelStats: Record<string, Stats>;
}
interface Resp { ok: boolean; trips: Trip[]; kpis: { totalViajes: number; totalGalones: number; totalGasto: number; totalKm: number; promGalViaje: number; promPrecioGal: number; promKmGal: number } }

const n = (v: unknown) => Number(v) || 0;
interface TelemetriaWialon {
  recorridoKmGps: number | null; combustibleConsumidoGps: number | null; rendimientoGps: number | null;
  velocidadMaxGps: number | null; rpmMediaGps: number | null; rpmMaxGps: number | null; horasMotorGps: number | null; consumoRalentiGps: number | null;
}

// Telemetría CAN Bus de Wialon para el periodo del viaje (de la primera a la última carga). Solo se consulta cuando se pide.
function useTelemetriaViaje(trip: Trip | null, habilitada: boolean) {
  const ini = useMemo(() => {
    if (!trip) return '';
    const fechas = (trip.vouchers ?? []).map(v => String(v.fecha ?? '')).filter(Boolean).sort();
    return fechas[0] || trip.fechaInicio;
  }, [trip]);
  const fin = useMemo(() => {
    if (!trip) return '';
    const fechas = (trip.vouchers ?? []).map(v => String(v.fecha ?? '')).filter(Boolean).sort();
    return fechas[fechas.length - 1] || trip.fechaFin;
  }, [trip]);
  return useQuery({
    queryKey: ['operaciones', 'wialon', trip?.viaje, trip?.placa, ini, fin],
    enabled: habilitada && !!trip?.placa,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const p = new URLSearchParams({ placa: trip!.placa, fechaInicio: ini, fechaFin: fin });
      const r = await api<{ ok?: boolean; data?: TelemetriaWialon; error?: string }>(`/combustible/wialon-telemetria?${p.toString()}`);
      if (!r.ok || !r.data) throw new Error(r.error || 'Sin telemetría para este viaje');
      return r.data;
    },
  });
}

function TelemetriaViaje({ trip }: { trip: Trip }) {
  const [pedida, setPedida] = useState(false);
  const q = useTelemetriaViaje(trip, pedida);
  const t = q.data;
  const dato = (label: string, valor: number | null | undefined, unidad: string) => (
    <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor dato__valor--mono">{valor == null ? '—' : `${fmt(valor, 1)} ${unidad}`}</span></div>
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="tarjeta__grupo-titulo">Telemetría Wialon (CAN Bus)</p>
        {!pedida && <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => setPedida(true)} disabled={!trip.placa}>Consultar</Button>}
      </div>
      {!pedida && <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Consulta el recorrido, consumo y RPM reportados por el GPS en las fechas del viaje.</span></div></div>}
      {pedida && q.isFetching && <div className="tarjeta__lista"><div className="dato"><span className="dato__valor">Consultando Wialon…</span></div></div>}
      {pedida && q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {t && (
        <div className="tarjeta__lista">
          {dato('Recorrido GPS', t.recorridoKmGps, 'km')}{dato('Combustible consumido', t.combustibleConsumidoGps, 'gl')}
          {dato('Rendimiento GPS', t.rendimientoGps, 'km/gl')}{dato('Consumo en ralentí', t.consumoRalentiGps, 'gl')}
          {dato('Velocidad máxima', t.velocidadMaxGps, 'km/h')}{dato('RPM media', t.rpmMediaGps, 'rpm')}{dato('RPM máxima', t.rpmMaxGps, 'rpm')}
          {dato('Horas de motor', t.horasMotorGps, 'h')}
        </div>
      )}
    </div>
  );
}

// Periodo del viaje en Wialon: de la primera a la última carga de sus vales
function rangoViaje(trip: Trip) {
  const fechas = (trip.vouchers ?? []).map(v => String(v.fecha ?? '')).filter(Boolean).sort();
  return { ini: fechas[0] || trip.fechaInicio, fin: fechas[fechas.length - 1] || trip.fechaFin };
}

// Telemetría de la página, por número de viaje (una sola consulta al servidor: ver `gps` en AnalisisViajes)
type LoteGps = Record<string, { data: TelemetriaWialon | null; error?: string }>;

// Valor de una celda GPS: '—' si el CAN está apagado, '…' mientras consulta, o el dato si llegó
function valorGps(activo: boolean, cargando: boolean, lote: LoteGps | undefined, viaje: string, campo: keyof TelemetriaWialon) {
  if (!activo) return '—';
  if (cargando) return '…';
  const x = lote?.[viaje]?.data?.[campo];
  return x == null ? '—' : fmt(x, 2);
}

const fmt = (v: unknown, d = 1) => n(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
// Soles con S/ y espacio no divisible, dos decimales
const soles = (v: unknown) => 'S/ ' + n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AUDIT = ['PENDIENTE', 'CONFORME', 'OBSERVADO'];
const colorAudit = (e: string) => ({ CONFORME: 'green', OBSERVADO: 'amber', PENDIENTE: 'gray' }[e] ?? 'gray');
const esUrea = (k: string) => /UREA|ADBLUE|DEF/.test(k.toUpperCase());
const TAMANOS = [25, 50, 100];

// Pastilla de color del tema (mismos tonos que el resto de la app)
function Pastilla({ color, children }: { color: string; children: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${color}-tint)`, color: `var(--${color}-ink)`, fontSize: '0.6875rem', fontWeight: 700 }}>
      {children}
    </span>
  );
}

// Operaciones › Análisis de combustible y de urea: rendimiento por viaje y auditoría.
export function AnalisisViajes({ producto }: { producto: 'combustible' | 'urea' }) {
  const urea = producto === 'urea';
  const { can, user, } = useAuth();
  const modulo = typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('marsisa') ? 'marsisa' : 'operaciones';
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [auditoria, setAuditoria] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [canActivo, setCanActivo] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(50);
  const toast = useToast();

  useEffect(() => { setPagina(1); }, [q, desde, hasta, auditoria, tamano]);

  const datos = useQuery<Resp>({
    queryKey: ['operaciones', 'analisis', modulo, q, desde, hasta],
    queryFn: () => {
      const p = new URLSearchParams({ modulo });
      if (q) p.set('search', q);
      if (desde) p.set('fecha_desde', desde);
      if (hasta) p.set('fecha_hasta', hasta);
      return api<Resp>(`/combustible/analisis-viajes?${p}`);
    },
    staleTime: 60_000,
  });

  // En urea solo cuentan los viajes con vales de urea, y las cifras son las de ese producto
  const trips = useMemo(() => {
    const todos = datos.data?.trips ?? [];
    if (!urea) return todos.filter(t => { const ks = Object.keys(t.fuelStats ?? {}); return ks.length === 0 || ks.some(k => !esUrea(k)); });
    return todos.filter(t => Object.keys(t.fuelStats ?? {}).some(esUrea));
  }, [datos.data, urea]);

  const cifras = (t: Trip) => {
    if (!urea) {
      const gal = Object.entries(t.fuelStats ?? {}).filter(([k]) => !esUrea(k)).reduce((s, [, v]) => s + n(v.totalGalones), 0) || t.totalGalones;
      return { galones: gal, gasto: t.totalGasto, rendimiento: t.rendimiento };
    }
    const u = Object.entries(t.fuelStats ?? {}).filter(([k]) => esUrea(k)).map(([, v]) => v);
    return { galones: u.reduce((s, v) => s + n(v.totalGalones), 0), gasto: u.reduce((s, v) => s + n(v.totalGasto), 0), rendimiento: u.length ? n(u[0].rendimiento) : 0 };
  };

  const visibles = useMemo(() => trips.filter(t => !auditoria || t.estadoAuditoria === auditoria), [trips, auditoria]);
  const paginas = Math.max(1, Math.ceil(visibles.length / tamano));
  const pagActual = Math.min(pagina, paginas);
  const pagina_ = useMemo(() => visibles.slice((pagActual - 1) * tamano, pagActual * tamano), [visibles, pagActual, tamano]);

  // CAN (GPS): los viajes de la página van en una sola petición; el servidor consulta Wialon en secuencia
  const lote = useMemo(() => pagina_.filter(x => x.placa).map((x, index) => {
    const r = rangoViaje(x);
    return { id: x.viaje, index, viaje: x.viaje, placa: x.placa, fechaInicio: r.ini, fechaFin: r.fin };
  }), [pagina_]);
  const gps = useQuery<LoteGps>({
    queryKey: ['operaciones', 'wialon-lote', lote],
    enabled: canActivo && !urea && lote.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await api<{ ok: boolean; results?: { id: string; data: TelemetriaWialon | null; error?: string }[]; error?: string }>('/combustible/wialon-telemetria-batch', { method: 'POST', body: { trips: lote } });
      if (!r.ok) throw new Error(r.error || 'No se pudo consultar Wialon');
      return Object.fromEntries((r.results ?? []).map(x => [String(x.id), { data: x.data, error: x.error }]));
    },
  });
  const resumen = useMemo(() => {
    const gal = visibles.reduce((s, t) => s + cifras(t).galones, 0);
    const gasto = visibles.reduce((s, t) => s + cifras(t).gasto, 0);
    const km = visibles.reduce((s, t) => s + n(t.recorridoKm), 0);
    return { gal, gasto, kmGal: gal > 0 && km > 0 ? km / gal : 0, pendientes: visibles.filter(t => t.estadoAuditoria === 'PENDIENTE').length };
  }, [visibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = trips.find(x => x.viaje === abierto) ?? null;
  const Icono = urea ? Droplets : Fuel;
  const [params, setParams] = useSearchParams();
  const [matriz, setMatriz] = useState(params.get('matriz') === '1');
  useEffect(() => { if (params.get('matriz')) setParams({}, { replace: true }); }, [params, setParams]);
  const puedeAuditar = can('combustible_analisis.editar', 'combustible.editar', 'urea_analisis.editar', 'combustible_analisis.crear');

  const columnas: ColumnaTabla[] = [
    { id: 'auditoria', titulo: 'Auditoría', ancho: 130, minimo: 110 },
    { id: 'viaje', titulo: 'N° viaje', ancho: 165, minimo: 130 },
    { id: 'placa', titulo: 'Placa', ancho: 100 },
    { id: 'carreta', titulo: 'Carreta', ancho: 100 },
    { id: 'estado', titulo: 'Estado', ancho: 120 },
    { id: 'motor', titulo: 'Motor', ancho: 100 },
    { id: 'ruta', titulo: 'Ruta / trayecto', ancho: 260, minimo: 140 },
    { id: 'conductor', titulo: 'Conductor', ancho: 220 },
    { id: 'peso', titulo: 'Peso (t)', ancho: 90, alinear: 'right' },
    { id: 'finicio', titulo: 'Fecha inicio', ancho: 150 },
    { id: 'ffin', titulo: 'Fecha fin', ancho: 150 },
    { id: 'kmini', titulo: 'Km inicio (vales)', ancho: 130, alinear: 'right' },
    { id: 'kmfin', titulo: 'Km fin (vales)', ancho: 130, alinear: 'right' },
    { id: 'recorrido', titulo: 'Recorrido (km)', ancho: 130, alinear: 'right' },
    { id: 'galones', titulo: urea ? 'Urea (gl)' : 'Galones', ancho: 105, alinear: 'right' },
    { id: 'gasto', titulo: 'Gasto (S/)', ancho: 120, alinear: 'right' },
    { id: 'rendimiento', titulo: 'Km/gl', ancho: 90, alinear: 'right' },
    { id: 'gps-recorrido', titulo: 'Recorrido GPS (km)', ancho: 140, alinear: 'right' },
    { id: 'gps-rendimiento', titulo: 'Rend. GPS (km/gl)', ancho: 140, alinear: 'right' },
  ];

  function onAlternarFila(viaje: string) {
    setExpandidos(prev => { const nx = new Set(prev); nx.has(viaje) ? nx.delete(viaje) : nx.add(viaje); return nx; });
  }

  async function exportar() {
    try {
      await exportarExcel(urea ? 'Analisis-urea' : 'Analisis-combustible', 'Viajes',
        ['Viaje', 'Estado', 'Placa', 'Conductor', 'Ruta', 'Inicio', 'Fin', 'Km recorridos', urea ? 'Urea (gl)' : 'Galones', 'Gasto', 'Rendimiento (km/gl)', 'Auditoría', 'Observación'],
        visibles.map(x => { const c = cifras(x); return [x.viaje, x.estado, x.placa, x.conductor, x.ruta, x.fechaInicio, x.fechaFin, n(x.recorridoKm), c.galones, c.gasto, c.rendimiento, x.estadoAuditoria, x.observacionAuditoria]; }));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title={urea ? 'Análisis de urea' : 'Análisis de combustible'}
        subtitle={datos.isLoading ? 'Cargando…' : `${visibles.length} viajes · ${resumen.pendientes} sin auditar`}
        actions={
          <MenuOtros opciones={[
            { label: 'Exportar Excel', detalle: `${visibles.length} viajes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ...(urea ? [] : [{ label: 'Matriz de rendimiento', icon: <Fuel size={17} />, separado: true, onSelect: () => setMatriz(true) }]),
            { label: 'Telemetría y auditoría avanzada', detalle: 'Se abre en la versión actual', icon: <ArrowUpRight size={17} />, separado: !urea, onSelect: () => abrirClasico(urea ? 'operaciones/urea-analisis' : 'operaciones/combustible-analisis') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num">{fmt(resumen.gal, 0)}</span><span className="inv-metrica__label">{urea ? 'Urea (gl)' : 'Galones'}</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{soles(resumen.gasto)}</span><span className="inv-metrica__label">Gasto</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{fmt(resumen.kmGal, 2)}</span><span className="inv-metrica__label">km por galón</span></div>
        </div>

        <SearchField value={busqueda} placeholder="Viaje, placa, ruta o conductor…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _anT?: number })._anT); (window as unknown as { _anT?: number })._anT = window.setTimeout(() => setQ(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectInput value={auditoria} onChange={e => setAuditoria(e.target.value)} aria-label="Auditoría" style={{ width: 'auto' }}>
            <option value="">Toda auditoría</option>{AUDIT.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          {!urea && (
            <Button variant={canActivo ? 'primary' : 'secondary'} icon={<RefreshCw size={15} />} onClick={() => { haptic('selection'); setCanActivo(a => !a); }}
              title="Consulta el recorrido y rendimiento que reporta el GPS (Wialon) para las filas de esta página">
              {canActivo ? 'CAN (GPS) activo' : 'Consultar CAN (GPS)'}
            </Button>
          )}
        </div>

        {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || auditoria || desde || hasta ? <SearchX size={22} /> : <Icono size={22} />} title={busqueda || auditoria ? 'Sin coincidencias' : 'Sin viajes para analizar'}>
            {urea ? 'Aparecen los viajes con vales de urea.' : 'Aparecen los viajes con vales de combustible.'}
          </EmptyState>
        ) : (
          <>
            {gps.isError && <Notice tone="error">{errorMessage(gps.error)}</Notice>}
            <TablaRedimensionable id={urea ? 'analisis-urea' : 'analisis-combustible'} columnas={columnas} ariaLabel={urea ? 'Análisis de urea por viaje' : 'Análisis de combustible por viaje'}>
              {pagina_.map(x => {
                const c = cifras(x);
                const abiertoFila = expandidos.has(x.viaje);
                const color = colorAudit(x.estadoAuditoria);
                return (
                  <FilaViaje key={x.viaje} abierta={abiertoFila} onAbrir={() => { haptic('selection'); setAbierto(x.viaje); }}
                    seleccionada={abierto === x.viaje} rutaIda={x.rutaIda} rutaRetorno={x.rutaRetorno} galonesIda={x.galonesIda} galonesRetorno={x.galonesRetorno}
                    pesoIda={x.pesoIda} pesoRetorno={x.pesoRetorno} ordenIda={x.ordenIda} ordenRetorno={x.ordenRetorno} ancho={columnas.length}
                    celdas={
                      <>
                        <Celda><Pastilla color={color}>{x.estadoAuditoria}</Pastilla>{x.odometroInconsistente && <AlertTriangle size={14} style={{ marginLeft: 6, color: 'var(--red-ink)', verticalAlign: 'middle' }} />}</Celda>
                        <Celda mono>
                          <button type="button" aria-expanded={abiertoFila} aria-label={`Ver ida y retorno del viaje ${x.viaje}`}
                            onClick={e => { e.stopPropagation(); onAlternarFila(x.viaje); }}
                            style={{ background: 'none', border: 0, padding: 0, marginRight: 4, cursor: 'pointer', color: 'var(--label-2)', verticalAlign: 'middle' }}>
                            {abiertoFila ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          {x.viaje}
                        </Celda>
                        <Celda mono>{x.placa || '—'}</Celda>
                        <Celda mono>{x.carreta || '—'}</Celda>
                        <Celda><Pastilla color={x.estado === 'FINALIZADO' ? 'blue' : 'gray'}>{x.estado || '—'}</Pastilla></Celda>
                        <Celda mono>{x.motor || '—'}</Celda>
                        <Celda>{x.rutaIda || x.ruta || '—'}</Celda>
                        <Celda>{x.conductor || '—'}</Celda>
                        <Celda alinear="right" mono>{fmt(x.pesoIda, 2)}</Celda>
                        <Celda mono>{x.fechaInicio || '—'}</Celda>
                        <Celda mono>{x.fechaFin || '—'}</Celda>
                        <Celda alinear="right" mono>{fmt(x.kmInicio, 1)}</Celda>
                        <Celda alinear="right" mono>{fmt(x.kmFin, 1)}</Celda>
                        <Celda alinear="right" mono>{fmt(x.recorridoKm, 1)}</Celda>
                        <Celda alinear="right" mono>{fmt(c.galones, 2)}</Celda>
                        <Celda alinear="right" mono>{soles(c.gasto)}</Celda>
                        <Celda alinear="right" mono>{c.rendimiento > 0 ? fmt(c.rendimiento, 2) : '—'}</Celda>
                        <Celda alinear="right" mono>{valorGps(canActivo, gps.isFetching, gps.data, x.viaje, 'recorridoKmGps')}</Celda>
                        <Celda alinear="right" mono>{valorGps(canActivo, gps.isFetching, gps.data, x.viaje, 'rendimientoGps')}</Celda>
                      </>
                    } />
                );
              })}
            </TablaRedimensionable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
              <span className="t-footnote c-secondary">Mostrando {(pagActual - 1) * tamano + 1} a {Math.min(pagActual * tamano, visibles.length)} de {visibles.length} viajes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <SelectInput value={String(tamano)} onChange={e => setTamano(Number(e.target.value))} aria-label="Viajes por página" style={{ width: 'auto' }}>
                  {TAMANOS.map(s => <option key={s} value={s}>{s} por página</option>)}
                </SelectInput>
                <Button variant="secondary" disabled={pagActual <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button>
                <span className="t-footnote c-secondary">{pagActual} / {paginas}</span>
                <Button variant="secondary" disabled={pagActual >= paginas} onClick={() => setPagina(p => Math.min(paginas, p + 1))}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </div>

      <DetalleViaje trip={t} urea={urea} puedeAuditar={puedeAuditar} modulo={modulo} usuario={user?.name ?? ''} onClose={() => setAbierto(null)} cifras={cifras} />
      <MatrizRendimientoSheet open={matriz} onClose={() => setMatriz(false)} puedeEditar={puedeAuditar} />
    </Page>
  );
}

// Fila del viaje + su desglose de ida y retorno (se despliega con la flecha)
function FilaViaje({ abierta, onAbrir, seleccionada, rutaIda, rutaRetorno, galonesIda, galonesRetorno, pesoIda, pesoRetorno, ordenIda, ordenRetorno, ancho, celdas }: {
  abierta: boolean; onAbrir: () => void; seleccionada: boolean; rutaIda: string; rutaRetorno: string; galonesIda: number; galonesRetorno: number;
  pesoIda: number; pesoRetorno: number; ordenIda: string; ordenRetorno: string; ancho: number; celdas: ReactNode;
}) {
  return (
    <>
      <tr className={`tabla-redim__fila--click${seleccionada ? ' tabla-redim__fila--sel' : ''}`} onClick={onAbrir}>
        {celdas}
      </tr>
      {abierta && (
        <>
          <tr className="tabla-redim__sub">
            <td colSpan={ancho}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--label)' }}>Ida</span>
                {rutaIda || '—'} · {fmt(pesoIda, 2)} t · {fmt(galonesIda, 2)} gl{ordenIda ? ` · OS ${ordenIda}` : ''}
              </span>
            </td>
          </tr>
          <tr className="tabla-redim__sub">
            <td colSpan={ancho}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--label)' }}>Retorno</span>
                {rutaRetorno || '—'} · {fmt(pesoRetorno, 2)} t · {fmt(galonesRetorno, 2)} gl{ordenRetorno ? ` · OS ${ordenRetorno}` : ''}
              </span>
            </td>
          </tr>
        </>
      )}
    </>
  );
}

function DetalleViaje({ trip: t, urea, puedeAuditar, modulo, usuario, onClose, cifras }: {
  trip: Trip | null; urea: boolean; puedeAuditar: boolean; modulo: string; usuario: string; onClose: () => void;
  cifras: (t: Trip) => { galones: number; gasto: number; rendimiento: number };
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [estado, setEstado] = useState('PENDIENTE');
  const [obs, setObs] = useState('');
  useEffect(() => { if (t) { setEstado(t.estadoAuditoria || 'PENDIENTE'); setObs(t.observacionAuditoria || ''); } }, [t?.viaje]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = useMutation({
    mutationFn: () => api<{ ok?: boolean; error?: string }>(`/combustible/auditar-viaje?modulo=${modulo}`, {
      method: 'POST', body: { viaje: t?.viaje, estado_auditoria: estado, observacion: obs, usuario },
    }),
    onSuccess: async r => {
      if (r.ok === false) { toast(r.error || 'No se pudo guardar', 'error'); return; }
      haptic('success'); toast('Auditoría guardada');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'analisis'] });
    },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  if (!t) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const c = cifras(t);
  const vales = (t.vouchers ?? []).filter(v => !v.esPuntoPartida && (urea ? esUrea(String(v.producto ?? '')) : !esUrea(String(v.producto ?? ''))));
  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Sheet open onClose={onClose} title={`Viaje ${t.viaje}`} footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {t.odometroInconsistente && <Notice tone="error" icon={<AlertTriangle size={16} />}>El odómetro final es menor que el inicial: revisa los vales de este viaje.</Notice>}
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num">{fmt(c.galones, 1)}</span><span className="inv-metrica__label">Galones</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{soles(c.gasto)}</span><span className="inv-metrica__label">Gasto</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{fmt(c.rendimiento, 2)}</span><span className="inv-metrica__label">km/gl</span></div>
        </div>
        <div className="tarjeta__lista">
          {fila('Estado del viaje', t.estado)}{fila('Placa', t.placa, true)}{fila('Conductor', t.conductor)}{fila('Motor / marca', [t.motor, t.marca].filter(Boolean).join(' · '))}
          {fila('Ruta de ida', t.rutaIda)}{fila('Ruta de retorno', t.rutaRetorno)}{fila('Recorrido', `${fmt(t.recorridoKm, 0)} km (${fmt(t.kmInicio, 0)} → ${fmt(t.kmFin, 0)})`, true)}
          {fila('Peso ida / retorno', `${fmt(t.pesoIda, 1)} / ${fmt(t.pesoRetorno, 1)} t`)}{fila('Galones ida / retorno', `${fmt(t.galonesIda, 1)} / ${fmt(t.galonesRetorno, 1)}`)}
          {fila('Periodo', `${t.fechaInicio} → ${t.fechaFin}`, true)}
        </div>

        {!urea && <TelemetriaViaje trip={t} />}

        {vales.length > 0 && (
          <div>
            <p className="tarjeta__grupo-titulo">Vales del viaje ({vales.length})</p>
            <div className="tarjeta__lista">
              {vales.map(v => (
                <div key={String(v.id)} className="dato">
                  <span className="dato__label">{String(v.fecha ?? '').slice(0, 16)} · {v.estacion || 'Sin estación'}</span>
                  <span className="dato__valor">{fmt(v.galones, 2)} gl · {soles(v.importe)}{v.odometro ? ` · ${fmt(v.odometro, 0)} km` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <p className="tarjeta__grupo-titulo">Auditoría</p>
          <Field label="Resultado">
            {p => <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)} disabled={!puedeAuditar}>{AUDIT.map(a => <option key={a} value={a}>{a}</option>)}</SelectInput>}
          </Field>
          <Field label="Observación" hint={t.usuarioAuditoria ? `Última revisión: ${t.usuarioAuditoria}` : undefined}>
            {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} disabled={!puedeAuditar} />}
          </Field>
          {puedeAuditar && <Button variant="primary" onClick={() => guardar.mutate()} loading={guardar.isPending}>Guardar auditoría</Button>}
        </div>
      </div>
    </Sheet>
  );
}
