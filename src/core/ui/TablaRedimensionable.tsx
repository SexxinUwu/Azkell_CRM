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
  // Color de la cabecera de toda la tabla (las columnas con `fondo` lo sobreescriben)
  colorEncabezado?: string;
  colorTextoEncabezado?: string;
  // Clase extra del contenedor con scroll (p. ej. para ocultar sus barras)
  className?: string;
}

const CLAVE = (id: string) => `fleet_tabla_${id}`;
const SIN_LIMITE = 720;

// Los anchos se guardan por id de columna (no por posición): si una columna aparece u oculta,
// las demás conservan el ancho que el usuario les dio.
function leerMapa(id: string): Record<string, number> {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE(id)) ?? 'null');
    if (guardado && typeof guardado === 'object' && !Array.isArray(guardado)) {
      return Object.fromEntries(Object.entries(guardado as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>;
    }
  } catch { /* sin acceso a localStorage: se usan los anchos por defecto */ }
  return {};
}

function guardarMapa(id: string, mapa: Record<string, number>) {
  try { localStorage.setItem(CLAVE(id), JSON.stringify(mapa)); } catch { /* modo privado: no se guarda */ }
}

// Tabla con columnas redimensionables como en Excel: arrastra el borde derecho del encabezado,
// o haz doble clic para ajustar la columna al contenido más ancho.
export function TablaRedimensionable({ id, columnas, children, altoMax = '70vh', ariaLabel, colorEncabezado, colorTextoEncabezado, className }: Props) {
  const [mapa, setMapa] = useState<Record<string, number>>(() => leerMapa(id));
  const tablaRef = useRef<HTMLTableElement>(null);
  const anchos = columnas.map(c => Math.max(c.minimo ?? 56, mapa[c.id] ?? c.ancho));
  const total = anchos.reduce((s, x) => s + x, 0);

  useEffect(() => { guardarMapa(id, mapa); }, [id, mapa]);

  const fijar = (colId: string, ancho: number) => setMapa(m => ({ ...m, [colId]: ancho }));

  function arrastrar(i: number, e: PointerReact<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    const asa = e.currentTarget;
    const x0 = e.clientX;
    const w0 = anchos[i];
    const minimo = columnas[i].minimo ?? 56;
    const colId = columnas[i].id;
    asa.setPointerCapture(e.pointerId);
    const mover = (ev: PointerEvent) => {
      fijar(colId, Math.min(SIN_LIMITE, Math.max(minimo, w0 + ev.clientX - x0)));
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
    fijar(columnas[i].id, Math.min(SIN_LIMITE, Math.max(columnas[i].minimo ?? 56, Math.ceil(ancho) + 28)));
  }

  return (
    <div className={`tabla-redim${className ? ` ${className}` : ''}`} style={{ maxHeight: altoMax }}>
      {/* Ocupa todo el ancho disponible: si sobra espacio, las columnas se reparten el excedente */}
      <table ref={tablaRef} aria-label={ariaLabel} className="tabla-redim__tabla" style={{ width: '100%', minWidth: total }}>
        <colgroup>{anchos.map((a, i) => <col key={columnas[i].id} style={{ width: a }} />)}</colgroup>
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c.id} style={{ textAlign: c.alinear ?? 'left', ...(c.fondo ? { background: c.fondo, color: '#ffffff' } : colorEncabezado ? { background: colorEncabezado, color: colorTextoEncabezado } : {}) }}>
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
