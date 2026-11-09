import './entradas.css';
import './recepcionDetalle.css';
import '../../core/ui/botonesIcono.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, CircleDot, FileText, Lock, PackageCheck, PackagePlus, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { BotonTip } from '../../core/ui/BotonTip';
import { Button } from '../../core/ui/Button';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { ADMIN } from '../../core/auth/permisos';
import { haptic } from '../../core/lib/haptics';
import { formatFechaHoraPe, formatMoneda, formatSoles } from '../../core/lib/format';
import { eliminarRecepcion, type HistorialRecepcion, type RecepcionOC } from './api';

const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));
const esCredito = (c: string | null | undefined) => /cr[eé]dito/i.test(c ?? '');
const esPdf = (u: string) => /\.pdf(\?|$)/i.test(u);

type Paso = 'hecho' | 'actual' | 'pendiente';

/** Anillo de avance: se dibuja de 0 al valor real al abrir (con «reducir movimiento» aparece completo) */
function Anillo({ pct, tono }: { pct: number; tono: 'red' | 'amber' | 'green' }) {
  const [listo, setListo] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setListo(true)); return () => cancelAnimationFrame(r); }, []);
  const r = 38, circ = 2 * Math.PI * r;
  return (
    <svg className="rd-anillo" width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`${pct}% recibido`}>
      <circle cx="52" cy="52" r={r} fill="none" strokeWidth="9" style={{ stroke: 'var(--fill)' }} />
      <circle cx="52" cy="52" r={r} fill="none" strokeWidth="9" strokeLinecap="round" transform="rotate(-90 52 52)"
        strokeDasharray={`${listo ? (pct / 100) * circ : 0} ${circ}`} style={{ stroke: `var(--${tono}-ink)` }} className="rd-anillo__arco" />
      <text x="52" y="52" textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--label)', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 22 }}>{pct}%</text>
    </svg>
  );
}

function Dato({ etiqueta, valor, extra }: { etiqueta: string; valor: ReactNode; extra?: string }) {
  return (
    <div className="rd-dato">
      <span className="rd-dato__k">{etiqueta}</span>
      <span className="rd-dato__v">{valor}</span>
      {extra && <span className="rd-dato__x">{extra}</span>}
    </div>
  );
}

function Evidencias({ urls }: { urls: string[] }) {
  if (!urls.length) return <span className="rd-sin">Sin evidencia adjunta</span>;
  return (
    <div className="rd-evid">
      {urls.map((u, k) => esPdf(u)
        ? <a key={k} href={u} target="_blank" rel="noreferrer" className="rd-evid__doc"><FileText size={18} /><span>Documento {k + 1}</span></a>
        : <a key={k} href={u} target="_blank" rel="noreferrer" className="rd-evid__foto" aria-label={`Abrir foto ${k + 1}`}><img src={u} alt={`Evidencia ${k + 1}`} loading="lazy" /></a>)}
    </div>
  );
}

/**
 * Detalle de una orden en recepción: estado y avance de un vistazo, línea de vida, artículos con su progreso
 * y las entregas registradas con sus evidencias (fotos y documentos).
 */
export function RecepcionDetalle({ oc, puedeRecibir, puedeRevertir, onRecepcionar, onVolver }: {
  oc: RecepcionOC; puedeRecibir: boolean; puedeRevertir: boolean; onRecepcionar: () => void; onVolver: () => void;
}) {
  const { user, permissions } = useAuth();
  const esAdmin = permissions.has(ADMIN);
  const qc = useQueryClient();
  const toast = useToast();
  const [porRevertir, setPorRevertir] = useState<HistorialRecepcion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const moneda = String(oc.moneda).toUpperCase() === 'USD' ? 'USD' : 'PEN';
  const tc = Number(oc.tipo_cambio) || 0;
  const pendiente = Math.max(0, oc.total_pedido - oc.total_recibido);
  const pct = oc.total_pedido > 0 ? Math.min(100, Math.round((oc.total_recibido / oc.total_pedido) * 100)) : 0;
  const tono = oc.estado_recepcion === 'COMPLETO' ? 'green' : oc.estado_recepcion === 'PARCIAL' ? 'amber' : 'red';
  const importe = moneda === 'USD' && tc > 0 ? oc.importe / tc : oc.importe;
  const valorRecibido = oc.items.reduce((s, it) => s + it.recepcionado * (Number(it.costo_unitario) || 0), 0);

  // Una entrega = varias líneas con el mismo recepcion_id
  const entregas = useMemo(() => {
    const m = new Map<number, { cab: HistorialRecepcion; lineas: HistorialRecepcion[] }>();
    for (const h of oc.historial_recepciones) {
      if (!m.has(h.recepcion_id)) m.set(h.recepcion_id, { cab: h, lineas: [] });
      m.get(h.recepcion_id)!.lineas.push(h);
    }
    return [...m.values()].reverse();
  }, [oc.historial_recepciones]);

  const banner = oc.estado_recepcion === 'COMPLETO'
    ? { clase: 'oc-banner--verde', titulo: 'RECEPCIÓN COMPLETA', texto: 'Toda la mercadería ingresó al almacén.' }
    : oc.estado_recepcion === 'PARCIAL'
      ? { clase: 'oc-banner--azul', titulo: `EN RECEPCIÓN · ${pct} %`, texto: `Faltan ${fmt(pendiente)} unidades por recibir. Cada entrega lleva su evidencia.` }
      : { clase: 'oc-banner--ambar', titulo: 'PENDIENTE DE RECEPCIÓN', texto: 'Aún no se recibió nada. Al recepcionar deberás adjuntar fotos o documentos de sustento.' };

  const primera = entregas.length ? entregas[entregas.length - 1].cab.fecha_recepcion : null;
  const pasos: Array<{ titulo: string; texto: string; estado: Paso; icono: ReactNode }> = [
    { titulo: 'Orden emitida', texto: oc.fecha || '—', estado: 'hecho', icono: <Check size={15} strokeWidth={2.6} /> },
    { titulo: 'Primera entrega', texto: primera ? formatFechaHoraPe(primera) : 'Esperando mercadería', estado: primera ? 'hecho' : 'actual', icono: <Truck size={15} /> },
    { titulo: 'Recepción completa', texto: oc.estado_recepcion === 'COMPLETO' ? '100 % en almacén' : `${pct} % recibido`, estado: oc.estado_recepcion === 'COMPLETO' ? 'hecho' : primera ? 'actual' : 'pendiente', icono: <PackageCheck size={15} /> },
  ];

  async function revertir() {
    if (!porRevertir) return;
    setRevirtiendo(true);
    try {
      const r = await eliminarRecepcion(porRevertir.recepcion_id, user?.name ?? '');
      if (r.ok === false) throw new Error(r.error || 'No se pudo revertir la entrega');
      haptic('success');
      toast('Entrega revertida: el stock volvió a su valor anterior');
      setPorRevertir(null);
      await qc.invalidateQueries({ queryKey: ['almacen'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setRevirtiendo(false);
    }
  }

  return (
    <div className="rd">
      <div className="rd-barra">
        <button type="button" className="rd-volver" onClick={onVolver}><ChevronLeft size={18} /> Recepciones</button>
        <div className="rd-barra__acciones">
          {puedeRecibir && pendiente > 0 && (
            <Button variant="primary" icon={<PackagePlus size={16} />} onClick={onRecepcionar}>Recepcionar</Button>
          )}
        </div>
      </div>

      {/* Cabecera: quién, cuánto y cómo va */}
      <header className={`rd-hero rd-hero--${tono}`}>
        <div className="rd-hero__texto">
          <span className="rd-hero__id">Orden de compra N° {String(oc.id)}</span>
          <h2 className="rd-hero__titulo">{oc.proveedor}</h2>
          <div className="rd-hero__chips">
            <span className={`rd-chip rd-chip--${tono}`}>{oc.estado_recepcion === 'COMPLETO' ? 'Completa' : oc.estado_recepcion === 'PARCIAL' ? 'En recepción' : 'Pendiente'}</span>
            <span className="rd-chip">{esCredito(oc.condicion_pago) ? `Crédito${oc.dias_credito ? ` · ${oc.dias_credito} días` : ''}` : 'Contado'}</span>
            <span className="rd-chip">{moneda === 'USD' ? 'Dólares' : 'Soles'}</span>
            <span className="rd-chip">{String(oc.estado_oc).replace('PROCESADA', 'PROCESADO')}</span>
          </div>
        </div>
        <Anillo pct={pct} tono={tono} />
      </header>

      <div className={`oc-banner ${banner.clase}`} role="status"><strong>{banner.titulo}</strong><span>{banner.texto}</span></div>

      {/* Cifras */}
      <div className="rd-cifras">
        <div className="rd-cifra"><span className="rd-cifra__n">{fmt(oc.total_pedido)}</span><span className="rd-cifra__k">Pedido</span></div>
        <div className="rd-cifra"><span className="rd-cifra__n rd-cifra__n--verde">{fmt(oc.total_recibido)}</span><span className="rd-cifra__k">Recibido</span></div>
        <div className="rd-cifra"><span className={`rd-cifra__n${pendiente > 0 ? ' rd-cifra__n--ambar' : ''}`}>{fmt(pendiente)}</span><span className="rd-cifra__k">Pendiente</span></div>
        <div className="rd-cifra"><span className="rd-cifra__n rd-cifra__n--mono">{formatMoneda(importe, moneda)}</span><span className="rd-cifra__k">Importe de la orden</span></div>
      </div>

      {/* Línea de vida */}
      <ol className="rd-pasos" aria-label="Avance de la orden">
        {pasos.map((p, i) => (
          <li key={p.titulo} className={`rd-paso rd-paso--${p.estado}`} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="rd-paso__nodo">{p.estado === 'actual' ? <CircleDot size={15} /> : p.icono}</span>
            <span className="rd-paso__titulo">{p.titulo}</span>
            <span className="rd-paso__texto">{p.texto}</span>
          </li>
        ))}
      </ol>

      <div className="rd-columnas">
        <div className="rd-col">
          {/* Artículos con su progreso */}
          <section className="rd-panel">
            <h3 className="rd-panel__titulo">Artículos <span>{oc.items.length}</span></h3>
            <ul className="rd-items">
              {oc.items.map((it, i) => {
                const p = it.pedido > 0 ? Math.min(100, Math.round((it.recepcionado / it.pedido) * 100)) : 0;
                return (
                  <li key={i} className="rd-item">
                    <span className="rd-item__n">{i + 1}</span>
                    <div className="rd-item__cuerpo">
                      <span className="rd-item__nombre">{it.descripcion}</span>
                      <span className="rd-item__meta">{it.inventario_id ? <b>{it.inventario_id}</b> : null}{it.inventario_id ? ' · ' : ''}{it.unidad || 'UND'}</span>
                      <span className="rd-item__barra" aria-hidden><span style={{ width: `${p}%` }} /></span>
                    </div>
                    <div className="rd-item__cifras">
                      <span><b>{fmt(it.recepcionado)}</b> / {fmt(it.pedido)}</span>
                      {it.pendiente > 0 ? <span className="rd-item__falta">Faltan {fmt(it.pendiente)}</span> : <span className="rd-item__ok">Completo</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Entregas */}
          <section className="rd-panel">
            <h3 className="rd-panel__titulo">Entregas registradas <span>{entregas.length}</span></h3>
            {entregas.length === 0 ? (
              <p className="rd-vacio">Todavía no se registró ninguna entrega.</p>
            ) : (
              <ol className="rd-entregas">
                {entregas.map(({ cab, lineas }) => {
                  const urls = cab.sustentos?.length ? cab.sustentos : cab.sustento_url_presigned ? [cab.sustento_url_presigned] : [];
                  return (
                    <li key={cab.recepcion_id} className="rd-entrega">
                      <div className="rd-entrega__cab">
                        <div>
                          <strong className="rd-entrega__fecha">{formatFechaHoraPe(cab.fecha_recepcion)}</strong>
                          <span className="rd-entrega__quien">{[cab.usuario, cab.almacen].filter(Boolean).join(' · ')}</span>
                        </div>
                        <span className={`rd-chip ${cab.tipo_recepcion === 'TOTAL' ? 'rd-chip--green' : 'rd-chip--amber'}`}>{cab.tipo_recepcion === 'TOTAL' ? 'Total' : 'Parcial'}</span>
                        {puedeRevertir && (esAdmin || (cab.minutos_desde_registro ?? 0) <= 24 * 60) && (
                          <BotonTip tip="Revertir esta entrega" className="rd-revertir" onClick={() => setPorRevertir(cab)}><Trash2 size={16} /></BotonTip>
                        )}
                        {puedeRevertir && !esAdmin && (cab.minutos_desde_registro ?? 0) > 24 * 60 && (
                          <span className="rd-bloqueada" title="Pasó más de un día: ya no se puede revertir. Recepciona lo que falte y pide a Sistemas que corrija el error."><Lock size={13} /> Cerrada</span>
                        )}
                      </div>
                      <ul className="rd-entrega__lineas">
                        {lineas.map(l => <li key={l.detalle_id}><b>+{fmt(l.cantidad_recibida)}</b> {l.descripcion ?? 'Artículo'}</li>)}
                      </ul>
                      {cab.observacion && <p className="rd-entrega__obs">“{cab.observacion}”</p>}
                      <Evidencias urls={urls} />
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="rd-col rd-col--lado">
          <section className="rd-panel">
            <h3 className="rd-panel__titulo">Datos de la orden</h3>
            <div className="rd-datos">
              <Dato etiqueta="Fecha de emisión" valor={oc.fecha || '—'} />
              <Dato etiqueta="Solicitante" valor={oc.solicitante || '—'} />
              <Dato etiqueta="Autoriza" valor={oc.autoriza || '—'} />
              <Dato etiqueta="Almacén de destino" valor={oc.almacen || 'Principal'} />
              <Dato etiqueta="Condición de pago" valor={esCredito(oc.condicion_pago) ? `Crédito${oc.dias_credito ? ` (${oc.dias_credito} días)` : ''}` : 'Contado'} />
            </div>
          </section>

          <section className="rd-panel rd-panel--total">
            <h3 className="rd-panel__titulo">Valorización</h3>
            <div className="rd-total">
              <span>Importe de la orden</span>
              <strong>{formatMoneda(importe, moneda)}</strong>
            </div>
            {moneda === 'USD' && tc > 0 && <span className="rd-total__eq">Equivale a {formatSoles(oc.importe)} · TC {tc.toFixed(3)}</span>}
            <div className="rd-total rd-total--suave">
              <span>Recibido hasta hoy</span>
              <strong>{formatMoneda(valorRecibido, moneda)}</strong>
            </div>
            <span className="rd-garantia"><ShieldCheck size={14} /> Cada entrega queda con su evidencia y en el kardex.</span>
          </section>
        </aside>
      </div>

      <ConfirmSheet
        open={!!porRevertir}
        onClose={() => !revirtiendo && setPorRevertir(null)}
        onConfirm={revertir}
        loading={revirtiendo}
        title="¿Revertir esta entrega?"
        message={porRevertir
          ? `Se descuenta del inventario lo que ingresó la entrega del ${formatFechaHoraPe(porRevertir.fecha_recepcion)} y el saldo vuelve a quedar disponible en la orden. Solo se puede revertir durante las primeras 24 horas.`
          : ''}
        confirmLabel="Revertir"
      />
    </div>
  );
}
