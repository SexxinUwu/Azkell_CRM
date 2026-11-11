import { useMemo, useState } from 'react';
import { ChevronRight, ShieldCheck, SearchX } from 'lucide-react';
import { EmptyState } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { haptic } from '../../core/lib/haptics';
import { MODULOS_PERMISO, type ModuloPermiso } from './permisosCatalogo';

/** Lo mínimo que se necesita de un usuario y de un rol (la pantalla de Usuarios tiene más campos) */
export interface UsuarioAcceso { idUsuario?: string; nombre?: string; correo?: string; rol?: string; rol_id?: number | string | null; estado?: string; permisos?: unknown }
export interface RolAcceso { id: number; nombre: string; color?: string; es_admin?: number; permisos_json?: string | null }

type Accion = 'l' | 'c' | 'e' | 'd';
const ACCIONES: Array<{ a: Accion; texto: string }> = [{ a: 'l', texto: 'Leer' }, { a: 'c', texto: 'Crear' }, { a: 'e', texto: 'Editar' }, { a: 'd', texto: 'Eliminar' }];
type Mapa = Record<string, Partial<Record<Accion, number | boolean>>>;

const leer = (v: unknown): Mapa => {
  try { const p = typeof v === 'string' ? JSON.parse(v || '{}') : v; return p && typeof p === 'object' ? (p as Mapa) : {}; } catch { return {}; }
};

/** Permisos reales de un usuario: los de su rol más los suyos propios, igual que los calcula el servidor al iniciar sesión */
function efectivos(u: UsuarioAcceso, roles: RolAcceso[]): { admin: boolean; permisos: Mapa } {
  const rol = roles.find(r => String(r.id) === String(u.rol_id));
  if (rol?.es_admin) return { admin: true, permisos: {} };
  const rP = leer(rol?.permisos_json), uP = leer(u.permisos);
  const merged: Mapa = { ...rP };
  for (const k of Object.keys(uP)) merged[k] = merged[k] ? { ...merged[k], ...uP[k] } : uP[k];
  return { admin: false, permisos: merged };
}

/**
 * Quién puede leer, crear, editar y eliminar en cada módulo, con los permisos reales de cada usuario activo.
 * Es solo de consulta: los permisos se cambian en Roles (o en la ficha del usuario).
 */
export function AccesosPanel({ usuarios, roles }: { usuarios: UsuarioAcceso[]; roles: RolAcceso[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<ModuloPermiso | null>(null);

  const activos = useMemo(() => usuarios.filter(u => String(u.estado ?? 'Activo').toLowerCase() === 'activo').map(u => ({ u, e: efectivos(u, roles) })), [usuarios, roles]);

  /** Usuarios con esa acción en ese módulo (los administradores siempre) */
  const quienes = (mod: ModuloPermiso, a: Accion) => activos.filter(({ e }) => e.admin || e.permisos[mod.key]?.[a] === 1 || e.permisos[mod.key]?.[a] === true).map(x => x.u);
  const cuantos = (mod: ModuloPermiso, a: Accion) => quienes(mod, a).length;

  const grupos = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    const m = new Map<string, ModuloPermiso[]>();
    for (const mod of MODULOS_PERMISO) {
      if (q && !`${mod.nombre} ${mod.grupo} ${mod.desc}`.toUpperCase().includes(q)) continue;
      m.set(mod.grupo, [...(m.get(mod.grupo) ?? []), mod]);
    }
    return [...m];
  }, [busqueda]);

  return (
    <div className="acc">
      <p className="acc__intro"><ShieldCheck size={16} aria-hidden /> Cuántas personas activas pueden hacer cada cosa en cada módulo. Toca un módulo para ver quiénes son.</p>
      <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar módulo" />

      {grupos.length === 0 ? <EmptyState icon={<SearchX size={22} />} title="Ningún módulo coincide">Prueba con otro nombre.</EmptyState> : grupos.map(([grupo, mods]) => (
        <section key={grupo} className="acc__grupo">
          <h3 className="acc__grupo-titulo">{grupo.charAt(0) + grupo.slice(1).toLowerCase()}</h3>
          <div className="acc__cab" aria-hidden>{ACCIONES.map(x => <span key={x.a}>{x.texto}</span>)}</div>
          <ul className="acc__lista">
            {mods.map(mod => (
              <li key={mod.key}>
                <button type="button" className="acc__fila" onClick={() => { haptic('selection'); setAbierto(mod); }}>
                  <span className="acc__nombre"><b>{mod.nombre}</b><small>{mod.desc}</small></span>
                  <span className="acc__cifras">
                    {ACCIONES.map(x => {
                      const aplica = mod.lcad || x.a === 'l';
                      const n = aplica ? cuantos(mod, x.a) : null;
                      return <span key={x.a} className={`acc__cifra${n === 0 ? ' acc__cifra--cero' : ''}${n == null ? ' acc__cifra--na' : ''}`} aria-label={`${x.texto}: ${n ?? 'no aplica'}`} data-t={`${x.texto} `}>{n ?? '—'}</span>;
                    })}
                  </span>
                  <ChevronRight size={16} className="acc__chev" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!abierto} onClose={() => setAbierto(null)} title={abierto?.nombre ?? 'Accesos'}>
        {abierto && (
          <div className="acc__detalle">
            <p className="acc__intro" style={{ margin: 0 }}>{abierto.desc}</p>
            {ACCIONES.filter(x => abierto.lcad || x.a === 'l').map(x => {
              const gente = quienes(abierto, x.a);
              return (
                <section key={x.a}>
                  <h4 className="acc__sub">{x.texto} <span className="acc__n">{gente.length}</span></h4>
                  {gente.length === 0 ? <p className="acc__vacio">Nadie.</p> : (
                    <ul className="acc__personas">
                      {gente.map((u, i) => (
                        <li key={`${u.idUsuario ?? u.correo}-${i}`}><span>{u.nombre || u.correo}</span><small>{u.rol || 'Sin rol'}</small></li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Sheet>
    </div>
  );
}
