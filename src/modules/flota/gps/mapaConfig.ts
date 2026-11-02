// Fuentes del mapa y valores configurables de la telemetría. Cambiar de proveedor es tocar solo este archivo.
const esri = (import.meta.env.VITE_ESRI_KEY as string | undefined) || '';

export const MAPA_URLS = {
  vectores: 'https://tiles.openfreemap.org/planet',
  tipografias: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  relieve: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  // Con VITE_ESRI_KEY se usa la versión con clave de Esri; si no, la pública
  satelite: esri
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${esri}`
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

export const ATRIBUCION = {
  vectores: '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  relieve: 'Relieve: Mapzen/AWS',
  satelite: 'Imágenes © Esri, Maxar',
};

/** Último mensaje más viejo que esto = sin señal */
export const SIN_SENAL_MS = 10 * 60 * 1000;
/** Exceso de velocidad (km/h) y velocidad a la que se rearma la alerta */
export const EXCESO_KMH = 90;
export const EXCESO_REARME_KMH = 80;
/** Por encima de esta velocidad la unidad está en movimiento */
export const MOV_KMH = 2;
/** Salto (m) a partir del cual la unidad se teletransporta en vez de animarse */
export const SALTO_M = 500;
/** Zoom mínimo de la capa 3D */
export const ZOOM_3D = 14.6;
