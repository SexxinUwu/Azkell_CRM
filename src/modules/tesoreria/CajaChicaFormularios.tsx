import { useEffect, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { Field, TextInput } from '../../core/ui/Field';
import { decimalInput, parseDecimal } from '../../core/ui/forms';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useBancos, useCentrosCostos, useMotivosGastos } from './api';
import { enviarChica, numero, useOcsChica, useRefrescarChica, type FondoChica } from './cajaChicaApi';

/** Fecha de hoy en hora local, AAAA-MM-DD */
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

interface PropsFormulario {
  open: boolean;
  onClose: () => void;
}

// ── Asignación de una caja chica (Tesorería la crea; Tesorería y Gerencia la aprueban) ──
export function AsignarCajaChicaSheet({ open, onClose }: PropsFormulario) {
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const bancos = useBancos();
  const [responsable, setResponsable] = useState('');
  const [moneda, setMoneda] = useState<'SOLES' | 'DOLARES'>('SOLES');
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResponsable(''); setMoneda('SOLES'); setMonto(''); setCuenta(null); setDescripcion(''); setError(null);
  }, [open]);

  const opcionesCuentas: ComboboxOption[] = (bancos.data ?? [])
    .filter(b => b.estado !== 'INACTIVO')
    .map(b => ({ value: `${b.banco} - ${b.numero_cuenta} (${b.moneda})`, label: `${b.banco} - ${b.numero_cuenta}`, description: b.moneda ?? undefined }));

  async function guardar() {
    setError(null);
    const importe = parseDecimal(monto);
    if (!responsable.trim()) return setError('Indica el responsable de la caja chica.');
    if (!importe || importe <= 0) return setError('Indica el monto de la asignación.');
    if (!cuenta) return setError('Elige de qué cuenta de la empresa sale el dinero.');
    setEnviando(true);
    try {
      await enviarChica('/fondos', { responsable: responsable.trim(), moneda, monto: importe, cuenta_origen: cuenta, descripcion: descripcion.trim() });
      haptic('success');
      toast('Asignación creada: falta la aprobación de Tesorería y Gerencia');
      refrescar();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Asignar caja chica"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Crear asignación</Button>
      </>}>
      <div className="cf">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="cf-grid">
          <Field label="Responsable" wide>
            {p => <TextInput {...p} value={responsable} placeholder="Nombre de quien maneja el fondo" onChange={e => setResponsable(e.target.value)} />}
          </Field>
          <Field label="Moneda" wide>
            {() => <SegmentedControl block label="Moneda" value={moneda} onChange={setMoneda}
              options={[{ value: 'SOLES', label: 'Soles (S/)' }, { value: 'DOLARES', label: 'Dólares (US$)' }]} />}
          </Field>
          <Field label="Monto del fondo">
            {p => <TextInput {...p} inputMode="decimal" value={monto} placeholder="0.00" onChange={e => setMonto(decimalInput(e.target.value))} />}
          </Field>
          <Field label="Cuenta de la empresa">
            {p => <Combobox {...p} options={opcionesCuentas} value={cuenta} placeholder="Elige la cuenta" onChange={setCuenta} />}
          </Field>
          <Field label="Descripción" wide>
            {p => <TextInput {...p} value={descripcion} placeholder="Ej: Fondo para compras menores de almacén" onChange={e => setDescripcion(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

// ── Gasto desde la caja chica: sin OC (gasto menor) o pagando una OC (total o parcial) ──
export function GastoChicaSheet({ open, fondo, onClose }: PropsFormulario & { fondo: FondoChica | null }) {
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const motivos = useMotivosGastos();
  const centros = useCentrosCostos();
  const ocs = useOcsChica(fondo?.id ?? null);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [descripcion, setDescripcion] = useState('');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [subMotivo, setSubMotivo] = useState<string | null>(null);
  const [centro, setCentro] = useState<string | null>(null);
  const [placa, setPlaca] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [oc, setOc] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [sesion, setSesion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const moneda = fondo?.moneda === 'DOLARES' ? 'US$' : 'S/';

  useEffect(() => {
    if (!open) return;
    setMonto(''); setFecha(hoyLocal()); setDescripcion(''); setMotivo(null); setSubMotivo(null); setCentro(null);
    setPlaca(''); setProveedor(''); setOc(null); setComprobante(null); setError(null); setSesion(s => s + 1);
  }, [open]);

  const motivosActivos = (motivos.data ?? []).filter(m => m.estado === 'ACTIVO');
  const motivoOpciones: ComboboxOption[] = [...new Set(motivosActivos.map(m => m.motivo))].map(m => ({ value: m, label: m }));
  const subOpciones: ComboboxOption[] = [...new Set(motivosActivos.filter(m => m.motivo === motivo).map(m => m.sub_motivo))]
    .map(s => ({ value: s, label: s }));
  const centroOpciones: ComboboxOption[] = (centros.data ?? []).filter(c => c.estado === 'ACTIVO')
    .map(c => ({ value: c.codigo, label: `${c.codigo} · ${c.nombre}` }));
  const ocOpciones: ComboboxOption[] = (ocs.data ?? []).map(o => ({
    value: o.id,
    label: `${o.id} · ${o.proveedor ?? 'Sin proveedor'}`,
    description: `Pendiente ${o.moneda === 'USD' ? 'US$' : 'S/'} ${numero(o.pendiente).toFixed(2)}${o.documento ? ` · ${o.documento}` : ''}`,
  }));

  function elegirOc(id: string | null) {
    setOc(id);
    const o = (ocs.data ?? []).find(x => x.id === id);
    if (o) {
      setMonto(numero(o.pendiente).toFixed(2));
      setProveedor(o.proveedor ?? '');
      if (!descripcion.trim()) setDescripcion(`Pago de la orden ${o.id}`);
    }
  }

  async function guardar() {
    setError(null);
    const importe = parseDecimal(monto);
    if (!importe || importe <= 0) return setError('Indica el monto del gasto.');
    if (!descripcion.trim()) return setError('Describe el gasto.');
    if (!motivo) return setError('Elige el motivo del gasto.');
    setEnviando(true);
    try {
      const datos = new FormData();
      datos.append('monto', String(importe));
      datos.append('fecha', fecha);
      datos.append('descripcion', descripcion.trim());
      datos.append('motivo', motivo);
      datos.append('sub_motivo', subMotivo ?? '');
      datos.append('centro_costo', centro ?? '');
      datos.append('placa', placa.trim());
      datos.append('proveedor', proveedor.trim());
      datos.append('oc_id', oc ?? '');
      if (comprobante) datos.append('comprobante', comprobante);
      const r = await enviarChica(`/fondos/${fondo?.id}/gastos`, datos);
      haptic('success');
      toast(comprobante ? 'Gasto registrado con sustento' : 'Gasto registrado: tienes 3 días hábiles para subir el sustento');
      refrescar();
      if (r) onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Gasto de ${fondo?.responsable ?? 'caja chica'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Registrar gasto</Button>
      </>}>
      <div className="cf">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="cf-grid">
          <Field label="Pagar una orden de compra (opcional)" wide hint="Si eliges una OC, el monto se llena con lo que falta pagar">
            {p => <Combobox {...p} options={ocOpciones} value={oc} placeholder="Busca la orden" onChange={elegirOc} />}
          </Field>
          <Field label={`Monto (${moneda})`}>
            {p => <TextInput {...p} inputMode="decimal" value={monto} placeholder="0.00" onChange={e => setMonto(decimalInput(e.target.value))} />}
          </Field>
          <Field label="Fecha">
            {p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}
          </Field>
          <Field label="Descripción" wide>
            {p => <TextInput {...p} value={descripcion} placeholder="Qué se pagó" onChange={e => setDescripcion(e.target.value)} />}
          </Field>
          <Field label="Motivo">
            {p => <Combobox {...p} options={motivoOpciones} value={motivo} placeholder="Elige el motivo"
              onChange={m => { setMotivo(m); setSubMotivo(null); }} />}
          </Field>
          <Field label="Sub motivo">
            {p => <Combobox {...p} options={subOpciones} value={subMotivo} placeholder="Elige el sub motivo" onChange={setSubMotivo} />}
          </Field>
          <Field label="Centro de costos">
            {p => <Combobox {...p} options={centroOpciones} value={centro} placeholder="Elige el centro" onChange={setCentro} />}
          </Field>
          <Field label="Proveedor o beneficiario">
            {p => <TextInput {...p} value={proveedor} onChange={e => setProveedor(e.target.value)} />}
          </Field>
          <Field label="Placa (si aplica)">
            {p => <TextInput {...p} value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Voucher o constancia de pago" wide hint="Puedes subirlo después, dentro de 3 días hábiles">
            {p => <ArchivoInput {...p} key={`c-${sesion}`} accept="image/*,application/pdf" onChange={setComprobante} />}
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

// ── Sustento de un gasto ya registrado ──
export function SustentoChicaSheet({ open, movId, onClose }: PropsFormulario & { movId: number | null }) {
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (open) { setArchivo(null); setError(null); } }, [open]);

  async function guardar() {
    if (!archivo || movId == null) return setError('Adjunta el voucher o la constancia de pago.');
    setEnviando(true);
    try {
      const datos = new FormData();
      datos.append('comprobante', archivo);
      await enviarChica(`/movimientos/${movId}/sustento`, datos);
      haptic('success');
      toast('Sustento guardado');
      refrescar();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Subir sustento"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar sustento</Button>
      </>}>
      <div className="cf">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Voucher o constancia de pago">
          {p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setArchivo} />}
        </Field>
      </div>
    </Sheet>
  );
}

// ── Pedir la reposición de un fondo: reúne los gastos sustentados y aprobados ──
export function ReposicionChicaSheet({ open, fondo, onClose }: PropsFormulario & { fondo: FondoChica | null }) {
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const bancos = useBancos();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (open) { setCuenta(null); setError(null); } }, [open]);

  const opcionesCuentas: ComboboxOption[] = (bancos.data ?? []).filter(b => b.estado !== 'INACTIVO')
    .map(b => ({ value: `${b.banco} - ${b.numero_cuenta} (${b.moneda})`, label: `${b.banco} - ${b.numero_cuenta}`, description: b.moneda ?? undefined }));

  async function guardar() {
    if (!cuenta) return setError('Elige de qué cuenta de la empresa sale la reposición.');
    setEnviando(true);
    try {
      const r = await enviarChica(`/fondos/${fondo?.id}/reposiciones`, { cuenta_origen: cuenta });
      haptic('success');
      toast(`Reposición pedida. Falta la aprobación de Tesorería y Gerencia.`);
      refrescar();
      if (r) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Reponer ${fondo?.responsable ?? ''}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Pedir reposición</Button>
      </>}>
      <div className="cf">
        {error && <Notice tone="error">{error}</Notice>}
        <Notice tone="accent">La reposición reúne solo los gastos con sustento y aprobados por Tesorería y Gerencia.</Notice>
        <Field label="Cuenta de la empresa que repone">
          {p => <Combobox {...p} options={opcionesCuentas} value={cuenta} placeholder="Elige la cuenta" onChange={setCuenta} />}
        </Field>
      </div>
    </Sheet>
  );
}
