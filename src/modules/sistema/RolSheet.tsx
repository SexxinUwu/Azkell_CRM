import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Banknote, Boxes, CircleAlert, Contact, IdCard, LayoutDashboard, Route, Settings, ShieldCheck, Trash2, Truck, Users, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { COLORES_ROL, MODULOS_PERMISO, type ModuloPermiso } from './permisosCatalogo';

export interface RolEditable {
  id: number;
  nombre: string;
  color?: string | null;
  es_admin?: number | boolean;
  orden?: number | null;
  permisos_json?: string | null;
}

type Accion = 'l' | 'c' | 'e' | 'd';
const ETIQUETA: Record<Accion, string> = { l: 'Leer', c: 'Crear', e: 'Editar', d: 'Eliminar' };
type Marcas = Partial<Record<Accion, boolean>>;

// Icono y color de cada grupo de módulos
const ICONO_GRUPO: Record<string, LucideIcon> = {
  DASHBOARD: LayoutDashboard, FLOTA: Truck, MANTENIMIENTO: Wrench, ALMACÉN: Boxes, GERENCIA: ShieldCheck,
  DIRECTORIO: Contact, OPERACIONES: Route, CONDUCTOR: IdCard, RRHH: Users, TESORERÍA: Banknote,
  SEGURIDAD: ShieldCheck, CONFIGURACIÓN: Settings,
};
const COLOR_GRUPO: Record<string, string> = {
  DASHBOARD: '#0a84ff', FLOTA: '#30b0c7', MANTENIMIENTO: '#ff9f0a', ALMACÉN: '#30d158', GERENCIA: '#5e5ce6',
  DIRECTORIO: '#ff375f', OPERACIONES: '#64d2ff', CONDUCTOR: '#34c759', RRHH: '#bf5af2', TESORERÍA: '#ac8e68',
  SEGURIDAD: '#ff3b30', CONFIGURACIÓN: '#8e8e93',
};

const accionesDe = (mod: ModuloPermiso): Accion[] => (mod.lcad ? ['l', 'c', 'e', 'd'] : ['l']);

function leerPermisos(json: string | null | undefined): Record<string, Marcas> {
  try {
    const p = JSON.parse(json || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

// Crear o editar un rol con sus permisos por módulo. Mismos endpoints y formato que la versión actual
// (POST/PUT /api/roles, permisos_json con {modulo: {l, c, e, d}}). Si el rol es administrador, no lleva casillas.
export function RolSheet({ open, onClose, rol }: { open: boolean; onClose: () => void; rol: RolEditable | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<string>(COLORES_ROL[0]);
  const [esAdmin, setEsAdmin] = useState(false);
  const [orden, setOrden] = useState('0');
  const [marcas, setMarcas] = useState<Record<string, Marcas>>({});
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNombre(rol?.nombre ?? '');
    setColor(rol?.color || COLORES_ROL[0]);
    setEsAdmin(!!rol?.es_admin);
    setOrden(String(rol?.orden ?? 0));
    setMarcas(leerPermisos(rol?.permisos_json));
    setError(null);
  }, [open, rol]);

  const grupos = useMemo(() => {
    const m = new Map<string, ModuloPermiso[]>();
    MODULOS_PERMISO.forEach(mod => m.set(mod.grupo, [...(m.get(mod.grupo) ?? []), mod]));
    return [...m];
  }, []);

  const marcado = (key: string, accion: Accion) => !!marcas[key]?.[accion];
  const alternar = (key: string, accion: Accion) =>
    setMarcas(prev => ({ ...prev, [key]: { ...prev[key], [accion]: !prev[key]?.[accion] } }));

  const grupoCompleto = (mods: ModuloPermiso[]) =>
    mods.every(mod => accionesDe(mod).every(a => marcado(mod.key, a)));

  // Interruptor general del grupo: marca o desmarca todas sus acciones
  function fijarGrupo(mods: ModuloPermiso[], valor: boolean) {
    setMarcas(prev => {
      const siguiente = { ...prev };
      mods.forEach(mod => {
        siguiente[mod.key] = Object.fromEntries(accionesDe(mod).map(a => [a, valor])) as Marcas;
      });
      return siguiente;
    });
  }

  // Solo lleva los módulos del catálogo; los que no tienen "crear/editar/eliminar" guardan solo "l"
  function armarPermisos(): string {
    if (esAdmin) return '{}';
    const salida: Record<string, Record<string, number>> = {};
    MODULOS_PERMISO.forEach(mod => {
      const m = marcas[mod.key] ?? {};
      salida[mod.key] = mod.lcad
        ? { l: m.l ? 1 : 0, c: m.c ? 1 : 0, e: m.e ? 1 : 0, d: m.d ? 1 : 0 }
        : { l: m.l ? 1 : 0 };
    });
    return JSON.stringify(salida);
  }

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre del rol es obligatorio.'); return; }
    setGuardando(true); setError(null);
    const cuerpo = {
      nombre: nombre.trim(), color, permisos_json: armarPermisos(),
      es_admin: esAdmin ? 1 : 0, orden: Number(orden) || 0,
    };
    try {
      if (rol) await api(`/roles/${rol.id}`, { method: 'PUT', body: cuerpo });
      else await api('/roles', { method: 'POST', body: cuerpo });
      haptic('success');
      toast(rol ? 'Rol actualizado.' : 'Rol creado.');
      await qc.invalidateQueries({ queryKey: ['sistema'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function borrar() {
    if (!rol) return;
    setBorrando(true); setError(null);
    try {
      await api(`/roles/${rol.id}`, { method: 'DELETE' });
      haptic('success');
      toast('Rol eliminado.');
      setConfirmBorrar(false);
      await qc.invalidateQueries({ queryKey: ['sistema'] });
      onClose();
    } catch (err) {
      setConfirmBorrar(false);
      setError(errorMessage(err)); haptic('warning');
    } finally { setBorrando(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={() => !guardando && onClose()} title={rol ? 'Editar rol' : 'Nuevo rol'}
        footer={<>
          {rol && <Button variant="destructive" onClick={() => setConfirmBorrar(true)} disabled={guardando}>
            <Trash2 size={16} /> Eliminar
          </Button>}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button>
        </>}>
        {error && <div style={{ marginBottom: 'var(--s-4)' }}><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="form-grid">
          <Field label="Nombre del rol" wide>
            {p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Supervisor de Flota" />}
          </Field>
          <Field label="Color" wide>
            {() => (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {COLORES_ROL.map(c => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                    className="perm-color" style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : 'inset 0 0 0 0.5px rgba(0,0,0,0.15)',
                    }} />
                ))}
              </div>
            )}
          </Field>
          <Field label="Orden en la lista" wide hint="Los roles con número menor aparecen primero.">
            {p => <TextInput {...p} inputMode="numeric" value={orden} onChange={e => setOrden(e.target.value)} />}
          </Field>
        </div>

        <section className="perm-grupo perm-grupo--admin">
          <div className="perm-grupo__cab">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="perm-grupo__titulo">Acceso de administrador</div>
              <div className="perm-grupo__sub">Ve y edita todo el sistema. No necesita casillas.</div>
            </div>
            <Switch checked={esAdmin} onChange={setEsAdmin} label="Acceso de administrador" />
          </div>
        </section>

        {esAdmin ? (
          <p className="c-secondary" style={{ marginTop: 'var(--s-4)' }}>
            Como es administrador, el rol tiene acceso a todo. Desactiva el interruptor para elegir módulos.
          </p>
        ) : (
          <>
            <div className="list__header" style={{ marginTop: 'var(--s-5)' }}>Permisos por módulo</div>
            {grupos.map(([grupo, mods]) => {
              const Icono = ICONO_GRUPO[grupo] ?? Settings;
              const color = COLOR_GRUPO[grupo] ?? '#8e8e93';
              const completo = grupoCompleto(mods);
              return (
                <section key={grupo} className="perm-grupo" style={{ '--c': color } as CSSProperties}>
                  <div className="perm-grupo__cab">
                    <span className="perm-grupo__icono"><Icono size={18} strokeWidth={1.9} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="perm-grupo__titulo">{grupo}</div>
                      <div className="perm-grupo__sub">
                        {mods.length} {mods.length === 1 ? 'submódulo disponible' : 'submódulos disponibles'}
                      </div>
                    </div>
                    <Switch checked={completo} onChange={v => fijarGrupo(mods, v)} label={`Todo el grupo ${grupo}`} />
                  </div>
                  {mods.map(mod => {
                    const acciones = accionesDe(mod);
                    return (
                      <div key={mod.key} className="perm-modulo">
                        <div className="perm-modulo__info">
                          <div className="perm-modulo__nombre">{mod.nombre}</div>
                          <div className="perm-modulo__desc">{mod.desc}</div>
                        </div>
                        <div className={`perm-modulo__acciones${mod.lcad ? '' : ' perm-modulo__acciones--una'}`}>
                          {acciones.map(a => (
                            <div key={a} className="perm-accion">
                              <Switch checked={marcado(mod.key, a)} onChange={() => alternar(mod.key, a)}
                                label={`${ETIQUETA[a]} ${mod.nombre}`} />
                              <span>{ETIQUETA[a]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </>
        )}
      </Sheet>

      <ConfirmSheet open={confirmBorrar} onClose={() => setConfirmBorrar(false)} onConfirm={borrar} loading={borrando}
        title="Eliminar rol" confirmLabel="Eliminar"
        message={`¿Eliminar el rol "${rol?.nombre ?? ''}"? Solo se puede si no tiene usuarios asignados.`} />
    </>
  );
}
