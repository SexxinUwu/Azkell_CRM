import { useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { Sheet } from './Sheet';
import { haptic } from '../lib/haptics';
import './otros-tarjetas.css';

export interface OpcionOtros {
  label: string;
  icon?: ReactNode;
  /** Explicación corta debajo del nombre */
  detalle?: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  destructiva?: boolean;
  /** Empieza un grupo nuevo (otra fila de casillas) */
  separado?: boolean;
}

/**
 * Casilla "Otros": junta las acciones secundarias de una pantalla (importar, exportar,
 * imprimir, versión actual…). Al tocarla se abre un panel con casillas, agrupadas como en
 * Herramientas: cada casilla se eleva y se ilumina al pasar el mouse y se hunde al tocarla.
 */
export function MenuOtros({ opciones, label = 'Otros', soloIcono }: { opciones: Array<OpcionOtros | false | null | undefined>; label?: string; soloIcono?: boolean }) {
  const visibles = opciones.filter((o): o is OpcionOtros => !!o);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);

  if (!visibles.length) return null;

  // Grupos: cada opción marcada como "separado" empieza una fila nueva de casillas
  const grupos: Array<Array<{ o: OpcionOtros; i: number }>> = [[]];
  visibles.forEach((o, i) => {
    if (o.separado && grupos[grupos.length - 1].length) grupos.push([]);
    grupos[grupos.length - 1].push({ o, i });
  });

  async function elegir(o: OpcionOtros, i: number) {
    haptic('selection');
    setOcupado(i);
    try { await o.onSelect(); } finally { setOcupado(null); setAbierto(false); }
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn--secondary${soloIcono ? ' btn--icon' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={soloIcono ? label : undefined}
        onClick={() => { haptic('selection'); setAbierto(true); }}
      >
        <Ellipsis size={16} />
        {!soloIcono && label}
      </button>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title={label} ancho>
        <div className="otros-panel">
          {grupos.map((grupo, g) => (
            <section key={g} className="otros-grupo">
              <div className="otros-tarjetas">
                {grupo.map(({ o, i }) => (
                  <button
                    key={o.label}
                    type="button"
                    className={`otros-tile${o.destructiva ? ' otros-tile--peligro' : ''}`}
                    disabled={o.disabled || ocupado !== null}
                    onClick={() => elegir(o, i)}
                  >
                    <span className="otros-tile__icono" aria-hidden>{ocupado === i ? <span className="spinner" /> : o.icon}</span>
                    <span className="otros-tile__texto">
                      <span className="otros-tile__titulo">{o.label}</span>
                      {o.detalle && <span className="otros-tile__detalle">{o.detalle}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
