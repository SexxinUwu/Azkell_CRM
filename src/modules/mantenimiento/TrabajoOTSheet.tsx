import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePersonalSolicitante } from '../almacen/SelectoresSalida';
import {
  aObjeto, crearTrabajo, editarTrabajo, eliminarTrabajo, estadoTrabajo, trabajoCosto, trabajoId,
  type OrdenTrabajo, type TrabajoOT,
} from './api';

// Formulario "Agregar / Editar trabajo" de la OT, calcado del clásico (#rot-drawer-trabajo):
// descripción del trabajo, técnicos ejecutores con buscador, inicio y fin, costo estimado y Eliminar solo al editar.

const aLocal = (s: string | null | undefined) => (s ? String(s).replace('Z', '').replace(' ', 'T').slice(0, 16) : '');
const ahoraLocal = () => {
  const d = new Date();
  return `${d.toLocaleDateString('sv-SE')}T${d.toTimeString().slice(0, 5)}`;
};

function personalDe(t: TrabajoOT): string[] {
  let p = t.tecnico ?? '';
  const d = aObjeto(t.detalles_json);
  if (d.personal) p = String(d.personal);
  return p.split(',').map(x => x.trim()).filter(Boolean);
}

export function TrabajoOTSheet({ ot, trabajo, open, onClose, usuario }: {
  ot: OrdenTrabajo;
  /** Trabajo a editar; null para agregar uno nuevo */
  trabajo: TrabajoOT | null;
  open: boolean;
  onClose: () => void;
  usuario: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const personalQ = usePersonalSolicitante();
  const [desc, setDesc] = useState('');
  const [personal, setPersonal] = useState<string[]>([]);
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [costo, setCosto] = useState('0');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const edicion = !!trabajo;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (trabajo) {
      setDesc(trabajo.trabajo_realizado ?? ''); setPersonal(personalDe(trabajo));
      setIni(aLocal(trabajo.fecha_trabajo)); setFin(aLocal(trabajo.fecha_salida));
      setCosto(String(trabajoCosto(trabajo) || 0));
    } else {
      setDesc(''); setPersonal([]); setIni(ahoraLocal()); setFin(''); setCosto('0');
    }
  }, [open, trabajo]);

  const opciones = useMemo(
    () => [...new Set([...(personalQ.data ?? []), ...personal])].sort((a, b) => a.localeCompare(b, 'es')),
    [personalQ.data, personal],
  );

  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] }),
    qc.invalidateQueries({ queryKey: ['mant', 'ots'] }),
  ]);

  async function guardar() {
    if (!desc.trim()) { setError('La descripción es requerida.'); haptic('warning'); return; }
    if (ini && fin && fin < ini) { setError('La hora de fin es anterior al inicio.'); haptic('warning'); return; }
    setEnviando(true); setError(null);
    const costoNum = parseFloat(costo.replace(',', '.')) || 0;
    try {
      if (trabajo) {
        await editarTrabajo(trabajoId(trabajo), {
          trabajo_realizado: desc.trim().toUpperCase(), fecha_trabajo: ini || null, fecha_salida: fin || null,
          personal: personal.join(', '), costo: costoNum, estado: estadoTrabajo(trabajo.estado),
        });
        toast('Trabajo actualizado');
      } else {
        await crearTrabajo({
          ticket_visita: ot.ticket_entrada || ot.id_ot || '', trabajo_realizado: desc.trim().toUpperCase(),
          fecha_trabajo: ini || null, fecha_salida: fin || null, creado_por: usuario,
          personal: personal.join(', '), costo: costoNum,
        });
        toast('Trabajo registrado');
      }
      haptic('success');
      await refrescar();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  async function eliminar() {
    if (!trabajo) return;
    setEnviando(true);
    try {
      await eliminarTrabajo(trabajoId(trabajo));
      haptic('success'); toast('Trabajo eliminado');
      setBorrando(false);
      await refrescar();
      onClose();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !enviando && onClose()}
        title={edicion ? `Editar trabajo ${trabajo ? trabajoId(trabajo) : ''}` : 'Agregar trabajo'}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
            {edicion && (
              <Button variant="secondary" icon={<Trash2 size={15} />} onClick={() => setBorrando(true)} disabled={enviando}>Eliminar</Button>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
              <Button variant="primary" onClick={guardar} loading={enviando}>Guardar trabajo</Button>
            </div>
          </div>
        }
      >
        <div className="form-grid">
          <p className="t-footnote c-secondary field field--wide" style={{ margin: 0 }}>OT {ot.ticket_entrada || ot.id_ot} · registro de labor realizada</p>
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
          <Field label="Descripción del trabajo realizado *" wide>
            {p => (
              <textarea {...p} className="input" rows={3} value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="DETALLA LA LABOR, CAMBIO O REPARACIÓN REALIZADA..."
                style={{ textTransform: 'uppercase', fontWeight: 600, minHeight: 88, resize: 'vertical' }} />
            )}
          </Field>
          <div className="field field--wide">
            <MultiSelect label="Personal / Técnico(s) ejecutores" options={opciones} value={personal} onChange={setPersonal} placeholder="Seleccionar técnico(s)..." />
          </div>
          <Field label="Fecha y hora inicio">{p => <TextInput {...p} type="datetime-local" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
          <Field label="Fecha y hora fin">{p => <TextInput {...p} type="datetime-local" value={fin} min={ini || undefined} onChange={e => setFin(e.target.value)} />}</Field>
          <Field label="Costo estimado del trabajo (S/)" wide>{p => <TextInput {...p} inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} />}</Field>
        </div>
      </Sheet>
      <ConfirmSheet
        open={borrando}
        onClose={() => !enviando && setBorrando(false)}
        onConfirm={eliminar}
        loading={enviando}
        title={`¿Eliminar el trabajo ${trabajo ? trabajoId(trabajo) : ''}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </>
  );
}
