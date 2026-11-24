import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Briefcase, CircleAlert, Clock, Eye, FileText, FolderDown, History, RefreshCw, SearchX, Settings2, SlidersHorizontal, Truck, Wrench } from 'lucide-react';
import '../flota/flota.css';
import '../mantenimiento/mant.css';
import '../flota/disponibilidad.css';
import '../flota/documentos.css';
import { Button, PageLoader } from '../../core/ui/Button';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { Badge, EmptyState, Notice, Page } from '../../core/ui/Display';
import { BotonTip } from '../../core/ui/BotonTip';
import { SearchField } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import { DocMetaVigentes } from '../flota/DocMetaVigentes';
import { DocsMarsisaCalendario, type EventoCal } from './DocsMarsisaCalendario';
import { ConfigurarPlacasSheet, guardarSeleccion, leerSeleccion } from '../flota/ConfigurarPlacasSheet';
import { colorDoc, repartirPorcentajes } from '../flota/docsEstado';

// Operaciones Marsisa › Documentos de flota (API externa): los documentos que entrega la API de Marsisa con el mismo diseño de
// Documentos de flota (expediente por unidad y matriz general), solo de consulta. Se actualiza con «Sincronizar».
// Es una copia en su propia tabla: no se mezcla con los documentos propios de la flota.

type EstadoDoc = 'vigente' | 'por_vencer' | 'vencido' | 'sin_vencimiento';
interface DocExterno {
  id: number; id_remoto: number; placa: string; unidad_activa: boolean; tipo_codigo: string; tipo_nombre: string; numero: string | null; emisor: string | null;
  fecha_emision: string | null; fecha_vencimiento: string | null; tiene_archivo: boolean; archivo_guardado: boolean; actualizado_remoto: string | null; sincronizado_en: string;
  /** La placa está en nuestra flota (activa) y, si la tenemos alquilada a otra empresa, a quién */
  en_flota: boolean; alquilada_a: string | null;
  estado: EstadoDoc; dias: number | null;
}
interface RespuestaLista { ok: boolean; data: DocExterno[]; ultima_sincronizacion: string | null; sinTabla?: boolean }

// Las placas a mostrar se eligen aquí y quedan en este dispositivo (aparte de las de Documentos de flota)
const CLAVE_PLACAS = 'fleet_docs_api_placas_visibles';

type Vista = 'expediente' | 'matriz' | 'calendario' | 'tabla';
type Grupo = 'todos' | 'vigente' | 'alerta' | 'vencido';
interface TipoDeUnidad { codigo: string; nombre: string; actual: DocExterno; anteriores: DocExterno[] }
interface Unidad { placa: string; activa: boolean; enFlota: boolean; alquiladaA: string | null; tipos: TipoDeUnidad[]; grupo: Exclude<Grupo, 'todos'>; salud: number; registros: number }
/** Qué unidades se ven: las de nuestra flota (por defecto), las que tenemos alquiladas a otras, las que no están en nuestra flota o todas */
type Ambito = 'flota' | 'alquiladas' | 'fuera' | 'todas';

const VISTAS: Array<{ value: Vista; label: string }> = [{ value: 'expediente', label: 'Expediente' }, { value: 'matriz', label: 'Matriz general' }, { value: 'calendario', label: 'Calendario' }, { value: 'tabla', label: 'Tabla' }];

/** Nombre corto de un tipo para el calendario */
const CORTOS: Record<string, string> = { TARJETA_CIRCULACION: 'TUC', REVISION_TECNICA: 'CITV', SOAT: 'SOAT', TARJETA_PROPIEDAD: 'T. Propiedad', CONTRATO_ALQUILER_VEHICULO: 'Contrato alquiler', BONIFICACION_SUSPENSION_NEUMATICA: 'Bonif. MTC' };
const cortoDe = (codigo: string, nombre: string) => CORTOS[codigo] ?? (nombre.length > 22 ? `${nombre.slice(0, 21)}…` : nombre);

const COLOR_ESTADO: Record<EstadoDoc, string> = { vigente: 'var(--green-ink)', por_vencer: 'var(--amber-ink)', vencido: 'var(--red-ink)', sin_vencimiento: 'var(--label-3)' };
const COLOR_GRUPO: Record<Exclude<Grupo, 'todos'>, string> = { vigente: 'var(--green-ink)', alerta: 'var(--amber-ink)', vencido: 'var(--red-ink)' };
const TONO: Record<EstadoDoc, 'green' | 'amber' | 'red' | 'gray'> = { vigente: 'green', por_vencer: 'amber', vencido: 'red', sin_vencimiento: 'gray' };
const PESO: Record<EstadoDoc, number> = { vencido: 3, por_vencer: 2, vigente: 1, sin_vencimiento: 0 };

const textoEstado = (d: Pick<DocExterno, 'estado' | 'dias'>) => {
  if (d.estado === 'sin_vencimiento' || d.dias == null) return 'Sin vencimiento';
  if (d.estado === 'vencido') return `Venció hace ${-d.dias} ${-d.dias === 1 ? 'día' : 'días'}`;
  const t = d.dias === 0 ? 'Vence hoy' : `Faltan ${d.dias} ${d.dias === 1 ? 'día' : 'días'}`;
  return `${t} (${d.estado === 'por_vencer' ? 'Por vencer' : 'Vigente'})`;
};

/** De varios documentos del mismo tipo, el vigente es el de vencimiento más lejano (y, si empatan, el más nuevo) */
const masReciente = (a: DocExterno, b: DocExterno) => ((b.fecha_vencimiento ?? '').localeCompare(a.fecha_vencimiento ?? '') || b.id_remoto - a.id_remoto);

function agruparPorUnidad(docs: DocExterno[]): Unidad[] {
  const porPlaca = new Map<string, DocExterno[]>();
  docs.forEach(d => { const a = porPlaca.get(d.placa) ?? []; a.push(d); porPlaca.set(d.placa, a); });
  return [...porPlaca.entries()].map(([placa, lista]) => {
    const porTipo = new Map<string, DocExterno[]>();
    lista.forEach(d => { const a = porTipo.get(d.tipo_codigo) ?? []; a.push(d); porTipo.set(d.tipo_codigo, a); });
    const tipos: TipoDeUnidad[] = [...porTipo.values()].map(ds => {
      const orden = [...ds].sort(masReciente);
      return { codigo: orden[0].tipo_codigo, nombre: orden[0].tipo_nombre, actual: orden[0], anteriores: orden.slice(1) };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const peor = tipos.reduce<EstadoDoc>((p, t) => (PESO[t.actual.estado] > PESO[p] ? t.actual.estado : p), 'sin_vencimiento');
    const buenos = tipos.filter(t => t.actual.estado !== 'vencido').length;
    const unidad: Unidad = {
      placa, activa: lista.some(d => d.unidad_activa), enFlota: lista[0].en_flota, alquiladaA: lista[0].alquilada_a, tipos, registros: lista.length,
      grupo: peor === 'vencido' ? 'vencido' : peor === 'por_vencer' ? 'alerta' : 'vigente',
      salud: tipos.length ? Math.round((buenos / tipos.length) * 100) : 0,
    };
    return unidad;
  }).sort((a, b) => a.placa.localeCompare(b.placa));
}

const COLUMNAS_TABLA: ColumnaTabla[] = [
  { id: 'id', titulo: 'ID API', ancho: 90, alinear: 'right' },
  { id: 'placa', titulo: 'Unidad', ancho: 130 },
  { id: 'activa', titulo: 'Unidad activa', ancho: 110, alinear: 'center' },
  { id: 'tipo', titulo: 'Documento', ancho: 260, minimo: 160 },
  { id: 'codigo', titulo: 'Código del tipo', ancho: 220, minimo: 120 },
  { id: 'numero', titulo: 'Número', ancho: 240, minimo: 120 },
  { id: 'emisor', titulo: 'Emisor', ancho: 160 },
  { id: 'emision', titulo: 'Emisión', ancho: 110 },
  { id: 'vence', titulo: 'Vencimiento', ancho: 120 },
  { id: 'estado', titulo: 'Estado', ancho: 190 },
  { id: 'dias', titulo: 'Días', ancho: 80, alinear: 'right' },
  { id: 'archivo', titulo: 'Archivo', ancho: 120, alinear: 'center' },
  { id: 'actualizado', titulo: 'Actualizado en la API', ancho: 160 },
  { id: 'sincronizado', titulo: 'Sincronizado', ancho: 150 },
];

export function DocsMarsisaPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeSincronizar = can('docs_flota.crear', 'docs_flota.editar');
  const q = useQuery<RespuestaLista>({
    queryKey: ['operaciones', 'docs-marsisa'], staleTime: 30_000,
    queryFn: () => api<RespuestaLista>('/operaciones/docs-marsisa'),
  });
  const [vista, setVista] = useState<Vista>('expediente');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('todos');
  // Por defecto solo las unidades que también están en nuestra flota: las demás son de la API y no suman a nuestro conteo
  const [ambito, setAmbito] = useState<Ambito>('flota');
  const [filtrando, setFiltrando] = useState(false);
  const [placa, setPlaca] = useState<string | null>(null);
  // Placas que se ven (null = todas)
  const [seleccionPlacas, setSeleccionPlacas] = useState<Set<string> | null>(() => leerSeleccion(CLAVE_PLACAS));
  const [configurando, setConfigurando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todosLosDocs = useMemo(() => q.data?.data ?? [], [q.data]);
  const docs = useMemo(() => (seleccionPlacas ? todosLosDocs.filter(d => seleccionPlacas.has(d.placa)) : todosLosDocs), [todosLosDocs, seleccionPlacas]);
  const opcionesPlacas = useMemo(() => agruparPorUnidad(todosLosDocs).map(u => ({ placa: u.placa, detalle: `${u.tipos.length} tipos de documento · ${u.registros} registros` })), [todosLosDocs]);
  const aplicarSeleccion = (s: Set<string> | null) => { setSeleccionPlacas(s); guardarSeleccion(s, CLAVE_PLACAS); };
  const tiposCatalogo = useMemo(() => {
    const m = new Map<string, string>();
    docs.forEach(d => m.set(d.tipo_codigo, d.tipo_nombre));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label }));
  }, [docs]);

  // Documentos que cuentan: los del tipo elegido y los que coinciden con la búsqueda
  const sinAmbito = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return docs.filter(d => (!tipo || d.tipo_codigo === tipo) && (!t || [d.placa, d.tipo_nombre, d.numero].some(x => String(x ?? '').toUpperCase().includes(t))));
  }, [docs, busqueda, tipo]);
  const conteoAmbito = useMemo(() => {
    const por = (f: (d: DocExterno) => boolean) => new Set(sinAmbito.filter(f).map(d => d.placa)).size;
    return { todas: por(() => true), flota: por(d => d.en_flota), alquiladas: por(d => !!d.alquilada_a), fuera: por(d => !d.en_flota) };
  }, [sinAmbito]);
  const delFiltro = useMemo(() => sinAmbito.filter(d => ambito === 'todas' || (ambito === 'flota' ? d.en_flota : ambito === 'alquiladas' ? !!d.alquilada_a : !d.en_flota)), [sinAmbito, ambito]);
  // Las tarjetas son por unidad (como en Documentos de flota) y reaccionan a la búsqueda y al tipo; el estado no las recorta
  const unidades = useMemo(() => agruparPorUnidad(delFiltro), [delFiltro]);
  const cifras = useMemo(() => ({
    total: unidades.length,
    vigente: unidades.filter(u => u.grupo === 'vigente').length,
    alerta: unidades.filter(u => u.grupo === 'alerta').length,
    vencido: unidades.filter(u => u.grupo === 'vencido').length,
  }), [unidades]);
  const filas = useMemo(() => unidades.filter(u => grupo === 'todos' || u.grupo === grupo), [unidades, grupo]);
  const docsVisibles = useMemo(() => filas.flatMap(u => u.tipos.flatMap(t => [t.actual, ...t.anteriores])), [filas]);
  const pcts = repartirPorcentajes([cifras.vigente, cifras.alerta, cifras.vencido], cifras.total);
  const pctDe: Record<Grupo, number> = { todos: cifras.total ? 100 : 0, vigente: pcts[0], alerta: pcts[1], vencido: pcts[2] };
  const seleccion = filas.find(u => u.placa === placa) ?? filas[0] ?? null;
  // Vencimientos del calendario: el documento vigente de cada tipo de cada unidad (sin los de años pasados)
  const eventosCal = useMemo<EventoCal[]>(() => filas.flatMap(u => u.tipos.filter(t => t.actual.fecha_vencimiento).map(t => ({
    placa: u.placa, codigo: t.codigo, corto: cortoDe(t.codigo, t.nombre), titulo: t.nombre,
    color: colorDoc(Math.max(1, tiposCatalogo.findIndex(x => x.value === t.codigo) + 1)), fecha: t.actual.fecha_vencimiento as string,
    estado: t.actual.estado, dias: t.actual.dias, texto: textoEstado(t.actual),
  }))), [filas, tiposCatalogo]);
  const sinArchivosGuardados = todosLosDocs.filter(d => d.tiene_archivo && !d.archivo_guardado).length;
  const filtrosActivos = (tipo ? 1 : 0) + (grupo !== 'todos' ? 1 : 0) + (ambito !== 'flota' ? 1 : 0);

  async function sincronizar() {
    setSincronizando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; mensaje?: string }>('/operaciones/docs-marsisa/sincronizar', { method: 'POST', body: {} });
      if (r.ok === false) throw new Error(r.error || 'No se pudo sincronizar');
      haptic('success'); toast(r.mensaje ?? 'Sincronizado');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'docs-marsisa'] });
    } catch (e) { setError(errorMessage(e)); haptic('warning'); }
    finally { setSincronizando(false); }
  }

  /** Copia a Azkell los archivos que faltan, por tandas, hasta que no quede ninguno (o ya no avance) */
  async function guardarArchivos() {
    setGuardando('Preparando…'); setError(null);
    try {
      let fallidos = 0;
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const r = await api<{ ok?: boolean; error?: string; guardados: number; fallidos: unknown[]; pendientes: number; detener: boolean }>('/operaciones/docs-marsisa/sincronizar-archivos?limite=10', { method: 'POST', body: {} });
        if (r.ok === false) throw new Error(r.error || 'No se pudieron guardar los archivos');
        fallidos += r.fallidos.length;
        setGuardando(r.pendientes > 0 ? `Guardando archivos… quedan ${r.pendientes}` : 'Terminando…');
        if (r.pendientes === 0 || r.detener) break;
      }
      haptic('success'); toast(fallidos ? `Archivos guardados; ${fallidos} no se pudieron bajar` : 'Archivos guardados');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'docs-marsisa'] });
    } catch (e) { setError(errorMessage(e)); haptic('warning'); }
    finally { setGuardando(null); }
  }

  async function verArchivo(d: DocExterno) {
    setAbriendo(d.id); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; url?: string }>(`/operaciones/docs-marsisa/${d.id}/archivo`);
      if (r.ok === false || !r.url) throw new Error(r.error || 'No se pudo abrir el archivo');
      window.open(r.url, '_blank', 'noopener,noreferrer');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'docs-marsisa'] });
    } catch (e) { setError(errorMessage(e)); haptic('warning'); }
    finally { setAbriendo(null); }
  }

  const kpis: Array<{ clave: Grupo; label: string; valor: number; tono: string; icono: ReactNode }> = [
    { clave: 'todos', label: 'Unidades', valor: cifras.total, tono: 'blue', icono: <Briefcase size={18} strokeWidth={1.9} /> },
    { clave: 'vigente', label: 'Vigentes', valor: cifras.vigente, tono: 'green', icono: <Clock size={18} strokeWidth={1.9} /> },
    { clave: 'alerta', label: 'En alerta', valor: cifras.alerta, tono: 'amber', icono: <Wrench size={18} strokeWidth={1.9} /> },
    { clave: 'vencido', label: 'Vencidos', valor: cifras.vencido, tono: 'red', icono: <CircleAlert size={18} strokeWidth={1.9} /> },
  ];

  return (
    <Page wide fill>
      <header className="doc-cab">
        <div className="doc-cab__titulo">
          <span className="t-eyebrow">Operaciones Marsisa</span>
          <h1 className="doc-cab__h1">Documentos de flota (API)</h1>
        </div>
        <div className="doc-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, documento o número…" /></div>
        <SegmentedControl label="Vista" value={vista} onChange={setVista} options={VISTAS} />
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={filtrosActivos ? `Filtros, ${filtrosActivos} activos` : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>
          {filtrosActivos > 0 && <span className="placas-filtros__n t-numeric">{filtrosActivos}</span>}
        </Button>
        <div className="doc-cab__acciones">
          {q.data?.ultima_sincronizacion && <span className="t-footnote c-secondary">Última sincronización: {q.data.ultima_sincronizacion}</span>}
          {puedeSincronizar && sinArchivosGuardados > 0 && (
            <Button variant="secondary" icon={<FolderDown size={16} />} onClick={() => { void guardarArchivos(); }} loading={guardando !== null} disabled={sincronizando}
              title="Copia a Azkell los archivos que aún solo están en la API, para que abran al instante">
              {guardando ?? `Guardar archivos (${sinArchivosGuardados})`}
            </Button>
          )}
          <BotonTip tip={seleccionPlacas ? `Placas a mostrar: ${seleccionPlacas.size} de ${opcionesPlacas.length}` : 'Configurar placas a mostrar'} className="btn btn--plain btn--icono btn--icono-acento"
            onClick={() => setConfigurando(true)}><Settings2 size={18} /></BotonTip>
          {seleccionPlacas && <span className="doc-conf__insignia" title="Hay un filtro de placas activo">{seleccionPlacas.size}/{opcionesPlacas.length}</span>}
          {puedeSincronizar && <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => { void sincronizar(); }} loading={sincronizando} disabled={guardando !== null}>Sincronizar</Button>}
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : q.data?.sinTabla ? (
        <Notice tone="error">Falta aplicar la actualización de la base de datos de esta empresa para usar este módulo.</Notice>
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Aún no hay documentos">
          {puedeSincronizar ? <>Configura el token en <strong>Sistema › Integraciones</strong> y pulsa <strong>Sincronizar</strong> para traer los documentos de la API.</> : 'Cuando se sincronicen, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div className="doc-pagina">
          <DocMetaVigentes vigentes={cifras.vigente} total={cifras.total} pct={pctDe.vigente} chips={([
            ['flota', 'En mi flota', conteoAmbito.flota], ['alquiladas', 'Alquiladas a otras', conteoAmbito.alquiladas],
            ['fuera', 'Fuera de mi flota', conteoAmbito.fuera], ['todas', 'Todas las de la API', conteoAmbito.todas],
          ] as const).map(([v, etiqueta, n]) => ({ clave: v, etiqueta, n, activo: ambito === v, onClick: () => { haptic('selection'); setAmbito(a => (a === v ? 'flota' : v)); } }))}>
            {kpis.map(k => (
              <button key={k.clave} type="button" className={`doc-tile pressable disp-kpi--${k.tono}`} aria-pressed={grupo === k.clave}
                onClick={() => { haptic('selection'); setGrupo(g => (g === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                <span className="doc-tile__icono" aria-hidden>{k.icono}</span>
                <span className="doc-tile__txt">
                  <span className="doc-tile__k">{k.label}</span>
                  <span className="doc-tile__v"><AnimatedNumber value={k.valor} className="t-numeric" /><small>{pctDe[k.clave]}%{k.clave === 'vigente' ? ` · falta ${100 - pctDe.vigente}%` : ''}</small></span>
                </span>
              </button>
            ))}
          </DocMetaVigentes>

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={() => { setTipo(''); setGrupo('todos'); setAmbito('flota'); }} resultado={filas.length} unidad="unidad">
            <GrupoFiltro titulo="Unidades">
              <ChoiceChips label="Unidades" value={ambito} onChange={v => setAmbito(v as Ambito)} options={[
                { value: 'flota', label: 'En mi flota' }, { value: 'alquiladas', label: 'Alquiladas a otras' }, { value: 'fuera', label: 'Fuera de mi flota' }, { value: 'todas', label: 'Todas' },
              ]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Tipo de documento">
              <Combobox options={tiposCatalogo} value={tipo || null} onChange={v => setTipo(v ?? '')} enHoja compacta placeholder="Todos los tipos" tituloHoja="Tipo de documento" />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado de la unidad">
              <ChoiceChips label="Estado" value={grupo} onChange={v => setGrupo(v as Grupo)} options={[
                { value: 'todos', label: 'Todas' }, { value: 'vigente', label: 'Vigentes' }, { value: 'alerta', label: 'En alerta' }, { value: 'vencido', label: 'Vencidas' },
              ]} />
            </GrupoFiltro>
          </HojaFiltros>

          {filas.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin unidades para los filtros">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setTipo(''); setGrupo('todos'); setAmbito('flota'); }}>Quitar filtros</button>
            </EmptyState>
          ) : vista === 'expediente' && seleccion ? (
            <div className="doc-expediente">
              <ul className="doc-lista" aria-label="Unidades">
                {filas.map(u => {
                  const activa = seleccion.placa === u.placa;
                  return (
                    <li key={u.placa}>
                      <button type="button" className={`doc-unidad pressable${activa ? ' doc-unidad--activa' : ''}`} aria-current={activa} onClick={() => { haptic('selection'); setPlaca(u.placa); }}>
                        <span className="doc-unidad__icono" style={{ background: `color-mix(in srgb, ${COLOR_GRUPO[u.grupo]} 12%, transparent)`, color: COLOR_GRUPO[u.grupo] }} aria-hidden><FileText size={17} strokeWidth={1.9} /></span>
                        <LicensePlate plate={u.placa} size="sm" />
                        {u.alquiladaA && <span className="doc-unidad__alq" title={`Alquilada a ${u.alquiladaA}`}>ALQ.</span>}
                        {!u.activa && <span className="doc-unidad__alq" title="Unidad inactiva en la API">INACT.</span>}
                        <span className="doc-punto" style={{ background: COLOR_GRUPO[u.grupo] }} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <motion.section className="doc-ficha" key={seleccion.placa} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label={`Documentos de ${seleccion.placa}`}>
                <header className="doc-ficha__cab">
                  <span className="doc-ficha__icono"><Truck size={22} strokeWidth={1.8} /></span>
                  <div className="doc-ficha__titulo">
                    <div className="doc-ficha__linea">
                      <strong className="doc-ficha__placa">{seleccion.placa}</strong>
                      <span className="doc-etiqueta">{seleccion.activa ? 'ACTIVA' : 'INACTIVA'}</span>
                    </div>
                    <span className="doc-ficha__sub">{seleccion.tipos.length} {seleccion.tipos.length === 1 ? 'tipo de documento' : 'tipos de documento'} · {seleccion.registros} {seleccion.registros === 1 ? 'registro' : 'registros'} en la API de Marsisa</span>
                  </div>
                  <div className="doc-salud" aria-label={`Salud de documentos ${seleccion.salud}%`}>
                    <span className="doc-salud__texto">Salud</span>
                    <span className="doc-salud__barra"><span style={{ width: `${seleccion.salud}%`, background: COLOR_GRUPO[seleccion.grupo] }} /></span>
                    <strong>{seleccion.salud}%</strong>
                  </div>
                </header>
                <div className="doc-alquiler">
                  <div className="doc-alquiler__chips">
                    {seleccion.alquiladaA ? <span className="doc-alquiler__chip">Alquilada a {seleccion.alquiladaA}</span> : seleccion.enFlota ? <span className="doc-alquiler__chip">Unidad propia, sin alquiler</span> : <span className="doc-alquiler__chip doc-alquiler__chip--aviso">No está en mi flota</span>}
                  </div>
                </div>
                <div className="doc-tarjetas">
                  {seleccion.tipos.map((t, i) => <TarjetaDoc key={t.codigo} num={i + 1} tipo={t} abriendo={abriendo} onVer={d => { void verArchivo(d); }} />)}
                </div>
              </motion.section>
            </div>
          ) : vista === 'calendario' ? (
            <DocsMarsisaCalendario eventos={eventosCal} tipos={tiposCatalogo.filter(t => !tipo || t.value === tipo)} onElegir={p => { setPlaca(p); setVista('expediente'); }} />
          ) : vista === 'matriz' ? (
            <Matriz filas={filas} tipos={tiposCatalogo.filter(t => !tipo || t.value === tipo)} />
          ) : (
            <TablaRedimensionable id="docs-marsisa-api-v2" ariaLabel="Documentos de flota de la API" altoMax="62vh" columnas={COLUMNAS_TABLA}>
              {docsVisibles.map(d => (
                <tr key={d.id}>
                  <Celda mono alinear="right">{d.id_remoto}</Celda>
                  <Celda><LicensePlate plate={d.placa} size="sm" /></Celda>
                  <Celda alinear="center">{d.unidad_activa ? 'Sí' : 'No'}</Celda>
                  <Celda>{d.tipo_nombre}</Celda>
                  <Celda mono>{d.tipo_codigo}</Celda>
                  <Celda mono>{d.numero || '—'}</Celda>
                  <Celda>{d.emisor || '—'}</Celda>
                  <Celda mono>{d.fecha_emision ? formatFechaPe(d.fecha_emision) : '—'}</Celda>
                  <Celda mono>{d.fecha_vencimiento ? formatFechaPe(d.fecha_vencimiento) : '—'}</Celda>
                  <Celda><Badge tone={TONO[d.estado]}>{textoEstado(d)}</Badge></Celda>
                  <Celda mono alinear="right">{d.dias ?? '—'}</Celda>
                  <Celda alinear="center">
                    {d.tiene_archivo
                      ? <Button variant="plain" size="sm" icon={<Eye size={14} />} loading={abriendo === d.id} onClick={() => { void verArchivo(d); }}>Ver</Button>
                      : <span className="c-secondary">—</span>}
                  </Celda>
                  <Celda mono>{d.actualizado_remoto ?? '—'}</Celda>
                  <Celda mono>{d.sincronizado_en}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </div>
      )}
      <ConfigurarPlacasSheet open={configurando} onClose={() => setConfigurando(false)} opciones={opcionesPlacas} seleccion={seleccionPlacas} onAplicar={aplicarSeleccion} />
    </Page>
  );
}

/** Tarjeta de un tipo de documento de la unidad: el vigente y, si hay, el historial de los anteriores (mismo diseño que Documentos de flota) */
function TarjetaDoc({ num, tipo, abriendo, onVer }: { num: number; tipo: TipoDeUnidad; abriendo: number | null; onVer: (d: DocExterno) => void }) {
  const [historial, setHistorial] = useState(false);
  const d = tipo.actual;
  return (
    <article className="doc-card" style={{ '--doc-color': colorDoc(num), '--estado-color': COLOR_ESTADO[d.estado] } as CSSProperties}>
      <header className="doc-card__cab">
        <span className="doc-card__num">{num}</span>
        <span className="doc-card__titulo">{tipo.nombre}</span>
      </header>
      <dl className="doc-card__filas">
        <div><dt>N°</dt><dd>{d.numero || '—'}</dd></div>
        {d.emisor && <div><dt>Emisor</dt><dd>{d.emisor}</dd></div>}
        <div><dt>Emisión</dt><dd>{d.fecha_emision ? formatFechaPe(d.fecha_emision) : '—'}</dd></div>
        <div><dt>Vencimiento</dt><dd>{d.fecha_vencimiento ? formatFechaPe(d.fecha_vencimiento) : '—'}</dd></div>
      </dl>
      <footer className="doc-card__pie">
        <span className="doc-card__estado-etiqueta">Estado</span>
        <span className="doc-card__estado" style={{ color: COLOR_ESTADO[d.estado] }}>{textoEstado(d)}</span>
      </footer>
      <div className="doc-card__acciones">
        {d.tiene_archivo && <Button variant="secondary" size="sm" icon={<Eye size={14} />} loading={abriendo === d.id} onClick={() => onVer(d)}>Ver archivo</Button>}
        {tipo.anteriores.length > 0 && <Button variant="secondary" size="sm" icon={<History size={14} />} aria-expanded={historial} onClick={() => setHistorial(a => !a)}>Historial ({tipo.anteriores.length})</Button>}
      </div>
      {historial && (
        <section className="doc-hist" aria-label={`Historial de ${tipo.nombre}`}>
          <ul className="doc-hist__lista">
            {tipo.anteriores.map(h => (
              <li key={h.id} className="doc-hist__fila">
                <span className="doc-hist__venc">{h.fecha_vencimiento ? `Vence ${formatFechaPe(h.fecha_vencimiento)}` : 'Sin vencimiento'}</span>
                <span className="doc-hist__detalle">{[h.numero, textoEstado(h)].filter(Boolean).join(' · ')}</span>
                {h.tiene_archivo && <button type="button" className="placas-limpiar" onClick={() => onVer(h)}>Ver</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Matriz general: una fila por unidad y, por cada tipo de documento, su número, su vencimiento y los días (mismo diseño que Flota) */
function Matriz({ filas, tipos }: { filas: Unidad[]; tipos: Array<{ value: string; label: string }> }) {
  return (
    <div className="doc-matriz-caja">
      <div className="doc-matriz-caja__cab"><span className="doc-matriz-caja__titulo">Matriz general de control documentario</span></div>
      <div className="doc-matriz-wrap">
        <table className="doc-matriz">
          <thead>
            <tr>
              <th rowSpan={2}>N°</th>
              <th rowSpan={2}>Placa</th>
              {tipos.map((t, i) => <th key={t.value} colSpan={3} className="doc-matriz__grupo" style={{ '--grupo-color': colorDoc(i + 1) } as CSSProperties}>{t.label}</th>)}
            </tr>
            <tr>{tipos.flatMap(t => [<th key={`${t.value}-n`}>N°</th>, <th key={`${t.value}-v`}>F. venc.</th>, <th key={`${t.value}-d`}>Días</th>])}</tr>
          </thead>
          <tbody>
            {filas.map((u, i) => (
              <tr key={u.placa}>
                <td className="doc-matriz__num">{i + 1}</td>
                <td className="doc-matriz__placa">{u.placa}{u.alquiladaA && <span className="doc-unidad__alq" title={`Alquilada a ${u.alquiladaA}`} style={{ marginLeft: 6 }}>ALQ.</span>}</td>
                {tipos.flatMap(t => {
                  const d = u.tipos.find(x => x.codigo === t.value)?.actual;
                  return [
                    <td key={`${u.placa}-${t.value}-n`} className="doc-matriz__mono">{d?.numero || '—'}</td>,
                    <td key={`${u.placa}-${t.value}-v`} className="doc-matriz__mono">{d?.fecha_vencimiento ? formatFechaPe(d.fecha_vencimiento) : '—'}</td>,
                    <td key={`${u.placa}-${t.value}-d`} title={d ? textoEstado(d) : ''}>
                      {d && d.dias != null
                        ? <span className="doc-dias" style={{ background: `color-mix(in srgb, ${COLOR_ESTADO[d.estado]} 13%, transparent)`, color: COLOR_ESTADO[d.estado] }}>{d.dias}</span>
                        : <span className="doc-dias doc-dias--vacio">—</span>}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
