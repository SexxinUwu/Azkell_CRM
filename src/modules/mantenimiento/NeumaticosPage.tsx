import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Disc3, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useNeumaticos, type NeuRequerimiento, type NeuVehiculo } from './api';

const TABS = ['Últimas inspecciones', 'Requerimientos'] as const;

export function NeumaticosPage() {
  const { data, isLoading, isError, error } = useNeumaticos();
  const [tab, setTab] = useState<typeof TABS[number]>('Últimas inspecciones');
  const [busqueda, setBusqueda] = useState('');

  const ultimas = data?.ultimas ?? [];
  const requerimientos = data?.requerimientos ?? [];

  const visiblesUlt = useMemo(() => {
    if (!busqueda) return ultimas;
    const q = busqueda.toUpperCase();
    return ultimas.filter(v =>
      (v.placa ?? '').toUpperCase().includes(q) ||
      (v.dueno ?? '').toUpperCase().includes(q) ||
      (v.tipo_unidad ?? '').toUpperCase().includes(q)
    );
  }, [ultimas, busqueda]);

  const visiblesReq = useMemo(() => {
    if (!busqueda) return requerimientos;
    const q = busqueda.toUpperCase();
    return requerimientos.filter(r =>
      (r.placa ?? '').toUpperCase().includes(q) ||
      (r.tipo_llanta ?? '').toUpperCase().includes(q) ||
      (r.motivo ?? '').toUpperCase().includes(q)
    );
  }, [requerimientos, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Neumáticos"
        subtitle={isLoading ? 'Cargando…' : `${ultimas.length} vehículos · ${requerimientos.length} requerimientos`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/neumaticos-ultimas') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {TABS.map(t => (
              <button key={t} type="button" onClick={() => { setTab(t); setBusqueda(''); }}
                style={{
                  padding: '0.375rem 1rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: tab === t ? 'var(--ink)' : 'var(--fill)',
                  color: tab === t ? 'var(--label-inverse)' : 'var(--label-2)',
                }}>
                {t}
              </button>
            ))}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, empresa, tipo…" />

          {tab === 'Últimas inspecciones' ? (
            visiblesUlt.length === 0 ? (
              <EmptyState icon={busqueda ? <SearchX size={22} /> : <Disc3 size={22} />}
                title={busqueda ? 'Sin coincidencias' : 'Sin inspecciones registradas'}>
                {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visiblesUlt.map((v, i) => <VehiculoFila key={v.placa ?? i} v={v} />)}
              </div>
            )
          ) : (
            visiblesReq.length === 0 ? (
              <EmptyState icon={busqueda ? <SearchX size={22} /> : <Disc3 size={22} />}
                title={busqueda ? 'Sin coincidencias' : 'Sin requerimientos pendientes'}>
                {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visiblesReq.map((r, i) => <ReqFila key={(r.placa ?? '') + i} r={r} />)}
              </div>
            )
          )}
        </div>
      )}
    </Page>
  );
}

function VehiculoFila({ v }: { v: NeuVehiculo }) {
  const malas = (v.llantas_reparar ?? 0) + (v.llantas_cambiar ?? 0);
  const tono = malas > 0 ? 'red' : 'green';
  return (
    <div className="ot-fila" style={{ cursor: 'default' }}>
      <div className="ot-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
        <Disc3 size={16} />
      </div>
      <div className="ot-fila__cuerpo">
        <span className="ot-fila__id">{v.placa}</span>
        <span className="ot-fila__sub">
          {v.dueno ? `${v.dueno} · ` : ''}{v.tipo_unidad ?? '—'}
          {v.inspector ? ` · ${v.inspector}` : ''}
        </span>
      </div>
      <div className="ot-fila__derecha">
        {v.total_llantas != null && (
          <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{v.total_llantas} llantas</span>
        )}
        {malas > 0 && (
          <span className="ot-estado ot-estado--red">{malas} a atender</span>
        )}
        <span className="ot-fila__fecha">{v.fecha_inspeccion?.split('T')[0] ?? '—'}</span>
      </div>
    </div>
  );
}

function ReqFila({ r }: { r: NeuRequerimiento }) {
  const tono = r.estado === 'Atendido' ? 'green' : 'red';
  return (
    <div className="ot-fila" style={{ cursor: 'default' }}>
      <div className="ot-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
        <Disc3 size={16} />
      </div>
      <div className="ot-fila__cuerpo">
        <span className="ot-fila__id">{r.placa}</span>
        <span className="ot-fila__sub">
          {r.tipo_llanta ?? '—'}{r.medida ? ` · ${r.medida}` : ''}
          {r.motivo ? ` · ${r.motivo}` : ''}
        </span>
      </div>
      <div className="ot-fila__derecha">
        {r.cantidad != null && (
          <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{r.cantidad} un.</span>
        )}
        <span className={`ot-estado ot-estado--${tono}`}>{r.estado ?? 'Pendiente'}</span>
        <span className="ot-fila__fecha">{r.fecha_solicitud?.split('T')[0] ?? '—'}</span>
      </div>
    </div>
  );
}
