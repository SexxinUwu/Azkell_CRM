import '../mantenimiento/mant.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, MapPin, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';

// Proveedor de combustible y las estaciones (sedes) donde carga. Las estaciones se guardan como texto separado por comas.
interface Estacion { id: number; proveedor_razon_social: string; proveedor_ruc: string | null; estaciones_nombres: string | null }
interface Respuesta { ok?: boolean; data: Estacion[]; total: number; totalPages: number }
interface Borrador { id: number | null; razon: string; ruc: string; estaciones: string }

const VACIO: Borrador = { id: null, razon: '', ruc: '', estaciones: '' };
const listaEstaciones = (texto: string | null) => String(texto ?? '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

const COLUMNAS: ColumnaTabla[] = [
  { id: 'proveedor', titulo: 'Proveedor (razón social)', ancho: 300, minimo: 160 },
  { id: 'ruc', titulo: 'RUC', ancho: 130 },
  { id: 'estaciones', titulo: 'Estaciones / sedes', ancho: 460, minimo: 180 },
  { id: 'acciones', titulo: 'Acciones', ancho: 130, minimo: 110 },
];

// Operaciones › Estaciones de proveedores (las estaciones donde se cargan los vales de combustible)
export function EstacionesProveedoresPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [errores, setErrores] = useState<{ razon?: string; ruc?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Estacion | null>(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => { setPagina(1); }, [q]);

  const lista = useQuery<Respuesta>({
    queryKey: ['operaciones', 'estaciones', q, pagina],
    queryFn: () => api<Respuesta>(`/combustible/estaciones-proveedores?q=${encodeURIComponent(q)}&page=${pagina}&limit=50`),
    placeholderData: prev => prev,
    staleTime: 20_000,
  });
  const puedeEditar = can('combustible_vales.editar', 'combustible_vales.crear', 'combustible.editar', 'combustible.crear');
  const puedeEliminar = can('combustible_vales.eliminar', 'combustible.eliminar');
  const datos = lista.data?.data ?? [];
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones', 'estaciones'] });

  function abrirNuevo() { setErrores({}); setBorrador({ ...VACIO }); }
  function abrirEditar(e: Estacion) {
    setErrores({});
    setBorrador({ id: e.id, razon: e.proveedor_razon_social, ruc: e.proveedor_ruc ?? '', estaciones: e.estaciones_nombres ?? '' });
  }

  async function guardar() {
    if (!borrador) return;
    const e: { razon?: string; ruc?: string } = {};
    if (!borrador.razon.trim()) e.razon = 'Escribe la razón social del proveedor.';
    if (borrador.ruc.trim() && !/^\d{11}$/.test(borrador.ruc.trim())) e.ruc = 'El RUC tiene 11 dígitos.';
    setErrores(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setGuardando(true);
    const cuerpo = { proveedor_razon_social: borrador.razon.trim(), proveedor_ruc: borrador.ruc.trim(), estaciones_nombres: listaEstaciones(borrador.estaciones).join(', ') };
    try {
      const r = borrador.id
        ? await api<{ ok?: boolean; error?: string }>(`/combustible/estaciones-proveedores/${borrador.id}`, { method: 'PUT', body: cuerpo })
        : await api<{ ok?: boolean; error?: string }>('/combustible/estaciones-proveedores', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(borrador.id ? 'Proveedor actualizado' : 'Proveedor registrado');
      setBorrador(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/combustible/estaciones-proveedores/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast(`${porEliminar.proveedor_razon_social} eliminado`);
      setPorEliminar(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Estaciones-proveedores', 'Estaciones', ['Proveedor', 'RUC', 'Estaciones'],
        datos.map(x => [x.proveedor_razon_social, x.proveedor_ruc ?? '', listaEstaciones(x.estaciones_nombres).join(', ')]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Estaciones de proveedores"
        subtitle={lista.isLoading ? 'Cargando…' : `${lista.data?.total ?? 0} proveedores de combustible`}
        actions={
          <>
            <MenuOtros opciones={[{ label: 'Exportar Excel', detalle: `${datos.length} de esta página`, icon: <FileSpreadsheet size={17} />, onSelect: exportar }]} />
            {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNuevo}>Nuevo proveedor</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={busqueda} placeholder="Proveedor, RUC o estación…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _esT?: number })._esT); (window as unknown as { _esT?: number })._esT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : datos.length === 0 ? (
          <EmptyState icon={q ? <SearchX size={22} /> : <MapPin size={22} />} title={q ? 'Sin coincidencias' : 'Sin proveedores'}>
            {q ? 'Prueba con otro texto.' : 'Registra los proveedores y las estaciones donde cargan los vales.'}
          </EmptyState>
        ) : (
          <>
            <TablaRedimensionable id="estaciones-proveedores" columnas={COLUMNAS} ariaLabel="Estaciones de proveedores" altoMax="70vh">
              {datos.map(x => (
                <tr key={x.id}>
                  <Celda>{x.proveedor_razon_social}</Celda>
                  <Celda mono>{x.proveedor_ruc || '—'}</Celda>
                  <Celda>
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                      {listaEstaciones(x.estaciones_nombres).map(est => (
                        <span key={est} style={{ padding: '1px 8px', borderRadius: 999, background: 'var(--fill)', color: 'var(--label-2)', fontSize: '0.75rem', fontWeight: 600 }}>{est}</span>
                      ))}
                      {listaEstaciones(x.estaciones_nombres).length === 0 && '—'}
                    </span>
                  </Celda>
                  <Celda>
                    <span style={{ display: 'inline-flex', gap: 'var(--s-1)' }}>
                      {puedeEditar && <Button variant="secondary" icon={<Pencil size={15} />} aria-label={`Editar ${x.proveedor_razon_social}`} onClick={() => abrirEditar(x)}>{''}</Button>}
                      {puedeEliminar && <Button variant="secondary" icon={<Trash2 size={15} />} aria-label={`Eliminar ${x.proveedor_razon_social}`} onClick={() => setPorEliminar(x)}>{''}</Button>}
                    </span>
                  </Celda>
                </tr>
              ))}
            </TablaRedimensionable>
            {(lista.data?.totalPages ?? 1) > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--s-3)' }}>
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <span className="t-footnote c-secondary">Página {pagina} de {lista.data?.totalPages}</span>
                <Button variant="secondary" disabled={pagina >= (lista.data?.totalPages ?? 1)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!borrador} onClose={() => !guardando && setBorrador(null)} title={borrador?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        footer={<><Button variant="secondary" onClick={() => setBorrador(null)} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
        {borrador && (
          <div className="form-grid">
            <Field label="Razón social del proveedor" wide error={errores.razon}>
              {p => <TextInput {...p} value={borrador.razon} onChange={e => setBorrador({ ...borrador, razon: e.target.value.toUpperCase() })} autoFocus />}
            </Field>
            <Field label="RUC" error={errores.ruc} hint="11 dígitos (opcional)">
              {p => <TextInput {...p} inputMode="numeric" value={borrador.ruc} onChange={e => setBorrador({ ...borrador, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })} />}
            </Field>
            <Field label="Estaciones / sedes" wide hint="Separa cada estación con una coma">
              {p => <TextInput {...p} value={borrador.estaciones} onChange={e => setBorrador({ ...borrador, estaciones: e.target.value })} />}
            </Field>
            {Object.keys(errores).length > 0 && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>Revisa los campos marcados.</Notice></div>}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} loading={eliminando} onConfirm={eliminar}
        title={`¿Eliminar a ${porEliminar?.proveedor_razon_social ?? ''}?`} message="Se quita de la lista de proveedores. Los vales ya registrados no cambian." confirmLabel="Eliminar" />
    </Page>
  );
}
