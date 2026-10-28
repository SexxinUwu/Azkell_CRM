import { useEffect, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { guardarProveedor, type ProveedorInv } from './api';

interface Props {
  open: boolean;
  proveedor: ProveedorInv | null;
  /** Datos con los que se abre al crear (alta rápida desde una orden de compra) */
  inicial?: { nombre?: string; ruc?: string } | null;
  onClose: () => void;
  /** Recibe el id del proveedor guardado */
  onGuardado: (id?: string) => void;
}

const MONEDAS = ['PEN', 'USD'];

export function ProveedorFormulario({ open, proveedor: p, inicial, onClose, onGuardado }: Props) {
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [consultando, setConsultando] = useState(false);

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
      setNombre(inicial?.nombre ?? ''); setRuc(inicial?.ruc ?? ''); setContacto(''); setTelefono(''); setCorreo('');
      setDireccion(''); setBanco(''); setCuenta(''); setCci(''); setMonedaPago('PEN'); setObservaciones('');
    }
  }, [open, p, inicial?.nombre, inicial?.ruc]);

  /** Consulta RUC o DNI (como el clásico): completa la razón social y la dirección, o el nombre de la persona */
  async function consultarDocumento(texto: string) {
    const numero = texto.replace(/\D/g, '');
    const tipo = numero.length === 11 ? 'RUC' : numero.length === 8 ? 'DNI' : null;
    if (!tipo) { toast('Escribe un RUC de 11 dígitos o un DNI de 8', 'error'); return; }
    setConsultando(true);
    try {
      const d = await api<Record<string, string | undefined>>('/proxy/documento', { query: { tipo, numero } });
      setRuc(numero);
      if (tipo === 'RUC') {
        setNombre(actual => (actual.trim() ? actual : (d.nombre ?? '')));
        setDireccion(d.direccion ?? '');
      } else {
        const completo = [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ');
        setNombre(actual => (actual.trim() ? actual : completo));
      }
      toast('Datos consultados');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setConsultando(false);
    }
  }

  // Alta rápida con RUC o DNI ya escrito: la consulta corre sola al abrir
  useEffect(() => {
    if (!open || p || !inicial?.ruc) return;
    const numero = inicial.ruc.replace(/\D/g, '');
    if (numero.length === 8 || numero.length === 11) void consultarDocumento(numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p, inicial?.ruc]);

  async function guardar() {
    if (!nombre.trim()) { toast('El nombre es obligatorio', 'error'); return; }
    setGuardando(true);
    try {
      const res = (await guardarProveedor({
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
      }, p?.id)) as { id?: string | number } | undefined;
      toast(p ? 'Proveedor actualizado' : 'Proveedor registrado');
      onGuardado(p ? p.id : res?.id != null ? String(res.id) : undefined);
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
          <Button variant="secondary" loading={consultando} onClick={() => consultarDocumento(ruc)} style={{ alignSelf: 'end' }}>
            Consultar RUC / DNI
          </Button>
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
