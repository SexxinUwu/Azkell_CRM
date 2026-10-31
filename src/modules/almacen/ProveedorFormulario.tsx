import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { BANCOS_PERU, tieneYapePlin } from './bancosPeru';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { guardarProveedor, type CuentaProveedor, type ProveedorInv } from './api';

interface Props {
  open: boolean;
  proveedor: ProveedorInv | null;
  /** Datos con los que se abre al crear (alta rápida desde una orden de compra) */
  inicial?: { nombre?: string; ruc?: string } | null;
  onClose: () => void;
  /** Recibe el id del proveedor guardado */
  onGuardado: (id?: string) => void;
}

const TIPOS_DOC = [
  { value: 'RUC', label: 'RUC' },
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'C.E.' },
  { value: 'Otro', label: 'Otro' },
];
const TIPOS_CUENTA = ['CUENTA CORRIENTE', 'CUENTA DE AHORROS', 'CUENTA REMUNERADA'];
// Yape y Plin solo cuando el banco es BCP o BBVA
const tiposCuentaPara = (banco: string | null | undefined) => (tieneYapePlin(banco) ? [...TIPOS_CUENTA, 'YAPE', 'PLIN'] : TIPOS_CUENTA);
const MONEDAS_CUENTA = [
  { value: 'SOLES', label: 'Soles (S/)' },
  { value: 'DOLARES', label: 'Dólares (US$)' },
];

// Cada cuenta es una fila del formulario; la clave solo sirve para React
type FilaCuenta = CuentaProveedor & { key: string };
let secuenciaFila = 0;
const nuevaFila = (c: Partial<CuentaProveedor> = {}): FilaCuenta => ({
  key: `cta${++secuenciaFila}`,
  banco: c.banco ?? '',
  tipo_cuenta: c.tipo_cuenta ?? 'CUENTA CORRIENTE',
  moneda: c.moneda ?? 'SOLES',
  numero_cuenta: c.numero_cuenta ?? '',
  cci: c.cci ?? '',
  detraccion: !!c.detraccion,
});

export function ProveedorFormulario({ open, proveedor: p, inicial, onClose, onGuardado }: Props) {
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [pestana, setPestana] = useState<'datos' | 'cuentas'>('datos');

  const [tipoDoc, setTipoDoc] = useState('RUC');
  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cuentas, setCuentas] = useState<FilaCuenta[]>([]);

  useEffect(() => {
    if (!open) return;
    setPestana('datos');
    if (p) {
      setTipoDoc(p.tipo_documento ?? 'RUC');
      setNombre(p.nombre ?? '');
      setRuc(p.ruc ?? '');
      setContacto(p.contacto ?? '');
      setTelefono(p.telefono ?? '');
      setCorreo(p.correo ?? '');
      setDireccion(p.direccion ?? '');
      setObservaciones(p.observaciones ?? '');
      setCuentas((p.cuentas ?? []).map(c => nuevaFila(c)));
    } else {
      setTipoDoc('RUC');
      setNombre(inicial?.nombre ?? ''); setRuc(inicial?.ruc ?? ''); setContacto(''); setTelefono(''); setCorreo('');
      setDireccion(''); setObservaciones(''); setCuentas([]);
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
      setTipoDoc(tipo);
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

  function cambiarCuenta(key: string, cambios: Partial<CuentaProveedor>) {
    setCuentas(filas => filas.map(f => (f.key === key ? { ...f, ...cambios } : f)));
  }

  async function guardar() {
    if (!nombre.trim()) { toast('El nombre es obligatorio', 'error'); setPestana('datos'); return; }
    setGuardando(true);
    try {
      const res = (await guardarProveedor({
        nombre: nombre.trim(),
        tipo_documento: tipoDoc,
        ruc: ruc || null,
        contacto: contacto || null,
        telefono: telefono || null,
        correo: correo || null,
        direccion: direccion || null,
        observaciones: observaciones || null,
        cuentas: cuentas.map(({ key: _key, ...c }) => ({ ...c, banco: c.banco || null, numero_cuenta: c.numero_cuenta || null, cci: c.cci || null })),
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
        <SegmentedControl
          block
          label="Secciones del proveedor"
          value={pestana}
          onChange={setPestana}
          options={[
            { value: 'datos', label: 'Datos' },
            { value: 'cuentas', label: cuentas.length ? `Cuentas bancarias (${cuentas.length})` : 'Cuentas bancarias' },
          ]}
        />

        {pestana === 'datos' && (
          <>
            <Field label="Nombre / Razón social *">
              {pp => <TextInput {...pp} value={nombre} placeholder="Nombre del proveedor" onChange={ev => setNombre(ev.target.value)} />}
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
              <Field label="Tipo de documento">
                {pp => (
                  <Combobox {...pp} options={TIPOS_DOC} value={tipoDoc} placeholder="Elige el tipo" onChange={v => setTipoDoc(v ?? 'RUC')} />
                )}
              </Field>
              <Field label="N° de documento">
                {pp => <TextInput {...pp} value={ruc} placeholder="20XXXXXXXXX" onChange={ev => setRuc(ev.target.value)} />}
              </Field>
            </div>
            <Button variant="secondary" loading={consultando} onClick={() => consultarDocumento(ruc)}>
              Consultar RUC / DNI
            </Button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
              <Field label="Contacto">
                {pp => <TextInput {...pp} value={contacto} placeholder="Nombre del asesor" onChange={ev => setContacto(ev.target.value)} />}
              </Field>
              <Field label="Teléfono">
                {pp => <TextInput {...pp} value={telefono} placeholder="+51 999 999 999" onChange={ev => setTelefono(ev.target.value)} />}
              </Field>
            </div>

            <Field label="Correo">
              {pp => <TextInput {...pp} type="email" value={correo} placeholder="proveedor@email.com" onChange={ev => setCorreo(ev.target.value)} />}
            </Field>

            <Field label="Dirección">
              {pp => <TextInput {...pp} value={direccion} placeholder="Dirección física" onChange={ev => setDireccion(ev.target.value)} />}
            </Field>

            <Field label="Observaciones">
              {pp => <TextInput {...pp} value={observaciones} placeholder="Notas adicionales" onChange={ev => setObservaciones(ev.target.value)} />}
            </Field>
          </>
        )}

        {pestana === 'cuentas' && (
          <>
            {cuentas.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                Sin cuentas bancarias. Agrega una con el botón de abajo.
              </p>
            )}
            {cuentas.map(c => (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', padding: 'var(--s-3)', borderRadius: 'var(--r-md)', background: 'var(--fill-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
                  <Field label="Banco">
                    {pp => (
                      <Combobox {...pp} options={BANCOS_PERU.map(b => ({ value: b, label: b }))} value={c.banco || null}
                        placeholder="Elige el banco o caja" createLabel="Usar este banco"
                        onChange={v => cambiarCuenta(c.key, { banco: v ?? '', tipo_cuenta: tieneYapePlin(v) ? c.tipo_cuenta : (c.tipo_cuenta === 'YAPE' || c.tipo_cuenta === 'PLIN' ? 'CUENTA CORRIENTE' : c.tipo_cuenta) })}
                        onCreate={texto => cambiarCuenta(c.key, { banco: texto })} />
                    )}
                  </Field>
                  <Field label="Tipo de cuenta">
                    {pp => (
                      <Combobox {...pp} options={tiposCuentaPara(c.banco).map(t => ({ value: t, label: t }))} value={c.tipo_cuenta ?? 'CUENTA CORRIENTE'}
                        placeholder="Elige el tipo" onChange={v => cambiarCuenta(c.key, { tipo_cuenta: v ?? 'CUENTA CORRIENTE' })} />
                    )}
                  </Field>
                  <Field label="Moneda">
                    {pp => (
                      <Combobox {...pp} options={MONEDAS_CUENTA} value={c.moneda ?? 'SOLES'} placeholder="Elige la moneda"
                        onChange={v => cambiarCuenta(c.key, { moneda: v ?? 'SOLES' })} />
                    )}
                  </Field>
                  <Field label="N° de cuenta">
                    {pp => <TextInput {...pp} value={c.numero_cuenta ?? ''} placeholder="Número de cuenta" onChange={ev => cambiarCuenta(c.key, { numero_cuenta: ev.target.value })} />}
                  </Field>
                  <Field label="CCI">
                    {pp => <TextInput {...pp} value={c.cci ?? ''} placeholder="Código interbancario" onChange={ev => cambiarCuenta(c.key, { cci: ev.target.value })} />}
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem', alignSelf: 'end', minHeight: '2.5rem' }}>
                    <input type="checkbox" checked={!!c.detraccion} onChange={ev => cambiarCuenta(c.key, { detraccion: ev.target.checked })} />
                    Cuenta de detracciones
                  </label>
                </div>
                <div>
                  <Button variant="plain" size="sm" icon={<Trash2 size={15} />} onClick={() => setCuentas(filas => filas.filter(f => f.key !== c.key))}>
                    Quitar cuenta
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setCuentas(filas => [...filas, nuevaFila()])}>
                Agregar cuenta
              </Button>
            </div>
          </>
        )}

        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          {p ? 'Guardar cambios' : 'Registrar proveedor'}
        </Button>
      </div>
    </Sheet>
  );
}
