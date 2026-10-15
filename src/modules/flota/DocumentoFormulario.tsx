import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import {
  CAMPOS_DOC, guardarDocumentoVehiculo, subirArchivoDocumento, useVehiculosFlota, type VehiculoFlota,
} from './api';

const dia = (v: unknown) => (v ? String(v).split('T')[0] : '');

// Cargar o renovar un documento de una unidad (fechas, entidad y archivo).
export function DocumentoFormulario({ placa: placaInicial, prefijo: prefijoInicial, usuario, open, onClose }: {
  placa: string | null; prefijo: string | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const vehiculos = useVehiculosFlota();
  const placas = usePlacas();

  const [placa, setPlaca] = useState('');
  const [prefijo, setPrefijo] = useState('soat');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fijo = !!(placaInicial && prefijoInicial);
  const vehiculo: VehiculoFlota | undefined = (vehiculos.data ?? []).find(v => v.placa === placa);
  const cfg = CAMPOS_DOC[prefijo];

  useEffect(() => {
    if (!open) return;
    setError(null); setArchivo(null);
    setPlaca(placaInicial ?? ''); setPrefijo(prefijoInicial ?? 'soat');
  }, [open, placaInicial, prefijoInicial]);

  // Al elegir unidad/documento: precarga lo que ya tiene
  useEffect(() => {
    if (!open || !cfg) return;
    const v = (vehiculos.data ?? []).find(x => x.placa === placa);
    const ini: Record<string, string> = {};
    for (const c of cfg.campos) {
      const raw = v ? (v as Record<string, unknown>)[c.campo] : '';
      ini[c.campo] = c.tipo === 'date' ? dia(raw) : raw == null ? '' : String(raw);
    }
    setValores(ini);
  }, [open, placa, prefijo, cfg, vehiculos.data]);

  const opcionesPlaca = useMemo(() => {
    const s = new Set<string>();
    (placas.data ?? []).forEach(p => s.add(p.placa));
    (vehiculos.data ?? []).forEach(v => s.add(v.placa));
    return [...s].sort();
  }, [placas.data, vehiculos.data]);

  async function guardar() {
    if (!placa) { setError('Elige la unidad.'); return; }
    const venc = valores[`${prefijo}_vencimiento`];
    if (!venc) { setError('Indica la fecha de vencimiento.'); return; }
    const ems = valores[`${prefijo}_emision`];
    if (ems && venc < ems) { setError('El vencimiento es anterior a la emisión.'); return; }
    setEnviando(true); setError(null);
    try {
      const url = archivo ? await subirArchivoDocumento(archivo) : null;
      await guardarDocumentoVehiculo({ vehiculo: vehiculo ?? { placa }, prefijo, valores, archivoUrl: url, usuario });
      haptic('success');
      toast(`${cfg?.label ?? 'Documento'} de ${placa} actualizado`);
      await qc.invalidateQueries({ queryKey: ['flota', 'vehiculos'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()}
      title={fijo ? `Renovar ${cfg?.label ?? 'documento'}` : 'Cargar documento'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Unidad">
          {p => (
            <PlacaPicker {...p} value={placa} onChange={setPlaca} disabled={fijo} opciones={opcionesPlaca.map(x => ({ placa: x }))} />
          )}
        </Field>
        <Field label="Documento">
          {p => (
            <SelectInput {...p} value={prefijo} onChange={e => setPrefijo(e.target.value)} disabled={fijo}>
              {Object.entries(CAMPOS_DOC).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </SelectInput>
          )}
        </Field>
        {cfg?.campos.map(c => (
          <Field key={c.campo} label={c.label} wide={c.tipo === 'text' && c.campo.endsWith('entidad')}>
            {p => (
              <TextInput {...p}
                type={c.tipo === 'date' ? 'date' : c.tipo === 'number' ? 'number' : 'text'}
                value={valores[c.campo] ?? ''} onChange={e => setValores(v => ({ ...v, [c.campo]: e.target.value }))} />
            )}
          </Field>
        ))}
        <Field label="Archivo (PDF o foto)" wide hint={archivo ? archivo.name : 'Opcional: si no eliges uno, se conserva el actual'}>
          {p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />}
        </Field>
      </div>
    </Sheet>
  );
}
