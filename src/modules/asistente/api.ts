import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { ReportRequest } from './reports';

export interface Turn { id: string; role: 'user' | 'assistant'; text: string; report?: ReportRequest; error?: boolean; retry?: string }

/** Si el servidor tiene configurada la clave de Gemini. Sin ella no se muestra el botón. */
export function useAsistenteEstado() {
  return useQuery({
    queryKey: ['asistente', 'estado'],
    queryFn: () => api<{ enabled: boolean }>('/asistente/estado'),
    staleTime: 10 * 60_000,
  });
}

/** El historial va solo como texto: los reportes nunca se mandan de vuelta. */
export function preguntarAsistente(message: string, history: Pick<Turn, 'role' | 'text'>[]) {
  return api<{ answer: string; report?: ReportRequest }>('/asistente/mensajes', { method: 'POST', body: { message, history } });
}
