import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Paperclip, X } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useBancos } from './api';
import { codigoOC, esUSD, importeOC, montoAPagar, redondear2, type OrdenPago } from './pago-datos';

const MAX_VOUCHER = 25 * 1024 * 1024; // mismo límite que el servidor

interface CuentaOrigen { label: string; usd: boolean; numero: string }

interface Errores { constancia?: string; cuenta?: string; monto?: string; voucher?: string; confirmado?: string }

// Etiqueta igual a la del clásico: "BCP - CTA CTE [SOLES] - 191-…". El servidor la usa para la moneda de la caja.
function preseleccion(oc: OrdenPago, cuentas: CuentaOrigen[]): string {
  const ctaEmpresa = oc.cuenta_bancaria_empresa ?? '';
  const guardada = ctaEmpresa
    ? cuentas.find(c => c.label === ctaEmpresa || (c.numero && ctaEmpresa.includes(c.numero)))
    : undefined;
  if (guardada) return guardada.label;
  return (cuentas.find(c => c.usd === esUSD(oc.moneda)) ?? cuentas[0]).label;
}

/**
 * Registra el pago de una OC aprobada: pasa a Procesado, registra el egreso en caja
 * y sube el voucher. El monto sale del total en soles (÷ T.C. si la cuenta es en US$), como en el clásico.
 * Se monta de nuevo en cada apertura (la key la pone la página), así empieza limpio.
 */
export function PagoProcesarSheet({ oc, open, onClose }: { oc: OrdenPago | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const bancos = useBancos();

  const [constancia, setConstancia] = useState('');
  const [cuentaSel, setCuentaSel] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);

  const cuentas = useMemo<CuentaOrigen[]>(() =>
    (bancos.data ?? [])
      .filter(b => !b.estado || String(b.estado).toUpperCase() === 'ACTIVO')
      .map(b => {
        const usd = esUSD(b.moneda ?? 'SOLES');
        const numero = String(b.numero_cuenta ?? '').trim();
        return {
          label: `${b.banco ?? ''} - ${b.tipo_cuenta || 'CTA CTE'} [${usd ? 'DÓLARES' : 'SOLES'}] - ${numero}`,
          usd,
          numero,
        };
      }), [bancos.data]);

  useEffect(() => {
    if (!cuentaSel && oc && cuentas.length) setCuentaSel(preseleccion(oc, cuentas));
  }, [cuentas, cuentaSel, oc]);

  const cuenta = cuentas.find(c => c.label === cuentaSel) ?? null;
  const usd = cuenta ? cuenta.usd : !!oc && esUSD(oc.moneda);
  const monto = oc ? montoAPagar(oc, usd) : 0;
  const tc = Number(oc?.tipo_cambio) || 0;

  const preview = useMemo(() => (voucher && voucher.type.startsWith('image/') ? URL.createObjectURL(voucher) : null), [voucher]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function elegirVoucher(f: File | undefined) {
    if (!f) return;
    const valido = f.type.startsWith('image/') || f.type === 'application/pdf';
    if (!valido) { setErrores(e => ({ ...e, voucher: 'Solo imágenes o PDF.' })); haptic('warning'); return; }
    if (f.size > MAX_VOUCHER) { setErrores(e => ({ ...e, voucher: 'El archivo supera 25 MB.' })); haptic('warning'); return; }
    setErrores(e => ({ ...e, voucher: undefined }));
    setVoucher(f);
  }

  async function confirmar() {
    if (!oc || guardando) return;
    const e: Errores = {};
    if (!constancia.trim()) e.constancia = 'Ingresa el número de constancia u operación.';
    if (!cuenta) e.cuenta = 'Elige la cuenta de origen de la empresa.';
    if (!(monto > 0)) {
      e.monto = usd && tc <= 0
        ? 'La orden no tiene tipo de cambio: no se puede calcular el monto en US$.'
        : 'La orden no tiene total en soles para pagar.';
    }
    if (!confirmado) e.confirmado = 'Marca la casilla para confirmar el pago.';
    setErrores(prev => ({ ...prev, ...e }));
    if (Object.values(e).some(Boolean)) { haptic('warning'); return; }

    const fd = new FormData();
    fd.append('numero_constancia', constancia.trim());
    fd.append('cuenta_origen', cuenta?.label ?? '');
    fd.append('moneda', usd ? 'USD' : 'PEN');
    fd.append('monto', String(redondear2(monto)));
    if (voucher) fd.append('voucher', voucher);

    setGuardando(true);
    try {
      await api(`/tesoreria/pago-requerimientos/${oc.id}/procesar`, { method: 'POST', body: fd });
      haptic('success');
      toast(`Pago de ${codigoOC(oc)} registrado`);
      qc.invalidateQueries({ queryKey: ['tesoreria'] });
      onClose();
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
      title={oc ? `Procesar pago · ${codigoOC(oc)}` : 'Procesar pago'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={guardando} onClick={confirmar}>Confirmar pago</Button>
        </>
      }
    >
      {oc && (
        <div className="pago-proc">
          <div className="tarjeta__lista">
            <div className="dato">
              <span className="dato__label">Proveedor</span>
              <span className="dato__valor">{oc.proveedor_nombre || '—'}</span>
            </div>
            <div className="dato">
              <span className="dato__label">Motivo / centro de costo</span>
              <span className="dato__valor">{[oc.motivo_entrada || oc.motivo, oc.centro_costo].filter(Boolean).join(' · ') || '—'}</span>
            </div>
            <div className="dato">
              <span className="dato__label">Importe de la orden</span>
              <span className="dato__valor dato__valor--mono">{formatMoneda(importeOC(oc), oc.moneda)}</span>
            </div>
          </div>

          <div className="pago-proc__monto">
            <span className="t-footnote c-secondary">Monto a pagar</span>
            <span className="pago-det__total">{formatMoneda(monto, usd ? 'USD' : 'PEN')}</span>
            <span className="t-footnote c-secondary">
              {usd ? `Total en soles ÷ T.C. ${tc > 0 ? tc : 'sin T.C.'}` : 'Total de la orden en soles'}
            </span>
            {errores.monto && <span className="field__error" role="alert">{errores.monto}</span>}
          </div>

          {bancos.isError ? (
            <Notice tone="error">No se pudieron cargar las cuentas bancarias.</Notice>
          ) : !bancos.isLoading && cuentas.length === 0 ? (
            <Notice>No hay cuentas bancarias activas. Regístralas en Tesorería › Bancos.</Notice>
          ) : null}

          <Field label="Cuenta bancaria de origen (empresa)" error={errores.cuenta}>
            {p => (
              <SelectInput {...p} value={cuentaSel} disabled={bancos.isLoading || cuentas.length === 0}
                onChange={e => { setCuentaSel(e.target.value); setErrores(x => ({ ...x, cuenta: undefined, monto: undefined })); }}>
                <option value="">{bancos.isLoading ? 'Cargando cuentas…' : 'Elige una cuenta'}</option>
                {cuentas.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
              </SelectInput>
            )}
          </Field>

          <Field label="N° de constancia / operación" error={errores.constancia}>
            {p => (
              <TextInput {...p} value={constancia} placeholder="Ej. 00482910"
                onChange={e => { setConstancia(e.target.value); setErrores(x => ({ ...x, constancia: undefined })); }} />
            )}
          </Field>

          <Field label="Cuenta destino (proveedor)">
            {p => <TextInput {...p} readOnly value={oc.cuenta_bancaria_proveedor || 'No especificada'} />}
          </Field>

          <Field label="Voucher o constancia (opcional)" hint="JPG, PNG o PDF · máximo 25 MB" error={errores.voucher}>
            {p => <TextInput {...p} type="file" accept="image/*,application/pdf"
              onChange={e => { elegirVoucher(e.target.files?.[0]); e.target.value = ''; }} />}
          </Field>

          {voucher && (
            <div className="pago-proc__voucher">
              {preview
                ? <img className="pago-proc__miniatura" src={preview} alt="" />
                : <span className="pago-proc__miniatura pago-proc__miniatura--pdf"><FileText size={20} /></span>}
              <span className="pago-proc__nombre"><Paperclip size={13} /> {voucher.name}</span>
              <Button variant="plain" size="sm" iconOnly icon={<X size={14} />} aria-label="Quitar voucher" onClick={() => setVoucher(null)} />
            </div>
          )}

          <div>
            <label className="pago-proc__confirmar">
              <input type="checkbox" checked={confirmado}
                onChange={e => { setConfirmado(e.target.checked); setErrores(x => ({ ...x, confirmado: undefined })); }} />
              <span>Confirmo registrar este pago en Caja. No se puede revertir desde esta pantalla.</span>
            </label>
            {errores.confirmado && <span className="field__error" role="alert">{errores.confirmado}</span>}
          </div>

          <p className="t-footnote c-secondary">
            Fecha de la orden: {formatFechaPe(oc.fecha)}. Al confirmar, la orden pasa a Procesado con esta cuenta y constancia.
          </p>
        </div>
      )}
    </Sheet>
  );
}
