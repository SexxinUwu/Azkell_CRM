import { lazy } from 'react';
import type { RutaModulo } from '../personal/rutas.tipos';

export const RUTAS: RutaModulo[] = [
  {
    path: 'sistema/auditoria/*',
    permisos: ['mod_auditoria.ver', 'admin'],
    Page: lazy(() => import('./AuditoriaPage').then(m => ({ default: m.AuditoriaPage }))),
    nav: { key: 'auditoria', label: 'Auditoría', to: '/sistema/auditoria', icon: 'History', permisos: ['mod_auditoria.ver', 'admin'] },
  },
  {
    path: 'sistema/usuarios/*',
    permisos: ['usuarios.ver', 'admin'],
    Page: lazy(() => import('./UsuariosPage').then(m => ({ default: m.UsuariosPage }))),
    nav: { key: 'usuarios', label: 'Usuarios y roles', to: '/sistema/usuarios', icon: 'UserCog', permisos: ['usuarios.ver', 'admin'] },
  },
  {
    path: 'sistema/integraciones/*',
    permisos: ['integraciones.ver', 'administracion.ver', 'admin'],
    Page: lazy(() => import('./IntegracionesPage').then(m => ({ default: m.IntegracionesPage }))),
    nav: { key: 'integraciones', label: 'Integraciones', to: '/sistema/integraciones', icon: 'Cog', permisos: ['integraciones.ver', 'administracion.ver', 'admin'] },
  },
];
