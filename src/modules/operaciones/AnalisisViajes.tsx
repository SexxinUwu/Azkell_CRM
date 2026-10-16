import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Droplets, FileSpreadsheet, Fuel, RefreshCw, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
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
  viaje: string; placa: string; conductor: string; motor: string; marca: string; configuracion: string; ruta: string; rutaIda: string; rutaRetorno: string;
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

// Telemetría CAN Bus de Wialon para el periodo del viaje (de la primera a la última carga). Solo se consulta al pedirla.
function TelemetriaViaje({ trip }: { trip: Trip }) {
  const [pedida, setPedida] = useState(false);
  const rango = useMemo(() => {
    const fechas = (trip.vouchers ?? []).map(v => String(v.fecha ?? '')).filter(Boolean).sort();
    return { ini: fechas[0] || trip.fechaInicio, fin: fechas[fechas.length - 1] || trip.fechaFin };
  }, [trip]);
  const q = useQuery({
    queryKey: ['operaciones', 'wialon', trip.viaje, trip.placa, rango.ini, rango.fin],
    enabled: pedida && !!trip.placa,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const p = new URLSearchParams({ placa: trip.placa, fechaInicio: rango.ini, fechaFin: rango.fin });
      const r = await api<{ ok?: boolean; data?: TelemetriaWialon; error?: string }>(`/combustible/wialon-telemetria?${p.toString()}`);
      if (!r.ok || !r.data) throw new Error(r.error || 'Sin telemetría para este viaje');
      return r.data;
    },
  });
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

const fmt = (v: unknown, d = 1) => n(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
// Soles con S/ y espacio no divisible, dos decimales
const soles = (v: unknown) => 'S/\u00a0' + n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AUDIT = ['PENDIENTE', 'CONFORME', 'OBSERVADO'];
const colorAudit = (e: string) => ({ CONFORME: 'green', OBSERVADO: 'amber', PENDIENTE: 'gray' }[e] ?? 'gray');
const esUrea = (k: string) => /UREA|ADBLUE|DEF/.test(k.toUpperCase());

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
  const toast = useToast();

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
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={auditoria} onChange={e => setAuditoria(e.target.value)} aria-label="Auditoría" style={{ width: 'auto' }}>
            <option value="">Toda auditoría</option>{AUDIT.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || auditoria || desde || hasta ? <SearchX size={22} /> : <Icono size={22} />} title={busqueda || auditoria ? 'Sin coincidencias' : 'Sin viajes para analizar'}>
            {urea ? 'Aparecen los viajes con vales de urea.' : 'Aparecen los viajes con vales de combustible.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(x => {
              const c = cifras(x);
              return (
                <button key={x.viaje} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbierto(x.viaje); }}>
                  <div className="mov-fila__icon" style={{ background: `var(--${colorAudit(x.estadoAuditoria)}-tint)`, color: `var(--${colorAudit(x.estadoAuditoria)}-ink)` }}>
                    {x.odometroInconsistente ? <AlertTriangle size={16} /> : <Icono size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{x.viaje} · {x.placa || 'Sin placa'}</span>
                    <span className="mov-fila__sub">{[x.conductor, x.ruta, `${fmt(x.recorridoKm, 0)} km`].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto">{fmt(c.galones, 1)} gl</span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${colorAudit(x.estadoAuditoria)}-ink)` }}>
                      {c.rendimiento > 0 ? `${fmt(c.rendimiento, 2)} km/gl · ` : ''}{x.estadoAuditoria}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DetalleViaje trip={t} urea={urea} puedeAuditar={puedeAuditar} modulo={modulo} usuario={user?.name ?? ''} onClose={() => setAbierto(null)} cifras={cifras} />
      <MatrizRendimientoSheet open={matriz} onClose={() => setMatriz(false)} puedeEditar={puedeAuditar} />
    </Page>
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
