import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CircleAlert, Clock, Eye, FileText, FolderDown, RefreshCw, SearchX, SlidersHorizontal, Wrench } from 'lucide-react';
import '../flota/flota.css';
import '../mantenimiento/mant.css';
import '../flota/disponibilidad.css';
import '../flota/documentos.css';
import { Button, PageLoader } from '../../core/ui/Button';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { Badge, EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { DocMetaVigentes } from '../flota/DocMetaVigentes';
import { repartirPorcentajes } from '../flota/docsEstado';

// Operaciones Marsisa › Documentos de flota (API externa): copia de solo consulta de los documentos que entrega la API de Marsisa,
// en su propia tabla (no se mezcla con los documentos propios de la flota). Se actualiza con «Sincronizar».

interface DocExterno {
  id: number; id_remoto: number; placa: string; unidad_activa: boolean; tipo_codigo: string; tipo_nombre: string; numero: string | null; emisor: string | null;
  fecha_emision: string | null; fecha_vencimiento: string | null; tiene_archivo: boolean; archivo_guardado: boolean; sincronizado_en: string;
  estado: 'vigente' | 'por_vencer' | 'vencido' | 'sin_vencimiento'; dias: number | null;
}
interface RespuestaLista { ok: boolean; data: DocExterno[]; ultima_sincronizacion: string | null; sinTabla?: boolean }

type Grupo = 'todos' | 'vigente' | 'por_vencer' | 'vencido' | 'sin_archivo';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Unidad', ancho: 130 },
  { id: 'tipo', titulo: 'Documento', ancho: 260, minimo: 160 },
  { id: 'numero', titulo: 'Número', ancho: 240, minimo: 120 },
  { id: 'emision', titulo: 'Emisión', ancho: 110 },
  { id: 'vence', titulo: 'Vencimiento', ancho: 120 },
  { id: 'estado', titulo: 'Estado', ancho: 190 },
  { id: 'archivo', titulo: 'Archivo', ancho: 120, alinear: 'center' },
];

const TONO: Record<DocExterno['estado'], 'green' | 'amber' | 'red' | 'gray'> = { vigente: 'green', por_vencer: 'amber', vencido: 'red', sin_vencimiento: 'gray' };
const textoEstado = (d: DocExterno) => {
  if (d.estado === 'sin_vencimiento' || d.dias == null) return 'Sin vencimiento';
  if (d.estado === 'vencido') return `Venció hace ${-d.dias} ${-d.dias === 1 ? 'día' : 'días'}`;
  return d.dias === 0 ? 'Vence hoy' : `Faltan ${d.dias} ${d.dias === 1 ? 'día' : 'días'}`;
};

export function DocsMarsisaPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const puedeSincronizar = can('docs_flota.crear', 'docs_flota.editar');
  const q = useQuery<RespuestaLista>({
    queryKey: ['operaciones', 'docs-marsisa'], staleTime: 30_000,
    queryFn: () => api<RespuestaLista>('/operaciones/docs-marsisa'),
  });
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('todos');
  const [filtrando, setFiltrando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const docs = useMemo(() => q.data?.data ?? [], [q.data]);
  const tipos = useMemo(() => {
    const m = new Map<string, string>();
    docs.forEach(d => m.set(d.tipo_codigo, d.tipo_nombre));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label }));
  }, [docs]);

  // Las tarjetas reaccionan a la búsqueda y al tipo; el estado no las recorta (ellas son ese estado)
  const base = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return docs.filter(d => (!tipo || d.tipo_codigo === tipo) && (!t || [d.placa, d.tipo_nombre, d.numero].some(x => String(x ?? '').toUpperCase().includes(t))));
  }, [docs, busqueda, tipo]);
  const cifras = useMemo(() => ({
    total: base.length,
    vigente: base.filter(d => d.estado === 'vigente' || d.estado === 'sin_vencimiento').length,
    por_vencer: base.filter(d => d.estado === 'por_vencer').length,
    vencido: base.filter(d => d.estado === 'vencido').length,
    sin_archivo: base.filter(d => !d.tiene_archivo).length,
  }), [base]);
  const filas = useMemo(() => base.filter(d => {
    if (grupo === 'todos') return true;
    if (grupo === 'sin_archivo') return !d.tiene_archivo;
    if (grupo === 'vigente') return d.estado === 'vigente' || d.estado === 'sin_vencimiento';
    return d.estado === grupo;
  }), [base, grupo]);
  const pcts = repartirPorcentajes([cifras.vigente, cifras.por_vencer, cifras.vencido], cifras.total);
  const unidades = useMemo(() => new Set(base.map(d => d.placa)).size, [base]);

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

  /** Baja y guarda los archivos que faltan, por tandas, hasta que no quede ninguno (o ya no avance) */
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
    { clave: 'todos', label: 'Documentos', valor: cifras.total, tono: 'blue', icono: <Briefcase size={18} strokeWidth={1.9} /> },
    { clave: 'vigente', label: 'Vigentes', valor: cifras.vigente, tono: 'green', icono: <Clock size={18} strokeWidth={1.9} /> },
    { clave: 'por_vencer', label: 'Por vencer', valor: cifras.por_vencer, tono: 'amber', icono: <Wrench size={18} strokeWidth={1.9} /> },
    { clave: 'vencido', label: 'Vencidos', valor: cifras.vencido, tono: 'red', icono: <CircleAlert size={18} strokeWidth={1.9} /> },
    { clave: 'sin_archivo', label: 'Sin archivo', valor: cifras.sin_archivo, tono: 'ink', icono: <FileText size={18} strokeWidth={1.9} /> },
  ];
  const pctDe = (k: Grupo) => (k === 'todos' ? (cifras.total ? 100 : 0) : k === 'vigente' ? pcts[0] : k === 'por_vencer' ? pcts[1] : k === 'vencido' ? pcts[2] : (cifras.total ? Math.round((cifras.sin_archivo / cifras.total) * 100) : 0));
  const sinArchivosGuardados = docs.filter(d => d.tiene_archivo && !d.archivo_guardado).length;
  const filtrosActivos = (tipo ? 1 : 0) + (grupo !== 'todos' ? 1 : 0);

  return (
    <Page wide fill>
      <header className="doc-cab">
        <div className="doc-cab__titulo">
          <span className="t-eyebrow">Operaciones Marsisa</span>
          <h1 className="doc-cab__h1">Documentos de flota (API)</h1>
        </div>
        <div className="doc-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar placa, documento o número…" /></div>
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={filtrosActivos ? `Filtros, ${filtrosActivos} activos` : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>
          {filtrosActivos > 0 && <span className="placas-filtros__n t-numeric">{filtrosActivos}</span>}
        </Button>
        <div className="doc-cab__acciones">
          {q.data?.ultima_sincronizacion && <span className="t-footnote c-secondary">Última sincronización: {q.data.ultima_sincronizacion}</span>}
          {puedeSincronizar && sinArchivosGuardados > 0 && (
            <Button variant="secondary" icon={<FolderDown size={16} />} onClick={() => { void guardarArchivos(); }} loading={guardando !== null} disabled={sincronizando}>
              {guardando ?? `Guardar archivos (${sinArchivosGuardados})`}
            </Button>
          )}
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
          <DocMetaVigentes vigentes={cifras.vigente} total={cifras.total} pct={pcts[0]} chips={[
            { clave: 'docs', etiqueta: 'Documentos', n: cifras.total, activo: false, onClick: () => undefined },
            { clave: 'unidades', etiqueta: 'Unidades', n: unidades, activo: false, onClick: () => undefined },
            { clave: 'tipos', etiqueta: 'Tipos', n: new Set(base.map(d => d.tipo_codigo)).size, activo: false, onClick: () => undefined },
          ]}>
            {kpis.map(k => (
              <button key={k.clave} type="button" className={`doc-tile pressable disp-kpi--${k.tono}`} aria-pressed={grupo === k.clave}
                onClick={() => { haptic('selection'); setGrupo(g => (g === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                <span className="doc-tile__icono" aria-hidden>{k.icono}</span>
                <span className="doc-tile__txt">
                  <span className="doc-tile__k">{k.label}</span>
                  <span className="doc-tile__v"><AnimatedNumber value={k.valor} className="t-numeric" /><small>{pctDe(k.clave)}%</small></span>
                </span>
              </button>
            ))}
          </DocMetaVigentes>

          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={() => { setTipo(''); setGrupo('todos'); }} resultado={filas.length} unidad="documento">
            <GrupoFiltro titulo="Tipo de documento">
              <Combobox options={tipos} value={tipo || null} onChange={v => setTipo(v ?? '')} enHoja compacta placeholder="Todos los tipos" tituloHoja="Tipo de documento" />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado">
              <ChoiceChips label="Estado" value={grupo} onChange={v => setGrupo(v as Grupo)} options={[
                { value: 'todos', label: 'Todos' }, { value: 'vigente', label: 'Vigentes' }, { value: 'por_vencer', label: 'Por vencer' }, { value: 'vencido', label: 'Vencidos' }, { value: 'sin_archivo', label: 'Sin archivo' },
              ]} />
            </GrupoFiltro>
          </HojaFiltros>

          {filas.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin documentos para los filtros">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setTipo(''); setGrupo('todos'); }}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <TablaRedimensionable id="docs-marsisa-api" ariaLabel="Documentos de flota de la API" altoMax="62vh" columnas={COLUMNAS}>
              {filas.map(d => (
                <tr key={d.id}>
                  <Celda><LicensePlate plate={d.placa} size="sm" /></Celda>
                  <Celda>{d.tipo_nombre}</Celda>
                  <Celda mono>{d.numero || '—'}</Celda>
                  <Celda mono>{d.fecha_emision ? formatFechaPe(d.fecha_emision) : '—'}</Celda>
                  <Celda mono>{d.fecha_vencimiento ? formatFechaPe(d.fecha_vencimiento) : '—'}</Celda>
                  <Celda><Badge tone={TONO[d.estado]}>{textoEstado(d)}</Badge></Celda>
                  <Celda alinear="center">
                    {d.tiene_archivo
                      ? <Button variant="plain" size="sm" icon={<Eye size={14} />} loading={abriendo === d.id} onClick={() => { void verArchivo(d); }}>Ver</Button>
                      : <span className="c-secondary">—</span>}
                  </Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </div>
      )}
    </Page>
  );
}
