// Cliente HTTP único para toda la app.
// Usa rutas relativas (/api) para que funcione igual en localhost, en el celular
// por Wi‑Fi (proxy de Vite) y en producción (mismo dominio).
//
// Sesión compartida con la versión actual: el token vive en localStorage['fleet_token'],
// la misma clave que usa logica.js. Así, entrar en una versión deja la sesión abierta en la otra.

const TOKEN_KEY = 'fleet_token';
const PROFILE_KEY = 'fleet_app_perfil'; // usuario y permisos de la última sesión: abrir la app sin señal
export const UNAUTHORIZED_EVENT = 'azkell:unauthorized';

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
const LEGACY_KEYS = ['fleet_user', 'fleet_rol', 'fleet_correo', 'fleet_dni', 'fleet_ultimo_acceso', 'fleet_permisos', 'fleet_token'];

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* modo privado */ }
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
  /** Objeto → JSON. Blob (una foto) → se envía tal cual, con su tipo. */
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, { method = 'GET', body, query, headers: extra }: RequestOptions = {}): Promise<T> {
  const qs = query
    ? '?' + new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const headers: Record<string, string> = { 'x-azkell-tab': TAB_ID, ...extra };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isBlob) headers['Content-Type'] = (body as Blob).type || 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}${qs === '?' ? '' : qs}`, {
      method,
      headers,
      body: isBlob ? (body as Blob) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu conexión a internet.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Sesión vencida o revocada: se avisa a AuthProvider para volver al login.
    if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data?.error ?? data?.mensaje ?? `Error ${res.status}`, data);
  }
  return data as T;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado';
}
