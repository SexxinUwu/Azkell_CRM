import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Download, Plus, SearchX, Trash2 } from 'lucide-react';
import { FileSpreadsheet, Pencil } from '../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import '../../core/ui/listado.css';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { ListaMultiple } from '../../core/ui/ListaMultiple';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { usePlacas } from '../placas/api';
import { useTiposPreventivo } from './fleetrunApi';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { ImportarFrecuenciasSheet, descargarPlantillaFrecuencias } from './ImportarFrecuenciasSheet';

// Mantenimiento › Frecuencias MP: cada tipo de mantenimiento preventivo con su frecuencia por marca y modelo
interface TipoMp {
  id: number; marca: string; modelo: string | null; tipo_mp: string; tipo: string | null; sistema: string | null;
  uts: string | null; combustible: string | null; frecuencia_km: number | null; frecuencia_horas: number | null; frecuencia_dias: number | null;
  descripcion: string | null;
}
type Borrador = Partial<Omit<TipoMp, 'id' | 'frecuencia_km' | 'frecuencia_horas' | 'frecuencia_dias'>> & { id?: number; frecuencia_km?: string; frecuencia_horas?: string; frecuencia_dias?: string };

const aNumero = (v?: string) => (v && v.trim() ? parseInt(v, 10) || null : null);

const COLUMNAS: ColumnaTabla[] = [
  { id: 'marca', titulo: 'Marca', ancho: 100 },
  { id: 'modelo', titulo: 'Modelo', ancho: 110 },
  { id: 'tipo_mp', titulo: 'Tipo de MP', ancho: 160 },
  { id: 'tipo', titulo: 'Tipo', ancho: 90 },
  { id: 'sistema', titulo: 'Sistema', ancho: 110 },
  { id: 'combustible', titulo: 'Combustible', ancho: 90 },
  { id: 'uts', titulo: 'UTS', ancho: 80 },
  { id: 'km', titulo: 'Cada (km)', ancho: 90 },
  { id: 'horas', titulo: 'Cada (horas)', ancho: 90 },
  { id: 'dias', titulo: 'Cada (días)', ancho: 90 },
  { id: 'descripcion', titulo: 'Descripción', ancho: 220 },
  { id: 'acciones', titulo: 'Acciones', ancho: 96, minimo: 90 },
];

const FRECUENCIAS = [{ value: 'km', label: 'Por kilometraje' }, { value: 'horas', label: 'Por horas de motor' }, { value: 'dias', label: 'Por días' }];

export function FrecuenciasMpPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [fMarca, setFMarca] = useState<string[]>([]);
  const [fModelo, setFModelo] = useState<string[]>([]);
  const [fTipoMp, setFTipoMp] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[]>([]);
  const [fSistema, setFSistema] = useState<string[]>([]);
  const [fCombustible, setFCombustible] = useState<string[]>([]);
  const [fUts, setFUts] = useState<string[]>([]);
  const [fFrec, setFFrec] = useState<string[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<TipoMp | null>(null);
  const [importando, setImportando] = useState(false);
  const puedeEditar = can('cfg_mant.editar', 'cfg_mant.crear');

  const lista = useQuery<TipoMp[]>({
    queryKey: ['mant', 'tipos-mantenimiento'],
    queryFn: () => api<unknown>('/tipos-mantenimiento').then(r => (Array.isArray(r) ? r : ((r as { data?: TipoMp[] }).data ?? [])) as TipoMp[]),
    staleTime: 60_000,
  });
  const valores = (campo: keyof TipoMp) => [...new Set((lista.data ?? []).map(r => String(r[campo] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map(v => ({ value: v, label: v }));
  const activos = fMarca.length + fModelo.length + fTipoMp.length + fTipo.length + fSistema.length + fCombustible.length + fUts.length + fFrec.length;
  const limpiarFiltros = () => { setFMarca([]); setFModelo([]); setFTipoMp([]); setFTipo([]); setFSistema([]); setFCombustible([]); setFUts([]); setFFrec([]); };
  const placas = usePlacas();
  const tiposCatalogo = useTiposPreventivo();
  const opciones = (...listas: Array<Array<string | null | undefined>>): ComboboxOption[] => {
    const vistos = new Map<string, string>();
    for (const l of listas) for (const v of l) {
      const texto = (v ?? '').trim().replace(/s+/g, ' ');
      if (!texto) continue;
      const clave = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!vistos.has(clave)) vistos.set(clave, texto);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es')).map(v => ({ value: v, label: v }));
  };
  const datosRegla = (campo: keyof TipoMp) => (lista.data ?? []).map(r => String(r[campo] ?? ''));
  const datosPlaca = (campo: 'marca' | 'modelo' | 'combustible' | 'uts') => (placas.data ?? []).map(p => String(p[campo] ?? ''));
  const opcionesMarca = useMemo(() => opciones(datosRegla('marca'), datosPlaca('marca')), [lista.data, placas.data]);
  const opcionesModelo = useMemo(() => opciones(datosRegla('modelo'), datosPlaca('modelo')), [lista.data, placas.data]);
  const opcionesTipoMp = useMemo(() => opciones(tiposCatalogo.data ?? [], datosRegla('tipo_mp')), [lista.data, tiposCatalogo.data]);
  const opcionesTipo = useMemo(() => opciones(['Cambio', 'Inspección', 'Regulación', 'Calibración', 'Engrase', 'Limpieza', 'Ajuste'], datosRegla('tipo')), [lista.data]);
  const opcionesSistema = useMemo(() => opciones(['Motor', 'Transmisión / Caja', 'Diferencial', 'Frenos', 'Suspensión', 'Eléctrico', 'Neumáticos', 'Dirección', 'Refrigeración', 'Combustible', 'Cabina'], datosRegla('sistema')), [lista.data]);
  const opcionesCombustible = useMemo(() => opciones(['DIÉSEL', 'GNV', 'GLP'], datosRegla('combustible'), datosPlaca('combustible')), [lista.data, placas.data]);
  const opcionesUts = useMemo(() => opciones(['NACIONAL', 'LOCAL', 'RUTA'], datosRegla('uts'), datosPlaca('uts')), [lista.data, placas.data]);
  const datos = useMemo(() => {
    const t = q.trim().toUpperCase();
    const en = (sel: string[], v: string | null) => !sel.length || sel.includes((v ?? '').trim());
    return (lista.data ?? []).filter(r =>
      en(fMarca, r.marca) && en(fModelo, r.modelo) && en(fTipoMp, r.tipo_mp) && en(fTipo, r.tipo) && en(fSistema, r.sistema) && en(fCombustible, r.combustible) && en(fUts, r.uts) &&
      (!fFrec.length || fFrec.some(f => (f === 'km' ? r.frecuencia_km : f === 'horas' ? r.frecuencia_horas : r.frecuencia_dias))) &&
      (!t || [r.marca, r.modelo, r.tipo_mp, r.tipo, r.sistema, r.combustible, r.uts, r.descripcion].some(v => (v ?? '').toUpperCase().includes(t))));
  }, [lista.data, q, fMarca, fModelo, fTipoMp, fTipo, fSistema, fCombustible, fUts, fFrec]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'tipos-mantenimiento'] });

  function abrirNuevo() { setBorrador({ marca: '', tipo_mp: '', modelo: '', tipo: '', sistema: '', combustible: '', uts: '', descripcion: '', frecuencia_km: '', frecuencia_horas: '', frecuencia_dias: '' }); }
  function abrirEditar(r: TipoMp) {
    setBorrador({ ...r, frecuencia_km: r.frecuencia_km ? String(r.frecuencia_km) : '', frecuencia_horas: r.frecuencia_horas ? String(r.frecuencia_horas) : '', frecuencia_dias: r.frecuencia_dias ? String(r.frecuencia_dias) : '' });
  }

  async function guardar() {
    if (!borrador) return;
    if (!(borrador.marca ?? '').trim() || !(borrador.tipo_mp ?? '').trim()) { toast('La marca y el tipo de MP son obligatorios', 'error'); haptic('warning'); return; }
    const cuerpo = {
      marca: (borrador.marca ?? '').trim().toUpperCase(), tipo_mp: (borrador.tipo_mp ?? '').trim().toUpperCase(),
      modelo: (borrador.modelo ?? '').trim().toUpperCase() || null, uts: (borrador.uts ?? '').trim().toUpperCase() || null,
      combustible: (borrador.combustible ?? '').trim().toUpperCase() || null, tipo: (borrador.tipo ?? '').trim() || null,
      sistema: (borrador.sistema ?? '').trim() || null, descripcion: (borrador.descripcion ?? '').trim() || null,
      frecuencia_km: aNumero(borrador.frecuencia_km), frecuencia_horas: aNumero(borrador.frecuencia_horas), frecuencia_dias: aNumero(borrador.frecuencia_dias),
    };
    setGuardando(true);
    try {
      const r = borrador.id
        ? await api<{ ok?: boolean; error?: string }>(`/tipos-mantenimiento/${borrador.id}`, { method: 'PUT', body: cuerpo })
        : await api<{ ok?: boolean; error?: string }>('/tipos-mantenimiento', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast('Frecuencia guardada');
      setBorrador(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setGuardando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tipos-mantenimiento/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Frecuencia eliminada');
      setPorEliminar(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const lista2 = (k: keyof Borrador, label: string, opcionesCampo: ComboboxOption[], wide = false, ayuda?: string) => (
    <Field label={label} wide={wide} hint={ayuda}>
      {p => (
        <Combobox
          id={p.id}
          aria-describedby={p['aria-describedby']}
          options={opcionesCampo}
          value={String(borrador?.[k] ?? '') || null}
          onChange={v => setBorrador(b => (b ? { ...b, [k]: v ?? '' } : b))}
          onCreate={texto => setBorrador(b => (b ? { ...b, [k]: texto.trim() } : b))}
          createLabel="Usar"
          placeholder="Elige o escribe para buscar…"
        />
      )}
    </Field>
  );

  const txt = (k: keyof Borrador, label: string, wide = false, placeholder?: string) => (
    <Field label={label} wide={wide}>
      {p => <TextInput {...p} placeholder={placeholder} value={String(borrador?.[k] ?? '')} onChange={e => setBorrador(b => (b ? { ...b, [k]: e.target.value } : b))} />}
    </Field>
  );

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Frecuencias de mantenimiento"
        subtitle={lista.isLoading ? 'Cargando…' : `${(lista.data ?? []).length} frecuencias por marca y modelo`}
        actions={<>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => descargarPlantillaFrecuencias()}>Plantilla</Button>
          {puedeEditar && <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => setImportando(true)}>Importar Excel</Button>}
          {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNuevo}>Nueva frecuencia</Button>}
        </>} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={q} onBusqueda={setQ} placeholder="Marca, modelo, tipo de MP, sistema…" activos={activos} onAbrirFiltros={() => setFiltrosAbiertos(true)} />

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : datos.length === 0 ? (
          <EmptyState icon={q || activos ? <SearchX size={22} /> : <CalendarClock size={22} />} title={q || activos ? 'Sin coincidencias' : 'Sin frecuencias'}>Agrega el primer tipo de mantenimiento preventivo.</EmptyState>
        ) : (
          <TablaRedimensionable id="frecuencias-mp-v2" columnas={COLUMNAS} ariaLabel="Frecuencias de mantenimiento" altoMax="70vh" className="tabla-redim--compacta">
            {datos.map(r => (
              <tr key={r.id}>
                <Celda>{r.marca}</Celda>
                <Celda>{r.modelo || '—'}</Celda>
                <Celda>{r.tipo_mp}</Celda>
                <Celda>{r.tipo || '—'}</Celda>
                <Celda>{r.sistema || '—'}</Celda>
                <Celda>{r.combustible || '—'}</Celda>
                <Celda>{r.uts || 'Todas'}</Celda>
                <Celda mono>{r.frecuencia_km ? r.frecuencia_km.toLocaleString('es-PE') : '—'}</Celda>
                <Celda mono>{r.frecuencia_horas ? r.frecuencia_horas.toLocaleString('es-PE') : '—'}</Celda>
                <Celda mono>{r.frecuencia_dias ? r.frecuencia_dias.toLocaleString('es-PE') : '—'}</Celda>
                <Celda>{r.descripcion || '—'}</Celda>
                <Celda>
                  {puedeEditar && (
                    <span style={{ display: 'inline-flex', gap: 'var(--s-1)' }}>
                      <Button variant="secondary" icon={<Pencil size={15} />} aria-label={`Editar ${r.tipo_mp}`} onClick={() => abrirEditar(r)}>{''}</Button>
                      <Button variant="secondary" icon={<Trash2 size={15} />} aria-label={`Eliminar ${r.tipo_mp}`} onClick={() => setPorEliminar(r)}>{''}</Button>
                    </span>
                  )}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <Sheet open={!!borrador} onClose={() => !guardando && setBorrador(null)} title={borrador?.id ? 'Editar frecuencia' : 'Nueva frecuencia'}
        footer={<><Button variant="secondary" onClick={() => setBorrador(null)} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
        {borrador && (
          <div className="form-grid">
            {lista2('marca', 'Marca', opcionesMarca, false, 'Elige o escribe una marca nueva')}
            {lista2('modelo', 'Modelo', opcionesModelo, false, 'Vacío = todos los modelos de la marca')}
            {lista2('tipo_mp', 'Tipo de mantenimiento', opcionesTipoMp, true, 'Ej. CAMBIO DE ACEITE Y FILTROS, PM1')}
            {txt('frecuencia_km', 'Cada (km)')}{txt('frecuencia_horas', 'Cada (horas de motor)')}{txt('frecuencia_dias', 'Cada (días)')}
            {lista2('tipo', 'Tipo', opcionesTipo)}{lista2('sistema', 'Sistema', opcionesSistema)}{lista2('combustible', 'Combustible', opcionesCombustible)}{lista2('uts', 'UTS', opcionesUts, false, 'Vacío = todas las UTS')}
            {txt('descripcion', 'Descripción', true)}
          </div>
        )}
      </Sheet>

      <HojaFiltros open={filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)} activos={activos} onLimpiar={limpiarFiltros} resultado={datos.length} unidad="frecuencia">
        <GrupoFiltro titulo="Marca"><ListaMultiple etiqueta="Marca" valor={fMarca} onChange={setFMarca} opciones={valores('marca')} /></GrupoFiltro>
        <GrupoFiltro titulo="Modelo"><ListaMultiple etiqueta="Modelo" valor={fModelo} onChange={setFModelo} opciones={valores('modelo')} /></GrupoFiltro>
        <GrupoFiltro titulo="Tipo de MP"><ListaMultiple etiqueta="Tipo de MP" valor={fTipoMp} onChange={setFTipoMp} opciones={valores('tipo_mp')} /></GrupoFiltro>
        <GrupoFiltro titulo="Tipo"><ListaMultiple etiqueta="Tipo" valor={fTipo} onChange={setFTipo} opciones={valores('tipo')} /></GrupoFiltro>
        <GrupoFiltro titulo="Sistema"><ListaMultiple etiqueta="Sistema" valor={fSistema} onChange={setFSistema} opciones={valores('sistema')} /></GrupoFiltro>
        <GrupoFiltro titulo="Combustible"><ListaMultiple etiqueta="Combustible" valor={fCombustible} onChange={setFCombustible} opciones={valores('combustible')} /></GrupoFiltro>
        <GrupoFiltro titulo="UTS"><ListaMultiple etiqueta="UTS" valor={fUts} onChange={setFUts} opciones={valores('uts')} /></GrupoFiltro>
        <GrupoFiltro titulo="Frecuencia"><ListaMultiple etiqueta="Frecuencia" valor={fFrec} onChange={setFFrec} opciones={FRECUENCIAS} /></GrupoFiltro>
      </HojaFiltros>

      <ImportarFrecuenciasSheet open={importando} onClose={() => setImportando(false)} />

      <ConfirmSheet open={!!porEliminar} onClose={() => !guardando && setPorEliminar(null)} loading={guardando} onConfirm={eliminar}
        title={`¿Eliminar "${porEliminar?.tipo_mp ?? ''}"?`} message={`Se quita la frecuencia de ${porEliminar?.marca ?? ''} ${porEliminar?.modelo ?? ''}. Los mantenimientos ya hechos no cambian.`} confirmLabel="Eliminar" />
    </Page>
  );
}
