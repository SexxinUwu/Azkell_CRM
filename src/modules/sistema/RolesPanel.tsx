import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Banknote, Boxes, ChevronLeft, ChevronRight, Contact, IdCard, LayoutDashboard, Plus, Route, Settings, ShieldCheck,
  Trash2, Truck, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { COLORES_ROL, MODULOS_PERMISO, type ModuloPermiso } from './permisosCatalogo';

// Roles y permisos en lista y detalle (mismo patrón que KINTSUGI). Usa los endpoints y el formato
// de la versión actual: POST/PUT/DELETE /api/roles, permisos_json con {modulo: {l, c, e, d}}.

export interface RolFila {
  id: number;
  nombre: string;
  color?: string | null;
  es_admin?: number | boolean;
  orden?: number | null;
  permisos_json?: string | null;
  miembros?: number;
}

type Accion = 'l' | 'c' | 'e' | 'd';
const ETIQUETA: Record<Accion, string> = { l: 'Leer', c: 'Crear', e: 'Editar', d: 'Eliminar' };
type Marcas = Partial<Record<Accion, boolean>>;

const ICONO_GRUPO: Record<string, LucideIcon> = {
  DASHBOARD: LayoutDashboard, FLOTA: Truck, MANTENIMIENTO: Wrench, ALMACÉN: Boxes, GERENCIA: ShieldCheck,
  DIRECTORIO: Contact, OPERACIONES: Route, CONDUCTOR: IdCard, RRHH: Users, TESORERÍA: Banknote,
  SEGURIDAD: ShieldCheck, CONFIGURACIÓN: Settings,
};

const accionesDe = (mod: ModuloPermiso): Accion[] => (mod.lcad ? ['l', 'c', 'e', 'd'] : ['l']);
const etiquetaGrupo = (g: string) => g.charAt(0) + g.slice(1).toLowerCase();

function leerPermisos(json: string | null | undefined): Record<string, Marcas> {
  try {
    const p = JSON.parse(json || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

interface Borrador { nombre: string; color: string; esAdmin: boolean; marcas: Record<string, Marcas> }

const aBorrador = (r: RolFila): Borrador => ({
  nombre: r.nombre,
  color: r.color || COLORES_ROL[0],
  esAdmin: !!r.es_admin,
  marcas: leerPermisos(r.permisos_json),
});

// Solo lleva los módulos del catálogo; los que no tienen crear/editar/eliminar guardan solo "l"
function armarPermisos(b: Borrador): string {
  if (b.esAdmin) return '{}';
  const salida: Record<string, Record<string, number>> = {};
  MODULOS_PERMISO.forEach(mod => {
    const m = b.marcas[mod.key] ?? {};
    salida[mod.key] = mod.lcad
      ? { l: m.l ? 1 : 0, c: m.c ? 1 : 0, e: m.e ? 1 : 0, d: m.d ? 1 : 0 }
      : { l: m.l ? 1 : 0 };
  });
  return JSON.stringify(salida);
}

const modulosConAcceso = (marcas: Record<string, Marcas>) =>
  MODULOS_PERMISO.filter(m => marcas[m.key]?.l).length;

const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;

export function RolesPanel({ roles, canEdit = true }: { roles: RolFila[]; canEdit?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNarrow = useMediaQuery('(max-width: 899px)');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Borrador | null>(null);
  const [pendiente, setPendiente] = useState<{ id: number | null } | null>(null);
  const [creando, setCreando] = useState(false);
  const [seleccionarNombre, setSeleccionarNombre] = useState<string | null>(null);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find(r => r.id === selectedId) ?? null;

  // Escritorio: se abre el primer rol. Celular: se empieza por la lista.
  useEffect(() => {
    if (selectedId == null && roles.length && !isNarrow) setSelectedId(roles[0].id);
  }, [roles, selectedId, isNarrow]);

  // Un rol recién creado queda seleccionado cuando llega a la lista
  useEffect(() => {
    if (!seleccionarNombre) return;
    const nuevo = roles.find(r => r.nombre === seleccionarNombre);
    if (nuevo) { setSelectedId(nuevo.id); setSeleccionarNombre(null); }
  }, [roles, seleccionarNombre]);

  // El borrador se reinicia solo al cambiar de rol (no al recargar datos, para no perder cambios sin guardar)
  useEffect(() => {
    const r = roles.find(x => x.id === selectedId);
    setDraft(r ? aBorrador(r) : null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const cuerpoGuardado = useMemo(() => (selected ? armarPermisos(aBorrador(selected)) : ''), [selected]);
  const dirty = !!(draft && selected && (
    draft.nombre !== selected.nombre || draft.color !== (selected.color || COLORES_ROL[0]) ||
    draft.esAdmin !== !!selected.es_admin || armarPermisos(draft) !== cuerpoGuardado
  ));
  const readOnly = !canEdit;

  const grupos = useMemo(() => {
    const m = new Map<string, ModuloPermiso[]>();
    MODULOS_PERMISO.forEach(mod => m.set(mod.grupo, [...(m.get(mod.grupo) ?? []), mod]));
    return [...m];
  }, []);

  function elegir(id: number | null) {
    if (dirty && id !== selectedId) setPendiente({ id });
    else setSelectedId(id);
  }

  const marcado = (key: string, a: Accion) => !!draft?.marcas[key]?.[a];
  function alternar(key: string, a: Accion) {
    setDraft(d => d && ({ ...d, marcas: { ...d.marcas, [key]: { ...d.marcas[key], [a]: !d.marcas[key]?.[a] } } }));
  }
  const grupoCompleto = (mods: ModuloPermiso[]) =>
    !!draft && mods.every(m => accionesDe(m).every(a => marcado(m.key, a)));
  function fijarGrupo(mods: ModuloPermiso[], valor: boolean) {
    setDraft(d => {
      if (!d) return d;
      const marcas = { ...d.marcas };
      mods.forEach(m => { marcas[m.key] = Object.fromEntries(accionesDe(m).map(a => [a, valor])) as Marcas; });
      return { ...d, marcas };
    });
  }

  async function guardar() {
    if (!selected || !draft) return;
    if (draft.nombre.trim().length < 2) { setError('El nombre del rol es obligatorio.'); return; }
    setGuardando(true); setError(null);
    try {
      await api(`/roles/${selected.id}`, {
        method: 'PUT',
        body: { nombre: draft.nombre.trim(), color: draft.color, permisos_json: armarPermisos(draft), es_admin: draft.esAdmin ? 1 : 0, orden: selected.orden ?? 0 },
      });
      haptic('success');
      toast('Rol actualizado.');
      await qc.invalidateQueries({ queryKey: ['sistema'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function borrar() {
    if (!selected) return;
    setBorrando(true); setError(null);
    try {
      await api(`/roles/${selected.id}`, { method: 'DELETE' });
      haptic('success');
      toast('Rol eliminado.');
      setConfirmBorrar(false);
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ['sistema'] });
    } catch (err) {
      setConfirmBorrar(false);
      setError(errorMessage(err)); haptic('warning');
    } finally { setBorrando(false); }
  }

  const mostrarLista = !isNarrow || selectedId == null;
  const mostrarDetalle = !isNarrow || selectedId != null;

  return (
    <>
      <div className="roles">
        {mostrarLista && (
          <aside className="roles__lista" aria-label="Roles">
            <div className="roles__lista-cab">
              <span className="roles__lista-titulo">Roles · {roles.length}</span>
              {canEdit && <Button size="sm" variant="secondary" icon={<Plus size={15} />} onClick={() => setCreando(true)}>Nuevo</Button>}
            </div>
            <div className="list roles__items">
              {roles.map(r => (
                <button key={r.id} type="button" className="row role-item" aria-current={r.id === selectedId} onClick={() => elegir(r.id)}>
                  <span className="role-item__punto" style={{ background: r.color || 'var(--accent)' }} aria-hidden />
                  <span className="row__main">
                    <span className="row__title role-item__nombre">{r.nombre}</span>
                    <span className="row__subtitle">
                      {plural(r.miembros ?? 0, 'usuario', 'usuarios')} · {r.es_admin ? 'Administrador' : `${modulosConAcceso(leerPermisos(r.permisos_json))} módulos`}
                    </span>
                  </span>
                  {isNarrow && <ChevronRight size={18} className="row__chevron" />}
                </button>
              ))}
            </div>
          </aside>
        )}

        {mostrarDetalle && (
          <section className="roles__detalle" aria-live="polite">
            {!selected || !draft ? (
              <div className="list">
                <EmptyState icon={<ShieldCheck size={22} />} title="Selecciona un rol">
                  Cada rol define qué módulos puede ver y usar cada persona.
                </EmptyState>
              </div>
            ) : (
              <motion.div key={selected.id} className="roles__contenido"
                initial={{ opacity: 0, x: isNarrow ? 16 : 0 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
                {isNarrow && (
                  <button type="button" className="roles__volver" onClick={() => elegir(null)}>
                    <ChevronLeft size={18} /> Roles
                  </button>
                )}

                <div className="card role-cabecera">
                  <Field label="Nombre del rol">
                    {p => <TextInput {...p} className="role-name-input" value={draft.nombre} disabled={readOnly}
                      onChange={e => setDraft(d => d && { ...d, nombre: e.target.value })} />}
                  </Field>

                  <div className="role-colores" role="group" aria-label="Color del rol">
                    {COLORES_ROL.map(c => (
                      <button key={c} type="button" className="role-color" aria-label={`Color ${c}`} aria-pressed={draft.color === c}
                        disabled={readOnly} style={{ '--c': c } as CSSProperties}
                        onClick={() => setDraft(d => d && { ...d, color: c })} />
                    ))}
                  </div>

                  <div className="role-meta">
                    <span className="chip chip--static">{modulosConAcceso(draft.marcas)} de {MODULOS_PERMISO.length} módulos</span>
                    <span className="chip chip--static">{plural(selected.miembros ?? 0, 'usuario', 'usuarios')}</span>
                  </div>

                  <div className="role-admin">
                    <div>
                      <div className="role-admin__titulo">Acceso de administrador</div>
                      <div className="role-admin__sub">Ve y edita todo el sistema, sin casillas.</div>
                    </div>
                    <Switch checked={draft.esAdmin} disabled={readOnly} onChange={v => setDraft(d => d && { ...d, esAdmin: v })}
                      label="Acceso de administrador" />
                  </div>
                </div>

                {error && <Notice tone="error">{error}</Notice>}

                {draft.esAdmin ? (
                  <p className="role-nota">Como es administrador, tiene acceso a todo. Desactiva el interruptor para elegir módulos.</p>
                ) : grupos.map(([grupo, mods]) => {
                  const Icono = ICONO_GRUPO[grupo] ?? Settings;
                  const completo = grupoCompleto(mods);
                  const conAcceso = mods.filter(m => marcado(m.key, 'l')).length;
                  return (
                    <section key={grupo} className="perm-grupo">
                      <header className="perm-grupo__cab">
                        <span className="perm-grupo__icono"><Icono size={16} strokeWidth={1.9} /></span>
                        <div className="perm-grupo__texto">
                          <span className="perm-grupo__titulo">{etiquetaGrupo(grupo)}</span>
                          <span className="perm-grupo__sub">{conAcceso} de {mods.length} con acceso</span>
                        </div>
                        {!readOnly && (
                          <button type="button" className="perm-grupo__todos" onClick={() => fijarGrupo(mods, !completo)}>
                            {completo ? 'Quitar todos' : 'Activar todos'}
                          </button>
                        )}
                      </header>
                      {mods.map(mod => (
                        <div key={mod.key} className="perm-modulo">
                          <div className="perm-modulo__info">
                            <span className="perm-modulo__nombre">{mod.nombre}</span>
                            <span className="perm-modulo__desc">{mod.desc}</span>
                          </div>
                          <div className="perm-modulo__acciones" role="group" aria-label={`Permisos de ${mod.nombre}`}>
                            {accionesDe(mod).map(a => (
                              <button key={a} type="button" className="chip" aria-pressed={marcado(mod.key, a)} disabled={readOnly}
                                onClick={() => alternar(mod.key, a)}>
                                {ETIQUETA[a]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>
                  );
                })}

                {canEdit && (
                  <button type="button" className="roles__borrar" disabled={(selected.miembros ?? 0) > 0}
                    onClick={() => setConfirmBorrar(true)}>
                    <Trash2 size={16} />
                    {(selected.miembros ?? 0) > 0
                      ? `Eliminar rol · reasigna antes a sus ${selected.miembros} usuarios`
                      : 'Eliminar rol'}
                  </button>
                )}
              </motion.div>
            )}
          </section>
        )}
      </div>

      <AnimatePresence>
        {dirty && !readOnly && selected && (
          <motion.div className="save-bar" role="status"
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }} transition={spring}>
            <span className="save-bar__texto">Tienes cambios sin guardar</span>
            <div className="save-bar__acciones">
              <Button size="sm" variant="secondary" onClick={() => setDraft(aBorrador(selected))}>Descartar</Button>
              <Button size="sm" variant="primary" onClick={guardar} loading={guardando} disabled={(draft?.nombre ?? '').trim().length < 2}>
                Guardar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmSheet
        open={!!pendiente}
        onClose={() => setPendiente(null)}
        onConfirm={() => { setSelectedId(pendiente?.id ?? null); setPendiente(null); }}
        title="¿Descartar los cambios?"
        message="Hiciste cambios en este rol que todavía no guardaste."
        confirmLabel="Descartar"
      />

      <ConfirmSheet
        open={confirmBorrar}
        onClose={() => setConfirmBorrar(false)}
        onConfirm={borrar}
        loading={borrando}
        title={`¿Eliminar el rol ${selected?.nombre ?? ''}?`}
        message="El rol desaparecerá de la lista. Solo se puede si no tiene usuarios asignados."
        confirmLabel="Eliminar"
      />

      <CrearRolSheet open={creando} onClose={() => setCreando(false)} onCreado={n => setSeleccionarNombre(n)} />
    </>
  );
}

function CrearRolSheet({ open, onClose, onCreado }: { open: boolean; onClose: () => void; onCreado: (nombre: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<string>(COLORES_ROL[0]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [abiertoPara, setAbiertoPara] = useState(false);
  if (open && !abiertoPara) { setAbiertoPara(true); setNombre(''); setColor(COLORES_ROL[0]); setError(null); }
  if (!open && abiertoPara) setAbiertoPara(false);

  async function crear() {
    const limpio = nombre.trim();
    if (limpio.length < 2) { setError('Escribe el nombre del rol.'); return; }
    setEnviando(true); setError(null);
    try {
      await api('/roles', {
        method: 'POST',
        body: { nombre: limpio, color, permisos_json: armarPermisos({ nombre: limpio, color, esAdmin: false, marcas: {} }), es_admin: 0, orden: 0 },
      });
      haptic('success');
      toast(`Rol ${limpio} creado.`);
      await qc.invalidateQueries({ queryKey: ['sistema'] });
      onCreado(limpio);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nuevo rol"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={crear} loading={enviando}>Crear rol</Button>
      </>}>
      {error && <div style={{ marginBottom: 'var(--s-4)' }}><Notice tone="error">{error}</Notice></div>}
      <div className="form-grid">
        <Field label="Nombre del rol" wide>
          {p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Supervisor de flota" />}
        </Field>
        <Field label="Color" wide>
          {() => (
            <div className="role-colores">
              {COLORES_ROL.map(c => (
                <button key={c} type="button" className="role-color" aria-label={`Color ${c}`} aria-pressed={color === c}
                  style={{ '--c': c } as CSSProperties} onClick={() => setColor(c)} />
              ))}
            </div>
          )}
        </Field>
        <p className="t-footnote c-secondary" style={{ gridColumn: '1 / -1' }}>
          El rol se crea sin permisos. Después activas los módulos que necesite.
        </p>
      </div>
    </Sheet>
  );
}
