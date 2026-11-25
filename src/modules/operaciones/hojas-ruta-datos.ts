// Hojas de ruta (Operaciones Marsisa): tipos, consultas y cálculos de duración compartidos por la pantalla y sus hojas.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface Parada { dia: number; tipo: string; actividad: string; hora_inicio: string; hora_fin: string }
export interface PlantillaRuta {
  id: number; nombre: string; cliente: string; tipo_unidad: 'TRACTO' | 'CAMION'; choferes: number;
  origen: string | null; destino: string | null; material: string | null; notas: string | null; paradas: Parada[];
}
export interface OpcionesHoja {
  placas: Array<{ placa: string; tipo: string }>;
  conductores: Array<{ nombre: string; dni: string | null; telefono: string | null }>;
}

export const TIPOS_PARADA: Array<{ value: string; label: string }> = [
  { value: 'CARGA', label: 'Carga' }, { value: 'CONDUCCION', label: 'Conducción' }, { value: 'COMBUSTIBLE', label: 'Combustible' },
  { value: 'COMIDA', label: 'Comida' }, { value: 'DESCANSO', label: 'Descanso' }, { value: 'REVISION', label: 'Revisión de llantas' },
  { value: 'DESCARGA', label: 'Descarga' }, { value: 'OTRO', label: 'Otro' },
];

const minutosDe = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Duración de una parada en minutos: si la hora de fin es menor o igual a la de inicio, termina al día siguiente */
export function duracionMin(inicio: string, fin: string): number | null {
  const a = minutosDe(inicio), b = minutosDe(fin);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a;
}

export const duracionTexto = (min: number | null) => (min == null ? '—' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);

/** Totales de una plantilla en horas: viaje completo, manejo y descanso (descanso y comidas) */
export function resumenPlantilla(paradas: Parada[]) {
  const orden = paradas.map(p => ({ ...p, ini: (p.dia - 1) * 1440 + (minutosDe(p.hora_inicio) ?? 0), min: duracionMin(p.hora_inicio, p.hora_fin) ?? 0 }));
  if (!orden.length) return { total: 0, manejo: 0, descanso: 0 };
  const inicio = Math.min(...orden.map(p => p.ini));
  const fin = Math.max(...orden.map(p => p.ini + p.min));
  const suma = (tipos: string[]) => orden.filter(p => tipos.includes(p.tipo)).reduce((s, p) => s + p.min, 0);
  return { total: fin - inicio, manejo: suma(['CONDUCCION']), descanso: suma(['DESCANSO', 'COMIDA']) };
}
export const horasTexto = (min: number) => `${(min / 60).toLocaleString('es-PE', { maximumFractionDigits: 1 })} h`;

export const RAIZ = ['operaciones', 'hojas-ruta'] as const;

export function usePlantillasRuta() {
  return useQuery({
    queryKey: [...RAIZ, 'plantillas'],
    queryFn: () => api<{ ok: boolean; data: PlantillaRuta[] }>('/operaciones/hojas-ruta/plantillas').then(r => r.data),
  });
}

export function useOpcionesHoja(activo: boolean) {
  return useQuery({
    queryKey: [...RAIZ, 'opciones'],
    enabled: activo,
    staleTime: 5 * 60_000,
    queryFn: () => api<{ ok: boolean } & OpcionesHoja>('/operaciones/hojas-ruta/opciones'),
  });
}
