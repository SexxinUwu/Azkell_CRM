import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { spring } from '../../core/lib/motion';

/** Verde cerca de la meta, ámbar a medio camino y rojo lejos de ella */
const colorAvance = (pct: number) => (pct >= 90 ? 'var(--green-ink)' : pct >= 70 ? 'var(--amber-ink)' : 'var(--red-ink)');

type FiltroAlq = 'todas' | 'alquiladas' | 'propias' | 'externa';

/**
 * Panel compacto de la flota: avance de vigentes hacia la meta (siempre el 100 %), cuántas unidades se tienen (con y sin las
 * alquiladas a otras) y, abajo, las tarjetas de estado (`children`). Todo en un solo bloque para dejar el resto de la pantalla a la información.
 * Los porcentajes son enteros y se reparten para que sumen exactamente 100 %.
 */
export function DocMetaVigentes({ vigentes, total, pct, conteo, alquiler, onAlquiler, children }: {
  vigentes: number; total: number; pct: number;
  /** Unidades de la empresa elegida, con y sin las que alquila a otras */
  conteo: { total: number; alquiladas: number; propias: number };
  alquiler: FiltroAlq;
  onAlquiler: (a: FiltroAlq) => void;
  /** Tarjetas de estado (vigentes, alerta, vencidos…) */
  children?: ReactNode;
}) {
  const reducir = useReducedMotion();
  const faltan = Math.max(0, total - vigentes);
  const color = colorAvance(pct);
  return (
    <section className="doc-meta" aria-label="Avance de documentos vigentes hacia la meta">
      <div className="doc-meta__cab">
        <span className="doc-meta__titulo">Vigentes <em>· avance hacia la meta</em></span>
        {/* Cuántas unidades se tienen: todas, las alquiladas a otras empresas y las que no (toca para filtrar) */}
        <div className="doc-meta__flota" role="group" aria-label="Unidades de la flota">
          {([['todas', 'Unidades', conteo.total], ['alquiladas', 'Alquiladas a otras', conteo.alquiladas], ['propias', 'Sin alquilar', conteo.propias]] as const).map(([v, etiqueta, n]) => (
            <button key={v} type="button" className="doc-meta__chip" aria-pressed={alquiler === v} onClick={() => onAlquiler(alquiler === v ? 'todas' : v)}>
              <b className="t-numeric">{n}</b> {etiqueta}
            </button>
          ))}
        </div>
        <span className="doc-meta__resumen">
          <b className="t-numeric">{vigentes}</b> de <b className="t-numeric">{total}</b> vigentes · {faltan > 0 ? <>faltan <b className="t-numeric">{faltan}</b> ({100 - pct}%)</> : '¡meta cumplida!'}
          <span className="doc-meta__meta">Meta 100%</span>
        </span>
        <strong className="doc-meta__pct t-numeric" style={{ color }}>{pct}%</strong>
      </div>
      <div className="doc-meta__pista" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <motion.span className="doc-meta__relleno" style={{ background: color }} initial={reducir ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={reducir ? { duration: 0 } : spring} />
        <i className="doc-meta__marca" aria-hidden />
      </div>
      {children && <div className="doc-meta__tiles">{children}</div>}
    </section>
  );
}
