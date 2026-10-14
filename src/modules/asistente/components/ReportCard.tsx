import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { errorMessage } from '../../../core/api/client';
import { springSnappy } from '../../../core/lib/motion';
import { buildReportFile, openFile, saveFile, type ReportFile, type ReportRequest } from '../reports';

// El archivo se arma una sola vez por mensaje, aunque el panel se cierre y se vuelva a abrir
const cache = new Map<string, Promise<ReportFile>>();

type State = { status: 'preparing' } | { status: 'ready'; file: ReportFile } | { status: 'error'; message: string };

export function ReportCard({ id, report }: { id: string; report: ReportRequest }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<State>({ status: 'preparing' });
  const [attempt, setAttempt] = useState(0);
  const pdf = report.formato === 'pdf';
  const Icon = pdf ? FileText : FileSpreadsheet;

  useEffect(() => {
    let alive = true;
    const key = `${id}:${attempt}`;
    if (!cache.has(key)) cache.set(key, buildReportFile(report));
    cache.get(key)!.then(
      file => alive && setState({ status: 'ready', file }),
      err => { cache.delete(key); if (alive) setState({ status: 'error', message: errorMessage(err) }); },
    );
    return () => { alive = false; };
  }, [id, attempt, report]);

  const meta = state.status === 'ready'
    ? `${pdf ? 'PDF' : 'Excel'} · ${state.file.rows} ${state.file.rows === 1 ? 'fila' : 'filas'}${state.file.truncated ? ' (recortado)' : ''}`
    : state.status === 'preparing' ? 'Preparando…' : state.message;

  return (
    <motion.div
      className={`report-card report-card--${pdf ? 'pdf' : 'excel'}${state.status === 'error' ? ' report-card--error' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSnappy}
    >
      <span className="report-card__icon" aria-hidden>
        <Icon size={20} strokeWidth={1.9} />
        {state.status === 'preparing' && <span className="report-card__spinner" />}
      </span>
      <span className="report-card__text">
        <span className="report-card__name">{state.status === 'ready' ? state.file.fileName : report.title}</span>
        <span className="report-card__meta" role={state.status === 'error' ? 'alert' : undefined}>{meta}</span>
      </span>
      {state.status === 'ready' && (
        <span className="report-card__actions">
          {pdf && (
            <button type="button" className="report-card__btn" onClick={() => openFile(state.file)} aria-label="Ver PDF">
              <ExternalLink size={17} />
            </button>
          )}
          <button type="button" className="report-card__btn report-card__btn--primary" onClick={() => saveFile(state.file)} aria-label={`Descargar ${state.file.fileName}`}>
            <Download size={17} />
          </button>
        </span>
      )}
      {state.status === 'error' && (
        <button type="button" className="report-card__btn" onClick={() => { setState({ status: 'preparing' }); setAttempt(a => a + 1); }} aria-label="Reintentar">
          <RotateCcw size={17} />
        </button>
      )}
    </motion.div>
  );
}
