import { useQuery } from '@tanstack/react-query';
import { Plus, ScrollText } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';

const num = (v: unknown) => Number(v) || 0;
const money = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface OSViaje { id: number; codigo_orden: string; cliente_nombre: string | null; estado_servicio: string | null; costo_flete: number | string | null; moneda: string | null; fecha_fmt: string | null }
interface CajaViaje { id: number; fecha: string | null; motivo: string | null; importe_total: number | string | null; estado: string | null; serie: string | null; numero: string | null }
interface GastoViaje { id?: number | string; descripcion?: string | null; motivo?: string | null; sub_motivo?: string | null; importe?: number | string | null; estado?: string | null; fecha?: string | null }
interface LiquidacionViaje { gastos: GastoViaje[]; total_depositado: number | string; total_rendido: number | string; saldo_diferencia: number | string; estado_balance: string }

// Órdenes de servicio asignadas a este viaje (viaje_asignado) — son sus rutas: cada OS lleva ruta, guías y flete
export function SeccionOrdenesServicioViaje({ codigo, onNueva, puedeCrear }: { codigo: string; onNueva: () => void; puedeCrear: boolean }) {
  const q = useQuery({
    queryKey: ['operaciones', 'os-viaje', codigo],
    queryFn: () => api<{ data?: OSViaje[] }>(`/operaciones/ordenes-servicio?viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const lista = q.data ?? [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="tarjeta__grupo-titulo">Órdenes de servicio del viaje ({lista.length})</p>
        {puedeCrear && <Button variant="secondary" icon={<Plus size={15} />} onClick={onNueva}>Nueva OS</Button>}
      </div>
      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {!q.isError && lista.length === 0 && !q.isLoading && (
        <div className="tarjeta__lista"><div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Este viaje aún no tiene órdenes de servicio.</span></div></div>
      )}
      {lista.length > 0 && (
        <div className="tarjeta__lista">
          {lista.map(o => (
            <div key={o.id} className="dato" style={{ alignItems: 'center' }}>
              <span className="dato__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ScrollText size={14} /> <span style={{ fontFamily: 'var(--font-mono)' }}>{o.codigo_orden}</span>
              </span>
              <span className="dato__valor" style={{ textAlign: 'right' }}>
                {o.cliente_nombre || 'Sin cliente'} · {String(o.estado_servicio ?? 'PENDIENTE')} · {/DOL/i.test(String(o.moneda ?? '')) ? 'US$' : 'S/'} {money(o.costo_flete)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Depósitos (caja) y gastos rendidos del viaje, con su balance. Solo lectura: se registran en Tesorería.
export function SeccionGastosViaje({ codigo }: { codigo: string }) {
  const caja = useQuery({
    queryKey: ['operaciones', 'caja-viaje', codigo],
    queryFn: () => api<{ data?: CajaViaje[] }>(`/tesoreria/caja?orden_viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const liq = useQuery({
    queryKey: ['operaciones', 'liq-viaje', codigo],
    queryFn: () => api<LiquidacionViaje & { ok?: boolean }>(`/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(codigo)}`),
    staleTime: 15_000,
  });
  const depositos = caja.data ?? [];
  const gastos = liq.data?.gastos ?? [];
  const balance = liq.data?.estado_balance;
  const etiquetaBalance = balance === 'CUADRADO' ? 'Cuadrado' : balance === 'SALDO_EMPRESA' ? 'Saldo a favor de la empresa' : balance === 'SALDO_CONDUCTOR' ? 'Saldo a favor del conductor' : '';

  return (
    <div>
      <p className="tarjeta__grupo-titulo">Gastos del viaje</p>
      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>S/ {money(liq.data?.total_depositado)}</span><span className="inv-metrica__label">Depositado</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>S/ {money(liq.data?.total_rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>S/ {money(liq.data?.saldo_diferencia)}</span><span className="inv-metrica__label">{etiquetaBalance || 'Saldo'}</span></div>
      </div>
      {(caja.isError || liq.isError) && <Notice tone="error">No se pudieron cargar los gastos del viaje.</Notice>}
      <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
        {depositos.map(d => (
          <div key={`c${d.id}`} className="dato">
            <span className="dato__label">Depósito {d.serie && d.numero ? `${d.serie}-${d.numero}` : ''}</span>
            <span className="dato__valor">S/ {money(d.importe_total)}</span>
          </div>
        ))}
        {gastos.map((g, i) => (
          <div key={`g${g.id ?? i}`} className="dato">
            <span className="dato__label">{g.descripcion || g.motivo || g.sub_motivo || 'Gasto'}</span>
            <span className="dato__valor">S/ {money(g.importe)}{g.estado ? ` · ${g.estado}` : ''}</span>
          </div>
        ))}
        {!caja.isLoading && !liq.isLoading && depositos.length === 0 && gastos.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin depósitos ni gastos registrados para este viaje.</span></div>
        )}
      </div>
    </div>
  );
}
