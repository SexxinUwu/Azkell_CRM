// Contrato con el que cada módulo declara sus pantallas: src/App.tsx registra las rutas
// y src/core/layout/navigation.ts arma el menú a partir de esta lista.
import type { ComponentType, LazyExoticComponent } from 'react';

export interface NavModulo {
  /** Misma key de navigation.ts si la pantalla ya está en el menú (reemplaza su versión actual) */
  key: string;
  label: string;
  /** Ruta de la app nueva, con "/" inicial */
  to: string;
  /** Nombre de un ícono de lucide-react */
  icon: string;
  /** Sección del menú (solo para pantallas nuevas en el menú) */
  seccion?: string;
  permisos: string[];
  soloEmpresa?: string;
}

export interface RutaModulo {
  /** Relativa a /app, sin "/" inicial (p. ej. 'almacen/inventario/*') */
  path: string;
  /** Basta con tener uno */
  permisos: string[];
  Page: LazyExoticComponent<ComponentType>;
  nav?: NavModulo;
}
