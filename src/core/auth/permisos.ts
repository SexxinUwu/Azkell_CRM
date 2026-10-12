// Convierte los permisos de la versión actual (matriz por módulo en permisos_json) a nombres
// del tipo 'modulo.accion', que es lo que usa la app nueva:
//   { placas: { l: 1, c: 0, e: 1, d: 0 } } → ['placas.ver', 'placas.editar']
//   { mod_auditoria: true }               → ['mod_auditoria.ver']
//   { admin: true }                        → acceso total (ADMIN)
// Mientras convivan las dos versiones, el servidor sigue validando con la matriz (rbac.js).

export const ADMIN = '*';

const ACCIONES: Record<string, string> = { l: 'ver', c: 'crear', e: 'editar', d: 'eliminar' };
const activo = (v: unknown) => v === 1 || v === true || v === '1';

export function permisosDesdeMatriz(raw: unknown, rol = '', correo = ''): string[] {
  let p: Record<string, unknown> = {};
  try {
    p = typeof raw === 'string' ? JSON.parse(raw || '{}') : ((raw as Record<string, unknown>) ?? {});
    if (typeof p === 'string') p = JSON.parse(p);
  } catch { p = {}; }

  // Mismo criterio que window.checkPerm en logica.js
  const r = rol.toLowerCase();
  const esAdmin = p.admin === true || r.includes('admin') || r === 'fundador' || r === 'gerente general'
    || correo.toLowerCase() === 'admin@azkell.com';
  if (esAdmin) return [ADMIN];

  const lista: string[] = [];
  for (const [modulo, valor] of Object.entries(p)) {
    if (modulo === 'admin') continue;
    if (valor && typeof valor === 'object') {
      const v = valor as Record<string, unknown>;
      for (const [letra, accion] of Object.entries(ACCIONES)) if (activo(v[letra])) lista.push(`${modulo}.${accion}`);
      if (activo(v.enabled) && !lista.includes(`${modulo}.ver`)) lista.push(`${modulo}.ver`);
    } else if (activo(valor)) {
      lista.push(`${modulo}.ver`);
    }
  }
  return lista;
}
