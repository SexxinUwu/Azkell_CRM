import '../mantenimiento/mant.css';
import './superadmin.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Pause, Pencil, Play, Plus, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useAuth } from '../../core/auth/AuthProvider';
import { esFundadorSaaS } from '../../core/auth/permisos';

// Empresas SaaS (SuperAdmin): una fila por empresa del registro maestro (azkell_master, tabla empresas).
// Usa GET/POST /api/superadmin/empresas, PUT /api/superadmin/empresas/:id y PUT /api/superadmin/empresas/:id/estado.
// El alta crea la base de la empresa (azkell_tenant_<slug>) en el servidor.
interface ConsultaDocumento { razon_social?: string; nombre?: string; error?: string }
interface Empresa {
  id: number; slug: string; nombre_empresa: string; ruc: string | null; db_name: string;
  estado: 'activo' | 'suspendido' | 'demo' | null; plan: string | null; max_unidades: number | null; admin_email: string | null;
}

const ESTADOS: Array<'activo' | 'suspendido' | 'demo'> = ['activo', 'suspendido', 'demo'];
const PLANES = [
  { valor: 'Básico', etiqueta: 'Básico (hasta 20 unidades)' },
  { valor: 'Profesional', etiqueta: 'Profesional (hasta 100 unidades)' },
  { valor: 'Empresarial', etiqueta: 'Empresarial (ilimitado)' },
];
// Subdominios que no pueden ser de una empresa (mismos reservados que el servidor de sitios)
const RESERVADOS = ['www', 'app', 'azkell', 'fleet', 'admin', 'master', 'seguridad', 'api'];
const SUBDOMINIO = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const validarSubdominio = (s: string): string | null => {
  if (!SUBDOMINIO.test(s)) return 'Usa de 3 a 30 letras minúsculas, números o guiones, sin empezar ni terminar en guion.';
  if (RESERVADOS.includes(s)) return 'Ese subdominio está reservado.';
  return null;
};


export function SuperadminEmpresasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const soyFundador = esFundadorSaaS(user);
  const [editando, setEditando] = useState<Empresa | null | 'nueva'>(null);
  const [cambiando, setCambiando] = useState<Empresa | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const lista = useQuery<Empresa[]>({
    queryKey: ['superadmin', 'empresas'],
    queryFn: () => api<Empresa[]>('/superadmin/empresas'),
    staleTime: 30_000,
    enabled: soyFundador, // sin este permiso el servidor responde 401; no se pide nada
  });
  const empresas = useMemo(() => lista.data ?? [], [lista.data]);
  const cuenta = (e: string) => empresas.filter(x => x.estado === e).length;
  const unidades = empresas.reduce((s, e) => s + Number(e.max_unidades ?? 0), 0);

  async function confirmarCambioEstado() {
    if (!cambiando) return;
    const nuevo = cambiando.estado === 'activo' ? 'suspendido' : 'activo';
    setCambiandoEstado(true);
    try {
      await api(`/superadmin/empresas/${cambiando.id}/estado`, { method: 'PUT', body: { estado: nuevo } });
      toast(nuevo === 'activo' ? 'Empresa activada' : 'Empresa suspendida');
      haptic('success');
      setCambiando(null);
      await qc.invalidateQueries({ queryKey: ['superadmin', 'empresas'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setCambiandoEstado(false);
    }
  }

  if (!soyFundador) {
    return (
      <Page narrow>
        <div className="sa-vacio">Solo el administrador de Azkell puede ver esta sección.</div>
      </Page>
    );
  }

  return (
    <Page>
      <section className="sa-hero">
        <div>
          <span className="sa-hero__etiqueta">Azkell SaaS Master</span>
          <h1 className="sa-hero__titulo">Empresas suscritas</h1>
          <p className="sa-hero__texto">Cada empresa tiene su propia base de datos aislada, con su acceso y su plan.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando('nueva')}>Nueva empresa</Button>
      </section>

      <div className="sa-stats">
        <Estadistica etiqueta="Empresas" valor={empresas.length} icono={<Building2 size={18} />} />
        <Estadistica etiqueta="Activas" valor={cuenta('activo')} color="var(--green-ink)" icono={<Play size={18} />} />
        <Estadistica etiqueta="Suspendidas" valor={cuenta('suspendido')} color="var(--red-ink)" icono={<Pause size={18} />} />
        <Estadistica etiqueta="Unidades contratadas" valor={unidades} icono={<Truck size={18} />} />
      </div>

      {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : empresas.length === 0 ? (
        <EmptyState icon={<Building2 size={22} />} title="Sin empresas">Agrega la primera empresa del SaaS.</EmptyState>
      ) : (
        <div className="sa-lista">
          {empresas.map(e => (
            <TarjetaEmpresa key={e.id} empresa={e} onEditar={() => setEditando(e)} onCambiarEstado={() => setCambiando(e)} />
          ))}
        </div>
      )}

      <EmpresaSheet
        abierto={editando !== null}
        empresa={editando === 'nueva' || editando === null ? null : editando}
        onClose={() => setEditando(null)}
        onGuardado={() => qc.invalidateQueries({ queryKey: ['superadmin', 'empresas'] })} />

      <ConfirmSheet
        open={!!cambiando}
        onClose={() => { if (!cambiandoEstado) setCambiando(null); }}
        onConfirm={confirmarCambioEstado}
        loading={cambiandoEstado}
        title={cambiando?.estado === 'activo' ? `¿Suspender ${cambiando?.nombre_empresa ?? ''}?` : `¿Activar ${cambiando?.nombre_empresa ?? ''}?`}
        message={cambiando?.estado === 'activo'
          ? 'Sus usuarios no podrán ingresar hasta que la reactives.'
          : 'Sus usuarios podrán volver a ingresar.'}
        confirmLabel={cambiando?.estado === 'activo' ? 'Suspender' : 'Activar'} />
    </Page>
  );
}

function Estadistica({ etiqueta, valor, color, icono }: { etiqueta: string; valor: number; color?: string; icono: ReactNode }) {
  return (
    <div className="sa-stat">
      <span className="sa-stat__icono" aria-hidden="true">{icono}</span>
      <span className="sa-stat__etiqueta">{etiqueta}</span>
      <span className="sa-stat__valor" style={color ? { color } : undefined}>{valor.toLocaleString('es-PE')}</span>
    </div>
  );
}

function TarjetaEmpresa({ empresa: e, onEditar, onCambiarEstado }: {
  empresa: Empresa; onEditar: () => void; onCambiarEstado: () => void;
}) {
  const activa = e.estado === 'activo';
  const iniciales = e.nombre_empresa.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const tonoChip = activa ? 'verde' : e.estado === 'suspendido' ? 'rojo' : 'ambar';
  return (
    <article className="sa-card">
      <header className="sa-card__cab">
        <span className="sa-card__avatar" aria-hidden="true">{iniciales}</span>
        <div className="sa-card__titulos">
          <h2 className="sa-card__nombre">{e.nombre_empresa}</h2>
          <span className="sa-card__ruc">{e.ruc ? `RUC ${e.ruc}` : 'Sin RUC'}</span>
        </div>
        <span className={`sa-chip sa-chip--${tonoChip}`}>{e.estado ?? 'sin estado'}</span>
      </header>
      <dl className="sa-card__datos">
        <div><dt>Acceso</dt><dd className="sa-mono">{e.slug}.azkell.com</dd></div>
        <div><dt>Base de datos</dt><dd className="sa-mono">{e.db_name}</dd></div>
        <div><dt>Plan</dt><dd>{e.plan || '—'} · {e.max_unidades ?? '—'} unidades</dd></div>
        <div><dt>Administrador</dt><dd>{e.admin_email || '—'}</dd></div>
      </dl>
      <footer className="sa-card__acciones">
        <a className="sa-btn sa-btn--primario" href={`https://${e.slug}.azkell.com`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" /> Entrar
        </a>
        <button type="button" className="sa-btn" onClick={onEditar} aria-label={`Editar ${e.nombre_empresa}`}>
          <Pencil size={15} aria-hidden="true" /> Editar
        </button>
        <button type="button" className={`sa-btn ${activa ? 'sa-btn--peligro' : 'sa-btn--exito'}`} onClick={onCambiarEstado}>
          {activa ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {activa ? 'Suspender' : 'Activar'}
        </button>
      </footer>
    </article>
  );
}

function EmpresaSheet({ abierto, empresa, onClose, onGuardado }: {
  abierto: boolean; empresa: Empresa | null; onClose: () => void; onGuardado: () => void;
}) {
  const toast = useToast();
  const alta = !empresa;
  const [v, setV] = useState({ slug: '', nombre_empresa: '', ruc: '', admin_email: '', admin_password: '', plan: 'Profesional', max_unidades: '100', estado: 'activo' as 'activo' | 'suspendido' | 'demo' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  // Autocompleta la razón social con SUNAT (GET /api/proxy/sunat?doc=RUC, el mismo que usa la versión actual)
  async function consultarRuc() {
    const ruc = v.ruc.trim();
    if (!/^\d{11}$/.test(ruc)) { setError('Ingresa un RUC de 11 números para consultar.'); haptic('warning'); return; }
    setConsultando(true); setError(null);
    try {
      const d = await api<ConsultaDocumento>(`/proxy/sunat?doc=${ruc}`);
      const nombre = (d.razon_social || d.nombre || '').trim();
      if (!nombre) throw new Error('No se encontraron datos de ese RUC.');
      setV(prev => ({ ...prev, nombre_empresa: nombre.toUpperCase() }));
      haptic('success');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setConsultando(false); }
  }

  // Se carga al abrir: alta vacía o los datos de la empresa seleccionada
  const [ultimoAbierto, setUltimoAbierto] = useState<string | null>(null);
  const clave = abierto ? (empresa ? `e${empresa.id}` : 'nueva') : null;
  if (clave !== ultimoAbierto) {
    setUltimoAbierto(clave);
    if (clave) {
      setError(null);
      setV({
        slug: empresa?.slug ?? '',
        nombre_empresa: empresa?.nombre_empresa ?? '',
        ruc: empresa?.ruc ?? '',
        admin_email: empresa?.admin_email ?? '',
        admin_password: '',
        plan: empresa?.plan ?? 'Profesional',
        max_unidades: String(empresa?.max_unidades ?? 100),
        estado: (empresa?.estado as 'activo' | 'suspendido' | 'demo') ?? 'activo',
      });
    }
  }

  async function guardar() {
    const nombre = v.nombre_empresa.trim();
    const ruc = v.ruc.trim();
    const email = v.admin_email.trim();
    if (!nombre) { setError('El nombre de la empresa es obligatorio.'); haptic('warning'); return; }
    if (ruc && !/^\d{11}$/.test(ruc)) { setError('El RUC tiene 11 números.'); haptic('warning'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Indica un correo válido para el administrador.'); haptic('warning'); return; }
    const unidades = Number(v.max_unidades);
    if (!Number.isInteger(unidades) || unidades < 1) { setError('El límite de unidades debe ser un número entero mayor que cero.'); haptic('warning'); return; }

    if (alta) {
      const errSub = validarSubdominio(v.slug.trim().toLowerCase());
      if (errSub) { setError(errSub); haptic('warning'); return; }
      if (v.admin_password.length < 10) { setError('La contraseña del administrador tiene al menos 10 caracteres.'); haptic('warning'); return; }
    }

    setGuardando(true); setError(null);
    try {
      if (alta) {
        const r = await api<{ ok?: boolean; error?: string }>('/superadmin/empresas', {
          method: 'POST',
          body: { slug: v.slug.trim().toLowerCase(), nombre_empresa: nombre, ruc: ruc || null, admin_email: email, admin_password: v.admin_password, plan: v.plan, max_unidades: unidades },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo crear la empresa');
        toast('Empresa creada');
      } else {
        await api(`/superadmin/empresas/${empresa.id}`, {
          method: 'PUT',
          body: { nombre_empresa: nombre, ruc: ruc || null, plan: v.plan, max_unidades: unidades, admin_email: email },
        });
        if (v.estado !== empresa.estado) {
          await api(`/superadmin/empresas/${empresa.id}/estado`, { method: 'PUT', body: { estado: v.estado } });
        }
        toast('Empresa actualizada');
      }
      haptic('success');
      onGuardado();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const txt = (k: 'slug' | 'nombre_empresa' | 'ruc' | 'admin_email' | 'admin_password' | 'max_unidades', label: string, opts?: { wide?: boolean; disabled?: boolean; type?: string; hint?: string }) => (
    <Field label={label} wide={opts?.wide}>
      {p => (
        <TextInput {...p} type={opts?.type ?? 'text'} value={v[k]} disabled={opts?.disabled || guardando}
          onChange={e => setV({ ...v, [k]: k === 'slug' ? e.target.value.toLowerCase() : k === 'ruc' ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value })} />
      )}
    </Field>
  );

  return (
    <Sheet open={abierto} onClose={() => !guardando && onClose()} title={alta ? 'Nueva empresa SaaS' : `Editar ${empresa?.nombre_empresa ?? ''}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>{alta ? 'Crear empresa' : 'Guardar'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        {txt('nombre_empresa', 'Nombre de la empresa', { wide: true })}
        {alta ? txt('slug', 'Subdominio (sin .azkell.com)', { wide: true }) : (
          <Field label="Subdominio" wide>{p => <TextInput {...p} value={v.slug} disabled />}</Field>
        )}
        <Field label="RUC">
          {p => (
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput {...p} value={v.ruc} inputMode="numeric" disabled={guardando}
                onChange={e => setV({ ...v, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
              <Button variant="secondary" onClick={consultarRuc} loading={consultando} disabled={guardando || v.ruc.length !== 11}>Consultar RUC</Button>
            </div>
          )}
        </Field>
        {txt('max_unidades', 'Límite de unidades', { type: 'number' })}
        <Field label="Plan">
          {p => (
            <SelectInput {...p} value={v.plan} disabled={guardando} onChange={e => setV({ ...v, plan: e.target.value })}>
              {PLANES.map(pl => <option key={pl.valor} value={pl.valor}>{pl.etiqueta}</option>)}
            </SelectInput>
          )}
        </Field>
        {!alta && (
          <Field label="Estado">
            {p => (
              <SelectInput {...p} value={v.estado} disabled={guardando} onChange={e => setV({ ...v, estado: e.target.value as 'activo' | 'suspendido' | 'demo' })}>
                {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            )}
          </Field>
        )}
        {txt('admin_email', 'Correo del administrador', { wide: true })}
        {alta && txt('admin_password', 'Contraseña del administrador (mín. 10)', { wide: true, type: 'password' })}
        {alta && <div className="field field--wide"><span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>Se crea la base azkell_tenant_{v.slug || '<subdominio>'} con su estructura y datos iniciales.</span></div>}
      </div>
    </Sheet>
  );
}
