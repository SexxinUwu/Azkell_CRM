import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, tokenStore, UNAUTHORIZED_EVENT } from '../api/client';
import { firstName } from '../lib/format';
import { playFarewell } from './farewell';
import { ADMIN, permisosDesdeMatriz } from './permisos';

// Sesión de la app nueva sobre la API actual:
//   POST /api/login            → { exito, token, nombre, dni, rol, permisos, mensaje }
//   GET  /api/perfil/me        → usuario con rol y permisos actualizados
//   GET  /api/configuracion    → nombre y logo de la empresa del subdominio (público)
//   POST /api/auth/logout      → cierra la sesión en el servidor
// Guarda las mismas claves que la versión actual (fleet_*), así la sesión sirve en ambas.

export interface SessionUser {
  name: string;
  email: string;
  roleName: string;
  companyName: string;
}

interface SessionPayload {
  user: SessionUser;
  permissions: string[];
}

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: SessionUser | null;
  permissions: Set<string>;
  login: (email: string, password: string, remember?: boolean) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** true si tiene al menos uno de los permisos (los administradores, siempre) */
  can: (...perms: string[]) => boolean;
  refresh: () => Promise<void>;
}

interface LoginResponse { exito: boolean; mensaje?: string; token?: string; nombre?: string; dni?: string; rol?: string; permisos?: unknown }
interface PerfilResponse { nombre?: string; correo?: string; rol?: string; permisos?: unknown }
interface EmpresaResponse { empresa_nombre?: string }

/** Nombre de la empresa sin "S.A.C." y similares (como en logica.js) */
export function nombreEmpresa(raw: string) {
  return raw.replace(/\s+(S\.?A\.?C\.?|S\.?A\.?|S\.?R\.?L\.?|E\.?I\.?R\.?L\.?|SOCIEDAD ANONIMA CERRADA)\.?$/i, '').trim() || 'Azkell Fleet';
}

async function empresaActual() {
  try {
    const e = await api<EmpresaResponse>('/configuracion');
    const nombre = nombreEmpresa(e.empresa_nombre ?? '');
    try { localStorage.setItem('fleet_empresa_nombre', e.empresa_nombre ?? ''); } catch { /* nada */ }
    return nombre;
  } catch {
    return nombreEmpresa(localStorage.getItem('fleet_empresa_nombre') ?? '');
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Con la sesión guardada, la app abre al instante (y sin señal); luego se confirma con el servidor.
  const [session, setSession] = useState<SessionPayload | null>(() => (tokenStore.get() ? (tokenStore.getProfile() as SessionPayload | null) : null));
  const [status, setStatus] = useState<AuthState['status']>(() => (!tokenStore.get() ? 'anonymous' : session ? 'authenticated' : 'loading'));

  const clear = useCallback(() => {
    tokenStore.clear();
    setSession(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const guardar = useCallback((s: SessionPayload) => {
    tokenStore.setProfile(s);
    setSession(s);
    setStatus('authenticated');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [me, companyName] = await Promise.all([api<PerfilResponse>('/perfil/me'), empresaActual()]);
      const email = me.correo ?? localStorage.getItem('fleet_correo') ?? '';
      const roleName = me.rol ?? localStorage.getItem('fleet_rol') ?? '';
      try {
        localStorage.setItem('fleet_permisos', JSON.stringify(me.permisos ?? {}));
        if (me.rol) localStorage.setItem('fleet_rol', me.rol);
      } catch { /* nada */ }
      guardar({
        user: { name: me.nombre ?? localStorage.getItem('fleet_user') ?? '', email, roleName, companyName },
        permissions: permisosDesdeMatriz(me.permisos, roleName, email),
      });
    } catch (err) {
      // Sin señal o servidor caído: se sigue con la sesión guardada.
      // Solo una sesión rechazada por el servidor cierra la app.
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500) && tokenStore.getProfile()) return;
      clear();
    }
  }, [clear, guardar]);

  // Al abrir la app: valida el token guardado
  useEffect(() => {
    if (tokenStore.get()) refresh();
  }, [refresh]);

  // Cualquier 401 de la API cierra la sesión local
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clear);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clear);
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('/login', { method: 'POST', body: { correo: email, password } });
    // La API actual responde 200 con exito:false ante datos incorrectos
    if (!res.exito || !res.token) throw new ApiError(401, res.mensaje || 'Correo o contraseña incorrectos.');
    tokenStore.set(res.token);
    try {
      // Mismas claves que modulos/login/logica.js: la versión actual reconoce la sesión
      localStorage.setItem('fleet_user', res.nombre ?? '');
      localStorage.setItem('fleet_rol', res.rol ?? '');
      localStorage.setItem('fleet_dni', res.dni ?? '');
      localStorage.setItem('fleet_correo', email);
      // La API puede devolver los permisos como texto o como objeto (columna JSON)
      localStorage.setItem('fleet_permisos', typeof res.permisos === 'string' ? res.permisos : JSON.stringify(res.permisos ?? {}));
      localStorage.setItem('fleet_ultimo_acceso', String(Date.now()));
    } catch { /* sin almacenamiento */ }
    const companyName = await empresaActual();
    const user: SessionUser = { name: res.nombre ?? '', email, roleName: res.rol ?? '', companyName };
    guardar({ user, permissions: permisosDesdeMatriz(res.permisos, res.rol, email) });
    return user;
  }, [guardar]);

  // Cerrar sesión a pedido de la persona: despedida animada y luego al login.
  // (Un 401 cierra al instante, sin animación.)
  const leaving = useRef(false);
  const logout = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    // No se espera la respuesta: sin señal también se puede salir
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    try {
      await playFarewell(session ? firstName(session.user.name) : '');
    } finally {
      leaving.current = false;
      clear();
    }
  }, [clear, session]);

  const value = useMemo<AuthState>(() => {
    const permissions = new Set(session?.permissions ?? []);
    const admin = permissions.has(ADMIN);
    return {
      status,
      user: session?.user ?? null,
      permissions,
      login,
      logout,
      can: (...perms) => admin || perms.length === 0 || perms.some(p => permissions.has(p)),
      refresh,
    };
  }, [status, session, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
