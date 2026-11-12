import './seguimiento.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePlus2, Flag, Fuel, MessageCircle, Phone, Play, Receipt, ShieldAlert } from 'lucide-react';
import { api } from '../../core/api/client';
import type { Gasto } from '../tesoreria/liq-utils';
import { aFecha, avanceReal, duracion, hora, num, SeguimientoServicio } from './SeguimientoServicio';

/** Lo que el resumen necesita de un viaje (la página de viajes lo cumple de forma estructural). */
export interface ViajeBase {
  viaje: string; estado: string; fecha_viaje: string | null; registrado_fmt?: string | null;
  conductor: string | null; conductor_telefono?: string | null; placa_tracto: string | null; placa_remolque: string | null;
  ejecucion?: string | null; tercero_nombre?: string | null; tercero_costo?: number | string | null; tercero_moneda?: string | null; tercero_ruc?: string | null; tercero_documento?: string | null;
  origen: string | null; destino: string | null; ruta: string | null; distancia_km?: number | string | null; km_recorrido_gps?: number | string | null;
  kilometraje_inicial: number | null; kilometraje_final: number | null; horas_motor_remolque: number | null;
  fecha_inicio: string | null; fecha_fin: string | null; cant_ordenes: number; peso_ida: number | string; peso_retorno: number | string;
  configuracion_tracto?: string | null; configuracion_remolque?: string | null; usuario_creacion: string | null; escolta: string | null; observaciones: string | null;
}
export interface AlertaDoc { placa: string; tipo: string; vence: string }

interface Vale { id?: number | string; correlativo?: string | null; fecha?: string | null; estacion?: string | null; galones?: number | string | null; importe?: number | string | null }
interface FilaRentabilidad { viaje: string; flete: number; combustible: number; viaticos: number; gastos_ruta: number; margen: number; rentabilidad_pct: number | null }

const fmt = (v: unknown, d = 0) => num(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Vales, gastos y rentabilidad del viaje: las mismas consultas de las pestañas (comparten caché). */
export function useDatosViaje(v: ViajeBase | null) {
  const codigo = v?.viaje ?? '';
  const mes = String(v?.fecha_viaje ?? '').slice(0, 7);
  const vales = useQuery({
    queryKey: ['operaciones', 'vales-viaje', codigo], enabled: !!codigo, staleTime: 15_000,
    queryFn: () => api<{ data?: Vale[] }>(`/combustible/vales?viaje=${encodeURIComponent(codigo)}&limit=20`).then(r => r.data ?? []),
  });
  const liq = useQuery({
    queryKey: ['operaciones', 'liq-viaje', codigo], enabled: !!codigo, staleTime: 15_000,
    queryFn: () => api<{ gastos?: Gasto[] }>(`/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(codigo)}`),
  });
  const rent = useQuery({
    queryKey: ['operaciones', 'rentabilidad', mes], enabled: /^\d{4}-\d{2}$/.test(mes),
    queryFn: () => api<{ viajes?: FilaRentabilidad[] }>(`/operaciones/rentabilidad?mes=${mes}`),
  });
  const fila = rent.data?.viajes?.find(x => String(x.viaje).trim().toUpperCase() === codigo.trim().toUpperCase());
  return { vales: vales.data ?? [], gastos: liq.data?.gastos ?? [], fila };
}

const ETAPA_PILL: Record<string, string> = { PENDIENTE: 'Registrado', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ruta', ENTREGADO: 'Finalizado', ANULADO: 'Anulado' };

/** Cabecera del viaje: ruta, camión sobre la línea de etapas y, con GPS real, llegada, avance y conductor. */
export function HeroViaje({ v, etapa, datos }: { v: ViajeBase; etapa: string; datos: ReactNode }) {
  const enRuta = etapa === 'EN_EJECUCION';
  const dist = num(v.distancia_km);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!enRuta) return;
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [enRuta]);
  const a = enRuta ? avanceReal(num(v.km_recorrido_gps), dist, aFecha(v.fecha_inicio), ahora) : null;
  const tercero = v.ejecucion === 'TERCERO';
  const quien = tercero ? (v.tercero_nombre || 'Transportista tercero') : v.conductor;
  const tel = (v.conductor_telefono ?? '').replace(/\D/g, '');
  const wa = tel.length === 9 ? `https://wa.me/51${tel}` : tel.length === 11 && tel.startsWith('51') ? `https://wa.me/${tel}` : '';
  const iniciales = (quien ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const tipo = tercero ? 'transportista tercero' : (v.conductor || v.placa_tracto) ? 'flota propia' : 'sin asignar';
  return (
    <section className="vh">
      <div className="vh__top">
        <span className="vh__eyebrow">{v.viaje} · {tipo} · {v.cant_ordenes} {v.cant_ordenes === 1 ? 'orden' : 'órdenes'}</span>
        <span className={`seg__pill${enRuta ? ' seg__pill--vivo' : ''}${etapa === 'ANULADO' ? ' seg__pill--gris' : ''}`}><i />{ETAPA_PILL[etapa] ?? etapa}</span>
      </div>
      <h3 className="vh__ruta">{v.origen || 'Sin origen'} <ArrowRight size={22} aria-hidden /> {v.destino || 'Sin destino'}</h3>
      <p className="vh__sub">{[quien ? `${tercero ? 'Lo lleva' : 'Sale con'} ${quien}` : 'Aún sin conductor ni unidad', dist > 0 ? `${fmt(dist)} km de ruta` : null].filter(Boolean).join(' · ')}</p>
      {datos}
      <div className="vh__cards">
        {a?.etaMin != null && <div className="vh__card"><span>Llega en</span><strong>{duracion(a.etaMin)}</strong></div>}
        {a?.real && <div className="vh__card"><span>Avance · {Math.round((a.recorrido / dist) * 100)} %</span><strong>{fmt(a.recorrido)} <small>de {fmt(dist)} km</small></strong></div>}
        {quien && (
          <div className="vh__cond">
            <span className="seg__avatar">{iniciales}</span>
            <div className="seg__quien">
              <strong>{quien}</strong>
              <span>{v.placa_tracto ? <span className="seg__placa">{v.placa_tracto}</span> : null}{v.placa_remolque ? <> <span className="seg__placa">{v.placa_remolque}</span></> : null}{!v.placa_tracto && !v.placa_remolque ? (tercero ? 'Transportista tercero' : 'Sin placa') : null}</span>
            </div>
            {tel.length >= 7 && <a className="seg__llamar" href={`tel:${tel}`} aria-label="Llamar"><Phone size={16} /></a>}
            {wa && <a className="vh__wa" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={16} /></a>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Indicadores del viaje con lo que realmente se registró: recorrido, combustible, rendimiento, gasto y margen. */
export function KpisViaje({ v }: { v: ViajeBase }) {
  const { vales, fila } = useDatosViaje(v);
  const dist = num(v.distancia_km);
  const odometro = v.kilometraje_inicial != null && v.kilometraje_final != null ? v.kilometraje_final - v.kilometraje_inicial : 0;
  const recorrido = odometro > 0 ? odometro : num(v.km_recorrido_gps);
  const galones = vales.reduce((s, x) => s + num(x.galones), 0);
  const rend = recorrido > 0 && galones > 0 ? recorrido / galones : null;
  return (
    <div className="vk">
      <div className="vk__t"><span className="vk__l">Recorrido</span><strong>{recorrido > 0 ? <>{fmt(recorrido)} <small>km</small></> : '—'}</strong><em>{dist > 0 ? `de ${fmt(dist)} km` : odometro > 0 ? 'Por odómetro' : 'Sin kilometraje'}</em></div>
      <div className="vk__t"><span className="vk__l">Combustible</span><strong>{galones > 0 ? <>{fmt(galones, 1)} <small>gal</small></> : '—'}</strong><em>{vales.length} {vales.length === 1 ? 'vale' : 'vales'}</em></div>
      <div className="vk__t"><span className="vk__l">Rendimiento</span><strong>{rend != null ? <>{fmt(rend, 1)} <small>km/gal</small></> : '—'}</strong><em>Recorrido ÷ galones</em></div>
      <div className="vk__t"><span className="vk__l">Gasto de ruta</span><strong>{fila ? <>{fmt(fila.gastos_ruta)} <small>soles</small></> : '—'}</strong><em>Combustible y viáticos</em></div>
      <div className="vk__t"><span className="vk__l">Margen</span><strong style={{ color: fila && fila.margen < 0 ? 'var(--red-ink)' : undefined }}>{fila ? <>{fmt(fila.margen)} <small>soles</small></> : '—'}</strong><em>{fila?.rentabilidad_pct != null ? `${fila.rentabilidad_pct} % del flete` : 'Sin flete registrado'}</em></div>
    </div>
  );
}

interface Evento { t: Date; titulo: string; detalle: string; tono: 'verde' | 'ambar' | 'violeta' | 'azul' | 'gris'; icono: ReactNode }
const etiquetaFecha = (d: Date) => {
  const hoy = new Date();
  const mismo = d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  return mismo ? hora(d) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora(d)}`;
};

/** Bitácora armada solo con hechos registrados: creación, salida, vales, gastos y llegada. */
export function BitacoraViaje({ v }: { v: ViajeBase }) {
  const { vales, gastos } = useDatosViaje(v);
  const eventos = useMemo(() => {
    const lista: Evento[] = [];
    const push = (cuando: string | null | undefined, e: Omit<Evento, 't'>) => { const d = aFecha(cuando ?? null); if (d && !Number.isNaN(d.getTime())) lista.push({ ...e, t: d }); };
    push(v.registrado_fmt, { titulo: 'Viaje creado', detalle: `${v.cant_ordenes} ${v.cant_ordenes === 1 ? 'orden de servicio asignada' : 'órdenes de servicio asignadas'}`, tono: 'gris', icono: <FilePlus2 size={16} /> });
    push(v.fecha_inicio, { titulo: 'Viaje iniciado', detalle: v.kilometraje_inicial != null ? `Km de salida ${fmt(v.kilometraje_inicial)}` : 'Salida registrada', tono: 'verde', icono: <Play size={16} /> });
    push(v.fecha_fin, { titulo: 'Viaje finalizado', detalle: v.kilometraje_final != null ? `Km final ${fmt(v.kilometraje_final)}` : 'Llegada registrada', tono: 'azul', icono: <Flag size={16} /> });
    vales.forEach(x => push(x.fecha, { titulo: 'Vale de combustible', detalle: [`${fmt(x.galones, 1)} gal`, `S/ ${fmt(x.importe, 2)}`, x.estacion].filter(Boolean).join(' · '), tono: 'ambar', icono: <Fuel size={16} /> }));
    gastos.forEach(g => push(g.fecha, { titulo: 'Gasto registrado', detalle: [g.sub_motivo || g.tipo_gasto, `S/ ${fmt(g.importe, 2)}`].filter(Boolean).join(' · '), tono: 'violeta', icono: <Receipt size={16} /> }));
    return lista.sort((a, b) => b.t.getTime() - a.t.getTime());
  }, [v, vales, gastos]);
  return (
    <section className="vb">
      <h4 className="vj-titulo">Bitácora del viaje</h4>
      {eventos.length === 0 ? <p className="os-nota">Todavía no hay hechos registrados para este viaje.</p> : (
        <ul className="vb__lista">
          {eventos.map((e, i) => (
            <li key={`${e.titulo}-${e.t.getTime()}-${i}`} className="vb__fila">
              <span className={`vb__ico vb__ico--${e.tono}`} aria-hidden>{e.icono}</span>
              <div className="vb__txt"><strong>{e.titulo}</strong><span>{e.detalle}</span></div>
              <time>{etiquetaFecha(e.t)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Alerta de documentos vencidos y la ficha de unidad y carga. */
export function UnidadCargaViaje({ v, alertas }: { v: ViajeBase; alertas: AlertaDoc[] }) {
  const tercero = v.ejecucion === 'TERCERO';
  const filas: Array<[string, ReactNode, string?]> = [
    ['Tracto', v.placa_tracto ? <span className="tbl-placa">{v.placa_tracto}</span> : null, v.configuracion_tracto || undefined],
    ['Carreta', v.placa_remolque ? <span className="tbl-placa">{v.placa_remolque}</span> : null, v.configuracion_remolque || undefined],
    ['Km de salida', v.kilometraje_inicial != null ? fmt(v.kilometraje_inicial) : null],
    ['Km de llegada', v.kilometraje_final != null ? fmt(v.kilometraje_final) : null],
    ['Horas motor remolque', v.horas_motor_remolque != null ? fmt(v.horas_motor_remolque) : null],
    ['Carga de ida', num(v.peso_ida) > 0 ? `${fmt(v.peso_ida)} kg` : null],
    ['Carga de retorno', num(v.peso_retorno) > 0 ? `${fmt(v.peso_retorno)} kg` : null],
    ['Escolta', v.escolta || null],
    ['Costo del tercero', tercero && num(v.tercero_costo) > 0 ? `${/DOL/i.test(String(v.tercero_moneda ?? '')) ? 'US$' : 'S/'} ${fmt(v.tercero_costo, 2)}` : null],
    ['RUC del tercero', tercero ? (v.tercero_ruc || null) : null],
    ['Registrado por', v.usuario_creacion || null],
  ];
  return (
    <div className="vu">
      {alertas.map(a => (
        <div key={`${a.placa}-${a.tipo}`} className="vu__alerta" role="alert">
          <ShieldAlert size={20} aria-hidden />
          <div><strong>{a.tipo} vencido · {a.placa}</strong><span>Venció el {a.vence}. Renuévalo antes del próximo viaje.</span></div>
        </div>
      ))}
      <section className="vu__ficha">
        <h4 className="vj-titulo">Unidad y carga</h4>
        <dl>
          {filas.filter(f => f[1] !== null && f[1] !== undefined && f[1] !== '').map(([k, val, nota]) => (
            <div key={k} className="vu__fila"><dt>{k}</dt><dd>{nota ? <small>{nota}</small> : null}{val}</dd></div>
          ))}
        </dl>
        {v.observaciones ? <p className="os-nota" style={{ marginTop: 8 }}>{v.observaciones}</p> : null}
      </section>
    </div>
  );
}

export { SeguimientoServicio };
