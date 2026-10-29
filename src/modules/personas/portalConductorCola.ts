// Portal del conductor sin señal. Cada gasto se guarda primero en IndexedDB del teléfono, con un UUID propio,
// y solo se borra de allí cuando el servidor confirma. Si el envío se repite (se perdió la señal después de
// enviar), el servidor reconoce el UUID y no registra el gasto dos veces.
// También guarda la última respuesta del viaje de cada conductor, para ver el viaje y registrar gastos sin señal.
import { api, ApiError, errorMessage, isNetworkError, tokenStore } from '../../core/api/client';

/**
 * Sin señal: error de red o la respuesta 503 que el service worker devuelve para /api/ cuando no hay conexión.
 * Con esto se usa la copia guardada en el teléfono en vez de mostrar un error.
 */
export const sinSenal = (err: unknown) => isNetworkError(err) || (err instanceof ApiError && err.status === 503);

const DB_NOMBRE = 'azkell-portal-conductor';
const DB_VERSION = 1;
const ALMACEN_GASTOS = 'gastos_pendientes';
const ALMACEN_VIAJES = 'viajes';
/** Se dispara al cambiar la cola. `detail.enviados` > 0 cuando se confirmaron gastos en el servidor. */
export const EVENTO_COLA = 'azkell:cola-gastos';

export interface GastoPendiente {
  uuid: string;
  orden_viaje: string;
  conductor: string;
  sub_motivo: string;
  importe: number;
  detalle: string;
  usuario_creacion: string;
  /** AAAA-MM-DD, fecha local en que se registró */
  fecha: string;
  /** ISO, momento real del registro */
  registrado_en: string;
  foto: Blob | null;
  foto_nombre: string | null;
  intentos: number;
  ultimo_error: string | null;
}

export interface ViajeGuardado {
  clave: string;
  datos: unknown;
  guardado_en: string;
}

let dbPromesa: Promise<IDBDatabase> | null = null;

function abrirDb(): Promise<IDBDatabase> {
  if (!dbPromesa) {
    dbPromesa = new Promise<IDBDatabase>((resolver, rechazar) => {
      if (typeof indexedDB === 'undefined') {
        rechazar(new Error('Este navegador no permite guardar datos en el teléfono.'));
        return;
      }
      const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ALMACEN_GASTOS)) db.createObjectStore(ALMACEN_GASTOS, { keyPath: 'uuid' });
        if (!db.objectStoreNames.contains(ALMACEN_VIAJES)) db.createObjectStore(ALMACEN_VIAJES, { keyPath: 'clave' });
      };
      req.onsuccess = () => resolver(req.result);
      req.onerror = () => {
        dbPromesa = null;
        rechazar(req.error ?? new Error('No se pudo abrir el almacenamiento del teléfono.'));
      };
    });
  }
  return dbPromesa;
}

function notificar(enviados?: number) {
  window.dispatchEvent(new CustomEvent(EVENTO_COLA, { detail: { enviados } }));
}

/** Una operación en una sola transacción; devuelve el resultado de la petición */
async function operar<T>(almacen: string, modo: IDBTransactionMode, hacer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDb();
  return new Promise<T>((resolver, rechazar) => {
    const tx = db.transaction(almacen, modo);
    const req = hacer(tx.objectStore(almacen));
    tx.oncomplete = () => resolver(req.result);
    tx.onerror = () => rechazar(tx.error ?? new Error('No se pudo guardar en el teléfono.'));
    tx.onabort = () => rechazar(tx.error ?? new Error('Se canceló el guardado en el teléfono.'));
  });
}

export async function guardarPendiente(gasto: GastoPendiente): Promise<void> {
  await operar(ALMACEN_GASTOS, 'readwrite', s => s.put(gasto));
  notificar();
}

export async function listarPendientes(): Promise<GastoPendiente[]> {
  const todos = await operar<GastoPendiente[]>(ALMACEN_GASTOS, 'readonly', s => s.getAll());
  return todos.sort((a, b) => a.registrado_en.localeCompare(b.registrado_en));
}

export async function quitarPendiente(uuid: string): Promise<void> {
  await operar(ALMACEN_GASTOS, 'readwrite', s => s.delete(uuid));
  notificar();
}

/** Cambia campos de un gasto pendiente sin volver a escribir el resto (no lo recrea si ya se quitó) */
function actualizarPendiente(uuid: string, cambios: Partial<GastoPendiente>): Promise<void> {
  return abrirDb().then(db => new Promise<void>((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN_GASTOS, 'readwrite');
    const store = tx.objectStore(ALMACEN_GASTOS);
    const lectura = store.get(uuid);
    lectura.onsuccess = () => { if (lectura.result) store.put({ ...lectura.result, ...cambios }); };
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  }));
}

export async function guardarViaje(clave: string, datos: unknown): Promise<void> {
  const registro: ViajeGuardado = { clave, datos, guardado_en: new Date().toISOString() };
  await operar(ALMACEN_VIAJES, 'readwrite', s => s.put(registro));
}

export async function leerViaje(clave: string): Promise<ViajeGuardado | null> {
  const registro = await operar<ViajeGuardado | undefined>(ALMACEN_VIAJES, 'readonly', s => s.get(clave));
  return registro ?? null;
}

/** Envía un gasto. El servidor responde ok aunque ya existiera (mismo UUID). */
export async function enviarGasto(g: GastoPendiente): Promise<void> {
  const f = new FormData();
  f.append('uuid_cliente', g.uuid);
  f.append('orden_viaje', g.orden_viaje);
  f.append('conductor', g.conductor);
  f.append('tipo_gasto', 'Gastos de Viaje y Ruta');
  f.append('sub_motivo', g.sub_motivo);
  f.append('importe', String(g.importe));
  f.append('detalle', g.detalle);
  f.append('usuario_creacion', g.usuario_creacion);
  f.append('fecha', g.fecha);
  f.append('registrado_en', g.registrado_en);
  if (g.foto) f.append('sustento', g.foto, g.foto_nombre ?? 'comprobante.jpg');
  const r = await api<{ ok?: boolean; error?: string }>('/tesoreria/liquidaciones-gastos', { method: 'POST', body: f });
  if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el gasto');
}

/**
 * Envía al servidor los gastos guardados en el teléfono, en orden.
 * Un gasto sale de la cola solo cuando el servidor lo confirma. Sin señal o con sesión vencida se detiene
 * y se reintenta más tarde; un error del servidor deja el gasto en la cola con su motivo.
 * Devuelve cuántos se confirmaron.
 */
let enCurso: Promise<number> | null = null;
let otraVuelta = false;

/** Un solo envío a la vez. Si se pidió otro mientras corría, se hace una vuelta más (así entran los gastos nuevos). */
export function enviarPendientes(): Promise<number> {
  if (enCurso) { otraVuelta = true; return enCurso; }
  enCurso = (async () => {
    let total = 0;
    do {
      otraVuelta = false;
      total += await enviarTodos();
    } while (otraVuelta);
    return total;
  })().finally(() => { enCurso = null; });
  return enCurso;
}

async function enviarTodos(): Promise<number> {
  if (navigator.onLine === false) return 0;
  let pendientes: GastoPendiente[];
  try {
    pendientes = await listarPendientes();
  } catch {
    return 0;
  }
  let enviados = 0;
  for (const g of pendientes) {
    try {
      await enviarGasto(g);
      await quitarPendiente(g.uuid);
      enviados++;
    } catch (err) {
      if (sinSenal(err) || (err instanceof ApiError && (err.status === 401 || err.status >= 500))) break;
      await actualizarPendiente(g.uuid, { intentos: g.intentos + 1, ultimo_error: errorMessage(err) }).catch(() => {});
    }
  }
  if (enviados > 0) notificar(enviados);
  return enviados;
}

let iniciado = false;
/**
 * Al abrir la app y cada minuto, y al volver la señal, envía lo que quedó en el teléfono.
 * Solo con sesión guardada (sin sesión, una respuesta 401 cerraría la app).
 */
export function iniciarColaGastos() {
  if (iniciado) return;
  iniciado = true;
  const intentar = () => { if (tokenStore.get()) void enviarPendientes(); };
  window.addEventListener('online', intentar);
  window.setInterval(intentar, 60_000);
  intentar();
}
