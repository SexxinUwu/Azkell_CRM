// Historial / playback de una unidad: periodo, resumen, combustible, reproducción y lugares con hora.
// Cada bloque tiene su título; en celular se apila y se desplaza dentro de la hoja.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Clock, Fuel, Gauge, MapPin, Pause, Play, RotateCcw, Route, TriangleAlert, X } from 'lucide-react';
import { fechaHora, soloHora, type Historial } from './UbicacionHistorial';
import { FUEL_CAMBIO_PCT, type AnalisisCombustible } from './gps/combustible';

const HORAS = [6, 12, 24, 48];
const VELOCIDADES = [1, 2, 5, 10] as const;
export type Velocidad = 1 | 2 | 5 | 10;

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return aISO(x); };
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);

interface Props {
  placa: string;
  horas: number;
  onHoras: (h: number) => void;
  /** Día elegido ('AAAA-MM-DD') o null */
  dia: string | null;
  onDia: (d: string | null) => void;
  /** Rango libre 'AAAA-MM-DDTHH:mm' (hora local) o null */
  desde: string | null;
  hasta: string | null;
  onRango: (desde: string | null, hasta: string | null) => void;
  onIrA: (lat: number, lng: number) => void;
  historial: Historial | undefined;
  analisis: AnalisisCombustible;
  cargando: boolean;
  error: string;
  indice: number;
  onIndice: (i: number) => void;
  reproduciendo: boolean;
  onReproducir: () => void;
  onReiniciar: () => void;
  velocidad: Velocidad;
  onVelocidad: (v: Velocidad) => void;
  onSalir: () => void;
}

function GraficoCombustible({ a, t0, t1, tCursor, onElegir }: { a: AnalisisCombustible; t0: number; t1: number; tCursor: number | null; onElegir: (t: number) => void }) {
  const W = 300, H = 96, L = 24, B = 14, ancho = W - L - 4, alto = H - B - 4;
  const x = (t: number) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * ancho;
  const y = (v: number) => 4 + (1 - Math.max(0, Math.min(100, v)) / 100) * alto;
  const linea = a.serie.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="tg-h-grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nivel de combustible durante el recorrido"
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; onElegir(t0 + Math.max(0, Math.min(1, (px - L) / ancho)) * (t1 - t0)); }}>
      {[0, 50, 100].map(v => (
        <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} className="tg-h-rejilla" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="tg-h-eje">{v}</text></g>
      ))}
      <polyline points={linea} className="tg-h-linea" />
      {a.eventos.map(e => (
        <g key={e.t0}><rect x={x(e.t0) - 1.5} y={4} width={Math.max(3, x(e.t1) - x(e.t0) + 3)} height={alto} className={e.tipo === 'caida' ? 'tg-h-banda tg-h-banda--caida' : 'tg-h-banda tg-h-banda--recarga'} /></g>
      ))}
      {tCursor != null && <line x1={x(tCursor)} x2={x(tCursor)} y1={4} y2={4 + alto} className="tg-h-cursor" />}
      <text x={L} y={H - 2} className="tg-h-eje">{soloHora(t0)}</text>
      <text x={W - 4} y={H - 2} textAnchor="end" className="tg-h-eje">{soloHora(t1)}</text>
    </svg>
  );
}

export function PanelHistorial(p: Props) {
  const hoy = aISO(new Date());
  const [borrDesde, setBorrDesde] = useState(p.desde ?? '');
  const [borrHasta, setBorrHasta] = useState(p.hasta ?? '');
  const [errRango, setErrRango] = useState('');
  const [rangoAbierto, setRangoAbierto] = useState(!!p.desde);
  const minimo = aISO(new Date(Date.now() - 400 * 86400000)); // Wialon conserva 400 días
  const verRango = () => {
    const a = new Date(borrDesde).getTime(), b = new Date(borrHasta).getTime();
    if (!borrDesde || !borrHasta || isNaN(a) || isNaN(b)) return setErrRango('Elige fecha y hora de inicio y de fin.');
    if (b <= a) return setErrRango('El fin debe ser después del inicio.');
    if (b - a > 7 * 86400000) return setErrRango('El rango puede ser de máximo 7 días.');
    setErrRango('');
    p.onRango(borrDesde, borrHasta);
  };

  const h = p.historial;
  const puntos = h?.puntos ?? [];
  const punto = puntos[p.indice];
  const m = h?.metricas;
  const a = p.analisis;
  // Tiempo en ruta: suma de los tramos con la unidad en movimiento (sin contar huecos de más de 5 min sin señal)
  const minRuta = useMemo(() => {
    let s = 0;
    for (let i = 1; i < puntos.length; i++) {
      const dt = puntos[i].tiempo - puntos[i - 1].tiempo;
      if (puntos[i].velocidad > 3 && dt <= 300) s += dt;
    }
    return Math.round(s / 60);
  }, [puntos]);
  const t0 = puntos[0]?.tiempo ?? 0, t1 = puntos[puntos.length - 1]?.tiempo ?? 0;
  const irATiempo = (t: number) => {
    let mejor = 0, d = Infinity;
    puntos.forEach((q, i) => { const dd = Math.abs(q.tiempo - t); if (dd < d) { d = dd; mejor = i; } });
    p.onIndice(mejor);
  };
  const etiqueta = p.desde && p.hasta ? 'RANGO' : p.dia
    ? new Date(`${p.dia}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()
    : `ÚLTIMAS ${p.horas} H`;
  const subtitulo = p.cargando ? 'Cargando telemetría satelital…' : p.error ? p.error
    : puntos.length ? `${puntos.length.toLocaleString('es-PE')} puntos · ${fechaHora(t0)} a ${fechaHora(t1)}` : 'Sin recorrido en el rango elegido';
  const caidas = a.eventos.filter(e => e.tipo === 'caida');

  return (
    <div className="tg-h" aria-label={`Historial de ${p.placa}`}>
      <header className="tg-h-cab">
        <span className="tg-h-icono"><Route size={18} /></span>
        <div className="tg-h-titulo">
          <div><strong>{p.placa}</strong><span className="tg-h-etiqueta">{etiqueta}</span></div>
          <small className={p.error ? 'tg-h-error' : undefined}>{subtitulo}</small>
        </div>
        <button type="button" className="tg-x" onClick={p.onSalir} aria-label="Cerrar historial"><X size={16} /></button>
      </header>

      <section className="tg-h-sec">
        <h3>Periodo</h3>
        <div className="tg-h-chips" role="group" aria-label="Últimas horas">
          {HORAS.map(x => (
            <button key={x} type="button" className="tg-chip" aria-pressed={!p.dia && !p.desde && p.horas === x}
              onClick={() => { p.onDia(null); p.onRango(null, null); p.onHoras(x); }}>{x} h</button>
          ))}
        </div>
        <div className="tg-h-dia">
          <button type="button" aria-label="Día anterior" onClick={() => p.onDia(sumarDias(p.dia ?? hoy, -1))}><ChevronLeft size={16} /></button>
          <label><CalendarDays size={14} aria-hidden /><input type="date" value={p.dia ?? ''} min={minimo} max={hoy} aria-label="Día del recorrido" onChange={e => p.onDia(e.target.value || null)} /></label>
          <button type="button" aria-label="Día siguiente" disabled={!p.dia || p.dia >= hoy} onClick={() => p.onDia(p.dia && sumarDias(p.dia, 1) < hoy ? sumarDias(p.dia, 1) : null)}><ChevronRight size={16} /></button>
        </div>
        <button type="button" className="tg-h-acordeon" aria-expanded={rangoAbierto} onClick={() => setRangoAbierto(v => !v)}>
          Rango personalizado <small>máx. 7 días</small><ChevronRight size={14} />
        </button>
        {rangoAbierto && (
          <div className="tg-h-rango">
            <label>Desde<input type="datetime-local" value={borrDesde} min={`${minimo}T00:00`} max={`${hoy}T23:59`} onChange={e => setBorrDesde(e.target.value)} /></label>
            <label>Hasta<input type="datetime-local" value={borrHasta} min={`${minimo}T00:00`} max={`${hoy}T23:59`} onChange={e => setBorrHasta(e.target.value)} /></label>
            <button type="button" className="tg-btn primary" onClick={verRango}>Ver rango</button>
            {errRango && <p className="tg-h-error">{errRango}</p>}
          </div>
        )}
      </section>

      {h?.truncado && <p className="tg-h-aviso"><TriangleAlert size={14} />El rango es muy denso y el GPS no pudo cargarse completo; el trazado puede tener huecos.</p>}

      {m && puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3>Resumen</h3>
          <div className="tg-h-grid">
            <div className="tg-cell"><span className="tg-lbl">Recorrido</span><b className="mono">{m.totalKm.toLocaleString('es-PE')} km</b></div>
            <div className="tg-cell"><span className="tg-lbl">Tiempo en ruta</span><b className="mono">{dur(minRuta)}</b></div>
            <div className="tg-cell"><span className="tg-lbl">Vel. máx. / prom.</span><b className="mono">{Math.round(m.maxSpeed)} / {Math.round(m.avgSpeed)} km/h</b></div>
            <div className="tg-cell"><span className="tg-lbl">Paradas</span><b className="mono">{h?.paradas.length ?? m.paradasTotal}</b></div>
          </div>
        </section>
      )}

      {puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3><Fuel size={13} aria-hidden />Combustible{h?.sensorCombustible && <small>{h.sensorCombustible}</small>}</h3>
          {!a.hay ? (
            <p className="tg-h-vacio">{h?.sensorCombustible ? 'El sensor no reportó nivel en este rango.' : 'Esta unidad no tiene sensor de nivel de combustible en Wialon.'}</p>
          ) : (
            <>
              <div className="tg-h-grid tg-h-grid--3">
                <div className="tg-cell"><span className="tg-lbl">Al inicio</span><b className="mono">{a.inicio}%</b></div>
                <div className="tg-cell"><span className="tg-lbl">Al final</span><b className="mono">{a.fin}%</b></div>
                <div className="tg-cell"><span className="tg-lbl">Mínimo</span><b className="mono">{a.minimo}%</b></div>
              </div>
              <GraficoCombustible a={a} t0={t0} t1={t1} tCursor={punto?.tiempo ?? null} onElegir={irATiempo} />
              {a.eventos.length === 0 ? (
                <p className="tg-h-ok">Sin caídas ni recargas bruscas (cambios de {FUEL_CAMBIO_PCT} puntos o más en 20 min).</p>
              ) : (
                <ul className="tg-h-eventos">
                  {a.eventos.map(e => (
                    <li key={e.t0}>
                      <button type="button" className={`tg-h-evento tg-h-evento--${e.tipo}`} onClick={() => p.onIrA(e.lat, e.lng)}>
                        <span className="tg-h-evento__icono">{e.tipo === 'caida' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</span>
                        <span>
                          <b>{e.tipo === 'caida' ? (e.detenida ? 'Caída brusca con la unidad detenida' : 'Caída brusca') : 'Recarga'}: {e.desde}% → {e.hasta}%</b>
                          <small>{soloHora(e.t0)} a {soloHora(e.t1)}{e.tipo === 'caida' && e.detenida ? ' · posible extracción, revisar' : ''}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {caidas.length > 0 && <p className="tg-h-nota">Se marcan con ⛽ sobre la ruta.</p>}
            </>
          )}
        </section>
      )}

      {puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3>Reproducción</h3>
          <input type="range" className="tg-h-barra" min={0} max={puntos.length - 1} value={p.indice} onChange={e => p.onIndice(Number(e.target.value))} aria-label="Momento del recorrido" />
          {punto && (
            <div className="tg-h-punto">
              <span className="tg-h-hora">{fechaHora(punto.tiempo)}</span>
              <span><Gauge size={13} aria-hidden /> <b>{Math.round(punto.velocidad)} km/h</b></span>
              <span>Motor {punto.ignicion ? 'ON' : 'OFF'}</span>
              {punto.altitud ? <span>{Math.round(punto.altitud)} msnm</span> : null}
              {punto.combustible != null && <span><Fuel size={13} aria-hidden /> <b>{Math.round(punto.combustible)}%</b></span>}
            </div>
          )}
          <div className="tg-h-controles">
            <button type="button" className="tg-h-btn" onClick={p.onReiniciar} aria-label="Volver al inicio"><RotateCcw size={16} /></button>
            <button type="button" className="tg-h-play" onClick={p.onReproducir} aria-label={p.reproduciendo ? 'Pausar' : 'Reproducir'}>
              {p.reproduciendo ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <div className="tg-h-chips" role="group" aria-label="Velocidad de reproducción">
              {VELOCIDADES.map(v => <button key={v} type="button" className="tg-chip" aria-pressed={p.velocidad === v} onClick={() => p.onVelocidad(v)}>{v}x</button>)}
            </div>
          </div>
        </section>
      )}

      {h && puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3><Clock size={13} aria-hidden />Lugares y horas</h3>
          <ol className="tg-h-lugares">
            <li><button type="button" onClick={() => p.onIrA(puntos[0].lat, puntos[0].lng)}>
              <span className="tg-h-punto-linea tg-h-punto-linea--ini" /><span className="tg-h-hora">{soloHora(t0)}</span>
              <span className="tg-h-lugar"><b>Inicio</b><small>{fechaHora(t0)}</small></span></button></li>
            {h.paradas.map((s, i) => {
              const n = a.paradas.get(s.startT);
              const baja = n && n.antes != null && n.despues != null && n.antes - n.despues >= FUEL_CAMBIO_PCT;
              return (
                <li key={s.startT}><button type="button" onClick={() => p.onIrA(s.lat, s.lng)}>
                  <span className="tg-h-punto-linea tg-h-punto-linea--parada" /><span className="tg-h-hora">{soloHora(s.startT)}</span>
                  <span className="tg-h-lugar">
                    <b><MapPin size={12} aria-hidden /> Parada {i + 1} · {dur(s.durMin)}</b>
                    <small>{soloHora(s.startT)} a {soloHora(s.endT)}</small>
                    {n && n.antes != null && n.despues != null && (
                      <small className={baja ? 'tg-h-combu tg-h-combu--baja' : 'tg-h-combu'}><Fuel size={11} aria-hidden /> {n.antes}% → {n.despues}%{baja ? ' · bajó durante la parada' : ''}</small>
                    )}
                  </span></button></li>
              );
            })}
            <li><button type="button" onClick={() => p.onIrA(puntos[puntos.length - 1].lat, puntos[puntos.length - 1].lng)}>
              <span className="tg-h-punto-linea tg-h-punto-linea--fin" /><span className="tg-h-hora">{soloHora(t1)}</span>
              <span className="tg-h-lugar"><b>Fin</b><small>{fechaHora(t1)}</small></span></button></li>
          </ol>
        </section>
      )}
    </div>
  );
}
