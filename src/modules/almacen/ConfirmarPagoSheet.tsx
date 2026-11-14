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
import { pagarEntrada, useCuentasProveedor, useEmpresaCuentas, type EntradaInv } from './api';
import { AplicarNotasCredito, type AplicacionElegida } from '../tesoreria/AplicarNotasCredito';
import { codigoLimpio, esCredito, esDolares, etiquetaCuentaEmpresa, etiquetaCuentaProveedor, montoPago } from './entradaReglas';

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
  // Notas de crédito del proveedor aplicadas a este pago (si las hay)
  const [ncs, setNcs] = useState<AplicacionElegida[]>([]);
  const [netoNc, setNetoNc] = useState<number | null>(null);
  // Cuenta del proveedor a la que se paga (de las registradas) y, si la orden es en dólares y se paga en soles, el tipo de cambio del pago
  const [destinoSel, setDestinoSel] = useState('');
  const [tcPago, setTcPago] = useState('');
  const ctasProv = useCuentasProveedor(e?.proveedor_id ? String(e.proveedor_id) : null, !!e);
  const destinos = useMemo(() => (ctasProv.data ?? []).map(c => ({ label: etiquetaCuentaProveedor(c), usd: esDolares(c.moneda) })), [ctasProv.data]);
  useEffect(() => {
    if (!e || destinoSel || destinos.length === 0) return;
    const guardada = e.cuenta_bancaria_proveedor ?? '';
    setDestinoSel((destinos.find(d => d.label === guardada) ?? destinos.find(d => guardada && guardada.includes(d.label.split(' - ').pop() ?? '#')) ?? destinos[0]).label);
  }, [e, destinos, destinoSel]);

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
  const mixto = !!e && esDolares(e.moneda) && !enDolares;
  const tcPagoNum = Number(tcPago.replace(',', '.')) || 0;
  const importe = e ? (mixto ? montoPago(Number(e.total_pen) || 0, tc, true) : montoPago(Number(e.total_pen) || 0, tc, enDolares)) : 0;
  // Lo que sale del banco: el importe menos las notas de crédito aplicadas (en pago mixto: neto en US$ × tipo de cambio del pago)
  const neto = ncs.length && netoNc != null ? netoNc : importe;
  const monto = mixto ? Math.round(neto * (tcPagoNum || tc) * 100) / 100 : neto;
  const difCambio = mixto ? Math.round(neto * ((tcPagoNum || tc) - tc) * 100) / 100 : 0;
  const destino = destinos.find(d => d.label === destinoSel) ?? null;
  const destinoUsd = destino ? destino.usd : null;

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
    const totalmenteCompensada = ncs.length > 0 && monto <= 0;
    if (!constancia.trim() && !totalmenteCompensada) nuevos.constancia = 'Ingresa el número de constancia u operación.';
    if (!cuenta) nuevos.cuenta = 'Elige la cuenta de origen de la empresa.';
    if (mixto && tcPago.trim() && !(tcPagoNum >= 1 && tcPagoNum <= 20)) nuevos.monto = 'El tipo de cambio del pago no parece válido (soles por dólar).';
    if (!(importe > 0)) {
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
    if (mixto) fd.append('tipo_cambio_pago', String(tcPagoNum || tc));
    if (destinoSel) fd.append('cuenta_destino', destinoSel);
    fd.append('monto', String(monto));
    if (ncs.length) fd.append('nc_aplicaciones', JSON.stringify(ncs.map(a => ({ nc_id: a.nc_id, monto: a.monto }))));
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
              {mixto ? `${formatMoneda(neto, 'USD')} × T/C ${tcPagoNum || tc}${difCambio ? ` · diferencia de cambio ${formatSoles(difCambio)}` : ''}` : enDolares ? `Total ${formatSoles(Number(e.total_pen) || 0)} ÷ T/C ${tc > 0 ? tc : 'sin T/C'}` : 'Total de la orden en soles'}
            </span>
            {errores.monto && <span className="field__error" role="alert">{errores.monto}</span>}
          </div>

          <AplicarNotasCredito entradaId={e.id} sugeridas={(() => { try { const x = JSON.parse(e.nc_sugeridas || '[]'); return Array.isArray(x) ? x.map(Number) : []; } catch { return []; } })()} moneda={enDolares || mixto ? 'USD' : 'PEN'} importe={importe} onChange={(a, n) => { setNcs(a); setNetoNc(n); }} />

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

          {mixto && (
            <Field label="Tipo de cambio del pago (S/ por US$)" hint={`La orden está en dólares y la cuenta de origen es en soles: escribe el tipo de cambio del día o el acordado con el proveedor. Si lo dejas vacío se usa el de la orden (${tc}).`}>
              {p => <TextInput {...p} inputMode="decimal" value={tcPago} placeholder={String(tc)} onChange={ev => { setTcPago(ev.target.value); setErrores(x => ({ ...x, monto: undefined })); }} />}
            </Field>
          )}

          <Field label="Cuenta destino (proveedor)" hint={destinos.length === 0 && !ctasProv.isLoading ? 'El proveedor no tiene cuentas registradas: agrégalas en Almacén › Proveedores.' : undefined}>
            {p => destinos.length > 0 ? (
              <SelectInput {...p} value={destinoSel} onChange={ev => setDestinoSel(ev.target.value)}>
                {destinos.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
              </SelectInput>
            ) : <TextInput {...p} readOnly value={ctasProv.isLoading ? 'Cargando cuentas…' : (e.cuenta_bancaria_proveedor || 'No especificada')} />}
          </Field>
          {destinoUsd != null && cuenta && destinoUsd !== cuenta.usd && (
            <Notice tone="accent">Pagas desde una cuenta {cuenta.usd ? 'en dólares' : 'en soles'} a una cuenta {destinoUsd ? 'en dólares' : 'en soles'} del proveedor: el banco convertirá con su propio tipo de cambio. Si el proveedor quiere soles, registra y elige su cuenta en soles.</Notice>
          )}

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
