import { useEffect, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Paperclip } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import type { CuentaPorCobrar } from './api';
import { decimal, estadoDe, hoyIso, isoDe, num, soles, verUrl } from './cuentas-util';

// Registrar el depósito: neto cobrado, fecha y constancia. Pasa la cuenta a PAGADO (también sirve para
// corregir un pago o subir la constancia después).
// POST /api/tesoreria/cuentas/:id/registrar-pago (multipart)
export function PagoCuenta({ cuenta, usuario, onClose }: { cuenta: CuentaPorCobrar | null; usuario: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<{ monto?: string; fecha?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cuenta) return;
    const previo = cuenta.neto_cobrado ?? cuenta.neto_cobrar;
    setMonto(previo == null ? '' : num(previo).toFixed(2));
    setFecha(isoDe(cuenta.fecha_deposito) || hoyIso());
    setArchivo(null); setErrores({}); setError(null);
  }, [cuenta]);

  const porCobrar = num(cuenta?.neto_cobrar);
  const diferencia = decimal(monto) - porCobrar;
  const yaPagada = !!cuenta && estadoDe(cuenta) === 'PAGADO';
  const constanciaActual = cuenta ? verUrl(cuenta, 'sustento_pago') : null;

  async function guardar() {
    if (!cuenta) return;
    const v = decimal(monto);
    const e: typeof errores = {};
    if (!(v > 0)) e.monto = 'Indica el monto cobrado.';
    if (!fecha) e.fecha = 'Indica la fecha de depósito.';
    setErrores(e);
    if (Object.keys(e).length) { haptic('warning'); return; }

    const f = new FormData();
    f.append('neto_cobrado', String(v));
    f.append('fecha_deposito', fecha);
    f.append('usuario', usuario);
    if (archivo) f.append('archivo_sustento', archivo);

    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/cuentas/${cuenta.id}/registrar-pago`, { method: 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar el pago');
      haptic('success');
      toast(yaPagada ? 'Pago actualizado' : 'Pago registrado: la cuenta quedó PAGADA');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={!!cuenta} onClose={() => !enviando && onClose()} title={yaPagada ? 'Corregir pago y constancia' : 'Registrar pago'}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{yaPagada ? 'Guardar pago' : 'Marcar como pagado'}</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Neto por cobrar (facturado)">
          {p => <TextInput {...p} value={soles(porCobrar)} readOnly tabIndex={-1} />}
        </Field>
        <Field label="Fecha de vencimiento">
          {p => <TextInput {...p} value={formatFechaPe(cuenta?.fecha_cobrar)} readOnly tabIndex={-1} />}
        </Field>

        <Field label="Neto cobrado (S/)" error={errores.monto} hint="Lo que realmente entró al banco">
          {p => <TextInput {...p} type="number" step="0.01" inputMode="decimal" value={monto} autoFocus
            onChange={e => { setMonto(e.target.value); setErrores(x => ({ ...x, monto: undefined })); }} />}
        </Field>
        <Field label="Fecha de depósito" error={errores.fecha}>
          {p => <TextInput {...p} type="date" value={fecha} onChange={e => { setFecha(e.target.value); setErrores(x => ({ ...x, fecha: undefined })); }} />}
        </Field>

        {cuenta && monto !== '' && (
          <div className="field field--wide">
            <Notice tone={diferencia < -0.005 ? 'error' : diferencia > 0.005 ? 'accent' : 'success'}>
              {Math.abs(diferencia) < 0.005
                ? 'Cobro exacto: no hay diferencia.'
                : `Diferencia ${diferencia > 0 ? 'a favor' : 'en contra'}: ${formatSoles(diferencia)}`}
            </Notice>
          </div>
        )}

        <Field label="Constancia o voucher (PDF o imagen)" wide hint={archivo?.name ?? (constanciaActual ? undefined : 'Opcional')}>
          {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={setArchivo} />}
        </Field>
        {constanciaActual && !archivo && (
          <div className="field field--wide">
            <a className="btn btn--secondary btn--sm" href={constanciaActual} target="_blank" rel="noreferrer" >
              <Paperclip size={14} /> Ver constancia actual
            </a>
          </div>
        )}
      </div>
    </Sheet>
  );
}
