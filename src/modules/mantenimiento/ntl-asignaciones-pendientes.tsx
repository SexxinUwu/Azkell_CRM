import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { api } from '../../core/api/client';
import { Notice } from '../../core/ui/Display';

// Alerta de llantas que almacén despachó para una OT y todavía no se instalan (GET /api/neumaticos/asignaciones-pendientes).
interface Pendiente { id: number; codigo: string; marca: string | null; modelo: string | null; medida: string | null; placa: string | null; ticket_ot: string | null; salida_id: string; dias: number }
interface Respuesta { ok: boolean; data: Pendiente[]; dias_alerta: number }

export function AsignacionesPendientes() {
  const { data } = useQuery<Respuesta>({
    queryKey: ['mant', 'neumaticos-asignaciones-pendientes'],
    staleTime: 60_000,
    queryFn: () => api<Respuesta>('/neumaticos/asignaciones-pendientes'),
  });
  const limite = data?.dias_alerta ?? 7;
  const atrasadas = (data?.data ?? []).filter(a => Number(a.dias) >= limite);
  if (!atrasadas.length) return null;
  return (
    <Notice tone="accent" icon={<Clock size={16} />}>
      <details>
        <summary><b>{atrasadas.length} llanta{atrasadas.length === 1 ? '' : 's'} despachada{atrasadas.length === 1 ? '' : 's'} por almacén lleva{atrasadas.length === 1 ? '' : 'n'} {limite} días o más sin instalarse</b></summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {atrasadas.map(a => (
            <li key={a.id}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{a.codigo}</span>
              {' · '}{[a.marca, a.modelo, a.medida].filter(Boolean).join(' ')}
              {' · '}{a.placa ? `placa ${a.placa}` : 'sin placa'}{a.ticket_ot ? ` · OT ${a.ticket_ot}` : ''}
              {' · '}<b>{a.dias} días</b> (salida {a.salida_id})
            </li>
          ))}
        </ul>
      </details>
    </Notice>
  );
}
