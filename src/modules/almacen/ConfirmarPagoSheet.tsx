import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Paperclip, X } from 'lucide-react';
import { errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { formatMoneda, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { pagarEntrada, useEmpresaCuentas, type EntradaInv } from './api';
import { codigoLimpio, esCredito, esDolares, etiquetaCuentaEmpresa, montoPago } from './entradaReglas';

const MAX_VOUCHER = 25 * 1024 * 1024; // mismo límite que el servidor

interface Errores { cuenta?: string; constancia?: string; monto?: string; voucher?: string; confirmado?: string }

interface Props {
  entrada: EntradaInv | null;
  open: boolean;
  onClose: () => void;
  /** Se llama cuando el pago quedó registrado */
  onPagado: () => void;
}

/**
 * Confirma el pago de una orden aprobada (al contado o a crédito): la orden pasa a Procesada, se registra el egreso
 * en Caja y se sube la constancia. Mismos campos y reglas que Tesorería › Pago de requerimientos.
 * La página lo monta con una key nueva en cada apertura, así empieza limpio.
 */
export function ConfirmarPagoSheet({ entrada: e, open, onClose, onPagado }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const cuentasQ = useEmpresaCuentas();

  const [cuentaSel, setCuentaSel] = useState('');
  const [constancia, setConstancia] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);

  const cuentas = useMemo(() => (cuentasQ.data ?? []).map(c => ({
    label: etiquetaCuentaEmpresa(c),
    numero: String(c.numero_cuenta ?? '').trim(),
    usd: esDolares(c.moneda),
  })), [cuentasQ.data]);

  // Preselección: la cuenta que ya tiene la orden; si no, una de la misma moneda
  useEffect(() => {
    if (!e || cuentaSel || cuentas.length === 0) return;
    const ctaOrden = e.cuenta_bancaria_empresa ?? '';
    const guardada = ctaOrden ? cuentas.find(c => c.label === ctaOrden || (c.numero && ctaOrden.includes(c.numero))) : undefined;
    setCuentaSel((guardada ?? cuentas.find(c => c.usd === esDolares(e.moneda)) ?? cuentas[0]).label);
  }, [e, cuentas, cuentaSel]);

  const cuenta = cuentas.find(c => c.label === cuentaSel) ?? null;
  const enDolares = cuenta ? cuenta.usd : !!e && esDolares(e.moneda);
  const tc = Number(e?.tipo_cambio) || 0;
  const monto = e ? montoPago(Number(e.total_pen) || 0, tc, enDolares) : 0;

  function elegirVoucher(f: File | undefined) {
    if (!f) return;
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      setErrores(x => ({ ...x, voucher: 'Solo imágenes o PDF.' })); haptic('warning'); return;
    }
    if (f.size > MAX_VOUCHER) {
      setErrores(x => ({ ...x, voucher: 'El archivo supera 25 MB.' })); haptic('warning'); return;
    }
    setErrores(x => ({ ...x, voucher: undefined }));
    setVoucher(f);
  }

  async function confirmar() {
    if (!e || guardando) return;
    const nuevos: Errores = {};
    if (!constancia.trim()) nuevos.constancia = 'Ingresa el número de constancia u operación.';
    if (!cuenta) nuevos.cuenta = 'Elige la cuenta de origen de la empresa.';
    if (!(monto > 0)) {
      nuevos.monto = enDolares && tc <= 0
        ? 'La orden no tiene tipo de cambio: no se puede calcular el monto en US$.'
        : 'La orden no tiene total en soles para pagar.';
    }
    if (!confirmado) nuevos.confirmado = 'Marca la casilla para confirmar el pago.';
    setErrores(prev => ({ voucher: prev.voucher, ...nuevos }));
    if (!cuenta || Object.values(nuevos).some(Boolean)) { haptic('warning'); return; }

    const fd = new FormData();
    fd.append('numero_constancia', constancia.trim());
    fd.append('cuenta_origen', cuenta.label);
    fd.append('moneda', enDolares ? 'USD' : 'PEN');
    fd.append('monto', String(monto));
    if (voucher) fd.append('voucher', voucher);

    setGuardando(true);
    try {
      await pagarEntrada(e.id, fd);
      haptic('success');
      toast(`Pago de ${codigoLimpio(e.id)} registrado`);
      await qc.invalidateQueries({ queryKey: ['almacen'] });
      await qc.invalidateQueries({ queryKey: ['tesoreria'] });
      onPagado();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { if (!guardando) onClose(); }}
      title={e ? `Confirmar pago · ${codigoLimpio(e.id)}` : 'Confirmar pago'}
      footer={
        <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={guardando} onClick={confirmar}>Confirmar pago</Button>
        </div>
      }
    >
      {e && (
        <div className="oc-form">
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            {e.proveedor_nombre ?? 'Sin proveedor'} · {esCredito(e.condicion_pago)
              ? `A crédito${e.dias_credito || e.dias_pagar ? ` · ${e.dias_credito || e.dias_pagar} días` : ''}`
              : 'Al contado: se paga antes de recepcionar'}
          </p>

          <div className="oc-total">
            <div className="oc-total__fila">
              <span>Monto a pagar</span>
              <strong className="oc-total__monto">{formatMoneda(monto, enDolares ? 'USD' : 'PEN')}</strong>
            </div>
            <span className="oc-total__equivale">
              {enDolares ? `Total ${formatSoles(Number(e.total_pen) || 0)} ÷ T/C ${tc > 0 ? tc : 'sin T/C'}` : 'Total de la orden en soles'}
            </span>
            {errores.monto && <span className="field__error" role="alert">{errores.monto}</span>}
          </div>

          {cuentasQ.isError ? (
            <Notice tone="error">No se pudieron cargar las cuentas bancarias de la empresa.</Notice>
          ) : !cuentasQ.isLoading && cuentas.length === 0 ? (
            <Notice>No hay cuentas bancarias de la empresa. Regístralas en Tesorería › Bancos.</Notice>
          ) : null}

          <Field label="Cuenta bancaria de origen (empresa)" error={errores.cuenta}>
            {p => (
              <SelectInput {...p} value={cuentaSel} disabled={cuentasQ.isLoading || cuentas.length === 0}
                onChange={ev => { setCuentaSel(ev.target.value); setErrores(x => ({ ...x, cuenta: undefined, monto: undefined })); }}>
                <option value="">{cuentasQ.isLoading ? 'Cargando cuentas…' : 'Elige una cuenta'}</option>
                {cuentas.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
              </SelectInput>
            )}
          </Field>

          <Field label="Cuenta destino (proveedor)">
            {p => <TextInput {...p} readOnly value={e.cuenta_bancaria_proveedor || 'No especificada'} />}
          </Field>

          <Field label="N° de constancia / operación" error={errores.constancia}>
            {p => (
              <TextInput {...p} className="oc-mono" value={constancia} placeholder="Ej. 00482910"
                onChange={ev => { setConstancia(ev.target.value); setErrores(x => ({ ...x, constancia: undefined })); }} />
            )}
          </Field>

          <Field label="Voucher o constancia (opcional)" hint="JPG, PNG o PDF · máximo 25 MB" error={errores.voucher}>
            {p => (
              <ArchivoInput {...p} accept="image/*,application/pdf" onChange={a => elegirVoucher(a ?? undefined)} />
            )}
          </Field>

          {voucher && (
            <div className="oc-adjunto__actual">
              <span className="oc-doc oc-doc--ok"><Paperclip size={13} /> {voucher.name}</span>
              <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar voucher" onClick={() => setVoucher(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={confirmado}
                onChange={ev => { setConfirmado(ev.target.checked); setErrores(x => ({ ...x, confirmado: undefined })); }} />
              <span>Confirmo registrar este pago en Caja. No se puede revertir desde esta pantalla.</span>
            </label>
            {errores.confirmado && <span className="field__error" role="alert">{errores.confirmado}</span>}
          </div>

          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            Al confirmar, la orden pasa a Procesada con esta cuenta y constancia, y el egreso se registra en Caja.
          </p>
        </div>
      )}
    </Sheet>
  );
}
