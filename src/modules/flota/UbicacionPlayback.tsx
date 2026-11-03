// Historial / playback de una unidad: periodo, resumen, combustible, viajes y paradas con hora, y reproducción.
// Cada bloque tiene su título; en celular se apila y se desplaza dentro de la hoja.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Clock, Fuel, Gauge, MapPin, Pause, Play, RotateCcw, Route, TriangleAlert, X } from 'lucide-react';
import { fechaHora, soloHora, type Historial } from './UbicacionHistorial';
import { FUEL_CAMBIO_PCT, type AnalisisCombustible } from './gps/combustible';
import { VELOCIDADES_REP, type VelocidadRep } from './gps/BarraReproduccion';
import type { Tramo } from './gps/viajes';
import { AsaHoja, ZonaArrastre } from './gps/HojaGesto';
import { Button } from '../../core/ui/Button';
import { ChoiceChips } from '../../core/ui/Chips';
import { SegmentedControl } from '../../core/ui/SegmentedControl';

const HORAS = [6, 12, 24, 48];
export type Velocidad = VelocidadRep;

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aLocal = (d: Date) => `${aISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  tramos: Tramo[];
  viajeSel: number | null;
  onViaje: (n: number | null) => void;
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
  const max = a.unidad === '%' ? 100 : Math.max(...a.serie.map(s => s[1]), 1);
  const x = (t: number) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * ancho;
  const y = (v: number) => 4 + (1 - Math.max(0, Math.min(max, v)) / max) * alto;
  const linea = a.serie.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="tg-h-grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nivel de combustible durante el recorrido"
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; onElegir(t0 + Math.max(0, Math.min(1, (px - L) / ancho)) * (t1 - t0)); }}>
      {[0, max / 2, max].map(v => (
        <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} className="tg-h-rejilla" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="tg-h-eje">{Math.round(v)}</text></g>
      ))}
      <polyline points={linea} className="tg-h-linea" />
      {a.eventos.map(e => (
        <rect key={e.t0} x={x(e.t0) - 1.5} y={4} width={Math.max(3, x(e.t1) - x(e.t0) + 3)} height={alto} className={e.tipo === 'caida' ? 'tg-h-banda tg-h-banda--caida' : 'tg-h-banda tg-h-banda--recarga'} />
      ))}
      {tCursor != null && <line x1={x(tCursor)} x2={x(tCursor)} y1={4} y2={4 + alto} className="tg-h-cursor" />}
      <text x={L} y={H - 2} className="tg-h-eje">{soloHora(t0)}</text>
      <text x={W - 4} y={H - 2} textAnchor="end" className="tg-h-eje">{soloHora(t1)}</text>
    </svg>
  );
}

export function PanelHistorial(p: Props) {
  const hoy = aISO(new Date());
  const ayer = sumarDias(hoy, -1);
  const [borrDesde, setBorrDesde] = useState(p.desde ?? '');
  const [borrHasta, setBorrHasta] = useState(p.hasta ?? '');
  const [errRango, setErrRango] = useState('');
  const [rangoAbierto, setRangoAbierto] = useState(false);
  const minimo = aISO(new Date(Date.now() - 400 * 86400000)); // Wialon conserva 400 días
  const esSemana = !!(p.desde && p.hasta && Math.abs(new Date(p.hasta).getTime() - new Date(p.desde).getTime() - 7 * 86400000) < 3600000);
  const verRango = () => {
    const a = new Date(borrDesde).getTime(), b = new Date(borrHasta).getTime();
    if (!borrDesde || !borrHasta || isNaN(a) || isNaN(b)) return setErrRango('Elige fecha y hora de inicio y de fin.');
    if (b <= a) return setErrRango('El fin debe ser después del inicio.');
    if (b - a > 7 * 86400000) return setErrRango('El rango puede ser de máximo 7 días.');
    setErrRango('');
    p.onRango(borrDesde, borrHasta);
  };
  const semana = () => { const fin = new Date(), ini = new Date(fin.getTime() - 7 * 86400000); setBorrDesde(aLocal(ini)); setBorrHasta(aLocal(fin)); p.onRango(aLocal(ini), aLocal(fin)); };

  const h = p.historial;
  const puntos = h?.puntos ?? [];
  const punto = puntos[p.indice];
  const m = h?.metricas;
  const a = p.analisis;
  const U = a.unidad === '%' ? '%' : ' gal';
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
  const etiqueta = p.desde && p.hasta ? (esSemana ? 'SEMANA' : 'RANGO') : p.dia
    ? (p.dia === hoy ? 'HOY' : p.dia === ayer ? 'AYER' : new Date(`${p.dia}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase())
    : `ÚLTIMAS ${p.horas} H`;
  const subtitulo = p.cargando ? 'Cargando telemetría satelital…' : p.error ? p.error
    : puntos.length ? `${puntos.length.toLocaleString('es-PE')} puntos · ${fechaHora(t0)} a ${fechaHora(t1)}` : 'Sin recorrido en el rango elegido';

  return (
    <div className="tg-h" aria-label={`Historial de ${p.placa}`}>
      <AsaHoja />
      <ZonaArrastre className="tg-h-cab">
        <span className="tg-h-icono"><Route size={18} /></span>
        <div className="tg-h-titulo">
          <div><strong>{p.placa}</strong><span className="tg-h-etiqueta">{etiqueta}</span></div>
          <small className={p.error ? 'tg-h-error' : undefined}>{subtitulo}</small>
        </div>
        <Button variant="plain" iconOnly icon={<X size={18} />} aria-label="Cerrar historial" onClick={p.onSalir} />
      </ZonaArrastre>

      <section className="tg-h-sec">
        <h3>Periodo</h3>
        <ChoiceChips label="Periodo" value={p.dia === hoy ? 'hoy' : p.dia === ayer ? 'ayer' : esSemana ? 'semana' : (!p.dia && !p.desde ? `h${p.horas}` : '')}
          onChange={v => {
            if (v === 'hoy') p.onDia(hoy); else if (v === 'ayer') p.onDia(ayer); else if (v === 'semana') semana();
            else { p.onDia(null); p.onRango(null, null); p.onHoras(Number(v.slice(1))); }
          }}
          options={[{ value: 'hoy', label: 'Hoy' }, { value: 'ayer', label: 'Ayer' }, { value: 'semana', label: 'Semana' }, ...HORAS.map(x => ({ value: `h${x}`, label: `${x} h` }))]} />
        <div className="tg-h-dia">
          <Button variant="secondary" iconOnly icon={<ChevronLeft size={18} />} aria-label="Día anterior" onClick={() => p.onDia(sumarDias(p.dia ?? hoy, -1))} />
          <label><CalendarDays size={14} aria-hidden /><input type="date" value={p.dia ?? ''} min={minimo} max={hoy} aria-label="Día del recorrido" onChange={e => p.onDia(e.target.value || null)} /></label>
          <Button variant="secondary" iconOnly icon={<ChevronRight size={18} />} aria-label="Día siguiente" disabled={!p.dia || p.dia >= hoy} onClick={() => p.onDia(p.dia && sumarDias(p.dia, 1) < hoy ? sumarDias(p.dia, 1) : null)} />
        </div>
        <button type="button" className="tg-h-acordeon" aria-expanded={rangoAbierto} onClick={() => setRangoAbierto(v => !v)}>
          Rango personalizado <small>máx. 7 días</small><ChevronRight size={14} />
        </button>
        {rangoAbierto && (
          <div className="tg-h-rango">
            <label>Desde<input type="datetime-local" value={borrDesde} min={`${minimo}T00:00`} max={`${hoy}T23:59`} onChange={e => setBorrDesde(e.target.value)} /></label>
            <label>Hasta<input type="datetime-local" value={borrHasta} min={`${minimo}T00:00`} max={`${hoy}T23:59`} onChange={e => setBorrHasta(e.target.value)} /></label>
            <Button variant="primary" block onClick={verRango}>Ver rango</Button>
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
            <div className="tg-cell"><span className="tg-lbl">Viajes / paradas</span><b className="mono">{p.tramos.filter(t => t.tipo === 'viaje').length} / {h?.paradas.length ?? m.paradasTotal}</b></div>
          </div>
        </section>
      )}

      {puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3><Fuel size={13} aria-hidden />Combustible{h?.sensorCombustible && <small>{h.sensorCombustible}</small>}</h3>
          {!a.hay ? (
            <p className="tg-h-vacio">{h?.sensorCombustible ? 'El sensor no reportó un nivel válido en este rango.' : 'Esta unidad no tiene sensor de nivel de combustible en Wialon.'}</p>
          ) : (
            <>
              <div className="tg-h-grid tg-h-grid--3">
                <div className="tg-cell"><span className="tg-lbl">Al inicio</span><b className="mono">{a.inicio}{U}</b></div>
                <div className="tg-cell"><span className="tg-lbl">Al final</span><b className="mono">{a.fin}{U}</b></div>
                <div className="tg-cell"><span className="tg-lbl">Mínimo</span><b className="mono">{a.minimo}{U}</b></div>
              </div>
              <GraficoCombustible a={a} t0={t0} t1={t1} tCursor={punto?.tiempo ?? null} onElegir={irATiempo} />
              {a.eventos.length === 0 ? (
                <p className="tg-h-ok">Sin caídas ni recargas bruscas (cambios de {FUEL_CAMBIO_PCT}{U} o más en 20 min).</p>
              ) : (
                <ul className="tg-h-eventos">
                  {a.eventos.map(e => (
                    <li key={e.t0}>
                      <button type="button" className={`tg-h-evento tg-h-evento--${e.tipo}`} onClick={() => p.onIrA(e.lat, e.lng)}>
                        <span className="tg-h-evento__icono">{e.tipo === 'caida' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</span>
                        <span>
                          <b>{e.tipo === 'caida' ? (e.detenida ? 'Caída brusca con la unidad detenida' : 'Caída brusca') : 'Recarga'}: {e.desde}{U} → {e.hasta}{U}</b>
                          <small>{soloHora(e.t0)} a {soloHora(e.t1)}{e.tipo === 'caida' && e.detenida ? ' · posible extracción, revisar' : ''}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {/* En escritorio la reproducción va en la barra inferior del mapa; en celular, aquí */}
      {puntos.length > 0 && (
        <section className="tg-h-sec tg-h-sec--rep">
          <h3>Reproducción</h3>
          <input type="range" className="tg-h-barra" min={0} max={puntos.length - 1} value={p.indice} onChange={e => p.onIndice(Number(e.target.value))} aria-label="Momento del recorrido" />
          {punto && (
            <div className="tg-h-punto">
              <span className="tg-h-hora">{fechaHora(punto.tiempo)}</span>
              <span><Gauge size={13} aria-hidden /> <b>{Math.round(punto.velocidad)} km/h</b></span>
              <span>Motor {punto.ignicion ? 'ON' : 'OFF'}</span>
              {punto.combustible != null && <span><Fuel size={13} aria-hidden /> <b>{Math.round(punto.combustible)}</b></span>}
            </div>
          )}
          <div className="tg-h-controles">
            <Button variant="secondary" iconOnly icon={<RotateCcw size={18} />} aria-label="Volver al inicio" onClick={p.onReiniciar} />
            <Button variant="primary" iconOnly icon={p.reproduciendo ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} aria-label={p.reproduciendo ? 'Pausar' : 'Reproducir'} onClick={p.onReproducir} />
            <SegmentedControl label="Velocidad de reproducción" value={String(p.velocidad) as '1' | '5' | '10' | '100'} onChange={v => p.onVelocidad(Number(v) as Velocidad)} options={VELOCIDADES_REP.map(v => ({ value: String(v) as '1' | '5' | '10' | '100', label: `${v}x` }))} />
          </div>
        </section>
      )}

      {h && puntos.length > 0 && (
        <section className="tg-h-sec">
          <h3><Clock size={13} aria-hidden />Viajes y paradas</h3>
          <ol className="tg-h-lugares">
            {p.tramos.length === 0 && <li className="tg-h-vacio">Sin viajes en este periodo.</li>}
            {p.tramos.map(t => {
              if (t.tipo === 'viaje') {
                const v = t.viaje, sel = p.viajeSel === v.n - 1;
                return (
                  <li key={`v${v.n}`}>
                    <button type="button" className={`tg-h-viaje${sel ? ' tg-h-viaje--sel' : ''}`} aria-pressed={sel}
                      onClick={() => { p.onViaje(sel ? null : v.n - 1); p.onIndice(v.rango[0]); }}>
                      <span className="tg-h-viaje__num">{v.n}</span>
                      <span className="tg-h-lugar">
                        <b>Viaje {v.n} · {v.km.toLocaleString('es-PE')} km</b>
                        <small>{soloHora(v.t0)} → {soloHora(v.t1)} · {dur(v.durMin)} · prom. {v.vProm} km/h</small>
                        {v.combIni != null && v.combFin != null && <small className="tg-h-combu"><Fuel size={11} aria-hidden /> {v.combIni}{U} → {v.combFin}{U}</small>}
                      </span>
                    </button>
                  </li>
                );
              }
              const s = t.parada, n = t.nivel;
              const baja = n && n.antes != null && n.despues != null && n.antes - n.despues >= FUEL_CAMBIO_PCT;
              return (
                <li key={`p${s.startT}`}>
                  <button type="button" className={`tg-h-parada${baja ? ' tg-h-parada--baja' : ''}`} onClick={() => p.onIrA(s.lat, s.lng)}>
                    <span className="tg-h-parada__p">{baja ? '⛽' : 'P'}</span>
                    <span className="tg-h-lugar">
                      <b><MapPin size={12} aria-hidden /> Parada {t.n} · {dur(s.durMin)}</b>
                      <small>{soloHora(s.startT)} a {soloHora(s.endT)}</small>
                      {n && n.antes != null && n.despues != null && (
                        <small className={baja ? 'tg-h-combu tg-h-combu--baja' : 'tg-h-combu'}><Fuel size={11} aria-hidden /> {n.antes}{U} → {n.despues}{U}{baja ? ' · bajó durante la parada' : ''}</small>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
