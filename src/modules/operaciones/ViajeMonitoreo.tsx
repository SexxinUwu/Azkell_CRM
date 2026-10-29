// Monitoreo en ruta del viaje: posición y datos en vivo del tracto. Reutiliza el mapa y la fuente de datos
// de Flota > Ubicación (UbicacionMapa y useUnidadesGps); no tiene mapa ni marcado propios.
import '../flota/ubicacion.css';
import { useMemo } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Notice } from '../../core/ui/Display';
import { errorMessage } from '../../core/api/client';
import { UbicacionMapa } from '../flota/UbicacionMapa';
import { estadoUnidad, useUnidadesGps, type EstadoUnidad } from '../flota/api';

export interface ViajeMonitoreo {
  viaje: string;
  placa_tracto: string | null;
}

const placaLimpia = (s: string | null | undefined) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const ETIQUETA: Record<EstadoUnidad, string> = { movimiento: 'En movimiento', ralenti: 'Ralentí', detenido: 'Detenido', sin_senal: 'Sin señal' };
// Constante de módulo: el mapa compara por identidad y no debe reconstruirse en cada render
const SIN_OCULTAS = new Set<string>();

export function MonitoreoViajeSheet({ viaje, onClose }: { viaje: ViajeMonitoreo | null; onClose: () => void }) {
  return (
    <Sheet open={!!viaje} onClose={onClose} title={viaje ? `Monitoreo del viaje ${viaje.viaje}` : ''} ancho>
      {viaje && <Monitor placa={viaje.placa_tracto} />}
    </Sheet>
  );
}

function Monitor({ placa }: { placa: string | null }) {
  const q = useUnidadesGps();
  const p = placaLimpia(placa);
  const unidad = useMemo(() => (q.data ?? []).find(u => placaLimpia(u.placa) === p) ?? null, [q.data, p]);

  if (!p) return <Notice>El viaje no tiene tracto asignado.</Notice>;
  if (q.isError) return <Notice tone="error">{errorMessage(q.error)}</Notice>;
  if (q.isLoading) return <p className="t-callout c-secondary">Buscando la unidad en el GPS…</p>;
  if (!unidad) return <Notice>{`${p} no figura en el GPS (Wialon).`}</Notice>;

  const estado = estadoUnidad(unidad);
  const conPosicion = unidad.lat != null && unidad.lng != null;
  const dato = (label: string, valor: string) => (
    <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor dato__valor--mono">{valor}</span></div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {conPosicion ? (
        <div className="gps-mapa-wrap" style={{ position: 'relative', height: 320 }}>
          <UbicacionMapa unidades={[unidad]} ocultas={SIN_OCULTAS} seleccionada={unidad.placa} fichaAbierta={false} capa="calle"
            encuadreVersion={0} encuadrarA={[unidad.placa]} historial={null} indice={0} onElegir={() => undefined} />
        </div>
      ) : (
        <Notice>La unidad no tiene posición reciente. Se mostrará cuando el GPS vuelva a reportar.</Notice>
      )}
      <div className="tarjeta__lista">
        {dato('Estado', ETIQUETA[estado])}
        {dato('Velocidad', `${Math.round(unidad.velocidad)} km/h`)}
        {dato('Odómetro GPS', unidad.km ? `${Math.round(unidad.km).toLocaleString('es-PE')} km` : '—')}
        {dato('Horas de motor', unidad.horas ? `${unidad.horas.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h` : '—')}
        {dato('Motor', unidad.ignicion ? 'Encendido' : 'Apagado')}
        {dato('Satélites', unidad.satelites == null ? '—' : String(unidad.satelites))}
        {unidad.ubicacion && <div className="dato"><span className="dato__label">Ubicación</span><span className="dato__valor">{unidad.ubicacion}</span></div>}
        {q.dataUpdatedAt > 0 && dato('Actualizado', new Date(q.dataUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}
      </div>
    </div>
  );
}
