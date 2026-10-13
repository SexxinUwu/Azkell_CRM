import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, History, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { planEstado, planEstadoColor, usePlanificacion, type EstadoPlan, type PlanificacionItem } from './api';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const LABEL_ESTADO: Record<EstadoPlan, string> = {
  completada: 'Completada', cancelada: 'Cancelada', diferida: 'Diferida',
  atrasada: 'Atrasada', porvencer: 'Por vencer', vigente: 'Vigente', programada: 'Programada',
};

export function PlanificacionPage() {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<PlanificacionItem | null>(null);

  const { data, isLoading, isError, error } = usePlanificacion(mes, anio);
  const planes = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return planes;
    const q = busqueda.toUpperCase();
    return planes.filter(p =>
      (p.placa ?? '').toUpperCase().includes(q) ||
      (p.tipo_mp ?? '').toUpperCase().includes(q) ||
      (p.responsable ?? '').toUpperCase().includes(q)
    );
  }, [planes, busqueda]);

  const anios = Array.from({ length: 4 }, (_, i) => hoy.getFullYear() - 1 + i);

  const soloDetalle = !!seleccionado;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Planificación"
          subtitle={isLoading ? 'Cargando…' : `${planes.length} planes — ${MESES[mes - 1]} ${anio}`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/planificacion') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <PlanDetalle plan={seleccionado} onVolver={() => setSeleccionado(null)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Selector mes/año */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              className="input"
              style={{ width: 'auto', minHeight: '2.25rem' }}
            >
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="input"
              style={{ width: 'auto', minHeight: '2.25rem' }}
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, tipo de MP, responsable…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <History size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin planes para este periodo'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Prueba otro mes o año.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map((p, i) => {
                const est = planEstado(p);
                const col = planEstadoColor(est);
                return (
                  <button key={String(p.id ?? i)} type="button" className="ot-fila"
                    onClick={() => { haptic('selection'); setSeleccionado(p); }}>
                    <div className="ot-fila__icono"><History size={16} /></div>
                    <div className="ot-fila__cuerpo">
                      <span className="ot-fila__id">{p.placa}</span>
                      <span className="ot-fila__sub">
                        {p.tipo_mp}
                        {p.responsable ? ` · ${p.responsable}` : ''}
                      </span>
                    </div>
                    <div className="ot-fila__derecha">
                      <span className={`ot-estado ot-estado--${col}`}>{LABEL_ESTADO[est]}</span>
                      {p.fecha_fin_ventana && (
                        <span className="ot-fila__fecha">{p.fecha_fin_ventana.split('T')[0]}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function PlanDetalle({ plan: p, onVolver }: { plan: PlanificacionItem; onVolver: () => void }) {
  const est = planEstado(p);
  const col = planEstadoColor(est);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Planificación
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${col}`}>{LABEL_ESTADO[est]}</span>
        <h2 className="ot-ficha__placa">{p.placa}</h2>
        <span className="ot-ficha__id">{p.tipo_mp}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Plan</p>
        <div className="tarjeta__lista">
          {p.responsable && <div className="dato"><span className="dato__label">Responsable</span><span className="dato__valor">{p.responsable}</span></div>}
          {p.km_actual != null && <div className="dato"><span className="dato__label">Km actual</span><span className="dato__valor dato__valor--mono">{Number(p.km_actual).toLocaleString('es-PE')}</span></div>}
          {p.km_objetivo != null && <div className="dato"><span className="dato__label">Km objetivo</span><span className="dato__valor dato__valor--mono">{Number(p.km_objetivo).toLocaleString('es-PE')}</span></div>}
        </div>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Ventana</p>
        <div className="tarjeta__lista">
          {p.fecha_inicio_ventana && <div className="dato"><span className="dato__label">Inicio</span><span className="dato__valor dato__valor--mono">{p.fecha_inicio_ventana.split('T')[0]}</span></div>}
          {p.fecha_fin_ventana && <div className="dato"><span className="dato__label">Fin</span><span className="dato__valor dato__valor--mono">{p.fecha_fin_ventana.split('T')[0]}</span></div>}
        </div>
      </div>
      {p.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{String(p.observaciones)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
