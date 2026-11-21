import '../mantenimiento/mant.css';
import './cuentas-bancarias.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Landmark, Plus, SearchX, Star, Trash2 } from 'lucide-react';
import { Pencil } from '../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Combobox } from '../../core/ui/Combobox';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { BANCOS_PERU, tieneYapePlin } from '../almacen/bancosPeru';

// Tesorería › Cuentas de proveedores y Cuentas del personal: es la misma pantalla, solo cambia el titular.
// Cada titular puede tener varias cuentas y una principal: la que sale por defecto en vales, OC y cajas.
export type TipoCuentas = 'proveedores' | 'personal';

interface Cuenta { id: number; banco: string; tipo_cuenta: string; moneda: string | null; numero_cuenta: string; cci: string | null; detraccion: number | boolean; principal: number | boolean; estado: number | boolean }
interface Titular { titular: string; nombre: string; doc: string; tipo_doc?: string; origen: string; telefono?: string; email?: string; direccion?: string; estado?: string; estaciones?: string[]; cuentas: Cuenta[] }
type Filtro = 'todos' | 'almacen' | 'estacion' | 'sin';
interface Borrador { id: number | null; banco: string; tipo_cuenta: string; moneda: string; numero_cuenta: string; cci: string; detraccion: boolean; principal: boolean }

const TEXTOS: Record<TipoCuentas, { titulo: string; unidad: string; plural: string; doc: string; buscar: string }> = {
  proveedores: { titulo: 'Cuentas de proveedores', unidad: 'proveedor', plural: 'proveedores', doc: 'RUC', buscar: 'Proveedor o RUC…' },
  personal: { titulo: 'Cuentas del personal', unidad: 'persona', plural: 'personas', doc: 'DNI', buscar: 'Nombre o DNI…' },
};
const TIPOS_BASE = ['CUENTA CORRIENTE', 'CUENTA DE AHORROS', 'CUENTA REMUNERADA'];
const columnasDe = (tipo: TipoCuentas): ColumnaTabla[] => [
  { id: 'titular', titulo: 'Titular', ancho: 300, minimo: 160 },
  { id: 'doc', titulo: 'Documento', ancho: 130, minimo: 100 },
  ...(tipo === 'proveedores' ? [{ id: 'origen', titulo: 'Origen', ancho: 170, minimo: 110 }] : []),
  { id: 'principal', titulo: 'Cuenta principal', ancho: 360, minimo: 180 },
  { id: 'cuentas', titulo: 'Cuentas', ancho: 90, minimo: 70 },
  { id: 'acciones', titulo: '', ancho: 90, minimo: 80 },
];
const esEstacion = (t: Titular) => /estaci/i.test(t.origen);
const esAlmacen = (t: Titular) => /Almac/i.test(t.origen);

const si = (v: unknown) => v === true || v === 1 || v === '1';
const monedaTxt = (m: string | null) => (/D[OÓ]L|USD/i.test(String(m ?? '')) ? 'Dólares' : 'Soles');
const numeroTxt = (c: Cuenta) => c.numero_cuenta || (c.cci ? `CCI ${c.cci}` : '—');
const VACIA: Borrador = { id: null, banco: '', tipo_cuenta: 'CUENTA DE AHORROS', moneda: 'SOLES', numero_cuenta: '', cci: '', detraccion: false, principal: false };

export function CuentasBancariasPage({ tipo }: { tipo: TipoCuentas }) {
  const tx = TEXTOS[tipo];
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState<Borrador | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porQuitar, setPorQuitar] = useState<Cuenta | null>(null);
  const [quitando, setQuitando] = useState(false);

  const puedeCrear = can('tesoreria_caja.crear', 'tesoreria_bancos.crear');
  const puedeEditar = can('tesoreria_caja.editar', 'tesoreria_bancos.editar');
  const puedeEliminar = can('tesoreria_caja.eliminar', 'tesoreria_bancos.eliminar');

  const clave = ['tesoreria', 'cuentas-bancarias', tipo];
  const lista = useQuery({ queryKey: [...clave, q], staleTime: 30_000, queryFn: () => api<{ data?: Titular[] }>(`/tesoreria/cuentas-bancarias/${tipo}`, { query: { q } }).then(r => r.data ?? []) });
  const refrescar = () => qc.invalidateQueries({ queryKey: clave });

  const todos = lista.data ?? [];
  const sinCuenta = todos.filter(t => t.cuentas.length === 0).length;
  const visibles = useMemo(() => todos.filter(t => filtro === 'sin' ? t.cuentas.length === 0 : filtro === 'almacen' ? esAlmacen(t) : filtro === 'estacion' ? esEstacion(t) : true), [todos, filtro]);
  const nAlmacen = todos.filter(esAlmacen).length;
  const nEstacion = todos.filter(esEstacion).length;
  const opcionesFiltro: Array<{ value: Filtro; label: string }> = [
    { value: 'todos', label: 'Todos' },
    ...(tipo === 'proveedores' ? [{ value: 'almacen' as const, label: `Almacén (${nAlmacen})` }, { value: 'estacion' as const, label: `Estaciones (${nEstacion})` }] : []),
    { value: 'sin', label: `Sin cuenta${sinCuenta ? ` (${sinCuenta})` : ''}` },
  ];
  const actual = todos.find(t => t.titular === abierto) ?? null;

  const abrirNueva = () => { setErrorForm(null); setForm({ ...VACIA, principal: (actual?.cuentas.length ?? 0) === 0 }); };
  const abrirEditar = (c: Cuenta) => {
    setErrorForm(null);
    setForm({ id: c.id, banco: c.banco, tipo_cuenta: c.tipo_cuenta, moneda: /D[OÓ]L|USD/i.test(String(c.moneda ?? '')) ? 'DOLARES' : 'SOLES', numero_cuenta: c.numero_cuenta, cci: c.cci ?? '', detraccion: si(c.detraccion), principal: si(c.principal) });
  };

  async function guardar() {
    if (!form || !actual) return;
    if (!form.banco.trim()) { setErrorForm('Elige el banco.'); return; }
    if (!form.numero_cuenta.trim() && !form.cci.trim()) { setErrorForm('Escribe el número de cuenta o la CCI.'); return; }
    if (form.cci.trim() && form.cci.replace(/\D/g, '').length !== 20) { setErrorForm('La CCI debe tener 20 dígitos.'); return; }
    setGuardando(true); setErrorForm(null);
    try {
      const cuerpo = { banco: form.banco.trim(), tipo_cuenta: form.tipo_cuenta, moneda: form.moneda, numero_cuenta: form.numero_cuenta.trim(), cci: form.cci.trim(), detraccion: form.detraccion, principal: form.principal, nombre: actual.nombre };
      if (form.id) await api(`/tesoreria/cuentas-bancarias/${tipo}/cuenta/${form.id}`, { method: 'PUT', body: cuerpo });
      else await api(`/tesoreria/cuentas-bancarias/${tipo}/titular/${encodeURIComponent(actual.titular)}`, { method: 'POST', body: cuerpo });
      haptic('success'); toast(form.id ? 'Cuenta actualizada' : 'Cuenta registrada');
      setForm(null); await refrescar();
    } catch (err) { setErrorForm(errorMessage(err)); haptic('warning'); } finally { setGuardando(false); }
  }

  async function hacerPrincipal(c: Cuenta) {
    try { await api(`/tesoreria/cuentas-bancarias/${tipo}/cuenta/${c.id}/principal`, { method: 'POST' }); haptic('success'); toast('Cuenta principal actualizada'); await refrescar(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
  }

  async function quitar() {
    if (!porQuitar) return;
    setQuitando(true);
    try { await api(`/tesoreria/cuentas-bancarias/${tipo}/cuenta/${porQuitar.id}`, { method: 'DELETE' }); haptic('success'); toast('Cuenta dada de baja'); setPorQuitar(null); await refrescar(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); } finally { setQuitando(false); }
  }

  const tiposDe = (banco: string) => (tieneYapePlin(banco) ? [...TIPOS_BASE, 'YAPE', 'PLIN'] : TIPOS_BASE);

  return (
    <Page>
      <PageHeader eyebrow="Tesorería" title={tx.titulo}
        subtitle={lista.isLoading ? 'Cargando…' : `${todos.length} ${tx.plural}${sinCuenta ? ` · ${sinCuenta} sin cuenta` : ''}`} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="cb-filtros">
          <SearchField value={busqueda} placeholder={tx.buscar}
            onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _cbT?: number })._cbT); (window as unknown as { _cbT?: number })._cbT = window.setTimeout(() => setQ(v.trim()), 350); }} />
          <SegmentedControl label="Mostrar" value={filtro} onChange={setFiltro} options={opcionesFiltro} />
        </div>

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={q || filtro !== 'todos' ? <SearchX size={22} /> : <Landmark size={22} />} title={q || filtro !== 'todos' ? 'Sin coincidencias' : `Sin ${tx.plural}`}>
            {filtro === 'sin' ? `Todos los ${tx.plural} tienen una cuenta.` : filtro !== 'todos' ? 'No hay registros con ese filtro.' : q ? 'Prueba con otro texto.' : tipo === 'proveedores' ? 'Los proveedores de Almacén y las estaciones de servicio aparecen aquí para cargar sus cuentas.' : 'Aquí aparecen los conductores y el personal para cargar sus cuentas.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id={`cuentas-bancarias-${tipo}`} columnas={columnasDe(tipo)} ariaLabel={tx.titulo} altoMax="70vh">
            {visibles.map(t => {
              const principal = t.cuentas.find(c => si(c.principal)) ?? t.cuentas[0];
              return (
                <tr key={t.titular} onClick={() => setAbierto(t.titular)} style={{ cursor: 'pointer' }}>
                  <Celda>{t.nombre}{tipo === 'personal' && <span className="cb-origen"> · {t.origen}</span>}</Celda>
                  <Celda mono>{t.doc || '—'}</Celda>
                  {tipo === 'proveedores' && <Celda><Badge tone={esEstacion(t) && !esAlmacen(t) ? 'amber' : esEstacion(t) ? 'green' : 'gray'}>{t.origen}</Badge></Celda>}
                  <Celda>{principal ? <span className="cb-principal"><b>{principal.banco}</b> · {monedaTxt(principal.moneda)} · <span className="cb-num">{numeroTxt(principal)}</span></span> : <Badge tone="amber">Sin cuenta</Badge>}</Celda>
                  <Celda>{t.cuentas.length || '—'}</Celda>
                  <Celda><Button variant="secondary" aria-label={`Cuentas de ${t.nombre}`} onClick={e => { e.stopPropagation(); setAbierto(t.titular); }}>Cuentas</Button></Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}
      </div>

      <Sheet open={!!actual} onClose={() => { if (!guardando) { setAbierto(null); setForm(null); } }} title={form ? (form.id ? 'Editar cuenta' : 'Nueva cuenta') : (actual?.nombre ?? '')}
        footer={form
          ? <><Button variant="secondary" onClick={() => setForm(null)} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>Guardar cuenta</Button></>
          : <><Button variant="secondary" onClick={() => setAbierto(null)}>Cerrar</Button>{puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNueva}>Agregar cuenta</Button>}</>}>
        {actual && !form && (
          <div className="cb-lista">
            <dl className="cb-datos">
              <div><dt>{actual.tipo_doc || tx.doc}</dt><dd>{actual.doc || '—'}</dd></div>
              {tipo === 'proveedores' && <div><dt>Origen</dt><dd>{actual.origen}</dd></div>}
              {actual.telefono ? <div><dt>Teléfono</dt><dd>{actual.telefono}</dd></div> : null}
              {actual.email ? <div><dt>Correo</dt><dd>{actual.email}</dd></div> : null}
              {actual.direccion ? <div className="cb-datos__ancho"><dt>Dirección</dt><dd>{actual.direccion}</dd></div> : null}
              {actual.estaciones && actual.estaciones.length > 0 && (
                <div className="cb-datos__ancho"><dt>Estaciones / sedes</dt><dd className="cb-sedes">{actual.estaciones.map(s => <span key={s}>{s}</span>)}</dd></div>
              )}
            </dl>
            {actual.cuentas.length > 1 && <p className="cb-sub">La estrella marca la cuenta que sale por defecto.</p>}
            {actual.cuentas.length === 0 && (
              <Notice tone="accent" icon={<CircleAlert size={16} />}>Este {tx.unidad} no tiene cuentas. Agrega una y quedará como principal: es la que saldrá por defecto en los vales, las órdenes de compra y las cajas.</Notice>
            )}
            {actual.cuentas.map(c => (
              <div key={c.id} className={`cb-cuenta${si(c.principal) ? ' cb-cuenta--principal' : ''}`}>
                <div className="cb-cuenta__datos">
                  <div className="cb-cuenta__banco">{c.banco} {si(c.principal) && <Badge tone="green">Principal</Badge>}{si(c.detraccion) && <Badge tone="amber">Detracción</Badge>}</div>
                  <div className="cb-cuenta__tipo">{c.tipo_cuenta} · {monedaTxt(c.moneda)}</div>
                  <div className="cb-num">{c.numero_cuenta || '—'}</div>
                  {c.cci && <div className="cb-num cb-cci">CCI {c.cci}</div>}
                </div>
                <div className="cb-cuenta__acciones">
                  {!si(c.principal) && puedeEditar && <Button variant="secondary" icon={<Star size={15} />} aria-label="Hacer principal" onClick={() => hacerPrincipal(c)}>{''}</Button>}
                  {puedeEditar && <Button variant="secondary" icon={<Pencil size={15} />} aria-label="Editar cuenta" onClick={() => abrirEditar(c)}>{''}</Button>}
                  {puedeEliminar && <Button variant="secondary" icon={<Trash2 size={15} />} aria-label="Dar de baja la cuenta" onClick={() => setPorQuitar(c)}>{''}</Button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {actual && form && (
          <div className="form-grid">
            {errorForm && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{errorForm}</Notice></div>}
            <Field label="Banco *" wide>
              {p => <Combobox {...p} options={BANCOS_PERU.map(b => ({ value: b, label: b }))} value={form.banco || null} placeholder="Busca o escribe el banco" createLabel="Usar este banco" limit={60}
                onChange={v => setForm({ ...form, banco: v ?? '', tipo_cuenta: tiposDe(v ?? '').includes(form.tipo_cuenta) ? form.tipo_cuenta : 'CUENTA DE AHORROS' })} onCreate={v => setForm({ ...form, banco: v.trim() })} />}
            </Field>
            <Field label="Tipo de cuenta">
              {p => <SelectInput {...p} value={form.tipo_cuenta} onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })}>{tiposDe(form.banco).map(t => <option key={t} value={t}>{t}</option>)}</SelectInput>}
            </Field>
            <Field label="Moneda">
              {p => <SelectInput {...p} value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })}><option value="SOLES">Soles</option><option value="DOLARES">Dólares</option></SelectInput>}
            </Field>
            <Field label="N.º de cuenta" wide hint="Como lo muestra el banco, con o sin guiones">
              {p => <TextInput {...p} inputMode="numeric" autoComplete="off" value={form.numero_cuenta} placeholder="Ej. 191-23948293-0-12" onChange={e => setForm({ ...form, numero_cuenta: e.target.value.replace(/[^\d-]/g, '') })} />}
            </Field>
            <Field label="CCI" wide hint="20 dígitos (opcional si ya escribiste el número de cuenta)">
              {p => <TextInput {...p} inputMode="numeric" autoComplete="off" maxLength={20} value={form.cci} onChange={e => setForm({ ...form, cci: e.target.value.replace(/\D/g, '') })} />}
            </Field>
            <div className="field field--wide cb-checks">
              <label className="cb-check"><input type="checkbox" checked={form.principal} onChange={e => setForm({ ...form, principal: e.target.checked })} /> Usar como cuenta principal</label>
              {tipo === 'proveedores' && <label className="cb-check"><input type="checkbox" checked={form.detraccion} onChange={e => setForm({ ...form, detraccion: e.target.checked })} /> Es la cuenta de detracciones</label>}
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!porQuitar} onClose={() => !quitando && setPorQuitar(null)} loading={quitando} onConfirm={quitar}
        title="¿Dar de baja esta cuenta?" message="Deja de salir en las listas. Los pagos ya hechos no cambian. Si era la principal, pasa la siguiente cuenta." confirmLabel="Dar de baja" />
    </Page>
  );
}

export const CuentasProveedoresPage = () => <CuentasBancariasPage tipo="proveedores" />;
export const CuentasPersonalPage = () => <CuentasBancariasPage tipo="personal" />;
