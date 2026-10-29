import type { ReactNode } from 'react';
import { Banknote, Clock, FileText, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Badge } from '../../core/ui/Display';
import { Button } from '../../core/ui/Button';
import { formatFechaPe } from '../../core/lib/format';
import type { CuentaPorCobrar } from './api';
import { estadoDe, num, soles, textoVencimiento, tonoCuenta, verUrl, type CampoDocumento } from './cuentas-util';

// Ficha de una cuenta con sus acciones. Las acciones que no aplican llegan como undefined y no se muestran.
interface Props {
  cuenta: CuentaPorCobrar | null;
  onClose: () => void;
  onEditar?: () => void;
  onPagar?: () => void;
  onRevertir?: () => void;
  onEliminar?: () => void;
  onNotaCredito?: () => void;
  onHistorial: () => void;
}

function Fila({ label, valor, fuerte }: { label: string; valor: ReactNode; fuerte?: boolean }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div className="dato">
      <span className="dato__label">{label}</span>
      <span className="dato__valor" style={fuerte ? { fontWeight: 700 } : undefined}>{valor}</span>
    </div>
  );
}

export function DetalleCuenta({ cuenta: c, onClose, onEditar, onPagar, onRevertir, onEliminar, onNotaCredito, onHistorial }: Props) {
  const titulo = c ? `${c.serie ?? ''}${c.serie && c.factura ? '-' : ''}${c.factura || c.codigo_liquidacion || 'Sin factura'}` : '';
  const estado = c ? estadoDe(c) : '';
  const enlaces: Array<[string, CampoDocumento]> = [
    ['Factura', 'factura_documento'], ['Liquidación', 'documento'], ['Constancia de pago', 'sustento_pago'], ['Nota de crédito', 'nota_credito'],
  ];
  const documentos = c ? enlaces.map(([label, campo]) => [label, verUrl(c, campo)] as const).filter(([, url]) => url) : [];

  return (
    <Sheet open={!!c} onClose={onClose} title={titulo} ancho
      footer={c ? (
        <>
          {onEliminar && <Button variant="danger" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
          <Button variant="secondary" icon={<Clock size={16} />} onClick={onHistorial}>Historial</Button>
          {onNotaCredito && <Button variant="secondary" icon={<FileText size={16} />} onClick={onNotaCredito}>Cambiar factura (NC)</Button>}
          {onEditar && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          {onRevertir && <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={onRevertir}>Volver a pendiente</Button>}
          {onPagar && (
            <Button variant={estado === 'PAGADO' ? 'secondary' : 'primary'} icon={<Banknote size={16} />} onClick={onPagar}>
              {estado === 'PAGADO' ? 'Ver o subir constancia' : 'Registrar pago'}
            </Button>
          )}
        </>
      ) : undefined}>
      {c && (
        <div className="cuentas-detalle">
          <div className="cuentas-detalle__resumen">
            <div className="cuentas-detalle__cabecera">
              <span className="cuentas-detalle__cliente">{c.cliente || c.razon_social || 'Sin cliente'}</span>
              <Badge tone={tonoCuenta(c)}>{estado || 'PENDIENTE'}</Badge>
            </div>
            <span className="cuentas-detalle__monto">{soles(c.neto_cobrar)}</span>
            <span className="cuentas-detalle__nota">
              Neto por cobrar · {estado === 'PAGADO' ? `cobrado ${soles(c.neto_cobrado ?? c.neto_cobrar)}` : textoVencimiento(c)}
            </span>
          </div>

          <div className="cuentas-seccion">
            <span className="cuentas-seccion__titulo">Liquidación y operación</span>
            <div className="tarjeta__lista">
              <Fila label="Razón social" valor={c.razon_social} />
              <Fila label="Cliente" valor={c.cliente} />
              <Fila label="N° de liquidación" valor={c.codigo_liquidacion} />
              <Fila label="Orden de servicio" valor={c.orden_servicio} />
              <Fila label="N° de viaje" valor={c.numero_viaje} />
              <Fila label="Lugar o ruta" valor={c.lugar} />
              <Fila label="Conductor" valor={c.conductor} />
              <Fila label="Placas" valor={[c.placa_camion, c.placa_carreta].filter(Boolean).join(' / ')} />
              <Fila label="Fecha de liquidación" valor={formatFechaPe(c.fecha_liquidacion)} />
              <Fila label="Fecha de servicio" valor={formatFechaPe(c.fecha_servicio)} />
            </div>
          </div>

          <div className="cuentas-seccion">
            <span className="cuentas-seccion__titulo">Importes</span>
            <div className="tarjeta__lista">
              <Fila label="Flete" valor={soles(c.flete)} />
              <Fila label="Comisión" valor={`${num(c.comision_porcentaje)} %`} />
              <Fila label="Tarifa" valor={soles(c.tarifa)} />
              <Fila label="Gastos operativos" valor={soles(c.gastos_operativos)} />
              <Fila label="Base imponible" valor={soles(c.base_imponible)} />
              <Fila label="IGV" valor={soles(c.igv)} />
              <Fila label="Total factura" valor={soles(c.total)} fuerte />
              <Fila label="Adelanto" valor={soles(c.adelanto)} />
              <Fila label="Detracción" valor={soles(c.detraccion)} />
              <Fila label="Neto por cobrar" valor={soles(c.neto_cobrar)} fuerte />
              <Fila label="Neto cobrado" valor={c.neto_cobrado == null ? '—' : soles(c.neto_cobrado)} />
              <Fila label="Diferencia" valor={soles(c.diferencia)} />
            </div>
          </div>

          <div className="cuentas-seccion">
            <span className="cuentas-seccion__titulo">Facturación y cobranza</span>
            <div className="tarjeta__lista">
              <Fila label="Mes de facturación" valor={c.mes_facturacion} />
              <Fila label="Fecha de factura" valor={formatFechaPe(c.fecha_factura)} />
              <Fila label="Factura" valor={c.serie && c.factura ? `${c.serie}-${c.factura}` : ''} />
              <Fila label="Nota de crédito" valor={c.nota_credito} />
              <Fila label="Días de crédito" valor={c.credito_dias ? `${c.credito_dias} días` : ''} />
              <Fila label="Fecha a cobrar" valor={formatFechaPe(c.fecha_cobrar)} />
              <Fila label="Fecha de depósito" valor={formatFechaPe(c.fecha_deposito)} />
              <Fila label="Observación" valor={c.observacion} />
            </div>
          </div>

          {documentos.length > 0 && (
            <div className="cuentas-seccion">
              <span className="cuentas-seccion__titulo">Documentos</span>
              <div className="cuentas-detalle__docs">
                {documentos.map(([label, url]) => (
                  <a key={label} className="btn btn--secondary btn--sm" href={url ?? '#'} target="_blank" rel="noreferrer">{label}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
