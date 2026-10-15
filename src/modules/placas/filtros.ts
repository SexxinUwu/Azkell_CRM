// Filtros de la lista de placas. Un solo lugar define qué unidades entran: la lista, el Excel y el
// reporte PDF usan `filtrarPlacas`, así lo que se ve es lo que se exporta.
import { coincide, type Placa } from './api';

export type Clase = 'todas' | 'motoras' | 'no-motoras';
export type SiNo = 'todas' | 'si' | 'no';

export interface FiltrosPlacas {
  clase: Clase;
  enUso: SiNo;
  estados: string[];
  tipos: string[];
  clientes: string[];
  marcas: string[];
  combustibles: string[];
  utss: string[];
  configuraciones: string[];
}

export const FILTROS_VACIOS: FiltrosPlacas = {
  clase: 'todas', enUso: 'todas', estados: [], tipos: [], clientes: [], marcas: [], combustibles: [], utss: [], configuraciones: [],
};

const LISTAS = ['estados', 'tipos', 'clientes', 'marcas', 'combustibles', 'utss', 'configuraciones'] as const;

/** Cuántos criterios están activos (para el contador del botón Filtros) */
export function cuentaFiltros(f: FiltrosPlacas) {
  return (f.clase !== 'todas' ? 1 : 0) + (f.enUso !== 'todas' ? 1 : 0)
    + LISTAS.reduce((n, k) => n + f[k].length, 0);
}

// Dentro de un mismo criterio basta con una opción; entre criterios deben cumplirse todos.
const en = (lista: string[], valor: string) => !lista.length || lista.includes(valor);

export function filtrarPlacas(placas: Placa[], f: FiltrosPlacas, busqueda: string) {
  return placas.filter(p =>
    coincide(p, busqueda)
    && (f.clase === 'todas' || (f.clase === 'motoras') === p.motora)
    && (f.enUso === 'todas' || (f.enUso === 'si') === p.enUso)
    && en(f.estados, p.estado) && en(f.tipos, p.tipo) && en(f.clientes, p.cliente) && en(f.marcas, p.marca)
    && en(f.combustibles, p.combustible) && en(f.utss, p.uts) && en(f.configuraciones, p.configuracion),
  );
}

/** Valores distintos de un campo, ordenados y sin vacíos (opciones de cada filtro) */
export function valoresDe(placas: Placa[], campo: keyof Placa): string[] {
  const valores = placas.map(p => String(p[campo] ?? '').trim()).filter(Boolean);
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Criterios activos en lenguaje de persona, para el encabezado del reporte */
export function describirFiltros(f: FiltrosPlacas, busqueda: string): string[] {
  const d: string[] = [];
  if (busqueda.trim()) d.push(`Búsqueda: «${busqueda.trim()}»`);
  if (f.clase !== 'todas') d.push(`Clase: ${f.clase === 'motoras' ? 'motoras' : 'no motoras'}`);
  if (f.enUso !== 'todas') d.push(f.enUso === 'si' ? 'En uso' : 'Fuera de uso');
  const nombres: Array<[string, string[]]> = [
    ['Estado', f.estados], ['Tipo', f.tipos], ['Cliente', f.clientes], ['Marca', f.marcas],
    ['Combustible', f.combustibles], ['UTS', f.utss], ['Configuración', f.configuraciones],
  ];
  for (const [nombre, lista] of nombres) if (lista.length) d.push(`${nombre}: ${lista.join(', ')}`);
  return d;
}
