import { ArrowDownLeft, ArrowUpRight, Paperclip } from 'lucide-react';
import { Badge } from '../../core/ui/Display';
import { Celda } from '../../core/ui/TablaRedimensionable';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import type { MovimientoTesoreria } from './api';
import { importeMov, limpio } from './mov-utilidades';
import { tonoEstado } from './mov-estado';

// Fila de la tabla de escritorio: Debe/Haber como en el clásico (ingreso = Debe, egreso = Haber)
export function MovFilaTabla({ m, onAbrir }: { m: MovimientoTesoreria; onAbrir: (m: MovimientoTesoreria) => void }) {
  const ingreso = m.tipo_movimiento === 'INGRESO';
  const oc = m.tipo_origen === 'ORDEN DE COMPRA';
  const comprobante = m.voucher_url_presigned || m.voucher_url;
  const abrir = () => { haptic('selection'); onAbrir(m); };
  return (
    <tr
      className={`mov-tabla-fila${m.estado === 'ANULADO' ? ' mov-tabla-anulada' : ''}`}
      onClick={abrir}
      onKeyDown={e => { if (e.key === 'Enter') abrir(); }}
      tabIndex={0}
    >
      <Celda mono>{formatFechaPe(m.fecha_valuta || m.fecha)}</Celda>
      <Celda mono>{m.codigo_oc || m.caja_folio || '—'}</Celda>
      <td><Badge tone={oc ? 'accent' : 'amber'}>{oc ? 'ORDEN DE COMPRA' : 'CAJA CHICA'}</Badge></td>
      <td><Badge tone={ingreso ? 'green' : 'red'}>{ingreso ? 'INGRESO' : 'EGRESO'}</Badge></td>
      <Celda alinear="right" mono>{ingreso ? importeMov(m.monto, m.moneda) : ''}</Celda>
      <Celda alinear="right" mono>{!ingreso ? importeMov(m.monto, m.moneda) : ''}</Celda>
      <Celda>{limpio(m.beneficiario) || '—'}</Celda>
      <Celda>{m.motivo || '—'}</Celda>
      <Celda>{limpio(m.sub_motivo) || '—'}</Celda>
      <Celda>{limpio(m.descripcion) || '—'}</Celda>
      <Celda>{limpio(m.banco_cuenta) || '—'}</Celda>
      <Celda mono>{limpio(m.numero_operacion) || '—'}</Celda>
      <Celda mono>{limpio(m.numero_factura) || '—'}</Celda>
      <Celda>{limpio(m.tipo_persona) || '—'}</Celda>
      <Celda>{[m.centro_costo_nombre || m.centro_costo].filter(Boolean).join(' · ') || '—'}</Celda>
      <Celda mono>{[limpio(m.placa), limpio(m.orden_viaje)].filter(Boolean).join(' · ') || '—'}</Celda>
      <Celda>{limpio(m.solicitante) || '—'}</Celda>
      <Celda>{limpio(m.usuario_creacion) || '—'}</Celda>
      <Celda>{limpio(m.autoriza) || '—'}</Celda>
      <Celda mono>{formatFechaPe(m.fecha_aprobacion)}</Celda>
      <td><Badge tone={tonoEstado(m.estado)}>{m.estado}</Badge></td>
      <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        {comprobante
          ? <a className="btn btn--secondary btn--sm" href={comprobante} target="_blank" rel="noreferrer" aria-label="Abrir comprobante"><Paperclip size={14} /> Ver</a>
          : <span style={{ color: 'var(--label-2)' }}>—</span>}
      </td>
    </tr>
  );
}

// Fila de la lista del celular (una tarjeta por movimiento)
export function MovFilaMovil({ m, onAbrir }: { m: MovimientoTesoreria; onAbrir: (m: MovimientoTesoreria) => void }) {
  const ingreso = m.tipo_movimiento === 'INGRESO';
  const anulado = m.estado === 'ANULADO';
  return (
    <button type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); onAbrir(m); }}>
      <div className="mov-fila__icon" style={{ background: ingreso ? 'var(--green-tint)' : 'var(--red-tint)', color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)' }}>
        {ingreso ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
      </div>
      <div className="mov-fila__cuerpo">
        <span className="mov-fila__titulo">{limpio(m.beneficiario) || limpio(m.sub_motivo) || m.motivo}</span>
        <span className="mov-fila__sub">
          {[m.codigo_oc ? `OC ${m.codigo_oc}` : m.caja_folio, m.motivo, limpio(m.placa), formatFechaPe(m.fecha_valuta || m.fecha)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="mov-fila__derecha">
        <span className="mov-fila__monto" style={{ color: ingreso ? 'var(--green-ink)' : undefined, textDecoration: anulado ? 'line-through' : undefined, fontWeight: 700 }}>
          {ingreso ? '+' : '-'}{importeMov(m.monto, m.moneda)}
        </span>
        <Badge tone={tonoEstado(m.estado)}>{m.estado}</Badge>
      </div>
    </button>
  );
}
