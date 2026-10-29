import { useEffect, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { CuentaPorCobrar } from './api';
import { MOTIVOS_NC, hoyIso, soles, verUrl } from './cuentas-util';

// Cambio de factura con nota de crédito: la NC anula la factura actual y la reemplaza por la nueva.
// POST /api/tesoreria/cuentas/:id/cambiar-factura-nc (multipart). El servidor guarda el histórico
// en tesoreria_cuentas_historial_facturas y actualiza la factura activa.

type Campo = 'ncSerie' | 'ncNumero' | 'motivo' | 'nuevaSerie' | 'nuevoNumero' | 'nuevaFecha' | 'archivoNC' | 'archivoNueva';
type Errores = Partial<Record<Campo, string>>;
interface Textos { ncSerie: string; ncNumero: string; motivo: string; nuevaSerie: string; nuevoNumero: string; nuevaFecha: string }
interface Archivos { nc: File | null; nueva: File | null; anterior: File | null }

const VACIOS: Textos = { ncSerie: '', ncNumero: '', motivo: '', nuevaSerie: '', nuevoNumero: '', nuevaFecha: '' };

export function NotaCreditoSheet({ cuenta, onClose }: { cuenta: CuentaPorCobrar | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [t, setT] = useState<Textos>(VACIOS);
  const [archivos, setArchivos] = useState<Archivos>({ nc: null, nueva: null, anterior: null });
  const [errores, setErrores] = useState<Errores>({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cuenta) return;
    setT({ ...VACIOS, nuevaFecha: hoyIso() });
    setArchivos({ nc: null, nueva: null, anterior: null });
    setErrores({}); setError(null); setConfirmando(false);
  }, [cuenta]);

  const facturaActual = `${cuenta?.serie ?? ''}-${cuenta?.factura ?? ''}`;
  const urlFacturaActual = cuenta ? verUrl(cuenta, 'factura_documento') : null;
  const cambiar = (campo: keyof Textos) => (e: { target: { value: string } }) => {
    const valor = campo === 'ncSerie' || campo === 'nuevaSerie' ? e.target.value.toUpperCase() : e.target.value;
    setT(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: undefined }));
  };

  function validar(): Errores {
    const e: Errores = {};
    if (!t.ncSerie.trim()) e.ncSerie = 'Indica la serie de la nota de crédito.';
    if (!t.ncNumero.trim()) e.ncNumero = 'Indica el número de la nota de crédito.';
    if (!t.motivo) e.motivo = 'Elige el motivo SUNAT.';
    if (!archivos.nc) e.archivoNC = 'Adjunta el PDF o imagen de la nota de crédito.';
    if (!t.nuevaSerie.trim()) e.nuevaSerie = 'Indica la serie de la nueva factura.';
    if (!t.nuevoNumero.trim()) e.nuevoNumero = 'Indica el número de la nueva factura.';
    else if (t.nuevaSerie.trim().toUpperCase() === (cuenta?.serie ?? '').toUpperCase() && t.nuevoNumero.trim() === (cuenta?.factura ?? '')) {
      e.nuevoNumero = 'Es la misma factura que se anula.';
    }
    if (!t.nuevaFecha) e.nuevaFecha = 'Indica la fecha de la nueva factura.';
    if (!archivos.nueva) e.archivoNueva = 'Adjunta el PDF o imagen de la nueva factura.';
    return e;
  }

  function revisar() {
    const e = validar();
    setErrores(e);
    if (Object.values(e).some(Boolean)) { haptic('warning'); return; }
    setConfirmando(true);
  }

  async function aplicar() {
    if (!cuenta || !archivos.nc || !archivos.nueva) return;
    const fd = new FormData();
    fd.append('nc_serie', t.ncSerie.trim());
    fd.append('nc_numero', t.ncNumero.trim());
    fd.append('motivo_anulacion', t.motivo);
    fd.append('nueva_serie', t.nuevaSerie.trim());
    fd.append('nuevo_numero', t.nuevoNumero.trim());
    fd.append('nueva_fecha_factura', t.nuevaFecha);
    fd.append('archivo_nc', archivos.nc);
    fd.append('archivo_nueva_factura', archivos.nueva);
    if (archivos.anterior) fd.append('archivo_factura_anterior', archivos.anterior);

    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(`/tesoreria/cuentas/${cuenta.id}/cambiar-factura-nc`, { method: 'POST', body: fd });
      if (r.ok === false) throw new Error(r.error || 'No se pudo cambiar la factura');
      haptic('success');
      toast(r.message ?? 'Factura cambiada');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      setConfirmando(false);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmando(false);
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  const elegirArchivo = (campo: keyof Archivos, errKey?: Campo) => (archivo: File | null) => {
    setArchivos(a => ({ ...a, [campo]: archivo }));
    if (errKey) setErrores(prev => ({ ...prev, [errKey]: undefined }));
  };

  return (
    <>
      <Sheet open={!!cuenta} onClose={() => !enviando && onClose()} title="Nota de crédito y cambio de factura"
        footer={<>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={revisar} disabled={enviando}>Revisar y aplicar</Button>
        </>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

          <div className="field field--wide">
            <Notice>
              Factura actual <strong>{facturaActual}</strong> por {soles(cuenta?.total)}. Al aplicar, queda anulada con la nota de crédito y se reemplaza por la nueva.
            </Notice>
          </div>

          <Field label="Serie de la NC" error={errores.ncSerie}>{p => <TextInput {...p} value={t.ncSerie} onChange={cambiar('ncSerie')} placeholder="NC01" />}</Field>
          <Field label="Número de la NC" error={errores.ncNumero}>{p => <TextInput {...p} value={t.ncNumero} onChange={cambiar('ncNumero')} placeholder="000045" />}</Field>
          <Field label="Motivo SUNAT" wide error={errores.motivo}>
            {p => (
              <SelectInput {...p} value={t.motivo} onChange={cambiar('motivo')}>
                <option value="">Elige un motivo</option>
                {MOTIVOS_NC.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            )}
          </Field>
          <Field label="Serie de la nueva factura" error={errores.nuevaSerie}>{p => <TextInput {...p} value={t.nuevaSerie} onChange={cambiar('nuevaSerie')} placeholder="F001" />}</Field>
          <Field label="Número de la nueva factura" error={errores.nuevoNumero}>{p => <TextInput {...p} value={t.nuevoNumero} onChange={cambiar('nuevoNumero')} placeholder="000180" />}</Field>
          <Field label="Fecha de la nueva factura" wide error={errores.nuevaFecha}>{p => <TextInput {...p} type="date" value={t.nuevaFecha} onChange={cambiar('nuevaFecha')} />}</Field>

          <Field label="PDF o imagen de la nota de crédito" wide hint={archivos.nc?.name} error={errores.archivoNC}>
            {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={elegirArchivo('nc', 'archivoNC')} />}
          </Field>
          <Field label="PDF o imagen de la nueva factura" wide hint={archivos.nueva?.name} error={errores.archivoNueva}>
            {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={elegirArchivo('nueva', 'archivoNueva')} />}
          </Field>

          {urlFacturaActual ? (
            <Field label="Factura anterior" wide hint="Su PDF ya está guardado en el histórico">
              {() => <a className="btn btn--secondary btn--sm" href={urlFacturaActual} target="_blank" rel="noreferrer">Ver factura actual</a>}
            </Field>
          ) : (
            <Field label="PDF de la factura anterior (opcional)" wide hint={archivos.anterior?.name ?? 'Para conservarla en el histórico'}>
              {p => <ArchivoInput {...p} accept=".pdf,image/*" onChange={elegirArchivo('anterior')} />}
            </Field>
          )}
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!cuenta && confirmando}
        onClose={() => !enviando && setConfirmando(false)}
        onConfirm={aplicar}
        loading={enviando}
        title="¿Anular la factura y reemplazarla?"
        message={`La factura ${facturaActual} queda anulada con la nota de crédito ${t.ncSerie}-${t.ncNumero} y se reemplaza por ${t.nuevaSerie}-${t.nuevoNumero}. El cambio queda registrado en el historial de la cuenta.`}
        confirmLabel="Aplicar nota de crédito"
      />
    </>
  );
}
