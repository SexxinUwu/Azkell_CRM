import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Empresas SaaS (SuperAdmin): una fila por empresa del registro maestro (azkell_master, tabla empresas).
// Usa GET/POST /api/superadmin/empresas, PUT /api/superadmin/empresas/:id y PUT /api/superadmin/empresas/:id/estado.
// El alta crea la base de la empresa (azkell_tenant_<slug>) en el servidor.
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

const COLUMNAS: ColumnaTabla[] = [
  { id: 'empresa', titulo: 'Empresa', ancho: 260 },
  { id: 'subdominio', titulo: 'Subdominio', ancho: 200 },
  { id: 'base', titulo: 'Base de datos', ancho: 240 },
  { id: 'estado', titulo: 'Estado', ancho: 130 },
  { id: 'plan', titulo: 'Plan', ancho: 150 },
  { id: 'unidades', titulo: 'Unidades máx.', ancho: 140, alinear: 'right' },
  { id: 'acciones', titulo: 'Acciones', ancho: 110, minimo: 100 },
];

const tono = (e: string | null) => (e === 'activo' ? 'var(--green-ink)' : e === 'suspendido' ? 'var(--red-ink)' : 'var(--amber-ink)');

export function SuperadminEmpresasPage() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Empresa | null | 'nueva'>(null);
  const lista = useQuery<Empresa[]>({
    queryKey: ['superadmin', 'empresas'],
    queryFn: () => api<Empresa[]>('/superadmin/empresas'),
    staleTime: 30_000,
  });
  const empresas = useMemo(() => lista.data ?? [], [lista.data]);
  const cuenta = (e: string) => empresas.filter(x => x.estado === e).length;

  return (
    <Page>
      <PageHeader eyebrow="Sistema" title="Empresas SaaS"
        subtitle={lista.isLoading ? 'Cargando…' : `${empresas.length} empresas · ${cuenta('activo')} activas · ${cuenta('suspendido')} suspendidas`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditando('nueva')}>Nueva empresa</Button>} />

      {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : empresas.length === 0 ? (
        <EmptyState icon={<Building2 size={22} />} title="Sin empresas">Agrega la primera empresa del SaaS.</EmptyState>
      ) : (
        <TablaRedimensionable id="superadmin-empresas" columnas={COLUMNAS} ariaLabel="Empresas SaaS" altoMax="70vh">
          {empresas.map(e => (
            <tr key={e.id}>
              <Celda>{e.nombre_empresa}{e.ruc ? <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>RUC {e.ruc}</span> : null}</Celda>
              <Celda mono>{e.slug}.azkell.com</Celda>
              <Celda mono>{e.db_name}</Celda>
              <Celda><span style={{ color: tono(e.estado), fontWeight: 700 }}>{e.estado ?? '—'}</span></Celda>
              <Celda>{e.plan || '—'}</Celda>
              <Celda alinear="right" mono>{e.max_unidades ?? '—'}</Celda>
              <Celda>
                <Button variant="secondary" icon={<Pencil size={14} />} aria-label={`Editar ${e.nombre_empresa}`} onClick={() => setEditando(e)}>{''}</Button>
              </Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}

      <EmpresaSheet
        abierto={editando !== null}
        empresa={editando === 'nueva' || editando === null ? null : editando}
        onClose={() => setEditando(null)}
        onGuardado={() => qc.invalidateQueries({ queryKey: ['superadmin', 'empresas'] })} />
    </Page>
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
        {txt('ruc', 'RUC')}
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
