import { useEffect, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { guardarProveedor, type ProveedorInv } from './api';

interface Props {
  open: boolean;
  proveedor: ProveedorInv | null;
  onClose: () => void;
  onGuardado: () => void;
}

const MONEDAS = ['PEN', 'USD'];

export function ProveedorFormulario({ open, proveedor: p, onClose, onGuardado }: Props) {
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [banco, setBanco] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [cci, setCci] = useState('');
  const [monedaPago, setMonedaPago] = useState('PEN');
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    if (!open) return;
    if (p) {
      setNombre(p.nombre ?? '');
      setRuc(p.ruc ?? '');
      setContacto(p.contacto ?? '');
      setTelefono(p.telefono ?? '');
      setCorreo(p.correo ?? '');
      setDireccion(p.direccion ?? '');
      setBanco(p.banco ?? '');
      setCuenta(p.cuenta ?? '');
      setCci(p.cci ?? '');
      setMonedaPago(p.moneda_pago ?? 'PEN');
      setObservaciones(p.observaciones ?? '');
    } else {
      setNombre(''); setRuc(''); setContacto(''); setTelefono(''); setCorreo('');
      setDireccion(''); setBanco(''); setCuenta(''); setCci(''); setMonedaPago('PEN'); setObservaciones('');
    }
  }, [open, p]);

  async function guardar() {
    if (!nombre.trim()) { toast('El nombre es obligatorio', 'error'); return; }
    setGuardando(true);
    try {
      await guardarProveedor({
        nombre: nombre.trim(),
        ruc: ruc || null,
        contacto: contacto || null,
        telefono: telefono || null,
        correo: correo || null,
        direccion: direccion || null,
        banco: banco || null,
        cuenta: cuenta || null,
        cci: cci || null,
        moneda_pago: monedaPago || null,
        observaciones: observaciones || null,
      }, p?.id);
      toast(p ? 'Proveedor actualizado' : 'Proveedor registrado');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={p ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>

        <Field label="Nombre / Razón social *">
          {pp => <TextInput {...pp} value={nombre} placeholder="Nombre del proveedor" onChange={ev => setNombre(ev.target.value)} />}
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="RUC / Documento">
            {pp => <TextInput {...pp} value={ruc} placeholder="20XXXXXXXXX" onChange={ev => setRuc(ev.target.value)} />}
          </Field>
          <Field label="Contacto">
            {pp => <TextInput {...pp} value={contacto} placeholder="Nombre del asesor" onChange={ev => setContacto(ev.target.value)} />}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Teléfono">
            {pp => <TextInput {...pp} value={telefono} placeholder="+51 999 999 999" onChange={ev => setTelefono(ev.target.value)} />}
          </Field>
          <Field label="Correo">
            {pp => <TextInput {...pp} type="email" value={correo} placeholder="proveedor@email.com" onChange={ev => setCorreo(ev.target.value)} />}
          </Field>
        </div>

        <Field label="Dirección">
          {pp => <TextInput {...pp} value={direccion} placeholder="Dirección física" onChange={ev => setDireccion(ev.target.value)} />}
        </Field>

        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)', margin: 0 }}>Datos bancarios</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="Banco">
            {pp => <TextInput {...pp} value={banco} placeholder="Ej: BCP, Interbank" onChange={ev => setBanco(ev.target.value)} />}
          </Field>
          <Field label="Moneda">
            {pp => (
              <SelectInput {...pp} value={monedaPago} onChange={ev => setMonedaPago(ev.target.value)}>
                {MONEDAS.map(m => <option key={m} value={m}>{m === 'PEN' ? 'Soles (S/)' : 'Dólares (US$)'}</option>)}
              </SelectInput>
            )}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
          <Field label="N° de cuenta">
            {pp => <TextInput {...pp} value={cuenta} placeholder="Número de cuenta" onChange={ev => setCuenta(ev.target.value)} />}
          </Field>
          <Field label="CCI">
            {pp => <TextInput {...pp} value={cci} placeholder="Código interbancario" onChange={ev => setCci(ev.target.value)} />}
          </Field>
        </div>

        <Field label="Observaciones">
          {pp => <TextInput {...pp} value={observaciones} placeholder="Notas adicionales" onChange={ev => setObservaciones(ev.target.value)} />}
        </Field>

        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          {p ? 'Guardar cambios' : 'Registrar proveedor'}
        </Button>
      </div>
    </Sheet>
  );
}
