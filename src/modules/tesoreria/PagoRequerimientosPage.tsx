import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CreditCard, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface OrdenCompra {
  id: string | number;
  codigo_oc?: string;
  estado?: string;
  moneda?: string;
  importe?: number | string;
  total_pen?: number | string;
  monto_total?: number | string;
  solicitante?: string;
  creado_por?: string;
  creado_por_nombre?: string;
  centro_costo?: string;
  sub_motivo?: string;
  motivo?: string;
  proveedor_nombre?: string;
  proveedor_ruc?: string;
  fecha?: string;
  numero_operacion?: string;
  pagado_por?: string;
  fecha_pago?: string;
  url_voucher?: string;
  cuentas_bancarias?: Array<{ texto: string; banco: string; numero_cuenta: string; moneda: string }>;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esUSD(moneda?: string): boolean {
  const m = (moneda ?? '').toUpperCase();
  return m.includes('DOL') || m === 'USD' || m === 'US$';
}

function ocImporte(oc: OrdenCompra): number {
  return parseFloat(String(oc.importe ?? oc.total_pen ?? oc.monto_total ?? 0)) || 0;
}

function ocCodigo(oc: OrdenCompra): string {
  return String(oc.codigo_oc ?? `OC-${oc.id}`);
}

function ocEstadoColor(estado?: string): string {
  const e = (estado ?? '').toLowerCase();
  if (e === 'procesado' || e === 'pagado') return 'green';
  if (e === 'aprobado' || e === 'autorizado') return 'blue';
  if (e === 'rechazado' || e === 'anulado') return 'red';
  return 'neutral';
}

function fmtMonto(valor: number, usd: boolean): string {
  const moneda = usd ? 'USD' : 'PEN';
  return valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + moneda;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

type FiltroEstado = 'aprobado' | 'procesados' | 'todos';

function usePagoReq(estado: FiltroEstado) {
  return useQuery<OrdenCompra[]>({
    queryKey: ['tesoreria', 'pago-req', estado],
    queryFn: () =>
      api(`/tesoreria/pago-requerimientos?estado=${estado}`).then((r: unknown) => {
        if (Array.isArray(r)) return r as OrdenCompra[];
        return (r as { data?: OrdenCompra[] }).data ?? [];
      }),
    staleTime: 30_000,
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

const FORM_VACIO = { numero_constancia: '', cuenta_origen: '', monto: '', moneda: 'PEN' };

export function PagoRequerimientosPage() {
  const qc    = useQueryClient();
  const toast = useToast();

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('aprobado');
  const [filtroMoneda, setFiltroMoneda] = useState<'TODAS' | 'PEN' | 'USD'>('TODAS');
  const [busqueda, setBusqueda]         = useState('');
  const [procesando, setProcesando]     = useState<OrdenCompra | null>(null);
  const [form, setForm]                 = useState(FORM_VACIO);
  const [guardando, setGuardando]       = useState(false);

  const { data, isLoading, isError, error } = usePagoReq(filtroEstado);
  const ocs = data ?? [];

  // KPIs siempre sobre datos de "aprobado" (para no confundir con totales)
  const { data: dataTodos } = useQuery<OrdenCompra[]>({
    queryKey: ['tesoreria', 'pago-req', 'todos'],
    queryFn: () => api('/tesoreria/pago-requerimientos?estado=todos').then((r: unknown) => {
      if (Array.isArray(r)) return r as OrdenCompra[];
      return (r as { data?: OrdenCompra[] }).data ?? [];
    }),
    staleTime: 30_000,
  });

  const kpis = useMemo(() => {
    const todos = dataTodos ?? [];
    const pendientes = todos.filter(o => ['aprobado', 'autorizado'].includes((o.estado ?? '').toLowerCase()));
    const pagados    = todos.filter(o => ['procesado', 'pagado'].includes((o.estado ?? '').toLowerCase()));
    const totalPEN = pendientes.filter(o => !esUSD(o.moneda)).reduce((s, o) => s + ocImporte(o), 0);
    const totalUSD = pendientes.filter(o => esUSD(o.moneda)).reduce((s, o) => s + ocImporte(o), 0);
    return { pendientes: pendientes.length, pagados: pagados.length, totalPEN, totalUSD };
  }, [dataTodos]);

  // Filtrado
  const visibles = useMemo(() => {
    let lista = ocs;
    if (filtroMoneda === 'PEN') lista = lista.filter(o => !esUSD(o.moneda));
    if (filtroMoneda === 'USD') lista = lista.filter(o => esUSD(o.moneda));
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(o =>
        ocCodigo(o).toUpperCase().includes(q) ||
        String(o.proveedor_nombre ?? '').toUpperCase().includes(q) ||
        String(o.motivo ?? o.sub_motivo ?? '').toUpperCase().includes(q) ||
        String(o.solicitante ?? o.creado_por_nombre ?? o.creado_por ?? '').toUpperCase().includes(q) ||
        String(o.centro_costo ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [ocs, filtroMoneda, busqueda]);

  // Abrir modal de pago
  function abrirProcesar(oc: OrdenCompra) {
    setProcesando(oc);
    setForm({
      numero_constancia: '',
      cuenta_origen:     oc.cuentas_bancarias?.[0]?.texto ?? '',
      monto:             String(ocImporte(oc) || ''),
      moneda:            esUSD(oc.moneda) ? 'USD' : 'PEN',
    });
  }

  // Procesar pago
  async function procesarPago() {
    if (!procesando) return;
    if (!form.numero_constancia.trim()) { toast('Ingresa el número de constancia', 'error'); return; }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresa el monto pagado', 'error'); return; }
    setGuardando(true);
    try {
      await api(`/tesoreria/pago-requerimientos/${procesando.id}/procesar`, {
        method: 'POST',
        body: {
          numero_constancia: form.numero_constancia,
          cuenta_origen:     form.cuenta_origen,
          monto:             parseFloat(form.monto),
          moneda:            form.moneda,
        },
      });
      toast('Pago procesado correctamente');
      setProcesando(null);
      qc.invalidateQueries({ queryKey: ['tesoreria', 'pago-req'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Pago de requerimientos"
        subtitle={isLoading ? 'Cargando…' : `${ocs.length} órdenes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en versión actual', icon: <ArrowUpRight size={17} />,
              onSelect: () => abrirClasico('tesoreria/pago-requerimientos') },
          ]} />
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', marginBottom: 'var(--s-3)' }}>
        {[
          { label: 'Por pagar', valor: String(kpis.pendientes), color: 'blue', onClick: () => { setFiltroEstado('aprobado'); setFiltroMoneda('TODAS'); } },
          { label: 'Total S/', valor: `S/ ${kpis.totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, color: 'amber', onClick: () => { setFiltroEstado('aprobado'); setFiltroMoneda('PEN'); } },
          { label: 'Total US$', valor: `US$ ${kpis.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'amber', onClick: () => { setFiltroEstado('aprobado'); setFiltroMoneda('USD'); } },
          { label: 'Pagados', valor: String(kpis.pagados), color: 'green', onClick: () => { setFiltroEstado('procesados'); setFiltroMoneda('TODAS'); } },
        ].map(k => (
          <div key={k.label} onClick={k.onClick}
            style={{ flex: 1, minWidth: '9rem', background: 'var(--fill-1)', borderRadius: 10, padding: '10px 14px',
              border: '1px solid var(--separator)', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', color: `var(--${k.color}-ink)` }}>
              {k.valor}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--s-3)' }}>
        {[
          { key: 'aprobado' as FiltroEstado, label: 'Por pagar' },
          { key: 'procesados' as FiltroEstado, label: 'Pagados' },
          { key: 'todos' as FiltroEstado, label: 'Todos' },
        ].map(f => (
          <button key={f.key} type="button"
            className={`chip${filtroEstado === f.key ? ' chip--active' : ''}`}
            onClick={() => setFiltroEstado(f.key)}>
            {f.label}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--separator)', margin: '0 4px' }} />
        {(['TODAS', 'PEN', 'USD'] as const).map(m => (
          <button key={m} type="button"
            className={`chip${filtroMoneda === m ? ' chip--active' : ''}`}
            onClick={() => setFiltroMoneda(m)}>
            {m === 'TODAS' ? 'Toda moneda' : m}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', maxWidth: '16rem' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="OC, proveedor, motivo…" />
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? <PageLoader /> : visibles.length === 0 ? (
        <EmptyState icon={busqueda ? <SearchX size={22} /> : <CreditCard size={22} />}
          title={busqueda ? 'Sin coincidencias' : filtroEstado === 'aprobado' ? 'Sin órdenes pendientes' : 'Sin órdenes'}>
          {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar búsqueda</button>}
        </EmptyState>
      ) : (
        <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
          <table className="inv-kardex" style={{ minWidth: '56rem' }}>
            <thead>
              <tr>
                <th>Código OC</th>
                <th>Proveedor</th>
                <th>Motivo / CC</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>Moneda</th>
                <th>Solicitante</th>
                <th>Fecha</th>
                <th>Estado</th>
                {filtroEstado !== 'procesados' && <th style={{ width: 100 }} />}
              </tr>
            </thead>
            <tbody>
              {visibles.map(oc => {
                const color = ocEstadoColor(oc.estado);
                const usd   = esUSD(oc.moneda);
                const imp   = ocImporte(oc);
                const estado = String(oc.estado ?? '');
                const pendiente = ['aprobado', 'autorizado'].includes(estado.toLowerCase());
                return (
                  <tr key={String(oc.id)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                      {ocCodigo(oc)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{oc.proveedor_nombre || '—'}</div>
                      {oc.proveedor_ruc && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{oc.proveedor_ruc}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      <div>{oc.motivo || oc.sub_motivo || '—'}</div>
                      {oc.centro_costo && (
                        <div style={{ color: 'var(--label-2)', fontSize: '0.75rem' }}>{oc.centro_costo}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: usd ? 'var(--blue-ink)' : 'var(--label-1)' }}>
                      {imp > 0 ? fmtMonto(imp, usd) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                      {usd ? 'USD' : 'PEN'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                      {oc.solicitante || oc.creado_por_nombre || oc.creado_por || '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--label-2)' }}>
                      {oc.fecha ? String(oc.fecha).split('T')[0] : '—'}
                    </td>
                    <td>
                      <span className={`ot-estado ot-estado--${color}`} style={{ fontSize: '0.75rem' }}>
                        {estado || '—'}
                      </span>
                      {oc.fecha_pago && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--label-3)', marginTop: 2 }}>
                          {String(oc.fecha_pago).split('T')[0]}
                        </div>
                      )}
                    </td>
                    {filtroEstado !== 'procesados' && (
                      <td>
                        {pendiente && (
                          <Button variant="primary" size="sm" onClick={() => abrirProcesar(oc)}>
                            Procesar
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal procesar pago */}
      <Sheet
        open={!!procesando}
        onClose={() => setProcesando(null)}
        title={`Procesar pago — ${procesando ? ocCodigo(procesando) : ''}`}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="plain" onClick={() => setProcesando(null)} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" onClick={procesarPago} loading={guardando}>
              Confirmar pago
            </Button>
          </div>
        }
      >
        {procesando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            {/* Resumen OC */}
            <div style={{ background: 'var(--fill-2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.875rem' }}>
              <div style={{ fontWeight: 600 }}>{procesando.proveedor_nombre || 'Proveedor'}</div>
              <div style={{ color: 'var(--label-2)' }}>{procesando.motivo || procesando.sub_motivo || '—'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: 4, color: 'var(--accent)' }}>
                {fmtMonto(ocImporte(procesando), esUSD(procesando.moneda))}
              </div>
            </div>

            <Field label="N° de constancia / operación">
              {props => (
                <TextInput {...props} value={form.numero_constancia}
                  onChange={e => setForm(f => ({ ...f, numero_constancia: e.target.value }))}
                  placeholder="Ej. 00123456" autoFocus />
              )}
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
              <Field label="Monto pagado">
                {props => (
                  <TextInput {...props} type="number" value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00" step="0.01" min="0" />
                )}
              </Field>
              <Field label="Moneda">
                {props => (
                  <SelectInput {...props} value={form.moneda}
                    onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </SelectInput>
                )}
              </Field>
            </div>

            <Field label="Cuenta bancaria origen (opcional)">
              {props => (
                <TextInput {...props} value={form.cuenta_origen}
                  onChange={e => setForm(f => ({ ...f, cuenta_origen: e.target.value }))}
                  placeholder="Banco — N° de cuenta" />
              )}
            </Field>

            {procesando.cuentas_bancarias && procesando.cuentas_bancarias.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--label-2)', marginBottom: 6, fontWeight: 600 }}>
                  Cuentas del proveedor:
                </div>
                {procesando.cuentas_bancarias.map((cta, i) => (
                  <button key={i} type="button"
                    onClick={() => setForm(f => ({ ...f, cuenta_origen: cta.texto, moneda: cta.moneda }))}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', marginBottom: 4, borderRadius: 6, fontSize: '0.8rem',
                      background: form.cuenta_origen === cta.texto ? 'var(--accent-tint)' : 'var(--fill-2)',
                      border: `1px solid ${form.cuenta_origen === cta.texto ? 'var(--accent)' : 'var(--separator)'}`,
                      color: 'var(--label-1)', cursor: 'pointer',
                    }}>
                    {cta.texto}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
