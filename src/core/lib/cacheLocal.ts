// Copia en este navegador de datos que ya no cambian (por ejemplo, el recorrido de un día pasado). Usa IndexedDB; si no está disponible
// (ventana privada, datos bloqueados), todo sigue funcionando sin copia. Guarda como máximo MAX entradas y descarta las más antiguas.
const BASE = 'azkell-cache';
const TABLA = 'datos';
const MAX = 400;

interface Entrada<T> { clave: string; valor: T; en: number }

function abrir(): Promise<IDBDatabase | null> {
  return new Promise(resolver => {
    try {
      if (typeof indexedDB === 'undefined') return resolver(null);
      const q = indexedDB.open(BASE, 1);
      q.onupgradeneeded = () => { q.result.createObjectStore(TABLA, { keyPath: 'clave' }).createIndex('en', 'en'); };
      q.onsuccess = () => resolver(q.result);
      q.onerror = () => resolver(null);
      q.onblocked = () => resolver(null);
    } catch { resolver(null); }
  });
}

export async function leerLocal<T>(clave: string): Promise<T | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise(resolver => {
    try {
      const r = db.transaction(TABLA, 'readonly').objectStore(TABLA).get(clave);
      r.onsuccess = () => { db.close(); resolver((r.result as Entrada<T> | undefined)?.valor ?? null); };
      r.onerror = () => { db.close(); resolver(null); };
    } catch { try { db.close(); } catch { /* ya cerrada */ } resolver(null); }
  });
}

export async function guardarLocal<T>(clave: string, valor: T): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>(resolver => {
    try {
      const tx = db.transaction(TABLA, 'readwrite');
      const st = tx.objectStore(TABLA);
      st.put({ clave, valor, en: Date.now() } satisfies Entrada<T>);
      // Poda: si hay más de MAX, se borran las más antiguas (por el índice de fecha)
      const cuenta = st.count();
      cuenta.onsuccess = () => {
        let sobran = cuenta.result - MAX;
        if (sobran <= 0) return;
        const cur = st.index('en').openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c && sobran-- > 0) { c.delete(); c.continue(); } };
      };
      tx.oncomplete = () => { db.close(); resolver(); };
      tx.onerror = () => { db.close(); resolver(); };
      tx.onabort = () => { db.close(); resolver(); };
    } catch { try { db.close(); } catch { /* ya cerrada */ } resolver(); }
  });
}
