// Línea de tiempo de una llanta: alta, montajes, retiros, reencauches y bajas (tabla neumaticos_movimientos).
import { CircleAlert } from 'lucide-react';
import { EmptyState, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { errorMessage } from '../../core/api/client';
import type { EventoLlanta } from './neumaticos-tablero-tipos';
import { fechaHoraTexto, useLineaTiempo } from './ntb-api';

const ETIQUETAS: Record<string, { texto: string; tono: 'green' | 'amber' | 'red' | 'blue' | 'gray' }> = {
  ALTA: { texto: 'Alta en almacén', tono: 'gray' },
  INSTALACION: { texto: 'Montada en unidad', tono: 'green' },
  RETIRO_REENCAUCHE: { texto: 'Enviada a reencauche', tono: 'amber' },
  RETIRO_DESECHO: { texto: 'Dada de baja', tono: 'red' },
  RETORNO_REENCAUCHE: { texto: 'Retorno de reencauche', tono: 'blue' },
};

/** Nombre legible de un tipo de evento (si el tipo es nuevo, se muestra tal cual) */
export function etiquetaEvento(tipo: string): { texto: string; tono: 'green' | 'amber' | 'red' | 'blue' | 'gray' } {
  return ETIQUETAS[tipo.toUpperCase()] ?? { texto: tipo.replace(/_/g, ' ').toLowerCase(), tono: 'gray' };
}

function ubicacion(e: EventoLlanta): string | null {
  if (e.placa && e.posicion) return `${e.placa} · ${e.posicion}`;
  if (e.placa) return e.placa;
  if (e.destino) return e.destino;
  return null;
}

export function LineaTiempo({ codigo }: { codigo: string }) {
  const { data, isLoading, error } = useLineaTiempo(codigo);

  if (isLoading) return <PageLoader />;
  if (error) return <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(error)}</Notice>;

  const eventos = [...(data?.eventos ?? [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!eventos.length) {
    return <EmptyState icon={<CircleAlert size={20} />} title="Sin movimientos">Esta llanta todavía no tiene eventos registrados.</EmptyState>;
  }

  return (
    <ol className="ntb-linea" aria-label={`Línea de tiempo de ${codigo}`}>
      {eventos.map((e, i) => {
        const et = etiquetaEvento(e.tipo);
        const ubi = ubicacion(e);
        return (
          <li key={`${e.id}-${i}`} className="ntb-linea__evento">
            <span className={`ntb-linea__punto ntb-linea__punto--${et.tono}`} aria-hidden />
            <div className="ntb-linea__cuerpo">
              <span className="ntb-linea__titulo">{et.texto}</span>
              {e.detalle && <span className="ntb-linea__detalle">{e.detalle}</span>}
              <span className="ntb-linea__meta">
                {fechaHoraTexto(e.fecha)}
                {ubi ? ` · ${ubi}` : ''}
                {e.km != null ? ` · ${Number(e.km).toLocaleString('es-PE')} km` : ''}
                {e.usuario ? ` · ${e.usuario}` : ''}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
