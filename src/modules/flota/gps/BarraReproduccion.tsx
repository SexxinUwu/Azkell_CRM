// Barra de reproducción del historial: franjas de estado (movimiento, ralentí, parada), curva de combustible y velocidades.
import { useMemo, useRef } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '../../../core/ui/Button';
import { SegmentedControl } from '../../../core/ui/SegmentedControl';
import { fechaHora, type Historial } from '../UbicacionHistorial';
import type { AnalisisCombustible } from './combustible';

export const VELOCIDADES_REP = [1, 5, 10, 100] as const;
export type VelocidadRep = typeof VELOCIDADES_REP[number];

const COLOR = { mov: '#22e3a0', ral: '#ffb020', det: '#8a9ab0' };

interface Props {
  historial: Historial;
  analisis: AnalisisCombustible;
  indice: number;
  onIndice: (i: number) => void;
  reproduciendo: boolean;
  onReproducir: () => void;
  onReiniciar: () => void;
  velocidad: VelocidadRep;
  onVelocidad: (v: VelocidadRep) => void;
}

export function BarraReproduccion({ historial: h, analisis: a, indice, onIndice, reproduciendo, onReproducir, onReiniciar, velocidad, onVelocidad }: Props) {
  const pts = h.puntos;
  const t0 = pts[0]?.tiempo ?? 0, t1 = pts[pts.length - 1]?.tiempo ?? 1, span = Math.max(1, t1 - t0);
  const ref = useRef<SVGSVGElement>(null);
  const W = 1000;
  const x = (t: number) => (t - t0) / span * W;

  // Franjas: tramos consecutivos con el mismo estado
  const franjas = useMemo(() => {
    const out: Array<{ a: number; b: number; e: 'mov' | 'ral' | 'det' }> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const e = p.velocidad > 3 ? 'mov' : p.ignicion ? 'ral' : 'det';
      const ult = out[out.length - 1];
      if (ult && ult.e === e) ult.b = pts[i + 1].tiempo; else out.push({ a: p.tiempo, b: pts[i + 1].tiempo, e });
    }
    return out;
  }, [pts]);
  const curva = useMemo(() => {
    if (!a.hay) return '';
    const max = a.unidad === '%' ? 100 : Math.max(...a.serie.map(s => s[1]), 1);
    return a.serie.map(([t, v]) => `${x(t).toFixed(1)},${(4 + (1 - Math.min(1, v / max)) * 20).toFixed(1)}`).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, t0, span]);

  const elegir = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !pts.length) return;
    const t = t0 + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span;
    let mejor = 0, d = Infinity;
    pts.forEach((q, i) => { const dd = Math.abs(q.tiempo - t); if (dd < d) { d = dd; mejor = i; } });
    onIndice(mejor);
  };
  const p = pts[indice];

  return (
    <div className="tg-rep tg-glass" role="group" aria-label="Reproducción del recorrido">
      <div className="tg-rep__ctrl">
        <Button variant="secondary" iconOnly icon={<RotateCcw size={18} />} aria-label="Volver al inicio" onClick={onReiniciar} />
        <Button variant="primary" iconOnly icon={reproduciendo ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} onClick={onReproducir} />
      </div>
      <div className="tg-rep__centro">
        <div className="tg-rep__info">
          <b className="tg-h-hora">{p ? fechaHora(p.tiempo) : '—'}</b>
          {p && <span>{Math.round(p.velocidad)} km/h · {p.velocidad > 3 ? 'En movimiento' : p.ignicion ? 'Ralentí' : 'Detenido'}</span>}
          {p && p.combustible != null && a.hay && <span>⛽ {Math.round(p.combustible * (a.serie.length ? 1 : 1))}{a.unidad === '%' ? '%' : ''}</span>}
        </div>
        <svg ref={ref} className="tg-rep__linea" viewBox={`0 0 ${W} 44`} preserveAspectRatio="none" role="slider" aria-label="Momento del recorrido"
          aria-valuemin={0} aria-valuemax={Math.max(0, pts.length - 1)} aria-valuenow={indice}
          onPointerDown={e => { (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); elegir(e.clientX); }}
          onPointerMove={e => { if (e.buttons) elegir(e.clientX); }}>
          {franjas.map((f, i) => <rect key={i} x={x(f.a)} y={28} width={Math.max(1.5, x(f.b) - x(f.a))} height={12} rx={2} fill={COLOR[f.e]} opacity={0.9} />)}
          {a.eventos.map(e => <rect key={e.t0} x={x(e.t0) - 2} y={2} width={Math.max(5, x(e.t1) - x(e.t0) + 4)} height={26} fill={e.tipo === 'caida' ? 'rgba(255,84,112,.35)' : 'rgba(34,227,160,.3)'} />)}
          {curva && <polyline points={curva} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          {p && <line x1={x(p.tiempo)} x2={x(p.tiempo)} y1={0} y2={44} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="tg-rep__leyenda">
          <span><i style={{ background: COLOR.mov }} />Movimiento</span><span><i style={{ background: COLOR.ral }} />Ralentí</span><span><i style={{ background: COLOR.det }} />Parada</span>
          {a.hay && <span><i style={{ background: 'var(--accent)' }} />Combustible</span>}
        </div>
      </div>
      <div className="tg-rep__vel">
        <SegmentedControl label="Velocidad de reproducción" value={String(velocidad) as '1' | '5' | '10' | '100'} onChange={v => onVelocidad(Number(v) as VelocidadRep)} options={VELOCIDADES_REP.map(v => ({ value: String(v) as '1' | '5' | '10' | '100', label: `${v}x` }))} />
      </div>
    </div>
  );
}
