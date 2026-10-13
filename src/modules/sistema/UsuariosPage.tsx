import { useMemo, useState } from 'react';
import { ArrowUpRight, SearchX, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface Usuario {
  id?: string | number;
  correo?: string;
  email?: string;
  nombre?: string;
  nombre_completo?: string;
  rol?: string;
  empresa?: string;
  empresa_tenants?: string;
  activo?: boolean | number | string;
  ultimo_acceso?: string;
  creado_en?: string;
  [key: string]: unknown;
}

function rolColor(rol: string): string {
  const r = (rol ?? '').toLowerCase();
  if (r === 'admin' || r.includes('admin')) return 'accent';
  if (r.includes('gerencia') || r.includes('gerente')) return 'blue';
  if (r.includes('tecnico') || r.includes('taller')) return 'amber';
  return 'neutral';
}

function useUsuarios() {
  return useQuery<Usuario[]>({
    queryKey: ['sistema', 'usuarios'],
    queryFn: () =>
      api('/script/obtenerDatosUsuarios', { method: 'POST', body: { args: [] } }).then((r: unknown) => {
        if (Array.isArray(r)) return r as Usuario[];
        const obj = r as { data?: Usuario[]; usuarios?: Usuario[] };
        return obj.data ?? obj.usuarios ?? [];
      }),
    staleTime: 120_000,
  });
}

export function UsuariosPage() {
  const { data, isLoading, isError, error } = useUsuarios();
  const [busqueda, setBusqueda] = useState('');

  const lista = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(u =>
      String(u.correo ?? u.email ?? '').toUpperCase().includes(q) ||
      String(u.nombre ?? u.nombre_completo ?? '').toUpperCase().includes(q) ||
      String(u.rol ?? '').toUpperCase().includes(q) ||
      String(u.empresa ?? u.empresa_tenants ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  const admins = lista.filter(u => (u.rol ?? '').toLowerCase().includes('admin')).length;
  const activos = lista.filter(u => u.activo === true || u.activo === 1 || u.activo === '1').length;

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Usuarios y roles"
        subtitle={lista.length > 0 ? `${lista.length} usuarios · ${admins} admins` : undefined}
        actions={
          <MenuOtros opciones={[
            { label: 'Gestionar en versión actual', icon: <UserCog size={17} />, onSelect: () => abrirClasico('sistema/usuarios') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/usuarios') },
          ]} />
        }
      />

      {isError && (
        <Notice tone="error">{errorMessage(error)}</Notice>
      )}

      {isLoading ? <PageLoader /> : lista.length === 0 ? (
        <EmptyState icon={<Users size={28} />} title="Sin usuarios">
          Gestiona usuarios y permisos desde la versión actual.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* KPIs rápidos */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {[
              { label: 'Total usuarios', valor: lista.length, icon: <Users size={16} /> },
              { label: 'Activos', valor: activos || lista.length, icon: <ShieldCheck size={16} /> },
              { label: 'Admins', valor: admins, icon: <UserCog size={16} /> },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ color: 'var(--accent)' }}>{k.icon}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}>{k.valor}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por correo, nombre, rol o empresa…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar</button>
            </EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visibles.map((u, i) => {
                const correo = u.correo ?? u.email ?? '—';
                const nombre = u.nombre ?? u.nombre_completo ?? correo;
                const rol    = u.rol ?? 'Usuario';
                const empresa = u.empresa ?? u.empresa_tenants ?? '';
                const color  = rolColor(rol);
                return (
                  <div key={String(u.id ?? i)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--fill-1)', border: '1px solid var(--separator)',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: `var(--${color}-tint)`, color: `var(--${color}-ink)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.9rem',
                    }}>
                      {String(nombre)[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {correo}{empresa ? ` · ${empresa}` : ''}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                      background: `var(--${color}-tint)`, color: `var(--${color}-ink)`,
                      border: `1px solid var(--${color}-ink)`, whiteSpace: 'nowrap',
                    }}>
                      {rol}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
