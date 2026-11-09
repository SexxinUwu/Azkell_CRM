import { motion, useReducedMotion } from 'motion/react';
import { spring } from '../../core/lib/motion';

/** Verde cerca de la meta, ámbar a medio camino y rojo lejos de ella */
const colorAvance = (pct: number) => (pct >= 90 ? 'var(--green-ink)' : pct >= 70 ? 'var(--amber-ink)' : 'var(--red-ink)');

/**
 * Línea de avance de la flota: qué porcentaje de las unidades está vigente, cuántas faltan y la meta (siempre el 100 %).
 * Los números son enteros y se reparten para que, junto a las demás tarjetas, la flota sume exactamente 100 %.
 */
export function DocMetaVigentes({ vigentes, total, pct }: { vigentes: number; total: number; pct: number }) {
  const reducir = useReducedMotion();
  const faltan = Math.max(0, total - vigentes);
  const color = colorAvance(pct);
  return (
    <section className="doc-meta" aria-label="Avance de documentos vigentes hacia la meta">
      <div className="doc-meta__cab">
        <span className="doc-meta__titulo">Vigentes <em>· avance hacia la meta</em></span>
        <strong className="doc-meta__pct t-numeric" style={{ color }}>{pct}%</strong>
      </div>
      <div className="doc-meta__pista" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <motion.span className="doc-meta__relleno" style={{ background: color }} initial={reducir ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={reducir ? { duration: 0 } : spring} />
        <i className="doc-meta__marca" aria-hidden />
      </div>
      <div className="doc-meta__pie">
        <span><b className="t-numeric">{vigentes}</b> de <b className="t-numeric">{total}</b> unidades vigentes</span>
        <span>{faltan > 0 ? <>Faltan <b className="t-numeric">{faltan}</b> ({100 - pct}%) para llegar al 100 %</> : '¡Meta cumplida!'} <span className="doc-meta__meta">Meta 100%</span></span>
      </div>
    </section>
  );
}
