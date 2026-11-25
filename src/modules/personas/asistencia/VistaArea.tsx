import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { PageLoader } from '../../../core/ui/Button';
import { Notice } from '../../../core/ui/Display';
import { errorMessage } from '../../../core/api/client';
import { spring } from '../../../core/lib/motion';
import { areaDe, diaLargo, estadoEnDia, pctTexto, resumir, tonoPct, useTareoMes } from './datos';
import { NavDia } from './Piezas';

/** Tablero por área: una tarjeta por área con cómo está su gente hoy; al tocarla se abre el detalle del día de esa área */
export function VistaArea({ fecha, onFecha, hoy, onAbrirArea }: { fecha: string; onFecha: (f: string) => void; hoy: string; onAbrirArea: (area: string) => void }) {
  const anio = Number(fecha.slice(0, 4)); const mes = Number(fecha.slice(5, 7));
  const q = useTareoMes(anio, mes);
  const m = q.data;

  const tarjetas = useMemo(() => {
    const por = new Map<string, string[]>();
    (m?.personal ?? []).forEach(p => { const a = areaDe(p); por.set(a, [...(por.get(a) ?? []), estadoEnDia(m, p, fecha, hoy)]); });
    return [...por.entries()].map(([area, estados]) => ({ area, total: estados.length, r: resumir(estados) }))
      .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, 'es'));
  }, [m, fecha, hoy]);

  return (
    <div className="asis-vista">
      <div className="asis-barra">
        <NavDia fecha={fecha} onChange={onFecha} hoy={hoy} />
        <span className="asis-barra__dia t-footnote c-secondary">{diaLargo(fecha)}</span>
      </div>
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : tarjetas.length === 0 ? (
        <Notice tone="neutral">No hay personal registrado.</Notice>
      ) : (
        <div className="asis-areas">
          {tarjetas.map(({ area, total, r }, i) => {
            const otros = Math.max(0, total - r.asistieron - r.faltas - r.justificados - r.sinMarcar);
            const seg = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
            return (
              <motion.button key={area} type="button" className="asis-area pressable" onClick={() => onAbrirArea(area)}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.03 }}>
                <span className="asis-area__cab">
                  <strong>{area}</strong>
                  <span className="asis-area__total t-numeric">{total}</span>
                  <ChevronRight size={16} aria-hidden />
                </span>
                <span className="asis-area__pct">
                  <b className={`asis-pct asis-pct--${tonoPct(r.asistenciaPct) || 'ok'} t-numeric`}>{pctTexto(r.asistenciaPct)}</b>
                  <small>asistencia · {r.asistieron} de {r.esperados}</small>
                </span>
                <span className="asis-barra-seg" aria-hidden>
                  <i className="asis-seg--ok" style={{ width: seg(r.asistieron) }} />
                  <i className="asis-seg--falta" style={{ width: seg(r.faltas) }} />
                  <i className="asis-seg--just" style={{ width: seg(r.justificados) }} />
                  <i className="asis-seg--sin" style={{ width: seg(r.sinMarcar) }} />
                  <i className="asis-seg--otro" style={{ width: seg(otros) }} />
                </span>
                <span className="asis-area__nums">
                  <span><b className="t-numeric">{r.asistieron}</b> asistieron</span>
                  <span><b className="t-numeric">{r.tardanzas}</b> tardanza</span>
                  <span><b className="t-numeric">{r.faltas}</b> faltas</span>
                  <span><b className="t-numeric">{r.justificados}</b> justificados</span>
                  <span className={r.sinMarcar ? 'asis-area__alerta' : ''}><b className="t-numeric">{r.sinMarcar}</b> sin marcar</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
