import { useState } from 'react';
import './seguimiento.css';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState } from '../../core/ui/Display';
import { MapaRecorridoViaje } from './ViajeMapaGps';

// GPS del viaje: el recorrido de Wialon del tracto entre la salida y la llegada del viaje (o hasta ahora si sigue en ruta).
// Solo existe desde que el viaje inicia. Se consulta al pedirlo, porque Wialon es lento.
export function SeccionGpsViaje({ placa, inicio, fin }: { placa: string | null; inicio: string | null; fin: string | null }) {
  const [pedida, setPedida] = useState(false);
  const p = (placa ?? '').trim().toUpperCase();
  const ini = String(inicio ?? '').replace('T', ' ').slice(0, 19);
  const fi = String(fin ?? '').replace('T', ' ').slice(0, 19) || new Date().toLocaleString('sv-SE');

  if (!ini) {
    return (
      <EmptyState icon={<MapPin size={22} />} title="El GPS empieza cuando el viaje inicia">
        Al iniciar el viaje se muestra el recorrido que hizo {p ? `el tracto ${p}` : 'el tracto'}, con sus paradas y excesos de velocidad.
      </EmptyState>
    );
  }
  if (!p) {
    return <EmptyState icon={<MapPin size={22} />} title="Sin tracto asignado">Asigna un tracto al viaje para ver su recorrido.</EmptyState>;
  }
  return (
    <div className="vg">
      <div className="vo__cab">
        <h4 className="vj-titulo" style={{ margin: 0 }}>Recorrido del viaje<span className="seg__placa" style={{ marginLeft: 8 }}>{p}</span></h4>
        {!pedida && <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => setPedida(true)}>Ver recorrido</Button>}
      </div>
      {!pedida
        ? <EmptyState icon={<MapPin size={22} />} title="Recorrido del GPS">Muestra la ruta, la distancia, las paradas y los excesos de velocidad del viaje.</EmptyState>
        : <MapaRecorridoViaje placa={p} inicio={ini} fin={fi} />}
    </div>
  );
}
