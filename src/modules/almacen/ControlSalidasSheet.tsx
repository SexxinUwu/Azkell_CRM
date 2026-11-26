import { useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { errorMessage } from '../../core/api/client';
import { useTiemposSalidas } from './api';
import './controlSalidas.css';

/** «45 min», «5 h 20 min», «2 d 4 h» */
export function duracion(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
/** Qué tan urgente es una espera: verde menos de 4 h, ámbar menos de 1 día, rojo más */
export const tonoEspera = (min: number) => (min >= 1440 ? 'rojo' : min >= 240 ? 'ambar' : 'verde');

/** Control de tiempos de las salidas: cuánto tarda en despacharse lo que se pide y qué pendientes llevan más espera */
export function ControlSalidasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dias, setDias] = useState<'30' | '60' | '90'>('60');
  const { data, isLoading, isError, error } = useTiemposSalidas(Number(dias), open);
  const r = data?.resumen;
  const total = r?.medidas ?? 0;
  const tramos = r ? [
    { clave: 'a', etiqueta: 'Hasta 30 min', n: r.hasta_30m, tono: 'verde' },
    { clave: 'b', etiqueta: '30 min a 2 h', n: r.hasta_2h, tono: 'verde' },
    { clave: 'c', etiqueta: '2 h a 1 día', n: r.hasta_1d, tono: 'ambar' },
    { clave: 'd', etiqueta: '1 a 3 días', n: r.hasta_3d, tono: 'rojo' },
    { clave: 'e', etiqueta: 'Más de 3 días', n: r.mas_3d, tono: 'rojo' },
  ] : [];
  const rapidas = r ? r.hasta_30m + r.hasta_2h : 0;
  const lentas = r ? r.hasta_3d + r.mas_3d : 0;
  const maxSemana = Math.max(1, ...(data?.semanas ?? []).map(s => s.mediana));

  return (
    <Sheet open={open} onClose={onClose} title="Tiempos de despacho" ancho>
      <div className="cs-cuerpo">
        <div className="cs-periodo">
          <span>Desde que se pide hasta que se despacha, en los últimos</span>
          <SegmentedControl<'30' | '60' | '90'> label="Periodo" value={dias} onChange={setDias} options={[{ value: '30', label: '30 días' }, { value: '60', label: '60 días' }, { value: '90', label: '90 días' }]} />
        </div>

        {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : !r || total === 0 ? (
          <Notice>Todavía no hay salidas despachadas en este periodo para medir.</Notice>
        ) : (
          <>
            <div className="cs-kpis">
              <div className="cs-kpi"><span>Tiempo típico (mediana)</span><b>{duracion(r.mediana_min)}</b><small>La mitad se despacha en menos de esto</small></div>
              <div className="cs-kpi"><span>Promedio</span><b>{duracion(r.promedio_min)}</b><small>{total} salidas medidas</small></div>
              <div className="cs-kpi cs-kpi--verde"><span>Rápidas (hasta 2 h)</span><b>{Math.round((rapidas / total) * 100)}%</b><small>{rapidas} salidas</small></div>
              <div className="cs-kpi cs-kpi--rojo"><span>Lentas (más de 1 día)</span><b>{Math.round((lentas / total) * 100)}%</b><small>{lentas} salidas</small></div>
            </div>

            <section>
              <h3 className="cs-titulo">Cuánto tardan</h3>
              <ul className="cs-barras">
                {tramos.map(t => (
                  <li key={t.clave}>
                    <span className="cs-barras__txt">{t.etiqueta}</span>
                    <span className="cs-barras__pista"><i className={`cs-barras__relleno cs-barras__relleno--${t.tono}`} style={{ width: `${Math.round((t.n / total) * 100)}%` }} /></span>
                    <span className="cs-barras__n t-numeric">{t.n} · {Math.round((t.n / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </section>

            {(data?.semanas.length ?? 0) > 1 && (
              <section>
                <h3 className="cs-titulo">Tiempo típico por semana</h3>
                <ul className="cs-barras">
                  {data!.semanas.map(s => (
                    <li key={s.semana}>
                      <span className="cs-barras__txt">Sem. {s.semana.slice(-2)}</span>
                      <span className="cs-barras__pista"><i className={`cs-barras__relleno cs-barras__relleno--${tonoEspera(s.mediana)}`} style={{ width: `${Math.max(3, Math.round((s.mediana / maxSemana) * 100))}%` }} /></span>
                      <span className="cs-barras__n t-numeric">{duracion(s.mediana)} · {s.salidas} sal.</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {data && (
          <section>
            <h3 className="cs-titulo">Pendientes ahora ({data.pendientes.length}) · las que más esperan primero</h3>
            {data.pendientes.length === 0 ? <Notice tone="success">No hay salidas pendientes. Todo está despachado.</Notice> : (
              <ul className="cs-pend">
                {data.pendientes.slice(0, 12).map(p => (
                  <li key={p.id}>
                    <span className={`cs-espera cs-espera--${tonoEspera(p.espera_min)}`}>{duracion(p.espera_min)}</span>
                    <span className="cs-pend__txt"><b>{p.id}</b><small>{[p.placa, p.ot, p.responsable].filter(Boolean).join(' · ') || 'Sin destino'} · {p.items} {p.items === 1 ? 'ítem' : 'ítems'}</small></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
