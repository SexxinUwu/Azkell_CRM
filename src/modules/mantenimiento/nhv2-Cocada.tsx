import { formatFechaHoraPe } from '../../core/lib/format';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { fmtKm, fmtMm, type Cocada } from './nhv2-datos';

// Cocada (profundidad de surco) de un neumático: con cuánto ingresó, con cuánto se montó cada vez, cómo fue bajando y cuánto lleva gastado.
// Sale de la hoja de vida (remanente inicial) y de las mediciones de las inspecciones (R1, R2, R3; el valor "mínimo" es el más bajo de los tres).

const fecha = (f: string | null) => (f ? formatFechaHoraPe(f) : '—');
const dia = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '—');

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string | null }) {
  return (
    <div className="nhv__dato">
      <span className="nhv__dato-etiqueta">{etiqueta}</span>
      <strong className="nhv__dato-valor">{valor}</strong>
      {nota && <small className="nhv-coc__nota">{nota}</small>}
    </div>
  );
}

export function NhvCocada({ c }: { c: Cocada }) {
  const ultimoMontaje = c.montajes.length ? c.montajes[c.montajes.length - 1] : null;
  const alMontar = ultimoMontaje?.alMontar ?? null;
  const sinNada = c.inicial === null && !c.mediciones.length;
  if (sinNada) return <p className="nhv__nota">Todavía no hay mediciones de cocada de este neumático.</p>;
  return (
    <div className="nhv-coc">
      <div className="nhv__rejilla">
        <Dato etiqueta="Al ingresar (alta)" valor={fmtMm(c.inicial)} nota="Cocada inicial de la hoja de vida" />
        <Dato etiqueta="Al montar (último montaje)" valor={fmtMm(alMontar?.minimo ?? null)}
          nota={alMontar ? `${dia(alMontar.fecha)}${ultimoMontaje?.placa ? ` · ${ultimoMontaje.placa} ${ultimoMontaje.posicion ?? ''}` : ''}` : 'Sin medición al montar'} />
        <Dato etiqueta="Actual (última medición)" valor={fmtMm(c.ultima ?? c.actual)} nota={c.mediciones.length ? dia(c.mediciones[c.mediciones.length - 1].fecha) : null} />
        <Dato etiqueta="Desgaste total" valor={c.desgasteMm === null ? '—' : fmtMm(c.desgasteMm)}
          nota={c.mmPor1000Km === null ? null : `${c.mmPor1000Km.toLocaleString('es-PE')} mm cada 1 000 km`} />
      </div>

      {c.montajes.length > 0 && (
        <>
          <h4 className="nhv-coc__sub">Montajes</h4>
          <div className="nhv-coc__montajes">
            {[...c.montajes].reverse().map((m, i) => (
              <div key={`${m.fechaIn}-${i}`} className="nhv-coc__montaje">
                <span className="nhv-coc__unidad">{m.placa ? <LicensePlate plate={m.placa} size="sm" /> : '—'}<b>{m.posicion ? `Pos. ${m.posicion}` : ''}</b></span>
                <span>{dia(m.fechaIn)} → {m.fechaOut ? dia(m.fechaOut) : 'sigue montada'}</span>
                <span>Montó con <b>{fmtMm(m.alMontar?.minimo ?? null)}</b>{m.kmIn != null ? ` · ${fmtKm(m.kmIn)}` : ''}</span>
                <span>{m.fechaOut ? <>Retiró con <b>{fmtMm(m.alRetirar?.minimo ?? null)}</b>{m.kmOut != null ? ` · ${fmtKm(m.kmOut)}` : ''}</> : 'En uso'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {c.mediciones.length > 0 && (
        <>
          <h4 className="nhv-coc__sub">Historial de mediciones</h4>
          <div className="nhv-coc__tabla-wrap">
            <table className="nhv-coc__tabla">
              <thead><tr><th>Fecha</th><th>Origen</th><th>Interno</th><th>Central</th><th>Externo</th><th>Mínimo</th><th>Km</th><th>Unidad</th></tr></thead>
              <tbody>
                {[...c.mediciones].reverse().map((m, i) => (
                  <tr key={`${m.fecha}-${i}`}>
                    <td>{fecha(m.fecha)}</td><td>{m.origen === 'Alta' ? 'Alta (montaje inicial)' : 'Inspección'}</td><td>{m.interno === null ? '—' : fmtMm(m.interno)}</td><td>{m.central === null ? '—' : fmtMm(m.central)}</td><td>{m.externo === null ? '—' : fmtMm(m.externo)}</td>
                    <td><b>{fmtMm(m.minimo)}</b></td><td>{m.km != null ? fmtKm(m.km) : '—'}</td><td>{m.placa ? `${m.placa}${m.posicion ? ` · ${m.posicion}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
