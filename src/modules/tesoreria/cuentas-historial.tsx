import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { EmptyState, Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import type { CuentaPorCobrar } from './api';

// Trazabilidad de los cambios de factura de una cuenta (GET /api/tesoreria/cuentas/:id/historial-facturas)
interface HistorialFactura {
  id: number;
  factura_anterior_serie: string | null;
  factura_anterior_numero: string | null;
  factura_anterior_view_url?: string | null;
  nota_credito_serie: string | null;
  nota_credito_numero: string | null;
  nota_credito_view_url?: string | null;
  motivo_anulacion: string | null;
  factura_nueva_serie: string | null;
  factura_nueva_numero: string | null;
  factura_nueva_view_url?: string | null;
  usuario_registro: string | null;
  fecha_registro: string | null;
}

const par = (serie: string | null, numero: string | null) => [serie, numero].filter(Boolean).join('-') || '—';

function Ver({ url }: { url?: string | null }) {
  if (!url) return null;
  return <a className="btn btn--plain btn--sm" href={url} target="_blank" rel="noreferrer">Ver PDF</a>;
}

export function HistorialNC({ cuenta, onClose }: { cuenta: CuentaPorCobrar | null; onClose: () => void }) {
  const id = cuenta?.id;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tesoreria', 'cuentas', id, 'historial'],
    queryFn: async () => {
      if (id === undefined) return [] as HistorialFactura[];
      const r = await api<{ data?: HistorialFactura[] }>(`/tesoreria/cuentas/${id}/historial-facturas`);
      return r.data ?? [];
    },
    enabled: id !== undefined,
  });

  return (
    <Sheet open={!!cuenta} onClose={onClose} title="Historial de facturas y notas de crédito">
      {isLoading ? (
        <p className="t-callout c-secondary">Cargando historial…</p>
      ) : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Clock size={22} />} title="Sin cambios de factura">
          Esta cuenta no tiene notas de crédito emitidas.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {data.map(h => (
            <div key={h.id} className="tarjeta__lista">
              <div className="dato">
                <span className="dato__label">Cambio registrado</span>
                <span className="dato__valor">{formatFechaHoraPe(h.fecha_registro)}{h.usuario_registro ? ` · ${h.usuario_registro}` : ''}</span>
              </div>
              <div className="dato">
                <span className="dato__label">Factura anulada</span>
                <span className="dato__valor" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  {par(h.factura_anterior_serie, h.factura_anterior_numero)}<Ver url={h.factura_anterior_view_url} />
                </span>
              </div>
              <div className="dato">
                <span className="dato__label">Nota de crédito</span>
                <span className="dato__valor" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  {par(h.nota_credito_serie, h.nota_credito_numero)}<Ver url={h.nota_credito_view_url} />
                </span>
              </div>
              <div className="dato">
                <span className="dato__label">Motivo SUNAT</span>
                <span className="dato__valor">{h.motivo_anulacion || '—'}</span>
              </div>
              <div className="dato">
                <span className="dato__label">Factura nueva</span>
                <span className="dato__valor" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  {par(h.factura_nueva_serie, h.factura_nueva_numero)}<Ver url={h.factura_nueva_view_url} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
