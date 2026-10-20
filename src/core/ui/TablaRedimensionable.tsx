import './tabla.css';
import { useEffect, useRef, useState, type PointerEvent as PointerReact, type ReactNode } from 'react';

export interface ColumnaTabla {
  id: string;
  titulo: ReactNode;
  ancho: number;
  minimo?: number;
  alinear?: 'left' | 'right' | 'center';
  // Color de fondo del encabezado (grupos como el teórico o el GPS); el texto pasa a blanco
  fondo?: string;
}

interface Props {
  // Identifica la tabla: los anchos que ajusta el usuario se guardan con esta clave
  id: string;
  columnas: ColumnaTabla[];
  children: ReactNode;
  // Altura máxima del área con scroll (la cabecera queda fija)
  altoMax?: string;
  ariaLabel: string;
}

const CLAVE = (id: string) => `fleet_tabla_${id}`;
const SIN_LIMITE = 720;

function leerAnchos(id: string, columnas: ColumnaTabla[]): number[] {
  const base = columnas.map(c => c.ancho);
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE(id)) ?? 'null');
    if (Array.isArray(guardado) && guardado.length === columnas.length && guardado.every(x => typeof x === 'number' && x > 0)) {
      return guardado.map((x, i) => Math.max(columnas[i].minimo ?? 56, x));
    }
  } catch { /* sin acceso a localStorage: se usan los anchos por defecto */ }
  return base;
}

function guardarAnchos(id: string, anchos: number[]) {
  try { localStorage.setItem(CLAVE(id), JSON.stringify(anchos)); } catch { /* modo privado: no se guarda */ }
}

// Tabla con columnas redimensionables como en Excel: arrastra el borde derecho del encabezado,
// o haz doble clic para ajustar la columna al contenido más ancho.
export function TablaRedimensionable({ id, columnas, children, altoMax = '70vh', ariaLabel }: Props) {
  const [anchos, setAnchos] = useState<number[]>(() => leerAnchos(id, columnas));
  const tablaRef = useRef<HTMLTableElement>(null);
  const total = anchos.reduce((s, x) => s + x, 0);

  useEffect(() => { guardarAnchos(id, anchos); }, [id, anchos]);

  function arrastrar(i: number, e: PointerReact<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    const asa = e.currentTarget;
    const x0 = e.clientX;
    const w0 = anchos[i];
    const minimo = columnas[i].minimo ?? 56;
    asa.setPointerCapture(e.pointerId);
    const mover = (ev: PointerEvent) => {
      const nuevo = Math.min(SIN_LIMITE, Math.max(minimo, w0 + ev.clientX - x0));
      setAnchos(a => a.map((x, k) => (k === i ? nuevo : x)));
    };
    const fin = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', fin);
      asa.removeEventListener('pointercancel', fin);
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', fin);
    asa.addEventListener('pointercancel', fin);
  }

  function autoajustar(i: number) {
    const tabla = tablaRef.current;
    if (!tabla) return;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    let ancho = 0;
    const medir = (celda: HTMLTableCellElement, texto: string) => {
      const st = getComputedStyle(celda);
      ctx.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      ancho = Math.max(ancho, ctx.measureText(texto).width);
    };
    const cabecera = tabla.tHead?.rows[0]?.cells[i];
    if (cabecera) medir(cabecera, (cabecera.textContent ?? '').trim());
    for (const fila of Array.from(tabla.tBodies[0]?.rows ?? [])) {
      // Las filas expandidas ocupan toda la tabla (colSpan): no sirven para medir la columna
      if (fila.cells.length !== columnas.length) continue;
      const celda = fila.cells[i];
      if (celda) medir(celda, (celda.textContent ?? '').trim());
    }
    const nuevo = Math.min(SIN_LIMITE, Math.max(columnas[i].minimo ?? 56, Math.ceil(ancho) + 28));
    setAnchos(a => a.map((x, k) => (k === i ? nuevo : x)));
  }

  return (
    <div className="tabla-redim" style={{ maxHeight: altoMax }}>
      <table ref={tablaRef} aria-label={ariaLabel} className="tabla-redim__tabla" style={{ width: total }}>
        <colgroup>{anchos.map((a, i) => <col key={columnas[i].id} style={{ width: a }} />)}</colgroup>
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c.id} style={{ textAlign: c.alinear ?? 'left', ...(c.fondo ? { background: c.fondo, color: '#ffffff' } : {}) }}>
                <span className="tabla-redim__titulo">{c.titulo}</span>
                <span
                  className="tabla-redim__asa"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ajustar ancho de ${typeof c.titulo === 'string' ? c.titulo : c.id}`}
                  title="Arrastra para ajustar · doble clic para ajustar al contenido"
                  onPointerDown={e => arrastrar(i, e)}
                  onDoubleClick={e => { e.stopPropagation(); autoajustar(i); }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// Celda con texto recortado; el texto completo queda en el tooltip
export function Celda({ children, alinear, mono, className }: { children?: ReactNode; alinear?: 'left' | 'right' | 'center'; mono?: boolean; className?: string }) {
  const texto = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  return (
    <td title={texto} className={`tabla-redim__celda${mono ? ' tabla-redim__celda--mono' : ''}${className ? ' ' + className : ''}`} style={{ textAlign: alinear ?? 'left' }}>
      {children}
    </td>
  );
}
