// Geometría pequeña del mapa (funciones along / bearing / angLerp del prototipo, más distancia y punto en polígono)
export type LngLat = [number, number];

const KX = 111320 * Math.cos(12.05 * Math.PI / 180);
const KY = 110540;

/** Distancia aproximada en metros entre dos puntos cercanos */
export const distM = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY);
export const bearing = (a: LngLat, b: LngLat) => (Math.atan2((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) * 180 / Math.PI + 360) % 360;
/** Interpola ángulos por el camino más corto */
export const angLerp = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };

export function enAnillo(p: LngLat, ring: LngLat[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
