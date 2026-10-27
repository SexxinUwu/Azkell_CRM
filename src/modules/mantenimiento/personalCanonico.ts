import { useMemo } from 'react';
import { nombreCompleto, usePersonal } from '../personal/api';
import { claveNombre, distancia, nombrePropio } from '../../core/lib/texto';

/**
 * Nombre del directorio de personal para un nombre escrito en taller. Los trabajos antiguos se registraron
 * de distintas formas: primero se busca la coincidencia exacta (sin tildes ni mayúsculas) y después la más
 * parecida, para los errores de tecleo. Si no hay ninguna, se muestra con mayúscula inicial.
 */
export function usePersonalCanonico(): (registrado: string | null | undefined) => string {
  const { data } = usePersonal();
  return useMemo(() => {
    const directorio = (data ?? []).map(p => ({ clave: claveNombre(nombreCompleto(p)), nombre: nombrePropio(nombreCompleto(p)) }));
    const exactos = new Map(directorio.map(d => [d.clave, d.nombre]));
    const cache = new Map<string, string>();

    return (registrado: string | null | undefined): string => {
      const limpio = String(registrado ?? '').trim();
      if (!limpio) return '';
      const clave = claveNombre(limpio);
      const guardado = cache.get(clave);
      if (guardado !== undefined) return guardado;

      let resultado: string | undefined = exactos.get(clave);
      if (resultado === undefined) {
        // Un error de tecleo: se acepta si la diferencia es pequeña frente al largo del nombre
        const tope = Math.max(2, Math.floor(clave.length * 0.12));
        let mejorDistancia = Infinity;
        for (const d of directorio) {
          const dist = distancia(clave, d.clave);
          if (dist < mejorDistancia) { mejorDistancia = dist; resultado = d.nombre; }
        }
        if (mejorDistancia > tope) resultado = undefined;
      }
      const elegido = resultado ?? nombrePropio(limpio);
      cache.set(clave, elegido);
      return elegido;
    };
  }, [data]);
}
