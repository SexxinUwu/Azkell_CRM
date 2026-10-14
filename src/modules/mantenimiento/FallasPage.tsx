import './mant.css';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle, Plus, SearchX, Wrench } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { SlideUpModal, ModalBtn } from '../../core/ui/SlideUpModal';

interface Falla {
  id: string | number;
  folio?: string;
  placa?: string;
  conductor?: string;
  tipo_falla?: string;
  descripcion?: string;
  severidad?: string;
  requiere_repuesto?: boolean | number;
  repuesto_descripcion?: string | null;
  estado?: string;
  orden_viaje?: string | null;
  atendido_por?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

const TIPOS_FALLA = ['Mecánica', 'Eléctrica', 'Neumáticos', 'Carrocería', 'Frenos', 'Hidráulica', 'Otro'];
const SEVERIDADES = [
  { value: 'baja', label: 'Baja', color: 'green' },
  { value: 'media', label: 'Media', color: 'amber' },
  { value: 'alta', label: 'Alta', color: 'accent' },
  { value: 'critica', label: 'Crítica', color: 'red' },
];

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s === 'atendida' || s === 'cerrada') return 'green';
  if (s === 'sin_stock') return 'accent';
  if (s === 'con_repuesto') return 'blue';
  if (s === 'en_revision') return 'amber';
  return 'neutral';
}

function sevColor(sev: string): string {
  const s = SEVERIDADES.find(x => x.value === (sev ?? '').toLowerCase());
  return s?.color ?? 'neutral';
}

export function FallasPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [form, setForm] = useState({
    placa: '', conductor: '', tipo_falla: 'Mecánica', descripcion: '',
    severidad: 'media', requiere_repuesto: false, repuesto_descripcion: '', orden_viaje: '',
  });

  const { data, isLoading, isError, error } = useQuery<Falla[]>({
    queryKey: ['mant', 'fallas'],
    queryFn: () => api('/fallas').then((r: unknown) => {
      if (Array.isArray(r)) return r as Falla[];
      return (r as { data?: Falla[] }).data ?? [];
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const lista = data ?? [];
  const abiertas = lista.filter(f => !['ATENDIDA', 'CERRADA', 'ANULADA'].includes((f.estado ?? '').toUpperCase()));
  const criticas = lista.filter(f => f.severidad === 'critica' && !['ATENDIDA', 'CERRADA', 'ANULADA'].includes((f.estado ?? '').toUpperCase()));

  const visibles = useMemo(() => {
    let fuente = filtroEstado ? lista.filter(f => (f.estado ?? '').toUpperCase() === filtroEstado) : lista;
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return fuente.filter(f =>
      String(f.placa ?? '').toUpperCase().includes(q) ||
      String(f.conductor ?? '').toUpperCase().includes(q) ||
      String(f.tipo_falla ?? '').toUpperCase().includes(q) ||
      String(f.folio ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda, filtroEstado]);

  async function submitFalla(e: React.FormEvent) {
    e.preventDefault();
    if (!form.placa || !form.descripcion) {
      setMsg({ tipo: 'error', texto: 'Placa y descripción son obligatorias.' });
      return;
    }
    setEnviando(true);
    try {
      const result = await api<{ ok: boolean; folio: string }>('/fallas', {
        method: 'POST',
        body: { ...form, requiere_repuesto: form.requiere_repuesto ? 1 : 0 },
      });
      setMsg({ tipo: 'ok', texto: `Falla registrada. Folio: ${result.folio}` });
      qc.invalidateQueries({ queryKey: ['mant', 'fallas'] });
      setMostrarForm(false);
      setForm({ placa: '', conductor: '', tipo_falla: 'Mecánica', descripcion: '', severidad: 'media', requiere_repuesto: false, repuesto_descripcion: '', orden_viaje: '' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: errorMessage(e) });
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(id: string | number, estado: string) {
    try {
      await api(`/fallas/${id}/estado`, { method: 'PUT', body: { estado, atendido_por: localStorage.getItem('fleet_user') ?? 'Sistema' } });
      qc.invalidateQueries({ queryKey: ['mant', 'fallas'] });
    } catch (e) {
      setMsg({ tipo: 'error', texto: errorMessage(e) });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Fallas en ruta"
        subtitle={abiertas.length > 0 ? `${abiertas.length} abiertas${criticas.length > 0 ? ` · ${criticas.length} críticas` : ''}` : 'Sin fallas abiertas'}
        actions={
          <MenuOtros opciones={[
            { label: 'Reportar falla', icon: <Plus size={17} />, onSelect: () => { setMostrarForm(true); setMsg(null); } },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/fallas') },
          ]} />
        }
      />

      {msg && (
        <div style={{ cursor: 'pointer' }} onClick={() => setMsg(null)}>
          <Notice tone={msg.tipo === 'ok' ? 'success' : 'error'}>{msg.texto}</Notice>
        </div>
      )}
      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', marginBottom: 'var(--s-3)' }}>
        {[
          { label: 'Abiertas', valor: abiertas.length, color: abiertas.length > 0 ? 'var(--amber-ink)' : 'var(--green-ink)' },
          { label: 'Críticas', valor: criticas.length, color: criticas.length > 0 ? 'var(--red-ink)' : 'var(--label-2)' },
          { label: 'Total', valor: lista.length, color: 'var(--label-1)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: '5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: k.color }}>{k.valor}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
        <button type="button"
          onClick={() => { setMostrarForm(true); setMsg(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
          <Plus size={16} /> Reportar falla
        </button>
      </div>

      {isLoading ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '12rem' }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, conductor, tipo o folio…" />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['', 'REPORTADA', 'EN_REVISION', 'SIN_STOCK', 'ATENDIDA'].map(e => (
                <button key={e} type="button"
                  onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
                  style={{ padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', background: filtroEstado === e ? 'var(--accent)' : 'var(--fill-2)', color: filtroEstado === e ? '#fff' : 'var(--label-2)', border: '1px solid var(--separator)', whiteSpace: 'nowrap' }}>
                  {e || 'Todos'}
                </button>
              ))}
            </div>
          </div>

          {lista.length === 0 ? (
            <EmptyState icon={<Wrench size={28} />} title="Sin fallas registradas">
              Usa el botón "Reportar falla" para registrar la primera.
            </EmptyState>
          ) : visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setFiltroEstado(''); }}>Limpiar</button>
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibles.map((f, i) => {
                const sev = sevColor(String(f.severidad ?? 'media'));
                const est = estadoColor(String(f.estado ?? ''));
                const abierta = !['ATENDIDA', 'CERRADA', 'ANULADA'].includes((f.estado ?? '').toUpperCase());
                return (
                  <div key={String(f.id || i)} style={{ background: 'var(--fill-1)', borderRadius: 10, padding: 'var(--s-2) var(--s-3)', border: `1px solid var(--separator)`, display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <AlertTriangle size={16} style={{ color: `var(--${sev}-ink)`, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>{f.placa ?? '—'}</span>
                        {f.folio && <span style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>{f.folio}</span>}
                        <span className={`ot-estado ot-estado--${sev}`}>{f.severidad?.toUpperCase()}</span>
                        <span className={`ot-estado ot-estado--${est}`}>{f.estado ?? 'REPORTADA'}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{f.tipo_falla} — {f.conductor ?? '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--label-2)', marginTop: 2 }}>{f.descripcion}</div>
                      {f.requiere_repuesto ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--amber-ink)', marginTop: 3, fontWeight: 600 }}>
                          ⚠ Requiere repuesto{f.repuesto_descripcion ? `: ${f.repuesto_descripcion}` : ''}
                        </div>
                      ) : null}
                    </div>
                    {abierta && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button type="button"
                          onClick={() => cambiarEstado(f.id, 'EN_REVISION')}
                          style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--amber-tint)', color: 'var(--amber-ink)', border: '1px solid var(--amber-ink)', cursor: 'pointer' }}>
                          En revisión
                        </button>
                        <button type="button"
                          onClick={() => cambiarEstado(f.id, 'ATENDIDA')}
                          style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--green-tint)', color: 'var(--green-ink)', border: '1px solid var(--green-ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={11} /> Atendida
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de reporte */}
      <SlideUpModal
        open={mostrarForm}
        onClose={() => setMostrarForm(false)}
        title="Reportar falla en ruta"
        subtitle="Registra la falla para alertar al taller y almacén"
        footer={
          <>
            <ModalBtn variant="ghost" onClick={() => setMostrarForm(false)}>Cancelar</ModalBtn>
            <ModalBtn variant="primary" type="submit" loading={enviando}
              onClick={() => { document.getElementById('form-reportar-falla')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }}>
              Reportar falla
            </ModalBtn>
          </>
        }
      >
        <form id="form-reportar-falla" onSubmit={submitFalla} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Placa *</label>
              <input value={form.placa} onChange={e => setForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                placeholder="ABC123" required style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Conductor</label>
              <input value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))}
                placeholder="Nombre del conductor" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Tipo de falla *</label>
              <select value={form.tipo_falla} onChange={e => setForm(f => ({ ...f, tipo_falla: e.target.value }))}
                style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem' }}>
                {TIPOS_FALLA.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Severidad</label>
              <select value={form.severidad} onChange={e => setForm(f => ({ ...f, severidad: e.target.value }))}
                style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem' }}>
                {SEVERIDADES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Descripción *</label>
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              required placeholder="Describe la falla con el mayor detalle posible…" rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', resize: 'vertical', fontSize: '0.875rem' }} />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--label-1)', padding: '8px 12px', borderRadius: 8, background: 'var(--fill-1)', border: '1px solid var(--separator)' }}>
              <input type="checkbox" checked={form.requiere_repuesto} onChange={e => setForm(f => ({ ...f, requiere_repuesto: e.target.checked }))} />
              Requiere repuesto / pieza de reemplazo
            </label>
          </div>

          {form.requiere_repuesto && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>Descripción del repuesto</label>
              <input value={form.repuesto_descripcion} onChange={e => setForm(f => ({ ...f, repuesto_descripcion: e.target.value }))}
                placeholder="Ej: Filtro de aceite, pastillas de freno…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem' }} />
            </div>
          )}
        </form>
      </SlideUpModal>
    </Page>
  );
}
