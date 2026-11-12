import type { ReactNode } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { Button } from './Button';
import { SearchField } from './Field';
import { Sheet } from './Sheet';

/**
 * Barra de un listado, igual en web y celular: búsqueda, vista y el botón Filtros.
 * Lo que se filtra (empresa, estado…) va en la hoja que abre el botón.
 */
export function BarraFiltros({ busqueda, onBusqueda, placeholder, activos, onAbrirFiltros, children }: {
  busqueda: string;
  onBusqueda: (v: string) => void;
  placeholder: string;
  /** Cuántos filtros están activos (muestra el contador en el botón) */
  activos: number;
  onAbrirFiltros: () => void;
  /** Controles de vista (por ejemplo, tablero o gráficos) */
  children?: ReactNode;
}) {
  return (
    <div className="toolbar placas-toolbar">
      <div className="placas-toolbar__buscar">
        <SearchField value={busqueda} onChange={onBusqueda} placeholder={placeholder} />
      </div>
      {children}
      <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={onAbrirFiltros}
        aria-label={activos ? `Filtros, ${activos} activos` : 'Filtros'}>
        <span className="placas-filtros__texto">Filtros</span>
        {activos > 0 && <span className="placas-filtros__n t-numeric">{activos}</span>}
      </Button>
    </div>
  );
}

/** Hoja de filtros: cada grupo es un título con sus opciones. "Ver N" solo cierra la hoja. */
export function HojaFiltros({ open, onClose, activos, onLimpiar, resultado, unidad = 'unidad', children }: {
  open: boolean;
  onClose: () => void;
  activos: number;
  onLimpiar: () => void;
  resultado: number;
  /** Singular del conteo: "unidad", "documento"… */
  unidad?: string;
  children: ReactNode;
}) {
  const plural = unidad === 'documento' ? 'documentos' : `${unidad}s`;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      footer={
        <>
          <Button variant="secondary" disabled={!activos} onClick={onLimpiar}>Quitar filtros</Button>
          <Button variant="primary" onClick={onClose}>Ver {resultado} {resultado === 1 ? unidad : plural}</Button>
        </>
      }
    >
      <div className="placas-filtros">{children}</div>
    </Sheet>
  );
}

export function GrupoFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="placas-filtros__grupo">
      <h3 className="placas-filtros__titulo t-footnote">{titulo}</h3>
      {children}
    </section>
  );
}

export interface OpcionLista<T extends string> { value: T; label: string; count?: number }

/** Lista de una sola elección (filas con check): para filtros de estado u otras opciones cortas */
export function ListaEleccion<T extends string>({ opciones, value, onChange }: { opciones: OpcionLista<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="list">
      {opciones.map(o => {
        const sel = o.value === value;
        return (
          <button key={o.value} type="button" className="row" aria-pressed={sel} onClick={() => onChange(o.value)}
            style={{ width: '100%', textAlign: 'left', border: 0, background: 'none', font: 'inherit', color: 'inherit' }}>
            <div className="row__main"><div className="row__title">{o.label}</div></div>
            {o.count !== undefined && <span className="c-secondary t-numeric">{o.count}</span>}
            {sel && <Check size={18} style={{ color: 'var(--accent)' }} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
