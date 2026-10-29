import { useEffect, useState, type ReactNode } from 'react';
import { Ban, Check, CircleAlert, CreditCard, Eye, FileDown, Package, Paperclip, Pencil, Shield, Trash2, X } from 'lucide-react';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { type EntradaInv } from './api';
import {
  codigoLimpio, descripcionArticulo, desgloseIgv, esCredito, estadoPagable, etiquetaEstado, esServicio, naturalezaDeSubMotivo,
  numeroALetras, type TonoEstado,
} from './entradaReglas';
import './entradas.css';

interface Props {
  entrada: EntradaInv;
  onVolver: () => void;
  onEditar?: () => void;
  onAdjuntos: () => void;
  /** Confirma el pago (Tesorería). Solo se ofrece si la orden está aprobada y el usuario puede pagar. */
  onConfirmarPago?: () => void;
  onAnular?: () => void;
  onEliminar?: () => void;
  onPdf: () => void;
  onVistaPrevia: () => void;
  generandoPdf: boolean;
  /** Unidad de medida de un artículo (la línea no la guarda) */
  unidadDe: (inventarioId: string | null) => string | null;
}

type EstadoPaso = 'hecho' | 'actual' | 'alerta' | 'rojo' | 'pendiente';

const TONO_BADGE: Record<TonoEstado, string> = {
  gray: 'oc-estado--gris', green: 'oc-estado--verde', sky: 'oc-estado--azul', amber: 'badge--amber', red: 'badge--red',
};

/** Saca la nota de gerencia de una observación: "[Nota Gerencia: texto]" → "texto" */
function notaGerencia(texto: string): string {
  const t = texto.trim();
  const m = t.match(/\[Nota Gerencia:\s*([^\]]+)\]/i);
  return (m ? m[1] : t.replace(/\[Nota Gerencia:\s*/gi, '').replace(/\]/g, '')).trim();
}

const fechaCorta = (s: string | null | undefined) => (s ? formatFechaPe(String(s).split('T')[0]) : '—');

export function EntradaDetalle({
  entrada: e, onEditar, onAdjuntos, onConfirmarPago, onAnular, onEliminar, onPdf, onVistaPrevia, generandoPdf, unidadDe,
}: Props) {
  const items = e.items ?? [];
  const moneda = e.moneda === 'USD' ? 'USD' : 'PEN';
  const totalCant = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
  const totalCalc = items.reduce((s, it) => s + (Number(it.importe) || (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0)), 0);
  const tc = Number(e.tipo_cambio) || 0;
  // Total en la moneda de la orden (el total en soles del servidor no sirve para una orden en dólares)
  const totalReal = totalCalc > 0 ? totalCalc : (moneda === 'USD' && tc > 0 ? (Number(e.total_pen) || 0) / tc : (Number(e.total_pen) || 0));
  const { gravado, igv, conIgv } = desgloseIgv(totalReal, e.tipo_igv);
  const recibido = Number(e.total_recibido) || 0;
  const pct = totalCant > 0 ? Math.min(100, Math.round((recibido / totalCant) * 100)) : 0;

  const est = String(e.estado || 'REGISTRADA').toUpperCase().trim();
  const anulado = est.includes('ANULAD') || est.includes('RECHAZAD');
  const observado = est.includes('OBSERVAD');
  const aprobado = ['APROBADO', 'APROBADA', 'AUTORIZADO', 'AUTORIZADA'].includes(est);
  const procesado = ['PROCESADO', 'PROCESADA', 'PAGADO', 'PAGADA'].includes(est);
  const recepCompleta = procesado && totalCant > 0 && recibido >= totalCant;
  const recepParcial = procesado && recibido > 0 && recibido < totalCant;
  const aprobadoReal = aprobado || procesado || recepCompleta;
  const aprobador = aprobadoReal
    ? (e.aprobador_nombre || e.aprobado_por || e.autoriza || 'Gerencia')
    : (observado || anulado ? (e.aprobador_nombre || e.aprobado_por || '') : '—');
  const etiqueta = etiquetaEstado(e.estado);

  // Al contado: la orden se paga antes de recepcionar. A crédito: se recepciona con V°B° y el pago va después.
  const contado = !esCredito(e.condicion_pago);
  const diasCredito = Number(e.dias_credito || e.dias_pagar) || 0;
  // Almacén confirma solo compras al contado; las compras a crédito las paga Tesorería
  const pagable = estadoPagable(e.estado) && contado;

  // Banner de estado (texto como en el clásico)
  let banner: { tono: string; titulo: string; texto: string };
  if (anulado) {
    const motivo = notaGerencia(e.motivo_anulacion || e.observaciones || '');
    banner = { tono: 'oc-banner--rojo', titulo: 'ANULADA', texto: motivo ? `Motivo${aprobador ? ` (${aprobador})` : ''}: “${motivo}”` : 'Orden de compra anulada o rechazada.' };
  } else if (observado) {
    const obs = notaGerencia(e.observaciones || '');
    banner = { tono: 'oc-banner--ambar', titulo: 'OBSERVADA', texto: obs ? `Observación${aprobador ? ` (${aprobador})` : ''}: “${obs}”` : 'Requiere subsanación o visto bueno directivo.' };
  } else if (recepCompleta) {
    banner = { tono: 'oc-banner--verde', titulo: 'RECEPCIONADA 100 %', texto: 'Mercadería recepcionada en su totalidad en almacén central.' };
  } else if (recepParcial) {
    banner = { tono: 'oc-banner--azul', titulo: `RECEPCIÓN PARCIAL (${pct} %)`, texto: `Recepción física en curso: ${recibido} de ${totalCant} unidades recibidas.` };
  } else if (procesado) {
    banner = { tono: 'oc-banner--azul', titulo: 'PROCESADA', texto: 'Pago registrado por Tesorería · En camino a almacén.' };
  } else if (aprobado) {
    const vb = `V°B° presupuestario concedido por ${aprobador}.`;
    banner = contado
      ? { tono: 'oc-banner--ambar', titulo: 'APROBADA · PAGO PENDIENTE', texto: `${vb} Al contado: confirma el pago para que la orden pase a recepción.` }
      : { tono: 'oc-banner--verde', titulo: 'APROBADA', texto: `${vb} A crédito${diasCredito ? ` a ${diasCredito} días` : ''}: ya puede recepcionarse.` };
  } else {
    banner = { tono: 'oc-banner--gris', titulo: 'REGISTRADA', texto: 'En espera de visto bueno presupuestario por Gerencia.' };
  }

  // Línea de vida: registro → aprobación → pago → recepción
  const estadoAprob: EstadoPaso = anulado ? 'rojo' : observado ? 'alerta' : aprobadoReal ? 'hecho' : 'actual';
  const pagoOk = procesado || recepCompleta;
  const estadoPago: EstadoPaso = pagoOk ? 'hecho' : aprobadoReal ? 'actual' : 'pendiente';
  const estadoRecep: EstadoPaso = recepCompleta ? 'hecho' : (recepParcial || pagoOk) ? 'actual' : 'pendiente';
  const pasos: Array<{ titulo: string; texto: string; estado: EstadoPaso; icono: ReactNode }> = [
    { titulo: 'Registro', texto: fechaCorta(e.fecha || e.created_at), estado: 'hecho', icono: <Check size={16} strokeWidth={2.4} /> },
    { titulo: 'Aprobación', texto: aprobador || '—', estado: estadoAprob, icono: observado ? <CircleAlert size={16} /> : anulado ? <X size={16} /> : <Shield size={16} /> },
    { titulo: 'Pago', texto: pagoOk ? 'Pago registrado' : (contado && aprobadoReal ? 'Al contado · pendiente' : 'Por liquidar'), estado: estadoPago, icono: <CreditCard size={16} /> },
    { titulo: 'Recepción', texto: recepCompleta ? '100 % recepcionado' : recepParcial ? `${pct} % recepcionado` : (contado && aprobado ? 'Tras el pago' : '0 % recepcionado'), estado: estadoRecep, icono: <Package size={16} /> },
  ];
  const avance = pasos.reduce((s, p) => s + (p.estado === 'hecho' ? 1 : p.estado === 'actual' ? 0.5 : 0), 0);
  const fraccionLinea = Math.min(1, Math.max(0, avance / (pasos.length - 1)));

  const docs = [
    { etiqueta: 'Cotización', url: e.url_cotizacion_presigned || e.url_cotizacion },
    { etiqueta: 'Factura', url: e.url_factura_presigned || e.url_factura },
    { etiqueta: 'Voucher', url: e.url_voucher_presigned || e.url_voucher },
  ];

  // Motivos: los mismos campos del formulario
  const naturaleza = naturalezaDeSubMotivo(e.sub_motivo);
  const pago = `${moneda === 'USD' ? 'Dólares (US$)' : 'Soles (S/)'} · ${(e.condicion_pago || 'Al contado').toUpperCase()}${e.condicion_pago?.startsWith('A cr') && (e.dias_credito || e.dias_pagar) ? ` · ${e.dias_credito || e.dias_pagar} días` : ''}`;
  const esSrv = esServicio(e.tipo_orden);
  const tituloTipo = esSrv ? 'Orden de servicio' : 'Orden de compra';

  return (
    <div className="oc-ficha">
      {/* Cabecera: identificación, estado y menú */}
      <header className="oc-hero">
        <div className="oc-hero__izq">
          <span className="oc-hero__id">{tituloTipo} N° {codigoLimpio(e.id)}</span>
          <h2 className="oc-hero__titulo">{e.proveedor_nombre || e.motivo_entrada || 'Sin proveedor'}</h2>
          <span className={`badge ${TONO_BADGE[etiqueta.tono]}`.trim()}>{etiqueta.texto}</span>
        </div>
      </header>

      {/* Acciones principales */}
      <div className="oc-acciones">
        {onEditar && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Editar orden" aria-label="Editar orden" onClick={onEditar}><Pencil size={17} /></button>}
        <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Adjuntos y sustentos" aria-label="Adjuntos y sustentos" onClick={onAdjuntos}><Paperclip size={17} /></button>
        {onConfirmarPago && pagable && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Confirmar pago" aria-label="Confirmar pago" onClick={onConfirmarPago}><CreditCard size={17} /></button>}
        <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Descargar PDF" aria-label="Descargar PDF" disabled={generandoPdf} onClick={onPdf}><FileDown size={17} /></button>
        <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Vista previa" aria-label="Vista previa" onClick={onVistaPrevia}><Eye size={17} /></button>
        {onAnular && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--peligro" data-tip="Anular orden" aria-label="Anular orden" onClick={onAnular}><Ban size={17} /></button>}
        {onEliminar && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--peligro" data-tip="Eliminar" aria-label="Eliminar" onClick={onEliminar}><Trash2 size={17} /></button>}
      </div>

      {/* Estado */}
      <div className={`oc-banner ${banner.tono}`} role="status">
        <strong>{banner.titulo}</strong>
        <span>{banner.texto}</span>
      </div>

      {/* Línea de vida animada */}
      <LineaDeVida pasos={pasos} fraccion={fraccionLinea} />

      {/* Avance de recepción */}
      <div className="oc-progreso">
        <div className="oc-progreso__cab">
          <span>{recibido} de {totalCant} unidades recepcionadas ({items.length} {items.length === 1 ? 'renglón' : 'renglones'})</span>
          <strong>{pct} %</strong>
        </div>
        <div className="oc-progreso__barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`oc-progreso__relleno${pct === 100 ? ' oc-progreso__relleno--completo' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Datos, agrupados */}
      <div className="oc-datos">
        <Grupo titulo="Solicitud">
          <Dato etiqueta="Solicitante (autoriza)" valor={e.autoriza || e.solicitante || '—'} />
          <Dato etiqueta="Creada por" valor={e.creador_nombre || e.creado_por || '—'} />
        </Grupo>
        <Grupo titulo="Emisión y destino">
          <Dato etiqueta="Fecha de emisión" valor={fechaCorta(e.fecha)} />
          <Dato etiqueta={e.placa ? 'Placa' : 'Destino'} valor={e.placa || 'Almacén central'} />
          <Dato etiqueta="Centro de costos" valor={e.centro_costo || 'CC-100'} />
          <Dato etiqueta="Prioridad" valor={e.prioridad || 'Normal'} />
        </Grupo>
        <Grupo titulo="Proveedor">
          <Dato etiqueta="Razón social" valor={e.proveedor_nombre || 'Proveedor general'} extra={e.proveedor_ruc ? `RUC ${e.proveedor_ruc}` : undefined} ancho />
        </Grupo>
        <Grupo titulo="Documentos y pago">
          <Dato etiqueta="Condición de pago" valor={pago} />
          {e.numero_operacion && <Dato etiqueta="Constancia / operación" valor={e.numero_operacion} />}
          {pagoOk && e.pagado_por && (
            <Dato etiqueta="Pago confirmado por" valor={`${e.pagado_por}${e.fecha_pago ? ` · ${formatFechaPe(String(e.fecha_pago).split(/[T ]/)[0])}` : ''}`} />
          )}
        </Grupo>
        <Grupo titulo="Motivo" ancho>
          <Dato etiqueta="Motivo de compra / ingreso" valor={e.motivo_entrada || '—'} />
          <Dato etiqueta="Motivo (naturaleza del gasto)" valor={naturaleza || '—'} />
          <Dato etiqueta="Sub motivo (detalle)" valor={e.sub_motivo || '—'} />
        </Grupo>
      </div>

      {/* Documentos */}
      <div>
        <p className="oc-seccion">Documentos</p>
        <div className="oc-docs">
          {docs.map(d => d.url
            ? <a key={d.etiqueta} className="oc-doc oc-doc--ok" href={d.url} target="_blank" rel="noreferrer">{d.etiqueta}</a>
            : <span key={d.etiqueta} className="oc-doc oc-doc--falta">Sin {d.etiqueta.toLowerCase()}</span>)}
        </div>
      </div>

      {e.observaciones && (
        <div className="oc-bloque">
          <p className="oc-seccion">Observaciones</p>
          <p className="oc-texto">{e.observaciones}</p>
        </div>
      )}

      {/* Artículos: lista que se lee bien en el teléfono */}
      <div>
        <p className="oc-seccion">Artículos ({items.length})</p>
        {items.length === 0 ? (
          <p className="t-footnote c-secondary">No hay artículos en esta orden.</p>
        ) : (
          <ul className="oc-items">
            {items.map((it, i) => {
              const importe = Number(it.importe) || (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0);
              return (
                <li key={it.id ?? i} className="oc-item">
                  <span className="oc-item__n">{i + 1}</span>
                  <div className="oc-item__cuerpo">
                    <span className="oc-item__nombre">{descripcionArticulo(it.descripcion, it.inventario_id) || it.inventario_id || '—'}</span>
                    <span className="oc-item__meta">
                      <span className="oc-mono">{it.inventario_id || '—'}</span>
                      {' · '}{it.item_unidad || unidadDe(it.inventario_id) || 'UND'}
                      {' · '}{Number(it.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 3 })} × {formatMoneda(it.costo_unitario, moneda)}
                    </span>
                  </div>
                  <strong className="oc-item__importe">{formatMoneda(importe, moneda)}</strong>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Total */}
      <div className="oc-total">
        <span className="oc-total__son">SON: {numeroALetras(totalReal)} {moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'}</span>
        {conIgv && (
          <span className="oc-total__desglose">Gravado {formatMoneda(gravado, moneda)} · IGV 18 % {formatMoneda(igv, moneda)}</span>
        )}
        <div className="oc-total__fila">
          <span>Total neto</span>
          <strong className="oc-total__monto">{formatMoneda(totalReal, moneda)}</strong>
        </div>
        {moneda === 'USD' && tc > 0 && (
          <span className="oc-total__equivale">Equivale a {formatMoneda(totalReal * tc, 'PEN')} (T/C {tc})</span>
        )}
      </div>
    </div>
  );
}

/** Línea de vida: la barra crece al abrir y los pasos aparecen uno a uno; el paso actual pulsa */
function LineaDeVida({ pasos, fraccion }: { pasos: Array<{ titulo: string; texto: string; estado: EstadoPaso; icono: ReactNode }>; fraccion: number }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setListo(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="oc-linea" aria-label="Línea de vida de la orden">
      <div className="oc-linea__pista">
        <div className="oc-linea__relleno" style={{ transform: `scaleX(${listo ? fraccion : 0})` }} />
      </div>
      <div className="oc-linea__pasos">
        {pasos.map((p, i) => (
          <div key={p.titulo} className={`oc-linea__paso oc-linea__paso--${p.estado}`} style={{ animationDelay: `${i * 140}ms` }}>
            <span className="oc-linea__nodo">{p.icono}</span>
            <span className="oc-linea__titulo">{p.titulo}</span>
            <span className="oc-linea__texto">{p.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Grupo({ titulo, ancho, children }: { titulo: string; ancho?: boolean; children: ReactNode }) {
  return (
    <section className={`oc-grupo${ancho ? ' oc-grupo--ancho' : ''}`}>
      <h3 className="oc-grupo__titulo">{titulo}</h3>
      <div className="oc-grupo__datos">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor, extra, ancho }: { etiqueta: string; valor: string; extra?: string; ancho?: boolean }) {
  return (
    <div className={`oc-dato${ancho ? ' oc-dato--ancho' : ''}`}>
      <span className="oc-dato__etiqueta">{etiqueta}</span>
      <span className="oc-dato__valor">{valor}</span>
      {extra && <span className="oc-dato__extra">{extra}</span>}
    </div>
  );
}
