import '../mantenimiento/mant.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleAlert, FileSpreadsheet, Fuel, ListChecks, Pencil, Plus, RefreshCw, SearchX, Trash2, Upload } from 'lucide-react';
import { ImportarValesSheet } from './ImportarValesSheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';

interface Vale {
  id: number; fecha: string | null; estado: string; correlativo: string | null; estado_pago: string | null; viaje: string | null;
  vehiculo: string | null; conductor: string | null; ruta: string | null; estacion: string | null; tipo_combustible: string | null;
  proveedor: string | null; ruc: string | null; kilometraje: number | null; galones: number | string | null; costo_gl: number | string | null;
  tipo_pago: string | null; dias_credito: number | null; moneda: string | null; importe: number | string | null;
  numero_comprobante: string | null; observacion: string | null; tipo: string | null; clase_vehiculo: string | null; archivo_url: string | null;
}
interface Respuesta { ok: boolean; data: Vale[]; total: number; totalPages: number; kpis: { totalVales: number; totalGalones: number; totalGasto: number; costoPromedioGalon: number } }
interface Catalogos { placas: string[]; conductores: string[]; combustibles: string[]; proveedores: { proveedor_razon_social: string; proveedor_ruc: string | null; estaciones_nombres: string | null }[]; siguienteCorrelativo: string }

const n = (v: unknown) => Number(v) || 0;
// Solo la empresa Marsisa tiene base externa; el servidor rechaza la sincronización en las demás (mismo criterio que la navegación)
const esMarsisa = typeof window !== 'undefined' && window.location.hostname.split('.')[0].toLowerCase().includes('marsisa');
const money = (v: unknown) => n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const ESTADOS = ['VÁLIDO', 'ANULADO'];
const PAGOS = ['NO PAGADO', 'PAGADO'];
const TIPOS_PAGO = ['ANTICIPO', 'CONTADO', 'CREDITO'];

// Operaciones › Vales de combustible. `marsisa` fija la tabla propia de Marsisa (?modulo=marsisa).
export function ValesCombustible({ marsisa = false }: { marsisa?: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const modulo = marsisa ? 'marsisa' : 'operaciones';
  const [busqueda, setBusqueda] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [combustible, setCombustible] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<Vale | null>(null);
  const [formulario, setFormulario] = useState<{ vale: Vale | null } | null>(null);
  const [porAnular, setPorAnular] = useState<Vale | null>(null);
  const [importando, setImportando] = useState(false);
  const [sincronizar, setSincronizar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [borrandoMasivo, setBorrandoMasivo] = useState(false);
  const [confirmarMasivo, setConfirmarMasivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { setPagina(1); }, [search, estado, combustible, desde, hasta]);

  const q = useQuery<Respuesta>({
    queryKey: ['operaciones', 'vales', modulo, search, estado, combustible, desde, hasta, pagina],
    queryFn: () => {
      const p = new URLSearchParams({ modulo, page: String(pagina), limit: '50' });
      if (search) p.set('search', search);
      if (estado) p.set('estado', estado);
      if (combustible) p.set('combustible', combustible);
      if (desde) p.set('fecha_desde', desde);
      if (hasta) p.set('fecha_hasta', hasta);
      return api<Respuesta>(`/combustible/vales?${p}`);
    },
    placeholderData: prev => prev,
    staleTime: 20_000,
  });
  const cat = useQuery<Catalogos>({
    queryKey: ['operaciones', 'vales-catalogos', modulo],
    queryFn: () => api<Catalogos>(`/combustible/catalogos?modulo=${modulo}`),
    staleTime: 5 * 60_000,
  });

  const lista = q.data?.data ?? [];
  const k = q.data?.kpis;
  const puedeCrear = can('combustible_vales.crear', 'combustible.crear');
  const puedeEditar = can('combustible_vales.editar', 'combustible_vales.crear', 'combustible.editar');
  const puedeEliminar = can('combustible_vales.eliminar', 'combustible.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones'] });

  async function anular() {
    if (!porAnular) return;
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/combustible/vales/${porAnular.id}?modulo=${modulo}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo anular');
      haptic('success'); toast('Vale anulado'); setPorAnular(null); setAbierto(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    try {
      await exportarExcel(marsisa ? 'Vales-combustible-Marsisa' : 'Vales-combustible', 'Vales',
        ['Fecha', 'Correlativo', 'Estado', 'Pago', 'Viaje', 'Vehículo', 'Conductor', 'Ruta', 'Estación', 'Combustible', 'Proveedor', 'Km', 'Galones', 'Costo/gl', 'Importe', 'Moneda', 'Comprobante'],
        lista.map(v => [dia(v.fecha), v.correlativo, v.estado, v.estado_pago, v.viaje, v.vehiculo, v.conductor, v.ruta, v.estacion, v.tipo_combustible, v.proveedor,
          v.kilometraje, n(v.galones), n(v.costo_gl), n(v.importe), v.moneda, v.numero_comprobante]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow={marsisa ? 'Operaciones · Marsisa' : 'Operaciones'}
        title={marsisa ? 'Vales de combustible Marsisa' : 'Vales de combustible'}
        subtitle={q.isLoading ? 'Cargando…' : `${k?.totalVales ?? 0} vales`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${lista.length} de esta página`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Importar desde Excel', icon: <Upload size={17} />, separado: true, onSelect: () => setImportando(true) },
              ...(esMarsisa ? [{ label: 'Sincronizar con MarsisaSoft', icon: <RefreshCw size={17} />, onSelect: () => setSincronizar(true) }] : []),
              ...(puedeEliminar ? [{ label: seleccionando ? 'Terminar selección' : 'Seleccionar varios', icon: <ListChecks size={17} />, separado: true, onSelect: () => { setSeleccionando(v => !v); setSeleccion(new Set()); } }] : []),
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ vale: null })}>Nuevo vale</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num">{n(k?.totalGalones).toLocaleString('es-PE', { maximumFractionDigits: 1 })}</span><span className="inv-metrica__label">Galones</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>S/ {money(k?.totalGasto)}</span><span className="inv-metrica__label">Gasto</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>S/ {money(k?.costoPromedioGalon)}</span><span className="inv-metrica__label">Costo por galón</span></div>
        </div>

        <SearchField value={busqueda} placeholder="Correlativo, placa, viaje, conductor, proveedor o estación…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _vT?: number })._vT); (window as unknown as { _vT?: number })._vT = window.setTimeout(() => setSearch(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
            <option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
          <SelectInput value={combustible} onChange={e => setCombustible(e.target.value)} aria-label="Combustible" style={{ width: 'auto' }}>
            <option value="">Todo combustible</option>{(cat.data?.combustibles ?? []).map(c => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : lista.length === 0 ? (
          <EmptyState icon={search || estado || desde || hasta ? <SearchX size={22} /> : <Fuel size={22} />} title={search || estado || desde || hasta ? 'Sin coincidencias' : 'Sin vales'}>
            {puedeCrear && !search && !estado ? <>Registra el primero con <strong>Nuevo vale</strong>.</> : 'Prueba con otros filtros.'}
          </EmptyState>
        ) : (
          <>
            <div className="tarjeta__lista">
              {lista.map(v => {
                const anulado = v.estado === 'ANULADO';
                const marcado = seleccion.has(Number(v.id));
                return (
                  <button key={v.id} type="button" className="mov-fila" style={{ opacity: anulado ? 0.6 : 1, outline: marcado ? '2px solid var(--accent)' : undefined }}
                    onClick={() => {
                      haptic('selection');
                      if (!seleccionando) { setAbierto(v); return; }
                      setSeleccion(prev => { const nx = new Set(prev); nx.has(Number(v.id)) ? nx.delete(Number(v.id)) : nx.add(Number(v.id)); return nx; });
                    }}>
                    {seleccionando && <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid var(--accent)', background: marcado ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />}
                    <div className="mov-fila__icon" style={{ background: anulado ? 'var(--gray-tint)' : 'var(--accent-tint)', color: anulado ? 'var(--gray-ink)' : 'var(--accent-ink)' }}><Fuel size={16} /></div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{v.vehiculo || 'Sin placa'} · {n(v.galones).toLocaleString('es-PE', { maximumFractionDigits: 2 })} gl {v.tipo_combustible ?? ''}</span>
                      <span className="mov-fila__sub">{[v.correlativo, dia(v.fecha), v.conductor, v.estacion || v.proveedor].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className="mov-fila__monto">{v.moneda === 'DOLARES' ? 'US$' : 'S/'} {money(v.importe)}</span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: anulado ? 'var(--gray-ink)' : v.estado_pago === 'PAGADO' ? 'var(--green-ink)' : 'var(--amber-ink)' }}>{anulado ? 'ANULADO' : v.estado_pago}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {(q.data?.totalPages ?? 1) > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--s-3)' }}>
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <span className="t-footnote c-secondary">Página {pagina} de {q.data?.totalPages}</span>
                <Button variant="secondary" disabled={pagina >= (q.data?.totalPages ?? 1)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbierto(null)} title={abierto ? `Vale ${abierto.correlativo || abierto.id}` : ''}
        footer={
          <>
            {puedeEditar && abierto && abierto.estado !== 'ANULADO' && <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setPorAnular(abierto)}>Anular</Button>}
            {puedeEditar && abierto && <Button variant="primary" icon={<Pencil size={16} />} onClick={() => { setFormulario({ vale: abierto }); setAbierto(null); }}>Editar</Button>}
            {!puedeEditar && <Button variant="secondary" onClick={() => setAbierto(null)}>Cerrar</Button>}
          </>
        }>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{n(abierto.galones).toLocaleString('es-PE')}</span><span className="inv-metrica__label">Galones</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{money(abierto.costo_gl)}</span><span className="inv-metrica__label">Costo/gl</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{money(abierto.importe)}</span><span className="inv-metrica__label">Importe {abierto.moneda === 'DOLARES' ? 'US$' : 'S/'}</span></div>
            </div>
            <div className="tarjeta__lista">
              {fila('Estado', abierto.estado)}{fila('Pago', [abierto.estado_pago, abierto.tipo_pago, abierto.dias_credito ? `${abierto.dias_credito} días` : ''].filter(Boolean).join(' · '))}
              {fila('Fecha', dia(abierto.fecha), true)}{fila('Viaje', abierto.viaje, true)}{fila('Vehículo', abierto.vehiculo, true)}{fila('Conductor', abierto.conductor)}{fila('Ruta', abierto.ruta)}
              {fila('Estación', abierto.estacion)}{fila('Proveedor', [abierto.proveedor, abierto.ruc].filter(Boolean).join(' · '))}{fila('Combustible', abierto.tipo_combustible)}
              {fila('Kilometraje', abierto.kilometraje ? abierto.kilometraje.toLocaleString('es-PE') : '', true)}{fila('Comprobante', abierto.numero_comprobante, true)}{fila('Observación', abierto.observacion)}
            </div>
            {abierto.archivo_url && <a className="btn btn--secondary btn--sm" href={abierto.archivo_url} target="_blank" rel="noreferrer">Ver comprobante</a>}
          </div>
        )}
      </Sheet>

      <FormularioVale open={!!formulario} vale={formulario?.vale ?? null} cat={cat.data} modulo={modulo} onClose={() => setFormulario(null)} onGuardado={refrescar} />

      <ImportarValesSheet open={importando} onClose={() => setImportando(false)} marsisa={marsisa} />
      {seleccionando && seleccion.size > 0 && (
        <div style={{ position: 'sticky', bottom: 'var(--s-3)', display: 'flex', justifyContent: 'center', marginTop: 'var(--s-3)' }}>
          <Button variant="primary" icon={<Trash2 size={16} />} onClick={() => setConfirmarMasivo(true)}>Eliminar {seleccion.size} vales</Button>
        </div>
      )}
      <ConfirmSheet open={confirmarMasivo} onClose={() => !borrandoMasivo && setConfirmarMasivo(false)} loading={borrandoMasivo}
        title={`¿Eliminar ${seleccion.size} vales?`} message="Se borran definitivamente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar definitivamente"
        onConfirm={async () => {
          setBorrandoMasivo(true);
          try {
            const r = await api<{ ok?: boolean; mensaje?: string; error?: string }>('/combustible/vales/eliminar-masivo?hard=true', { method: 'POST', body: { ids: [...seleccion] } });
            if (r.ok === false) throw new Error(r.error || 'No se pudieron eliminar los vales');
            haptic('success'); toast(r.mensaje ?? 'Vales eliminados');
            setConfirmarMasivo(false); setSeleccion(new Set()); setSeleccionando(false);
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setBorrandoMasivo(false); }
        }} />
      <ConfirmSheet open={sincronizar} onClose={() => !sincronizando && setSincronizar(false)} loading={sincronizando}
        title="¿Sincronizar vales con MarsisaSoft?" message="Trae los vales nuevos desde la base externa. Los que ya existen no se duplican."
        confirmLabel="Sincronizar"
        onConfirm={async () => {
          setSincronizando(true);
          try {
            const r = await api<{ mensaje?: string }>('/combustible/sincronizar-remoto', { method: 'POST' });
            haptic('success'); toast(r.mensaje ?? 'Sincronización completada');
            setSincronizar(false);
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setSincronizando(false); }
        }} />
      <ConfirmSheet open={!!porAnular} onClose={() => !ocupado && setPorAnular(null)} onConfirm={anular} loading={ocupado}
        title="¿Anular este vale?" message="Queda marcado como ANULADO y deja de contar en los totales." confirmLabel="Anular" />
    </Page>
  );
}

function FormularioVale({ open, vale, cat, modulo, onClose, onGuardado }: {
  open: boolean; vale: Vale | null; cat?: Catalogos; modulo: string; onClose: () => void; onGuardado: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = !!vale;

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const base: Record<string, string> = {
      fecha: d.toISOString().slice(0, 16), estado: 'VÁLIDO', correlativo: cat?.siguienteCorrelativo ?? '', estado_pago: 'NO PAGADO', viaje: '', vehiculo: '',
      conductor: '', ruta: '', estacion: '', tipo_combustible: 'D2', proveedor: '', ruc: '', kilometraje: '', galones: '', costo_gl: '', importe: '',
      tipo_pago: 'ANTICIPO', dias_credito: '0', moneda: 'SOLES', numero_comprobante: '', observacion: '', tipo: 'RECARGA VUELTA', clase_vehiculo: 'TRACTO',
    };
    if (vale) for (const k of Object.keys(base)) { const x = (vale as unknown as Record<string, unknown>)[k]; if (x != null) base[k] = k === 'fecha' ? String(x).replace(' ', 'T').slice(0, 16) : String(x); }
    setV(base);
  }, [open, vale, cat]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  // Importe = galones × costo por galón (se recalcula al cambiar cualquiera de los dos)
  function cambiarCalculo(k: 'galones' | 'costo_gl', val: string) {
    setV(a => {
      const x = { ...a, [k]: val };
      const g = parseFloat(x.galones.replace(',', '.')), c = parseFloat(x.costo_gl.replace(',', '.'));
      if (Number.isFinite(g) && Number.isFinite(c)) x.importe = (g * c).toFixed(2);
      return x;
    });
  }

  async function guardar() {
    if (!v.vehiculo.trim()) { setError('La placa del vehículo es obligatoria.'); return; }
    if (!(parseFloat(v.galones) > 0)) { setError('Indica los galones.'); return; }
    setEnviando(true); setError(null);
    try {
      const body = { ...v, vehiculo: v.vehiculo.toUpperCase().trim(), fecha: v.fecha.replace('T', ' ') + ':00', modulo };
      const r = vale
        ? await api<{ ok?: boolean; error?: string }>(`/combustible/vales/${vale.id}?modulo=${modulo}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string }>('/combustible/vales', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Vale actualizado' : 'Vale registrado');
      await onGuardado(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'decimal' | 'numeric'; list?: string; calc?: boolean }) => (
    <Field label={label} wide={o?.wide}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} value={v[k] ?? ''}
        onChange={e => (o?.calc ? cambiarCalculo(k as 'galones' | 'costo_gl', e.target.value) : set(k, e.target.value))} />}
    </Field>
  );
  const sel = (k: string, label: string, ops: string[]) => (
    <Field label={label}>
      {p => <SelectInput {...p} value={v[k] ?? ''} onChange={e => set(k, e.target.value)}>{[...new Set([...ops, ...(v[k] ? [v[k]] : [])])].map(o => <option key={o} value={o}>{o}</option>)}</SelectInput>}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar vale ${vale?.correlativo ?? ''}` : 'Nuevo vale de combustible'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {txt('correlativo', 'Correlativo')}
        {txt('fecha', 'Fecha y hora', { type: 'datetime-local' })}
        <Field label="Vehículo (placa)">
          {p => (<>
            <TextInput {...p} list="vale-placas" value={v.vehiculo ?? ''} onChange={e => set('vehiculo', e.target.value.toUpperCase())} />
            <datalist id="vale-placas">{(cat?.placas ?? []).map(x => <option key={x} value={x} />)}</datalist>
          </>)}
        </Field>
        {txt('viaje', 'N° de viaje')}
        <Field label="Conductor" wide>
          {p => (<>
            <TextInput {...p} list="vale-conductores" value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />
            <datalist id="vale-conductores">{(cat?.conductores ?? []).map(x => <option key={x} value={x} />)}</datalist>
          </>)}
        </Field>
        {txt('ruta', 'Ruta', { wide: true })}
        <Field label="Proveedor" wide>
          {p => (<>
            <TextInput {...p} list="vale-prov" value={v.proveedor ?? ''}
              onChange={e => { const val = e.target.value; const pr = (cat?.proveedores ?? []).find(x => x.proveedor_razon_social === val); setV(a => ({ ...a, proveedor: val, ruc: pr?.proveedor_ruc ?? a.ruc })); }} />
            <datalist id="vale-prov">{(cat?.proveedores ?? []).map(x => <option key={x.proveedor_razon_social} value={x.proveedor_razon_social} />)}</datalist>
          </>)}
        </Field>
        {txt('estacion', 'Estación')}
        {txt('ruc', 'RUC')}
        {sel('tipo_combustible', 'Combustible', cat?.combustibles ?? ['D2'])}
        {txt('kilometraje', 'Kilometraje', { mode: 'numeric' })}
        {txt('galones', 'Galones', { mode: 'decimal', calc: true })}
        {txt('costo_gl', 'Costo por galón', { mode: 'decimal', calc: true })}
        {txt('importe', 'Importe', { mode: 'decimal' })}
        {sel('moneda', 'Moneda', ['SOLES', 'DOLARES'])}
        {sel('tipo_pago', 'Tipo de pago', TIPOS_PAGO)}
        {txt('dias_credito', 'Días de crédito', { mode: 'numeric' })}
        {sel('estado_pago', 'Estado de pago', PAGOS)}
        {sel('estado', 'Estado', ESTADOS)}
        {txt('numero_comprobante', 'N° de comprobante')}
        {txt('observacion', 'Observación', { wide: true })}
      </div>
    </Sheet>
  );
}
