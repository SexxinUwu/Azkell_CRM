import { PlantillaPdfPage, type ConfigPlantilla } from './PlantillaPdfPage';

const CONFIG: ConfigPlantilla = {
  base: '/operaciones/gre',
  clave: 'plantilla-guias',
  eyebrow: 'Operaciones',
  titulo: 'Plantilla de guías',
  subtitulo: 'Cómo se ve el PDF de las guías de remisión de esta empresa',
  bloques: [
    ['estado', 'Estado de SUNAT', 'Sello «Aceptada por SUNAT» o «Pendiente de validación»'],
    ['cliente', 'Cliente', 'Nombre del cliente en la tarjeta de fechas'],
    ['ruta', 'Puntos de partida y llegada', 'Con dirección y ubigeo'],
    ['partes', 'Remitente y destinatario', ''],
    ['vehiculos', 'Vehículos', 'Placas del tracto y la carreta'],
    ['conductor', 'Conductor', 'Nombre y documento'],
    ['relacionados', 'Documentos relacionados', 'Guías de remisión del cliente en las que se basa'],
    ['observaciones', 'Observaciones', 'El texto de «Notas» de más abajo'],
    ['qr', 'Código QR de SUNAT', 'Aparece cuando SUNAT acepta la guía'],
  ],
  columnas: [
    ['unidad', 'Unidad de cada ítem', 'Kilogramos, fardos, unidades…'],
    ['peso_linea', 'Peso por línea', 'Útil cuando los ítems van en kilos'],
    ['placa_carreta', 'Placa de la carreta', ''],
    ['tuc', 'TUC y autorización del vehículo', 'Si el vehículo los tiene registrados'],
    ['licencia', 'Licencia del conductor', ''],
    ['viaje', 'Número de viaje', 'Referencia interna'],
    ['servicio', 'Número de servicio', 'Referencia interna'],
  ],
  etiquetaNotas: 'Observaciones (se imprimen en todas las guías)',
  avisoFinal: 'La guía siempre lleva los datos que exige SUNAT, la leyenda «Representación impresa de la Guía de Remisión Electrónica» y, cuando está aceptada, su QR.',
};

// Operaciones › Plantilla de guías: cómo se ve el PDF de las guías de esta empresa
export function PlantillaGuiasPage() {
  return <PlantillaPdfPage config={CONFIG} />;
}
