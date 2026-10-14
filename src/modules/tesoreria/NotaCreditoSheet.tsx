import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { CuentaPorCobrar } from './api';

// Cambio de factura con nota de crédito: la NC anula la factura anterior y se reemplaza por la nueva.
// Mismo contrato que el clásico: POST /api/tesoreria/cuentas/:id/cambiar-factura-nc (multipart).
export function NotaCreditoSheet({ cuenta, onClose }: { cuenta: CuentaPorCobrar | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [ncSerie, setNcSerie] = useState('');
  const [ncNumero, setNcNumero] = useState('');
  const [motivo, setMotivo] = useState('');
  const [nuevaSerie, setNuevaSerie] = useState('');
  const [nuevoNumero, setNuevoNumero] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [archivoNC, setArchivoNC] = useState<File | null>(null);
  const [archivoNueva, setArchivoNueva] = useState<File | null>(null);
  const [archivoAnterior, setArchivoAnterior] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cuenta) return;
    setNcSerie(''); setNcNumero(''); setMotivo('');
    setNuevaSerie(''); setNuevoNumero(''); setNuevaFecha(new Date().toISOString().slice(0, 10));
    setArchivoNC(null); setArchivoNueva(null); setArchivoAnterior(null); setError(null);
  }, [cuenta]);

  async function guardar() {
    if (!cuenta) return;
    setError(null);
    if (!archivoNC) { setError('Adjunta el PDF o imagen de la nota de crédito.'); return; }
    if (!archivoNueva) { setError('Adjunta el PDF o imagen de la nueva factura.'); return; }
    if (!ncSerie.trim() || !ncNumero.trim()) { setError('Indica la serie y el número de la nota de crédito.'); return; }
    if (!motivo.trim()) { setError('Indica el motivo de la nota de crédito.'); return; }
    if (!nuevaSerie.trim() || !nuevoNumero.trim()) { setError('Indica la serie y el número de la nueva factura.'); return; }

    const fd = new FormData();
    fd.append('nc_serie', ncSerie.trim());
    fd.append('nc_numero', ncNumero.trim());
    fd.append('motivo_anulacion', motivo.trim());
    fd.append('nueva_serie', nuevaSerie.trim());
    fd.append('nuevo_numero', nuevoNumero.trim());
    fd.append('nueva_fecha_factura', nuevaFecha);
    fd.append('archivo_nc', archivoNC);
    fd.append('archivo_nueva_factura', archivoNueva);
    if (archivoAnterior) fd.append('archivo_factura_anterior', archivoAnterior);

    setEnviando(true);
    try {
      const r = await api<{ message?: string }>(`/tesoreria/cuentas/${cuenta.id}/cambiar-factura-nc`, { method: 'POST', body: fd });
      haptic('success');
      toast(r.message ?? 'Factura cambiada');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!cuenta} onClose={() => !enviando && onClose()} title="Nota de crédito y cambio de factura"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Aplicar NC y reemplazar factura</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <div className="field field--wide"><Notice>La factura actual queda anulada con esta nota de crédito y se reemplaza por la nueva.</Notice></div>

        <Field label="Serie de la NC">{p => <TextInput {...p} value={ncSerie} onChange={e => setNcSerie(e.target.value.toUpperCase())} />}</Field>
        <Field label="Número de la NC">{p => <TextInput {...p} value={ncNumero} onChange={e => setNcNumero(e.target.value)} />}</Field>
        <Field label="Motivo" wide>{p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} />}</Field>
        <Field label="Serie nueva factura">{p => <TextInput {...p} value={nuevaSerie} onChange={e => setNuevaSerie(e.target.value.toUpperCase())} />}</Field>
        <Field label="Número nueva factura">{p => <TextInput {...p} value={nuevoNumero} onChange={e => setNuevoNumero(e.target.value)} />}</Field>
        <Field label="Fecha de la nueva factura" wide>{p => <TextInput {...p} type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} />}</Field>
        <Field label="Archivo de la nota de crédito" wide hint={archivoNC?.name}>
          {p => <TextInput {...p} type="file" accept=".pdf,image/*" onChange={e => setArchivoNC(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="Archivo de la nueva factura" wide hint={archivoNueva?.name}>
          {p => <TextInput {...p} type="file" accept=".pdf,image/*" onChange={e => setArchivoNueva(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="Factura anterior (opcional)" wide hint={archivoAnterior?.name}>
          {p => <TextInput {...p} type="file" accept=".pdf,image/*" onChange={e => setArchivoAnterior(e.target.files?.[0] ?? null)} />}
        </Field>
      </div>
    </Sheet>
  );
}
