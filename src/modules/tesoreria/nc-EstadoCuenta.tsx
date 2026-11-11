import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaPe } from '../../core/lib/format';
import { montoNc, type AplicacionNc, type NotaCredito } from './nc-api';
import './nc.css';

interface Movimiento { clave: string; fecha: string; texto: string; detalle: string; monto: number; moneda: string; tono: 'mas' | 'menos' | 'neutro' }

/** Estado de cuenta de un proveedor: cada nota que dio, cada vez que se aplicó a una orden, los reembolsos y el saldo que le queda a favor. */
export function NcEstadoCuenta({ proveedor, nombre, onClose, onVerNotas }: { proveedor: string | null; nombre: string; onClose: () => void; onVerNotas: () => void }) {
  const q = useQuery({
    queryKey: ['tesoreria', 'notas-credito', 'estado-cuenta', proveedor],
    enabled: !!proveedor,
    queryFn: () => api<{ notas: NotaCredito[]; aplicaciones: AplicacionNc[] & Array<{ nc_id: number }> }>('/compras/notas-credito/estado-cuenta', { query: { proveedor: proveedor ?? '' } }),
  });

  const { movimientos, saldos } = useMemo(() => {
    const notas = q.data?.notas ?? [], apps = (q.data?.aplicaciones ?? []) as Array<AplicacionNc & { nc_id: number }>;
    const porId = new Map(notas.map(n => [n.id, n]));
    const mov: Movimiento[] = [];
    for (const n of notas) {
      if (n.estado === 'ANULADA') { mov.push({ clave: `n${n.id}`, fecha: n.fecha_emision, texto: `${n.codigo} · anulada`, detalle: `${n.serie}-${n.numero}`, monto: 0, moneda: n.moneda, tono: 'neutro' }); continue; }
      mov.push({ clave: `n${n.id}`, fecha: n.fecha_emision, texto: `Nota de crédito ${n.codigo}`, detalle: `${n.serie}-${n.numero}${n.oc_origen ? ` · orden ${n.oc_origen}` : ''}${n.estado === 'REGISTRADA' ? ' · por aprobar' : ''}`, monto: n.estado === 'REGISTRADA' ? 0 : n.total, moneda: n.moneda, tono: n.estado === 'REGISTRADA' ? 'neutro' : 'mas' });
      if (n.estado === 'REEMBOLSADA' && n.reembolso_fecha) {
        const usado = apps.filter(a => a.nc_id === n.id && a.estado === 'VIGENTE').reduce((s, a) => s + a.monto, 0);
        mov.push({ clave: `r${n.id}`, fecha: n.reembolso_fecha, texto: `Reembolso de ${n.codigo}`, detalle: `Operación ${n.reembolso_constancia ?? ''}`, monto: Math.round((n.total - usado) * 100) / 100, moneda: n.moneda, tono: 'menos' });
      }
    }
    for (const a of apps) {
      if (a.estado !== 'VIGENTE') continue;
      const n = porId.get(a.nc_id);
      mov.push({ clave: `a${a.id}`, fecha: a.fecha.slice(0, 10), texto: `Aplicada a la orden ${String(a.entrada_id).replace(/^ENT-/, '')}`, detalle: `${n?.codigo ?? ''} · ${a.usuario ?? ''}`, monto: a.monto, moneda: a.moneda, tono: 'menos' });
    }
    mov.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.clave.localeCompare(y.clave));
    const saldos = new Map<string, number>();
    for (const m of mov) if (m.tono !== 'neutro') saldos.set(m.moneda, Math.round(((saldos.get(m.moneda) ?? 0) + (m.tono === 'mas' ? m.monto : -m.monto)) * 100) / 100);
    return { movimientos: mov, saldos };
  }, [q.data]);

  const corrido = (() => { const acc = new Map<string, number>(); return movimientos.map(m => { if (m.tono !== 'neutro') acc.set(m.moneda, Math.round(((acc.get(m.moneda) ?? 0) + (m.tono === 'mas' ? m.monto : -m.monto)) * 100) / 100); return acc.get(m.moneda) ?? 0; }); })();

  return (
    <Sheet open={!!proveedor} onClose={onClose} title={`Estado de cuenta · ${nombre}`} ancho
      footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button variant="primary" onClick={onVerNotas}>Ver sus notas</Button></>}>
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="nc-total-cifras" style={{ gridTemplateColumns: `repeat(${Math.max(1, saldos.size)}, 1fr)` }}>
            {[...saldos.entries()].map(([m, v]) => <div key={m}><strong style={{ color: v > 0 ? 'var(--green-ink)' : undefined }}>{montoNc(v, m)}</strong><span>Saldo a favor ({m === 'USD' ? 'US$' : 'S/'})</span></div>)}
            {saldos.size === 0 && <div><strong>—</strong><span>Sin movimientos</span></div>}
          </div>
          <ul className="nc-lineas">
            {movimientos.map((m, i) => (
              <li key={m.clave}>
                <time>{formatFechaPe(m.fecha)}</time>
                <span style={{ flex: 1, minWidth: 0 }}><b>{m.texto}</b><small>{m.detalle}</small></span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.tono === 'mas' ? 'var(--green-ink)' : m.tono === 'menos' ? 'var(--red-ink)' : 'var(--label-3)', whiteSpace: 'nowrap' }}>
                  {m.tono === 'neutro' ? '—' : `${m.tono === 'mas' ? '+' : '−'} ${montoNc(m.monto, m.moneda)}`}
                  <small style={{ color: 'var(--label-2)' }}>saldo {montoNc(corrido[i], m.moneda)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
