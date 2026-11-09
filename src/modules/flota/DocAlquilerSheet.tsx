import { useState } from 'react';
import { CircleAlert, Handshake } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { guardarAlquiler, type VehiculoFlota } from './api';

type Responsable = 'PROPIA' | 'ARRENDATARIA';

interface Props {
  /** La unidad a editar; null mantiene la hoja cerrada */
  vehiculo: VehiculoFlota | null;
  /** Nombres de empresa que se pueden elegir (también se puede escribir otra) */
  empresas: string[];
  onClose: () => void;
  onHecho: () => unknown;
}

/**
 * Alquiler de una unidad: a qué empresa se alquila (indefinido, sin fecha de fin) y quién se encarga de actualizar sus documentos
 * según el convenio. Con esto, Documentos de flota marca lo pendiente a nombre de esa empresa y permite pedirle la actualización.
 */
export function DocAlquilerSheet({ vehiculo, empresas, onClose, onHecho }: Props) {
  const toast = useToast();
  const [empresa, setEmpresa] = useState('');
  const [desde, setDesde] = useState('');
  const [responsable, setResponsable] = useState<Responsable>('ARRENDATARIA');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertaPara, setAbiertaPara] = useState<string | null>(null);

  // Al abrir con otra unidad, se cargan sus datos
  if (vehiculo && abiertaPara !== vehiculo.placa) {
    setAbiertaPara(vehiculo.placa);
    setEmpresa(String(vehiculo.alquilada_a ?? '').trim());
    setDesde(String(vehiculo.alquiler_desde ?? '').slice(0, 10));
    setResponsable(vehiculo.docs_responsable === 'PROPIA' ? 'PROPIA' : 'ARRENDATARIA');
    setNota(String(vehiculo.alquiler_nota ?? ''));
    setError(null);
  }
  if (!vehiculo && abiertaPara !== null) setAbiertaPara(null);

  const yaAlquilada = !!String(vehiculo?.alquilada_a ?? '').trim();

  async function guardar(quitar: boolean) {
    if (!vehiculo) return;
    setError(null);
    if (!quitar && !empresa.trim()) { setError('Elige o escribe la empresa a la que se alquila.'); haptic('warning'); return; }
    setGuardando(true);
    try {
      await guardarAlquiler(vehiculo.placa, quitar
        ? { alquilada_a: '', alquiler_desde: '', docs_responsable: 'PROPIA', alquiler_nota: '' }
        : { alquilada_a: empresa.trim(), alquiler_desde: desde, docs_responsable: responsable, alquiler_nota: nota.trim() });
      haptic('success');
      toast(quitar ? `Alquiler de ${vehiculo.placa} quitado` : `${vehiculo.placa} alquilada a ${empresa.trim()}`);
      await onHecho();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const opciones = [...new Set([...(empresa && !empresas.includes(empresa) ? [empresa] : []), ...empresas])];

  return (
    <Sheet open={!!vehiculo} onClose={() => !guardando && onClose()} title={vehiculo ? `Alquiler · ${vehiculo.placa}` : 'Alquiler'}
      footer={(
        <>
          {yaAlquilada && <Button variant="secondary" onClick={() => { void guardar(true); }} disabled={guardando}>Quitar alquiler</Button>}
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" icon={<Handshake size={16} />} onClick={() => { void guardar(false); }} loading={guardando}>Guardar</Button>
        </>
      )}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Alquilada a" wide>
          {p => (
            <Combobox id={p.id} value={empresa || null} onChange={v => setEmpresa(v ?? '')} placeholder="Empresa que la alquila"
              options={opciones.map(e => ({ value: e, label: e }))}
              onCreate={t => setEmpresa(t.trim().toUpperCase())} createLabel="Usar" />
          )}
        </Field>
        <Field label="Desde" hint="El alquiler es indefinido: no tiene fecha de fin">
          {p => <TextInput {...p} type="date" value={desde} onChange={e => setDesde(e.target.value)} />}
        </Field>
        <Field label="¿Quién actualiza los documentos?" wide>
          {() => (
            <SegmentedControl<Responsable> label="Quién actualiza los documentos" block value={responsable} onChange={setResponsable}
              options={[{ value: 'ARRENDATARIA', label: empresa.trim() ? `${empresa.trim()} (convenio)` : 'La empresa que alquila' }, { value: 'PROPIA', label: 'Nosotros' }]} />
          )}
        </Field>
        <Field label="Nota del convenio" wide>
          {p => <TextInput {...p} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional. Ej. Trahesa renueva SOAT y revisión técnica" />}
        </Field>
      </div>
    </Sheet>
  );
}
