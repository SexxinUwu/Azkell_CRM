// Fuentes del mapa y valores configurables de la telemetría. Cambiar de proveedor es tocar solo este archivo.
const esri = (import.meta.env.VITE_ESRI_KEY as string | undefined) || '';

export const MAPA_URLS = {
  vectores: 'https://tiles.openfreemap.org/planet',
  tipografias: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  relieve: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  // Esri Clarity: imágenes más recientes y con más detalle; llega a los mismos zooms que la estándar (z19 en Lima, z17 en el campo)
  sateliteClarity: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
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

/** Satélite en tres capas: base (existe en todo el país), intermedia y de detalle. Lima tiene imágenes hasta el zoom 19 y el campo hasta el 17. */
export const SAT_BASE_MAXZOOM = 16;
export const SAT_MEDIA_MAXZOOM = 17;
export const SAT_DETALLE_MAXZOOM = 19;
/** Tamaño en bytes de la lámina gris "Map data not yet available" de Esri */
export const SAT_PLACEHOLDER_BYTES = 2521;

// Tráfico en tiempo real (TomTom, plan gratuito: hace falta una clave en VITE_TOMTOM_KEY). Sin clave, el botón queda desactivado.
const tomtom = (import.meta.env.VITE_TOMTOM_KEY as string | undefined) || '';
export const HAY_TRAFICO = !!tomtom;
export const TRAFICO_URL = tomtom ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtom}` : '';
export const TRAFICO_ATRIBUCION = '© <a href="https://www.tomtom.com">TomTom</a>';
/** Cada cuánto se vuelven a pedir las teselas de tráfico (ms) */
export const TRAFICO_REFRESCO_MS = 120_000;
