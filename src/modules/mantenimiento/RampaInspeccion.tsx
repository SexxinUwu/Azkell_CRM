// Aviso de inspección de la placa elegida en el formulario de rampa: el mismo recuadro que el PDF de la orden en parabrisas.
import { useMemo } from 'react';
import { useInspecciones } from '../inspecciones/api';
import { ultimasPorPlaca } from './inspeccionDias';
import { htmlRecuadroInspeccion } from './rampaParabrisas';
import './RampaInspeccion.css';

export function AlertaInspeccionRampa({ placa }: { placa: string }) {
  const inspecciones = useInspecciones();
  const ultimas = useMemo(() => ultimasPorPlaca(inspecciones.data ?? []), [inspecciones.data]);
  // Sin placa, o mientras llegan las inspecciones, no se muestra nada (evita un "SIN REGISTRO" que luego cambia)
  if (!placa || inspecciones.isLoading) return null;
  return <div className="rampa-alerta-insp" dangerouslySetInnerHTML={{ __html: htmlRecuadroInspeccion(placa, ultimas) }} />;
}
