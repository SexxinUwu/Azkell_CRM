import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileDown, Paperclip, Wallet } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Badge } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe, formatFechaPe, formatMoneda } from '../../core/lib/format';
import type { ArticuloInv, EmpresaDocumentos } from '../almacen/api';
import {
  codigoOC, esCredito, esPendiente, esPagada, esUSD, importeOC, numeroALetras, renglonLimpio, vencimiento, type OrdenPago,
} from './pago-datos';
import { generarPdfOrdenCompra, ordenDesdeOrdenPago } from '../almacen/ordenCompraPdf';

const COLUMNAS_ITEMS: ColumnaTabla[] = [
  { id: 'n', titulo: '#', ancho: 44, alinear: 'center' },
  { id: 'cod', titulo: 'Código', ancho: 130 },
  { id: 'desc', titulo: 'Descripción', ancho: 320 },
  { id: 'cant', titulo: 'Cantidad', ancho: 96, alinear: 'right' },
  { id: 'pu', titulo: 'P. unitario', ancho: 130, alinear: 'right' },
  { id: 'imp', titulo: 'Importe', ancho: 140, alinear: 'right' },
];

function Dato({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="dato">
      <span className="dato__label">{label}</span>
      <span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{children || '—'}</span>
    </div>
  );
}

function Adjunto({ url, etiqueta }: { url?: string | null; etiqueta: string }) {
  if (!url) return <Badge>Sin {etiqueta.toLowerCase()}</Badge>;
  return (
    <a className="btn btn--secondary btn--sm" href={url} target="_blank" rel="noreferrer">
      <Paperclip size={14} /> {etiqueta}
    </a>
  );
}

// Pasos de la OC: registrada → aprobada → pagada. Lo que no se ha cumplido queda vacío.
function Pasos({ oc }: { oc: OrdenPago }) {
  const pagada = esPagada(oc);
  const pasos = [
    { titulo: 'Registrada', detalle: formatFechaHoraPe(oc.fecha), hecho: true },
    { titulo: 'Aprobada', detalle: oc.aprobador_nombre || oc.aprobado_por || 'Gerencia', hecho: true },
    { titulo: 'Pagada', detalle: pagada ? formatFechaHoraPe(oc.fecha_pago) : 'Pendiente', hecho: pagada },
  ];
  return (
    <ol className="pago-pasos" aria-label="Avance de la orden">
      {pasos.map((p, i) => (
        <li key={p.titulo} className={`pago-paso${p.hecho ? ' pago-paso--hecho' : ''}`}>
          <span className="pago-paso__punto" aria-hidden>{p.hecho ? <CheckCircle2 size={16} /> : i + 1}</span>
          <span className="pago-paso__titulo">{p.titulo}</span>
          <span className="pago-paso__detalle">{p.detalle}</span>
        </li>
      ))}
    </ol>
  );
}

export function PagoDetalleSheet({ oc, open, onClose, onProcesar }: {
  oc: OrdenPago | null;
  open: boolean;
  onClose: () => void;
  onProcesar: (oc: OrdenPago) => void;
}) {
  const pendiente = !!oc && esPendiente(oc);
  const usd = !!oc && esUSD(oc.moneda);
  const venc = oc ? vencimiento(oc) : null;
  const importe = oc ? importeOC(oc) : 0;
  const items = oc?.items ?? [];
  const total = items.length ? items.reduce((s, it) => s + (it.importe || 0), 0) : importe;

  const qc = useQueryClient();
  const toast = useToast();
  const [generando, setGenerando] = useState(false);

  /** Ver PDF: mismo documento que el clásico. Unidades del inventario y datos de la empresa se piden con caché. */
  async function verPdf(o: OrdenPago) {
    // La pestaña se abre antes de generar el PDF: si no, el navegador la bloquea por no venir de un gesto directo
    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.title = `Orden ${codigoOC(o)}`;
      ventana.document.body.textContent = 'Generando PDF…';
    }
    setGenerando(true);
    try {
      const [inventario, empresa] = await Promise.all([
        qc.ensureQueryData({ queryKey: ['almacen', 'inventario'], queryFn: () => api<ArticuloInv[]>('/almacen/inventario'), staleTime: 60_000 })
          .catch(() => [] as ArticuloInv[]),
        qc.ensureQueryData({ queryKey: ['almacen', 'empresa-documentos'], queryFn: () => api<EmpresaDocumentos>('/almacen/empresa-documentos'), staleTime: 600_000 })
          .catch(() => null),
      ]);
      const unidades = new Map(inventario.map(a => [a.id, a.unidad ?? undefined]));
      const blob = await generarPdfOrdenCompra(ordenDesdeOrdenPago({ oc: o, empresa, unidadDe: id => (id ? unidades.get(id) : undefined) }));
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url;
      else toast('Permite las ventanas emergentes para ver el PDF.', 'error');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      ventana?.close();
      toast(errorMessage(err), 'error');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      ancho
      title={oc ? `Orden ${codigoOC(oc)}` : 'Orden de compra'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {oc && (
            <Button variant="secondary" icon={<FileDown size={16} />} loading={generando} onClick={() => void verPdf(oc)}>
              Ver PDF
            </Button>
          )}
          {oc && pendiente && (
            <Button variant="primary" icon={<Wallet size={16} />} onClick={() => onProcesar(oc)}>Procesar pago</Button>
          )}
        </>
      }
    >
      {oc && (
        <div className="pago-det">
          <div className="pago-det__cabecera">
            <div>
              <span className="t-eyebrow">{oc.proveedor_nombre || 'Proveedor'}</span>
              <p className="pago-det__motivo">{oc.motivo_entrada || oc.motivo || 'Sin motivo'}</p>
            </div>
            <div className="pago-det__monto">
              <span className="pago-det__total">{formatMoneda(importe, oc.moneda)}</span>
              <span className="t-footnote c-secondary">{esUSD(oc.moneda) ? 'Orden en dólares' : 'Orden en soles'}</span>
            </div>
          </div>

          <Pasos oc={oc} />

          <div className="pago-det__grid">
            <div className="tarjeta__lista">
              <Dato label="Solicitante">{oc.solicitante || oc.autoriza}</Dato>
              <Dato label="Usuario de creación">{oc.creador_nombre || oc.creado_por}</Dato>
              <Dato label="Fecha de registro" mono>{formatFechaHoraPe(oc.fecha)}</Dato>
              <Dato label="Centro de costo">{oc.centro_costo}</Dato>
              <Dato label="Placa / OT" mono>{[oc.placa, oc.ot_id && `OT ${oc.ot_id}`].filter(Boolean).join(' · ')}</Dato>
            </div>
            <div className="tarjeta__lista">
              <Dato label="Condición de pago">
                {esCredito(oc) ? `Crédito · ${Number(oc.dias_credito) || 0} días` : 'Al contado'}
              </Dato>
              <Dato label="Vencimiento">{venc ? `${formatFechaPe(oc.fecha_vencimiento)} · ${venc.texto}` : 'No aplica (al contado)'}</Dato>
              <Dato label="RUC del proveedor" mono>{oc.proveedor_ruc}</Dato>
              <Dato label="Cuenta destino (proveedor)" mono>{oc.cuenta_bancaria_proveedor}</Dato>
              <Dato label="Cuenta origen (empresa)" mono>{oc.cuenta_bancaria_empresa}</Dato>
            </div>
          </div>

          {!pendiente && (
            <div className="tarjeta__lista">
              <Dato label="Pagado por">{oc.pagado_por}</Dato>
              <Dato label="N° de operación / constancia" mono>{oc.numero_operacion}</Dato>
              <Dato label="Fecha de pago" mono>{formatFechaHoraPe(oc.fecha_pago)}</Dato>
            </div>
          )}

          <div className="pago-det__adjuntos">
            <Adjunto url={oc.url_cotizacion_presigned} etiqueta="Cotización" />
            <Adjunto url={oc.url_factura_presigned} etiqueta="Factura" />
            <Adjunto url={oc.url_voucher_presigned} etiqueta="Voucher" />
          </div>

          <div>
            <p className="pago-det__seccion">Renglones ({items.length})</p>
            {items.length === 0 ? (
              <p className="t-callout c-secondary">Esta orden no tiene renglones registrados.</p>
            ) : (
              <TablaRedimensionable id="pago-req-renglones" columnas={COLUMNAS_ITEMS} ariaLabel="Renglones de la orden" altoMax="40vh">
                {items.map((it, i) => {
                  const { codigo, descripcion } = renglonLimpio(it);
                  return (
                    <tr key={i}>
                      <Celda alinear="center" mono>{i + 1}</Celda>
                      <Celda mono>{codigo}</Celda>
                      <Celda>{descripcion}</Celda>
                      <Celda alinear="right" mono>{(it.cantidad || 0).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</Celda>
                      <Celda alinear="right" mono>{formatMoneda(it.costo_unitario, oc.moneda)}</Celda>
                      <Celda alinear="right" mono>{formatMoneda(it.importe, oc.moneda)}</Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            )}
          </div>

          <div className="pago-det__total-letras">
            <span className="t-footnote c-secondary">
              Son: {numeroALetras(total)} {usd ? 'DÓLARES AMERICANOS' : 'SOLES'}
            </span>
            <span className="pago-det__total">{formatMoneda(total, oc.moneda)}</span>
          </div>
        </div>
      )}
    </Sheet>
  );
}
