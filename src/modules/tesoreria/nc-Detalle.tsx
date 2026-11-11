import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, PackageMinus, Undo2, XCircle } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { useEmpresaCuentas } from '../almacen/api';
import { etiquetaCuentaEmpresa } from '../almacen/entradaReglas';
import { Combobox } from '../../core/ui/Combobox';
import { ETIQUETA_ESTADO, TONO_ESTADO, accionNc, enlazarSalida, faltaSalida, montoNc, useDetalleNc } from './nc-api';
import { NcDevolucion } from './nc-Devolucion';
import { useSalidasLibres } from './nc-Mercaderia';

/** Detalle de una nota de crédito: cifras, archivo, a qué órdenes se aplicó y su historial. Desde aquí se aprueba, se reembolsa o se anula. */
export function NcDetalle({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useDetalleNc(id);
  const d = q.data?.data;
  const puedeEditar = can('tesoreria_nc.editar');
  const puedeAprobar = can('tesoreria_nc.aprobar'); // aprobar, anular y reembolsar
  const puedeEnlazar = puedeEditar || can('ent_inv.editar'); // Almacén completa la devolución; aprobar, reembolsar y anular son de Tesorería
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [reembolsando, setReembolsando] = useState(false);
  const [enlazando, setEnlazando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const [salidaElegida, setSalidaElegida] = useState('');
  const libres = useSalidasLibres(d?.proveedor_nombre ?? null);

  const refrescar = async () => { await qc.invalidateQueries({ queryKey: ['tesoreria', 'notas-credito'] }); };

  async function aprobar() {
    if (!d) return;
    setOcupado(true);
    try { await accionNc(d.id, 'aprobar'); haptic('success'); toast(`Nota ${d.codigo} aprobada: ya se puede aplicar`); await refrescar(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function enlazar(referencia: string) {
    if (!d || !referencia) return;
    setOcupado(true);
    try { await enlazarSalida(d.id, referencia); haptic('success'); toast(`Salida ${referencia} enlazada a ${d.codigo}`); setEnlazando(false); setDevolviendo(false); setSalidaElegida(''); await refrescar(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const usable = !!d && ['APROBADA', 'APLICADA_PARCIAL'].includes(d.estado) && d.saldo > 0;
  const sinUso = !!d && d.aplicado === 0;

  return (
    <>
      <Sheet open={id != null} onClose={() => !ocupado && onClose()} title={d ? `${d.codigo} · ${d.serie}-${d.numero}` : 'Nota de crédito'}
        footer={d && puedeAprobar ? (
          <>
            {['REGISTRADA', 'APROBADA'].includes(d.estado) && sinUso && (
              <Button variant="plain" icon={<XCircle size={16} />} onClick={() => setAnulando(true)} disabled={ocupado} style={{ marginRight: 'auto', color: 'var(--red-ink)' }}>Anular</Button>
            )}
            {usable && <Button variant="secondary" icon={<Undo2 size={16} />} onClick={() => setReembolsando(true)} disabled={ocupado}>Registrar reembolso</Button>}
            {d.estado === 'REGISTRADA' && <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={ocupado} onClick={aprobar}>Aprobar</Button>}
          </>
        ) : undefined}>
        {q.isLoading || !d ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              <span className={`nc-estado nc-estado--${TONO_ESTADO[d.estado]}`}>{ETIQUETA_ESTADO[d.estado]}</span>
              <span className="t-footnote c-secondary">{d.proveedor_nombre}{d.proveedor_ruc ? ` · RUC ${d.proveedor_ruc}` : ''}</span>
            </div>

            <div className="nc-total-cifras">
              <div><strong>{montoNc(d.total, d.moneda)}</strong><span>Total de la nota</span></div>
              <div><strong>{montoNc(d.aplicado, d.moneda)}</strong><span>Aplicado / reembolsado</span></div>
              <div><strong style={{ color: d.saldo > 0 ? 'var(--green-ink)' : undefined }}>{montoNc(d.saldo, d.moneda)}</strong><span>Saldo a favor</span></div>
            </div>

            {d && faltaSalida(d) && (
              <Notice tone="accent" icon={<PackageMinus size={16} />}>
                <b>Falta registrar la salida de la devolución.</b> Enlaza la salida de almacén o genérala ahora para que baje el stock.
                {puedeEnlazar && (
                  <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', marginTop: 'var(--s-2)' }}>
                    <Button size="sm" variant="secondary" onClick={() => setEnlazando(true)}>Enlazar salida existente</Button>
                    <Button size="sm" variant="primary" onClick={() => setDevolviendo(true)}>Devolver mercadería ahora</Button>
                  </div>
                )}
              </Notice>
            )}
            {d.estado === 'REGISTRADA' && <Notice>Falta la aprobación. {d.registrado_por ? `La registró ${d.registrado_por}: la aprueba otra persona (Tesorería o Contabilidad).` : ''}</Notice>}
            {d.estado === 'ANULADA' && <Notice tone="error">Anulada por {d.anulado_por || '—'}: {d.motivo_anulacion}</Notice>}

            <div className="tarjeta__lista">
              <Dato k="Fecha de emisión" v={formatFechaPe(d.fecha_emision)} />
              <Dato k="Motivo" v={d.motivo_sunat ? `${d.motivo_sunat} · ${d.motivo_texto ?? ''}` : d.motivo_texto} />
              <Dato k="Base / IGV" v={d.base || d.igv ? `${montoNc(d.base, d.moneda)} / ${montoNc(d.igv, d.moneda)}` : null} />
              <Dato k="Orden de origen" v={d.oc_origen} />
              <Dato k="Devolución (guía o salida)" v={d.referencia_devolucion} />
              <Dato k="Saldo" v={d.forma === 'APLICAR' ? 'Se aplica a próximas órdenes' : 'Reembolso en dinero'} />
              <Dato k="Registrada por" v={d.registrado_por ? `${d.registrado_por} · ${d.creada_en}` : null} />
              <Dato k="Aprobada por" v={d.aprobado_por ? `${d.aprobado_por} · ${d.fecha_aprobacion ?? ''}` : null} />
              {d.reembolso_fecha && <Dato k="Reembolso" v={`${formatFechaPe(d.reembolso_fecha)} · operación ${d.reembolso_constancia ?? ''}`} />}
              <Dato k="Observaciones" v={d.observaciones} />
            </div>

            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {d.archivo_url && <a className="btn btn--secondary" href={d.archivo_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden /> Ver la nota de crédito</a>}
              {d.reembolso_url && <a className="btn btn--secondary" href={d.reembolso_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden /> Ver voucher del reembolso</a>}
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Aplicada a órdenes de compra ({q.data?.aplicaciones.filter(a => a.estado === 'VIGENTE').length ?? 0})</p>
              {(q.data?.aplicaciones ?? []).length === 0 ? <p className="t-footnote c-secondary">Todavía no se aplicó a ningún pago.</p> : (
                <ul className="nc-lineas">
                  {(q.data?.aplicaciones ?? []).map(a => (
                    <li key={a.id} style={a.estado === 'REVERTIDA' ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                      <time>{a.fecha}</time>
                      <span><b>{montoNc(a.monto, a.moneda)}</b> a la orden {String(a.entrada_id).replace(/^ENT-/, '')}
                        <small>{a.orden_proveedor ?? ''}{a.orden_motivo ? ` · ${a.orden_motivo}` : ''} · {a.usuario ?? ''}{a.estado === 'REVERTIDA' ? ' · revertida' : ''}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="tarjeta__grupo-titulo">Historial</p>
              <ul className="nc-lineas">
                {(q.data?.historial ?? []).map(h => (
                  <li key={h.id}><time>{h.fecha}</time><span><b>{h.accion}</b>{h.detalle ? <small>{h.detalle}{h.usuario ? ` · ${h.usuario}` : ''}</small> : <small>{h.usuario ?? ''}</small>}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>

      {d && (
        <Sheet open={enlazando} onClose={() => !ocupado && setEnlazando(false)} title="Enlazar salida de la devolución"
          footer={<><Button variant="secondary" onClick={() => setEnlazando(false)} disabled={ocupado}>Cancelar</Button>
            <Button variant="primary" onClick={() => enlazar(salidaElegida)} loading={ocupado} disabled={!salidaElegida}>Enlazar</Button></>}>
          <Combobox options={libres.map(sa => ({ value: String(sa.id), label: String(sa.id), description: `${sa.fecha ? formatFechaPe(sa.fecha) : ''} · ${sa.responsable ?? ''}` }))}
            value={salidaElegida || null} onChange={v => setSalidaElegida(v ?? '')} enHoja compacta placeholder="Elige la salida" tituloHoja="Salida de almacén" />
          {libres.length === 0 && <p className="field__hint">No hay salidas de devolución sin nota. Usa «Devolver mercadería ahora».</p>}
        </Sheet>
      )}
      {d && (
        <NcDevolucion open={devolviendo} onClose={() => setDevolviendo(false)} inicial={{ proveedorId: d.proveedor_id ?? undefined, ocOrigen: d.oc_origen ?? undefined }}
          onHecha={r => { void enlazar(r.referencia); }} />
      )}
      {d && <AnularSheet open={anulando} nota={d.codigo} id={d.id} onClose={() => setAnulando(false)} onHecho={async () => { setAnulando(false); await refrescar(); }} />}
      {d && <ReembolsoSheet open={reembolsando} nota={d.codigo} id={d.id} monto={montoNc(d.saldo, d.moneda)} usd={d.moneda === 'USD'} onClose={() => setReembolsando(false)} onHecho={async () => { setReembolsando(false); await refrescar(); }} />}
    </>
  );
}

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v || !String(v).trim()) return null;
  return <div className="dato"><span className="dato__label">{k}</span><span className="dato__valor">{v}</span></div>;
}

function AnularSheet({ open, nota, id, onClose, onHecho }: { open: boolean; nota: string; id: number; onClose: () => void; onHecho: () => Promise<void> }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function anular() {
    if (motivo.trim().length < 5) { toast('Escribe el motivo de la anulación.', 'error'); haptic('warning'); return; }
    setEnviando(true);
    try { await accionNc(id, 'anular', { motivo: motivo.trim() }); haptic('success'); toast(`Nota ${nota} anulada`); setMotivo(''); await onHecho(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEnviando(false); }
  }
  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Anular ${nota}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button><Button variant="danger" loading={enviando} onClick={anular}>Anular nota</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <Notice>La nota deja de valer y su saldo queda en cero. Esta acción queda registrada en la auditoría.</Notice>
        <Field label="Motivo de la anulación">{p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. La registré con el proveedor equivocado" />}</Field>
      </div>
    </Sheet>
  );
}

function ReembolsoSheet({ open, nota, id, monto, usd, onClose, onHecho }: { open: boolean; nota: string; id: number; monto: string; usd: boolean; onClose: () => void; onHecho: () => Promise<void> }) {
  const toast = useToast();
  const cuentasQ = useEmpresaCuentas();
  const [constancia, setConstancia] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cuentas = useMemo(() => (cuentasQ.data ?? []).map(etiquetaCuentaEmpresa).filter(c => usd ? /D[ÓO]LARES/i.test(c) : /SOLES/i.test(c)), [cuentasQ.data, usd]);

  async function registrar() {
    if (!constancia.trim()) { toast('Escribe el número de la operación o depósito.', 'error'); haptic('warning'); return; }
    if (!cuenta) { toast('Elige la cuenta donde ingresó el dinero.', 'error'); haptic('warning'); return; }
    const fd = new FormData();
    fd.append('numero_constancia', constancia.trim());
    fd.append('cuenta_destino', cuenta);
    if (voucher) fd.append('voucher', voucher);
    setEnviando(true);
    try { await api(`/compras/notas-credito/${id}/reembolso`, { method: 'POST', body: fd }); haptic('success'); toast(`Reembolso de ${nota} registrado en Caja`); await onHecho(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEnviando(false); }
  }
  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Reembolso de ${nota}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button><Button variant="primary" loading={enviando} onClick={registrar}>Registrar ingreso</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <Notice>El proveedor devolvió {monto} en dinero. Se registra como ingreso en Caja y la nota queda cerrada, sin saldo.</Notice>
        <Field label="Cuenta de la empresa donde ingresó">
          {p => (
            <SelectInput {...p} value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">{cuentasQ.isLoading ? 'Cargando cuentas…' : 'Elige una cuenta'}</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="N° de operación o depósito">{p => <TextInput {...p} value={constancia} onChange={e => setConstancia(e.target.value)} />}</Field>
        <Field label="Voucher (opcional)">{p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setVoucher} />}</Field>
      </div>
    </Sheet>
  );
}
