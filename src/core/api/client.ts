// Cliente HTTP único para toda la app.
// Usa rutas relativas (/api) para que funcione igual en localhost, en el celular
// por Wi‑Fi (proxy de Vite) y en producción (mismo dominio).
//
// Sesión compartida con la versión actual (logica.js) a través de localStorage.
// En la web la autenticación es SOLO la cookie HttpOnly `azkell_session`: el JWT ya no se guarda en
// localStorage (un XSS no puede leerlo). Se guarda únicamente una bandera `fleet_sesion` que indica
// "hay sesión". En la app nativa (Capacitor) la cookie no viaja entre orígenes, así que ahí se
// conserva el JWT en `fleet_token` como respaldo.

const TOKEN_KEY = 'fleet_token';
const SESION_KEY = 'fleet_sesion';
const esNativo = () => {
  try { return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); }
  catch { return false; }
};
const PROFILE_KEY = 'fleet_app_perfil'; // usuario y permisos de la última sesión: abrir la app sin señal
export const UNAUTHORIZED_EVENT = 'azkell:unauthorized';

// Sesión vencida: el primer 401 avisa a AuthProvider (cierra la sesión y lleva al login).
// Mientras no se inicie sesión otra vez, las llamadas a la API no salen de la app.
let sesionVencida = false;
let ultimoVencimiento = 0;

/** Un 401 de la API: avisa una sola vez a AuthProvider */
export function avisarSesionVencida() {
  ultimoVencimiento = Date.now();
  if (sesionVencida) return;
  sesionVencida = true;
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/** Rutas que sí pueden salir aunque la sesión esté vencida (login y datos públicos de la pantalla de ingreso) */
const RUTAS_SIN_SESION = new Set(['/login', '/configuracion']);
function comprobarSesion(path: string) {
  if (sesionVencida && !RUTAS_SIN_SESION.has(path)) throw new ApiError(401, 'Tu sesión venció. Vuelve a ingresar.');
}

/** Errores de llamadas que quedaron en vuelo justo al vencer la sesión: no deben mostrarse como aviso */
export const errorPorSesionReciente = () => Date.now() - ultimoVencimiento < 5000;

/** Tras iniciar sesión otra vez, la API vuelve a funcionar normal */
export function reanudarSesion() {
  sesionVencida = false;
}

// Identifica esta pestaña (para avisos en vivo que no deben volver a quien hizo el cambio)
export const TAB_ID = (() => {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();

export class ApiError extends Error {
  /** `data`: cuerpo completo de la respuesta de error (datos extra del servidor) */
  constructor(public status: number, message: string, public data?: Record<string, unknown> | null) {
    super(message);
  }
}

/** Error de red (sin señal, servidor apagado): se puede reintentar más tarde */
export const isNetworkError = (err: unknown) => err instanceof ApiError && err.status === 0;

// Claves que también usa la versión actual (logica.js). Se borran juntas al cerrar sesión.
const LEGACY_KEYS = ['fleet_user', 'fleet_rol', 'fleet_correo', 'fleet_dni', 'fleet_ultimo_acceso', 'fleet_permisos', 'fleet_token', 'fleet_sesion'];

export const tokenStore = {
  /** Token (nativo) o bandera de sesión (web). Solo sirve para saber si hay sesión guardada. */
  get(): string | null {
    try {
      const legado = localStorage.getItem(TOKEN_KEY);
      if (legado && !esNativo()) {
        // Sesión anterior a este cambio: pasar a bandera y borrar el JWT de localStorage
        localStorage.setItem(SESION_KEY, '1');
        localStorage.removeItem(TOKEN_KEY);
      }
      return (esNativo() ? localStorage.getItem(TOKEN_KEY) : null) ?? localStorage.getItem(SESION_KEY);
    } catch { return null; }
  },
  set(token: string) {
    try {
      if (esNativo()) localStorage.setItem(TOKEN_KEY, token);
      else { localStorage.setItem(SESION_KEY, '1'); localStorage.removeItem(TOKEN_KEY); }
    } catch { /* modo privado */ }
  },
  clear() {
    try {
      for (const k of [...LEGACY_KEYS, PROFILE_KEY]) localStorage.removeItem(k);
      sessionStorage.removeItem('fleet_rutaActual');
    } catch { /* sin almacenamiento */ }
  },
  /** Perfil guardado junto al token */
  getProfile(): unknown {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setProfile(profile: unknown) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* sin almacenamiento */ }
  },
};

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Objeto → JSON. Blob (una foto) o FormData (archivos + campos) → se envía tal cual. */
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, { method = 'GET', body, query, headers: extra }: RequestOptions = {}): Promise<T> {
  comprobarSesion(path);
  const qs = query
    ? '?' + new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData; // el navegador pone el boundary
  const headers: Record<string, string> = { 'x-azkell-tab': TAB_ID, ...extra };
  // La autenticación usa la cookie HttpOnly `azkell_session` (credentials: 'include').
  // No se envía el token por header para evitar que XSS pueda leer o reutilizar el JWT.
  // La SPA clásica sigue usando Authorization: Bearer con su propio fleet_token.
  if (isBlob) headers['Content-Type'] = (body as Blob).type || 'application/octet-stream';
  else if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}${qs === '?' ? '' : qs}`, {
      method,
      headers,
      credentials: 'include', // envía la cookie HttpOnly azkell_session
      body: isBlob || isForm ? (body as Blob | FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu conexión a internet.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Sesión vencida o revocada: se avisa a AuthProvider para volver al login.
    if (res.status === 401 && path !== '/login') avisarSesionVencida();
    throw new ApiError(res.status, data?.error ?? data?.mensaje ?? `Error ${res.status}`, data);
  }
  return data as T;
}

/**
 * fetch a la API para respuestas que no son JSON (PDF, imágenes, blobs). Igual que api(): misma sesión
 * (cookie), mismo aviso de sesión vencida ante un 401 y mismo bloqueo de llamadas. `path` va relativo a /api.
 * Devuelve la respuesta sin lanzar por código de error: quien llama revisa `res.ok`.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  comprobarSesion(path);
  const headers = new Headers(init.headers);
  headers.set('x-azkell-tab', TAB_ID);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: 'include', ...init, headers });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu conexión a internet.');
  }
  if (res.status === 401) avisarSesionVencida();
  return res;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado';
}
