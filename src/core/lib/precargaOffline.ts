// Precarga de la app para usarla sin internet: baja en segundo plano todos los archivos de la compilación (pantallas, estilos, tipografías).
// El service worker guarda cada uno al pasar (sw.js › appArchivo). Sin esto, sin internet solo abrirían las pantallas ya visitadas.
// Se hace una vez por versión, con la app ya cargada y sin gastar datos en conexiones lentas o con ahorro de datos.

const CLAVE = 'fleet_precarga_app';

interface ConexionNavegador { saveData?: boolean; effectiveType?: string }

export async function precargarApp(): Promise<void> {
  try {
    if (!navigator.onLine || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    const c = (navigator as Navigator & { connection?: ConexionNavegador }).connection;
    if (c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType ?? ''))) return;
    const r = await fetch('/app/assets-lista', { cache: 'no-store' });
    if (!r.ok) return;
    const { version, archivos } = await r.json() as { version: string; archivos: string[] };
    if (!version || !Array.isArray(archivos) || localStorage.getItem(CLAVE) === version) return;
    // De a pocos, para no competir con lo que el usuario está haciendo
    for (let i = 0; i < archivos.length; i += 4) {
      if (!navigator.onLine) return;
      await Promise.allSettled(archivos.slice(i, i + 4).map(a => fetch(`/app/assets/${a}`).then(x => x.arrayBuffer())));
    }
    localStorage.setItem(CLAVE, version);
  } catch { /* sin precarga: la app sigue funcionando; solo se guardan las pantallas que se visiten */ }
}

/** Lo programa cuando el navegador está libre, unos segundos después de abrir la app */
export function programarPrecarga() {
  const lanzar = () => { void precargarApp(); };
  setTimeout(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(lanzar, { timeout: 20000 });
    else lanzar();
  }, 12000);
}
