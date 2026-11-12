import './seguimiento.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Phone } from 'lucide-react';
import { BrandMark } from '../../core/layout/BrandMark';

export interface ViajeSeguimiento {
  viaje: string; estado?: string | null; conductor?: string | null; placa_tracto?: string | null; placa_remolque?: string | null;
  ejecucion?: string | null; tercero_nombre?: string | null; vinculado_en?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null;
  km_recorrido_gps?: number | string | null; conductor_telefono?: string | null;
}
export interface DatosSeguimiento {
  codigo_orden: string; cliente_nombre?: string | null; origen?: string | null; destino?: string | null; es_retorno?: number | boolean | null;
  distancia_km?: number | string | null; creado_fmt?: string | null; viajes?: ViajeSeguimiento[];
}

const VELOCIDAD_PROMEDIO = 55; // km/h, solo para estimar cuando no hay lectura de GPS
const PARADAS = [0, 1 / 3, 2 / 3, 1];
const ETAPAS = ['Pendiente', 'Programado', 'En ejecución', 'Entregado'];
const ESTADO_IDX: Record<string, number> = { PENDIENTE: 0, PROGRAMADO: 1, EN_EJECUCION: 2, ENTREGADO: 3 };
const PILL: Record<string, string> = { PENDIENTE: 'Pendiente', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ruta', ENTREGADO: 'Entregado', ANULADO: 'Anulado' };

const num = (v: unknown) => Number(v) || 0;
const aFecha = (t?: string | null) => (t ? new Date(t.replace(' ', 'T')) : null);
const hora = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const dia = (t?: string | null) => (t ? t.slice(8, 10) + '/' + t.slice(5, 7) : '');
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const duracion = (min: number) => { const m = Math.max(1, Math.round(min)); const h = Math.floor(m / 60); return h ? `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`; };

/**
 * Seguimiento del servicio: estado, camión que avanza por la ruta, conductor e historial.
 * Todo sale de datos reales (fechas del viaje, kilómetros del GPS); la llegada se estima con una velocidad promedio.
 */
export function SeguimientoServicio({ o, estado, tipo = 'servicio' }: { o: DatosSeguimiento; estado: string; tipo?: 'servicio' | 'viaje' }) {
  const viaje = tipo === 'viaje';
  const etapas = viaje ? ['Registrado', 'Programado', 'En ruta', 'Finalizado'] : ETAPAS;
  const v = o.viajes?.[0];
  const idx = ESTADO_IDX[estado] ?? 0;
  const anulada = estado === 'ANULADO';
  const enRuta = estado === 'EN_EJECUCION';
  const dist = num(o.distancia_km);
  const tercero = v?.ejecucion === 'TERCERO';

  // En ruta se recalcula cada 30 s
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!enRuta) return;
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [enRuta]);

  const calc = useMemo(() => {
    const salida = aFecha(v?.fecha_inicio);
    let frac = 0;
    let estimado = true;
    if (enRuta && dist > 0) {
      const gps = num(v?.km_recorrido_gps);
      if (gps > 0) { frac = gps / dist; estimado = false; }
      else if (salida) frac = ((ahora - salida.getTime()) / 3_600_000) * VELOCIDAD_PROMEDIO / dist;
      frac = Math.min(0.97, Math.max(0.02, frac));
    }
    const restante = dist * (1 - frac);
    const etaMin = dist > 0 ? Math.max(1, (restante / VELOCIDAD_PROMEDIO) * 60) : 0;
    const llegada = new Date(ahora + etaMin * 60_000);
    const pos = anulada ? 0 : estado === 'ENTREGADO' ? 1 : idx === 2 ? PARADAS[2] + (PARADAS[3] - PARADAS[2]) * frac : PARADAS[idx];
    return { frac, restante, etaMin, llegada, pos, estimado };
  }, [v, enRuta, dist, ahora, anulada, estado, idx]);

  // El camión rueda mientras avanza entre paradas o cuando va en ruta
  const [mueve, setMueve] = useState(false);
  const posPrevia = useRef<number | null>(null);
  useEffect(() => {
    if (posPrevia.current === null || Math.abs(posPrevia.current - calc.pos) < 0.001) { posPrevia.current = calc.pos; return; }
    posPrevia.current = calc.pos;
    setMueve(true);
    const t = window.setTimeout(() => setMueve(false), 1400);
    return () => window.clearTimeout(t);
  }, [calc.pos]);
  const rodando = mueve || enRuta;

  const cliente = o.cliente_nombre || 'Sin cliente';
  const tramo = [o.origen, o.destino].filter(Boolean).join(' → ') || 'Sin ruta';
  const salida = aFecha(v?.fecha_inicio);
  const fin = aFecha(v?.fecha_fin);

  const titulo = anulada ? (viaje ? 'Viaje anulado' : 'Servicio anulado')
    : estado === 'ENTREGADO' ? (viaje ? '¡Viaje finalizado!' : '¡Entregado!')
    : enRuta ? (dist > 0 ? `Llega en ${duracion(calc.etaMin)}` : 'En ruta')
    : estado === 'PROGRAMADO' ? 'Programado' : (viaje ? 'Viaje registrado' : 'Pedido recibido');
  const sub = anulada ? 'Ya no se ejecutará'
    : estado === 'ENTREGADO' ? `Llegó a las ${hora(fin)}`
    : enRuta ? (dist > 0 ? `Hora estimada ${hora(calc.llegada)} · ${calc.restante.toFixed(0)} km restantes` : 'Sin distancia de referencia')
    : estado === 'PROGRAMADO' ? (tercero ? `Lo lleva ${v?.tercero_nombre || 'un transportista tercero'}` : v?.conductor ? `Sale con ${v.conductor}` : 'Falta asignar conductor') : (viaje ? 'Falta asignar conductor y unidad' : 'Esperando programación');

  const tiempos = [
    hora(aFecha(o.creado_fmt)),
    v?.vinculado_en ? hora(aFecha(v.vinculado_en)) : '—',
    salida ? hora(salida) : '—',
    fin ? hora(fin) : enRuta && dist > 0 ? `Est. ${hora(calc.llegada)}` : '—',
  ];

  const eventos = [
    estado === 'ENTREGADO' && v?.fecha_fin ? { t: v.fecha_fin, titulo: viaje ? 'Viaje finalizado' : 'Entregado', detalle: 'Servicio concluido', tono: '' } : null,
    v?.fecha_inicio ? { t: v.fecha_inicio, titulo: 'Salió a ruta', detalle: [v.conductor, v.placa_tracto].filter(Boolean).join(' · ') || v.viaje, tono: '' } : null,
    v?.vinculado_en ? { t: v.vinculado_en, titulo: 'Ruta programada', detalle: `Viaje ${v.viaje}${v.conductor ? ` · ${v.conductor}` : ''}`, tono: '' } : null,
    o.creado_fmt ? { t: o.creado_fmt, titulo: viaje ? 'Viaje registrado' : 'Pedido registrado', detalle: `${cliente} · ${tramo}`, tono: '' } : null,
  ].filter((e): e is { t: string; titulo: string; detalle: string; tono: string } => !!e);

  const tel = (v?.conductor_telefono ?? '').replace(/\D/g, '');
  const nombreConductor = tercero ? (v?.tercero_nombre ?? 'Transportista tercero') : (v?.conductor ?? '');

  return (
    <section className={`seg${anulada ? ' seg--anulada' : ''}`} aria-label="Seguimiento del servicio">
      <header className="seg__cab">
        <div className="seg__id">
          <span className="seg__orden"><BrandMark size={22} /> {o.codigo_orden}{o.es_retorno ? ' · retorno' : ''}</span>
          <h3 className="seg__titulo">{titulo}</h3>
          <p className="seg__sub">{sub}</p>
        </div>
        <span className={`seg__pill${enRuta ? ' seg__pill--vivo' : ''}${anulada ? ' seg__pill--gris' : ''}`}><i />{(viaje ? { ...PILL, PENDIENTE: 'Registrado', ENTREGADO: 'Finalizado' } : PILL)[estado] ?? estado}</span>
      </header>

      <div className="seg__ruta">
        <strong>{tramo}</strong>{dist > 0 && <span>{dist.toLocaleString('es-PE')} km</span>}
      </div>

      <div className="seg__escena">
        <div className="seg__pista">
          <div className="seg__linea" />
          <div className="seg__avance" style={{ width: `${calc.pos * 100}%` }} />
          {PARADAS.map((p, i) => {
            const hecha = !anulada && (i < idx || (estado === 'ENTREGADO' && i === 3));
            const actual = !anulada && i === idx && estado !== 'ENTREGADO';
            return (
              <span key={p} className={`seg__parada${hecha ? ' seg__parada--hecha' : ''}${actual ? ' seg__parada--actual' : ''}`} style={{ left: `${p * 100}%` }}>
                <Check size={12} strokeWidth={3} aria-hidden />
              </span>
            );
          })}
          <div className={`seg__camion${rodando ? ' seg__camion--rueda' : ''}${calc.pos > 0.82 ? ' seg__camion--borde' : ''}`} style={{ left: `${calc.pos * 100}%` }} aria-hidden>
            {enRuta && dist > 0 && <span className="seg__globo">{calc.restante.toFixed(0)} km · {duracion(calc.etaMin)}</span>}
            <svg viewBox="0 0 42 28">
              <g className="seg__cuerpo">
                <rect x="1" y="2" width="26" height="17" rx="2.5" className="seg__verde" />
                <rect x="4" y="5" width="20" height="2" rx="1" fill="#fff" opacity=".25" />
                <path d="M27 7.5h7l5 6V19H27z" className="seg__verde" />
                <path d="M29 9.5h4.1l3.2 3.9H29z" fill="#fff" opacity=".85" />
                <path className="seg__luces" d="M39 15.5l8 -2.5v6z" fill="#ffd34d" opacity=".5" />
                <rect x="38" y="15" width="2" height="2" rx=".6" fill="#ffd34d" />
              </g>
              <g className="seg__rueda"><circle cx="8" cy="21" r="4.3" fill="#1a1a1a" /><circle cx="8" cy="21" r="1.6" fill="#777" /><rect x="7.4" y="17.2" width="1.2" height="2" fill="#777" /></g>
              <g className="seg__rueda"><circle cx="33" cy="21" r="4.3" fill="#1a1a1a" /><circle cx="33" cy="21" r="1.6" fill="#777" /><rect x="32.4" y="17.2" width="1.2" height="2" fill="#777" /></g>
            </svg>
          </div>
        </div>
        <div className="seg__etapas">
          {etapas.map((e, i) => (
            <div key={e} className={!anulada && i === idx ? 'seg__etapa seg__etapa--on' : 'seg__etapa'}>
              <b>{e}</b><time>{tiempos[i]}</time>
            </div>
          ))}
        </div>
      </div>

      <div className={`seg__pie${v && nombreConductor ? '' : ' seg__pie--solo'}`}>
      {v && nombreConductor && (
        <div className="seg__conductor">
          <span className="seg__avatar">{iniciales(nombreConductor)}</span>
          <div className="seg__quien">
            <strong>{nombreConductor}</strong>
            <span>{tercero ? 'Transportista tercero' : 'Flota propia'}{v.placa_tracto && <> · <span className="seg__placa">{v.placa_tracto}</span></>}{v.placa_remolque && <> · <span className="seg__placa">{v.placa_remolque}</span></>}</span>
          </div>
          {tel.length >= 7 && <a className="seg__llamar" href={`tel:${tel}`} aria-label="Llamar al conductor"><Phone size={16} /></a>}
        </div>
      )}

      <div className="seg__historial">
        <h4>Historial <span>{eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'}</span></h4>
        <ul>
          {eventos.map((e, i) => (
            <li key={e.titulo} className={i === 0 ? 'seg__ev seg__ev--ultimo' : 'seg__ev'}>
              <time>{hora(aFecha(e.t))}<small>{dia(e.t)}</small></time>
              <span className="seg__marca" aria-hidden />
              <div><strong>{e.titulo}</strong><span>{e.detalle}</span></div>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </section>
  );
}
