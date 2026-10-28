import { useEffect, useState, type ReactNode } from 'react';
import { Check, CircleAlert, PackageCheck, Trash2, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { TextInput } from '../../core/ui/Field';

// Diálogos de la salida, con el diseño del clásico: icono grande, texto y dos botones circulares
// (X para cancelar, y la acción). Mismo flujo que el clásico (modalSalidaDespacharConfirm / modalSalidaAnularConfirm).

function Circulares({ onCancelar, onAccion, accion, tono, disabled }: {
  onCancelar: () => void; onAccion: () => void; accion: ReactNode; tono: 'verde' | 'rojo'; disabled?: boolean;
}) {
  return (
    <div className="sal-circulos">
      <button type="button" className="sal-circulo sal-circulo--negro" onClick={onCancelar} aria-label="Cancelar" title="Cancelar" disabled={disabled}>
        <X size={22} strokeWidth={2.5} />
      </button>
      <button type="button" className={`sal-circulo sal-circulo--${tono}`} onClick={onAccion} disabled={disabled} aria-busy={disabled || undefined}
        aria-label={typeof accion === 'string' ? accion : 'Confirmar'} title={typeof accion === 'string' ? accion : 'Confirmar'}>
        {accion}
      </button>
    </div>
  );
}

/** ¿Despachar? El texto lo arma la página (despacho total o parcial) */
export function DespacharDialogo({ open, onClose, onConfirmar, mensaje, cargando }: {
  open: boolean; onClose: () => void; onConfirmar: () => void; mensaje: ReactNode; cargando: boolean;
}) {
  return (
    <Sheet open={open} onClose={() => !cargando && onClose()} title="Confirmar despacho" ancho={false}>
      <div className="sal-dialogo">
        <div className="sal-dialogo__icono sal-dialogo__icono--verde" aria-hidden><PackageCheck size={46} strokeWidth={1.75} /></div>
        <h3 className="sal-dialogo__titulo">¿Confirmar despacho?</h3>
        <p className="sal-dialogo__texto">{mensaje}</p>
        <Circulares onCancelar={onClose} onAccion={onConfirmar} tono="verde" disabled={cargando}
          accion={<Check size={24} strokeWidth={2.5} />} />
      </div>
    </Sheet>
  );
}

/** ¿Anular? Motivo opcional; si va vacío se guarda "Anulado por el usuario" (como el clásico) */
export function AnularDialogo({ open, folio, onClose, onConfirmar, cargando }: {
  open: boolean; folio: string; onClose: () => void; onConfirmar: (motivo: string) => void; cargando: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (open) setMotivo(''); }, [open]);
  return (
    <Sheet open={open} onClose={() => !cargando && onClose()} title="Anular salida" ancho={false}>
      <div className="sal-dialogo">
        <div className="sal-dialogo__icono sal-dialogo__icono--rojo" aria-hidden><CircleAlert size={46} strokeWidth={1.75} /></div>
        <h3 className="sal-dialogo__titulo">¿Anular esta salida?</h3>
        <p className="sal-dialogo__texto">
          Esta acción cancelará la solicitud de salida <strong>{folio}</strong> y no podrá ser despachada.
        </p>
        <label className="field" style={{ textAlign: 'left', marginBottom: 'var(--s-4)' }}>
          <span className="field__label">Motivo de anulación (opcional)</span>
          <TextInput value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Repuestos no requeridos / Error de tipeo" />
        </label>
        <Circulares onCancelar={onClose} onAccion={() => onConfirmar(motivo.trim() || 'Anulado por el usuario')} tono="rojo" disabled={cargando}
          accion={<Trash2 size={22} strokeWidth={2.25} />} />
      </div>
    </Sheet>
  );
}

/** Aviso con un botón "Aceptar" (stock insuficiente, validaciones) */
export function AvisoSheet({ open, onClose, titulo, children }: { open: boolean; onClose: () => void; titulo: string; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={titulo}
      footer={<Button variant="primary" onClick={onClose} style={{ width: '100%' }}>Aceptar</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', fontSize: '0.9375rem' }}>{children}</div>
    </Sheet>
  );
}
