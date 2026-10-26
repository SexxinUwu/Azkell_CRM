import { ExternalLink } from 'lucide-react';
import { Badge } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { formatFechaPe } from '../../core/lib/format';
import { importeMov, limpio, esDolar } from './mov-utilidades';
import type { MovimientoTesoreria } from './api';
import { tonoEstado } from './mov-estado';

// Ficha de un movimiento: datos completos y comprobante (imagen o PDF) cuando existe.
export function MovDetalleSheet({ mov: m, onClose }: { mov: MovimientoTesoreria | null; onClose: () => void }) {
  if (!m) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const fila = (label: string, valor: unknown, mono = false) => {
    const t = limpio(valor);
    return t ? (
      <div className="dato">
        <span className="dato__label">{label}</span>
        <span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{t}</span>
      </div>
    ) : null;
  };
  const comprobante = m.voucher_url_presigned || m.voucher_url;
  const ingreso = m.tipo_movimiento === 'INGRESO';
  const esPdf = !!comprobante && /\.pdf(\?|$)/i.test(comprobante);
  return (
    <Sheet open onClose={onClose} title={m.codigo_oc ? `OC ${m.codigo_oc}` : `Caja ${m.caja_folio}`}>
      <div className="mov-comprobante">
        <div className="mov-kpis">
          <div className="mov-kpi">
            <span className={`mov-kpi__num ${ingreso ? 'mov-kpi__num--ingreso' : 'mov-kpi__num--egreso'}`}>{importeMov(m.monto, m.moneda)}</span>
            <span className="mov-kpi__etiqueta">{esDolar(m.moneda) ? 'Monto en dólares' : 'Monto en soles'}</span>
          </div>
          <div className="mov-kpi">
            <span className="mov-kpi__num" style={{ fontSize: '1.05rem' }}>{ingreso ? 'Ingreso' : 'Egreso'}</span>
            <span className="mov-kpi__etiqueta">Movimiento</span>
          </div>
          <div className="mov-kpi">
            <span><Badge tone={tonoEstado(m.estado)}>{m.estado}</Badge></span>
            <span className="mov-kpi__etiqueta">Estado</span>
          </div>
        </div>

        <div className="tarjeta__lista">
          {fila('Origen', m.tipo_origen)}
          {fila('Fecha de depósito', formatFechaPe(m.fecha_valuta || m.fecha), true)}
          {fila('Motivo', [m.motivo, limpio(m.sub_motivo)].filter(Boolean).join(' › '))}
          {fila('Descripción', m.descripcion)}
          {fila('Beneficiario', [limpio(m.tipo_persona), limpio(m.beneficiario)].filter(Boolean).join(' · '))}
          {fila('Banco / cuenta', m.banco_cuenta)}
          {fila('N° de operación', m.numero_operacion, true)}
          {fila('N° de factura', m.numero_factura, true)}
          {fila('Centro de costos', [m.centro_costo, m.centro_costo_nombre].filter(Boolean).join(' · '))}
          {fila('Placa', m.placa, true)}
          {fila('Orden de viaje', m.orden_viaje, true)}
          {fila('Ruta', m.ruta)}
          {fila('Registrado por', m.usuario_creacion)}
          {fila('Solicitante', m.solicitante)}
          {fila('Autoriza', m.autoriza)}
          {fila('Fecha de aprobación', formatFechaPe(m.fecha_aprobacion), true)}
          {fila('Observación', m.observacion)}
        </div>

        {comprobante ? (
          <>
            {esPdf
              ? <iframe className="mov-comprobante__visor" src={comprobante} title={`Comprobante ${m.caja_folio}`} />
              : <img className="mov-comprobante__img" src={comprobante} alt={`Comprobante ${m.caja_folio}`} />}
            <a className="btn btn--secondary btn--sm" href={comprobante} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
              <ExternalLink size={14} /> Abrir comprobante en otra pestaña
            </a>
          </>
        ) : (
          <p className="mov-kpi__nota">Este movimiento no tiene comprobante adjunto.</p>
        )}
      </div>
    </Sheet>
  );
}
