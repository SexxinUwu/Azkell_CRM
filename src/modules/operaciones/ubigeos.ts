import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

// Catálogo de ubigeos del INEI (1 874 distritos, versión 2016). El archivo se carga solo cuando hace falta, no pesa en el resto de la app.
export interface Ubigeo { codigo: string; distrito: string; provincia: string; departamento: string }

let cache: Ubigeo[] | null = null;
export async function cargarUbigeos(): Promise<Ubigeo[]> {
  if (!cache) {
    const m = await import('./ubigeos.json');
    cache = (m.default as string[][]).map(([codigo, distrito, provincia, departamento]) => ({ codigo, distrito, provincia, departamento }));
  }
  return cache;
}

export function useUbigeos() {
  return useQuery<Ubigeo[]>({ queryKey: ['ubigeos'], queryFn: cargarUbigeos, staleTime: Infinity, gcTime: Infinity });
}

/** Texto corto para listas y rutas: «Ate, Lima» */
export const etiquetaUbigeo = (u: Ubigeo) => `${u.distrito}, ${u.departamento}`;

/** Opciones para el Combobox: se busca por distrito, provincia, departamento o el propio código (sin tildes) */
export function useOpcionesUbigeo() {
  const q = useUbigeos();
  const opciones = useMemo(() => (q.data ?? []).map(u => ({
    value: u.codigo,
    label: u.distrito,
    description: `${u.provincia}, ${u.departamento} · ${u.codigo}`,
    keywords: `${u.provincia} ${u.departamento} ${u.codigo}`,
  })), [q.data]);
  const porCodigo = useMemo(() => new Map((q.data ?? []).map(u => [u.codigo, u])), [q.data]);
  return { opciones, porCodigo, cargando: q.isLoading };
}

const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Detecta el distrito de una dirección que termina en «DISTRITO - PROVINCIA - DEPARTAMENTO» (como imprimen las guías de remisión),
 * por ejemplo «CARRETERA CENTRAL KM 12 - ATE - LIMA - LIMA». Devuelve null si no hay una coincidencia clara.
 */
export function ubigeoDeDireccion(direccion: string | null | undefined, lista: Ubigeo[]): Ubigeo | null {
  const partes = String(direccion ?? '').split(/\s+[-–]\s+|\s*,\s*/).map(normalizar).filter(Boolean);
  const n = partes.length;
  if (n < 2 || !lista.length) return null;
  if (n >= 3) {
    const [d, p, dep] = [partes[n - 3], partes[n - 2], partes[n - 1]];
    const exacta = lista.filter(u => normalizar(u.distrito) === d && normalizar(u.provincia) === p && normalizar(u.departamento) === dep);
    if (exacta.length === 1) return exacta[0];
  }
  // Solo «DISTRITO - PROVINCIA» o «DISTRITO - DEPARTAMENTO»: vale si es la única coincidencia
  const [d, resto] = [partes[n - 2], partes[n - 1]];
  const parcial = lista.filter(u => normalizar(u.distrito) === d && (normalizar(u.provincia) === resto || normalizar(u.departamento) === resto));
  return parcial.length === 1 ? parcial[0] : null;
}
