import { Component, type ReactNode } from 'react';
import { Button } from './Button';
import { CargaCamion } from './CargaCamion';

// Nunca dejar la pantalla en blanco. Si una pantalla falla, se muestra un aviso con botones.
// Tras un despliegue, la pestaña abierta pide archivos de la versión anterior (404) mientras el servidor
// termina de publicar la nueva. Eso se resuelve solo: se muestra el camión y se reintenta con esperas crecientes.

const FALLO_DE_MODULO = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i;
const CLAVE_INTENTOS = 'fleet_reintentos_version';
// Esperas entre reintentos (ms): unos 40 segundos en total, suficiente para que termine un despliegue
const ESPERAS = [2000, 4000, 6000, 8000, 10000, 12000];
const TIEMPO_ESTABLE = 60_000;

function leerIntentos(): number {
  try { return Number(sessionStorage.getItem(CLAVE_INTENTOS) || 0); } catch { return 0; }
}

function guardarIntentos(n: number) {
  try { sessionStorage.setItem(CLAVE_INTENTOS, String(n)); } catch { /* sin sessionStorage */ }
}

function irAVersionNueva() {
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now())); // distinta URL: el navegador pide el HTML nuevo
  window.location.replace(url.toString());
}

/** Mensaje de fallo de carga de un módulo (versión anterior o red): se reintenta con la versión nueva. */
export function esFalloDeModulo(mensaje: string): boolean {
  return FALLO_DE_MODULO.test(mensaje);
}

/**
 * Programa una recarga con la versión nueva. Devuelve false cuando ya se agotaron los reintentos.
 * El contador se limpia cuando la app lleva un rato estable (ver LimiteDeError), no al recargar.
 */
let recargaProgramada = false;

export function reintentarVersionNueva(): boolean {
  if (recargaProgramada) return true; // un mismo fallo llega por varios eventos: una sola recarga
  const n = leerIntentos();
  if (n >= ESPERAS.length) return false;
  guardarIntentos(n + 1);
  recargaProgramada = true;
  window.setTimeout(irAVersionNueva, ESPERAS[n]);
  return true;
}

/** Recarga ahora (botón Recargar): reinicia los reintentos. */
export function recargarVersionNueva(): void {
  guardarIntentos(0);
  irAVersionNueva();
}

interface Estado { error: Error | null; reintentando: boolean }

const estiloPantalla = {
  minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '16px', textAlign: 'center',
  color: 'var(--label)',
} as const;

export class LimiteDeError extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null, reintentando: false };
  private temporizador?: number;

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { error };
  }

  componentDidMount() {
    // Si la app sigue sin errores un minuto, el contador de reintentos vuelve a cero
    this.temporizador = window.setTimeout(() => guardarIntentos(0), TIEMPO_ESTABLE);
  }

  componentWillUnmount() {
    window.clearTimeout(this.temporizador);
  }

  componentDidCatch(error: Error) {
    console.error('[Azkell] Pantalla con error:', error);
    if (esFalloDeModulo(String(error?.message ?? '')) && reintentarVersionNueva()) {
      this.setState({ reintentando: true });
    }
  }

  render() {
    const { error, reintentando } = this.state;
    if (!error) return this.props.children;

    if (reintentando) {
      return <div style={estiloPantalla}><CargaCamion texto="Actualizando Azkell…" /></div>;
    }

    return (
      <div role="alert" style={estiloPantalla}>
        <div style={{ maxWidth: 360, display: 'grid', gap: 12, justifyItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '1.0625rem' }}>Esta pantalla no se pudo cargar</p>
          <p style={{ margin: 0, color: 'var(--label-2)', fontSize: '0.875rem' }}>
            Puede que haya una versión nueva de Azkell. Recarga para continuar.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => recargarVersionNueva()}>Recargar</Button>
            <Button onClick={() => window.location.assign('/app/')}>Ir al inicio</Button>
          </div>
        </div>
      </div>
    );
  }
}
