// Avisos en el teléfono (Web Push): permiso del navegador, suscripción de este dispositivo y envío al servidor.
// El navegador solo pregunta una vez; si el usuario bloquea los avisos, para cambiarlo tiene que hacerlo en
// el navegador o en los ajustes de la app instalada (lo indica la pantalla de Mi cuenta).
import { api } from '../api/client';

export type EstadoAvisos = 'no-soportado' | 'bloqueado' | 'pendiente' | 'inactivo' | 'activo';

const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Clave pública VAPID (base64url) → bytes que pide el navegador */
function claveABytes(clave: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (clave.length % 4)) % 4);
  const base64 = (clave + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/** Estado real del permiso y de la suscripción de este dispositivo */
export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission !== 'granted') return 'pendiente';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Asegurar en segundo plano que el servidor tenga guardada la suscripción
    void api('/push/suscribir', { method: 'POST', body: { suscripcion: sub.toJSON() } }).catch(() => undefined);
    return 'activo';
  }
  return 'inactivo';
}

/** Pide el permiso (solo si aún no se decidió) y registra este dispositivo en el servidor. Debe llamarse desde un toque. */
export async function activarAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return 'no-soportado';
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permiso !== 'granted') return estadoAvisos();
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api<{ ok: boolean; clave: string | null }>('/push/clave');
  if (!clave) throw new Error('Las notificaciones todavía no están configuradas en el servidor.');
  try {
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) });
    await api('/push/suscribir', { method: 'POST', body: { suscripcion: sub.toJSON() } });
    return 'activo';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/push service error/i.test(msg)) {
      throw new Error('En Brave debes activar «Usar los servicios de Google para la mensajería push» en brave://settings/privacy y reiniciar el navegador.');
    }
    throw err;
  }
}

/** Quita este dispositivo: el servidor deja de enviarle avisos y el navegador cancela la suscripción */
export async function desactivarAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return 'no-soportado';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api('/push/quitar', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return estadoAvisos();
}

/** Envía un aviso de prueba a los dispositivos activos del usuario */
export async function probarAvisos() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Asegurar que el servidor tenga la suscripción registrada antes de probar
    await api('/push/suscribir', { method: 'POST', body: { suscripcion: sub.toJSON() } }).catch(() => undefined);
  }
  const r = await api<{ ok: boolean; enviados: number }>('/push/prueba', { method: 'POST' });
  if (!r.ok || r.enviados === 0) {
    throw new Error('El servidor no encontró este dispositivo registrado. Toca «Desactivar en este teléfono» y vuelve a activarlo.');
  }
  return r;
}
