import { useState } from 'react';
import { ArrowDown, Disc3 } from 'lucide-react';
import bandaUrl from './assets/neumatico-banda.png';
import { fmtMm, type FilaSurco } from './nhv2-datos';

/** Foto de la banda con los tres surcos y, a la derecha, medida y desgaste de cada uno. */
export function NhvRanura({ filas }: { filas: FilaSurco[] }) {
  const [sinFoto, setSinFoto] = useState(false);
  return (
    <div className="nhv2-ranura">
      <div className="nhv2-ranura__foto">
        {sinFoto
          ? <Disc3 size={96} strokeWidth={1.25} aria-label="Neumático" />
          : <img src={bandaUrl} alt="Banda del neumático con sus tres surcos" onError={() => setSinFoto(true)} />}
      </div>
      <div className="nhv2-ranura__filas">
        {filas.map(f => {
          const conDesgaste = f.desgaste !== null && f.desgaste > 0;
          return (
            <div className="nhv2-fila" key={f.etiqueta}>
              <span className="nhv2-fila__etiqueta">{f.etiqueta}</span>
              <span className="nhv2-fila__bloque">
                <small>Medida</small>
                <strong>{fmtMm(f.valor)}</strong>
              </span>
              <span className="nhv2-fila__bloque nhv2-fila__bloque--desgaste">
                <small>Desgaste</small>
                <strong className={conDesgaste ? 'is-desgaste' : f.desgaste === null ? 'is-sin-dato' : undefined}>
                  {f.desgaste !== null && <ArrowDown size={14} aria-hidden />}
                  {fmtMm(f.desgaste)}
                </strong>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
