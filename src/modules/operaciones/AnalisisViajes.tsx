import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Droplets, FileSpreadsheet, Fuel, RefreshCw, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import '../../core/ui/acciones-iconos.css';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { analizarViaje, type AnalisisViaje, type MatrizCalc, type TramoCalc, type ViajeCalc } from './analisisCalculo';

interface BloqueVales { vales: number; galones: number; importe: number }
interface ResumenVales { ok?: boolean; diesel: BloqueVales; urea: BloqueVales }
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
// 'AAAA-MM-DD[ HH:mm[:ss]]' (hora local) -> fecha nativa de Excel; si no es fecha queda el texto
const fechaExcel = (s?: string | null): Date | string => {
  const m = /^(d{4})-(d{2})-(d{2})(?:[ T](d{2}):(d{2})(?::(d{2}))?)?/.exec(String(s ?? '').trim());
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))) : (s || '---');
};
interface TelemetriaWialon {
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
    queryFn: async () => {
      const p = new URLSearchParams({ placa: trip!.placa, fechaInicio: ini, fechaFin: fin });
      const r = await api<{ ok?: boolean; data?: TelemetriaWialon; error?: string }>(`/combustible/wialon-telemetria?${p.toString()}`);
      if (!r.ok || !r.data) throw new Error(r.error || 'Sin telemetría para este viaje');
      return r.data;
    },
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
type LoteGps = Record<string, { data: TelemetriaWialon | null; error?: string }>;

// Valor de una celda GPS: '—' si el CAN está apagado, '…' mientras consulta, o el dato si llegó
function valorGps(activo: boolean, cargando: boolean, lote: LoteGps | undefined, viaje: string, campo: keyof TelemetriaWialon) {
  if (!activo) return '—';
  if (cargando) return '…';
  const fila = lote?.[viaje];
  if (!fila) return '—';
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
const esUrea = (k: string) => /UREA|ADBLUE|DEF/.test(k.toUpperCase());
const TAMANOS = [25, 50, 100];
// Un viaje de más de este recorrido se considera odómetro mal digitado (ningún viaje real llega a eso)
const LIMITE_KM_VIAJE = 3000;

// Tarjeta de indicador de la cabecera
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
  const bloqueado = !puedeAuditar || estado === 'CONFORME';
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
  const [auditoria, setAuditoria] = useState('');
  const [placaF, setPlacaF] = useState('');
  const [conductorF, setConductorF] = useState('');
  const [orden, setOrden] = useState('trip_desc');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [canActivo, setCanActivo] = useState(false);
  const [mostrarObs, setMostrarObs] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(50);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => { setPagina(1); }, [q, desde, hasta, auditoria, placaF, conductorF, orden, tamano]);
  const guardarAud = useGuardarAuditoria(modulo, user?.name ?? '');
  const guardar = (viaje: string, estado: string, obs: string) => guardarAud.mutateAsync({ viaje, estado, obs });

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

  // Totales crudos de los vales por fecha del vale (lo que se compró), sin repartir por viaje
  const valesQ = useQuery<ResumenVales>({
    queryKey: ['operaciones', 'resumen-vales', modulo, desde, hasta],
    queryFn: () => {
      const p = new URLSearchParams({ modulo });
      if (desde) p.set('fecha_desde', desde);
      if (hasta) p.set('fecha_hasta', hasta);
      return api<ResumenVales>(`/combustible/resumen-vales?${p}`);
    },
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
  const trips = useMemo(() => {
    const todos = datos.data?.trips ?? [];
    if (!urea) return todos.filter(t => { const ks = Object.keys(t.fuelStats ?? {}); return ks.length === 0 || ks.some(k => !esUrea(k)); });
    return todos.filter(t => Object.keys(t.fuelStats ?? {}).some(esUrea));
  }, [datos.data, urea]);

  // Como el clásico con el filtro D2: las cifras del viaje salen del bloque de diésel (fuelStats.D2) si lo tiene; tabla y Excel usan el mismo
  const bloqueD2 = (t: Trip) => (urea ? undefined : t.fuelStats?.D2);
  const cifras = (t: Trip) => {
    if (!urea) {
      const d2 = bloqueD2(t);
      if (d2) return { galones: n(d2.totalGalones), gasto: n(d2.totalGasto), rendimiento: n(d2.rendimiento) };
      const gal = Object.entries(t.fuelStats ?? {}).filter(([k]) => !esUrea(k)).reduce((s, [, v]) => s + n(v.totalGalones), 0) || t.totalGalones;
      // Gasto solo de diésel (D2), igual que los galones: el de urea se ve en su propia pantalla
      const gasto = Object.entries(t.fuelStats ?? {}).filter(([k]) => !esUrea(k)).reduce((s, [, v]) => s + n(v.totalGasto), 0) || t.totalGasto;
      return { galones: gal, gasto, rendimiento: t.rendimiento };
    }
    const u = Object.entries(t.fuelStats ?? {}).filter(([k]) => esUrea(k)).map(([, v]) => v);
    return { galones: u.reduce((s, v) => s + n(v.totalGalones), 0), gasto: u.reduce((s, v) => s + n(v.totalGasto), 0), rendimiento: u.length ? n(u[0].rendimiento) : 0 };
  };

  // Orden de viaje: del más reciente al más antiguo; los "SIN-VIAJE" (vales sueltos) van al final
  const placas = useMemo(() => [...new Set(trips.map(t => t.placa).filter(Boolean))].sort(), [trips]);
  const conductores = useMemo(() => [...new Set(trips.map(t => t.conductor).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [trips]);
  const visibles = useMemo(() => trips
    .filter(t => (!auditoria || t.estadoAuditoria === auditoria) && (!placaF || t.placa === placaF) && (!conductorF || t.conductor === conductorF))
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
    }), [trips, auditoria, placaF, conductorF, orden]);
  const paginas = Math.max(1, Math.ceil(visibles.length / tamano));
  const pagActual = Math.min(pagina, paginas);
  const pagina_ = useMemo(() => visibles.slice((pagActual - 1) * tamano, pagActual * tamano), [visibles, pagActual, tamano]);

  // Cálculo por viaje y por tramo (IDA / RETORNO) con la misma lógica del clásico
  const analisis = useMemo(() => {
    const mapa = new Map<string, AnalisisViaje>();
    if (urea) return mapa;
    for (const x of visibles) {
      const viaje: ViajeCalc = {
        ruta: x.ruta, rutaIda: x.rutaIda, rutaRetorno: x.rutaRetorno, motor: x.motor, configuracion: x.configuracion, carreta: x.carreta,
        pesoIda: x.pesoIda, pesoRetorno: x.pesoRetorno, pesoMaxTn: x.pesoMaxTn, kmInicio: x.kmInicio, kmFin: x.kmFin,
        vouchers: (x.vouchers ?? []).filter(v => !esUrea(String(v.producto ?? ''))),
      };
      mapa.set(x.viaje, analizarViaje(viaje, matriz));
    }
    return mapa;
  }, [visibles, matriz, urea]);

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
    // Galones y gasto de los vales crudos (diésel o urea según la pantalla); mientras llegan, se suman los viajes
    const crudo = valesQ.data ? (urea ? valesQ.data.urea : valesQ.data.diesel) : null;
    const gal = crudo ? crudo.galones : visibles.reduce((s, t) => s + cifras(t).galones, 0);
    const gasto = crudo ? crudo.importe : visibles.reduce((s, t) => s + cifras(t).gasto, 0);
    // Km por galón solo con viajes de odómetro válido: un odómetro mal digitado (p. ej. 7.444.183 km en un viaje) infla el promedio
    // Como el clásico: el recorrido es el del bloque de diésel del viaje (urea, el general)
    const kmDelViaje = (t: Trip) => (urea ? n(t.recorridoKm) : n(bloqueD2(t)?.recorridoKm ?? t.recorridoKm));
    const razonables = visibles.filter(t => !t.odometroInconsistente && kmDelViaje(t) > 0 && kmDelViaje(t) <= LIMITE_KM_VIAJE);
    const kmRazonables = razonables.reduce((s, t) => s + kmDelViaje(t), 0);
    return { viajes: visibles.length, gal, gasto, km: kmRazonables, kmGal: gal > 0 ? kmRazonables / gal : 0, razonables: razonables.length, pendientes: visibles.filter(t => t.estadoAuditoria === 'PENDIENTE').length };
  }, [visibles, valesQ.data, urea]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = trips.find(x => x.viaje === abierto) ?? null;
  const Icono = urea ? Droplets : Fuel;
  const puedeAuditar = can('combustible_analisis.editar', 'combustible.editar', 'urea_analisis.editar', 'combustible_analisis.crear');

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
        const a = analisis.get(x.viaje);
        const dif = a && a.galTeorico > 0 && c.galones > 0 ? c.galones - a.galTeorico : null;
        const g = gps.data?.[x.viaje]?.data ?? null;
        const gv = (v: number | null | undefined, d = 2) => (v == null ? '—' : ptoDecimal(Number(v), d));
        const vales = (s?.vouchers ?? x.vouchers ?? []).filter(v => !v.esPuntoPartida && !esUrea(String(v.producto ?? ''))).length;
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
      const totGps = visibles.reduce((t, x) => { const v = gps.data?.[x.viaje]?.data?.combustibleConsumidoGps; return t + (v != null && !isNaN(Number(v)) ? Number(v) : 0); }, 0);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-3)' }}>
          <KpiCard titulo="Viajes" valor={fmt(resumen.viajes, 0)} detalle={`${resumen.pendientes} sin auditar`} />
          <KpiCard titulo={urea ? 'Urea (gl)' : 'Galones'} valor={fmt(resumen.gal, 2)} color="var(--accent)"
            detalle={resumen.viajes ? `${fmt(resumen.gal / resumen.viajes, 1)} gl por viaje en promedio` : 'Sin viajes'} />
          <KpiCard titulo="Gasto" valor={soles(resumen.gasto)} color="var(--green-ink)"
            detalle={resumen.gal > 0 ? `S/ ${fmt(resumen.gasto / resumen.gal, 2)} por galón en promedio` : 'Sin galones'} />
          {!urea && (
            <KpiCard titulo="Recorrido total" valor={`${fmt(resumen.km, 2)} km`} color="var(--amber-ink)"
              detalle={`${resumen.razonables} de ${resumen.viajes} viajes con odómetro válido`} />
          )}
          {!urea && (
            <KpiCard titulo="Km por galón" valor={fmt(resumen.kmGal, 2)} color="var(--amber-ink)"
              detalle={`Recorrido total entre ${fmt(resumen.gal, 2)} galones del rango`} />
          )}
        </div>

        <SearchField value={busqueda} placeholder="Viaje, placa, ruta o conductor…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _anT?: number })._anT); (window as unknown as { _anT?: number })._anT = window.setTimeout(() => setQ(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectInput value={auditoria} onChange={e => setAuditoria(e.target.value)} aria-label="Auditoría" style={{ width: 'auto' }}>
            <option value="">Toda auditoría</option>{AUDIT.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <SelectInput value={placaF} onChange={e => setPlacaF(e.target.value)} aria-label="Placa" style={{ width: 'auto' }}>
            <option value="">Todas las placas</option>{placas.map(p => <option key={p} value={p}>{p}</option>)}
          </SelectInput>
          <SelectInput value={conductorF} onChange={e => setConductorF(e.target.value)} aria-label="Conductor" style={{ width: 'auto', maxWidth: 220 }}>
            <option value="">Todos los conductores</option>{conductores.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
          <SelectInput value={orden} onChange={e => setOrden(e.target.value)} aria-label="Orden" style={{ width: 'auto' }}>
            {ORDENES.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          {!urea && (
            <>
              <Button variant={mostrarObs ? 'primary' : 'secondary'} onClick={() => setMostrarObs(v => !v)}>{mostrarObs ? 'Ocultar observaciones' : 'Ver observaciones'}</Button>
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
          <EmptyState icon={busqueda || auditoria || desde || hasta ? <SearchX size={22} /> : <Icono size={22} />} title={busqueda || auditoria ? 'Sin coincidencias' : 'Sin viajes para analizar'}>
            {urea ? 'Aparecen los viajes con vales de urea.' : 'Aparecen los viajes con vales de combustible.'}
          </EmptyState>
        ) : (
          <>
            {gps.isError && <Notice tone="error">{errorMessage(gps.error)}</Notice>}
            {canActivo && !gps.isFetching && gps.data && Object.values(gps.data).every(f => !f.data) && <Notice>No se encontraron registros CAN para los viajes de esta página (revisa que la unidad exista en Wialon con esa placa).</Notice>}
            <TablaRedimensionable id={urea ? 'analisis-urea' : 'analisis-combustible'} columnas={columnas} ariaLabel={urea ? 'Análisis de urea por viaje' : 'Análisis de combustible por viaje'}>
              {pagina_.map(x => {
                const c = cifras(x);
                const s2 = bloqueD2(x);
                const fIni = s2?.fechaInicio || x.fechaInicio, fFin = s2?.fechaFin || x.fechaFin;
                const kIni = s2 ? n(s2.kmInicio) : x.kmInicio, kFin = s2 ? n(s2.kmFin) : x.kmFin, recKm = s2 ? n(s2.recorridoKm) : x.recorridoKm;
                const a = analisis.get(x.viaje);
                const abiertoFila = !urea && expandidos.has(x.viaje);
                const color = colorAudit(x.estadoAuditoria);
                const gpsV = (campo: keyof TelemetriaWialon) => valorGps(canActivo, gps.isFetching, gps.data, x.viaje, campo);
                const dif = a && a.galTeorico > 0 && c.galones > 0 ? c.galones - a.galTeorico : null;
                const celdas: ReactNode[] = [
                  <Celda key="aud">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {puedeAuditar && x.estadoAuditoria !== 'CONFORME' ? (
                        <select value={x.estadoAuditoria} aria-label={`Auditoría del viaje ${x.viaje}`} onClick={e => e.stopPropagation()}
                          onChange={e => { const est = e.target.value; if (est === 'OBSERVADO') setMostrarObs(true); haptic('selection'); guardar(x.viaje, est, x.observacionAuditoria || '').catch(() => undefined); }}
                          style={{ font: 'inherit', fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--separator)', background: `var(--${color}-tint)`, color: `var(--${color}-ink)`, cursor: 'pointer' }}>
                          {AUDIT.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      ) : <Pastilla color={color}>{x.estadoAuditoria}</Pastilla>}
                      {(x.odometroInconsistente || n(x.recorridoKm) > LIMITE_KM_VIAJE) && (
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
                        onClick={e => { e.stopPropagation(); onAlternarFila(x.viaje); }}
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
                  <FilaViaje key={x.viaje} seleccionada={abierto === x.viaje} onAbrir={() => { haptic('selection'); setAbierto(x.viaje); }}
                    abierta={abiertoFila} celdas={celdas}
                    tramos={abiertoFila && a ? [
                      { etiqueta: 'IDA', tramo: a.ida, x, obs: mostrarObs, orden: x.ordenIda },
                      { etiqueta: 'RETORNO', tramo: a.retorno, x, obs: mostrarObs, orden: x.ordenRetorno },
                    ] : []} />
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

      <DetalleViaje trip={t} urea={urea} puedeAuditar={puedeAuditar} guardar={guardar} analisis={t ? analisis.get(t.viaje) : undefined} gpsLote={gps.data?.[t?.viaje ?? '']?.data ?? null} onClose={() => setAbierto(null)} cifras={cifras} />
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
  const bloqueado = !puedeAuditar || estado === 'CONFORME';

  // Guardado en vivo: el resultado al elegirlo y la observación al salir del campo
  async function guardarAhora(est: string, texto: string) {
    if (!t) return;
    try { await guardar(t.viaje, est, texto.trim()); setGuardado(true); window.setTimeout(() => setGuardado(false), 2000); haptic('success'); } catch { /* el aviso lo da el hook */ }
  }

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
          {estado === 'CONFORME' && <span className="t-footnote c-secondary">Auditoría conforme: queda bloqueada.</span>}
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
