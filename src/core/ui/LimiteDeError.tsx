import { Component, type ReactNode } from 'react';
import { Button } from './Button';
import { CargaCamion } from './CargaCamion';

// Nunca dejar la pantalla en blanco. Si una pantalla falla, se muestra un aviso con botones.
// Si el fallo viene de una versión anterior (el archivo del módulo ya no existe tras un despliegue), se
// recarga la página una vez pidiendo la versión nueva, mientras se muestra el camión.

const FALLO_DE_MODULO = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i;
const CLAVE_RECARGA = 'fleet_recarga_modulo';
const ESPERA_RECARGA = 30_000;

function irAVersionNueva() {
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now())); // distinta URL: el navegador pide el HTML nuevo
  window.location.replace(url.toString());
}

/** Recarga pidiendo la versión nueva. Sin forzar, solo una vez cada 30 s para no entrar en bucle. */
export function recargarVersionNueva(forzar = false): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) || 0);
    if (!forzar && Date.now() - ultima < ESPERA_RECARGA) return false;
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch { /* sin sessionStorage: se recarga igual */ }
  irAVersionNueva();
  return true;
}

/** Mensaje de fallo de carga de un módulo (versión anterior o red): se recarga la versión nueva. */
export function esFalloDeModulo(mensaje: string): boolean {
  return FALLO_DE_MODULO.test(mensaje);
}

interface Estado { error: Error | null; recargando: boolean }

const estiloPantalla = {
  minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '16px', textAlign: 'center',
  color: 'var(--label)',
} as const;

export class LimiteDeError extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null, recargando: false };

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[Azkell] Pantalla con error:', error);
    if (esFalloDeModulo(String(error?.message ?? '')) && recargarVersionNueva()) {
      this.setState({ recargando: true });
    }
  }

  render() {
    const { error, recargando } = this.state;
    if (!error) return this.props.children;

    if (recargando) {
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
            <Button variant="primary" onClick={() => recargarVersionNueva(true)}>Recargar</Button>
            <Button onClick={() => window.location.assign('/app/')}>Ir al inicio</Button>
          </div>
        </div>
      </div>
    );
  }
}
