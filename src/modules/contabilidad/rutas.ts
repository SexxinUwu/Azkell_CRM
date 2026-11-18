import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

// Contabilidad: copia local del SIRE de SUNAT (registro de ventas y de compras)
export const RUTAS: RutaModulo[] = [
  {
    path: 'contabilidad/sire/*',
    permisos: ['contabilidad_sire.ver', 'admin'],
    Page: lazy(() => import('./SirePage').then(m => ({ default: m.SirePage }))),
    nav: { key: 'sire', label: 'SIRE · Ventas y compras', to: '/contabilidad/sire', icon: 'Landmark', permisos: ['contabilidad_sire.ver'], soloEmpresa: 'trahesa' },
  },
];
