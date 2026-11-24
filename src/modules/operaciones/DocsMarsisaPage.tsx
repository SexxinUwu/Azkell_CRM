import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Briefcase, CircleAlert, Clock, Eye, FileText, FolderDown, History, ListChecks, RefreshCw, SearchX, Settings2, SlidersHorizontal, Truck, Wrench } from 'lucide-react';
import { MenuFila } from '../../core/ui/MenuFila';
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
import { Sheet } from '../../core/ui/Sheet';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { exportarExcel } from '../../core/lib/excel';
import { Combobox } from '../../core/ui/Combobox';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { ADMIN } from '../../core/auth/permisos';
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
  en_flota: boolean; alquilada_a: string | null; empresa: string | null;
  tipo_unidad: string | null; alquiler_desde: string | null; alquiler_nota: string | null; docs_responsable: string | null;
  estado: EstadoDoc; dias: number | null;
}
interface RespuestaLista { ok: boolean; data: DocExterno[]; ultima_sincronizacion: string | null; sinTabla?: boolean }

// Las placas a mostrar se eligen aquí y quedan en este dispositivo (aparte de las de Documentos de flota)
const CLAVE_PLACAS = 'fleet_docs_api_placas_visibles';

type Vista = 'expediente' | 'matriz' | 'calendario' | 'alquiler' | 'documento' | 'tabla';
type GrupoUnidad = 'vigente' | 'alerta' | 'vencido';
/** «sin» = las unidades que no tienen el documento elegido en el filtro de tipo */
type Grupo = 'todos' | GrupoUnidad | 'sin';
type FiltroAlquiler = 'todas' | 'alquiladas' | 'propias' | 'externa';
interface TipoDeUnidad { codigo: string; nombre: string; actual: DocExterno; anteriores: DocExterno[] }
interface Unidad { placa: string; activa: boolean; enFlota: boolean; alquiladaA: string | null; empresa: string | null; tipoUnidad: string | null; alquilerDesde: string | null; alquilerNota: string | null; docsResponsable: string | null; tipos: TipoDeUnidad[]; grupo: GrupoUnidad; salud: number; registros: number }
/** Atajos de la selección de placas: las de la empresa Marsisa según nuestra ficha de placas (por defecto, alquiladas o no), las alquiladas a otras, las de otras empresas de nuestra flota, las que no están en nuestra flota o todas */
type Ambito = 'marsisa' | 'alquiladas' | 'otras' | 'fuera' | 'todas';
const esDeMarsisa = (empresa: string | null) => /marsisa/i.test(empresa ?? '');
/** Los campos de una unidad que usan las reglas de alquiler */
const u2d = (u: { empresa: string | null; alquiladaA: string | null }) => ({ empresa: u.empresa, alquilada_a: u.alquiladaA });
/** Marsisa alquila a otra empresa una unidad suya (la da en alquiler) */
const damosEnAlquiler = (d: { empresa: string | null; alquilada_a: string | null }) => esDeMarsisa(d.empresa) && !!d.alquilada_a && !esDeMarsisa(d.alquilada_a);
/** Otra empresa le alquila a Marsisa una unidad suya (la recibe en alquiler) */
const recibimosEnAlquiler = (d: { empresa: string | null; alquilada_a: string | null }) => !esDeMarsisa(d.empresa) && esDeMarsisa(d.alquilada_a);
/** Lo de Marsisa son sus unidades (alquiladas a otras o no) más las que le alquilan: todo suma al total de Marsisa */
const esDeLaOperacionMarsisa = (d: { en_flota: boolean; empresa: string | null; alquilada_a: string | null }) => d.en_flota && (esDeMarsisa(d.empresa) || recibimosEnAlquiler(d));

const VISTAS: Array<{ value: Vista; label: string }> = [{ value: 'expediente', label: 'Expediente' }, { value: 'matriz', label: 'Matriz general' }, { value: 'calendario', label: 'Calendario' }, { value: 'alquiler', label: 'Alquiler' }, { value: 'documento', label: 'Por documento' }, { value: 'tabla', label: 'Tabla' }];

/** Nombre corto de un tipo para el calendario */
const CORTOS: Record<string, string> = { TARJETA_CIRCULACION: 'TUC', REVISION_TECNICA: 'CITV', SOAT: 'SOAT', TARJETA_PROPIEDAD: 'T. Propiedad', CONTRATO_ALQUILER_VEHICULO: 'Contrato alquiler', BONIFICACION_SUSPENSION_NEUMATICA: 'Bonif. MTC' };
const cortoDe = (codigo: string, nombre: string) => CORTOS[codigo] ?? (nombre.length > 22 ? `${nombre.slice(0, 21)}…` : nombre);

const COLOR_ESTADO: Record<EstadoDoc, string> = { vigente: 'var(--green-ink)', por_vencer: 'var(--amber-ink)', vencido: 'var(--red-ink)', sin_vencimiento: 'var(--label-3)' };
const COLOR_GRUPO: Record<GrupoUnidad, string> = { vigente: 'var(--green-ink)', alerta: 'var(--amber-ink)', vencido: 'var(--red-ink)' };
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
      placa, activa: lista.some(d => d.unidad_activa), enFlota: lista[0].en_flota, alquiladaA: lista[0].alquilada_a, empresa: lista[0].empresa, tipoUnidad: lista[0].tipo_unidad, alquilerDesde: lista[0].alquiler_desde, alquilerNota: lista[0].alquiler_nota, docsResponsable: lista[0].docs_responsable, tipos, registros: lista.length,
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
  const { can, permissions } = useAuth();
  // Elegir qué placas se ven es de administradores; el resto ve siempre las de Marsisa
  const esAdmin = permissions.has(ADMIN);
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
  // Los mismos filtros de Documentos de flota: empresa dueña y alquiler
  const [empresaF, setEmpresaF] = useState('TODAS');
  const [alquilerF, setAlquilerF] = useState<FiltroAlquiler>('todas');
  const [filtrando, setFiltrando] = useState(false);
  const [placa, setPlaca] = useState<string | null>(null);
  // Placas que eligió el administrador en este dispositivo (null = aún no eligió: se ven las de Marsisa)
  const [elegidas, setElegidas] = useState<Set<string> | null>(() => leerSeleccion(CLAVE_PLACAS));
  const [configurando, setConfigurando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  // Guardado de archivos: el botón se queda corto y el avance sale en una «nube» flotante (con opción de detener)
  const [guardando, setGuardando] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ total: number; restan: number } | null>(null);
  const detener = useRef(false);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [fallosArchivos, setFallosArchivos] = useState<Array<{ id: number; error: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todosLosDocs = useMemo(() => q.data?.data ?? [], [q.data]);
  const opcionesPlacas = useMemo(() => agruparPorUnidad(todosLosDocs).map(u => ({ placa: u.placa, detalle: `${u.tipos.length} tipos de documento · ${u.registros} registros${u.empresa ? ` · ${u.empresa}` : ''}` })), [todosLosDocs]);
  // Conjuntos de placas de cada atajo, según nuestra ficha de placas
  const conjuntos = useMemo<Record<Ambito, Set<string>>>(() => {
    const por = (f: (d: DocExterno) => boolean) => new Set(todosLosDocs.filter(f).map(d => d.placa));
    return { marsisa: por(esDeLaOperacionMarsisa), alquiladas: por(d => damosEnAlquiler(d) || recibimosEnAlquiler(d)), otras: por(d => d.en_flota && !esDeLaOperacionMarsisa(d)), fuera: por(d => !d.en_flota), todas: por(() => true) };
  }, [todosLosDocs]);
  // Selección efectiva: la que eligió el administrador o, si no eligió, las de Marsisa. Lo que no está marcado aquí no se ve en ninguna vista.
  const placasVisibles = useMemo(() => (esAdmin && elegidas ? elegidas : conjuntos.marsisa), [esAdmin, elegidas, conjuntos]);
  const docs = useMemo(() => todosLosDocs.filter(d => placasVisibles.has(d.placa)), [todosLosDocs, placasVisibles]);
  /** Guarda la selección (si quedan todas marcadas se guarda explícita: «todas» no vuelve al valor por defecto) */
  const aplicarSeleccion = (s: Set<string> | null) => { const f = s ?? new Set(opcionesPlacas.map(o => o.placa)); setElegidas(f); guardarSeleccion(f, CLAVE_PLACAS); };
  const mismoConjunto = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
  const tiposCatalogo = useMemo(() => {
    const m = new Map<string, string>();
    docs.forEach(d => m.set(d.tipo_codigo, d.tipo_nombre));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label }));
  }, [docs]);

  const empresas = useMemo(() => agruparEmpresas(todosLosDocs.map(d => d.empresa)), [todosLosDocs]);
  // Documentos de las placas seleccionadas que cumplen la empresa, el alquiler y la búsqueda (todavía sin el tipo)
  const docsBase = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return docs.filter(d => (empresaF === 'TODAS' || claveEmpresa(d.empresa) === empresaF)
      && (alquilerF === 'todas' || (alquilerF === 'alquiladas' ? !!d.alquilada_a : alquilerF === 'propias' ? !d.alquilada_a : !!d.alquilada_a && d.docs_responsable === 'ARRENDATARIA'))
      && (!t || [d.placa, d.tipo_nombre, d.numero].some(x => String(x ?? '').toUpperCase().includes(t))));
  }, [docs, busqueda, empresaF, alquilerF]);
  // Los del tipo elegido
  const delFiltro = useMemo(() => docsBase.filter(d => !tipo || d.tipo_codigo === tipo), [docsBase, tipo]);
  const unidadesBase = useMemo(() => agruparPorUnidad(docsBase), [docsBase]);
  // Las tarjetas son por unidad (como en Documentos de flota) y reaccionan a la búsqueda, a la empresa, al alquiler y al tipo; el estado no las recorta
  const unidades = useMemo(() => agruparPorUnidad(delFiltro), [delFiltro]);
  const sinElTipo = useMemo(() => (tipo ? unidadesBase.filter(u => !u.tipos.some(t => t.codigo === tipo)) : []), [unidadesBase, tipo]);
  const cifras = useMemo(() => ({
    total: unidades.length,
    vigente: unidades.filter(u => u.grupo === 'vigente').length,
    alerta: unidades.filter(u => u.grupo === 'alerta').length,
    vencido: unidades.filter(u => u.grupo === 'vencido').length,
  }), [unidades]);
  const filas = useMemo(() => (grupo === 'sin' && tipo ? sinElTipo : unidades.filter(u => grupo === 'todos' || grupo === 'sin' || u.grupo === grupo)), [unidades, sinElTipo, grupo, tipo]);
  const docsVisibles = useMemo(() => filas.flatMap(u => u.tipos.flatMap(t => [t.actual, ...t.anteriores])), [filas]);
  const pcts = repartirPorcentajes([cifras.vigente, cifras.alerta, cifras.vencido], cifras.total);
  const pctDe: Record<Grupo, number> = { todos: cifras.total ? 100 : 0, vigente: pcts[0], alerta: pcts[1], vencido: pcts[2], sin: 0 };
  const seleccion = filas.find(u => u.placa === placa) ?? filas[0] ?? null;
  // Vencimientos del calendario: el documento vigente de cada tipo de cada unidad (sin los de años pasados)
  const eventosCal = useMemo<EventoCal[]>(() => filas.flatMap(u => u.tipos.filter(t => t.actual.fecha_vencimiento).map(t => ({
    placa: u.placa, codigo: t.codigo, corto: cortoDe(t.codigo, t.nombre), titulo: t.nombre,
    color: colorDoc(Math.max(1, tiposCatalogo.findIndex(x => x.value === t.codigo) + 1)), fecha: t.actual.fecha_vencimiento as string,
    estado: t.actual.estado, dias: t.actual.dias, texto: textoEstado(t.actual),
  }))), [filas, tiposCatalogo]);
  const sinArchivosGuardados = todosLosDocs.filter(d => d.tiene_archivo && !d.archivo_guardado).length;
  const filtrosActivos = (tipo ? 1 : 0) + (grupo !== 'todos' ? 1 : 0) + (empresaF !== 'TODAS' ? 1 : 0) + (alquilerF !== 'todas' ? 1 : 0);
  const limpiarFiltros = () => { setTipo(''); setGrupo('todos'); setEmpresaF('TODAS'); setAlquilerF('todas'); };

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
    detener.current = false;
    setProgreso({ total: sinArchivosGuardados, restan: sinArchivosGuardados });
    setGuardando('Preparando…'); setError(null); setFallosArchivos(null);
    try {
      // Los que fallan se apartan para seguir con los demás (y se muestran al final con su motivo)
      const falloIds: number[] = []; const motivos: Array<{ id: number; error: string }> = [];
      let fallidos = 0;
      for (let vuelta = 0; vuelta < 400; vuelta++) {
        if (detener.current) break;
        // Una tanda corta (el servidor devuelve lo avanzado). Si el proxy corta una (502/504), se reintenta: lo ya guardado se conserva
        let r: { ok?: boolean; error?: string; guardados: number; fallidos: unknown[]; pendientes: number; detener: boolean; limitado?: number } | null = null;
        for (let intento = 0; intento < 4 && !r; intento++) {
          try { r = await api<{ ok?: boolean; error?: string; guardados: number; fallidos: unknown[]; pendientes: number; detener: boolean; limitado?: number }>(`/operaciones/docs-marsisa/sincronizar-archivos?limite=4${falloIds.length ? `&excluir=${falloIds.join(',')}` : ''}`, { method: 'POST', body: {} }); }
          catch (e) { if (intento === 3) throw e; setGuardando('Reintentando…'); await new Promise(x => setTimeout(x, 3000)); }
        }
        if (!r) break;
        if (r.ok === false) throw new Error(r.error || 'No se pudieron guardar los archivos');
        // La API de Marsisa limita las consultas por minuto: se espera lo que pide y se sigue (no cuenta como fallo)
        if (r.limitado) {
          for (let seg = r.limitado; seg > 0; seg--) { setGuardando(`La API de Marsisa pidió esperar… ${seg} s`); await new Promise(x => setTimeout(x, 1000)); }
          continue;
        }
        fallidos += r.fallidos.length;
        for (const x of r.fallidos as Array<{ id: number; error: string }>) { falloIds.push(x.id); motivos.push(x); }
        const quedan = r.pendientes;
        setProgreso(p => (p ? { ...p, restan: quedan } : p));
        setGuardando(quedan > 0 ? 'Copiando los archivos a Azkell…' : 'Terminando…');
        if (r.pendientes === 0) break;
      }
      if (motivos.length) setFallosArchivos(motivos);
      haptic(fallidos ? 'warning' : 'success'); toast(fallidos ? `Archivos guardados; ${fallidos} no se pudieron bajar (el motivo está arriba)` : 'Archivos guardados');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'docs-marsisa'] });
    } catch (e) { setError(errorMessage(e)); haptic('warning'); }
    finally { setGuardando(null); setProgreso(null); }
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
      <header className="doc-cab doc-cab--una-linea">
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
          {q.data?.ultima_sincronizacion && <span className="t-footnote c-secondary doc-cab__sinc" title={`Última sincronización: ${q.data.ultima_sincronizacion}`}>Sinc. {q.data.ultima_sincronizacion.slice(5, 10).split('-').reverse().join('/')} {q.data.ultima_sincronizacion.slice(11)}</span>}
          {puedeSincronizar && (sinArchivosGuardados > 0 || guardando !== null) && (
            <div className="doc-guardar">
              <button type="button" className="doc-guardar__btn" disabled={sincronizando || guardando !== null} onClick={() => { void guardarArchivos(); }}
                aria-label={guardando !== null ? 'Guardando archivos' : `Guardar archivos (${sinArchivosGuardados})`}>
                {guardando !== null ? <span className="spinner" aria-hidden /> : <><FolderDown size={16} /><span className="t-numeric">{sinArchivosGuardados}</span></>}
              </button>
              <div className="doc-guardar__tip" role="status" aria-live="polite">
                {guardando !== null && progreso ? (
                  <>
                    <div className="doc-guardar__fila"><strong>Guardando archivos</strong><span className="t-numeric">{Math.max(0, progreso.total - progreso.restan)} de {progreso.total}</span></div>
                    <div className="doc-nube__barra"><i style={{ width: `${progreso.total ? Math.min(100, Math.round(((progreso.total - progreso.restan) / progreso.total) * 100)) : 0}%` }} /></div>
                    <small>{guardando}</small>
                    <button type="button" className="doc-nube__parar" onClick={() => { detener.current = true; setGuardando('Deteniendo…'); }}>Detener</button>
                  </>
                ) : <span>Guardar archivos: copia a Azkell los {sinArchivosGuardados} que aún solo están en la API, para que abran al instante</span>}
              </div>
            </div>
          )}
          {esAdmin && (
            <>
              <BotonTip tip={`Placas a mostrar: ${placasVisibles.size} de ${opcionesPlacas.length}`} className="btn btn--plain btn--icono btn--icono-acento" onClick={() => setConfigurando(true)}><Settings2 size={18} /></BotonTip>
              {placasVisibles.size !== opcionesPlacas.length && <span className="doc-conf__insignia" title="Hay un filtro de placas activo">{placasVisibles.size}/{opcionesPlacas.length}</span>}
            </>
          )}
          {puedeSincronizar && <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => { void sincronizar(); }} loading={sincronizando} disabled={guardando !== null}>Sincronizar</Button>}
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {fallosArchivos && fallosArchivos.length > 0 && (
        <Notice tone="error">
          {fallosArchivos.length} {fallosArchivos.length === 1 ? 'archivo no se pudo' : 'archivos no se pudieron'} bajar de la API:{' '}
          {fallosArchivos.slice(0, 6).map(f => { const d = todosLosDocs.find(x => x.id_remoto === f.id); return `${d ? `${d.placa} · ${d.tipo_nombre}` : `ID ${f.id}`} (${f.error})`; }).join(' — ')}
          {fallosArchivos.length > 6 ? ` — y ${fallosArchivos.length - 6} más` : ''}
        </Notice>
      )}
      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : q.data?.sinTabla ? (
        <Notice tone="error">Falta aplicar la actualización de la base de datos de esta empresa para usar este módulo.</Notice>
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Aún no hay documentos">
          {puedeSincronizar ? <>Configura el token en <strong>Sistema › Integraciones</strong> y pulsa <strong>Sincronizar</strong> para traer los documentos de la API.</> : 'Cuando se sincronicen, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div className="doc-pagina">
          <DocMetaVigentes vigentes={cifras.vigente} total={cifras.total} pct={pctDe.vigente} chips={(esAdmin
            ? ([['marsisa', 'Marsisa'], ['alquiladas', 'Alquiladas'], ['otras', 'Otras empresas'], ['fuera', 'Fuera de mi flota'], ['todas', 'Todas las de la API']] as const)
            : ([['marsisa', 'Marsisa']] as const)
          ).map(([v, etiqueta]) => ({ clave: v, etiqueta, n: conjuntos[v].size, activo: mismoConjunto(placasVisibles, conjuntos[v]),
            onClick: () => { if (!esAdmin) return; haptic('selection'); aplicarSeleccion(v === 'todas' ? null : conjuntos[v]); } }))}>
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

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={limpiarFiltros} resultado={filas.length} unidad="unidad">
            <GrupoFiltro titulo="Empresa">
              <ChoiceChips label="Empresa" value={empresaF} onChange={setEmpresaF} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Alquiler">
              <ChoiceChips label="Alquiler" value={alquilerF} onChange={v => setAlquilerF(v as FiltroAlquiler)} options={[
                { value: 'todas', label: 'Todas' }, { value: 'alquiladas', label: 'Alquiladas' }, { value: 'propias', label: 'No alquiladas' }, { value: 'externa', label: 'Las actualiza otra empresa' },
              ]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Tipo de documento">
              <Combobox options={tiposCatalogo} value={tipo || null} onChange={v => { setTipo(v ?? ''); if (!v && grupo === 'sin') setGrupo('todos'); }} enHoja compacta placeholder="Todos los tipos" tituloHoja="Tipo de documento" />
            </GrupoFiltro>
            <GrupoFiltro titulo={tipo ? 'Estado de ese documento' : 'Estado del documento'}>
              <ChoiceChips label="Estado del documento" value={grupo} onChange={v => setGrupo(v as Grupo)} options={[
                { value: 'todos', label: 'Todos' }, { value: 'vigente', label: 'Vigentes' }, { value: 'alerta', label: 'En alerta' }, { value: 'vencido', label: 'Vencidos' },
                ...(tipo ? [{ value: 'sin', label: 'Sin registrar' }] : []),
              ]} />
            </GrupoFiltro>
          </HojaFiltros>

          {vista === 'documento' ? (
            <PorDocumento unidades={unidadesBase} tipos={tiposCatalogo} onVerDocumentos={p => { setPlaca(p); setVista('expediente'); }} />
          ) : filas.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin unidades para los filtros">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); limpiarFiltros(); }}>Quitar filtros</button>
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
                        {u.alquiladaA && <span className="doc-unidad__alq" title={esDeMarsisa(u.empresa) ? `Alquilada a ${u.alquiladaA}` : `Nos la alquila ${u.empresa ?? 'otra empresa'}`}>ALQ.</span>}
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
                    {seleccion.empresa && <span className="doc-alquiler__chip">Empresa: {seleccion.empresa}</span>}
                    {seleccion.alquiladaA ? <span className="doc-alquiler__chip">{esDeMarsisa(seleccion.empresa) ? `Marsisa la alquila a ${seleccion.alquiladaA}` : `${seleccion.empresa ?? 'Otra empresa'} se la alquila a ${seleccion.alquiladaA}`}</span> : seleccion.enFlota ? <span className="doc-alquiler__chip">Unidad propia, sin alquiler</span> : <span className="doc-alquiler__chip doc-alquiler__chip--aviso">No está en mi flota</span>}
                  </div>
                </div>
                <div className="doc-tarjetas">
                  {seleccion.tipos.map((t, i) => <TarjetaDoc key={t.codigo} num={i + 1} tipo={t} abriendo={abriendo} onVer={d => { void verArchivo(d); }} />)}
                </div>
              </motion.section>
            </div>
          ) : vista === 'alquiler' ? (
            <Alquileres filas={filas} onVerDocumentos={p => { setPlaca(p); setVista('expediente'); }} />
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
      <ConfigurarPlacasSheet open={configurando} onClose={() => setConfigurando(false)} opciones={opcionesPlacas} seleccion={placasVisibles} onAplicar={aplicarSeleccion} />
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

type FiltroAlq = 'todas' | 'damos' | 'recibimos' | 'propias';
const COLUMNAS_ALQ: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Unidad', ancho: 140 },
  { id: 'tipo', titulo: 'Tipo', ancho: 130 },
  { id: 'situacion', titulo: 'Situación', ancho: 130, alinear: 'center' },
  { id: 'empresa', titulo: 'Empresa dueña', ancho: 190 },
  { id: 'alquilada', titulo: 'Alquilada a', ancho: 200 },
  { id: 'desde', titulo: 'Desde', ancho: 110 },
  { id: 'responsable', titulo: 'Documentos los actualiza', ancho: 200 },
  { id: 'docs', titulo: 'Documentos', ancho: 110, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 150, alinear: 'center' },
  { id: 'nota', titulo: 'Convenio', ancho: 240 },
  { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
];

/** Apartado de alquiler (solo consulta): qué unidades están alquiladas y cuáles no, a quién, desde cuándo y quién actualiza sus documentos.
 *  Los datos del alquiler son los de nuestra ficha de placas; los documentos, los de la API. */
function Alquileres({ filas, onVerDocumentos }: { filas: Unidad[]; onVerDocumentos: (placa: string) => void }) {
  const [filtro, setFiltro] = useState<FiltroAlq>('todas');
  // Relación de cada unidad con Marsisa: la da en alquiler, la recibe en alquiler o es propia (sin alquiler)
  const relacion = (u: Unidad): 'damos' | 'recibimos' | 'propia' | 'ajena' => damosEnAlquiler(u2d(u)) ? 'damos' : recibimosEnAlquiler(u2d(u)) ? 'recibimos' : esDeMarsisa(u.empresa) ? 'propia' : 'ajena';
  const cifras = useMemo(() => {
    const de = (r: string) => filas.filter(u => relacion(u) === r).length;
    return { total: filas.filter(u => relacion(u) !== 'ajena').length, damos: de('damos'), recibimos: de('recibimos'), propias: de('propia'), externa: filas.filter(u => u.alquiladaA && u.docsResponsable === 'ARRENDATARIA').length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas]);
  const orden: Record<string, number> = { damos: 0, recibimos: 1, propia: 2, ajena: 3 };
  const visibles = useMemo(() => filas.filter(u => filtro === 'todas' || relacion(u) === (filtro === 'propias' ? 'propia' : filtro))
    .sort((a, b) => orden[relacion(a)] - orden[relacion(b)] || a.placa.localeCompare(b.placa)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, filtro]);

  return (
    <div className="doc-alq">
      <div className="doc-alq__resumen">
        <div className="doc-alq__cifra"><strong>{cifras.total}</strong><span>Total de Marsisa</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.propias}</strong><span>Propias, sin alquiler</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.damos}</strong><span>Alquilamos a otras</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.recibimos}</strong><span>Nos alquilan</span></div>
        <div className="doc-alq__cifra"><strong>{cifras.externa}</strong><span>Las actualiza otra empresa</span></div>
        <SegmentedControl<FiltroAlq> label="Qué unidades ver" value={filtro} onChange={setFiltro}
          options={[{ value: 'todas', label: `Todas (${cifras.total})` }, { value: 'damos', label: `Alquilamos (${cifras.damos})` }, { value: 'recibimos', label: `Nos alquilan (${cifras.recibimos})` }, { value: 'propias', label: `Propias (${cifras.propias})` }]} />
      </div>
      {visibles.length === 0 ? (
        <EmptyState icon={<SearchX size={22} />} title="Ninguna unidad coincide">Prueba con otro filtro.</EmptyState>
      ) : (
        <TablaRedimensionable id="docs-marsisa-alquileres" columnas={COLUMNAS_ALQ} ariaLabel="Unidades alquiladas y propias" altoMax="calc(100dvh - 430px)">
          {visibles.map(u => {
            const alq = !!u.alquiladaA;
            const externo = alq && u.docsResponsable === 'ARRENDATARIA';
            return (
              <tr key={u.placa}>
                <Celda><LicensePlate plate={u.placa} size="sm" /></Celda>
                <Celda>{u.tipoUnidad || '—'}</Celda>
                <Celda alinear="center">{!u.enFlota ? <Badge tone="gray">Fuera de mi flota</Badge> : relacion(u) === 'damos' ? <Badge tone="accent">Alquilamos</Badge> : relacion(u) === 'recibimos' ? <Badge tone="amber">Nos alquilan</Badge> : <Badge>Propia</Badge>}</Celda>
                <Celda>{u.empresa || '—'}</Celda>
                <Celda>{alq ? <strong>{u.alquiladaA}</strong> : '—'}</Celda>
                <Celda>{alq && u.alquilerDesde ? formatFechaPe(u.alquilerDesde) : '—'}</Celda>
                <Celda>{alq ? (externo ? <Badge tone="amber">{relacion(u) === 'recibimos' ? 'Nosotros (arrendataria)' : u.alquiladaA}</Badge> : <Badge tone="green">{relacion(u) === 'recibimos' ? u.empresa : 'Nosotros'}</Badge>) : '—'}</Celda>
                <Celda mono alinear="right">{u.tipos.length}</Celda>
                <Celda alinear="center"><Badge tone={u.grupo === 'vencido' ? 'red' : u.grupo === 'alerta' ? 'amber' : 'green'}>{u.grupo === 'vencido' ? 'Vencidos' : u.grupo === 'alerta' ? 'Por vencer' : 'Vigentes'}</Badge></Celda>
                <Celda><span className="c-secondary">{alq && u.alquilerNota ? u.alquilerNota : '—'}</span></Celda>
                <Celda alinear="center">
                  <MenuFila etiqueta={`Acciones de ${u.placa}`} acciones={[{ label: 'Ver documentos', icon: <FileText size={17} />, onSelect: () => onVerDocumentos(u.placa) }]} />
                </Celda>
              </tr>
            );
          })}
        </TablaRedimensionable>
      )}
    </div>
  );
}

type ModoDoc = 'todas' | 'con' | 'faltan';
const fechaCorta = (v: string | null) => (v ? formatFechaPe(v) : '—');

/**
 * Por documento: eliges uno o varios tipos de documento y ves, unidad por unidad, qué tiene y qué le falta de ellos.
 * Con un solo tipo es la lista de placas que tienen (o no tienen) ese documento; con varios, quiénes los tienen todos y a quiénes les falta alguno.
 */
function PorDocumento({ unidades, tipos, onVerDocumentos }: { unidades: Unidad[]; tipos: Array<{ value: string; label: string }>; onVerDocumentos: (placa: string) => void }) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [modo, setModo] = useState<ModoDoc>('todas');
  const toast = useToast();

  const filas = useMemo(() => unidades.map(u => {
    const docs = elegidos.map(c => u.tipos.find(t => t.codigo === c)?.actual ?? null);
    return { u, docs, completos: docs.every(d => d !== null) };
  }), [unidades, elegidos]);
  const visibles = useMemo(() => filas.filter(f => modo === 'todas' || (modo === 'con' ? f.completos : !f.completos)), [filas, modo]);
  const conTodos = filas.filter(f => f.completos).length;
  const nombres = (c: string) => tipos.find(t => t.value === c)?.label ?? c;

  const columnas = useMemo<ColumnaTabla[]>(() => [
    { id: 'placa', titulo: 'Unidad', ancho: 150 },
    { id: 'empresa', titulo: 'Empresa dueña', ancho: 190 },
    ...elegidos.map(c => ({ id: c, titulo: nombres(c), ancho: 210, minimo: 150 })),
    { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' as const },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [elegidos, tipos]);

  const exportar = async () => {
    try {
      await exportarExcel('Documentos-por-tipo-API', 'Por documento',
        ['Unidad', 'Empresa dueña', ...elegidos.flatMap(c => [`${nombres(c)} · N°`, `${nombres(c)} · Vence`, `${nombres(c)} · Estado`])],
        visibles.map(f => [f.u.placa, f.u.empresa ?? '', ...f.docs.flatMap(d => (d ? [d.numero ?? '', d.fecha_vencimiento ?? '', textoEstado(d)] : ['', '', 'Falta']))]));
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div className="doc-alq">
      <div className="doc-alq__resumen">
        <Button variant="secondary" icon={<ListChecks size={16} />} onClick={() => setEligiendo(true)}>{elegidos.length ? `Documentos elegidos (${elegidos.length})` : 'Elegir documentos'}</Button>
        {elegidos.length > 0 && <span className="t-footnote c-secondary" style={{ flex: '1 1 12rem', minWidth: 0 }}>{elegidos.map(nombres).join(' · ')}</span>}
      </div>
      {elegidos.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Elige un documento">Marca uno o varios tipos de documento para ver qué unidades lo tienen y a cuáles les falta.</EmptyState>
      ) : (
        <>
          <div className="doc-alq__resumen">
            <div className="doc-alq__cifra"><strong>{conTodos}</strong><span>{elegidos.length === 1 ? 'Tienen el documento' : 'Tienen todos'}</span></div>
            <div className="doc-alq__cifra"><strong>{filas.length - conTodos}</strong><span>{elegidos.length === 1 ? 'No lo tienen' : 'Les falta alguno'}</span></div>
            <Button variant="secondary" size="sm" onClick={() => { void exportar(); }} disabled={!visibles.length}>Exportar a Excel</Button>
            <SegmentedControl<ModoDoc> label="Qué unidades ver" value={modo} onChange={setModo}
              options={[{ value: 'todas', label: `Todas (${filas.length})` }, { value: 'con', label: `${elegidos.length === 1 ? 'Con el documento' : 'Con todos'} (${conTodos})` }, { value: 'faltan', label: `${elegidos.length === 1 ? 'Sin el documento' : 'Les falta alguno'} (${filas.length - conTodos})` }]} />
          </div>
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ninguna unidad coincide">Prueba con otra opción.</EmptyState>
          ) : (
            <TablaRedimensionable id={`docs-marsisa-por-documento-${elegidos.length}`} columnas={columnas} ariaLabel="Unidades por documento" altoMax="calc(100dvh - 470px)">
              {visibles.map(({ u, docs }) => (
                <tr key={u.placa}>
                  <Celda><LicensePlate plate={u.placa} size="sm" />{u.alquiladaA && <span className="doc-unidad__alq" style={{ marginLeft: 6 }} title={`Alquilada a ${u.alquiladaA}`}>ALQ.</span>}</Celda>
                  <Celda>{u.empresa || '—'}</Celda>
                  {docs.map((d, i) => (
                    <Celda key={elegidos[i]}>
                      {d ? (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span><Badge tone={TONO[d.estado]}>{fechaCorta(d.fecha_vencimiento)}</Badge></span>
                          <small className="c-secondary">{d.numero || 'Sin número'} · {textoEstado(d)}</small>
                        </span>
                      ) : <Badge tone="red">Falta</Badge>}
                    </Celda>
                  ))}
                  <Celda alinear="center"><MenuFila etiqueta={`Acciones de ${u.placa}`} acciones={[{ label: 'Ver documentos', icon: <FileText size={17} />, onSelect: () => onVerDocumentos(u.placa) }]} /></Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </>
      )}
      <ElegirDocumentosSheet open={eligiendo} onClose={() => setEligiendo(false)} opciones={tipos} elegidos={elegidos} onAplicar={setElegidos} />
    </div>
  );
}

/** Lista para elegir uno o varios tipos de documento (con búsqueda y casillas en cada fila, como la de placas a mostrar) */
function ElegirDocumentosSheet({ open, onClose, opciones, elegidos, onAplicar }: {
  open: boolean; onClose: () => void; opciones: Array<{ value: string; label: string }>; elegidos: string[]; onAplicar: (v: string[]) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  useEffect(() => { if (open) { setMarcados(new Set(elegidos)); setQ(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? opciones.filter(o => o.label.toLowerCase().includes(t)) : opciones;
  }, [opciones, q]);
  const cambiar = (valores: string[], marcar: boolean) => setMarcados(prev => { const s = new Set(prev); valores.forEach(v => (marcar ? s.add(v) : s.delete(v))); return s; });

  return (
    <Sheet open={open} onClose={onClose} title="Documentos a revisar"
      footer={<>
        <Button variant="secondary" onClick={() => { haptic('selection'); onAplicar([]); onClose(); }}>Quitar todos</Button>
        <Button variant="primary" disabled={!marcados.size} onClick={() => { haptic('success'); onAplicar(opciones.filter(o => marcados.has(o.value)).map(o => o.value)); onClose(); }}>
          {marcados.size ? `Ver ${marcados.size} ${marcados.size === 1 ? 'documento' : 'documentos'}` : 'Elige al menos uno'}
        </Button>
      </>}>
      <div className="doc-conf">
        <input className="doc-conf__buscar" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar documento…" aria-label="Buscar documento" />
        <div className="doc-conf__acciones">
          <button type="button" onClick={() => cambiar(visibles.map(o => o.value), true)}>Marcar {q ? 'los visibles' : 'todos'}</button>
          <button type="button" onClick={() => cambiar(visibles.map(o => o.value), false)}>Quitar {q ? 'los visibles' : 'todos'}</button>
          <span>{marcados.size} de {opciones.length}</span>
        </div>
        <div className="doc-conf__lista" role="group" aria-label="Documentos">
          {visibles.map(o => (
            <label key={o.value} className="doc-conf__fila">
              <input type="checkbox" checked={marcados.has(o.value)} onChange={e => cambiar([o.value], e.target.checked)} />
              <span style={{ color: 'var(--label)', fontWeight: 600 }}>{o.label}</span>
            </label>
          ))}
          {!visibles.length && <p className="c-secondary" style={{ padding: 'var(--s-3)' }}>No hay documentos con ese texto.</p>}
        </div>
        <p className="c-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>Con un documento ves qué unidades lo tienen y cuáles no; con varios, quiénes los tienen todos y a quiénes les falta alguno.</p>
      </div>
    </Sheet>
  );
}
