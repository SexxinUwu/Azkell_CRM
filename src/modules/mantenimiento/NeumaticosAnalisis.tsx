import '../almacen/almacen.css';
import './mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronRight, Disc3, Download, Eye, FileSpreadsheet, Plus, RefreshCw, ScanSearch, Search, Trash2, Truck, Upload } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { DonaGrafico } from '../../core/ui/Graficos';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { VisorFotos, type FotoVisor } from '../../core/ui/VisorFotos';
import {
  EsquemaPlacaSheet, ImportarNeumaticosSheet, MedidaDetalleSheet, descargarPlantillaNeumaticos, exportarNeumaticos, type EstadoActual,
} from './NeumaticosExtras';
import { NeumaticosNuevaInspeccionSheet } from './NeumaticosNuevaInspeccionSheet';
import { MM_CRITICO, MM_PREVENTIVO, TINTA_TONO, tonoMm } from './neumaticosSemaforo';

// Análisis y Rendimiento de Neumáticos (clásico: modulos/mantenimiento/neumaticos-analisis).
// GET /api/neumaticos/analisis: todo se lee de la base de la empresa.
interface Resumen {
  total_inspecciones: number;
  vigentes: number;
  no_vigentes: number;
  sin_inspeccion: number;
  llantas_criticas: number;
  unidades_en_uso: number;
  total_llantas_rodando: number;
  total_llantas_flota: number | null;
}

interface UnidadAnalisis {
  id_inspeccion: string | null;
  placa: string;
  dueno: string | null;
  marca_unidad: string | null;
  tipo_unidad: string | null;
  fecha_inspeccion: string | null;
  km_vehiculo: number | null;
  fecha_proxima: string | null;
  dias_restantes: number | null;
  total_llantas: number;
  total_criticas: number;
}

export interface AnalisisNeumaticos {
  resumen: Resumen;
  marcas: Array<{ marca: string; cantidad: number }>;
  medidas: Array<{ medida: string; cantidad: number }>;
  inspecciones: UnidadAnalisis[];
}

export function useAnalisisNeumaticos() {
  return useQuery<AnalisisNeumaticos>({
    queryKey: ['mant', 'neumaticos-analisis'],
    queryFn: async () => {
      const r = await api<AnalisisNeumaticos & { ok?: boolean; error?: string }>('/neumaticos/analisis');
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar el análisis');
      return r;
    },
    staleTime: 60_000,
  });
}

const num = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-PE'));
const dia = (v: unknown) => (v ? String(v).split('T')[0] : '---');

const PERIODOS = [
  { v: 'todos', l: 'Todas las Unidades' },
  { v: 'vigentes', l: 'Solo Vigentes' },
  { v: 'vencidas', l: 'Solo No Vigentes (Vencidas)' },
  { v: 'sin_inspeccion', l: 'Solo Sin Inspección (Pendientes)' },
  { v: 'hoy', l: 'Hoy' },
  { v: 'semana', l: 'Esta Semana' },
  { v: 'mes_actual', l: 'Este Mes' },
  { v: 'mes_anterior', l: 'Mes Pasado' },
  { v: 'anio', l: 'Este Año' },
] as const;

const PALETA = ['#2563eb', '#0284c7', '#0d9488', '#ea580c', '#7c3aed', '#db2777', '#ca8a04', '#475569'];

/** Mismo filtro del clásico: texto (placa, dueño, ID) y período / vigencia */
function filtrarInspecciones(lista: UnidadAnalisis[], q: string, periodo: string): UnidadAnalisis[] {
  const query = q.toLowerCase().trim();
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const dSem = ahora.getDay() || 7;
  const inicioSemana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dSem + 1);
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const finMesAnt = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);
  const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
  return lista.filter(i => {
    if (query && !((i.placa || '').toLowerCase().includes(query) || (i.dueno || '').toLowerCase().includes(query) || (i.id_inspeccion || '').toLowerCase().includes(query))) return false;
    if (periodo === 'todos') return true;
    if (periodo === 'sin_inspeccion') return !i.fecha_inspeccion;
    if (periodo === 'vigentes') return !!i.fecha_inspeccion && (i.dias_restantes ?? -1) >= 0;
    if (periodo === 'vencidas') return !!i.fecha_inspeccion && (i.dias_restantes ?? 0) < 0;
    const p = dia(i.fecha_inspeccion).split('-');
    if (p.length < 3) return false;
    const f = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (periodo === 'hoy') return f >= inicioHoy;
    if (periodo === 'semana') return f >= inicioSemana;
    if (periodo === 'mes_actual') return f >= inicioMes;
    if (periodo === 'mes_anterior') return f >= inicioMesAnt && f <= finMesAnt;
    if (periodo === 'anio') return f >= inicioAnio;
    return true;
  });
}

function Kpi({ label, valor, sub, color, icono }: { label: string; valor: string; sub: string; color?: string; icono: React.ReactNode }) {
  return (
    <div className="inv-metrica">
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="inv-metrica__label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{label}</span>
        <span style={{ color: color ?? 'var(--label-2)', display: 'inline-flex' }}>{icono}</span>
      </span>
      <span className="inv-metrica__num" style={{ color }}>{valor}</span>
      <span className="inv-metrica__label">{sub}</span>
    </div>
  );
}

// ─── Visor interactivo por placa (GET /neumaticos/estado-actual/:placa) ───────

function VisorPlaca({ onInspeccionar, onEsquema }: { onInspeccionar: (placa: string) => void; onEsquema: (placa: string) => void }) {
  const [texto, setTexto] = useState('');
  const [placa, setPlaca] = useState('');
  const { data, isFetching, error } = useQuery<EstadoActual>({
    queryKey: ['mant', 'neumaticos-estado-actual', placa],
    enabled: !!placa,
    queryFn: async () => {
      const r = await api<EstadoActual>(`/neumaticos/estado-actual/${encodeURIComponent(placa)}`);
      if (r.ok === false) throw new Error(r.error ?? 'Error al obtener estado');
      return r;
    },
  });
  const consultar = () => { const p = texto.trim().toUpperCase(); if (p) setPlaca(p); };
  const u = data?.unidad;

  return (
    <div className="card" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} /> Visor Interactivo</h3>
        <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); consultar(); }}>
          <TextInput value={texto} onChange={e => setTexto(e.target.value.toUpperCase())} placeholder="PLACA..." aria-label="Placa a consultar"
            style={{ width: 130, minHeight: 44, textTransform: 'uppercase', fontWeight: 700 }} />
          <Button type="submit" variant="primary" icon={<Search size={15} />} style={{ minHeight: 44 }} aria-label="Consultar placa" />
        </form>
      </div>

      {!placa ? (
        <p className="t-footnote c-secondary" style={{ textAlign: 'center', padding: 'var(--s-4) 0', margin: 0 }}>
          <Truck size={28} style={{ opacity: 0.4, display: 'block', margin: '0 auto 6px' }} />
          Ingresa una placa para visualizar el mapa térmico de desgaste.
        </p>
      ) : isFetching ? <PageLoader /> : error ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : data && data.posiciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--s-3) 0' }}>
          <Badge>{data.placa}</Badge>
          <p className="t-footnote c-secondary">No se encontraron inspecciones de neumáticos registradas para esta placa.</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => onInspeccionar(data.placa)}>Crear Primera Inspección</Button>
        </div>
      ) : data && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: '0.8125rem', background: 'var(--fill)', borderRadius: 'var(--r-md, 12px)', padding: '8px 12px' }}>
            <span><b>{data.placa}</b> <span style={{ color: 'var(--label-2)' }}>{[u?.marca, u?.modelo_uts].filter(Boolean).join(' ')} ({u?.tipo || 'Unidad'})</span></span>
            <span style={{ color: 'var(--label-2)' }}>Última: <b>{dia(data.ultima_inspeccion?.fecha_inspeccion)}</b></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(8.5rem, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
            {data.posiciones.map(l => {
              const prom = Number(l.remanente_promedio ?? 0) || 0;
              const tono = tonoMm(prom);
              return (
                <div key={l.posicion} style={{ borderLeft: `5px solid ${TINTA_TONO[tono]}`, background: 'var(--surface)', boxShadow: 'inset 0 0 0 0.5px var(--separator)', borderRadius: 10, padding: 8, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
                    <Badge tone="ink">Pos {l.posicion}</Badge>
                    <span className="badge" style={{ background: TINTA_TONO[tono], color: '#fff' }}>{prom} mm</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.marca || '—'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.modelo || '—'} • {l.medida || '—'}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: 4, color: 'var(--blue-ink)' }}>{l.presion_actual || '0'} PSI</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={<ScanSearch size={14} />} onClick={() => onEsquema(data.placa)}>Ver esquema</Button>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => onInspeccionar(data.placa)}>Nueva Inspección para {data.placa}</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Detalle de una inspección (GET /neumaticos/inspecciones/:id) ─────────────

interface DetalleLlanta {
  id?: number; posicion?: string; marca?: string; modelo?: string; medida?: string; estado?: string;
  r1?: number | null; r2?: number | null; r3?: number | null; r4?: number | null; remanente_promedio?: number | string | null;
  presion_actual?: number | null; presion_ant?: number | null; observaciones?: string | null;
  foto1?: string | null; foto2?: string | null; foto3?: string | null;
}
interface RespDetalle {
  ok?: boolean; error?: string;
  data: { id_inspeccion: string; placa: string; fecha_inspeccion: string; km_vehiculo: number | null; inspector?: string | null; detalles: DetalleLlanta[] };
}

function InspeccionDetalleSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [fotos, setFotos] = useState<{ lista: FotoVisor[]; i: number } | null>(null);
  const { data, isLoading, error } = useQuery<RespDetalle>({
    queryKey: ['mant', 'neumaticos-detalle', id],
    enabled: id !== null,
    queryFn: async () => {
      const r = await api<RespDetalle>(`/neumaticos/inspecciones/${encodeURIComponent(id ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'Error cargando detalle');
      return r;
    },
  });
  const insp = data?.data;
  return (
    <>
      <Sheet open={id !== null} onClose={onClose} title={`Inspección ${id ?? ''}`}
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {isLoading ? <PageLoader /> : insp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
              <b style={{ color: 'var(--label-1)' }}>{insp.placa}</b> · {dia(insp.fecha_inspeccion)}
              {insp.km_vehiculo ? ` · ${num(insp.km_vehiculo)} km` : ''}{insp.inspector ? ` · ${insp.inspector}` : ''}
            </div>
            {insp.detalles.length === 0 ? (
              <EmptyState icon={<Disc3 size={22} />} title="Sin llantas">No se encontraron llantas registradas para esta inspección.</EmptyState>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="inv-kardex" style={{ minWidth: '52rem', fontSize: '0.8rem' }}>
                  <thead><tr>
                    <th style={{ width: 44, textAlign: 'center' }}>Pos</th>
                    <th>Marca / Medida</th>
                    <th style={{ textAlign: 'center', width: 44 }}>R1</th>
                    <th style={{ textAlign: 'center', width: 44 }}>R2</th>
                    <th style={{ textAlign: 'center', width: 44 }}>R3</th>
                    <th style={{ textAlign: 'center', width: 95 }}>PROM (MM)</th>
                    <th style={{ textAlign: 'center' }}>Presión</th>
                    <th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Fotos</th><th>Observaciones</th>
                  </tr></thead>
                  <tbody>
                    {insp.detalles.map((d, k) => {
                      const prom = Number(d.remanente_promedio ?? 0) || 0;
                      const tono = tonoMm(prom);
                      const lista = [d.foto1, d.foto2, d.foto3].filter((f): f is string => typeof f === 'string' && f.trim() !== '')
                        .map((url, n) => ({ url, titulo: `Pos ${d.posicion} · foto ${n + 1}` }));
                      return (
                        <tr key={(d.id ?? '') + String(d.posicion) + k}>
                          <td style={{ textAlign: 'center' }}><b>{String(d.posicion ?? '-').toUpperCase()}</b></td>
                          <td>
                            <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{(d.marca || '---').toUpperCase()}{d.modelo ? ` (${d.modelo.toUpperCase()})` : ''}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{(d.medida || '---').toUpperCase()} • {(d.estado || 'NUEVA').toUpperCase()}</div>
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.r1 ?? 0}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.r2 ?? 0}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.r3 ?? 0}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              background: tono === 'red' ? '#fee2e2' : tono === 'amber' ? '#fef3c7' : '#dcfce7',
                              color: tono === 'red' ? '#991b1b' : tono === 'amber' ? '#92400e' : '#166534',
                              border: `1px solid ${tono === 'red' ? '#fca5a5' : tono === 'amber' ? '#fde68a' : '#86efac'}`
                            }}>
                              {prom.toFixed(1)} mm
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {d.presion_actual ? <b>{d.presion_actual} PSI</b> : '---'}
                            {d.presion_ant ? <div style={{ fontSize: '0.7rem', color: 'var(--label-2)' }}>(Ant: {d.presion_ant})</div> : null}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Badge tone={tono === 'green' ? 'green' : tono === 'amber' ? 'amber' : 'red'}>
                              {prom < MM_CRITICO ? `Crítica (<${MM_CRITICO} mm)` : prom <= MM_PREVENTIVO ? `Alerta (${MM_CRITICO}-${MM_PREVENTIVO} mm)` : `Óptima (>${MM_PREVENTIVO} mm)`}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {lista.length === 0 ? '—' : lista.map((_f, n) => (
                              <Button key={n} variant="secondary" size="sm" icon={<Camera size={12} />} onClick={() => setFotos({ lista, i: n })}>
                                Ver {lista.length > 1 ? n + 1 : ''}
                              </Button>
                            ))}
                          </td>
                          <td style={{ color: 'var(--label-2)' }}>{d.observaciones || 'Ninguna'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <VisorFotos open={!!fotos} onClose={() => setFotos(null)} fotos={fotos?.lista ?? []} indiceInicial={fotos?.i ?? 0} titulo="Fotografía de neumático" />
    </>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export function NeumaticosAnalisisPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error, isFetching, refetch } = useAnalisisNeumaticos();

  const [medidaSel, setMedidaSel] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [nueva, setNueva] = useState<{ abierta: boolean; placa: string }>({ abierta: false, placa: '' });
  const [esquemaPlaca, setEsquemaPlaca] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const inspecciones = data?.inspecciones;
  const filtradas = useMemo(() => filtrarInspecciones(inspecciones ?? [], busqueda, periodo), [inspecciones, busqueda, periodo]);

  const abrirInspeccion = (placa = '') => setNueva({ abierta: true, placa });
  const exportar = () => exportarNeumaticos().catch(e => toast(errorMessage(e), 'error'));

  async function confirmarEliminar() {
    if (!eliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/neumaticos/inspecciones/${encodeURIComponent(eliminar)}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error ?? 'Error al eliminar la inspección');
      toast(`Inspección ${eliminar} eliminada`);
      setEliminar(null);
      await qc.invalidateQueries({ queryKey: ['mant'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setEliminando(false);
    }
  }

  // KPIs con las mismas cuentas del clásico
  const r = data?.resumen;
  const uso = Number(r?.unidades_en_uso ?? 0);
  const vig = Number(r?.vigentes ?? 0);
  const novig = Number(r?.no_vigentes ?? 0);
  let sinInsp = Number(r?.sin_inspeccion ?? 0);
  if (sinInsp < 0 || vig + novig + sinInsp !== uso) sinInsp = Math.max(0, uso - (vig + novig));
  const pVig = uso > 0 ? Math.round((vig / uso) * 100) : 0;
  const pNoVig = uso > 0 ? Math.round((novig / uso) * 100) : 0;
  const pSin = Math.max(0, 100 - pVig - pNoVig);
  const rodando = Number(r?.total_llantas_rodando ?? 0);
  const medidas = data?.medidas ?? [];

  return (
    <Page wide>
      <PageHeader
        eyebrow="Neumáticos"
        title="Análisis y Rendimiento de Neumáticos"
        subtitle="Monitoreo de desgaste, semáforo de vigencia por flota y control predictivo de recambio"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={<Upload size={15} />} onClick={() => setImportar(true)}>Importar Excel</Button>
            <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={exportar}>Exportar Excel</Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} loading={isFetching} onClick={() => { void refetch(); }}>Actualizar</Button>
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => abrirInspeccion()}>Nueva Inspección</Button>
            <MenuOtros opciones={[
              { label: 'Descargar plantilla', icon: <Download size={17} />, detalle: '27 columnas oficiales',
                onSelect: () => descargarPlantillaNeumaticos().catch(e => toast(errorMessage(e), 'error')) },
            ]} />
          </div>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10.5rem, 1fr))', gap: 'var(--s-3)' }}>
            <Kpi label="Insp. Totales" valor={num(Number(r?.total_inspecciones ?? 0))} sub="Historial general" icono={<FileSpreadsheet size={18} />} />
            <Kpi label="Unidades en Uso" valor={num(uso)} sub="Flota activa en uso" icono={<Truck size={18} />} />
            <Kpi label="Vigencia Flota" valor={num(vig)} color="var(--green-ink)" sub={`${vig} de ${uso} unidades al día (${pVig}%)`} icono={<Disc3 size={18} />} />
            <Kpi label="Llantas Alerta" valor={num(Number(r?.llantas_criticas ?? 0))} color="var(--red-ink)" sub={`< ${MM_CRITICO} mm remanente`} icono={<Disc3 size={18} />} />
            <Kpi label="Insp. Vencidas" valor={num(novig)} color="var(--amber-ink)" sub="Placas con fecha superada" icono={<Disc3 size={18} />} />
          </div>

          {/* Vigencia, medidas y visor */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))', gap: 'var(--s-3)', alignItems: 'stretch' }}>
            <div className="card" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700 }}>Estado de Vigencia</h3>
                <Badge>Global</Badge>
              </div>
              <DonaGrafico altura={150} centro={String(uso)} porciones={[
                { nombre: `Vigentes (${pVig}%)`, valor: vig, color: 'var(--green-ink)' },
                { nombre: `Vencidas (${pNoVig}%)`, valor: novig, color: 'var(--red-ink)' },
                { nombre: `Pendientes (${pSin}%)`, valor: sinInsp, color: 'var(--label-3)' },
              ]} />
            </div>

            <div className="card" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Disc3 size={16} /> Llantas por Medida</h3>
                <span className="badge" style={{ fontSize: '0.8rem' }}>
                  {num(rodando)} de {num(r?.total_llantas_flota ?? 0)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {medidas.length === 0 ? (
                  <p className="t-footnote c-secondary" style={{ textAlign: 'center', margin: 'var(--s-3) 0' }}>Sin datos de llantas en inspecciones activas.</p>
                ) : medidas.map((m, idx) => {
                  const cnt = Number(m.cantidad || 0);
                  const porc = rodando > 0 ? Math.round((cnt / rodando) * 100) : 0;
                  const color = PALETA[idx % PALETA.length];
                  return (
                    <div key={m.medida} role="button" tabIndex={0} title={`Clic para ver unidades con llantas ${m.medida}`}
                      onClick={() => setMedidaSel(m.medida)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMedidaSel(m.medida); } }}
                      style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 10, background: 'var(--fill)', minHeight: 44 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                          <i style={{ width: 8, height: 8, borderRadius: 999, background: color }} />{m.medida}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                          <b>{cnt} {cnt === 1 ? 'llanta' : 'llantas'}</b>
                          <span style={{ color: 'var(--label-2)', minWidth: 30, textAlign: 'right', fontWeight: 700 }}>{porc}%</span>
                          <ChevronRight size={12} style={{ color: 'var(--label-3)' }} />
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'var(--separator)' }}>
                        <div style={{ width: `${porc}%`, height: '100%', borderRadius: 999, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--label-2)', borderTop: '1px solid var(--separator)', paddingTop: 8, marginTop: 'auto' }}>
                <span>Última inspección activa</span>
                <b style={{ color: 'var(--label-1)' }}>{medidas.length} {medidas.length === 1 ? 'medida activa' : 'medidas activas'}</b>
              </div>
            </div>

            <VisorPlaca onInspeccionar={abrirInspeccion} onEsquema={setEsquemaPlaca} />
          </div>

          {/* Historial de inspecciones */}
          <div className="card card--flush">
            <div style={{ padding: 'var(--s-3) var(--s-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--separator)' }}>
              <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                Historial de Inspecciones de Neumáticos <Badge tone="accent">{filtradas.length}</Badge>
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <SelectInput value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Filtrar por período" style={{ minHeight: 44, width: 'auto', minWidth: 180 }}>
                  {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                </SelectInput>
                <div style={{ minWidth: 200 }}><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por placa, dueño..." /></div>
                <Button variant="secondary" icon={<FileSpreadsheet size={15} />} onClick={exportar} style={{ minHeight: 44 }}>Exportar</Button>
              </div>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 480 }}>
              <table className="inv-kardex" style={{ minWidth: '60rem', fontSize: '0.8rem' }}>
                <thead><tr>
                  <th>ID Inspección</th><th>Fecha</th><th>Placa</th><th>Dueño / Cliente</th><th>KM Tablero</th>
                  <th style={{ textAlign: 'center' }}>Llantas</th><th style={{ textAlign: 'center' }}>Críticas</th>
                  <th style={{ textAlign: 'center' }}>Próx. Insp</th><th style={{ textAlign: 'center' }}>Vigencia</th><th style={{ textAlign: 'center' }}>Acciones</th>
                </tr></thead>
                <tbody>
                  {filtradas.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--label-2)', padding: 24 }}>No se encontraron inspecciones o vehículos en el filtro seleccionado.</td></tr>
                  ) : filtradas.map(i => {
                    const dias = i.dias_restantes !== null && i.dias_restantes !== undefined ? Number(i.dias_restantes) : null;
                    const sin = !i.fecha_inspeccion;
                    return (
                      <tr key={i.placa + (i.id_inspeccion ?? '')}>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-ink)' }}>{i.id_inspeccion || <Badge>SIN REGISTRO</Badge>}</td>
                        <td>{dia(i.fecha_inspeccion)}</td>
                        <td>
                          <button type="button" className="badge badge--ink" style={{ cursor: 'pointer', border: 0, fontFamily: 'var(--font-mono)', minHeight: 28 }}
                            title={`Registrar inspección de ${i.placa}`} onClick={() => abrirInspeccion(i.placa)}>{i.placa}</button>
                        </td>
                        <td style={{ color: 'var(--label-2)' }}>{i.dueno || '---'}</td>
                        <td>{i.km_vehiculo ? `${num(i.km_vehiculo)} KM` : '---'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{i.total_llantas || 0}</td>
                        <td style={{ textAlign: 'center' }}>{i.total_criticas > 0 ? <Badge tone="red">{i.total_criticas}</Badge> : <Badge>0</Badge>}</td>
                        <td style={{ textAlign: 'center' }}>{dia(i.fecha_proxima)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {sin ? <Badge>Sin Inspección</Badge>
                            : dias !== null && dias > 5 ? <Badge tone="green">Vigente (+{dias}d)</Badge>
                            : dias !== null && dias >= 0 ? <Badge tone="amber">Por Vencer ({dias}d)</Badge>
                            : <Badge tone="red">Vencida ({dias ?? 0}d)</Badge>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {sin ? (
                            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => abrirInspeccion(i.placa)}>Inspeccionar</Button>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Button variant="secondary" size="sm" icon={<Eye size={13} />} onClick={() => setDetalleId(i.id_inspeccion)}>Ver</Button>
                              <MenuOtros soloIcono label="Más opciones" opciones={[
                                { label: 'Ver Detalle', icon: <Eye size={17} />, onSelect: () => setDetalleId(i.id_inspeccion) },
                                { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => setEliminar(i.id_inspeccion) },
                              ]} />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <MedidaDetalleSheet medida={medidaSel} onClose={() => setMedidaSel(null)} />
      <NeumaticosNuevaInspeccionSheet open={nueva.abierta} placaInicial={nueva.placa} onClose={() => setNueva({ abierta: false, placa: '' })} />
      <EsquemaPlacaSheet open={esquemaPlaca !== null} placaInicial={esquemaPlaca ?? ''} onClose={() => setEsquemaPlaca(null)} />
      <ImportarNeumaticosSheet open={importar} onClose={() => setImportar(false)} />
      <InspeccionDetalleSheet id={detalleId} onClose={() => setDetalleId(null)} />
      <ConfirmSheet open={eliminar !== null} onClose={() => setEliminar(null)} onConfirm={confirmarEliminar} loading={eliminando}
        title="¿Eliminar inspección de neumáticos?" confirmLabel="Sí, eliminar"
        message={`Se eliminará permanentemente la inspección ${eliminar ?? ''} y todos sus registros de llantas y presiones.`} />
    </Page>
  );
}
