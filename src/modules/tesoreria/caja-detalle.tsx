import { useEffect, useState, type ReactNode } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import '../../core/ui/acciones-iconos.css';
import '../almacen/entradas.css';
import { Ban, Check, CheckCircle2, CreditCard, FileCheck, Shield, Trash2, Upload, X } from 'lucide-react';
import { Pencil } from '../../core/ui/IconosArchivo';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatFechaHoraPe, formatFechaPe, formatSoles } from '../../core/lib/format';
import { Dato, Grupo, LineaDeVida, type EstadoPaso } from '../almacen/EntradaDetalle';
import { numeroALetras } from '../almacen/entradaReglas';
import type { CajaMovimiento } from './api';
import { estadoDe, esEditable, montoCaja, num, numeroDoc } from './caja-lib';

interface Props {
  mov: CajaMovimiento | null;
  onClose: () => void;
  onEditar: (m: CajaMovimiento) => void;
  onCambio: () => Promise<unknown>;
}

/** Respuesta de escritura de tesorería: { ok:false, error } se convierte en excepción */
const comprobar = (r: { ok?: boolean; error?: string }) => {
  if (r.ok === false) throw new Error(r.error || 'No se pudo completar');
};

export function DetalleCaja({ mov: m, onClose, onEditar, onCambio }: Props) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errMotivo, setErrMotivo] = useState<string | undefined>();
  const [borrando, setBorrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [voucher, setVoucher] = useState<File | null>(null);
  const [sustento, setSustento] = useState<File | null>(null);
  const [constancia, setConstancia] = useState('');
  const [errDocs, setErrDocs] = useState<string | undefined>();

  useEffect(() => {
    setMotivo(''); setErrMotivo(undefined); setVoucher(null); setSustento(null); setConstancia(''); setErrDocs(undefined);
  }, [m?.id]);

  if (!m) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;

  const estado = estadoDe(m);
  const editable = esEditable(m);
  const ingreso = m.tipo_movimiento === 'INGRESO';

  /** Devuelve true si la operación salió bien (para cerrar la hoja solo entonces) */
  async function ejecutar(fn: () => Promise<unknown>, ok: string, cerrar = false): Promise<boolean> {
    setOcupado(true);
    try {
      await fn();
      haptic('success'); toast(ok);
      await onCambio();
      if (cerrar) onClose();
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error'); haptic('warning');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function anular() {
    if (!motivo.trim()) { setErrMotivo('Escribe el motivo de la anulación.'); haptic('warning'); return; }
    const ok = await ejecutar(
      async () => comprobar(await api('/tesoreria/caja/' + m!.id + '/anular', { method: 'POST', body: { motivo: motivo.trim(), usuario_anulacion: user?.name } })),
      'Caja anulada',
    );
    if (ok) setAnulando(false);
  }

  async function subirDocs() {
    setErrDocs(undefined);
    const f = new FormData();
    if (voucher) f.append('voucher', voucher);
    if (sustento) f.append('sustento', sustento);
    f.append('numero_constancia_deposito', constancia.trim());
    const ok = await ejecutar(
      async () => comprobar(await api('/tesoreria/caja/' + m!.id + '/subir-documentos', { method: 'POST', body: f })),
      'Documentos guardados',
    );
    if (ok) setSubiendo(false);
    else setErrDocs('No se pudieron guardar los documentos. Revisa los archivos e inténtalo de nuevo.');
  }

  const aprobada = ['APROBADO', 'PROCESADO', 'PAGADO'].includes(estado);
  const pagada = estado === 'PROCESADO' || estado === 'PAGADO';
  const anulada = estado === 'ANULADO';
  const dolares = m.moneda === 'DOLARES';
  const monto = num(m.importe_total);
  const tc = num(m.tipo_cambio) || 1;
  const puedeAprobar = can('gerencia_aprobaciones_caja.aprobar', 'tesoreria_caja.editar') && editable;
  const puedeAnular = can('gerencia_aprobaciones_caja.aprobar', 'tesoreria_caja.editar') && !anulada && estado !== 'PAGADO';
  const sustentoUrl = String(m.sustento_view_url ?? m.sustento_url ?? '');
  const voucherUrl = String(m.voucher_view_url ?? m.voucher_url ?? '');
  const fechaCorta = (v: string | null | undefined) => (v ? formatFechaPe(String(v).split(/[T ]/)[0]) : '—');

  let banner: { tono: string; titulo: string; texto: string };
  if (anulada) banner = { tono: 'oc-banner--rojo', titulo: 'ANULADA', texto: m.motivo_anulacion ? `Motivo: ${m.motivo_anulacion}` : 'El movimiento fue anulado y no cuenta en el saldo.' };
  else if (pagada) banner = { tono: 'oc-banner--verde', titulo: 'PROCESADA', texto: 'El movimiento ya fue pagado por Tesorería.' };
  else if (aprobada) banner = { tono: 'oc-banner--ambar', titulo: 'APROBADA · PAGO PENDIENTE', texto: 'Aprobada por Gerencia. Tesorería puede registrar el pago y subir el voucher.' };
  else banner = { tono: 'oc-banner--gris', titulo: 'POR APROBAR', texto: 'En espera de aprobación de Gerencia.' };

  const docsOk = !!(sustentoUrl || voucherUrl);
  const pasos: Array<{ titulo: string; texto: string; estado: EstadoPaso; icono: ReactNode }> = [
    { titulo: 'Registro', texto: fechaCorta(m.fecha), estado: 'hecho', icono: <Check size={16} strokeWidth={2.4} /> },
    { titulo: 'Aprobación', texto: m.usuario_aprobacion || '—', estado: anulada ? 'rojo' : aprobada ? 'hecho' : 'actual', icono: anulada ? <X size={16} /> : <Shield size={16} /> },
    { titulo: 'Pago', texto: pagada ? 'Pago registrado' : aprobada ? 'Pendiente' : 'Tras la aprobación', estado: pagada ? 'hecho' : aprobada && !anulada ? 'actual' : 'pendiente', icono: <CreditCard size={16} /> },
    { titulo: 'Documentos', texto: docsOk ? 'Adjuntados' : 'Sin adjuntos', estado: docsOk ? 'hecho' : 'pendiente', icono: <FileCheck size={16} /> },
  ];
  const avance = pasos.reduce((a, p) => a + (p.estado === 'hecho' ? 1 : p.estado === 'actual' ? 0.5 : 0), 0);
  const fraccion = Math.min(1, Math.max(0, avance / (pasos.length - 1)));
  const docs = [{ etiqueta: 'Sustento', url: sustentoUrl }, { etiqueta: 'Voucher de pago', url: voucherUrl }];
  const comprobante = [m.tipo_comprobante, m.numero_factura].filter(Boolean).join(' ');

  const icono = (texto: string, icon: ReactNode, onClick: () => void, extra = '') => (
    <button type="button" className={`btn btn--secondary btn--icon oc-acciones__boton${extra}`} data-tip={texto} aria-label={texto} onClick={onClick} disabled={ocupado}>{icon}</button>
  );

  return (
    <>
      <Sheet open onClose={() => !ocupado && onClose()} title={`Caja ${numeroDoc(m)}`} ancho ligera>
        <div className="oc-ficha">
          <header className="oc-hero">
            <div className="oc-hero__izq">
              <span className="oc-hero__id">{ingreso ? 'Ingreso' : 'Egreso'} de caja N° {numeroDoc(m)}</span>
              <h2 className="oc-hero__titulo">{m.persona || m.conductor || m.sub_motivo || m.motivo || 'Movimiento de caja'}</h2>
              <span className={`badge ${anulada ? 'badge--red' : pagada ? 'oc-estado--verde' : aprobada ? 'oc-estado--azul' : 'badge--amber'}`}>{estado}</span>
            </div>
          </header>

          <div className="oc-acciones oc-acciones--sinfondo">
            {puedeAprobar && icono('Aprobar caja', <CheckCircle2 size={17} />, () => { void ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id + '/aprobar', { method: 'POST', body: { usuario_aprobacion: user?.name } })), 'Caja aprobada'); }, ' oc-acciones__boton--verde')}
            {can('tesoreria_caja.editar', 'tesoreria_caja.crear') && editable && icono('Editar', <Pencil size={17} />, () => { onClose(); onEditar(m); })}
            {aprobada && !anulada && can('tesoreria_caja.editar', 'tesoreria_caja.crear') && icono('Subir documentos', <Upload size={17} />, () => setSubiendo(true), ' oc-acciones__boton--violeta')}
            {puedeAnular && icono('Anular caja', <Ban size={17} />, () => setAnulando(true), ' oc-acciones__boton--peligro')}
            {can('tesoreria_caja.eliminar') && editable && icono('Eliminar', <Trash2 size={17} />, () => setBorrando(true), ' oc-acciones__boton--peligro')}
          </div>

          <div className={`oc-banner ${banner.tono}`} role="status">
            <strong>{banner.titulo}</strong>
            <span>{banner.texto}</span>
          </div>

          <LineaDeVida pasos={pasos} fraccion={fraccion} />

          <div className="oc-datos">
            <Grupo titulo="Beneficiario">
              <Dato etiqueta="Persona" valor={m.persona || m.conductor || '—'} extra={m.tipo_persona || undefined} />
              <Dato etiqueta="Autoriza" valor={m.autoriza || '—'} />
              <Dato etiqueta="Cuenta destino" valor={m.cuenta_bancaria_persona || 'No registrada'} ancho />
            </Grupo>
            <Grupo titulo="Asignación operativa">
              <Dato etiqueta="Placa" valor={m.placa || '—'} />
              <Dato etiqueta="Orden de viaje" valor={m.orden_viaje || '—'} />
              <Dato etiqueta="Centro de costos" valor={m.centro_costo || 'General'} />
              <Dato etiqueta="Conductor" valor={m.conductor || '—'} />
              <Dato etiqueta="Ruta" valor={m.ruta_viaje || '—'} ancho />
            </Grupo>
            <Grupo titulo="Pago">
              <Dato etiqueta="Modalidad" valor={m.modalidad_pago || '—'} />
              <Dato etiqueta="Moneda" valor={dolares ? `Dólares (T/C ${tc})` : 'Soles'} />
              <Dato etiqueta="Comprobante" valor={comprobante || 'Sin comprobante'} />
              <Dato etiqueta="Constancia de depósito" valor={m.numero_constancia_deposito || '—'} />
              <Dato etiqueta="Cuenta origen (empresa)" valor={m.cuenta_bancaria_empresa || 'Por definir'} ancho />
              {num(m.retencion_detraccion) > 0 && <Dato etiqueta="Retención / detracción" valor={formatSoles(num(m.retencion_detraccion))} />}
              {m.no_aplica_liquidacion ? <Dato etiqueta="Liquidación de viaje" valor="No aplica" /> : null}
            </Grupo>
            <Grupo titulo="Auditoría">
              <Dato etiqueta="Registrado por" valor={m.usuario_creacion || 'Sistema'} extra={`${fechaCorta(m.fecha)}${m.hora ? ' ' + m.hora.slice(0, 5) : ''}`} />
              <Dato etiqueta="Aprobado por" valor={m.usuario_aprobacion || 'En espera'} extra={m.fecha_aprobacion ? formatFechaHoraPe(m.fecha_aprobacion) : undefined} />
            </Grupo>
            <Grupo titulo="Concepto del egreso" ancho>
              <Dato etiqueta="Motivo" valor={m.motivo || '—'} />
              <Dato etiqueta="Submotivo" valor={m.sub_motivo || '—'} />
              <Dato etiqueta="Descripción" valor={m.descripcion || 'Sin descripción adicional'} ancho />
            </Grupo>
          </div>

          <div>
            <p className="oc-seccion">Documentos</p>
            <div className="oc-docs">
              {docs.map(d => d.url
                ? <a key={d.etiqueta} className="oc-doc oc-doc--ok" href={d.url} target="_blank" rel="noreferrer">{d.etiqueta}</a>
                : <span key={d.etiqueta} className="oc-doc oc-doc--falta">Sin {d.etiqueta.toLowerCase()}</span>)}
            </div>
          </div>

          {m.observacion && (
            <div className="oc-bloque">
              <p className="oc-seccion">Observaciones</p>
              <p className="oc-texto">{m.observacion}</p>
            </div>
          )}

          <div className="oc-total">
            <span className="oc-total__son">SON: {numeroALetras(monto)} {dolares ? 'DÓLARES AMERICANOS' : 'SOLES'}</span>
            <div className="oc-total__fila">
              <span>{ingreso ? 'Total ingreso' : 'Total egreso'}</span>
              <strong className="oc-total__monto">{montoCaja(m.importe_total, m.moneda)}</strong>
            </div>
            {dolares && <span className="oc-total__equivale">Equivale a {formatSoles(monto * tc)} (T/C {tc})</span>}
          </div>
        </div>
      </Sheet>

      <Sheet open={anulando} onClose={() => !ocupado && setAnulando(false)} title="Anular caja"
        footer={<><Button variant="secondary" onClick={() => setAnulando(false)} disabled={ocupado}>Volver</Button>
          <Button variant="destructive" loading={ocupado} onClick={anular}>Anular</Button></>}>
        <div className="form-grid">
          <Field label="Motivo de la anulación" wide error={errMotivo}>
            {p => <TextInput {...p} value={motivo} onChange={e => { setMotivo(e.target.value); setErrMotivo(undefined); }} autoFocus />}
          </Field>
        </div>
      </Sheet>

      <Sheet open={subiendo} onClose={() => !ocupado && setSubiendo(false)} title="Subir documentos"
        footer={<><Button variant="secondary" onClick={() => setSubiendo(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" loading={ocupado} onClick={subirDocs}>Guardar</Button></>}>
        <div className="form-grid">
          {errDocs && <div className="field field--wide"><Notice tone="error">{errDocs}</Notice></div>}
          <Field label="N° de constancia de depósito" wide>
            {p => <TextInput {...p} value={constancia} onChange={e => setConstancia(e.target.value)} />}
          </Field>
          <Field label="Voucher" hint={voucher?.name}>
            {p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setVoucher} />}
          </Field>
          <Field label="Sustento" hint={sustento?.name}>
            {p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setSustento} />}
          </Field>
        </div>
      </Sheet>

      <ConfirmSheet open={borrando} onClose={() => !ocupado && setBorrando(false)} loading={ocupado}
        title="¿Eliminar este movimiento?" message="Solo se puede eliminar antes de aprobarlo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const ok = await ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id, { method: 'DELETE' })), 'Movimiento eliminado', true);
          if (ok) setBorrando(false);
        }} />
    </>
  );
}
