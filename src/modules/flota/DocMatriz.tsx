import { Button } from '../../core/ui/Button';
import { FileSpreadsheet } from 'lucide-react';
import { exportarExcel } from '../../core/lib/excel';
import { DOCS, colorDoc, textoDias } from './docsEstado';
import type { FilaExpediente } from './DocExpediente';

const fechaCorta = (f: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const celda = (v: unknown) => (v == null || String(v).trim() === '' || String(v).trim() === '---' ? '—' : String(v).trim());

/** Datos de la tabla que se exportan: los mismos que se ven, uno por columna */
function encabezadosYFilas(filas: FilaExpediente[]) {
  const base = ['Placa', 'Color', 'Marca', 'Serie/chasis'];
  const grupos = DOCS.flatMap(d => [...d.datos.map(x => `${d.corto} ${x.etiqueta}`), `${d.corto} F. venc.`, `${d.corto} días`]);
  const datos = filas.map(({ v, m }) => [
    v.placa, celda(v.color), celda(v.marca), celda(v.chasis),
    ...DOCS.flatMap(d => {
      const doc = m.docs.find(x => x.config.clave === d.clave);
      return [
        ...d.datos.map(x => celda(v[x.campo])),
        celda(String(v[d.vencimiento] ?? '').slice(0, 10) || null),
        doc && doc.estado.dias != null ? doc.estado.dias : '',
      ];
    }),
  ]);
  return { encabezados: [...base, ...grupos], datos };
}

// Matriz: una fila por unidad con todos sus documentos y los días que faltan (o que pasaron)
export function DocMatriz({ filas }: { filas: FilaExpediente[] }) {
  const exportar = async () => {
    const { encabezados, datos } = encabezadosYFilas(filas);
    await exportarExcel('Matriz-documentos-flota', 'Matriz', encabezados, datos);
  };

  return (
    <div className="doc-matriz-caja">
      <div className="doc-matriz-caja__cab">
        <span className="doc-matriz-caja__titulo">Matriz general de control documentario</span>
        <Button variant="primary" icon={<FileSpreadsheet size={15} />} disabled={!filas.length} onClick={exportar}>Exportar vista</Button>
      </div>
      <div className="doc-matriz-wrap">
        <table className="doc-matriz">
          <thead>
            <tr>
              <th rowSpan={2}>N°</th>
              <th rowSpan={2}>Placa</th>
              <th rowSpan={2}>Color</th>
              <th rowSpan={2}>Marca</th>
              <th rowSpan={2}>Serie / chasis</th>
              {DOCS.map(d => (
                <th key={d.clave} colSpan={d.datos.length + 2} className="doc-matriz__grupo" style={{ '--grupo-color': colorDoc(d.num) } as React.CSSProperties}>{d.corto}</th>
              ))}
            </tr>
            <tr>
              {DOCS.flatMap(d => [
                ...d.datos.map(x => <th key={`${d.clave}-${x.campo}`}>{x.etiqueta}</th>),
                <th key={`${d.clave}-venc`}>F. venc.</th>,
                <th key={`${d.clave}-dias`}>Días</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {filas.map(({ v, m }, i) => (
              <tr key={v.placa}>
                <td className="doc-matriz__num">{i + 1}</td>
                <td className="doc-matriz__placa">{v.placa}</td>
                <td>{celda(v.color)}</td>
                <td>{celda(v.marca)}</td>
                <td className="doc-matriz__mono">{celda(v.chasis)}</td>
                {DOCS.flatMap(d => {
                  const doc = m.docs.find(x => x.config.clave === d.clave);
                  const registrado = !!doc?.registrado;
                  return [
                    ...d.datos.map(x => <td key={`${v.placa}-${d.clave}-${x.campo}`} className="doc-matriz__mono">{registrado ? celda(v[x.campo]) : '—'}</td>),
                    <td key={`${v.placa}-${d.clave}-venc`} className="doc-matriz__mono">{registrado ? fechaCorta(String(v[d.vencimiento] ?? '')) : '—'}</td>,
                    <td key={`${v.placa}-${d.clave}-dias`} title={doc ? textoDias(doc.estado) : ''}>
                      {registrado && doc && doc.estado.dias != null
                        ? <span className="doc-dias" style={{ background: `${doc.estado.color}22`, color: doc.estado.color }}>{doc.estado.dias}</span>
                        : <span className="doc-dias doc-dias--vacio">—</span>}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
