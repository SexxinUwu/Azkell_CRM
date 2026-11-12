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
