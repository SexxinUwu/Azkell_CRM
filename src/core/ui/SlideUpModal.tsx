import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SlideUpModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
  /** Pie del modal (botones de acción) */
  footer?: ReactNode;
}

export function SlideUpModal({ open, onClose, title, subtitle, children, width = '80%', footer }: SlideUpModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Bloquear scroll del body
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        animation: 'slideup-bg-in 0.18s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          width,
          maxWidth: '98vw',
          minWidth: 340,
          maxHeight: '92vh',
          background: 'var(--bg-primary, #fff)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideup-panel-in 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--separator)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--label-1)', lineHeight: 1.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.8rem', color: 'var(--label-2)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--fill-2)', border: 'none', borderRadius: '50%',
              width: 30, height: 30, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--label-2)', flexShrink: 0, marginLeft: 12,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--separator)',
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--fill-1)',
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideup-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideup-panel-in {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Botón primario para footer del modal */
export function ModalBtn({
  children, onClick, type = 'button', disabled, variant = 'primary', loading,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  loading?: boolean;
}) {
  const bg = variant === 'danger' ? 'var(--red-ink)' : variant === 'ghost' ? 'var(--fill-2)' : 'var(--accent)';
  const color = variant === 'ghost' ? 'var(--label-1)' : '#fff';
  const border = variant === 'ghost' ? '1px solid var(--separator)' : 'none';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '9px 22px', borderRadius: 9, background: bg, color, border,
        fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
        opacity: (disabled || loading) ? 0.55 : 1,
        minWidth: 90,
      }}
    >
      {loading ? 'Guardando…' : children}
    </button>
  );
}
