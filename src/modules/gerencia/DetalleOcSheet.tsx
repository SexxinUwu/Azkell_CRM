import { useRef } from 'react';
import { CheckCircle, ClipboardList, Coins, FileCheck, FileText, Package, Receipt, ShieldCheck, Truck } from 'lucide-react';
import './gerencia-oc.css';
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

const TEXTO_DECISION: Record<ReturnType<typeof categoriaOc>, string> = {
  pendiente: 'Pendiente de aprobación por Gerencia.',
  observada: 'Observada: falta sustento o cotización del solicitante.',
  aprobada: 'Aprobada. Pasa a Pagos de requerimientos en Tesorería.',
  rechazada: 'Rechazada: la adquisición fue desestimada.',
  otra: 'Estado sin clasificar.',
};

/** Detalle de la orden en secciones (como el clásico): proveedor y destino, justificación, artículos, resumen, documentos y decisión. */
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
      ]
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
        <div className="ga-det">
          <div className="ga-det__col">
            <div className="ga-det__cab">
              {chipEstado(o.estado)}
              <span className={`ga-prio ${prioridadUrgente(o.prioridad) ? 'ga-prio--urgente' : ''}`}>
                {prioridadUrgente(o.prioridad) ? 'URGENTE' : 'NORMAL'}
              </span>
              <span className="ga-det__emitido">Emitido el {formatFechaPe(o.fecha)}</span>
            </div>

            {/* Proveedor y destino */}
            <section className="ga-sec" aria-label="Proveedor y destino">
              <h3 className="ga-sec__titulo"><Truck size={16} aria-hidden /> Proveedor y destino</h3>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Proveedor seleccionado</span>
                  <span className="ga-bloque__valor">{o.proveedor_nombre || '—'}</span>
                  <span className="ga-bloque__sub">RUC: {o.proveedor_ruc || '—'}</span>
                  <span className="ga-bloque__sub">Teléfono: {o.proveedor_telefono || '—'}</span>
                  <span className="ga-bloque__sub">Contacto: {o.proveedor_email || '—'}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Destino y solicitante</span>
                  <span className="ga-bloque__valor">Sede / Almacén: Principal</span>
                  <span className="ga-bloque__sub">Solicitado por: {nombreLimpio(o.solicitante || o.autoriza || o.creador_nombre || o.creado_por)}</span>
                  <span className="ga-bloque__sub">Placa asignada: {o.placa || '—'}</span>
                  <span className="ga-bloque__sub">OT vinculada: {o.ot_id || '—'} · Centro de costo: {o.centro_costo || '—'}</span>
                </div>
              </div>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Condición de pago</span>
                  <span className="ga-bloque__valor">{condicionTexto(o)}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Prioridad</span>
                  <span className="ga-bloque__valor">{prioridadUrgente(o.prioridad) ? 'Urgente' : 'Normal'}</span>
                </div>
              </div>
            </section>

            {/* Justificación */}
            <section className="ga-sec" aria-label="Justificación">
              <h3 className="ga-sec__titulo"><ShieldCheck size={16} aria-hidden /> Justificación técnica del requerimiento</h3>
              <p className="ga-texto">{o.motivo_entrada || o.observaciones || 'Sin motivo especificado'}</p>
            </section>

            {/* Artículos */}
            <section className="ga-sec" aria-label="Artículos">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={16} aria-hidden /> Desglose de artículos / servicios</span>
                <span className="ga-sec__cuenta">{o.items.length} {o.items.length === 1 ? 'ítem' : 'ítems'}</span>
              </h3>
              <div className="ga-tabla-wrap">
                <table className="ga-tabla">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th className="num">Cant.</th>
                      <th>U.M.</th>
                      <th className="num">P. unitario</th>
                      <th className="num">Total</th>
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
            </section>
          </div>

          <div className="ga-det__col">
            {/* Resumen económico */}
            <section className="ga-sec" aria-label="Resumen económico">
              <h3 className="ga-sec__titulo"><Coins size={16} aria-hidden /> Resumen económico</h3>
              <div className="ga-resumen">
                <div className="ga-resumen__fila"><span>Subtotal (neto)</span><b>{formatMoneda(subtotal, o.moneda)}</b></div>
                <div className="ga-resumen__fila"><span>I.G.V. (18%)</span><b>{formatMoneda(igv, o.moneda)}</b></div>
                <div className="ga-resumen__fila"><span>Forma de pago</span><b>{condicionTexto(o)}</b></div>
                <div className="ga-resumen__total"><span>Total orden</span><b>{formatMoneda(total, o.moneda)}</b></div>
              </div>
            </section>

            {/* Documentos adjuntos */}
            <section className="ga-sec" aria-label="Documentos adjuntos">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} aria-hidden /> Documentos adjuntos</span>
                <span className="ga-sec__cuenta">{adjuntos.filter(a => !!a.url).length} adjuntos</span>
              </h3>
              <div className="ga-docs">
                {adjuntos.map(({ titulo, url, Icono }) => (
                  <div key={titulo} className={`ga-doc ${url ? '' : 'ga-doc--falta'}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono size={16} aria-hidden /> {titulo}</span>
                    {url
                      ? <a href={url} target="_blank" rel="noopener noreferrer">Ver archivo</a>
                      : <span>Sin archivo</span>}
                  </div>
                ))}
              </div>
            </section>

            {/* Estado de la decisión */}
            <section className="ga-sec" aria-label="Estado de la decisión">
              <h3 className="ga-sec__titulo"><CheckCircle size={16} aria-hidden /> Estado de la decisión</h3>
              <div className="ga-decision">
                <span>{TEXTO_DECISION[categoria]}</span>
                {o.observaciones && <span><b style={{ color: 'var(--label-1)' }}>Comentario:</b> {o.observaciones}</span>}
              </div>
            </section>
          </div>
        </div>
      )}
    </Sheet>
  );
}
