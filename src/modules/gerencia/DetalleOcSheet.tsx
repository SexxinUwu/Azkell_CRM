import { useRef } from 'react';
import { FileCheck, FileText, Receipt } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Sheet } from '../../core/ui/Sheet';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { desgloseIgv } from '../almacen/entradaReglas';
import { categoriaOc, type OrdenCompra } from './api';
import { chipEstado, nombreLimpio, prioridadUrgente } from './presentacion';

export type AccionOc = 'aprobar' | 'rechazar' | 'observar';

interface Props {
  orden: OrdenCompra | null;
  onClose: () => void;
  /** Solo quien tiene el permiso de edición ve los botones de decisión */
  puedeAccionar: boolean;
  onAccion: (tipo: AccionOc, orden: OrdenCompra) => void;
}

const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function condicionTexto(o: OrdenCompra): string {
  const cp = o.condicion_pago ?? 'Al contado';
  return /cr[eé]dito/i.test(cp) ? `A crédito (${o.dias_credito ?? 0} días)` : 'Al contado';
}

export function DetalleOcSheet({ orden, onClose, puedeAccionar, onAccion }: Props) {
  // Mientras la hoja se cierra, el contenido sigue visible: se conserva la última orden.
  const ultima = useRef<OrdenCompra | null>(null);
  if (orden) ultima.current = orden;
  const o = orden ?? ultima.current;

  const categoria = categoriaOc(o?.estado);
  const decidible = puedeAccionar && (categoria === 'pendiente' || categoria === 'observada');

  const { subtotal, igv, total } = (() => {
    if (!o) return { subtotal: 0, igv: 0, total: 0 };
    const t = o.total_oc;
    const d = desgloseIgv(t, o.tipo_igv);
    return { subtotal: d.gravado, igv: d.igv, total: t };
  })();

  const adjuntos = o
    ? [
        { titulo: 'Cotización', url: o.url_cotizacion_presigned, Icono: FileText },
        { titulo: 'Factura', url: o.url_factura_presigned, Icono: FileCheck },
        { titulo: 'Voucher', url: o.url_voucher_presigned, Icono: Receipt },
      ].filter(a => !!a.url)
    : [];

  return (
    <Sheet
      open={!!orden}
      onClose={onClose}
      title={o?.id ?? 'Orden de compra'}
      ancho
      footer={
        decidible && o ? (
          <>
            <Button variant="danger" onClick={() => onAccion('rechazar', o)}>Rechazar</Button>
            <Button variant="secondary" onClick={() => onAccion('observar', o)}>Observar</Button>
            <Button variant="primary" onClick={() => onAccion('aprobar', o)}>Aprobar</Button>
          </>
        ) : undefined
      }
    >
      {o && (
        <div className="gerencia-ficha">
          <div className="gerencia-ficha__cabecera">
            {chipEstado(o.estado)}
            <span className={`gerencia-chip ${prioridadUrgente(o.prioridad) ? 'gerencia-chip--urgente' : ''}`}>
              {prioridadUrgente(o.prioridad) ? 'URGENTE' : 'NORMAL'}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--label-2)' }}>
              Emitida el {formatFechaPe(o.fecha)}
            </span>
          </div>

          <section className="gerencia-ficha__seccion" aria-label="Identificación">
            <h3>Identificación</h3>
            <dl className="gerencia-datos">
              <div><dt>Proveedor</dt><dd>{o.proveedor_nombre || '—'}</dd></div>
              <div><dt>RUC</dt><dd>{o.proveedor_ruc || '—'}</dd></div>
              <div><dt>Teléfono</dt><dd>{o.proveedor_telefono || '—'}</dd></div>
              <div><dt>Contacto</dt><dd>{o.proveedor_email || '—'}</dd></div>
              <div><dt>Solicitante</dt><dd>{nombreLimpio(o.solicitante || o.autoriza || o.creador_nombre || o.creado_por)}</dd></div>
              <div><dt>Placa asignada</dt><dd>{o.placa || '—'}</dd></div>
              <div><dt>OT vinculada</dt><dd>{o.ot_id || '—'}</dd></div>
              <div><dt>Condición de pago</dt><dd>{condicionTexto(o)}</dd></div>
              <div><dt>Centro de costo</dt><dd>{o.centro_costo || '—'}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Justificación</dt><dd>{o.motivo_entrada || o.observaciones || 'Sin motivo especificado'}</dd></div>
            </dl>
          </section>

          <section className="gerencia-ficha__seccion" aria-label="Artículos">
            <h3>Artículos ({o.items.length})</h3>
            <div className="gerencia-items-wrap">
              <table className="gerencia-items">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th className="num">Cant.</th>
                    <th>U.M.</th>
                    <th className="num">P. Unitario</th>
                    <th className="num">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--label-2)' }}>Sin artículos registrados</td></tr>
                  ) : o.items.map((it, i) => (
                    <tr key={it.id ?? i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap' }}>{it.codigo_articulo || it.inventario_id || '—'}</td>
                      <td>{it.descripcion || '—'}</td>
                      <td className="num">{it.cantidad}</td>
                      <td>{it.unidad_medida || 'UND'}</td>
                      <td className="num">{fmt(it.costo_unitario)}</td>
                      <td className="num">{fmt(it.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="gerencia-totales" style={{ marginTop: 'var(--s-3)' }}>
              <div><span>Subtotal sin IGV</span><span>{formatMoneda(subtotal, o.moneda)}</span></div>
              <div><span>IGV (18%)</span><span>{formatMoneda(igv, o.moneda)}</span></div>
              <div className="gerencia-totales__total"><span>Total</span><span>{formatMoneda(total, o.moneda)}</span></div>
            </div>
          </section>

          <section className="gerencia-ficha__seccion" aria-label="Adjuntos">
            <h3>Adjuntos</h3>
            {adjuntos.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--label-2)', fontSize: '0.88rem' }}>Sin documentos adjuntos</p>
            ) : (
              <div className="gerencia-adjuntos">
                {adjuntos.map(({ titulo, url, Icono }) => (
                  <div key={titulo} className="gerencia-adjunto">
                    <Icono size={22} aria-hidden style={{ color: 'var(--label-2)', flexShrink: 0 }} />
                    <div className="gerencia-adjunto__texto">
                      <div className="gerencia-adjunto__titulo">{titulo}</div>
                    </div>
                    <a className="gerencia-adjunto__ver" href={url ?? undefined} target="_blank" rel="noopener noreferrer">
                      Ver archivo
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
