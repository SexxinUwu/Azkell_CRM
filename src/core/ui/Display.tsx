// Piezas de presentación pequeñas: avatar, insignia, estado vacío, aviso, encabezado.
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { CircleAlert } from 'lucide-react';
import { initials } from '../lib/format';
import { spring } from '../lib/motion';

export function Avatar({ name, size, accent, src }: { name: string; size?: 'sm' | 'lg'; accent?: boolean; src?: string | null }) {
  const clases = `avatar${size ? ` avatar--${size}` : ''}${accent ? ' avatar--accent' : ''}`;
  if (src) return <img className={`${clases} avatar--foto`} src={src} alt="" aria-hidden />;
  return <span className={clases} aria-hidden>{initials(name)}</span>;
}

type BadgeTone = 'gray' | 'accent' | 'green' | 'amber' | 'red' | 'ink';
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge${tone !== 'gray' ? ` badge--${tone}` : ''}`}>{children}</span>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <p className="empty__title">{title}</p>
      {children && <p className="t-callout">{children}</p>}
    </div>
  );
}

export function Notice({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'error' | 'accent' | 'success'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`notice${tone !== 'neutral' ? ` notice--${tone}` : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      {icon ?? (tone === 'error' ? <CircleAlert size={16} /> : null)}
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <motion.header
      className="page-header"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="page-header__text">
        {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
        <h1 className="t-title1">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </motion.header>
  );
}

// Contenedor de página con entrada suave.
// `push`: pantalla de detalle (un nivel más adentro) — entra desde la derecha, como en iOS.
export function Page({ children, narrow, push }: { children: ReactNode; narrow?: boolean; push?: boolean }) {
  return (
    <motion.div
      className={`page${narrow ? ' page--narrow' : ''}`}
      initial={push ? { opacity: 0, x: 28 } : { opacity: 0 }}
      animate={push ? { opacity: 1, x: 0 } : { opacity: 1 }}
      transition={push ? spring : { duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}
