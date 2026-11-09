import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, FileDown, FileText, Gavel, Paperclip, Pencil, RotateCcw, Trash2, Undo2, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuFila } from '../../core/ui/MenuFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { VisorFotos } from '../../core/ui/VisorFotos';
import { BotonTip } from '../../core/ui/BotonTip';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { ADMIN } from '../../core/auth/permisos';
import { formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { prepararEvidencia } from '../../core/lib/imagen';
import {
  ASUME_TXT, ESTADO_TONO, ESTADO_TXT, GRAVEDAD_TXT, RAIZ_PAPELETAS, TIPO_DOC_TXT, anularPapeleta, eliminarPapeleta, entidadTexto, fechaTxt, plazoTxt, quitarEvidencia, quitarPago,
  reactivarPapeleta, registrarDescargo, registrarReembolso, subirEvidencias, useDetallePap, type PapeletaDetalle,
} from './pap-api';
import { abrirPdfFicha } from './pap-pdf';

const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const esPdf = (u: string) => /\.pdf(\?|$)/i.test(u);

function Dato({ k, v, mono, ancho }: { k: string; v: React.ReactNode; mono?: boolean; ancho?: boolean }) {
  const vacio = v == null || v === '' || v === '—';
  return (
    <div className={`pap-dato${ancho ? ' pap-dato--ancho' : ''}`}>
      <span className="pap-k">{k}</span>
      <span className={`pap-dato__v${mono ? ' pap-mono' : ''}${vacio ? ' pap-dato__v--vacio' : ''}`}>{vacio ? '—' : v}</span>
    </div>
  );
}

type Paso = { titulo: string; texto: string; estado: 'hecho' | 'actual' | 'pendiente' | 'vencido' };

/** Línea de vida del trámite: cada hito con su estado y los días que quedan */
function pasos(d: PapeletaDetalle): Paso[] {
  const lista: Paso[] = [{ titulo: 'Infracción', texto: fechaTxt(d.fecha_infraccion, true), estado: 'hecho' }];
  lista.push({ titulo: 'Notificación', texto: d.fecha_notificacion ? fechaTxt(d.fecha_notificacion) : 'Sin fecha', estado: d.fecha_notificacion ? 'hecho' : 'pendiente' });
  if (d.descargo_expediente) lista.push({ titulo: 'Descargo', texto: `Exp. ${d.descargo_expediente} · ${(d.descargo_resultado || 'pendiente').toLowerCase()}`, estado: d.descargo_resultado === 'PENDIENTE' ? 'actual' : 'hecho' });
  else if (d.fecha_limite_descargo) lista.push({ titulo: 'Descargo', texto: `Hasta ${fechaTxt(d.fecha_limite_descargo)} (${plazoTxt(d.dias_descargo)})`, estado: (d.dias_descargo ?? 1) < 0 ? 'vencido' : 'pendiente' });
  if (d.descuento_monto > 0 && d.fecha_limite_descuento) lista.push({ titulo: 'Descuento', texto: `Hasta ${fechaTxt(d.fecha_limite_descuento)} (${plazoTxt(d.dias_descuento)})`, estado: d.pagado > 0 ? 'hecho' : d.descuento_vigente ? 'actual' : 'vencido' });
  const pagada = d.estado === 'PAGADA';
  lista.push({
    titulo: 'Pago', texto: pagada ? `Cancelada · ${formatMoneda(d.pagado, d.moneda)}` : d.fecha_limite_pago ? `Hasta ${fechaTxt(d.fecha_limite_pago)} (${plazoTxt(d.dias_pago)})` : 'Sin plazo',
    estado: pagada ? 'hecho' : d.vencida ? 'vencido' : 'actual',
  });
  return lista;
}

/** Detalle de una papeleta en una ventana: estado y plazos de un vistazo, datos, evidencias con visor, pagos e historial */
export function PapDetalle({ id, onClose, onEditar, onPago }: {
  id: number | null; onClose: () => void; onEditar: (d: PapeletaDetalle) => void; onPago: (d: PapeletaDetalle) => void;
}) {
  const q = useDetallePap(id);
  const d = q.data;
  const qc = useQueryClient();
  const toast = useToast();
  const { can, permissions } = useAuth();
  const esAdmin = permissions.has(ADMIN);
  const puedeEditar = can('papeletas.crear', 'papeletas.editar');
  const puedePagar = can('papeletas.crear', 'papeletas.editar', 'tesoreria_papeletas.crear', 'tesoreria_caja.crear');
  const [visor, setVisor] = useState<number | null>(null);
  const [dialogo, setDialogo] = useState<null | 'descargo' | 'anular' | 'reembolso' | 'eliminar'>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // Campos de los diálogos
  const [expediente, setExpediente] = useState(''); const [fechaDesc, setFechaDesc] = useState(hoyLima());
  const [resultado, setResultado] = useState('PENDIENTE'); const [obs, setObs] = useState('');
  const [motivo, setMotivo] = useState(''); const [montoReem, setMontoReem] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: RAIZ_PAPELETAS });
  const cerrarDialogo = () => { setDialogo(null); setError(null); };

  async function ejecutar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true); setError(null);
    try { await fn(); haptic('success'); toast(ok); await refrescar(); cerrarDialogo(); }
    catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function agregarArchivos(lista: FileList | null) {
    if (!d || !lista?.length) return;
    setOcupado(true);
    try {
      const preparados = await Promise.all(Array.from(lista).map(a => (a.type.startsWith('image/') ? prepararEvidencia(a) : Promise.resolve(a))));
      await subirEvidencias(d.id, preparados);
      haptic('success'); toast('Archivos agregados'); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); if (entrada.current) entrada.current.value = ''; }
  }

  const fotos = (d?.evidencias ?? []).filter(e => !esPdf(e.key));
  const alerta = d && d.saldo > 0 && d.estado !== 'ANULADA'
    ? d.vencida ? { tono: 'red', texto: `El plazo de pago venció ${plazoTxt(d.dias_pago)}. Saldo ${formatMoneda(d.saldo, d.moneda)}.` }
      : d.descuento_vigente && d.dias_descuento != null && d.dias_descuento <= 7 ? { tono: 'amber', texto: `El descuento vence ${plazoTxt(d.dias_descuento)}: pagando ahora ahorras ${formatMoneda(d.descuento_monto, d.moneda)}.` } : null
    : null;

  return (
    <>
      <Sheet open={id != null} onClose={onClose} ancho anclaAbajo ligera title={d ? `Papeleta ${d.codigo}` : 'Papeleta'}
        footer={d ? (
          <>
            {puedePagar && d.saldo > 0 && d.estado !== 'ANULADA' && <Button variant="primary" icon={<Wallet size={16} />} onClick={() => onPago(d)}>Registrar pago</Button>}
            {puedeEditar && d.estado !== 'ANULADA' && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => onEditar(d)}>Editar</Button>}
            <MenuFila etiqueta="Más acciones" acciones={[
              { label: 'Descargar PDF', icon: <FileDown size={17} />, onSelect: () => { void abrirPdfFicha(d).catch(e => toast(errorMessage(e), 'error')); } },
              puedeEditar && ['PENDIENTE', 'EN_DESCARGO'].includes(d.estado) && { label: 'Registrar descargo', icon: <Gavel size={17} />, onSelect: () => { setExpediente(d.descargo_expediente ?? ''); setResultado(d.descargo_resultado ?? 'PENDIENTE'); setFechaDesc(hoyLima()); setObs(''); setDialogo('descargo'); } },
              puedeEditar && d.quien_asume !== 'EMPRESA' && d.estado === 'PAGADA' && { label: 'Reembolso de quien asume', icon: <Undo2 size={17} />, onSelect: () => { setMontoReem(String(d.pagado)); setDialogo('reembolso'); } },
              puedeEditar && d.estado === 'ANULADA' && { label: 'Reactivar', icon: <RotateCcw size={17} />, onSelect: () => { void ejecutar(() => reactivarPapeleta(d.id), 'Papeleta reactivada'); } },
              puedeEditar && ['PENDIENTE', 'EN_DESCARGO'].includes(d.estado) && d.n_pagos === 0 && { label: 'Anular', icon: <Ban size={17} />, destructiva: true, separada: true, onSelect: () => { setMotivo(''); setDialogo('anular'); } },
              esAdmin && d.n_pagos === 0 && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, onSelect: () => setDialogo('eliminar') },
            ]} />
          </>
        ) : undefined}>
        {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : d && (
          <div className="pap-det">
            <header className="pap-hero">
              <div className="pap-hero__izq">
                <LicensePlate plate={d.placa} size="lg" />
                <div className="pap-hero__texto">
                  <span className="pap-hero__tit">{entidadTexto(d)} · N° {d.numero}</span>
                  <span className="pap-hero__sub">{TIPO_DOC_TXT[d.tipo_documento] || d.tipo_documento} · {fechaTxt(d.fecha_infraccion, true)}{d.lugar ? ` · ${d.lugar}` : ''}</span>
                </div>
              </div>
              <span className={`pap-estado pap-estado--${ESTADO_TONO[d.estado_efectivo]}`}>{ESTADO_TXT[d.estado_efectivo]}</span>
            </header>

            {alerta && <div className={`pap-alerta pap-alerta--${alerta.tono}`} role="status"><AlertTriangle size={16} aria-hidden /> {alerta.texto}</div>}
            {d.estado === 'ANULADA' && <div className="pap-alerta pap-alerta--gray" role="status"><Ban size={16} aria-hidden /> Anulada: {d.anulada_motivo || 'sin motivo'}</div>}

            <div className="pap-cifras">
              <div className="pap-cifra"><span className="pap-k">Total vigente</span><strong className="t-numeric">{formatMoneda(d.total_vigente, d.moneda)}</strong>{d.descuento_vigente && <small>con descuento</small>}</div>
              <div className="pap-cifra"><span className="pap-k">Pagado</span><strong className="t-numeric pap-verde">{formatMoneda(d.pagado, d.moneda)}</strong></div>
              <div className="pap-cifra"><span className="pap-k">Saldo</span><strong className={`t-numeric${d.saldo > 0 ? ' pap-ambar' : ''}`}>{formatMoneda(d.saldo, d.moneda)}</strong></div>
              <div className="pap-cifra"><span className="pap-k">Sin descuento</span><strong className="t-numeric pap-suave">{formatMoneda(d.total_sin_descuento, d.moneda)}</strong></div>
            </div>

            <ol className="pap-pasos" aria-label="Línea de vida">
              {pasos(d).map(p => (
                <li key={p.titulo} className={`pap-paso pap-paso--${p.estado}`}>
                  <span className="pap-paso__nodo">{p.estado === 'hecho' ? <Check size={13} strokeWidth={3} /> : p.estado === 'vencido' ? '!' : ''}</span>
                  <span className="pap-paso__tit">{p.titulo}</span><span className="pap-paso__txt">{p.texto}</span>
                </li>
              ))}
            </ol>

            <section className="pap-bloque"><h3 className="pap-titulo">Unidad y conductor</h3>
              <div className="pap-datos">
                <Dato k="Empresa dueña" v={d.empresa_unidad} /><Dato k="Conductor" v={d.conductor_nombre} /><Dato k="DNI" v={d.conductor_dni} mono /><Dato k="Licencia" v={d.licencia} mono />
                <Dato k="Quién asume el pago" v={`${ASUME_TXT[d.quien_asume]}${d.asume_nombre ? ` · ${d.asume_nombre}` : ''}`} ancho />
                {d.reembolso_monto ? <Dato k="Reembolso" v={`${formatMoneda(d.reembolso_monto, d.moneda)} el ${fechaTxt(d.reembolso_fecha)}`} ancho /> : null}
              </div>
            </section>

            <section className="pap-bloque"><h3 className="pap-titulo">Infracción</h3>
              <div className="pap-datos">
                <Dato k="Código" v={d.infraccion_codigo} mono /><Dato k="Gravedad" v={d.gravedad ? GRAVEDAD_TXT[d.gravedad] : ''} /><Dato k="Puntos" v={d.puntos} /><Dato k="Medida" v={d.medida} />
                <Dato k="Descripción" v={d.infraccion_desc} ancho /><Dato k="Departamento" v={d.departamento} /><Dato k="Agente o inspector" v={d.agente} />
              </div>
            </section>

            <section className="pap-bloque">
              <div className="pap-titulo-fila"><h3 className="pap-titulo">Evidencias <em>{d.evidencias.length}</em></h3>
                {puedeEditar && <>
                  <Button variant="secondary" size="sm" icon={<Paperclip size={15} />} loading={ocupado} onClick={() => entrada.current?.click()}>Agregar</Button>
                  <input ref={entrada} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { void agregarArchivos(e.target.files); }} />
                </>}
              </div>
              {d.evidencias.length === 0 ? <p className="pap-vacio">Sin archivos. Agrega la foto de la papeleta o la notificación.</p> : (
                <div className="pap-galeria">
                  {d.evidencias.map(e => (
                    <div key={e.key} className="pap-galeria__item">
                      {esPdf(e.key)
                        ? <a href={e.url} target="_blank" rel="noreferrer" className="pap-galeria__doc"><FileText size={22} /><span>PDF</span></a>
                        : <button type="button" className="pap-galeria__foto" aria-label="Ver evidencia" onClick={() => setVisor(Math.max(0, fotos.findIndex(f => f.key === e.key)))}><img src={e.url} alt="Evidencia" loading="lazy" /></button>}
                      {puedeEditar && <BotonTip tip="Quitar archivo" className="pap-galeria__quitar" onClick={() => { void ejecutar(() => quitarEvidencia(d.id, e.key), 'Archivo quitado'); }}><Trash2 size={13} /></BotonTip>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pap-bloque"><h3 className="pap-titulo">Pagos <em>{d.pagos.length}</em></h3>
              {d.pagos.length === 0 ? <p className="pap-vacio">Todavía no hay pagos registrados.</p> : (
                <ul className="pap-lista">
                  {d.pagos.map(p => (
                    <li key={p.id}>
                      <div><strong className="t-numeric">{formatMoneda(p.monto, d.moneda)}</strong><span>{fechaTxt(p.fecha)} · {p.medio || 'Sin medio'}{p.nro_operacion ? ` · Op. ${p.nro_operacion}` : ''}{p.pagado_por ? ` · ${p.pagado_por}` : ''}</span></div>
                      {p.caja_id && <span className="pap-chip pap-chip--azul">En Caja</span>}
                      {p.comprobante && <a className="pap-enlace" href={p.comprobante} target="_blank" rel="noreferrer">Comprobante</a>}
                      {esAdmin && !p.caja_id && <BotonTip tip="Quitar pago" className="pap-icono pap-icono--rojo" onClick={() => { void ejecutar(() => quitarPago(d.id, p.id), 'Pago quitado'); }}><Trash2 size={14} /></BotonTip>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.observaciones && <section className="pap-bloque"><h3 className="pap-titulo">Observaciones</h3><p className="pap-texto">{d.observaciones}</p></section>}

            <section className="pap-bloque"><h3 className="pap-titulo">Historial <em>{d.historial.length}</em></h3>
              <ol className="pap-hist">
                {d.historial.map(h => (
                  <li key={h.id}><span className="pap-hist__punto" aria-hidden /><div><strong>{h.accion}</strong><span>{h.detalle}</span><small>{String(h.created_at).slice(0, 16).replace('T', ' ')} · {h.usuario}</small></div></li>
                ))}
              </ol>
            </section>

            <VisorFotos open={visor !== null} indiceInicial={visor ?? 0} onClose={() => setVisor(null)} titulo={`Evidencias · ${d.codigo}`} fotos={fotos.map((f, i) => ({ url: f.url, titulo: `Evidencia ${i + 1}` }))} />
          </div>
        )}
      </Sheet>

      {/* Descargo */}
      <Sheet open={dialogo === 'descargo'} onClose={() => !ocupado && cerrarDialogo()} title="Registrar descargo"
        footer={<><Button variant="secondary" onClick={cerrarDialogo} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" loading={ocupado} onClick={() => { if (d) void ejecutar(() => registrarDescargo(d.id, { expediente, fecha: fechaDesc, resultado, observacion: obs }), 'Descargo registrado'); }}>Guardar</Button></>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
          <Field label="N° de expediente">{p => <TextInput {...p} value={expediente} onChange={e => setExpediente(e.target.value)} />}</Field>
          <Field label="Fecha del descargo">{p => <TextInput {...p} type="date" max={hoyLima()} value={fechaDesc} onChange={e => setFechaDesc(e.target.value)} />}</Field>
          <Field label="Resultado" wide hint="Fundado: la papeleta queda sin efecto. Infundado: vuelve a pendiente de pago.">
            {() => <SegmentedControl label="Resultado del descargo" block value={resultado} onChange={setResultado} options={[{ value: 'PENDIENTE', label: 'En trámite' }, { value: 'FUNDADO', label: 'Fundado' }, { value: 'INFUNDADO', label: 'Infundado' }]} />}
          </Field>
          <Field label="Observación" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}</Field>
        </div>
      </Sheet>

      {/* Anulación */}
      <Sheet open={dialogo === 'anular'} onClose={() => !ocupado && cerrarDialogo()} title="Anular papeleta"
        footer={<><Button variant="secondary" onClick={cerrarDialogo} disabled={ocupado}>Cancelar</Button>
          <Button variant="destructive" loading={ocupado} onClick={() => { if (d) void ejecutar(() => anularPapeleta(d.id, motivo), 'Papeleta anulada'); }}>Anular</Button></>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
          <Field label="Motivo de la anulación" wide hint="Queda en el historial. Una papeleta anulada no suma a lo que se debe.">{p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Dejada sin efecto por la entidad" />}</Field>
        </div>
      </Sheet>

      {/* Reembolso */}
      <Sheet open={dialogo === 'reembolso'} onClose={() => !ocupado && cerrarDialogo()} title="Reembolso de quien asume"
        footer={<><Button variant="secondary" onClick={cerrarDialogo} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" loading={ocupado} onClick={() => { if (d) void ejecutar(() => registrarReembolso(d.id, { monto: Number(montoReem.replace(',', '.')), fecha: hoyLima() }), 'Reembolso registrado'); }}>Guardar</Button></>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
          <Field label="Monto reembolsado" wide hint="Cuando la empresa ya pagó y quien asume le devuelve el dinero.">{p => <TextInput {...p} inputMode="decimal" value={montoReem} onChange={e => setMontoReem(e.target.value)} />}</Field>
        </div>
      </Sheet>

      <ConfirmSheet open={dialogo === 'eliminar'} onClose={() => !ocupado && cerrarDialogo()} loading={ocupado} title="Eliminar papeleta" confirmLabel="Eliminar"
        message={`Se borra ${d?.codigo ?? 'la papeleta'} con su historial y sus archivos. No se puede deshacer. Si solo quieres dejarla sin efecto, usa «Anular».`}
        onConfirm={() => { if (d) void ejecutar(async () => { await eliminarPapeleta(d.id); onClose(); }, 'Papeleta eliminada'); }} />
    </>
  );
}
