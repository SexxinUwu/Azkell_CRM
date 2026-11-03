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

// Mapbox Satellite: una sola fuente en todos los zooms (sin saltos de color). Con VITE_MAPBOX_KEY (token público pk.…) es el satélite
// por defecto; agregar ?satelite=esri a la dirección fuerza Esri para comparar, y ?satelite=mapbox lo contrario.
const mapbox = (import.meta.env.VITE_MAPBOX_KEY as string | undefined) || '';
const elegido = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('satelite') : null;
export const SAT_MAPBOX = !!mapbox && elegido !== 'esri';
export const SAT_MAPBOX_URL = `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${mapbox}`;
/** Mapbox tiene imágenes hasta el zoom 22 en zonas urbanas; más allá se agranda la última */
export const SAT_MAPBOX_MAXZOOM = 20;

export const ATRIBUCION = {
  vectores: '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  relieve: 'Relieve: Mapzen/AWS',
  satelite: 'Imágenes © Esri, Maxar',
  mapbox: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.maxar.com/">Maxar</a>',
};

/** Último mensaje más viejo que esto = sin señal */
export const SIN_SENAL_MS = 10 * 60 * 1000;
/** Exceso de velocidad (km/h) y velocidad a la que se rearma la alerta */
export const EXCESO_KMH = 90;
export const EXCESO_REARME_KMH = 80;
/** Reserva de combustible de toda unidad: el último 20 % del tanque (rodar en reserva daña la unidad) */
export const RESERVA_COMBUSTIBLE_PCT = 20;
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

// Tráfico en tiempo real (TomTom Orbis Traffic Flow: calles principales y secundarias; probado en Lima, Trujillo y Tarapoto).
// Hace falta una clave en VITE_TOMTOM_KEY. Sin clave, el botón queda desactivado.
const tomtom = (import.meta.env.VITE_TOMTOM_KEY as string | undefined) || '';
export const HAY_TRAFICO = !!tomtom;
export const TRAFICO_URL = tomtom ? `https://api.tomtom.com/maps/orbis/traffic/tile/flow/{z}/{x}/{y}.png?apiVersion=1&key=${tomtom}` : '';
export const TRAFICO_ATRIBUCION = '© <a href="https://www.tomtom.com">TomTom</a>';
/** Cada cuánto se vuelven a pedir las teselas de tráfico (ms) */
export const TRAFICO_REFRESCO_MS = 120_000;
