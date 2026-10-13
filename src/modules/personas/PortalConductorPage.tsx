import '../mantenimiento/mant.css';
import { useState } from 'react';
import { ArrowUpRight, Search, Smartphone, Truck, User } from 'lucide-react';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { PageLoader } from '../../core/ui/Button';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface ViajePortal {
  id?: string | number;
  numero_ov?: string;
  estado?: string;
  placa?: string;
  placa_carreta?: string;
  conductor?: string;
  ruta?: string;
  origen?: string;
  destino?: string;
  fecha_viaje?: string;
  fecha_formateada?: string;
  inicio_formateado?: string;
  cliente?: string;
  carga?: string;
  km_recorridos?: number;
  [key: string]: unknown;
}

interface ConductorInfo {
  nombre?: string;
  dni?: string;
}

interface PortalResponse {
  ok: boolean;
  conductor?: ConductorInfo;
  viaje?: ViajePortal | null;
  message?: string;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s === 'activo' || s === 'iniciado') return 'green';
  if (s === 'finalizado' || s === 'completado') return 'neutral';
  if (s === 'pendiente') return 'amber';
  return 'blue';
}

function CampoViaje({ label, valor }: { label: string; valor?: string | number | null }) {
  if (!valor) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{String(valor)}</span>
    </div>
  );
}

export function PortalConductorPage() {
  const [query, setQuery] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<PortalResponse | null>(null);
  const [errMsg, setErrMsg] = useState('');

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setCargando(true);
    setResultado(null);
    setErrMsg('');
    try {
      const esDni = /^\d{8}$/.test(q);
      const params = esDni ? `?dni=${encodeURIComponent(q)}` : `?nombre=${encodeURIComponent(q)}`;
      const r = await api(`/operaciones/conductor-portal/viaje-activo${params}`) as PortalResponse;
      setResultado(r);
    } catch (e) {
      setErrMsg(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }

  const viaje = resultado?.viaje;
  const conductor = resultado?.conductor;

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Portal del conductor"
        subtitle="Consulta el viaje activo de cualquier conductor"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/conductor-portal') },
          ]} />
        }
      />

      {/* Buscador */}
      <form onSubmit={buscar} style={{ display: 'flex', gap: 8, marginBottom: 'var(--s-3)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--label-2)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="DNI (8 dígitos) o nombre del conductor…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px 10px 34px',
              borderRadius: 10, border: '1px solid var(--separator)',
              background: 'var(--fill-1)', color: 'var(--label-1)',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <button type="submit" disabled={cargando || !query.trim()}
          style={{ padding: '0 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.7 : 1, whiteSpace: 'nowrap' }}>
          {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {errMsg && <Notice tone="error">{errMsg}</Notice>}

      {cargando && <PageLoader />}

      {/* Sin búsqueda aún */}
      {!cargando && !resultado && !errMsg && (
        <EmptyState icon={<Smartphone size={28} />} title="Consultar viaje activo">
          Ingresa el DNI o nombre del conductor para ver su viaje activo, estado de ruta y detalles de la orden de viaje.
        </EmptyState>
      )}

      {/* Resultado */}
      {resultado && !cargando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Info del conductor */}
          {conductor && (
            <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0 }}>
                {String(conductor.nombre ?? '?')[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{conductor.nombre ?? '—'}</div>
                {conductor.dni && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>DNI: {conductor.dni}</div>
                )}
              </div>
              <User size={18} style={{ marginLeft: 'auto', color: 'var(--label-2)' }} />
            </div>
          )}

          {/* Sin viaje */}
          {!viaje && (
            <Notice tone="neutral">
              {resultado.message ?? 'No se encontró un viaje activo para este conductor.'}
            </Notice>
          )}

          {/* Viaje activo */}
          {viaje && (
            <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              {/* Header viaje */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Truck size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '1rem' }}>
                    {viaje.placa ?? '—'}
                  </span>
                  {viaje.placa_carreta && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--label-2)' }}>+ {viaje.placa_carreta}</span>
                  )}
                  {viaje.numero_ov && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>OV #{viaje.numero_ov}</span>
                  )}
                </div>
                {viaje.estado && (
                  <span className={`ot-estado ot-estado--${estadoColor(String(viaje.estado))}`}>
                    {viaje.estado}
                  </span>
                )}
              </div>

              {/* Grid de campos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: 'var(--s-2) var(--s-3)' }}>
                <CampoViaje label="Fecha viaje" valor={viaje.fecha_formateada ?? viaje.fecha_viaje} />
                <CampoViaje label="Inicio" valor={viaje.inicio_formateado} />
                <CampoViaje label="Origen" valor={String(viaje.origen ?? '')} />
                <CampoViaje label="Destino" valor={String(viaje.destino ?? viaje.ruta ?? '')} />
                <CampoViaje label="Cliente" valor={String(viaje.cliente ?? '')} />
                <CampoViaje label="Carga" valor={String(viaje.carga ?? '')} />
                {viaje.km_recorridos ? <CampoViaje label="Km recorridos" valor={`${viaje.km_recorridos} km`} /> : null}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
