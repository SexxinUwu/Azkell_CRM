import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Droplets, FileSpreadsheet, Fuel, RefreshCw, SearchX, SlidersHorizontal, Pencil } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import '../../core/ui/acciones-iconos.css';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { ADMIN } from '../../core/auth/permisos';
import { claveFila, encolarCan, pedirCan, useCanViajes, type EstadoCan, type ItemCan } from './canLote';
import { PanelCan } from './PanelCan';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { FILTROS_ANALISIS_VACIOS, FiltrosAnalisisSheet, cuentaFiltrosAnalisis, dentroDeRango, normalizarBusqueda, type FiltrosAnalisis, type OpcionesFiltro } from './FiltrosAnalisisSheet';
import { analizarViaje, coincideCombustible, type AnalisisViaje, type MatrizCalc, type TramoCalc, type ViajeCalc } from './analisisCalculo';

interface Stats { fechaInicio?: string; fechaFin?: string; vouchers?: Voucher[]; kmInicio: number; kmFin: number; recorridoKm: number; totalGalones: number; totalGasto: number; rendimiento: number }
interface Voucher { conductor?: string; id: number | string; fecha?: string; producto?: string; galones?: number; importe?: number; odometro?: number; estacion?: string; esPuntoPartida?: boolean; tipo?: string; peso?: number }
interface Trip {
  viaje: string; placa: string; carreta: string; conductor: string; motor: string; marca: string; configuracion: string; ruta: string; rutaIda: string; rutaRetorno: string;
  pesoMaxTn: number;
  ordenIda: string; ordenRetorno: string;
  estado: string; fechaInicio: string; fechaFin: string; kmInicio: number; kmFin: number; recorridoKm: number; odometroInconsistente: boolean;
  galonesIda: number; galonesRetorno: number; pesoIda: number; pesoRetorno: number; totalGalones: number; totalGasto: number; rendimiento: number;
  estadoAuditoria: string; observacionAuditoria: string; usuarioAuditoria?: string; vouchers: Voucher[]; fuelStats: Record<string, Stats>;
}
interface Resp { ok: boolean; trips: Trip[]; kpis: { totalViajes: number; totalGalones: number; totalGasto: number; totalKm: number; promGalViaje: number; promPrecioGal: number; promKmGal: number } }

const n = (v: unknown) => Number(v) || 0;
// Mismos valores que muestra la tabla, para que los filtros coincidan con lo que se ve
const valorFiltro = (s: unknown) => String(s ?? '').trim() || '---';
const estadoDe = (t: Trip) => String(t.estado || 'INICIADO').toUpperCase();
// 'AAAA-MM-DD[ HH:mm[:ss]]' (hora local) -> fecha nativa de Excel; si no es fecha queda el texto
const fechaExcel = (s?: string | null): Date | string => {
  const m = /^(d{4})-(d{2})-(d{2})(?:[ T](d{2}):(d{2})(?::(d{2}))?)?/.exec(String(s ?? '').trim());
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))) : (s || '---');
};
export interface TelemetriaWialon {
  recorridoKmGps: number | null; combustibleConsumidoGps: number | null; rendimientoGps: number | null;
  velocidadMaxGps: number | null; rpmMediaGps: number | null; rpmMediaMaxGps?: number | null; rpmMaxGps: number | null; rpmMaxMaxGps?: number | null; horasMotorGps: string | number | null; consumoRalentiGps: number | null;
}

// Telemetría CAN Bus de Wialon para el periodo del viaje (de la primera a la última carga). Solo se consulta cuando se pide.
function useTelemetriaViaje(trip: Trip | null, habilitada: boolean) {
  const { ini, fin } = useMemo(() => (trip ? rangoViaje(trip) : { ini: '', fin: '' }), [trip]);
  return useQuery({
    queryKey: ['operaciones', 'wialon', trip?.viaje, trip?.placa, ini, fin],
    enabled: habilitada && !!trip?.placa,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => encolarCan(signal, () => pedirCan({ viaje: trip!.viaje, placa: trip!.placa, ini, fin })),
  });
}

function TelemetriaViaje({ trip, pedida, setPedida, q }: { trip: Trip; pedida: boolean; setPedida: (v: boolean) => void; q: ReturnType<typeof useTelemetriaViaje> }) {
  const t = q.data;
  const dato = (label: string, valor: number | string | null | undefined, unidad: string) => (
    <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor dato__valor--mono">{valor == null ? '—' : typeof valor === 'string' ? `${valor} ${unidad}` : `${fmt(valor, 1)} ${unidad}`}</span></div>
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

// Periodo del viaje en Wialon, igual que el clásico (_caGetTripDates): primero las fechas del viaje del servidor;
// solo si faltan, la primera y la última carga de sus vales (ordenadas por fecha real)
function rangoViaje(trip: Trip) {
  const sinFecha = (f?: string | null) => !f || f === 'N/D' || f === '---';
  let ini = trip.fechaInicio;
  let fin = trip.fechaFin;
  if (sinFecha(ini)) {
    const vales = (trip.vouchers ?? []).filter(v => v.fecha).sort((a, b) => new Date(String(a.fecha)).getTime() - new Date(String(b.fecha)).getTime());
    if (vales.length) {
      ini = String(vales[0].fecha);
      fin = String(vales[vales.length - 1].fecha);
    }
  }
  return { ini: ini || trip.fechaInicio, fin: fin || trip.fechaFin };
}

// Telemetría de la página, por número de viaje (una sola consulta al servidor: ver `gps` en AnalisisViajes)
type LoteGps = Record<string, { data: TelemetriaWialon | null; error?: string; estado: EstadoCan }>;

// Valor de una celda GPS: '—' si el CAN está apagado, '…' mientras consulta, o el dato si llegó
function valorGps(activo: boolean, lote: LoteGps | undefined, viaje: string, campo: keyof TelemetriaWialon) {
  if (!activo) return '—';
  const fila = lote?.[viaje];
  if (!fila || fila.estado === 'cargando') return '…';
  if (fila.estado === 'error') return 'Error';
  // Wialon no devolvió datos para esta placa: se avisa en vez de dejar guiones sin explicación
  if (!fila.data) return 'Sin datos';
  const x = fila.data[campo];
  if (x == null) return '—';
  // Las horas de motor vienen como texto desde Wialon; formatearlas como número las mostraría como 0,00
  return campo === 'horasMotorGps' ? String(x) : fmt(x, 2);
}

const fmt = (v: unknown, d = 1) => n(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
// Soles con S/ y espacio no divisible, dos decimales
const soles = (v: unknown) => 'S/ ' + n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AUDIT = ['PENDIENTE', 'CONFORME', 'OBSERVADO'];
const colorAudit = (e: string) => ({ CONFORME: 'green', OBSERVADO: 'amber', PENDIENTE: 'gray' }[e] ?? 'gray');
// Mismas reglas que _caIsFuelMatch del clásico (ver coincideCombustible)
const esUrea = (k: string) => coincideCombustible(k, 'UREA');
const esD2 = (k: string) => coincideCombustible(k, 'D2');
const TAMANOS = [25, 50, 100];
// Un viaje de más de este recorrido se considera odómetro mal digitado (ningún viaje real llega a eso)
const LIMITE_KM_VIAJE = 3000;

// Tarjeta de indicador de la cabecera
function KpiCard({ titulo, valor, detalle, color }: { titulo: string; valor: string; detalle: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96, maxWidth: 230, flex: '0 1 auto' }}>
      <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>{titulo}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 800, color: color ?? 'var(--label)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{valor}</span>
      <span style={{ fontSize: '0.6875rem', lineHeight: 1.3, color: 'var(--label-2)' }}>{detalle}</span>
    </div>
  );
}

// Un solo card con lo gastado de más (rojo) y lo ahorrado (verde) contra la matriz, en galones
function CardContraMatriz({ exceso, ahorro, viajesExceso, viajesAhorro }: { exceso: number; ahorro: number; viajesExceso: number; viajesAhorro: number }) {
  const mitad = (etiqueta: string, valor: string, color: string, detalle: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>{etiqueta}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{valor}</span>
      <span style={{ fontSize: '0.6875rem', color: 'var(--label-2)' }}>{detalle}</span>
    </div>
  );
  const viajes = (k: number) => `${k} ${k === 1 ? 'viaje' : 'viajes'}`;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-3)', display: 'flex', gap: 'var(--s-3)', flex: '0 0 auto' }}
      title="Suma de las diferencias en verde y en rojo de la tabla, contra el teórico de la matriz">
      {mitad('De más', `+${fmt(exceso, 2)} gl`, 'var(--red-ink)', viajes(viajesExceso))}
      <div style={{ width: 1, background: 'var(--separator)', alignSelf: 'stretch' }} />
      {mitad('Ahorrado', `−${fmt(ahorro, 2)} gl`, 'var(--green-ink)', viajes(viajesAhorro))}
    </div>
  );
}

// Meta de cumplimiento de la revisión: 95 % por defecto, editable desde el card y guardada en este navegador
const META_REVISION_CLAVE = 'fleet_meta_revision';
const META_REVISION_DEFECTO = 95;
function leerMetaRevision() {
  try {
    const v = Number(localStorage.getItem(META_REVISION_CLAVE));
    return Number.isFinite(v) && v >= 1 && v <= 100 ? v : META_REVISION_DEFECTO;
  } catch { return META_REVISION_DEFECTO; }
}

// Cumplimiento de la revisión: % de viajes revisados (conforme u observado) contra la meta.
// La barra se lee de izquierda a derecha (verde conforme, ámbar observado, gris pendiente) y la marca vertical es la meta.
function CardCumplimiento({ conformes, observados, pendientes }: { conformes: number; observados: number; pendientes: number }) {
  const [meta, setMeta] = useState(leerMetaRevision);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const total = conformes + observados + pendientes;
  const revisados = conformes + observados;
  const pct = total > 0 ? (revisados / total) * 100 : 0;
  const cumple = total > 0 && pct >= meta;
  // Viajes que faltan por revisar para llegar a la meta
  const faltan = Math.max(0, Math.ceil((meta / 100) * total - 1e-9) - revisados);
  const color = total === 0 ? 'var(--label-2)' : cumple ? 'var(--green-ink)' : pct >= meta - 15 ? 'var(--amber-ink)' : 'var(--red-ink)';

  function guardarMeta() {
    const v = Math.round(Number(borrador.replace(',', '.')));
    if (Number.isFinite(v) && v >= 1 && v <= 100) {
      setMeta(v);
      try { localStorage.setItem(META_REVISION_CLAVE, String(v)); } catch { /* sin almacenamiento: queda solo en esta sesión */ }
    }
    setEditando(false);
  }
  const tramo = (n: number, c: string) => (n > 0 ? <div style={{ width: `${(n / total) * 100}%`, background: c }} /> : null);
  const dato = (n: number, texto: string, c: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{n} {texto}
    </span>
  );
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 260, flex: '1 1 300px' }}>
      <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>Cumplimiento de revisión</span>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color }}>
          {Math.round(pct)}% <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--label-2)', fontFamily: 'inherit' }}>{revisados} de {total} revisados</span>
        </span>
        {editando ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem', color: 'var(--label-2)' }}>
            Meta
            <input autoFocus inputMode="numeric" aria-label="Meta de cumplimiento en porcentaje" value={borrador}
              onChange={e => setBorrador(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={e => { if (e.key === 'Enter') guardarMeta(); if (e.key === 'Escape') setEditando(false); }}
              onBlur={guardarMeta}
              style={{ width: 44, padding: '1px 4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--separator)', borderRadius: 6, background: 'transparent', color: 'var(--label)' }} />%
          </span>
        ) : (
          <button type="button" title="Cambiar la meta" aria-label={`Meta ${meta}%, cambiar`} onClick={() => { setBorrador(String(meta)); setEditando(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--label-2)' }}>
            Meta {meta}% <Pencil size={11} />
          </button>
        )}
      </span>
      <div style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
        <div role="img" aria-label={`${conformes} conformes, ${observados} observados, ${pendientes} pendientes; meta ${meta}%`}
          style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--separator)' }}>
          {tramo(conformes, 'var(--green-ink)')}{tramo(observados, 'var(--amber-ink)')}{tramo(pendientes, 'var(--label-3)')}
        </div>
        <div aria-hidden style={{ position: 'absolute', left: `${meta}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, background: 'var(--label)', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color }}>
        {total === 0 ? 'Sin viajes' : cumple ? 'Meta cumplida' : `Faltan ${faltan} ${faltan === 1 ? 'viaje' : 'viajes'} por revisar para llegar a la meta`}
      </span>
      <span style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', fontSize: '0.6875rem', color: 'var(--label-2)' }}>
        {dato(conformes, 'conformes', 'var(--green-ink)')}{dato(observados, 'observados', 'var(--amber-ink)')}{dato(pendientes, 'pendientes', 'var(--label-3)')}
      </span>
    </div>
  );
}

// Pastilla de color del tema (mismos tonos que el resto de la app)
function Pastilla({ color, children }: { color: string; children: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${color}-tint)`, color: `var(--${color}-ink)`, fontSize: '0.6875rem', fontWeight: 700 }}>
      {children}
    </span>
  );
}

// Colores de encabezado del clásico: base oscura, teórico naranja y GPS celeste
const FONDO_BASE = '#1e293b';
const FONDO_TEORICO = '#ea580c';
const FONDO_GPS = '#0284c7';

// Encabezados del Excel del clásico (mismo orden)
const ENCABEZADOS_EXCEL = [
  'ESTADO AUDITORÍA', 'OBSERVACIÓN AUDITORÍA', 'N° VIAJE', 'PLACA', 'CARRETA', 'ESTADO', 'MOTOR', 'RUTA', 'CONDUCTOR', 'PESO (Tn)',
  'FECHA INICIO', 'FECHA FIN', 'KM INICIO (VALES)', 'KM FIN (VALES)', 'RECORRIDO (VALES)', 'TOTAL GALONES (REAL)', 'KM / GALÓN (REAL)',
  'TOTAL GASTO (S/)', 'KM TEÓRICO (MATRIZ)', 'GALONES TEÓRICOS (MATRIZ)', 'KM / GALÓN (TEÓRICO MATRIZ)', 'DIFERENCIA (GALONES)',
  'ESTADO CONSUMO', 'GALONES IDA', 'GALONES RETORNO', 'RECORRIDO (GPS CAN)', 'COMB. CONSUMIDO (GPS CAN)', 'RENDIMIENTO (GPS CAN)',
  'VELOCIDAD MÁXIMA (GPS)', 'CONSUMO PROMEDIO EN RALENTÍ (GAL/H)', 'RPM MEDIA (RPM)', 'RPM MEDIA (MÁXIMA RPM)', 'RPM MÁXIMA (RPM)', 'RPM MÁXIMA (MÁXIMA RPM)', 'HORAS DE MOTOR', 'CANTIDAD VALES',
];

// Diferencia contra la matriz: positivo (sobreconsumo) en rojo, negativo (ahorro) en verde
function Diferencia({ valor }: { valor: number | null }) {
  if (valor == null) return <>—</>;
  return <span style={{ color: valor > 0 ? 'var(--red-ink)' : 'var(--green-ink)', fontWeight: 700 }}>{valor > 0 ? '+' : ''}{fmt(valor, 2)}</span>;
}

const ptoDecimal = (v: number, d: number) => +v.toFixed(d);

const ORDENES = [
  { v: 'trip_desc', t: 'N° de viaje (más reciente)' }, { v: 'trip_asc', t: 'N° de viaje (más antiguo)' },
  { v: 'date_desc', t: 'Fecha (más reciente)' }, { v: 'date_asc', t: 'Fecha (más antigua)' },
  { v: 'gal_desc', t: 'Más galones' }, { v: 'cost_desc', t: 'Mayor gasto' },
];

// Guardado en vivo de la auditoría del viaje (POST /combustible/auditar-viaje, el mismo del clásico). Actualiza la tabla al instante.
function useGuardarAuditoria(modulo: string, usuario: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (p: { viaje: string; estado: string; obs: string }) => {
      const r = await api<{ ok?: boolean; error?: string }>(`/combustible/auditar-viaje?modulo=${modulo}`, {
        method: 'POST', body: { viaje: p.viaje, estado_auditoria: p.estado, observacion: p.obs, usuario },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la auditoría');
      return r;
    },
    onMutate: p => {
      qc.setQueriesData<Resp>({ queryKey: ['operaciones', 'analisis'] }, old => old && Array.isArray(old.trips)
        ? { ...old, trips: old.trips.map(t => t.viaje === p.viaje ? { ...t, estadoAuditoria: p.estado, observacionAuditoria: p.obs, usuarioAuditoria: usuario || t.usuarioAuditoria } : t) }
        : old);
    },
    onError: async err => { toast(errorMessage(err), 'error'); haptic('warning'); await qc.invalidateQueries({ queryKey: ['operaciones', 'analisis'] }); },
  });
}

// Observación que se guarda al salir del campo; se bloquea cuando el viaje está CONFORME (igual que el clásico)
function ObsInput({ viaje, estado, valor, puedeAuditar, onGuardar }: {
  viaje: string; estado: string; valor: string; puedeAuditar: boolean; onGuardar: (viaje: string, estado: string, obs: string) => Promise<unknown>;
}) {
  const [v, setV] = useState(valor);
  const [ok, setOk] = useState(false);
  useEffect(() => { setV(valor); }, [valor]);
  const { permissions } = useAuth();
  const bloqueado = !puedeAuditar || (estado === 'CONFORME' && !permissions.has(ADMIN));
  const guardar = async () => {
    if (bloqueado || v.trim() === (valor ?? '').trim()) return;
    try { await onGuardar(viaje, estado, v.trim()); setOk(true); window.setTimeout(() => setOk(false), 2000); } catch { /* el aviso lo da el hook */ }
  };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }} onClick={e => e.stopPropagation()}>
      <input type="text" value={v} readOnly={bloqueado} aria-label={`Observación del viaje ${viaje}`}
        placeholder={estado === 'OBSERVADO' ? 'Escribir motivo…' : 'Observación…'}
        onChange={e => setV(e.target.value)} onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: '0.8125rem', padding: '3px 8px', borderRadius: 8, border: '1px solid var(--separator)', background: bloqueado ? 'transparent' : 'var(--surface)', color: 'var(--label)', cursor: bloqueado ? 'not-allowed' : 'text' }} />
      {ok && <span style={{ fontSize: '0.6875rem', color: 'var(--green-ink)', fontWeight: 700 }}>Guardado</span>}
    </span>
  );
}

// Conciliación del viaje: lo despachado por vales frente a la matriz teórica y a la telemetría GPS, con las discrepancias señaladas
function Conciliacion({ t, a, galones, gps }: { t: Trip; a: AnalisisViaje | undefined; galones: number; gps: TelemetriaWialon | null }) {
  const g = (v: number | null | undefined) => (v == null ? null : Number(v));
  const kmVales = n(t.recorridoKm);
  const kmMatriz = a?.kmTeorico ?? 0;
  const kmGps = g(gps?.recorridoKmGps);
  const galMatriz = a?.galTeorico ?? 0;
  const galGps = g(gps?.combustibleConsumidoGps);
  const rendReal = galones > 0 && kmVales > 0 ? kmVales / galones : 0;
  const rendMatriz = a?.rendTeorico ?? 0;
  const rendGps = g(gps?.rendimientoGps);
  const difMatriz = galMatriz > 0 && galones > 0 ? galones - galMatriz : null;
  const difGps = galGps != null && galones > 0 ? galones - galGps : null;
  const difKmGps = kmGps != null && kmVales > 0 ? kmVales - kmGps : null;
  const sinOdo = (t.vouchers ?? []).filter(v => !v.esPuntoPartida && !n(v.odometro)).length;

  const alertas: { tono: 'error' | 'neutral'; texto: string }[] = [];
  if (t.odometroInconsistente) alertas.push({ tono: 'error', texto: 'Odómetro final menor al inicial: revisa los vales del viaje.' });
  if (kmVales > LIMITE_KM_VIAJE) alertas.push({ tono: 'error', texto: `Recorrido de ${fmt(kmVales, 0)} km por vales: supera ${fmt(LIMITE_KM_VIAJE, 0)} km, probable odómetro mal digitado.` });
  if (sinOdo > 0) alertas.push({ tono: 'neutral', texto: `${sinOdo} vale(s) sin odómetro: el recorrido por vales puede estar incompleto.` });
  if (a && galMatriz === 0) alertas.push({ tono: 'neutral', texto: 'La matriz no tiene consumo teórico para esta ruta, motor o peso: no se puede comparar.' });
  if (difMatriz != null && difMatriz > 0) alertas.push({ tono: 'error', texto: `Sobreconsumo sobre la matriz: +${fmt(difMatriz, 2)} gal.` });
  if (difMatriz != null && difMatriz < 0) alertas.push({ tono: 'neutral', texto: `Ahorro frente a la matriz: ${fmt(difMatriz, 2)} gal.` });
  if (a?.sinCarreta && galMatriz > 0) alertas.push({ tono: 'neutral', texto: 'Unidad sin carreta: el teórico ya lleva el descuento del 25%.' });

  const cel = (v: number | null, d: number) => (v == null || v === 0 ? '—' : fmt(v, d));
  const dif = (v: number | null) => (v == null ? '—' : <span style={{ color: v > 0 ? 'var(--red-ink)' : 'var(--green-ink)', fontWeight: 700 }}>{v > 0 ? '+' : ''}{fmt(v, 2)}</span>);
  const th: CSSProperties = { textAlign: 'right', padding: '4px 6px', fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--label-2)', fontWeight: 700 };
  const td: CSSProperties = { textAlign: 'right', padding: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', borderTop: '1px solid var(--separator)' };
  const tdL: CSSProperties = { ...td, textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 };
  const tramo = (nombre: string, x: TramoCalc) => (
    <tr key={nombre}>
      <td style={tdL}>{nombre}</td><td style={td}>{x.recorrido > 0 ? fmt(x.recorrido, 1) : '—'}</td>
      <td style={td}>{fmt(x.galones, 2)}</td><td style={td}>{x.galTeorico > 0 ? fmt(x.galTeorico, 2) : '—'}</td><td style={td}>{dif(x.diferencia)}</td>
    </tr>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <p className="tarjeta__grupo-titulo">Conciliación: vales, matriz y GPS</p>
      {alertas.map((al, i) => <Notice key={i} tone={al.tono} icon={al.tono === 'error' ? <AlertTriangle size={16} /> : undefined}>{al.texto}</Notice>)}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Concepto</th><th style={th}>Vales</th><th style={th}>Matriz</th><th style={th}>GPS</th><th style={th}>Vales − matriz</th><th style={th}>Vales − GPS</th></tr></thead>
          <tbody>
            <tr><td style={tdL}>Recorrido (km)</td><td style={td}>{cel(kmVales, 1)}</td><td style={td}>{cel(kmMatriz, 1)}</td><td style={td}>{cel(kmGps, 1)}</td>
              <td style={td}>{dif(kmMatriz > 0 && kmVales > 0 ? kmVales - kmMatriz : null)}</td><td style={td}>{dif(difKmGps)}</td></tr>
            <tr><td style={tdL}>Combustible (gal)</td><td style={td}>{cel(galones, 2)}</td><td style={td}>{cel(galMatriz, 2)}</td><td style={td}>{cel(galGps, 2)}</td>
              <td style={td}>{dif(difMatriz)}</td><td style={td}>{dif(difGps)}</td></tr>
            <tr><td style={tdL}>Rendimiento (km/gl)</td><td style={td}>{cel(rendReal, 2)}</td><td style={td}>{cel(rendMatriz, 2)}</td><td style={td}>{cel(rendGps, 2)}</td>
              <td style={td}>{dif(rendReal > 0 && rendMatriz > 0 ? rendReal - rendMatriz : null)}</td><td style={td}>{dif(rendReal > 0 && rendGps != null && rendGps > 0 ? rendReal - rendGps : null)}</td></tr>
          </tbody>
        </table>
      </div>
      {gps == null && <span className="t-footnote c-secondary">Consulta la telemetría Wialon para completar la columna GPS.</span>}
      {a && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Tramo</th><th style={th}>Recorrido km</th><th style={th}>Gal. real</th><th style={th}>Gal. teórico</th><th style={th}>Diferencia</th></tr></thead>
            <tbody>{tramo('Ida', a.ida)}{tramo('Retorno', a.retorno)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Operaciones › Análisis de combustible y de urea: rendimiento por viaje y auditoría.
export function AnalisisViajes({ producto }: { producto: 'combustible' | 'urea' }) {
  const urea = producto === 'urea';
  const { can, user, } = useAuth();
  const modulo = typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('marsisa') ? 'marsisa' : 'operaciones';
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  // Por defecto el análisis muestra solo el día de hoy (hora de Lima); para otro periodo se cambian las fechas
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [desde, setDesde] = useState(hoyLima);
  const [hasta, setHasta] = useState(hoyLima);
  const [filtros, setFiltros] = useState<FiltrosAnalisis>(FILTROS_ANALISIS_VACIOS);
  const [filtrando, setFiltrando] = useState(false);
  const hayFiltros = cuentaFiltrosAnalisis(filtros) > 0;
  const [orden, setOrden] = useState('trip_desc');
  const [abierto, setAbierto] = useState<string | null>(null); // clave de fila: viaje|placa
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [canActivo, setCanActivo] = useState(false);
  const [mostrarObs, setMostrarObs] = useState(false);
  const [ocultarSinViaje, setOcultarSinViaje] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(50);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => { setPagina(1); }, [q, desde, hasta, filtros, orden, tamano]);
  const guardarAud = useGuardarAuditoria(modulo, user?.name ?? '');
  const guardar = (viaje: string, estado: string, obs: string) => guardarAud.mutateAsync({ viaje, estado, obs });

  const datos = useQuery<Resp>({
    queryKey: ['operaciones', 'analisis', modulo],
    queryFn: () => api<Resp>(`/combustible/analisis-viajes?${new URLSearchParams({ modulo })}`),
    staleTime: 60_000,
  });

  // Matriz teórica (la misma que la pantalla de matriz): base de los cálculos de teórico por tramo
  const matrizQ = useQuery<MatrizCalc[]>({
    queryKey: ['operaciones', 'matriz'],
    enabled: !urea,
    queryFn: () => api<{ data?: MatrizCalc[] }>('/combustible/matriz').then(r => r.data ?? []),
    staleTime: 5 * 60_000,
  });
  const matriz = matrizQ.data ?? [];

  // En urea solo cuentan los viajes con vales de urea, y las cifras son las de ese producto
  // Como el clásico: un viaje entra si su fecha de inicio/fin se cruza con el rango; la búsqueda mira viaje, placa, ruta y conductor
  const trips = useMemo(() => {
    const todos = datos.data?.trips ?? [];
    const producto = urea ? todos.filter(t => Object.keys(t.fuelStats ?? {}).some(esUrea))
      : todos.filter(t => { const ks = Object.keys(t.fuelStats ?? {}); return ks.length === 0 || ks.some(esD2); });
    // La búsqueda ignora mayúsculas, espacios, guiones y puntos: "cfc-770" encuentra "CFC770"
    const normalizar = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.]/g, '');
    const buscado = normalizar(q);
    const vistos = new Set<string>();
    return producto.filter(t => {
      if (desde || hasta) {
        const ini = t.fechaInicio && t.fechaInicio !== 'N/D' ? t.fechaInicio.slice(0, 10) : '';
        const fin = t.fechaFin && t.fechaFin !== 'N/D' ? t.fechaFin.slice(0, 10) : '';
        const min = ini || fin, max = fin || ini;
        if (!min && !max) return false;
        if (desde && hasta && (max < desde || min > hasta)) return false;
        if (desde && !hasta && max < desde) return false;
        if (!desde && hasta && min > hasta) return false;
      }
      // Un mismo viaje llega repetido desde el servidor: se muestra una sola vez
      const clave = [t.viaje, t.placa, t.fechaInicio, t.fechaFin, t.totalGalones].join('|');
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      if (!buscado) return true;
      return [t.viaje, t.placa, t.carreta, t.ruta, t.conductor].some(x => normalizar(x).includes(buscado));
    });
  }, [datos.data, urea, desde, hasta, q]);

  // Como el clásico con el filtro D2: las cifras del viaje salen del bloque de diésel (fuelStats.D2) si lo tiene; tabla y Excel usan el mismo
  // Bloque de diésel del viaje, igual que el clásico: la clave puede ser D2 o el nombre del producto (p. ej. DIÉSEL B5)
  const bloqueD2 = (t: Trip): Stats | undefined => {
    if (urea) return undefined;
    // Orden del clásico: D2, luego DIÉSEL B5, luego cualquier clave de diésel
    return t.fuelStats?.D2 ?? t.fuelStats?.['DIÉSEL B5'] ?? Object.entries(t.fuelStats ?? {}).find(([k]) => esD2(k))?.[1];
  };
  const cifras = (t: Trip) => {
    if (!urea) {
      const d2 = bloqueD2(t);
      if (d2) return { galones: n(d2.totalGalones), gasto: n(d2.totalGasto), rendimiento: n(d2.rendimiento) };
      const gal = Object.entries(t.fuelStats ?? {}).filter(([k]) => esD2(k)).reduce((s, [, v]) => s + n(v.totalGalones), 0) || t.totalGalones;
      // Gasto solo de diésel (D2), igual que los galones: el de urea se ve en su propia pantalla
      const gasto = Object.entries(t.fuelStats ?? {}).filter(([k]) => esD2(k)).reduce((s, [, v]) => s + n(v.totalGasto), 0) || t.totalGasto;
      return { galones: gal, gasto, rendimiento: t.rendimiento };
    }
    const u = Object.entries(t.fuelStats ?? {}).filter(([k]) => esUrea(k)).map(([, v]) => v);
    return { galones: u.reduce((s, v) => s + n(v.totalGalones), 0), gasto: u.reduce((s, v) => s + n(v.totalGasto), 0), rendimiento: u.length ? n(u[0].rendimiento) : 0 };
  };

  // Cálculo por viaje y por tramo (IDA / RETORNO) con la misma lógica del clásico
  const analisis = useMemo(() => {
    const mapa = new Map<string, AnalisisViaje>();
    if (urea) return mapa;
    for (const x of trips) {
      const viaje: ViajeCalc = {
        ruta: x.ruta, rutaIda: x.rutaIda, rutaRetorno: x.rutaRetorno, motor: x.motor, configuracion: x.configuracion, carreta: x.carreta,
        pesoIda: x.pesoIda, pesoRetorno: x.pesoRetorno, pesoMaxTn: x.pesoMaxTn, kmInicio: x.kmInicio, kmFin: x.kmFin,
        vouchers: (x.vouchers ?? []).filter(v => esD2(String(v.producto ?? ''))),
      };
      mapa.set(claveFila(x), analizarViaje(viaje, matriz));
    }
    return mapa;
  }, [trips, matriz, urea]);

  // Opciones de los filtros: los valores que hay en los viajes ya filtrados por fecha y búsqueda
  const opciones = useMemo<OpcionesFiltro>(() => {
    const lista = (f: (t: Trip) => string) => [...new Set(trips.map(f))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
    return {
      auditoria: AUDIT, estados: lista(estadoDe), placas: lista(t => valorFiltro(t.placa)), carretas: lista(t => valorFiltro(t.carreta)),
      motores: lista(t => valorFiltro(t.motor)), rutas: lista(t => valorFiltro(t.ruta)), conductores: lista(t => valorFiltro(t.conductor)),
    };
  }, [trips]);

  // Orden de viaje: del más reciente al más antiguo; los "SIN-VIAJE" (vales sueltos) van al final
  // Diferencia del viaje (galones reales − teóricos); null si no hay teórico o galones
  const difDe = (t: Trip) => { const a = analisis.get(claveFila(t)); const gal = cifras(t).galones; return a && a.galTeorico > 0 && gal > 0 ? gal - a.galTeorico : null; };
  const visibles = useMemo(() => trips
    .filter(t => (!filtros.auditoria.length || filtros.auditoria.includes(t.estadoAuditoria)) && (!filtros.estados.length || filtros.estados.includes(estadoDe(t))))
    .filter(t => (!filtros.placas.length || filtros.placas.includes(valorFiltro(t.placa))) && (!filtros.carretas.length || filtros.carretas.includes(valorFiltro(t.carreta))))
    .filter(t => (!filtros.motores.length || filtros.motores.includes(valorFiltro(t.motor))) && (!filtros.rutas.length || filtros.rutas.includes(valorFiltro(t.ruta))))
    .filter(t => !filtros.conductores.length || filtros.conductores.includes(valorFiltro(t.conductor)))
    .filter(t => !filtros.viaje.trim() || normalizarBusqueda(t.viaje).includes(normalizarBusqueda(filtros.viaje)))
    .filter(t => dentroDeRango(n(t.pesoMaxTn), filtros.peso) && dentroDeRango(cifras(t).galones, filtros.galones))
    .filter(t => dentroDeRango(cifras(t).rendimiento, filtros.rendimiento) && dentroDeRango(cifras(t).gasto, filtros.gasto))
    .filter(t => dentroDeRango(difDe(t), filtros.diferencia))
    .filter(t => !ocultarSinViaje || !t.viaje.startsWith('SIN-VIAJE'))
    .sort((a, b) => {
      const sinA = a.viaje.startsWith('SIN-VIAJE') ? 1 : 0;
      const sinB = b.viaje.startsWith('SIN-VIAJE') ? 1 : 0;
      if (sinA !== sinB) return sinA - sinB;
      switch (orden) {
        case 'trip_asc': return a.viaje.localeCompare(b.viaje, undefined, { numeric: true });
        case 'date_asc': return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
        case 'date_desc': return (b.fechaFin || '').localeCompare(a.fechaFin || '');
        case 'gal_desc': return n(b.totalGalones) - n(a.totalGalones);
        case 'cost_desc': return n(b.totalGasto) - n(a.totalGasto);
        default: return b.viaje.localeCompare(a.viaje, undefined, { numeric: true });
      }
    }), [trips, filtros, orden, ocultarSinViaje, analisis]); // eslint-disable-line react-hooks/exhaustive-deps
  const paginas = Math.max(1, Math.ceil(visibles.length / tamano));
  const pagActual = Math.min(pagina, paginas);
  const pagina_ = useMemo(() => visibles.slice((pagActual - 1) * tamano, pagActual * tamano), [visibles, pagActual, tamano]);

  // CAN (GPS): cada viaje de la página se consulta por separado y se guarda en caché (ver canLote.ts)
  const itemsCan = useMemo<ItemCan[]>(() => pagina_.filter(x => x.placa).map(x => {
    const r = rangoViaje(x);
    return { viaje: x.viaje, placa: x.placa, ini: r.ini, fin: r.fin };
  }), [pagina_]);
  const gps = useCanViajes(itemsCan, canActivo && !urea);
  const lote: LoteGps = gps.lote;
  // Como el clásico: el recorrido es el del bloque de diésel del viaje (urea, el general)
  const kmDelViaje = (t: Trip) => (urea ? n(t.recorridoKm) : n(bloqueD2(t)?.recorridoKm ?? t.recorridoKm));
  // Regla: las tarjetas son el reflejo exacto de los viajes visibles en la tabla (fechas, búsqueda, filtros y «ocultar compras sin viaje» incluidos)
  const resumen = useMemo(() => {
    const gal = visibles.reduce((s, t) => s + cifras(t).galones, 0);
    const gasto = visibles.reduce((s, t) => s + cifras(t).gasto, 0);
    // Km por galón solo con viajes de odómetro válido (un odómetro mal digitado infla el promedio) y con galones > 0
    const razonables = visibles.filter(t => !t.odometroInconsistente && kmDelViaje(t) > 0 && kmDelViaje(t) <= LIMITE_KM_VIAJE);
    const kmRazonables = razonables.reduce((s, t) => s + kmDelViaje(t), 0);
    // Un viaje sin galones no entra al cociente: sus km inflarían el rendimiento
    const conGalones = razonables.filter(t => cifras(t).galones > 0);
    const kmConGalones = conGalones.reduce((s, t) => s + kmDelViaje(t), 0);
    const galConKm = conGalones.reduce((s, t) => s + cifras(t).galones, 0);
    return { viajes: visibles.length, gal, gasto, km: kmRazonables, validos: razonables.length, galConKm, kmGal: galConKm > 0 ? kmConGalones / galConKm : 0, razonables: conGalones.length, pendientes: visibles.filter(t => t.estadoAuditoria === 'PENDIENTE').length, conformes: visibles.filter(t => t.estadoAuditoria === 'CONFORME').length, observados: visibles.filter(t => t.estadoAuditoria === 'OBSERVADO').length };
  }, [visibles, urea]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fila TOTAL de la tabla, como el clásico: suma todos los viajes visibles (no solo la página)
  const pie = useMemo(() => {
    let km = 0, gal = 0, kmTeo = 0, galTeo = 0, gpsGal = 0, gpsCon = 0;
    // Diferencia solo con los viajes que tienen teórico y galones (misma base que cada fila); separa lo gastado de más y lo ahorrado
    let exceso = 0, ahorro = 0, viajesExceso = 0, viajesAhorro = 0;
    for (const t of visibles) {
      gal += cifras(t).galones;
      km += kmDelViaje(t);
      const a = analisis.get(claveFila(t));
      if (a) { kmTeo += a.kmTeorico || 0; galTeo += a.galTeorico || 0; }
      const galViaje = cifras(t).galones;
      if (a && a.galTeorico > 0 && galViaje > 0) {
        const d = galViaje - a.galTeorico;
        if (d > 0) { exceso += d; viajesExceso++; } else if (d < 0) { ahorro -= d; viajesAhorro++; }
      }
      const gpsT = gps.lote[claveFila(t)]?.data;
      if (gpsT?.combustibleConsumidoGps != null && Number.isFinite(Number(gpsT.combustibleConsumidoGps))) {
        gpsGal += Number(gpsT.combustibleConsumidoGps);
        gpsCon++;
      }
    }
    return { km, gal, kmTeo, galTeo, gpsGal, gpsCon, exceso, ahorro, viajesExceso, viajesAhorro };
  }, [visibles, analisis, gps.lote, urea]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieCeldas: ReactNode[] = [
    <Celda key="aud">—</Celda>,
  ];
  if (mostrarObs) pieCeldas.push(<Celda key="obs">—</Celda>);
  pieCeldas.push(
    <Celda key="viaje"><strong>TOTAL</strong></Celda>,
    <Celda key="placa">—</Celda>,
    <Celda key="carreta">—</Celda>,
    <Celda key="estado">—</Celda>,
    <Celda key="motor">—</Celda>,
    <Celda key="ruta">—</Celda>,
    <Celda key="conductor">—</Celda>,
    <Celda key="peso">—</Celda>,
    <Celda key="finicio">—</Celda>,
    <Celda key="ffin">—</Celda>,
    <Celda key="kmini">—</Celda>,
    <Celda key="kmfin">—</Celda>,
    <Celda key="recorrido" alinear="right" mono>{pie.km > 0 ? fmt(pie.km, 1) : '—'}</Celda>,
    <Celda key="galones" alinear="right" mono><strong>{fmt(pie.gal, 2)}</strong></Celda>,
    <Celda key="rendimiento" alinear="right" mono>{resumen.kmGal > 0 ? fmt(resumen.kmGal, 2) : '—'}</Celda>,
    <Celda key="gasto" alinear="right" mono>—</Celda>,
  );
  if (!urea) {
    pieCeldas.push(
      <Celda key="kmteo" alinear="right" mono>{pie.kmTeo > 0 ? fmt(pie.kmTeo, 1) : '—'}</Celda>,
      <Celda key="galteo" alinear="right" mono>{pie.galTeo > 0 ? fmt(pie.galTeo, 2) : '—'}</Celda>,
      <Celda key="rendteo" alinear="right" mono>{pie.galTeo > 0 && pie.kmTeo > 0 ? fmt(pie.kmTeo / pie.galTeo, 2) : '—'}</Celda>,
      <Celda key="dif" alinear="right" mono><Diferencia valor={pie.galTeo > 0 && (pie.exceso > 0 || pie.ahorro > 0) ? pie.exceso - pie.ahorro : null} /></Celda>,
      <Celda key="gps-rec" alinear="right" mono>—</Celda>,
      <Celda key="gps-comb" alinear="right" mono>
        {pie.gpsCon > 0 ? <span title={`${pie.gpsCon} de ${visibles.length} viajes con dato GPS`}>{fmt(pie.gpsGal, 2)}</span> : '—'}
      </Celda>,
      <Celda key="gps-rend" alinear="right" mono>—</Celda>,
      <Celda key="gps-vel" alinear="right" mono>—</Celda>,
      <Celda key="gps-ral" alinear="right" mono>—</Celda>,
      <Celda key="gps-horas" alinear="right" mono>—</Celda>,
    );
  }

  const t = trips.find(x => claveFila(x) === abierto) ?? null;
  const Icono = urea ? Droplets : Fuel;
  const puedeAuditar = can('combustible_analisis.editar', 'combustible.editar', 'urea_analisis.editar', 'combustible_analisis.crear');
  // Un viaje CONFORME queda bloqueado para todos menos el administrador (el servidor también lo valida)
  const { permissions } = useAuth();
  const esAdmin = permissions.has(ADMIN);

  // Columnas en el orden del clásico: auditoría, viaje, placa, carreta, estado, motor, ruta, conductor, peso, fechas, vales,
  // teórico (naranja) y GPS (celeste)
  const columnas: ColumnaTabla[] = [
    { id: 'auditoria', titulo: 'Auditoría', ancho: 140, minimo: 110, fondo: FONDO_BASE },
  ];
  if (mostrarObs) columnas.push({ id: 'obs', titulo: 'Observación auditoría', ancho: 200, fondo: FONDO_BASE });
  columnas.push(
    { id: 'viaje', titulo: 'N° viaje', ancho: 165, minimo: 130, fondo: FONDO_BASE },
    { id: 'placa', titulo: 'Placa', ancho: 100, fondo: FONDO_BASE },
    { id: 'carreta', titulo: 'Carreta', ancho: 100, fondo: FONDO_BASE },
    { id: 'estado', titulo: 'Estado', ancho: 110, fondo: FONDO_BASE },
    { id: 'motor', titulo: 'Motor', ancho: 100, fondo: FONDO_BASE },
    { id: 'ruta', titulo: 'Ruta / trayecto', ancho: 260, minimo: 140, fondo: FONDO_BASE },
    { id: 'conductor', titulo: 'Conductor', ancho: 200, fondo: FONDO_BASE },
    { id: 'peso', titulo: 'Peso (Tn)', ancho: 90, alinear: 'right', fondo: FONDO_BASE },
    { id: 'finicio', titulo: 'Fecha inicio', ancho: 150, fondo: FONDO_BASE },
    { id: 'ffin', titulo: 'Fecha fin', ancho: 150, fondo: FONDO_BASE },
    { id: 'kmini', titulo: 'Km inicio (vales)', ancho: 130, alinear: 'right', fondo: FONDO_BASE },
    { id: 'kmfin', titulo: 'Km fin (vales)', ancho: 130, alinear: 'right', fondo: FONDO_BASE },
    { id: 'recorrido', titulo: 'Recorrido (vales)', ancho: 130, alinear: 'right', fondo: FONDO_BASE },
    { id: 'galones', titulo: urea ? 'Urea (gl)' : 'Total gal.', ancho: 105, alinear: 'right', fondo: FONDO_BASE },
    { id: 'rendimiento', titulo: 'Km/gal (real)', ancho: 120, alinear: 'right', fondo: FONDO_BASE },
    { id: 'gasto', titulo: 'Total (S/)', ancho: 120, alinear: 'right', fondo: FONDO_BASE },
  );
  if (!urea) {
    columnas.push(
      { id: 'kmteo', titulo: 'Km teórico', ancho: 115, alinear: 'right', fondo: FONDO_TEORICO },
      { id: 'galteo', titulo: 'Gal. teórico', ancho: 115, alinear: 'right', fondo: FONDO_TEORICO },
      { id: 'rendteo', titulo: 'Km/gal (teórico)', ancho: 135, alinear: 'right', fondo: FONDO_TEORICO },
      { id: 'dif', titulo: 'Diferencia', ancho: 115, alinear: 'right', fondo: FONDO_TEORICO },
      { id: 'gps-rec', titulo: 'Recorrido (GPS CAN)', ancho: 150, alinear: 'right', fondo: FONDO_GPS },
      { id: 'gps-comb', titulo: 'Comb. consumido (GPS CAN)', ancho: 180, alinear: 'right', fondo: FONDO_GPS },
      { id: 'gps-rend', titulo: 'Rendimiento (GPS CAN)', ancho: 170, alinear: 'right', fondo: FONDO_GPS },
      { id: 'gps-vel', titulo: 'Velocidad máx (GPS)', ancho: 160, alinear: 'right', fondo: FONDO_GPS },
      { id: 'gps-ral', titulo: 'Consumo ralentí', ancho: 130, alinear: 'right', fondo: FONDO_GPS },
      { id: 'gps-horas', titulo: 'Horas de motor', ancho: 130, alinear: 'right', fondo: FONDO_GPS },
    );
  }

  function onAlternarFila(viaje: string) {
    setExpandidos(prev => { const nx = new Set(prev); nx.has(viaje) ? nx.delete(viaje) : nx.add(viaje); return nx; });
  }

  // Excel con las columnas del clásico. Los GPS salen solo de los viajes cuya telemetría ya se consultó.
  async function exportar() {
    try {
      // Igual que el clásico: con el filtro D2 las fechas, km, galones, gasto y rendimiento salen de las cifras del diésel (fuelStats.D2);
      // si el viaje no tiene D2 (o es urea) se usan las del viaje
      const statsDe = bloqueD2;
      const cifrasXls = cifras;
      const filas = visibles.map(x => {
        const s = statsDe(x);
        const c = cifrasXls(x);
        const kmIni = s ? n(s.kmInicio) : x.kmInicio, kmFin = s ? n(s.kmFin) : x.kmFin, rec = s ? n(s.recorridoKm) : x.recorridoKm;
        const a = analisis.get(claveFila(x));
        const dif = a && a.galTeorico > 0 && c.galones > 0 ? c.galones - a.galTeorico : null;
        const g = gps.lote[claveFila(x)]?.data ?? null;
        const gv = (v: number | null | undefined, d = 2) => (v == null ? '—' : ptoDecimal(Number(v), d));
        const vales = (s?.vouchers ?? x.vouchers ?? []).filter(v => !v.esPuntoPartida && esD2(String(v.producto ?? ''))).length;
        return [
          x.estadoAuditoria, x.observacionAuditoria, x.viaje, x.placa || '---', x.carreta || '---', String(x.estado || 'INICIADO').toUpperCase(),
          x.motor || '---', x.ruta || '---', x.conductor || '---', ptoDecimal(n(x.pesoMaxTn), 2), fechaExcel(s?.fechaInicio || x.fechaInicio), fechaExcel(s?.fechaFin || x.fechaFin),
          kmIni > 0 ? ptoDecimal(kmIni, 1) : '—', kmFin > 0 ? ptoDecimal(kmFin, 1) : '—', rec > 0 ? ptoDecimal(rec, 1) : '—',
          ptoDecimal(c.galones, 2), c.rendimiento > 0 ? ptoDecimal(c.rendimiento, 2) : '—', ptoDecimal(c.gasto, 2),
          a && a.kmTeorico > 0 ? ptoDecimal(a.kmTeorico, 1) : '—', a && a.galTeorico > 0 ? ptoDecimal(a.galTeorico, 2) : 0,
          a && a.rendTeorico > 0 ? ptoDecimal(a.rendTeorico, 2) : '—', dif !== null ? ptoDecimal(dif, 2) : '—',
          dif !== null ? (dif > 0 ? 'SOBRECONSUMO' : 'AHORRO') : '—', n(x.galonesIda), n(x.galonesRetorno),
          gv(g?.recorridoKmGps, 1), gv(g?.combustibleConsumidoGps), gv(g?.rendimientoGps), gv(g?.velocidadMaxGps, 0), gv(g?.consumoRalentiGps),
          gv(g?.rpmMediaGps, 0), gv(g?.rpmMediaMaxGps, 0), gv(g?.rpmMaxGps, 0), gv(g?.rpmMaxMaxGps, 0), (g?.horasMotorGps == null ? '' : String(g.horasMotorGps)), vales,
        ];
      });
      // Fila TOTAL al final, como el clásico: galones reales y combustible consumido por GPS
      const totGal = visibles.reduce((t, x) => t + cifrasXls(x).galones, 0);
      const totGps = visibles.reduce((t, x) => { const v = gps.lote[claveFila(x)]?.data?.combustibleConsumidoGps; return t + (v != null && !isNaN(Number(v)) ? Number(v) : 0); }, 0);
      const total: (string | number | Date)[] = ENCABEZADOS_EXCEL.map(() => '');
      total[2] = 'TOTAL'; total[ENCABEZADOS_EXCEL.indexOf('TOTAL GALONES (REAL)')] = ptoDecimal(totGal, 2);
      total[ENCABEZADOS_EXCEL.indexOf('COMB. CONSUMIDO (GPS CAN)')] = totGps > 0 ? ptoDecimal(totGps, 2) : '—';
      filas.push(total);
      await exportarExcel(urea ? 'Analisis-urea' : 'Analisis-combustible', 'Viajes', ENCABEZADOS_EXCEL, filas);
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
          <div className="acciones-iconos">
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--verde"
              data-tip="Exportar Excel" aria-label="Exportar Excel" onClick={() => exportar()}>
              <FileSpreadsheet size={17} />
            </button>
            {!urea && (
              <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--azul"
                data-tip="Matriz de rendimiento" aria-label="Matriz de rendimiento" onClick={() => navigate('/operaciones/matriz-combustible')}>
                <Fuel size={17} />
              </button>
            )}
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 'var(--s-2)' }}>
          <KpiCard titulo="Viajes" valor={fmt(resumen.viajes, 0)} detalle={`${resumen.pendientes} sin auditar`} />
          <KpiCard titulo={urea ? 'Urea (gl)' : 'Galones'} valor={fmt(resumen.gal, 2)} color="var(--accent)"
            detalle={resumen.viajes ? `${fmt(resumen.gal / resumen.viajes, 1)} gl por viaje en promedio` : 'Sin viajes'} />
          <KpiCard titulo="Gasto" valor={soles(resumen.gasto)} color="var(--green-ink)"
            detalle={resumen.gal > 0 ? `S/ ${fmt(resumen.gasto / resumen.gal, 2)} por galón en promedio` : 'Sin galones'} />
          {!urea && (
            <KpiCard titulo="Recorrido total" valor={`${fmt(resumen.km, 2)} km`} color="var(--amber-ink)"
              detalle={`${resumen.validos} de ${resumen.viajes} viajes con odómetro válido`} />
          )}
          {!urea && (
            <KpiCard titulo="Km por galón" valor={fmt(resumen.kmGal, 2)} color="var(--amber-ink)"
              detalle={`Recorrido de ${resumen.razonables} viajes válidos entre ${fmt(resumen.galConKm, 2)} galones de esos viajes`} />
          )}
          {!urea && <CardContraMatriz exceso={pie.exceso} ahorro={pie.ahorro} viajesExceso={pie.viajesExceso} viajesAhorro={pie.viajesAhorro} />}
          <CardCumplimiento conformes={resumen.conformes} observados={resumen.observados} pendientes={resumen.pendientes} />
        </div>

        <SearchField value={busqueda} placeholder="Viaje, placa, ruta o conductor…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _anT?: number })._anT); (window as unknown as { _anT?: number })._anT = window.setTimeout(() => setQ(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant={hayFiltros ? 'primary' : 'secondary'} icon={<SlidersHorizontal size={15} />} onClick={() => setFiltrando(true)}
            aria-label={hayFiltros ? `Filtros, ${cuentaFiltrosAnalisis(filtros)} activos` : 'Filtros'}>
            {hayFiltros ? `Filtros (${cuentaFiltrosAnalisis(filtros)})` : 'Filtros'}
          </Button>
          <SelectInput value={orden} onChange={e => setOrden(e.target.value)} aria-label="Orden" style={{ width: 'auto' }}>
            {ORDENES.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          {!urea && (
            <>
              <Button variant={mostrarObs ? 'primary' : 'secondary'} onClick={() => setMostrarObs(v => !v)}>{mostrarObs ? 'Ocultar observaciones' : 'Ver observaciones'}</Button>
              <Button variant={ocultarSinViaje ? 'primary' : 'secondary'} onClick={() => setOcultarSinViaje(v => !v)}>{ocultarSinViaje ? 'Mostrar compras sin viaje' : 'Ocultar compras sin viaje'}</Button>
              <Button variant={canActivo ? 'primary' : 'secondary'} icon={<RefreshCw size={15} />} onClick={() => { haptic('selection'); setCanActivo(a => !a); }}
                title="Consulta el recorrido y rendimiento que reporta el GPS (Wialon) para las filas de esta página">
                {canActivo ? 'CAN (GPS) activo' : 'Consultar CAN (GPS)'}
              </Button>
            </>
          )}
        </div>

        {!urea && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap', padding: 'var(--s-2) var(--s-3)', borderRadius: 12, background: 'var(--amber-tint)', color: 'var(--amber-ink)', fontSize: '0.8125rem' }}>
            <strong>Regla operativa:</strong>
            <span>a las unidades que ruedan sin carreta (solo camión) se les calcula el teórico completo de ida + retorno y luego se aplica un descuento del 25% en los galones teóricos.</span>
          </div>
        )}

        {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || hayFiltros || desde || hasta ? <SearchX size={22} /> : <Icono size={22} />} title={busqueda || hayFiltros ? 'Sin coincidencias' : 'Sin viajes para analizar'}>
            {urea ? 'Aparecen los viajes con vales de urea.' : 'Aparecen los viajes con vales de combustible.'}
          </EmptyState>
        ) : (
          <>
            {canActivo && gps.total > 0 && gps.cargando === 0 && gps.listos === 0 && <Notice>No se encontraron registros CAN para los viajes de esta página (revisa que la unidad exista en Wialon con esa placa).</Notice>}
            <TablaRedimensionable id={urea ? 'analisis-urea' : 'analisis-combustible'} columnas={columnas} ariaLabel={urea ? 'Análisis de urea por viaje' : 'Análisis de combustible por viaje'}>
              {pagina_.map((x, i) => {
                const c = cifras(x);
                const s2 = bloqueD2(x);
                const fIni = s2?.fechaInicio || x.fechaInicio, fFin = s2?.fechaFin || x.fechaFin;
                const kIni = s2 ? n(s2.kmInicio) : x.kmInicio, kFin = s2 ? n(s2.kmFin) : x.kmFin, recKm = s2 ? n(s2.recorridoKm) : x.recorridoKm;
                const a = analisis.get(claveFila(x));
                const abiertoFila = !urea && expandidos.has(claveFila(x));
                const color = colorAudit(x.estadoAuditoria);
                const gpsV = (campo: keyof TelemetriaWialon) => valorGps(canActivo, lote, claveFila(x), campo);
                const dif = a && a.galTeorico > 0 && c.galones > 0 ? c.galones - a.galTeorico : null;
                const celdas: ReactNode[] = [
                  <Celda key="aud">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {puedeAuditar && (x.estadoAuditoria !== 'CONFORME' || esAdmin) ? (
                        <select value={x.estadoAuditoria} aria-label={`Auditoría del viaje ${x.viaje}`} onClick={e => e.stopPropagation()}
                          onChange={e => { const est = e.target.value; if (est === 'OBSERVADO') setMostrarObs(true); haptic('selection'); guardar(x.viaje, est, x.observacionAuditoria || '').catch(() => undefined); }}
                          style={{ font: 'inherit', fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--separator)', background: `var(--${color}-tint)`, color: `var(--${color}-ink)`, cursor: 'pointer' }}>
                          {AUDIT.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      ) : <Pastilla color={color}>{x.estadoAuditoria}</Pastilla>}
                      {(x.odometroInconsistente || kmDelViaje(x) > LIMITE_KM_VIAJE) && (
                        <span title="Odómetro inconsistente: km final menor al inicial o salto anómalo (más de 3.000 km)" style={{ display: 'inline-flex', flexShrink: 0 }}>
                          <AlertTriangle size={14} style={{ color: 'var(--red-ink)' }} aria-label="Odómetro inconsistente" />
                        </span>
                      )}
                    </span>
                  </Celda>,
                ];
                if (mostrarObs) celdas.push(<Celda key="obs"><ObsInput viaje={x.viaje} estado={x.estadoAuditoria} valor={x.observacionAuditoria || ''} puedeAuditar={puedeAuditar} onGuardar={guardar} /></Celda>);
                celdas.push(
                  <Celda key="viaje" mono>
                    {!urea && (
                      <button type="button" aria-expanded={abiertoFila} aria-label={`Ver ida y retorno del viaje ${x.viaje}`}
                        onClick={e => { e.stopPropagation(); onAlternarFila(claveFila(x)); }}
                        style={{ background: 'none', border: 0, padding: 0, marginRight: 4, cursor: 'pointer', color: 'var(--label-2)', verticalAlign: 'middle' }}>
                        {abiertoFila ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                    {x.viaje}
                  </Celda>,
                  <Celda key="placa" mono>{x.placa || '—'}</Celda>,
                  <Celda key="carreta" mono>{x.carreta || '—'}</Celda>,
                  <Celda key="estado"><Pastilla color={x.estado === 'FINALIZADO' ? 'blue' : 'gray'}>{x.estado || '—'}</Pastilla></Celda>,
                  <Celda key="motor" mono>{x.motor || '—'}</Celda>,
                  <Celda key="ruta">{x.ruta || '—'}</Celda>,
                  <Celda key="conductor">{x.conductor || '—'}</Celda>,
                  <Celda key="peso" alinear="right" mono>{fmt(x.pesoMaxTn, 2)}</Celda>,
                  <Celda key="finicio" mono>{fIni || '—'}</Celda>,
                  <Celda key="ffin" mono>{fFin || '—'}</Celda>,
                  <Celda key="kmini" alinear="right" mono>{kIni > 0 ? fmt(kIni, 1) : '—'}</Celda>,
                  <Celda key="kmfin" alinear="right" mono>{kFin > 0 ? fmt(kFin, 1) : '—'}</Celda>,
                  <Celda key="recorrido" alinear="right" mono>{recKm > 0 ? fmt(recKm, 1) : '—'}</Celda>,
                  <Celda key="galones" alinear="right" mono>{fmt(c.galones, 2)}</Celda>,
                  <Celda key="rendimiento" alinear="right" mono>{c.rendimiento > 0 ? fmt(c.rendimiento, 2) : '—'}</Celda>,
                  <Celda key="gasto" alinear="right" mono>{soles(c.gasto)}</Celda>,
                );
                if (!urea) {
                  celdas.push(
                    <Celda key="kmteo" alinear="right" mono>{a && a.kmTeorico > 0 ? fmt(a.kmTeorico, 1) : '—'}</Celda>,
                    <Celda key="galteo" alinear="right" mono>
                      {a && a.galTeorico > 0 ? fmt(a.galTeorico, 2) : '—'}
                      {a?.sinCarreta && a.galTeorico > 0 && <span style={{ marginLeft: 4 }}><Pastilla color="amber">-25%</Pastilla></span>}
                    </Celda>,
                    <Celda key="rendteo" alinear="right" mono>{a && a.rendTeorico > 0 ? fmt(a.rendTeorico, 2) : '—'}</Celda>,
                    <Celda key="dif" alinear="right" mono><Diferencia valor={dif} /></Celda>,
                    <Celda key="gps-rec" alinear="right" mono>{gpsV('recorridoKmGps')}</Celda>,
                    <Celda key="gps-comb" alinear="right" mono>{gpsV('combustibleConsumidoGps')}</Celda>,
                    <Celda key="gps-rend" alinear="right" mono>{gpsV('rendimientoGps')}</Celda>,
                    <Celda key="gps-vel" alinear="right" mono>{gpsV('velocidadMaxGps')}</Celda>,
                    <Celda key="gps-ral" alinear="right" mono>{gpsV('consumoRalentiGps')}</Celda>,
                    <Celda key="gps-horas" alinear="right" mono>{gpsV('horasMotorGps')}</Celda>,
                  );
                }
                return (
                  <FilaViaje key={`${x.viaje}|${x.placa}|${i}`} seleccionada={abierto === claveFila(x)} onAbrir={() => { haptic('selection'); setAbierto(claveFila(x)); }}
                    abierta={abiertoFila} celdas={celdas}
                    tramos={abiertoFila && a ? [
                      { etiqueta: 'IDA', tramo: a.ida, x, obs: mostrarObs, orden: x.ordenIda },
                      { etiqueta: 'RETORNO', tramo: a.retorno, x, obs: mostrarObs, orden: x.ordenRetorno },
                    ] : []} />
                );
              })}
              <tr className="tabla-redim__total" style={{ background: 'var(--fill-subtle)', fontWeight: 700, borderTop: '2px solid var(--separator)' }}>{pieCeldas}</tr>
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

      {canActivo && !urea && <PanelCan filas={gps.filas} total={gps.total} listos={gps.listos} cargando={gps.cargando} sinDatos={gps.sinDatos} errores={gps.errores} reintentar={gps.reintentar} items={itemsCan} />}
      <DetalleViaje trip={t} urea={urea} puedeAuditar={puedeAuditar} guardar={guardar} analisis={t ? analisis.get(claveFila(t)) : undefined} gpsLote={(t ? gps.lote[claveFila(t)] : undefined)?.data ?? null} onClose={() => setAbierto(null)} cifras={cifras} />
      <FiltrosAnalisisSheet open={filtrando} onClose={() => setFiltrando(false)} filtros={filtros} onChange={setFiltros} opciones={opciones} resultado={visibles.length} urea={urea} />
    </Page>
  );
}

// Fila del viaje y, al desplegarla, sus filas de IDA y RETORNO con las mismas columnas (cada tramo con sus propios cálculos)
function FilaViaje({ abierta, onAbrir, seleccionada, celdas, tramos }: {
  abierta: boolean; onAbrir: () => void; seleccionada: boolean; celdas: ReactNode[];
  tramos: { etiqueta: 'IDA' | 'RETORNO'; tramo: TramoCalc; x: Trip; obs: boolean; orden: string }[];
}) {
  return (
    <>
      <tr className={`tabla-redim__fila--click${seleccionada ? ' tabla-redim__fila--sel' : ''}`} onClick={onAbrir}>
        {celdas}
      </tr>
      {abierta && tramos.map(({ etiqueta, tramo, x, obs, orden }) => (
        <tr key={etiqueta} className="tabla-redim__sub" title={orden ? `Orden de servicio: ${orden}` : undefined}>
          <Celda>—</Celda>
          {obs && <Celda>—</Celda>}
          <Celda><Pastilla color={etiqueta === 'IDA' ? 'blue' : 'amber'}>{etiqueta}</Pastilla></Celda>
          <Celda mono>{x.placa || '—'}</Celda>
          <Celda mono>{x.carreta || '—'}</Celda>
          <Celda>—</Celda>
          <Celda mono>{x.motor || '—'}</Celda>
          <Celda>{`${etiqueta === 'IDA' ? 'Ida' : 'Retorno'}: ${tramo.ruta || '—'}`}</Celda>
          <Celda>—</Celda>
          <Celda alinear="right" mono>{tramo.peso > 0 ? fmt(tramo.peso, 2) : '0.00 (vacío)'}</Celda>
          <Celda>—</Celda>
          <Celda>—</Celda>
          <Celda alinear="right" mono>{tramo.kmIni > 0 ? fmt(tramo.kmIni, 1) : '—'}</Celda>
          <Celda alinear="right" mono>{tramo.kmFin > 0 ? fmt(tramo.kmFin, 1) : '—'}</Celda>
          <Celda alinear="right" mono>{tramo.recorrido > 0 ? fmt(tramo.recorrido, 1) : '—'}</Celda>
          <Celda alinear="right" mono>{fmt(tramo.galones, 2)}</Celda>
          <Celda alinear="right" mono>{tramo.rendimiento > 0 ? fmt(tramo.rendimiento, 2) : '—'}</Celda>
          <Celda alinear="right" mono>{soles(tramo.gasto)}</Celda>
          <Celda alinear="right" mono>{tramo.kmTeorico > 0 ? fmt(tramo.kmTeorico, 1) : '—'}</Celda>
          <Celda alinear="right" mono>{tramo.galTeorico > 0 ? fmt(tramo.galTeorico, 2) : '—'}</Celda>
          <Celda alinear="right" mono>{tramo.rendTeorico > 0 ? fmt(tramo.rendTeorico, 2) : '—'}</Celda>
          <Celda alinear="right" mono><Diferencia valor={tramo.diferencia} /></Celda>
          {Array.from({ length: 6 }, (_, i) => <Celda key={i} alinear="right" mono>—</Celda>)}
        </tr>
      ))}
    </>
  );
}

function DetalleViaje({ trip: t, urea, puedeAuditar, guardar, analisis: a, gpsLote, onClose, cifras }: {
  trip: Trip | null; urea: boolean; puedeAuditar: boolean; guardar: (viaje: string, estado: string, obs: string) => Promise<unknown>;
  analisis: AnalisisViaje | undefined; gpsLote: TelemetriaWialon | null; onClose: () => void;
  cifras: (t: Trip) => { galones: number; gasto: number; rendimiento: number };
}) {
  const [obs, setObs] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [pedida, setPedida] = useState(false);
  useEffect(() => { if (t) { setObs(t.observacionAuditoria || ''); setGuardado(false); setPedida(false); } }, [t?.viaje]); // eslint-disable-line react-hooks/exhaustive-deps
  const telQ = useTelemetriaViaje(t, pedida);
  const estado = t?.estadoAuditoria || 'PENDIENTE';
  const { permissions } = useAuth();
  const bloqueado = !puedeAuditar || (estado === 'CONFORME' && !permissions.has(ADMIN));

  // Guardado en vivo: el resultado al elegirlo y la observación al salir del campo
  async function guardarAhora(est: string, texto: string) {
    if (!t) return;
    try { await guardar(t.viaje, est, texto.trim()); setGuardado(true); window.setTimeout(() => setGuardado(false), 2000); haptic('success'); } catch { /* el aviso lo da el hook */ }
  }

  if (!t) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const c = cifras(t);
  const vales = (t.vouchers ?? []).filter(v => !v.esPuntoPartida && (urea ? esUrea(String(v.producto ?? '')) : esD2(String(v.producto ?? ''))));
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

        {!urea && <TelemetriaViaje trip={t} pedida={pedida} setPedida={setPedida} q={telQ} />}
        {!urea && <Conciliacion t={t} a={a} galones={c.galones} gps={telQ.data ?? gpsLote} />}

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
          {estado === 'CONFORME' && <span className="t-footnote c-secondary">{permissions.has(ADMIN) ? 'Auditoría conforme: solo el administrador puede cambiarla.' : 'Auditoría conforme: queda bloqueada.'}</span>}
          <Field label="Resultado">
            {p => <SelectInput {...p} value={estado} onChange={e => guardarAhora(e.target.value, obs)} disabled={bloqueado}>{AUDIT.map(a2 => <option key={a2} value={a2}>{a2}</option>)}</SelectInput>}
          </Field>
          <Field label="Observación" hint={guardado ? 'Guardado' : t.usuarioAuditoria ? `Última revisión: ${t.usuarioAuditoria}` : 'Se guarda al salir del campo'}>
            {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} onBlur={() => { if (!bloqueado && obs.trim() !== (t.observacionAuditoria || '').trim()) guardarAhora(estado, obs); }} disabled={bloqueado} />}
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
