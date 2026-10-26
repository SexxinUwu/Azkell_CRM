import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Paperclip, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import type { CajaMovimiento } from './api';
import { estadoDe, esEditable, montoCaja, num, numeroDoc, tonoEstado } from './caja-lib';

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
  const [docs, setDocs] = useState(false);
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
    if (ok) setDocs(false);
    else setErrDocs('No se pudieron guardar los documentos. Revisa los archivos e inténtalo de nuevo.');
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <>
      <Sheet open onClose={() => !ocupado && onClose()} title={`Caja ${numeroDoc(m)}`}
        footer={
          <>
            {can('tesoreria_caja.eliminar') && editable && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setBorrando(true)}>Eliminar</Button>}
            {can('gerencia.editar', 'tesoreria_caja.editar') && estado !== 'ANULADO' && estado !== 'PAGADO' &&
              <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setAnulando(true)}>Anular</Button>}
            {can('tesoreria_caja.editar', 'tesoreria_caja.crear') && editable &&
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => { onClose(); onEditar(m); }}>Editar</Button>}
            {can('gerencia.editar', 'tesoreria_caja.editar') && editable &&
              <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={ocupado}
                onClick={() => ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id + '/aprobar', { method: 'POST', body: { usuario_aprobacion: user?.name } })), 'Caja aprobada')}>Aprobar</Button>}
            {(estado === 'APROBADO' || estado === 'PROCESADO' || estado === 'PAGADO') && can('tesoreria_caja.editar', 'tesoreria_caja.crear') &&
              <Button variant="primary" icon={<Upload size={16} />} onClick={() => setDocs(true)}>Subir documentos</Button>}
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica">
              <span className={`inv-metrica__num${ingreso ? '' : ' inv-metrica__num--critical'}`}>{montoCaja(m.importe_total, m.moneda)}</span>
              <span className="inv-metrica__label">{ingreso ? 'Ingreso' : 'Egreso'}</span>
            </div>
            <div className="inv-metrica">
              <span className="inv-metrica__num" style={{ fontSize: '1rem' }}><Badge tone={tonoEstado(estado)}>{estado}</Badge></span>
              <span className="inv-metrica__label">Estado</span>
            </div>
          </div>

          {m.moneda === 'DOLARES' && (
            <p className="t-footnote c-secondary" style={{ margin: 0 }}>
              Equivale a {formatSoles(num(m.importe_total) * (num(m.tipo_cambio) || 1))} con un tipo de cambio de {num(m.tipo_cambio) || 1}.
            </p>
          )}

          <div className="tarjeta__lista">
            {fila('Fecha', `${formatFechaPe(m.fecha)}${m.hora ? ' ' + m.hora.slice(0, 5) : ''}`, true)}
            {fila('Motivo', [m.motivo, m.sub_motivo].filter(Boolean).join(' › '))}
            {fila('Centro de costos', m.centro_costo)}
            {fila('Persona', [m.tipo_persona, m.persona].filter(Boolean).join(' · '))}
            {fila('Autoriza', m.autoriza)}{fila('Orden de viaje', m.orden_viaje, true)}{fila('Conductor', m.conductor)}
            {fila('Ruta', m.ruta_viaje)}{fila('Placa', m.placa, true)}
            {fila('Modalidad de pago', m.modalidad_pago)}
            {fila('Comprobante', [m.tipo_comprobante, m.numero_factura].filter(Boolean).join(' '))}
            {fila('Constancia de depósito', m.numero_constancia_deposito, true)}
            {fila('Cuenta de la persona', m.cuenta_bancaria_persona, true)}
            {fila('Cuenta de la empresa', m.cuenta_bancaria_empresa, true)}
            {fila('Retención / detracción', num(m.retencion_detraccion) ? formatSoles(num(m.retencion_detraccion)) : '')}
            {fila('Liquidación de viaje', m.no_aplica_liquidacion ? 'No aplica' : '')}
            {fila('Descripción', m.descripcion)}
            {fila('Observación', m.observacion)}
            {fila('Motivo de anulación', m.motivo_anulacion)}
            {fila('Registrado por', m.usuario_creacion)}
            {fila('Aprobado por', m.usuario_aprobacion ? `${m.usuario_aprobacion}${m.fecha_aprobacion ? ' · ' + m.fecha_aprobacion : ''}` : '')}
          </div>

          {(m.voucher_url || m.sustento_url) && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {m.voucher_url && <a className="btn btn--secondary btn--sm" href={String(m.voucher_view_url ?? m.voucher_url)} target="_blank" rel="noreferrer"><Paperclip size={14} /> Voucher</a>}
              {m.sustento_url && <a className="btn btn--secondary btn--sm" href={String(m.sustento_view_url ?? m.sustento_url)} target="_blank" rel="noreferrer"><Paperclip size={14} /> Sustento</a>}
            </div>
          )}
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

      <Sheet open={docs} onClose={() => !ocupado && setDocs(false)} title="Subir documentos"
        footer={<><Button variant="secondary" onClick={() => setDocs(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" loading={ocupado} onClick={subirDocs}>Guardar</Button></>}>
        <div className="form-grid">
          {errDocs && <div className="field field--wide"><Notice tone="error">{errDocs}</Notice></div>}
          <Field label="N° de constancia de depósito" wide>
            {p => <TextInput {...p} value={constancia} onChange={e => setConstancia(e.target.value)} />}
          </Field>
          <Field label="Voucher" hint={voucher?.name}>
            {p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setVoucher(e.target.files?.[0] ?? null)} />}
          </Field>
          <Field label="Sustento" hint={sustento?.name}>
            {p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setSustento(e.target.files?.[0] ?? null)} />}
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
