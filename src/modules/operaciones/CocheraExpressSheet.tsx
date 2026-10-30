import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Check } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { dayKey } from '../../core/lib/format';
import { useConductores, type Conductor } from '../conductores/api';
import { siguienteNumeroCaja, useBancos, type Banco } from '../tesoreria/api';

// Datos de la orden de servicio que el clásico pasa al formulario express de cochera
export interface CocheraDatos {
  id: number | string;
  codigo_orden: string;
  viaje_asignado: string;
  placa_tracto: string;
  conductor: string;
  ruta: string;
}

const MODALIDADES: { valor: string; etiqueta: string }[] = [
  { valor: 'TRANSFERENCIA BANCARIA', etiqueta: 'Transferencia' },
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'YAPE / PLIN', etiqueta: 'Yape / Plin' },
];

// Mismo texto que el clásico: así se reconoce la cuenta en el selector y en el movimiento de caja
const etiquetaBanco = (b: Banco) => `${b.banco} (${b.moneda || 'SOLES'} - ${b.tipo_cuenta || 'CTE'}): ${b.numero_cuenta}`;

// Cuenta preseleccionada: la primera activa, o la última BCP en soles (como el clásico)
function cuentaPorDefecto(activos: Banco[]): string {
  let elegida = '';
  activos.forEach((b, i) => {
    if (i === 0 || (/BCP/i.test(b.banco ?? '') && (b.moneda === 'SOLES' || !b.moneda))) elegida = etiquetaBanco(b);
  });
  return elegida;
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="dato">
      <span className="dato__label">{label}</span>
      <span className="dato__valor dato__valor--mono">{valor}</span>
    </div>
  );
}

/** Cuenta del conductor desde el directorio, con el mismo formato del clásico («BANCO: número») */
function cuentaDeConductor(lista: Conductor[] | undefined, nombre: string): string {
  const buscado = nombre.trim().toUpperCase();
  const c = (lista ?? []).find(x => x.nombre.trim().toUpperCase() === buscado);
  if (!c || !c.numero_cuenta) return '';
  return `${c.banco || 'BANCO'}: ${c.numero_cuenta}`;
}

// Caja de cochera del conductor: se ofrece al crear una orden de servicio y al iniciarla.
// Mismo contrato que el clásico: caja de Tesorería con concepto "Gastos de Viaje y Ruta" / "Cochera / Parqueo de ruta".
export function CocheraExpressSheet({ open, datos, onClose }: { open: boolean; datos: CocheraDatos | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const bancos = useBancos();
  const conductores = useConductores();
  const [monto, setMonto] = useState('30.00');
  const [modalidad, setModalidad] = useState(MODALIDADES[0].valor);
  const [cuentaEmpresa, setCuentaEmpresa] = useState('');
  const [cuentaConductor, setCuentaConductor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const activos = useMemo(() => (bancos.data ?? []).filter(b => b.estado === 'ACTIVO'), [bancos.data]);

  // Cada apertura empieza con los valores por defecto
  useEffect(() => {
    if (!open) return;
    setMonto('30.00'); setModalidad(MODALIDADES[0].valor); setError(null); setEnviando(false);
  }, [open, datos]);

  // Cuenta del conductor: se autollena al elegirlo (cuando llega el directorio)
  useEffect(() => {
    if (open && datos) setCuentaConductor(cuentaDeConductor(conductores.data, datos.conductor));
  }, [open, datos, conductores.data]);

  // Cuenta de empresa por defecto cuando llegan las cuentas
  useEffect(() => {
    if (open) setCuentaEmpresa(cuentaPorDefecto(activos));
  }, [open, activos]);

  async function generar() {
    setError(null);
    const importe = parseFloat(monto) || 0;
    if (importe <= 0) { setError('Ingresa un monto válido para la cochera.'); return; }
    if (!cuentaConductor.trim()) { setError('Indica la cuenta de destino del conductor.'); return; }
    if (!datos) return;

    setEnviando(true);
    try {
      // Correlativo real de caja (el clásico lo pedía a una ruta inexistente y caía a 00000001)
      const serie = String(new Date().getFullYear());
      const numero = await siguienteNumeroCaja(serie);
      if (!numero) throw new Error('No se pudo obtener el número de la caja. Intenta de nuevo.');

      const f = new FormData();
      f.append('fecha', dayKey(new Date()));
      f.append('hora', new Date().toTimeString().slice(0, 8));
      f.append('serie', serie);
      f.append('numero', numero);
      f.append('orden_viaje', datos.viaje_asignado);
      f.append('conductor', datos.conductor);
      f.append('ruta_viaje', datos.ruta);
      f.append('placa', datos.placa_tracto);
      f.append('autoriza', 'Marco Rosas');
      f.append('motivo', 'Gastos de Viaje y Ruta');
      f.append('sub_motivo', 'Cochera / Parqueo de ruta');
      f.append('centro_costo', 'CC-300: Operaciones de Ruta (Costo Servicio)');
      f.append('modalidad_pago', modalidad);
      f.append('moneda', 'SOLES');
      f.append('tipo_cambio', '1.000');
      f.append('tipo_persona', 'CONDUCTOR');
      f.append('persona', datos.conductor);
      f.append('importe_total', String(importe));
      f.append('descripcion', 'Cochera de Conductor por Orden de Servicio');
      f.append('tipo_comprobante', 'SIN COMPROBANTE');
      f.append('cuenta_bancaria_persona', cuentaConductor.trim());
      f.append('cuenta_bancaria_empresa', cuentaEmpresa);
      f.append('observacion', `Generado automáticamente desde Operaciones para el viaje ${datos.viaje_asignado}`);
      f.append('no_aplica_liquidacion', '0');
      f.append('usuario_creacion', user?.name ?? '');

      const r = await api<{ ok?: boolean; error?: string }>('/tesoreria/caja', { method: 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo generar la caja de cochera');
      haptic('success');
      toast(`Caja de cochera Nº ${serie}-${numero} registrada (S/ ${importe.toFixed(2)})`);
      await qc.invalidateQueries({ queryKey: ['tesoreria'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Caja de cochera del conductor"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Omitir cochera</Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={generar} loading={enviando} disabled={!datos}>Generar caja</Button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="t-callout c-secondary">Generación rápida de caja vinculada a la orden de viaje.</p>

        {datos && (
          <div className="tarjeta__lista">
            <Dato label="Orden de servicio" valor={datos.codigo_orden || '—'} />
            <Dato label="Orden de viaje" valor={datos.viaje_asignado || 'Sin asignar'} />
            <Dato label="Conductor" valor={datos.conductor || 'CONDUCTOR'} />
            <Dato label="Placa tracto" valor={datos.placa_tracto || '—'} />
          </div>
        )}

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <div className="form-grid">
          <Field label="Monto cochera (S/)">{p => <TextInput {...p} type="number" inputMode="decimal" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} />}</Field>
          <Field label="Modalidad">{p => (
            <SelectInput {...p} value={modalidad} onChange={e => setModalidad(e.target.value)}>
              {MODALIDADES.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </SelectInput>
          )}</Field>
          <Field label="Pagar desde (cuenta de la empresa)" wide hint="De qué cuenta sale el dinero">{p => (
            <SelectInput {...p} value={cuentaEmpresa} onChange={e => setCuentaEmpresa(e.target.value)} disabled={bancos.isLoading}>
              <option value="">{bancos.isLoading ? 'Cargando cuentas…' : bancos.isError ? 'Error cargando cuentas' : activos.length ? '— Elegir cuenta de la empresa —' : 'Sin cuentas registradas'}</option>
              {activos.map(b => <option key={String(b.id)} value={etiquetaBanco(b)}>{etiquetaBanco(b)}</option>)}
            </SelectInput>
          )}</Field>
          <Field label="Transferir a (cuenta del conductor)" wide hint="Ej.: BCP 191-XXXXXXXX-X-XX o celular Yape">{p => (
            <TextInput {...p} value={cuentaConductor} onChange={e => setCuentaConductor(e.target.value)} placeholder="Cuenta o número de celular" />
          )}</Field>
        </div>

        <p className="t-caption c-tertiary">Concepto: Gastos de Viaje y Ruta · Sub motivo: Cochera / Parqueo de ruta · Centro de costos: CC-300 (Operaciones de Ruta) · Autoriza: Marco Rosas</p>
      </div>
    </Sheet>
  );
}
