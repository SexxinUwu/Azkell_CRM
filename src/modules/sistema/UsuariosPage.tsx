import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SearchX, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, PasswordInput, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { RolSheet } from './RolSheet';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Usuario {
  id?: string | number;
  idUsuario?: string;
  correo?: string;
  email?: string;
  nombre?: string;
  nombre_completo?: string;
  dni?: string;
  cargo?: string;
  rol?: string;
  rol_id?: number | string | null;
  empresa?: string;
  empresa_tenants?: string;
  activo?: boolean | number | string;
  estado?: string;
  ultimo_acceso?: string;
  creado_en?: string;
  [key: string]: unknown;
}

interface Rol {
  id: number;
  nombre: string;
  color?: string;
  es_admin?: number;
  orden?: number | null;
  permisos_json?: string | null;
  miembros?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usuarioId(u: Usuario): string {
  return String(u.idUsuario ?? u.id ?? '');
}

function usuarioActivo(u: Usuario): boolean {
  if (u.estado) return u.estado.toLowerCase() === 'activo';
  return u.activo === true || u.activo === 1 || u.activo === '1';
}

function rolColor(rol: string): string {
  const r = (rol ?? '').toLowerCase();
  if (r === 'admin' || r.includes('admin') || r.includes('fundador')) return 'accent';
  if (r.includes('gerencia') || r.includes('gerente')) return 'blue';
  if (r.includes('tecnico') || r.includes('taller')) return 'amber';
  return 'neutral';
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

// El servidor manda cada usuario como fila, en el mismo orden que usa la versión actual
// (routes/legacy.js → obtenerDatosUsuarios). Aquí se convierte a objeto para la pantalla.
function desdeFila(f: unknown[]): Usuario {
  return {
    idUsuario: String(f[0] ?? ''),
    nombre: String(f[1] ?? ''),
    cargo: String(f[2] ?? ''),
    correo: String(f[3] ?? ''),
    rol: String(f[4] ?? ''),
    estado: String(f[5] ?? ''),
    permisos: f[7],
    rol_id: (f[8] as number | string | null) ?? null,
    rol_color: f[9] ?? null,
    ultimo_acceso: f[10] ? String(f[10]) : undefined,
    dni: String(f[13] ?? ''),
  };
}

function useUsuarios() {
  return useQuery<Usuario[]>({
    queryKey: ['sistema', 'usuarios'],
    queryFn: async () => {
      const r = await api<unknown>('/script/obtenerDatosUsuarios', { method: 'POST', body: { args: [] } });
      const filas = Array.isArray(r) ? r : (r as { data?: unknown } | null)?.data;
      if (!Array.isArray(filas)) {
        throw new Error(typeof filas === 'string' ? filas : 'No se pudieron cargar los usuarios.');
      }
      return filas.map(f => (Array.isArray(f) ? desdeFila(f) : (f as Usuario)));
    },
    staleTime: 60_000,
  });
}

function useRoles() {
  return useQuery<Rol[]>({
    queryKey: ['sistema', 'roles'],
    queryFn: () =>
      api('/roles').then((r: unknown) => {
        const obj = r as { data?: Rol[] };
        return obj.data ?? (Array.isArray(r) ? r as Rol[] : []);
      }),
    staleTime: 120_000,
  });
}

// ─── Formulario vacío ────────────────────────────────────────────────────────

const FORM_VACIO = { nombre: '', cargo: '', correo: '', dni: '', password: '', estado: 'Activo', rol_id: '' };
type FormUsuario = typeof FORM_VACIO;

// ─── Componente principal ─────────────────────────────────────────────────────

const TABS = ['Usuarios', 'Roles'] as const;

export function UsuariosPage() {
  const qc    = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error } = useUsuarios();
  const { data: roles = [] } = useRoles();

  const [tab, setTab]             = useState<typeof TABS[number]>('Usuarios');
  const [rolSheet, setRolSheet]   = useState<{ rol: Rol | null } | null>(null);
  const [busqueda, setBusqueda]   = useState('');
  const [form, setForm]           = useState<FormUsuario>(FORM_VACIO);
  const [editando, setEditando]   = useState<Usuario | null>(null);
  const [modalAbierto, setModal]  = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Usuario | null>(null);

  const lista = data ?? [];
  const admins = lista.filter(u => (u.rol ?? '').toLowerCase().includes('admin')).length;
  const activos = lista.filter(usuarioActivo).length;

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(u =>
      String(u.correo ?? u.email ?? '').toUpperCase().includes(q) ||
      String(u.nombre ?? u.nombre_completo ?? '').toUpperCase().includes(q) ||
      String(u.rol ?? '').toUpperCase().includes(q) ||
      String(u.cargo ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  // ─── Abrir modal crear ──────────────────────────────────────────────────────
  function abrirCrear() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  }

  // ─── Abrir modal editar ─────────────────────────────────────────────────────
  function abrirEditar(u: Usuario) {
    setEditando(u);
    setForm({
      nombre:   String(u.nombre ?? u.nombre_completo ?? ''),
      cargo:    String(u.cargo ?? ''),
      correo:   String(u.correo ?? u.email ?? ''),
      dni:      String(u.dni ?? ''),
      password: '',
      estado:   String(u.estado ?? (usuarioActivo(u) ? 'Activo' : 'Inactivo')),
      rol_id:   String(u.rol_id ?? ''),
    });
    setModal(true);
  }

  // ─── Guardar (crear o editar) ───────────────────────────────────────────────
  async function guardar() {
    if (!form.correo.trim()) { toast('El correo es obligatorio', 'error'); return; }
    if (!editando && !form.password.trim()) { toast('La contraseña es obligatoria al crear', 'error'); return; }
    setGuardando(true);
    try {
      const payload = {
        nombre:   form.nombre,
        cargo:    form.cargo,
        correo:   form.correo.trim().toLowerCase(),
        dni:      form.dni,
        estado:   form.estado,
        rol_id:   form.rol_id || null,
        ...(form.password.trim() ? { password: form.password } : {}),
      };
      if (editando) {
        await api(`/usuarios-v2/${usuarioId(editando)}`, { method: 'PUT', body: payload });
        toast('Usuario actualizado');
      } else {
        await api('/usuarios-v2', { method: 'POST', body: payload });
        toast('Usuario creado');
      }
      setModal(false);
      qc.invalidateQueries({ queryKey: ['sistema', 'usuarios'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  // ─── Toggle activo/inactivo ────────────────────────────────────────────────
  async function toggleEstado(u: Usuario) {
    const id = usuarioId(u);
    setToggling(id);
    setConfirmToggle(null);
    try {
      const nuevoEstado = usuarioActivo(u) ? 'Inactivo' : 'Activo';
      await api(`/usuarios-v2/${id}`, {
        method: 'PUT',
        body: {
          nombre: String(u.nombre ?? u.nombre_completo ?? ''),
          cargo:  String(u.cargo ?? ''),
          correo: String(u.correo ?? u.email ?? ''),
          dni:    String(u.dni ?? ''),
          estado: nuevoEstado,
          rol_id: u.rol_id ?? null,
        },
      });
      toast(`Usuario ${nuevoEstado.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['sistema', 'usuarios'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setToggling(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Usuarios y roles"
        subtitle={lista.length > 0 ? `${lista.length} usuarios · ${activos} activos · ${admins} admins` : undefined}
        actions={
          tab === 'Usuarios' ? (
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={abrirCrear}>
              Nuevo usuario
            </Button>
          ) : undefined
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--s-3)' }}>
        {TABS.map(t => (
          <button key={t} type="button"
            className={`chip${tab === t ? ' chip--active' : ''}`}
            onClick={() => setTab(t)}>
            {t === 'Usuarios' ? <><Users size={13} style={{ marginRight: 4 }} />{t} <span className="chip__badge">{lista.length}</span></>
              : <><ShieldCheck size={13} style={{ marginRight: 4 }} />{t} <span className="chip__badge">{roles.length}</span></>}
          </button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          {/* ── TAB: USUARIOS ── */}
          {tab === 'Usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Correo, nombre, cargo o rol…" />

              {visibles.length === 0 ? (
                <EmptyState icon={<SearchX size={22} />} title="Sin resultados">
                  <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar búsqueda</button>
                </EmptyState>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {visibles.map((u, i) => {
                    const id     = usuarioId(u);
                    const correo = String(u.correo ?? u.email ?? '—');
                    const nombre = String(u.nombre ?? u.nombre_completo ?? correo);
                    const rol    = String(u.rol ?? 'Usuario');
                    const cargo  = String(u.cargo ?? '');
                    const color  = rolColor(rol);
                    const actv   = usuarioActivo(u);
                    return (
                      <div key={id || i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--fill-1)', border: '1px solid var(--separator)',
                        opacity: actv ? 1 : 0.55,
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: `var(--${color}-tint)`, color: `var(--${color}-ink)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '0.95rem',
                        }}>
                          {nombre[0]?.toUpperCase() ?? '?'}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nombre}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {correo}{cargo ? ` · ${cargo}` : ''}
                          </div>
                        </div>
                        {/* Rol badge */}
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap',
                          background: `var(--${color}-tint)`, color: `var(--${color}-ink)`,
                          border: `1px solid var(--${color}-ink)`,
                        }}>
                          {rol}
                        </span>
                        {/* Estado */}
                        {!actv && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--label-3)', fontWeight: 600 }}>Inactivo</span>
                        )}
                        {/* Acciones */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button type="button" title="Editar"
                            onClick={() => abrirEditar(u)}
                            style={{ background: 'none', border: '1px solid var(--separator)', borderRadius: 6,
                              padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--label-1)' }}>
                            Editar
                          </button>
                          <button type="button"
                            title={actv ? 'Desactivar' : 'Activar'}
                            disabled={toggling === id}
                            onClick={() => setConfirmToggle(u)}
                            style={{ background: 'none', border: '1px solid var(--separator)', borderRadius: 6,
                              padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem',
                              color: actv ? 'var(--red-ink)' : 'var(--green-ink)' }}>
                            {actv ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: ROLES ── */}
          {tab === 'Roles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <div>
                <Button variant="primary" onClick={() => setRolSheet({ rol: null })}><Plus size={16} /> Nuevo rol</Button>
              </div>
              {roles.length === 0 ? (
                <EmptyState icon={<UserCog size={22} />} title="Sin roles configurados" />
              ) : roles.map(r => (
                <button type="button" key={r.id} onClick={() => setRolSheet({ rol: r })} style={{
                  width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--fill-1)', border: '1px solid var(--separator)',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: r.color || 'var(--accent)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.nombre}</div>
                    {r.es_admin ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Acceso de administrador</div>
                    ) : null}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>
                    {r.miembros ?? 0} usuarios
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modal crear / editar ── */}
      <Sheet
        open={modalAbierto}
        onClose={() => setModal(false)}
        title={editando ? 'Editar usuario' : 'Nuevo usuario'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="plain" onClick={() => setModal(false)} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" onClick={guardar} loading={guardando}>
              {editando ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <Field label="Nombre completo">
            {props => (
              <TextInput {...props} value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Juan Pérez" />
            )}
          </Field>
          <Field label="Correo electrónico">
            {props => (
              <TextInput {...props} type="email" value={form.correo}
                onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                placeholder="usuario@empresa.com"
                disabled={!!editando} />
            )}
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
            <Field label="Cargo">
              {props => (
                <TextInput {...props} value={form.cargo}
                  onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                  placeholder="Ej. Técnico" />
              )}
            </Field>
            <Field label="DNI">
              {props => (
                <TextInput {...props} value={form.dni}
                  onChange={e => setForm(f => ({ ...f, dni: e.target.value }))}
                  placeholder="12345678" maxLength={8} />
              )}
            </Field>
          </div>
          <Field label={editando ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}>
            {props => (
              <PasswordInput {...props} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editando ? 'Sin cambios' : 'Mínimo 6 caracteres'} />
            )}
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
            <Field label="Rol">
              {props => (
                <SelectInput {...props} value={form.rol_id}
                  onChange={e => setForm(f => ({ ...f, rol_id: e.target.value }))}>
                  <option value="">Sin rol asignado</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Estado">
              {props => (
                <SelectInput {...props} value={form.estado}
                  onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </SelectInput>
              )}
            </Field>
          </div>
        </div>
      </Sheet>

      {/* ── Confirm toggle estado ── */}
      <RolSheet open={rolSheet !== null} onClose={() => setRolSheet(null)} rol={rolSheet?.rol ?? null} />

      <ConfirmSheet
        open={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => confirmToggle && toggleEstado(confirmToggle)}
        title={confirmToggle && usuarioActivo(confirmToggle) ? 'Desactivar usuario' : 'Activar usuario'}
        message={confirmToggle
          ? `¿${usuarioActivo(confirmToggle) ? 'Desactivar' : 'Activar'} a ${String(confirmToggle.nombre ?? confirmToggle.correo ?? '')}? ${usuarioActivo(confirmToggle) ? 'No podrá iniciar sesión.' : 'Podrá volver a iniciar sesión.'}`
          : ''}
        confirmLabel={confirmToggle && usuarioActivo(confirmToggle) ? 'Desactivar' : 'Activar'}
      />
    </Page>
  );
}
