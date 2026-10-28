import type { ReactNode } from 'react';
import { Check, CircleAlert, CreditCard, Shield, Package, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuOtros, type OpcionOtros } from '../../core/ui/MenuOtros';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { type EntradaInv } from './api';
import {
  codigoLimpio, descripcionArticulo, desgloseIgv, etiquetaEstado, esServicio, naturalezaDeSubMotivo, numeroALetras, type TonoEstado,
} from './entradaReglas';
import './entradas.css';

interface Props {
  entrada: EntradaInv;
  onVolver: () => void;
  onEditar?: () => void;
  onAdjuntos: () => void;
  onAprobar?: () => void;
  onAnular?: () => void;
  onEliminar?: () => void;
  onPdf: () => void;
  onVistaPrevia: () => void;
  generandoPdf: boolean;
  /** Unidad de medida de un artículo (la línea no la guarda) */
  unidadDe: (inventarioId: string | null) => string | null;
}

const TONO_BADGE: Record<TonoEstado, string> = {
  gray: '', green: 'badge--green', sky: 'oc-badge--sky', amber: 'badge--amber', red: 'badge--red',
};

/** Saca la nota de gerencia de una observación: "[Nota Gerencia: texto]" → "texto" */
function notaGerencia(texto: string): string {
  const t = texto.trim();
  const m = t.match(/\[Nota Gerencia:\s*([^\]]+)\]/i);
  return (m ? m[1] : t.replace(/\[Nota Gerencia:\s*/gi, '').replace(/\]/g, '')).trim();
}

const fechaCorta = (s: string | null | undefined) => (s ? formatFechaPe(String(s).split('T')[0]) : '—');

export function EntradaDetalle({
  entrada: e, onVolver, onEditar, onAdjuntos, onAprobar, onAnular, onEliminar, onPdf, onVistaPrevia, generandoPdf, unidadDe,
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
    ? (e.aprobador_nombre || e.aprobado_por || 'Gerencia')
    : (observado || anulado ? (e.aprobador_nombre || e.aprobado_por || '') : '—');
  const etiqueta = etiquetaEstado(e.estado);

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
    banner = { tono: 'oc-banner--verde', titulo: 'APROBADA', texto: 'V°B° presupuestario concedido por Gerencia.' };
  } else {
    banner = { tono: 'oc-banner--gris', titulo: 'REGISTRADA', texto: 'En espera de visto bueno presupuestario por Gerencia.' };
  }

  // Pasos: registro → aprobación → pago → recepción
  const ancho = recepCompleta ? 1 : procesado ? 2 / 3 : aprobadoReal ? 1 / 3 : 0;
  const nodoAprob = aprobadoReal ? 'ok' : observado ? 'alerta' : anulado ? 'rojo' : '';
  const pagoOk = procesado || recepCompleta;
  const nodoRecep = recepCompleta ? 'ok' : recepParcial ? 'parcial' : '';

  const docs = [
    { etiqueta: 'Cotización', url: e.url_cotizacion_presigned || e.url_cotizacion },
    { etiqueta: 'Factura', url: e.url_factura_presigned || e.url_factura },
    { etiqueta: 'Voucher', url: e.url_voucher_presigned || e.url_voucher },
  ];

  const naturaleza = naturalezaDeSubMotivo(e.sub_motivo);
  const pago = `${moneda === 'USD' ? 'Dólares (US$)' : 'Soles (S/)'} · ${(e.condicion_pago || 'Al contado').toUpperCase()}${e.condicion_pago?.startsWith('A cr') && (e.dias_credito || e.dias_pagar) ? ` · ${e.dias_credito || e.dias_pagar} días` : ''}`;
  const esSrv = esServicio(e.tipo_orden);
  const tituloTipo = esSrv ? 'Orden de servicio' : 'Orden de compra';

  const menu: Array<OpcionOtros | false | null | undefined> = [
    onEditar && { label: 'Editar orden', onSelect: onEditar },
    { label: 'Adjuntos y sustentos', detalle: 'Cotización, factura y voucher', onSelect: onAdjuntos },
    onAnular && { label: 'Anular orden', destructiva: true, separado: true, onSelect: onAnular },
    onEliminar && { label: 'Eliminar', destructiva: true, onSelect: onEliminar },
  ];

  return (
    <div className="oc-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Órdenes
        </button>
        <div className="tarjeta__barra-acciones">
          <MenuOtros opciones={menu} />
        </div>
      </div>

      {/* Cabecera */}
      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <span className="inv-ficha__id">{tituloTipo} N° {codigoLimpio(e.id)}</span>
        <h2 className="inv-ficha__nombre">{e.proveedor_nombre || e.motivo_entrada || 'Sin proveedor'}</h2>
        <span className={`badge ${TONO_BADGE[etiqueta.tono]}`.trim()}>{etiqueta.texto}</span>
      </div>

      {/* Acciones principales */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', justifyContent: 'center' }}>
        {onAprobar && <Button variant="primary" onClick={onAprobar}>Aprobar O/C</Button>}
        <Button variant="secondary" loading={generandoPdf} onClick={onPdf}>Descargar PDF</Button>
        <Button variant="plain" onClick={onVistaPrevia}>Vista previa</Button>
      </div>

      {/* Estado y trazabilidad */}
      <div className={`oc-banner ${banner.tono}`} role="status">
        <strong>{banner.titulo}</strong>
        <span>{banner.texto}</span>
      </div>

      <div className="oc-pasos" aria-label="Trazabilidad de la orden">
        <div className="oc-pasos__relleno" style={{ width: `${75 * ancho}%` }} />
        <Paso titulo="Registro" nodo="ok" icono={<Check size={14} />} texto={fechaCorta(e.fecha || e.created_at)} />
        <Paso titulo="Aprobación" nodo={nodoAprob} icono={observado ? <CircleAlert size={14} /> : anulado ? <X size={14} /> : <Shield size={14} />}
          texto={aprobador || '—'} />
        <Paso titulo="Pago" nodo={pagoOk ? 'ok' : ''} icono={<CreditCard size={14} />} texto={pagoOk ? 'Pago registrado' : 'Por liquidar'} />
        <Paso titulo="Recepción" nodo={nodoRecep} icono={<Package size={14} />}
          texto={recepCompleta ? '100 % recepcionado' : recepParcial ? `${pct} % recepcionado` : '0 % recepcionado'} />
      </div>

      <div className="oc-progreso">
        <div className="oc-progreso__cab">
          <span>{recibido} de {totalCant} unidades recepcionadas ({items.length} {items.length === 1 ? 'renglón' : 'renglones'})</span>
          <strong>{pct} %</strong>
        </div>
        <div className="oc-progreso__barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`oc-progreso__relleno${pct === 100 ? ' oc-progreso__relleno--completo' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Datos */}
      <div className="oc-tarjetas">
        <Tarjeta etiqueta="Solicitante" valor={e.autoriza || e.solicitante || '—'} />
        <Tarjeta etiqueta="Creada por" valor={e.creador_nombre || e.creado_por || '—'} />
        <Tarjeta etiqueta="Fecha de emisión" valor={fechaCorta(e.fecha)} />
        <Tarjeta etiqueta="Destino" valor={e.placa ? `Unidad ${e.placa}` : (e.centro_costo || 'Almacén central')} />
        <Tarjeta etiqueta="Proveedor" valor={e.proveedor_nombre || 'Proveedor general'} extra={e.proveedor_ruc ? `RUC ${e.proveedor_ruc}` : undefined} />
        <Tarjeta etiqueta="Documento del proveedor" valor={e.documento_referencia || '—'} />
        <Tarjeta etiqueta="Motivo" valor={e.motivo_entrada || '—'} extra={e.sub_motivo ? `${naturaleza || 'Gasto'} · ${e.sub_motivo}` : undefined} />
        <Tarjeta etiqueta="Condición de pago" valor={pago} extra={`Centro de costos ${e.centro_costo || 'CC-100'} · Prioridad ${e.prioridad || 'Normal'}`} />
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Documentos</p>
        <div className="oc-docs">
          {docs.map(d => d.url
            ? <a key={d.etiqueta} className="oc-doc oc-doc--ok" href={d.url} target="_blank" rel="noreferrer">{d.etiqueta}</a>
            : <span key={d.etiqueta} className="oc-doc oc-doc--falta">Sin {d.etiqueta.toLowerCase()}</span>)}
        </div>
      </div>

      {e.observaciones && (
        <div className="tarjeta">
          <p className="tarjeta__grupo-titulo" style={{ marginTop: 0 }}>Observaciones</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>{e.observaciones}</p>
        </div>
      )}

      {/* Artículos */}
      <div>
        <p className="tarjeta__grupo-titulo">Artículos ({items.length})</p>
        {items.length === 0 ? (
          <p className="t-footnote c-secondary">No hay artículos en esta orden.</p>
        ) : (
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="inv-kardex">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'center' }}>U.M.</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>P. unit.</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id ?? i}>
                    <td>{i + 1}</td>
                    <td className="oc-mono" style={{ fontSize: '0.75rem' }}>{it.inventario_id || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{descripcionArticulo(it.descripcion, it.inventario_id) || it.inventario_id || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{it.item_unidad || unidadDe(it.inventario_id) || 'UND'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(it.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoneda(it.costo_unitario, moneda)}</td>
                    <td className="oc-importe" style={{ textAlign: 'right' }}>
                      {formatMoneda(Number(it.importe) || (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0), moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        <span className="t-footnote c-secondary">SON: {numeroALetras(totalReal)} {moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'}</span>
        {conIgv && (
          <span className="t-footnote c-secondary">
            Gravado {formatMoneda(gravado, moneda)} · IGV 18 % {formatMoneda(igv, moneda)}
          </span>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700 }}>Total neto</span>
          <span className="oc-pie__monto">{formatMoneda(totalReal, moneda)}</span>
        </div>
        {moneda === 'USD' && tc > 0 && (
          <span className="t-footnote c-secondary" style={{ textAlign: 'right' }}>Equivale a {formatMoneda(totalReal * tc, 'PEN')} (T/C {tc})</span>
        )}
      </div>
    </div>
  );
}

function Paso({ titulo, nodo, icono, texto }: { titulo: string; nodo: string; icono: ReactNode; texto: string }) {
  return (
    <div className="oc-paso">
      <span className={`oc-paso__nodo${nodo ? ` oc-paso__nodo--${nodo}` : ''}`}>{icono}</span>
      <span className="oc-paso__titulo">{titulo}</span>
      <span className="oc-paso__texto">{texto}</span>
    </div>
  );
}

function Tarjeta({ etiqueta, valor, extra }: { etiqueta: string; valor: string; extra?: string }) {
  return (
    <div className="oc-tarjeta">
      <span className="oc-tarjeta__etiqueta">{etiqueta}</span>
      <span className="oc-tarjeta__valor">{valor}</span>
      {extra && <span className="oc-tarjeta__extra">{extra}</span>}
    </div>
  );
}
