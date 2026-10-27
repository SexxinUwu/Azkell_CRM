import { useState, type ReactNode } from 'react';
import { ChevronDown, CircleDashed, CircleDot, Disc, Disc3, Flame, Gauge, Hammer, Receipt, Truck } from 'lucide-react';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { EmptyState } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { ETIQUETA_EVENTO, fmtKm, fmtDos, fmtPsi, type Evento, type TipoEvento } from './nhv2-datos';

const ICONO: Record<TipoEvento, ReactNode> = {
  APLICACION: <Truck size={16} />,
  RETIRO: <CircleDashed size={16} />,
  REFORMA: <Disc size={16} />,
  MEDICION_PRESION: <Gauge size={16} />,
  APUNTE_SURCO: <Hammer size={16} />,
  MARCA_FUEGO: <Flame size={16} />,
  COMPRA: <Receipt size={16} />,
  OTRO: <CircleDot size={16} />,
};

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="nhv2-ev__dato">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EventoItem({ e }: { e: Evento }) {
  // Unidad del valor según el tipo: presión en PSI; el resto se muestra como número
  const valor = e.valor === null ? null
    : e.tipo === 'MEDICION_PRESION' ? fmtPsi(e.valor)
    : fmtDos(e.valor);
  const tieneDatos = e.placa || e.posicion || e.proveedor || e.km !== null || valor;

  return (
    <li className={`nhv2-ev nhv2-ev--${e.tipo.toLowerCase().replace(/_/g, '-')}`}>
      <span className="nhv2-ev__icono" aria-hidden>{ICONO[e.tipo]}</span>
      <div className="nhv2-ev__cuerpo">
        <div className="nhv2-ev__cab">
          <strong className="nhv2-ev__titulo">{e.titulo ?? ETIQUETA_EVENTO[e.tipo]}</strong>
          <time className="nhv2-ev__fecha" dateTime={e.fecha ?? undefined}>{formatFechaHoraPe(e.fecha)}</time>
        </div>
        {tieneDatos && (
          <dl className="nhv2-ev__datos">
            {e.placa && <Dato etiqueta="Vehículo"><LicensePlate plate={e.placa} size="sm" /></Dato>}
            {e.posicion && <Dato etiqueta="Posición">{e.posicion}</Dato>}
            {e.proveedor && <Dato etiqueta="Proveedor">{e.proveedor}</Dato>}
            {e.km !== null && <Dato etiqueta="Distancia">{fmtKm(e.km)}</Dato>}
            {valor && <Dato etiqueta="Valor">{valor}</Dato>}
          </dl>
        )}
        {e.detalle && <p className="nhv2-ev__detalle">{e.detalle}</p>}
      </div>
    </li>
  );
}

/** Línea de tiempo de la llanta: aplicaciones, reformas, mediciones, marca de fuego y compra. Los más nuevos primero. */
export function NhvTimeline({ eventos }: { eventos: Evento[] }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <section className="nhv2-timeline" aria-label="Timeline del neumático">
      <button
        type="button"
        className="nhv2-timeline__cab"
        aria-expanded={abierto}
        onClick={() => { haptic('selection'); setAbierto(v => !v); }}
      >
        <span>Timeline</span>
        <ChevronDown size={18} className={`nhv__chev${abierto ? ' is-abierto' : ''}`} aria-hidden />
      </button>
      {abierto && (
        eventos.length === 0 ? (
          <EmptyState icon={<Disc3 size={22} />} title="Sin eventos registrados" />
        ) : (
          <ol className="nhv2-timeline__lista">
            {eventos.map((e, i) => <EventoItem key={`${e.tipo}-${e.fecha ?? 'x'}-${i}`} e={e} />)}
          </ol>
        )
      )}
    </section>
  );
}
