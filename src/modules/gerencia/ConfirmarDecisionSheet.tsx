import type { ReactNode } from 'react';
import { CheckCircle, MessageSquare, ThumbsUp, XCircle } from 'lucide-react';
import './gerencia-oc.css';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { formatMoneda } from '../../core/lib/format';
import type { OrdenCompra } from './api';
import type { AccionOc } from './DetalleOcSheet';

interface Props {
  open: boolean;
  tipo: AccionOc;
  orden: OrdenCompra | null;
  comentario: string;
  onComentario: (texto: string) => void;
  confirmado: boolean;
  onConfirmado: (valor: boolean) => void;
  procesando: boolean;
  errAccion: string | null;
  errCampo?: string;
  onCerrar: () => void;
  onConfirmar: () => void;
}

const CONTENIDO: Record<AccionOc, {
  titulo: string; mensaje: string; etiqueta: string; boton: string; icono: ReactNode; claseIcono: string;
}> = {
  aprobar: {
    titulo: 'Autorizar orden de compra',
    mensaje: 'Al autorizar, la orden queda aprobada y sus datos pasan a Pagos de requerimientos en Tesorería.',
    etiqueta: 'Comentario / observación (opcional)',
    boton: 'Autorizar ahora',
    icono: <ThumbsUp size={28} aria-hidden />,
    claseIcono: '',
  },
  rechazar: {
    titulo: 'Rechazar / desestimar orden',
    mensaje: 'La adquisición queda desestimada. Escribe el motivo: quedará registrado para el solicitante y la auditoría.',
    etiqueta: 'Motivo del rechazo (obligatorio)',
    boton: 'Rechazar orden',
    icono: <XCircle size={28} aria-hidden />,
    claseIcono: 'ga-confirm__icono--rechazo',
  },
  observar: {
    titulo: 'Observar y solicitar sustento',
    mensaje: 'La orden queda en revisión. Indica qué sustento técnico o cotización alternativa necesitas del solicitante.',
    etiqueta: 'Sustento o cotización que falta (obligatorio)',
    boton: 'Enviar observación',
    icono: <MessageSquare size={28} aria-hidden />,
    claseIcono: 'ga-confirm__icono--observa',
  },
};

/** Ventana de conformidad para aprobar, rechazar u observar una orden. */
export function ConfirmarDecisionSheet({
  open, tipo, orden, comentario, onComentario, confirmado, onConfirmado, procesando, errAccion, errCampo, onCerrar, onConfirmar,
}: Props) {
  const c = CONTENIDO[tipo];
  const aprobar = tipo === 'aprobar';
  const bloqueado = procesando || (aprobar && !confirmado);

  return (
    <Sheet
      open={open}
      onClose={() => !procesando && onCerrar()}
      title={c.titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onCerrar} disabled={procesando}>Cerrar</Button>
          <Button
            variant={aprobar ? 'primary' : tipo === 'rechazar' ? 'danger' : 'secondary'}
            onClick={onConfirmar}
            loading={procesando}
            disabled={bloqueado}
          >
            {c.boton}
          </Button>
        </>
      }
    >
      {orden && (
        <div className="ga-confirm">
          <span className={`ga-confirm__icono ${c.claseIcono}`}>{c.icono}</span>
          <p className="ga-confirm__mensaje">{c.mensaje}</p>

          <span className="ga-confirm__codigo">{orden.id}</span>
          <span className="ga-confirm__monto">{formatMoneda(orden.total_oc, orden.moneda)}</span>

          {aprobar && (
            <>
              <label className="ga-confirm__check">
                <input type="checkbox" checked={confirmado} onChange={e => onConfirmado(e.target.checked)} />
                <span>Confirmo realizar la autorización de esta orden</span>
              </label>
              <span className="ga-confirm__traspaso">
                <CheckCircle size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Se traspasarán estos datos a Pagos de requerimientos en Tesorería.
              </span>
            </>
          )}

          <div className="ga-confirm__campo">
            <label htmlFor="ga-comentario">{c.etiqueta}</label>
            <textarea
              id="ga-comentario"
              rows={3}
              value={comentario}
              onChange={e => onComentario(e.target.value)}
              placeholder={tipo === 'observar' ? 'Qué sustento técnico o cotización alternativa necesitas…' : 'Escribe aquí…'}
              aria-invalid={!!errCampo || undefined}
            />
            {errCampo && <span style={{ fontSize: '0.8rem', color: 'var(--red-ink)' }}>{errCampo}</span>}
          </div>

          {errAccion && <div className="ga-confirm__error"><Notice tone="error">{errAccion}</Notice></div>}
        </div>
      )}
    </Sheet>
  );
}
