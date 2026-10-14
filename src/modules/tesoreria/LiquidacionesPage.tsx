import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert, FileSpreadsheet, Paperclip, ScrollText, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { escribirTesoreria, fmtMonto } from './api';

interface Viaje {
  viaje: string;
  fecha: string | null;
  conductor: string | null;
  placa_tracto: string | null;
  placa_remolque: string | null;
  ruta: string | null;
  total_depositado: number | string;
  total_rendido: number | string;
  saldo_diferencia: number | string;
  estado_balance: string;       // CUADRADO | SOBRANTE | FALTANTE | PENDIENTE …
}

interface Gasto {
  fecha?: string; tipo_gasto?: string; sub_motivo?: string; detalle?: string; proveedor_nombre?: string;
  tipo_comprobante?: string; numero?: string; importe?: number | string; sustento_view_url?: string; sustento_url?: string;
}
interface Caja {
  serie?: string; numero?: string; fecha?: string; motivo?: string; sub_motivo?: string; importe_total?: number | string;
  estado?: string; voucher_view_url?: string; voucher_url?: string; conductor?: string; persona?: string;
}
interface DetalleViaje {
  ok: boolean; total_depositado: number; total_rendido: number; saldo_diferencia: number; estado_balance: string; gastos: Gasto[];
}

const num = (v: unknown) => Number(v) || 0;
const tonoBalance = (e: string) => (e === 'CUADRADO' ? 'green' : e === 'SOBRANTE' ? 'amber' : e === 'FALTANTE' ? 'red' : 'neutral');
const dia = (s?: string | null) => (s ? String(s).split('T')[0] : '—');

function useViajes(q: string, estado: string) {
  return useQuery<Viaje[]>({
    queryKey: ['tesoreria', 'liquidaciones', q, estado],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '100' });
      if (q) p.set('q', q);
      if (estado) p.set('estado_balance', estado);
      return api<{ ok?: boolean; data?: Viaje[] }>(`/tesoreria/liquidaciones-gastos?${p}`).then(r => (Array.isArray(r.data) ? r.data : []));
    },
    staleTime: 30_000,
  });
}

// Tesorería › Liquidaciones: balance depositado vs. rendido por viaje, y caja de compensación.
export function LiquidacionesPage() {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState<Viaje | null>(null);
  const toast = useToast();
  // La búsqueda va al servidor (límite de 100 viajes): se espera a que deje de escribir
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error } = useViajes(q, estado);
  const lista = data ?? [];

  const resumen = useMemo(() => ({
    deposit: lista.reduce((s, v) => s + num(v.total_depositado), 0),
    rendido: lista.reduce((s, v) => s + num(v.total_rendido), 0),
    pendientes: lista.filter(v => v.estado_balance !== 'CUADRADO').length,
  }), [lista]);

  async function exportar() {
    try {
      await exportarExcel('Liquidaciones-por-viaje', 'Liquidaciones',
        ['Viaje', 'Fecha', 'Conductor', 'Tracto', 'Remolque', 'Ruta', 'Depositado', 'Rendido', 'Diferencia', 'Estado'],
        lista.map(v => [v.viaje, dia(v.fecha), v.conductor, v.placa_tracto, v.placa_remolque, v.ruta,
          num(v.total_depositado), num(v.total_rendido), num(v.saldo_diferencia), v.estado_balance]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Liquidaciones"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} viajes · ${resumen.pendientes} por regularizar`}
        actions={
          <MenuOtros opciones={[
            { label: 'Exportar Excel', detalle: `${lista.length} viajes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('tesoreria/liquidaciones') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num">{fmtMonto(resumen.deposit)}</span><span className="inv-metrica__label">Depositado</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{fmtMonto(resumen.rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{resumen.pendientes}</span><span className="inv-metrica__label">Por regularizar</span></div>
        </div>

        <SearchField value={busqueda} onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _liqT?: number })._liqT); (window as unknown as { _liqT?: number })._liqT = window.setTimeout(() => setQ(v.trim()), 350); }}
          placeholder="Viaje, conductor, placa o ruta…" />
        <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado del balance">
          <option value="">Todos los balances</option>
          <option value="CUADRADO">Cuadrado</option>
          <option value="SOBRANTE">Sobrante (devuelve el conductor)</option>
          <option value="FALTANTE">Faltante (reembolso al conductor)</option>
          <option value="PENDIENTE">Pendiente</option>
        </SelectInput>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <ScrollText size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin liquidaciones'}>
            {busqueda || estado ? 'Prueba con otra búsqueda o quita el filtro.' : 'Aparecen cuando hay viajes con cajas de viáticos y gastos rendidos.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {lista.map(v => {
              const t = tonoBalance(v.estado_balance);
              return (
                <button key={v.viaje} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbierto(v); }}>
                  <div className="mov-fila__icon" style={{ background: `var(--${t === 'neutral' ? 'gray' : t}-tint)`, color: `var(--${t === 'neutral' ? 'gray' : t}-ink)` }}>
                    <ScrollText size={16} />
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{v.viaje} · {v.conductor || 'Sin conductor'}</span>
                    <span className="mov-fila__sub">{[v.placa_tracto, v.placa_remolque, v.ruta].filter(Boolean).join(' · ') || dia(v.fecha)}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto">{fmtMonto(num(v.saldo_diferencia))}</span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${t === 'neutral' ? 'gray' : t}-ink)` }}>{v.estado_balance}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DetalleLiquidacion viaje={abierto} onClose={() => setAbierto(null)} />
    </Page>
  );
}

function DetalleLiquidacion({ viaje, onClose }: { viaje: Viaje | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user, can } = useAuth();
  const codigo = viaje?.viaje ?? '';
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const det = useQuery<DetalleViaje>({
    queryKey: ['tesoreria', 'liquidacion', codigo],
    enabled: !!codigo,
    queryFn: () => api<DetalleViaje>(`/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(codigo)}`),
  });
  const cajas = useQuery<Caja[]>({
    queryKey: ['tesoreria', 'liquidacion-cajas', codigo],
    enabled: !!codigo,
    queryFn: () => api<{ data?: Caja[] }>(`/tesoreria/caja?orden_viaje=${encodeURIComponent(codigo)}`).then(r => (Array.isArray(r.data) ? r.data : [])),
  });

  const d = det.data;
  const saldo = d ? num(d.saldo_diferencia) : 0;
  const tipo = saldo > 0 ? 'DEVOLUCION_EMPRESA' : saldo < 0 ? 'REEMBOLSO_CONDUCTOR' : null;
  const opciones = tipo === 'DEVOLUCION_EMPRESA'
    ? [
      { value: 'CAJA_PRINCIPAL', label: 'Caja principal de Tesorería (depósito en banco)' },
      { value: 'CAJA_CHICA', label: 'Caja chica de operaciones (efectivo)' },
      { value: 'DESCUENTO_PLANILLA', label: 'Descontar de su próxima asignación o planilla' },
    ]
    : [
      { value: 'TRANSFERENCIA', label: 'Transferencia bancaria a la cuenta del conductor' },
      { value: 'EFECTIVO', label: 'Efectivo por caja chica' },
    ];
  const destinoEfectivo = destino || opciones[0].value;
  const conductor = cajas.data?.[0]?.conductor || cajas.data?.[0]?.persona || viaje?.conductor || '';

  async function generar() {
    if (!tipo) return;
    setEnviando(true); setError(null);
    try {
      const r = await escribirTesoreria('/tesoreria/liquidaciones-gastos/generar-caja-compensacion', 'POST', {
        orden_viaje: codigo, tipo_compensacion: tipo, destino_devolucion: destinoEfectivo, importe: Math.abs(saldo),
        conductor, usuario_creacion: user?.name ?? 'TESORERIA',
        descripcion: `Compensación automática liquidación viaje ${codigo} [Destino: ${destinoEfectivo}]`,
      });
      haptic('success'); toast(r.message || 'Caja de compensación generada');
      await qc.invalidateQueries({ queryKey: ['tesoreria'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const url = (g: { sustento_view_url?: string; sustento_url?: string; voucher_view_url?: string; voucher_url?: string }) =>
    g.sustento_view_url || g.sustento_url || g.voucher_view_url || g.voucher_url || '';

  return (
    <Sheet open={!!viaje} onClose={() => !enviando && onClose()} title={`Viaje ${codigo}`} footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {det.isLoading ? <PageLoader /> : det.isError || !d?.ok ? (
        <Notice tone="error">No se pudo cargar la información del viaje.</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num">{fmtMonto(d.total_depositado)}</span><span className="inv-metrica__label">Depositado</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{fmtMonto(d.total_rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
            <div className="inv-metrica"><span className={`inv-metrica__num inv-metrica__num--${saldo < 0 ? 'critical' : saldo > 0 ? 'warning' : ''}`}>{fmtMonto(saldo)}</span><span className="inv-metrica__label">Diferencia</span></div>
          </div>

          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          {tipo && can('tesoreria_liquidaciones.crear', 'tesoreria_caja.crear') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <Notice tone="accent">
                {tipo === 'DEVOLUCION_EMPRESA'
                  ? <>Sobrante de viáticos: el conductor debe devolver <strong>S/ {saldo.toFixed(2)}</strong> a la empresa.</>
                  : <>Gasto en exceso: la empresa debe reembolsar <strong>S/ {Math.abs(saldo).toFixed(2)}</strong> al conductor.</>}
              </Notice>
              <Field label={tipo === 'DEVOLUCION_EMPRESA' ? 'Destino de la devolución' : 'Forma de reembolso'}>
                {p => (
                  <SelectInput {...p} value={destinoEfectivo} onChange={e => setDestino(e.target.value)}>
                    {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SelectInput>
                )}
              </Field>
              <Button variant="primary" onClick={generar} loading={enviando}>
                {tipo === 'DEVOLUCION_EMPRESA' ? 'Generar caja de ingreso (devolución)' : 'Generar caja de reembolso (egreso)'}
              </Button>
            </div>
          )}

          <div>
            <p className="tarjeta__grupo-titulo">Cajas asignadas ({cajas.data?.length ?? 0})</p>
            <div className="tarjeta__lista">
              {(cajas.data ?? []).length === 0 && <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No hay cajas asignadas.</span></div>}
              {(cajas.data ?? []).map((c, i) => (
                <div key={i} className="dato">
                  <span className="dato__label" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{c.serie}-{c.numero} · {dia(c.fecha)}</span>
                  <span className="dato__valor">{[c.motivo, c.sub_motivo].filter(Boolean).join(' › ')} — <strong>{fmtMonto(num(c.importe_total))}</strong> · {c.estado ?? 'PENDIENTE'}</span>
                  {url(c) && <a className="dato__valor dato__valor--enlace" href={url(c)} target="_blank" rel="noreferrer"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /> Voucher</a>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="tarjeta__grupo-titulo">Gastos rendidos ({d.gastos?.length ?? 0})</p>
            <div className="tarjeta__lista">
              {(d.gastos ?? []).length === 0 && <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Aún no hay gastos rendidos.</span></div>}
              {(d.gastos ?? []).map((g, i) => (
                <div key={i} className="dato">
                  <span className="dato__label">{dia(g.fecha)} · {[g.tipo_gasto, g.sub_motivo].filter(Boolean).join(' › ')}</span>
                  <span className="dato__valor">{g.detalle || g.proveedor_nombre || '—'} — <strong>{fmtMonto(num(g.importe))}</strong></span>
                  <span className="dato__valor" style={{ fontSize: '0.75rem', color: 'var(--label-3)' }}>{[g.tipo_comprobante, g.numero].filter(Boolean).join(' ')}</span>
                  {url(g) && <a className="dato__valor dato__valor--enlace" href={url(g)} target="_blank" rel="noreferrer"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /> Sustento</a>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
