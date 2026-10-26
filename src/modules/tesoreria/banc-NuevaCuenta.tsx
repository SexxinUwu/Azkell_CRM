import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { digitsInput, parseDecimal } from '../../core/ui/forms';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { escribirTesoreria } from './api';

// Mismas entidades que el clásico (modulos/tesoreria/bancos/vista.html)
export const ENTIDADES = [
  'BCP (BANCO DE CRÉDITO DEL PERÚ)', 'BBVA PERÚ', 'INTERBANK', 'SCOTIABANK PERÚ', 'BANCO DE LA NACIÓN', 'BANBIF',
  'BANCO PICHINCHA', 'MIBANCO', 'BANCO GNB PERÚ', 'BANCO SANTANDER PERÚ', 'BANCO DE COMERCIO', 'BANCO FALABELLA',
  'BANCO RIPLEY', 'BANCO ALFIN', 'ICBC PERÚ BANK', 'BANK OF CHINA PERÚ',
  'CAJA AREQUIPA', 'CAJA HUANCAYO', 'CAJA PIURA', 'CAJA CUSCO', 'CAJA TRUJILLO', 'CAJA ICA', 'CAJA TACNA', 'CAJA MAYNAS',
  'CAJA DEL SANTA', 'CAJA PAITA', 'FINANCIERA CREDISCOTIA', 'FINANCIERA COMPARTAMOS', 'FINANCIERA CONFIANZA',
  'FINANCIERA EFECTIVA', 'FINANCIERA PROEMPRESA', 'FINANCIERA OH!', 'FINANCIERA QAPAQ', 'CAJA RURAL LOS ANDES',
  'CAJA RURAL DEL CENTRO', 'CAJA RURAL PRYMERA', 'YAPE', 'PLIN',
];
export const TIPOS_CUENTA = [
  { value: 'CORRIENTE', label: 'Corriente' },
  { value: 'AHORROS', label: 'Ahorros' },
  { value: 'DETRACCIONES', label: 'Detracciones' },
  { value: 'EFECTIVO', label: 'Efectivo' },
];
const OTRO = '__otro__';

interface Props { open: boolean; onClose: () => void }

// Alta de cuenta bancaria. El backend (POST /tesoreria/bancos) no tiene edición: solo alta y baja.
export function BancNuevaCuenta({ open, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [entidad, setEntidad] = useState('');
  const [otra, setOtra] = useState('');
  const [titular, setTitular] = useState('');
  const [moneda, setMoneda] = useState('SOLES');
  const [tipo, setTipo] = useState('CORRIENTE');
  const [numero, setNumero] = useState('');
  const [cci, setCci] = useState('');
  const [saldo, setSaldo] = useState('');
  const [estado, setEstado] = useState('ACTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    setEntidad(''); setOtra(''); setTitular(''); setMoneda('SOLES'); setTipo('CORRIENTE');
    setNumero(''); setCci(''); setSaldo(''); setEstado('ACTIVO'); setError(null); setErrs({});
  }, [open]);

  const limpiar = (k: string) => setErrs(e => ({ ...e, [k]: undefined }));

  async function guardar() {
    const banco = entidad === OTRO ? otra.trim().toUpperCase() : entidad;
    const saldoNum = parseDecimal(saldo);
    const e: Record<string, string> = {};
    if (!banco) e.entidad = entidad === OTRO ? 'Escribe el nombre de la entidad.' : 'Elige la entidad bancaria.';
    if (!titular.trim()) e.titular = 'Escribe el titular o la razón social.';
    if (!numero.trim()) e.numero = 'Escribe el número de cuenta.';
    if (cci && cci.length !== 20) e.cci = 'El CCI debe tener 20 dígitos.';
    if (Number.isNaN(saldoNum)) e.saldo = 'Escribe un monto válido, por ejemplo 1500.00.';
    setErrs(e);
    if (Object.keys(e).length) { haptic('warning'); return; }

    setEnviando(true); setError(null);
    try {
      await escribirTesoreria('/tesoreria/bancos', 'POST', {
        banco,
        titular: titular.trim(),
        moneda,
        tipo_cuenta: tipo,
        numero_cuenta: numero.trim(),
        cci,
        saldo_inicial: saldoNum ?? 0,
        estado,
      });
      haptic('success'); toast('Cuenta registrada');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'bancos'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nueva cuenta bancaria"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar cuenta</Button>
      </>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Entidad bancaria *" wide error={errs.entidad}>
          {p => (
            <SelectInput {...p} value={entidad} onChange={e => { setEntidad(e.target.value); limpiar('entidad'); }}>
              <option value="">Elige una entidad…</option>
              {ENTIDADES.map(x => <option key={x} value={x}>{x}</option>)}
              <option value={OTRO}>Otra entidad (especificar)…</option>
            </SelectInput>
          )}
        </Field>
        {entidad === OTRO && (
          <Field label="Nombre de la entidad *" wide error={errs.entidad}>
            {p => <TextInput {...p} value={otra} onChange={e => { setOtra(e.target.value); limpiar('entidad'); }} autoFocus />}
          </Field>
        )}

        <Field label="Titular / razón social *" wide error={errs.titular}>
          {p => <TextInput {...p} value={titular} onChange={e => { setTitular(e.target.value); limpiar('titular'); }} />}
        </Field>

        <Field label="Moneda">
          {p => (
            <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option value="SOLES">Soles</option>
              <option value="DOLARES">Dólares</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo de cuenta">
          {p => (
            <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
          )}
        </Field>

        <Field label="N.º de cuenta *" wide error={errs.numero}>
          {p => (
            <TextInput {...p} value={numero} placeholder="Ej.: 191-23948293-0-12" autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)' }}
              onChange={e => { setNumero(e.target.value); limpiar('numero'); }} />
          )}
        </Field>
        <Field label="CCI" wide error={errs.cci} hint={errs.cci ? undefined : 'Opcional. Código interbancario de 20 dígitos.'}>
          {p => (
            <TextInput {...p} inputMode="numeric" maxLength={20} value={cci} autoComplete="off"
              style={{ fontFamily: 'var(--font-mono)' }}
              onChange={e => { setCci(digitsInput(e.target.value, 20)); limpiar('cci'); }} />
          )}
        </Field>

        <Field label="Saldo inicial" error={errs.saldo} hint={errs.saldo ? undefined : 'Monto con que inicia la cuenta. Vacío = 0.'}>
          {p => (
            <TextInput {...p} inputMode="decimal" value={saldo} placeholder="0.00"
              onChange={e => { setSaldo(e.target.value.replace(/[^\d.,]/g, '')); limpiar('saldo'); }} />
          )}
        </Field>
        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="ACTIVO">Activa</option>
              <option value="INACTIVO">Inactiva</option>
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
