import { useState } from 'react';
import { CircleAlert, Wallet } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { registrarPago, type Papeleta } from './pap-api';

const MEDIOS = ['Transferencia', 'Depósito en cuenta', 'Efectivo', 'Tarjeta', 'Yape / Plin', 'Pago en agencia', 'Otro'];
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());

/** Lo que falta pagar en una fecha: con el descuento vigente ese día, menos lo ya pagado */
export function saldoEnFecha(p: Papeleta, fecha: string): { total: number; saldo: number; conDescuento: boolean } {
  const conDescuento = p.descuento_monto > 0 && !!p.fecha_limite_descuento && fecha <= p.fecha_limite_descuento;
  const total = Math.round((p.monto + p.recargos - (conDescuento ? p.descuento_monto : 0)) * 100) / 100;
  return { total, saldo: Math.max(0, Math.round((total - p.pagado) * 100) / 100), conDescuento };
}

/**
 * Registrar un pago de una papeleta: la fecha define si aplica el descuento y el monto se propone solo (lo que falta).
 * Todo pago lleva su respaldo (comprobante o número de operación) y puede crear su egreso en Caja de Tesorería.
 */
export function PagoSheet({ papeleta, egresoPorDefecto = true, onClose, onHecho }: {
  papeleta: Papeleta | null; egresoPorDefecto?: boolean; onClose: () => void; onHecho: () => unknown;
}) {
  const toast = useToast();
  const [fecha, setFecha] = useState(hoyLima());
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState('Transferencia');
  const [operacion, setOperacion] = useState('');
  const [pagadoPor, setPagadoPor] = useState('');
  const [obs, setObs] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [egreso, setEgreso] = useState(egresoPorDefecto);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abiertaPara, setAbiertaPara] = useState<number | null>(null);

  if (papeleta && abiertaPara !== papeleta.id) {
    setAbiertaPara(papeleta.id);
    const f = hoyLima();
    setFecha(f); setMonto(String(saldoEnFecha(papeleta, f).saldo)); setMedio('Transferencia'); setOperacion('');
    setPagadoPor(papeleta.quien_asume === 'EMPRESA' ? (papeleta.empresa_unidad ?? '') : (papeleta.asume_nombre ?? ''));
    setObs(''); setArchivos([]); setEgreso(egresoPorDefecto); setError(null);
  }
  if (!papeleta && abiertaPara !== null) setAbiertaPara(null);

  const calc = papeleta ? saldoEnFecha(papeleta, fecha) : null;
  const moneda = papeleta?.moneda ?? 'PEN';

  async function guardar() {
    if (!papeleta) return;
    setError(null);
    const m = Number(String(monto).replace(',', '.'));
    if (!(m > 0)) { setError('Indica el monto pagado.'); return; }
    if (!operacion.trim() && archivos.length === 0) { setError('Adjunta el comprobante o escribe el número de operación: todo pago necesita su respaldo.'); haptic('warning'); return; }
    setGuardando(true);
    try {
      const r = await registrarPago(papeleta.id, { fecha, monto: m, medio, nro_operacion: operacion.trim(), pagado_por: pagadoPor.trim(), observacion: obs.trim(), generar_egreso: egreso }, archivos[0] ?? null);
      haptic('success');
      toast(r.completa ? 'Pago registrado: la papeleta quedó pagada' : 'Pago parcial registrado');
      if (r.aviso) toast(r.aviso, 'error');
      await onHecho();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  return (
    <Sheet open={!!papeleta} onClose={() => !guardando && onClose()} title={papeleta ? `Registrar pago · ${papeleta.codigo}` : 'Registrar pago'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" icon={<Wallet size={16} />} onClick={() => { void guardar(); }} loading={guardando}>Registrar pago</Button></>}>
      {papeleta && calc && (
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
          <div className="field field--wide pap-pago-resumen">
            <div><span className="pap-k">Total a pagar</span><strong className="t-numeric">{formatMoneda(calc.total, moneda)}</strong></div>
            <div><span className="pap-k">Ya pagado</span><strong className="t-numeric">{formatMoneda(papeleta.pagado, moneda)}</strong></div>
            <div><span className="pap-k">Falta</span><strong className="t-numeric pap-resalta">{formatMoneda(calc.saldo, moneda)}</strong></div>
            {calc.conDescuento && <span className="pap-chip pap-chip--azul">Con descuento: ahorras {formatMoneda(papeleta.descuento_monto, moneda)}</span>}
            {!calc.conDescuento && papeleta.descuento_monto > 0 && <span className="pap-chip">El descuento ya venció</span>}
          </div>
          <Field label="Fecha del pago">
            {p => <TextInput {...p} type="date" max={hoyLima()} value={fecha} onChange={e => { setFecha(e.target.value); setMonto(String(saldoEnFecha(papeleta, e.target.value).saldo)); }} />}
          </Field>
          <Field label={`Monto pagado (${moneda === 'USD' ? 'US$' : 'S/'})`} hint="Se propone lo que falta; si pagas menos queda como pago parcial">
            {p => <TextInput {...p} inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} />}
          </Field>
          <Field label="Medio de pago">
            {p => <Combobox {...p} value={medio} onChange={v => setMedio(v ?? 'Transferencia')} options={MEDIOS.map(m => ({ value: m, label: m }))} />}
          </Field>
          <Field label="N° de operación">
            {p => <TextInput {...p} value={operacion} onChange={e => setOperacion(e.target.value)} placeholder="Del voucher o recibo" />}
          </Field>
          <Field label="Pagado por" wide>
            {p => <TextInput {...p} value={pagadoPor} onChange={e => setPagadoPor(e.target.value)} placeholder="Empresa o persona que pagó" />}
          </Field>
          <div className="field field--wide">
            <EvidenciasArchivos archivos={archivos} onCambio={setArchivos} max={1} titulo="Comprobante de pago" ayuda="Foto o PDF del voucher, recibo o constancia de pago" />
          </div>
          <Field label="Observación" wide>
            {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}
          </Field>
          <div className="field field--wide pap-interruptor">
            <div><strong>Registrar también como egreso en Caja</strong><span>El pago aparece en los movimientos de Tesorería con su comprobante</span></div>
            <Switch checked={egreso} onChange={setEgreso} label="Registrar egreso en Caja de Tesorería" />
          </div>
        </div>
      )}
    </Sheet>
  );
}
