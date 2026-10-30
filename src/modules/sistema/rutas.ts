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
  {
    path: 'sistema/empresa/*',
    permisos: ['administracion.ver', 'admin'],
    Page: lazy(() => import('./ConfiguracionEmpresaPage').then(m => ({ default: m.ConfiguracionEmpresaPage }))),
    nav: { key: 'empresa', label: 'Empresa', to: '/sistema/empresa', icon: 'Building2', permisos: ['administracion.ver', 'administracion.ver', 'admin'] },
  },
  {
    path: 'sistema/notificaciones/*',
    permisos: ['administracion.ver', 'admin'],
    Page: lazy(() => import('./NotificacionesPage').then(m => ({ default: m.NotificacionesPage }))),
    nav: { key: 'notificaciones', label: 'Notificaciones', to: '/sistema/notificaciones', icon: 'Bell', permisos: ['administracion.ver', 'admin'] },
  },
  {
    path: 'sistema/api/*',
    permisos: ['administracion.ver', 'admin'],
    Page: lazy(() => import('./ApiDesarrolladoresPage').then(m => ({ default: m.ApiDesarrolladoresPage }))),
    nav: { key: 'api-gateway', label: 'API y desarrolladores', to: '/sistema/api', icon: 'Code', permisos: ['administracion.ver', 'admin'] },
  },
  {
    path: 'sistema/accesibilidad/*',
    permisos: [],
    Page: lazy(() => import('./AccesibilidadPage').then(m => ({ default: m.AccesibilidadPage }))),
    nav: { key: 'accesibilidad', label: 'Accesibilidad e idioma', to: '/sistema/accesibilidad', icon: 'Accessibility', permisos: [] },
  },
  {
    path: 'sistema/2fa/*',
    permisos: [],
    Page: lazy(() => import('./Seguridad2FAPage').then(m => ({ default: m.Seguridad2FAPage }))),
    nav: { key: '2fa', label: 'Seguridad 2FA', to: '/sistema/2fa', icon: 'KeyRound', permisos: [] },
  },
  {
    path: 'sistema/superadmin/*',
    permisos: ['administracion'],
    Page: lazy(() => import('./SuperadminEmpresasPage').then(m => ({ default: m.SuperadminEmpresasPage }))),
    nav: { key: 'superadmin', label: 'Empresas SaaS (SuperAdmin)', to: '/sistema/superadmin', icon: 'Building2', permisos: [] },
  },
];
