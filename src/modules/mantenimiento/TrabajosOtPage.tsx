import './mant.css';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Pencil, SearchX, Trash2, Users, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { HorasEficienciaGrafico } from '../../core/ui/Graficos';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel, exportarExcelHojas } from '../../core/lib/excel';
import { formatFechaHoraPe, formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { oracion } from '../../core/lib/texto';
import { usePersonalCanonico } from './personalCanonico';
import { ImportarTrabajosSheet } from './ImportarTrabajosSheet';
import {
  aObjeto, editarTrabajo, eliminarTrabajo, ESTADOS_TRABAJO, estadoTrabajo, regularizarTecnicos, trabajoCosto, trabajoId, trabajoKmHoras,
  useHorasTecnicos, useTecnicosDisponibles, useTrabajosOT, useUltimoDiaTrabajos, type HorasTecnicosRespuesta, type TrabajoOT,
} from './api';

const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '—');
const aLocal = (s: string | null | undefined) => (s ? String(s).replace('Z', '').replace(' ', 'T').slice(0, 16) : '');
const tonoEstado = (e: string | null | undefined) => {
  const est = estadoTrabajo(e);
  if (est === 'Realizado') return 'accent';
  if (est === 'En Proceso') return 'blue';
  return 'amber';
};

function personalDe(t: TrabajoOT): string[] {
  let p = t.tecnico ?? '';
  const d = aObjeto(t.detalles_json);
  if (d.personal) p = String(d.personal);
  return p.split(',').map(x => x.trim()).filter(Boolean);
}

/** Horas de un trabajo para la lista (mismo criterio que services/horas_tecnicos.js); null si está en curso */
function horasTrabajo(t: TrabajoOT): number | null {
  const ini = aLocal(t.fecha_trabajo), fin = aLocal(t.fecha_salida);
  if (!ini || !fin) return null;
  const h = (new Date(fin).getTime() - new Date(ini).getTime()) / 3_600_000;
  return h >= 0 ? Math.round(h * 100) / 100 : null;
}

/** Hoy como "AAAA-MM-DD" (hora local) */
function hoyIso() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

/** Personas de un trabajo: `tecnico` viene separado por coma */
function personasDe(valor: string | null | undefined): string[] {
  return String(valor ?? '').split(',').map(x => x.trim()).filter(Boolean);
}

/** Mes en curso como rango "AAAA-MM-DD" (del día 1 al último) */
function rangoMesActual() {
  const hoy = new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return { desde: `${y}-${p2(m + 1)}-01`, hasta: `${y}-${p2(m + 1)}-${p2(new Date(y, m + 1, 0).getDate())}` };
}

/** "06/10" — día y mes para las columnas de la matriz */
const diaCorto = (fecha: string) => formatFechaPe(fecha).slice(0, 5);

export function TrabajosOtPage() {
  // La lista trae solo el día de hoy por defecto: toda la tabla de trabajos satura la base y la pantalla
  const [rangoLista, setRangoLista] = useState(() => ({ desde: hoyIso(), hasta: hoyIso() }));
  const { data, isLoading, isError, error } = useTrabajosOT(rangoLista.desde, rangoLista.hasta);
  const [regularizando, setRegularizando] = useState<TrabajoOT[] | null>(null);
  const { can } = useAuth();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [vista, setVista] = useState<'trabajos' | 'horas'>('trabajos');
  const [rango, setRango] = useState(rangoMesActual);
  const horas = useHorasTecnicos(rango.desde, rango.hasta, vista === 'horas');

  const trabajos = data ?? [];
  const canon = usePersonalCanonico();
  const ultimoDia = useUltimoDiaTrabajos(trabajos.length === 0).data?.fecha ?? null;
  const seleccionado = trabajos.find(t => trabajoId(t) === seleccionadoId) ?? null;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return trabajos.filter(t =>
      (!q || trabajoId(t).toUpperCase().includes(q) || (t.placa ?? '').toUpperCase().includes(q) ||
        personalDe(t).join(' ').toUpperCase().includes(q) || (t.trabajo_realizado ?? '').toUpperCase().includes(q) ||
        (t.ticket_visita ?? '').toUpperCase().includes(q)));
  }, [trabajos, busqueda]);

  async function exportar() {
    try {
      await exportarExcel('Trabajos-OT', 'Trabajos',
        ['Trabajo', 'OT', 'Placa', 'Estado', 'Trabajo realizado', 'Personal', 'Inicio', 'Salida', 'Costo', 'Creado por'],
        visibles.map(t => [trabajoId(t), t.ticket_visita, t.placa, estadoTrabajo(t.estado), oracion(t.trabajo_realizado), personalDe(t).map(canon).join(', '),
          dia(t.fecha_trabajo), dia(t.fecha_salida), trabajoCosto(t), canon(t.creado_por)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  // Mismos datos que la versión clásica: el servidor calcula horas y eficiencia
  async function exportarHoras() {
    const h = horas.data;
    if (!h) return;
    try {
      await exportarExcelHojas('Horas-tecnicos-OT', [
        {
          hoja: 'Historial',
          encabezados: ['Trabajo', 'OT', 'Placa', 'Técnico', 'Creado por', 'Inicio', 'Salida', 'Horas', 'Estado', 'Trabajo realizado'],
          filas: h.trabajos.map(t => [trabajoId(t), t.ticket_visita, t.placa, t.tecnico || 'Sin técnico', t.creado_por || '',
            formatFechaHoraPe(t.fecha_trabajo), formatFechaHoraPe(t.fecha_salida), t.horas ?? 'En curso', estadoTrabajo(t.estado), t.trabajo_realizado]),
        },
        {
          hoja: 'Horas por técnico',
          encabezados: ['Técnico', ...h.dias.map(d => diaCorto(d.fecha)), 'Horas reales', 'Horas proyectadas', 'Eficiencia %', 'En curso'],
          filas: h.tecnicos.map(t => [t.nombre, ...h.dias.map(d => t.porDia[d.fecha] ?? ''), t.reales, t.proyectadas, t.eficiencia, t.enCurso]),
        },
      ]);
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      {!seleccionado && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Trabajos de OT"
          subtitle={isLoading ? 'Cargando…' : `${trabajos.length} trabajos registrados`}
          actions={
            <MenuOtros opciones={[
              vista === 'trabajos'
                ? { label: 'Exportar Excel', detalle: `${visibles.length} trabajos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar }
                : { label: 'Exportar Excel', detalle: 'Historial y horas por técnico', icon: <FileSpreadsheet size={17} />, onSelect: exportarHoras },
              { label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) },
            ]} />
          }
        />
      )}
      <ImportarTrabajosSheet open={importando} onClose={() => setImportando(false)} />
      <RegularizarTecnicosSheet open={regularizando !== null} onClose={() => setRegularizando(null)}
        trabajos={regularizando ?? []} desde={rango.desde} hasta={rango.hasta} />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionado ? (
        <TrabajoDetalle
          trabajo={seleccionado}
          puedeEditar={can('trabajos_ot.editar')}
          puedeEliminar={can('trabajos_ot.eliminar')}
          onVolver={() => setSeleccionadoId(null)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SegmentedControl block label="Vista" value={vista} onChange={setVista} options={[
            { value: 'trabajos', label: 'Trabajos' },
            { value: 'horas', label: 'Horas por técnico' },
          ]} />
          {vista === 'horas' ? (
            <HorasTecnicosVista rango={rango} onRango={setRango} datos={horas.data} cargando={horas.isLoading} error={horas.error} onRegularizar={setRegularizando} />
          ) : (<>
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Desde">{p => <TextInput {...p} type="date" value={rangoLista.desde} max={rangoLista.hasta || undefined} onChange={e => setRangoLista(r => ({ ...r, desde: e.target.value }))} />}</Field>
            <Field label="Hasta">{p => <TextInput {...p} type="date" value={rangoLista.hasta} min={rangoLista.desde || undefined} onChange={e => setRangoLista(r => ({ ...r, hasta: e.target.value }))} />}</Field>
            <Button variant="plain" onClick={() => setRangoLista({ desde: hoyIso(), hasta: hoyIso() })}>Hoy</Button>
            <Button variant="plain" onClick={() => setRangoLista({ desde: '', hasta: '' })}>Todas las fechas</Button>
          </div>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, técnico, trabajo, OT o ticket…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title={trabajos.length === 0 ? 'Sin trabajos en este rango' : 'Sin coincidencias'}>
              {trabajos.length === 0 && ultimoDia && (
                <Button variant="secondary" onClick={() => setRangoLista({ desde: ultimoDia, hasta: ultimoDia })}>
                  Ver el último día con trabajos ({formatFechaPe(ultimoDia)})
                </Button>
              )}
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <div className="ot-tabla-caja">
              <table className="ot-tabla">
                <thead>
                  <tr>
                    <th>ID trabajo</th><th>N° OT</th><th>Placa</th><th>Km / Horas</th><th>F/H inicio</th>
                    <th>Trabajo realizado</th><th>Personal</th><th>Creado por</th><th>F/H salida</th><th>Costo</th><th>Tiempo (hrs)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(t => {
                    const id = trabajoId(t);
                    const costo = trabajoCosto(t);
                    const horas = horasTrabajo(t);
                    return (
                      <tr key={id || String(t.id)} tabIndex={0} className="pressable"
                        onClick={() => { haptic('selection'); setSeleccionadoId(id); }}
                        onKeyDown={e => { if (e.key === 'Enter') setSeleccionadoId(id); }}>
                        <td className="ot-tabla__id">{id}</td>
                        <td>{t.ot_id || t.ticket_visita || '—'}</td>
                        <td><span className="ot-fila__placa">{t.placa || '—'}</span></td>
                        <td>{trabajoKmHoras(t)}</td>
                        <td>{formatFechaHoraPe(aLocal(t.fecha_trabajo))}</td>
                        <td className="ot-tabla__trabajo">{oracion(t.trabajo_realizado) || '—'}</td>
                        <td>{personalDe(t).map(canon).join(', ') || '—'}</td>
                        <td>{canon(t.creado_por) || '—'}</td>
                        <td>{formatFechaHoraPe(aLocal(t.fecha_salida))}</td>
                        <td>{costo > 0 ? formatSoles(costo) : '—'}</td>
                        <td>{horas == null ? '—' : `${horas.toFixed(1)} h`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </>)}
        </div>
      )}
    </Page>
  );
}

/** Registra técnicos fila por fila: cada trabajo sin técnico con su propio selector de personal. */
function RegularizarTecnicosSheet({ open, onClose, trabajos, desde, hasta }: {
  open: boolean; onClose: () => void; trabajos: TrabajoOT[]; desde: string; hasta: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const personalQ = useTecnicosDisponibles();
  const [asignados, setAsignados] = useState<Record<string, string[]>>({});
  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAsignados({}); setBusqueda(''); setError(null);
  }, [open]);

  const opciones = personalQ.data ?? [];
  const q = busqueda.trim().toUpperCase();
  const visibles = trabajos.filter(t => !q || trabajoId(t).toUpperCase().includes(q) ||
    (t.placa ?? '').toUpperCase().includes(q) || (t.trabajo_realizado ?? '').toUpperCase().includes(q));
  const listos = trabajos.filter(t => (asignados[trabajoId(t)] ?? []).length > 0);

  async function guardar() {
    const items = listos.map(t => ({ id: trabajoId(t), tecnicos: asignados[trabajoId(t)] }));
    if (!items.length) { setError('Elige al menos un técnico en algún trabajo.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await regularizarTecnicos(items);
      haptic('success'); toast(`Técnicos registrados en ${r.actualizados} trabajo(s)`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['mant', 'horas-tecnicos'] }),
        qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] }),
      ]);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Regularizar técnicos"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando} disabled={!listos.length}>
          Guardar técnicos ({listos.length})
        </Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <p className="field field--wide" style={{ margin: 0, color: 'var(--label-2)', fontSize: '0.8125rem' }}>
          Trabajos sin técnico del {formatFechaPe(desde)} al {formatFechaPe(hasta)}. Elige quién hizo cada uno; los que dejes vacíos no cambian. Solo se registra el técnico.
        </p>
        {trabajos.length > 6 && (
          <div className="field field--wide">
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por placa, trabajo u OT…" />
          </div>
        )}
        <div className="field field--wide" style={{ display: 'flex', flexDirection: 'column' }}>
          {visibles.map(t => {
            const id = trabajoId(t);
            return (
              <div key={id} style={{ padding: 'var(--s-3) 0', borderBottom: '1px solid var(--separator)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', alignItems: 'baseline', fontSize: '0.8125rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{id}</span>
                  <span style={{ fontWeight: 700 }}>{t.placa || '—'}</span>
                  <span style={{ color: 'var(--label-2)' }}>{formatFechaHoraPe(aLocal(t.fecha_trabajo))}</span>
                  <span style={{ flexBasis: '100%', color: 'var(--label-1)' }}>{oracion(t.trabajo_realizado) || '—'}</span>
                </div>
                <MultiSelect label={`Técnicos · ${id}`} options={opciones} value={asignados[id] ?? []}
                  onChange={v => setAsignados(a => ({ ...a, [id]: v }))} placeholder="Sin asignar" />
              </div>
            );
          })}
          {visibles.length === 0 && <span style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>Ningún trabajo coincide con la búsqueda.</span>}
        </div>
        {!opciones.length && personalQ.isSuccess && (
          <p className="field field--wide" style={{ margin: 0, color: 'var(--label-2)', fontSize: '0.8125rem' }}>
            Todavía no hay personal registrado en el taller.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function HorasTecnicosVista({ rango, onRango, datos, cargando, error, onRegularizar }: {
  rango: { desde: string; hasta: string }; onRango: (r: { desde: string; hasta: string }) => void;
  datos: HorasTecnicosRespuesta | undefined; cargando: boolean; error: unknown;
  onRegularizar: (lista: TrabajoOT[]) => void;
}) {
  const rangoInvalido = rango.hasta < rango.desde;
  const sinTecnico = datos ? datos.trabajos.filter(t => personasDe(t.tecnico).length === 0) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--s-3)' }}>
        <Field label="Desde">{p => <TextInput {...p} type="date" value={rango.desde} max={rango.hasta} onChange={e => onRango({ ...rango, desde: e.target.value })} />}</Field>
        <Field label="Hasta">{p => <TextInput {...p} type="date" value={rango.hasta} min={rango.desde} onChange={e => onRango({ ...rango, hasta: e.target.value })} />}</Field>
      </div>
      {rangoInvalido ? (
        <Notice tone="error">La fecha final es anterior a la inicial.</Notice>
      ) : cargando ? <PageLoader /> : error ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : datos && (
        <>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Badge tone="amber">{datos.resumen.enCurso} trabajos en curso / sin cierre</Badge>
            {sinTecnico.length > 0 && (
              <Button variant="secondary" icon={<Users size={16} />} onClick={() => onRegularizar(sinTecnico)}>
                Regularizar técnicos ({sinTecnico.length})
              </Button>
            )}
            {datos.resumen.sinTecnico > 0 && <Badge>{datos.resumen.sinTecnico} sin técnico asignado</Badge>}
            <Badge>{datos.diasLaborables} días laborables · {datos.proyectadasPorTecnico} h proyectadas por técnico</Badge>
          </div>
          {datos.tecnicos.length === 0 ? (
            <EmptyState icon={<Wrench size={22} />} title="Sin horas en el rango">
              No hay trabajos con técnico y fecha de inicio entre estas fechas.
            </EmptyState>
          ) : (
            <>
              <div>
                <p className="tarjeta__grupo-titulo">Horas reales y eficiencia por técnico</p>
                <HorasEficienciaGrafico tecnicos={datos.tecnicos} proyectadas={datos.proyectadasPorTecnico} />
              </div>
              <div>
                <p className="tarjeta__grupo-titulo">Horas por día</p>
                <HorasMatriz datos={datos} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function HorasMatriz({ datos }: { datos: HorasTecnicosRespuesta }) {
  const celda: CSSProperties = { padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', borderBottom: '1px solid var(--separator)' };
  const cabecera: CSSProperties = { ...celda, fontFamily: 'inherit', fontWeight: 600, fontSize: '0.6875rem', color: 'var(--label-2)' };
  const totalReales = datos.tecnicos.reduce((s, t) => s + t.reales, 0);
  const totalProyectadas = datos.tecnicos.length * datos.proyectadasPorTecnico;
  const totalEnCurso = datos.tecnicos.reduce((s, t) => s + t.enCurso, 0);
  const totalDia = (fecha: string) => datos.tecnicos.reduce((s, t) => s + (t.porDia[fecha] ?? 0), 0);
  return (
    <div style={{ overflowX: 'auto', background: 'var(--surface)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...cabecera, textAlign: 'left' }}>Técnico</th>
            {datos.dias.map(d => (
              <th key={d.fecha} title={formatFechaPe(d.fecha)} style={{ ...cabecera, opacity: d.laborable ? 1 : 0.45 }}>{diaCorto(d.fecha)}</th>
            ))}
            <th style={cabecera}>Reales</th>
            <th style={cabecera}>Proyectadas</th>
            <th style={cabecera}>Eficiencia</th>
            <th style={cabecera}>En curso</th>
          </tr>
        </thead>
        <tbody>
          {datos.tecnicos.map(t => (
            <tr key={t.nombre}>
              <td style={{ ...celda, textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 }}>{t.nombre}</td>
              {datos.dias.map(d => (
                <td key={d.fecha} style={{ ...celda, opacity: d.laborable ? 1 : 0.45 }}>{t.porDia[d.fecha] ? t.porDia[d.fecha].toFixed(1) : ''}</td>
              ))}
              <td style={{ ...celda, fontWeight: 700 }}>{t.reales.toFixed(1)}</td>
              <td style={celda}>{t.proyectadas}</td>
              <td style={celda}>{t.eficiencia.toFixed(1)} %</td>
              <td style={celda}>{t.enCurso || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th style={{ ...cabecera, textAlign: 'left' }}>Total</th>
            {datos.dias.map(d => {
              const s = totalDia(d.fecha);
              return <td key={d.fecha} style={{ ...celda, fontWeight: 700, opacity: d.laborable ? 1 : 0.45 }}>{s ? s.toFixed(1) : ''}</td>;
            })}
            <td style={{ ...celda, fontWeight: 700 }}>{totalReales.toFixed(1)}</td>
            <td style={celda}>{totalProyectadas}</td>
            <td style={{ ...celda, fontWeight: 700 }}>{totalProyectadas ? ((totalReales / totalProyectadas) * 100).toFixed(1) : '0.0'} %</td>
            <td style={celda}>{totalEnCurso || '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TrabajoDetalle({ trabajo: t, puedeEditar, puedeEliminar, onVolver }: {
  trabajo: TrabajoOT; puedeEditar: boolean; puedeEliminar: boolean; onVolver: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const id = trabajoId(t);
  const kmh = trabajoKmHoras(t);
  const costo = trabajoCosto(t);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });

  async function eliminar() {
    setOcupado(true);
    try {
      await eliminarTrabajo(id);
      haptic('success'); toast('Trabajo eliminado'); setBorrando(false); onVolver(); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const canon = usePersonalCanonico();
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Trabajos
        </button>
        <div className="tarjeta__barra-acciones">
          {(puedeEditar || puedeEliminar) && (
            <MenuOtros opciones={[
              puedeEditar && { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setEditando(true) },
              puedeEliminar && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: () => setBorrando(true) },
            ]} />
          )}
        </div>
      </div>

      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${tonoEstado(t.estado)}`}>{estadoTrabajo(t.estado)}</span>
        <h2 className="ot-ficha__placa">{t.placa || '—'}</h2>
        <span className="ot-ficha__id">{id}{t.ticket_visita ? ` · OT ${t.ticket_visita}` : ''}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Trabajo</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Trabajo realizado</span><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{oracion(t.trabajo_realizado) || '—'}</span></div>
          <div className="dato"><span className="dato__label">Personal</span><span className="dato__valor">{personalDe(t).map(canon).join(', ') || '—'}</span></div>
          {kmh !== '—' && <div className="dato"><span className="dato__label">Km / Horas</span><span className="dato__valor dato__valor--mono">{kmh}</span></div>}
          {costo > 0 && <div className="dato"><span className="dato__label">Costo</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {costo.toFixed(2)}</span></div>}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Fechas</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Inicio</span><span className="dato__valor dato__valor--mono">{aLocal(t.fecha_trabajo).replace('T', ' ') || '—'}</span></div>
          <div className="dato"><span className="dato__label">Salida</span><span className="dato__valor dato__valor--mono">{aLocal(t.fecha_salida).replace('T', ' ') || '—'}</span></div>
          {t.creado_por && <div className="dato"><span className="dato__label">Registrado por</span><span className="dato__valor">{canon(t.creado_por)}</span></div>}
        </div>
      </div>

      <EditarTrabajoSheet trabajo={t} open={editando} onClose={() => setEditando(false)} />

      <ConfirmSheet
        open={borrando}
        onClose={() => !ocupado && setBorrando(false)}
        onConfirm={eliminar}
        loading={ocupado}
        title={`¿Eliminar ${id}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function usePersonalTaller() {
  return useQuery({
    queryKey: ['mant', 'taller-personal'],
    queryFn: () => api<unknown>('/taller-personal').then(r => {
      const arr = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? []);
      return (arr as Record<string, unknown>[])
        .map(p => String(p.nombre ?? p.nombres ?? p.nombre_completo ?? '').trim()).filter(Boolean);
    }),
    staleTime: 5 * 60_000,
  });
}

function EditarTrabajoSheet({ trabajo: t, open, onClose }: { trabajo: TrabajoOT; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const personalQ = usePersonalTaller();
  const [desc, setDesc] = useState('');
  const [personal, setPersonal] = useState<string[]>([]);
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [costo, setCosto] = useState('');
  const [estado, setEstado] = useState('Pendiente');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDesc(t.trabajo_realizado ?? ''); setPersonal(personalDe(t));
    setIni(aLocal(t.fecha_trabajo)); setFin(aLocal(t.fecha_salida));
    setCosto(trabajoCosto(t) ? String(trabajoCosto(t)) : ''); setEstado(estadoTrabajo(t.estado)); setError(null);
  }, [open, t]);

  const opcionesPersonal = useMemo(() => [...new Set([...(personalQ.data ?? []), ...personal])].sort((a, b) => a.localeCompare(b, 'es')), [personalQ.data, personal]);

  async function guardar() {
    if (!desc.trim()) { setError('Describe el trabajo realizado.'); return; }
    if (ini && fin && fin < ini) { setError('La salida es anterior al inicio.'); return; }
    setEnviando(true); setError(null);
    try {
      await editarTrabajo(trabajoId(t), {
        trabajo_realizado: desc.trim(), fecha_trabajo: ini || null, fecha_salida: fin || null,
        personal: personal.join(', '), costo: parseFloat(costo.replace(',', '.')) || 0, estado,
      });
      haptic('success'); toast('Trabajo actualizado');
      await qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Editar ${trabajoId(t)}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Trabajo realizado" wide>{p => <TextInput {...p} value={desc} onChange={e => setDesc(e.target.value)} />}</Field>
        <div className="field field--wide">
          <MultiSelect label="Personal" options={opcionesPersonal} value={personal} onChange={setPersonal} placeholder="Sin asignar" />
        </div>
        <Field label="Inicio">{p => <TextInput {...p} type="datetime-local" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
        <Field label="Salida">{p => <TextInput {...p} type="datetime-local" value={fin} min={ini || undefined} onChange={e => setFin(e.target.value)} />}</Field>
        <Field label="Costo (S/)">{p => <TextInput {...p} inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} />}</Field>
        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS_TRABAJO.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
