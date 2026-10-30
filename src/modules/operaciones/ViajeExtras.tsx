import { useQueries, useQuery } from '@tanstack/react-query';
import { Plus, ScrollText } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';

const num = (v: unknown) => Number(v) || 0;
const money = (v: unknown) => num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Soles con S/ y espacio no divisible
const soles = (v: unknown) => 'S/\u00a0' + money(v);

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
                {o.cliente_nombre || 'Sin cliente'} · {String(o.estado_servicio ?? 'PENDIENTE')} · {/DOL/i.test(String(o.moneda ?? '')) ? 'US$\u00a0' : 'S/\u00a0'}{money(o.costo_flete)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DocOSViaje { numero_documento?: string | null; guia?: string | null; descripcion?: string | null; remitente?: string | null; destinatario?: string | null; peso?: number | string | null; volumen?: number | string | null; cantidad?: number | string | null; fecha_carga_fmt?: string | null; fecha_entrega_fmt?: string | null }

// Documentos de transporte (GRE) de las órdenes de servicio del viaje, igual que la pestaña del clásico
export function SeccionDocumentosViaje({ codigo }: { codigo: string }) {
  const os = useQuery({
    queryKey: ['operaciones', 'os-viaje', codigo],
    queryFn: () => api<{ data?: OSViaje[] }>(`/operaciones/ordenes-servicio?viaje=${encodeURIComponent(codigo)}`).then(r => r.data ?? []),
    staleTime: 15_000,
  });
  const lista = os.data ?? [];
  // Clave propia: la ficha de la orden guarda el objeto completo bajo ['operaciones','orden-servicio',id]
  const detalles = useQueries({
    queries: lista.map(o => ({
      queryKey: ['operaciones', 'os-documentos', o.id],
      queryFn: () => api<{ data?: { documentos?: DocOSViaje[] } }>(`/operaciones/ordenes-servicio/${o.id}`)
        .then(r => (r.data?.documentos ?? []).map(d => ({ ...d, codigo_orden: o.codigo_orden }))),
      staleTime: 15_000,
    })),
  });
  const docs = detalles.flatMap(d => d.data ?? []);
  const cargando = os.isLoading || detalles.some(d => d.isLoading);
  const error = os.error ?? detalles.find(d => d.error)?.error ?? null;
  const pesoTotal = docs.reduce((s, d) => s + num(d.peso), 0);

  return (
    <div>
      <p className="tarjeta__grupo-titulo">Documentos de transporte ({docs.length})</p>
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {docs.length > 0 && (
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{money(pesoTotal)} kg</span><span className="inv-metrica__label">Peso total</span></div>
        </div>
      )}
      <div className="tarjeta__lista" style={{ marginTop: docs.length ? 'var(--s-2)' : undefined }}>
        {docs.map((d, i) => (
          <div key={`${d.codigo_orden}-${d.numero_documento ?? d.guia ?? i}-${i}`} className="dato" style={{ alignItems: 'center' }}>
            <span className="dato__label" style={{ fontFamily: 'var(--font-mono)' }}>{d.codigo_orden} · {d.numero_documento || d.guia || d.descripcion || `Documento ${i + 1}`}</span>
            <span className="dato__valor" style={{ textAlign: 'right' }}>
              {num(d.peso).toLocaleString('es-PE')} kg · {num(d.volumen).toFixed(3)} m³ · {num(d.cantidad) || 1} bulto(s)
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{[d.remitente, d.destinatario].filter(Boolean).join(' → ') || '—'}</span>
            </span>
          </div>
        ))}
        {!cargando && !error && docs.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No se registran documentos de transporte para este viaje.</span></div>
        )}
      </div>
    </div>
  );
}

// Pestañas que la versión actual deja siempre vacías (no tiene de dónde cargar esos registros): mismo mensaje
export function SeccionSinRegistros({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <div>
      <p className="tarjeta__grupo-titulo">{titulo}</p>
      <div className="tarjeta__lista">
        <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>{mensaje}</span></div>
      </div>
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
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.total_depositado)}</span><span className="inv-metrica__label">Depositado</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.total_rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{soles(liq.data?.saldo_diferencia)}</span><span className="inv-metrica__label">{etiquetaBalance || 'Saldo'}</span></div>
      </div>
      {(caja.isError || liq.isError) && <Notice tone="error">No se pudieron cargar los gastos del viaje.</Notice>}
      <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
        {depositos.map(d => (
          <div key={`c${d.id}`} className="dato">
            <span className="dato__label">Depósito {d.serie && d.numero ? `${d.serie}-${d.numero}` : ''}</span>
            <span className="dato__valor">{soles(d.importe_total)}</span>
          </div>
        ))}
        {gastos.map((g, i) => (
          <div key={`g${g.id ?? i}`} className="dato">
            <span className="dato__label">{g.descripcion || g.motivo || g.sub_motivo || 'Gasto'}</span>
            <span className="dato__valor">{soles(g.importe)}{g.estado ? ` · ${g.estado}` : ''}</span>
          </div>
        ))}
        {!caja.isLoading && !liq.isLoading && depositos.length === 0 && gastos.length === 0 && (
          <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin depósitos ni gastos registrados para este viaje.</span></div>
        )}
      </div>
    </div>
  );
}
