import './seguimiento.css';
import type { ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { haptic } from '../../core/lib/haptics';

// Piezas compartidas de las fichas de orden de servicio y de viaje: título con estado, tarjetas con icono,
// franja de puntos de carga y descarga, pestañas con contador y datos sueltos.

export function TituloFicha({ codigo, estado, sub }: { codigo: string; estado?: ReactNode; sub?: ReactNode }) {
  return (
    <span className="fc-titulo">
      <span className="fc-titulo__fila"><span className="fc-titulo__cod">{codigo}</span>{estado}</span>
      {sub ? <span className="fc-titulo__sub">{sub}</span> : null}
    </span>
  );
}

export function FichaGrid({ children }: { children: ReactNode }) {
  return <div className="fc-grid">{children}</div>;
}

export function FichaCard({ icono, label, valor, sub }: { icono: ReactNode; label: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="fc-card">
      <span className="fc-card__ico" aria-hidden>{icono}</span>
      <div className="fc-card__txt">
        <span className="fc-card__label">{label}</span>
        <strong className="fc-card__valor">{valor}</strong>
        {sub ? <small className="fc-card__sub">{sub}</small> : null}
      </div>
    </div>
  );
}

export interface PuntoFicha { titulo?: string | null; detalle?: string | null; extra?: string | null }

function Punto({ icono, etiqueta, p }: { icono: ReactNode; etiqueta: string; p: PuntoFicha }) {
  return (
    <div className="fc-punto">
      <span className="fc-punto__tag">{icono}{etiqueta}</span>
      <p className="fc-punto__linea"><strong>{p.titulo || '—'}</strong>{p.extra ? <span> · {p.extra}</span> : null}</p>
      <p className="fc-punto__dir">{p.detalle || 'Sin dirección todavía'}</p>
    </div>
  );
}

export function PuntosStrip({ carga, descarga }: { carga: PuntoFicha; descarga: PuntoFicha }) {
  return (
    <section className="fc-puntos" aria-label="Puntos de carga y descarga">
      <Punto icono={<ArrowUpFromLine size={14} />} etiqueta="Punto de carga" p={carga} />
      <Punto icono={<ArrowDownToLine size={14} />} etiqueta="Punto de descarga" p={descarga} />
    </section>
  );
}

export function Pestanas<T extends string>({ tabs, valor, onChange }: { tabs: { id: T; label: string; icono: ReactNode; n?: number }[]; valor: T; onChange: (t: T) => void }) {
  return (
    <nav className="vj-tabs" role="tablist" aria-label="Secciones">
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={valor === t.id} className={`vj-tab${valor === t.id ? ' vj-tab--on' : ''}`}
          onClick={() => { haptic('selection'); onChange(t.id); }}>
          {t.icono}{t.label}
          {t.n ? <span className="vj-tab__n">{t.n}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function Dato({ label, valor, nota, mono, ancho }: { label: string; valor?: ReactNode; nota?: string | null; mono?: boolean; ancho?: boolean }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div className={`vj-tile${ancho ? ' vj-tile--ancho' : ''}`}>
      <span className="vj-tile__label">{label}</span>
      <span className={`vj-tile__valor${mono ? ' vj-tile__valor--mono' : ''}`}>{valor}</span>
      {nota ? <small className="vj-tile__nota">{nota}</small> : null}
    </div>
  );
}
