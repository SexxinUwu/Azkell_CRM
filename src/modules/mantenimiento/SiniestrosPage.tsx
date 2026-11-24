import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, Camera, FileDown, FileUp, Plus, RefreshCw, Settings2, TriangleAlert, Trash2 } from 'lucide-react';
import { FileSpreadsheet, Pencil } from '../../core/ui/IconosArchivo';
import '../../core/ui/acciones-iconos.css';
import './incidencias.css';
import './siniestros.css';
import { PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { ESTADOS_SINIESTRO, eliminarSiniestro, hoyIso, inicioAnioIso, num, useCatalogoSiniestros, useSiniestros, type Siniestro } from './siniestrosApi';
import { SiniestroSheet } from './SiniestroSheet';
import { ImportarSiniestrosSheet } from './ImportarSiniestrosSheet';
import { MotivosSiniestroSheet } from './MotivosSiniestroSheet';

// Mantenimiento › Otros › Siniestros y daños: el registro de cada siniestro de la flota (qué pasó, a qué unidad,
// cuánto costó y cuántas horas estuvo en taller). Se carga a mano o importando el Excel de control. Los gráficos están en «Análisis de siniestros».

const TONO_ESTADO: Record<string, 'green' | 'amber' | 'red'> = { Concluido: 'green', 'En Reparación': 'amber', 'Pendiente Repuestos': 'red' };
const horaCorta = (v: string | null) => (v ? `${formatFechaPe(v.slice(0, 10))} ${v.slice(11, 16)}` : '—');

const COLUMNAS: ColumnaTabla[] = [
  { id: 'codigo', titulo: 'ID', ancho: 96 },
  { id: 'fecha', titulo: 'Fecha', ancho: 108 },
  { id: 'placa', titulo: 'Placa', ancho: 124 },
  { id: 'marca', titulo: 'Marca', ancho: 100 },
  { id: 'conductor', titulo: 'Conductor', ancho: 170 },
  { id: 'ubicacion', titulo: 'Ubicación', ancho: 200 },
  { id: 'tipo', titulo: 'Tipo de incidencia', ancho: 240 },
  { id: 'detalle', titulo: 'Detalle de daños / causa', ancho: 300 },
  { id: 'tecnico', titulo: 'Técnico', ancho: 190 },
  { id: 'inicio', titulo: 'Inicio', ancho: 140 },
  { id: 'fin', titulo: 'Fin', ancho: 140 },
  { id: 'horas', titulo: 'Horas', ancho: 76, alinear: 'right' },
  { id: 'repuestos', titulo: 'Repuestos', ancho: 112, alinear: 'right' },
  { id: 'mano', titulo: 'Mano de obra', ancho: 112, alinear: 'right' },
  { id: 'total', titulo: 'Total', ancho: 120, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 156, alinear: 'center' },
  { id: 'acciones', titulo: 'Acciones', ancho: 96, alinear: 'center' },
];

export function SiniestrosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const puedeCrear = can('siniestros.crear');
  const puedeEditar = can('siniestros.editar');
  const puedeEliminar = can('siniestros.eliminar');

  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState(inicioAnioIso);
  const [hasta, setHasta] = useState(hoyIso);
  const [tipo, setTipo] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ siniestro: Siniestro | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [motivos, setMotivos] = useState(false);
  const [aEliminar, setAEliminar] = useState<Siniestro | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const filtro = useMemo(() => ({ desde, hasta, tipo: tipo ?? undefined, estado: estado ?? undefined, q: texto.trim() || undefined }), [desde, hasta, tipo, estado, texto]);
  const lista = useSiniestros(filtro);
  const catalogo = useCatalogoSiniestros();
  const items = lista.data ?? [];

  const totales = useMemo(() => items.reduce((t, s) => ({
    costo: t.costo + num(s.costo_total), horas: t.horas + num(s.horas_taller), repuestos: t.repuestos + num(s.costo_repuestos), pendientes: t.pendientes + (s.estado === 'Concluido' ? 0 : 1),
  }), { costo: 0, horas: 0, repuestos: 0, pendientes: 0 }), [items]);

  const hayFiltros = !!(texto.trim() || tipo || estado);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });

  async function confirmarEliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const r = await eliminarSiniestro(aEliminar.id);
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Siniestro eliminado'); setAEliminar(null); await refrescar();
    } catch (err) { haptic('warning'); toast(errorMessage(err), 'error'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Siniestros', 'Registro de Siniestros',
        ['ID', 'Fecha', 'Placa', 'Marca', 'Nombre del Conductor', 'Ubicación del Evento', 'Tipo de Incidencia', 'Detalle de Daños / Causa', 'Técnico Responsable',
          'Fecha Inicio', 'Hora Inicio', 'Fecha Fin', 'Hora Fin', 'Tiempo Trabajo (Hrs)', 'Costo Repuestos (S/.)', 'Costo Mano Obra (S/.)', 'Costo Total (S/.)', 'Estado'],
        items.map(s => [s.codigo, s.fecha, s.placa, s.marca ?? '', s.conductor ?? '', s.ubicacion ?? '', s.tipo_incidencia, s.detalle ?? '', s.tecnico ?? '',
          s.inicio?.slice(0, 10) ?? '', s.inicio?.slice(11, 16) ?? '', s.fin?.slice(0, 10) ?? '', s.fin?.slice(11, 16) ?? '',
          num(s.horas_taller), num(s.costo_repuestos), num(s.costo_mano_obra), num(s.costo_total), s.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const acciones: ReactNode = (
    <AccionesCabecera etiqueta="Acciones de siniestros" acciones={[
      puedeCrear && { label: 'Registrar siniestro', icon: <Plus size={18} />, tono: 'verde', onClick: () => setFormulario({ siniestro: null }) },
      puedeCrear && { label: 'Configurar motivos', icon: <Settings2 size={18} />, tono: 'ambar', onClick: () => setMotivos(true) },
      puedeCrear && { label: 'Importar desde Excel', icon: <FileUp size={18} />, tono: 'violeta', onClick: () => setImportando(true) },
      { label: 'Exportar Excel', icon: <FileSpreadsheet size={18} />, tono: 'verde', onClick: exportar },
      { label: 'Descargar plantilla', icon: <FileDown size={18} />, tono: 'azul', onClick: async () => { (await import('./ImportarSiniestrosSheet')).descargarPlantillaSiniestros(); } },
      { label: 'Ver análisis y gráficos', icon: <BarChart3 size={18} />, tono: 'ambar', onClick: () => navigate('/mantenimiento/siniestros-analisis') },
      { label: 'Actualizar', icon: <RefreshCw size={18} />, onClick: () => { void lista.refetch(); } },
    ]} />
  );

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Siniestros y daños" subtitle={lista.isLoading ? 'Cargando…' : `${items.length} registros`} actions={acciones} />

      <div className="inc-matriz">
        <div className="inc-kpi-grilla">
          <div className="inc-kpi inc-kpi--accent"><span className="inc-kpi__valor t-numeric">{items.length}</span><span className="inc-kpi__etiqueta">Siniestros</span></div>
          <div className="inc-kpi inc-kpi--amber"><span className="inc-kpi__valor t-numeric">{formatSoles(totales.costo)}</span><span className="inc-kpi__etiqueta">Costo total</span></div>
          <div className="inc-kpi inc-kpi--blue"><span className="inc-kpi__valor t-numeric">{Math.round(totales.horas * 10) / 10} h</span><span className="inc-kpi__etiqueta">Horas en taller</span></div>
          <div className="inc-kpi inc-kpi--red"><span className="inc-kpi__valor t-numeric">{totales.pendientes}</span><span className="inc-kpi__etiqueta">Sin concluir</span></div>
        </div>

        <div className="sin-filtros">
          <SearchField value={texto} onChange={setTexto} placeholder="Placa, conductor, ubicación, detalle…" />
          <span className="sin-fechas">
            <TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
            <span className="t-footnote c-secondary" aria-hidden>→</span>
            <TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
          </span>
          <Combobox options={(catalogo.data?.tipos ?? []).map(t => ({ value: t, label: t }))} value={tipo} onChange={setTipo} placeholder="Todos los tipos" limit={50} />
          <Combobox options={ESTADOS_SINIESTRO.map(e => ({ value: e, label: e }))} value={estado} onChange={setEstado} placeholder="Todos los estados" />
        </div>
        {(desde !== inicioAnioIso() || hasta !== hoyIso()) && (
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            <button type="button" className="inc-quitar" onClick={() => { setDesde(''); setHasta(''); }}>Ver todos</button> · <button type="button" className="inc-quitar" onClick={() => { setDesde(inicioAnioIso()); setHasta(hoyIso()); }}>Volver a este año</button>
          </p>
        )}

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : items.length === 0 ? (
          <EmptyState icon={<TriangleAlert size={22} />} title="Sin siniestros">
            {hayFiltros ? 'Prueba con otros filtros.' : puedeCrear ? <>Registra el primero con <strong>Registrar siniestro</strong> o importa tu Excel de control.</> : 'No hay siniestros registrados en estas fechas.'}
          </EmptyState>
        ) : (
          <div className={`inc-tabla${lista.isFetching ? ' is-cargando' : ''}`}>
            <TablaRedimensionable id="siniestros" ariaLabel="Siniestros y daños" altoMax="64vh" columnas={COLUMNAS}>
              {items.map(s => (
                <tr key={s.id}>
                  <Celda mono>{s.codigo}{(s.n_fotos ?? 0) > 0 && <span className="sin-fotos__n" title={`${s.n_fotos} foto(s) de los daños`}><Camera size={12} aria-hidden /> {s.n_fotos}</span>}</Celda>
                  <Celda mono>{formatFechaPe(s.fecha)}</Celda>
                  <Celda><LicensePlate plate={s.placa} size="sm" /></Celda>
                  <Celda>{s.marca || '—'}</Celda>
                  <Celda>{s.conductor || '—'}</Celda>
                  <Celda>{s.ubicacion || '—'}</Celda>
                  <Celda>{s.tipo_incidencia}</Celda>
                  <Celda>{s.detalle || '—'}</Celda>
                  <Celda>{s.tecnico || '—'}</Celda>
                  <Celda mono>{horaCorta(s.inicio)}</Celda>
                  <Celda mono>{horaCorta(s.fin)}</Celda>
                  <Celda mono alinear="right">{num(s.horas_taller) ? num(s.horas_taller).toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—'}</Celda>
                  <Celda mono alinear="right">{formatSoles(num(s.costo_repuestos))}</Celda>
                  <Celda mono alinear="right">{formatSoles(num(s.costo_mano_obra))}</Celda>
                  <Celda mono alinear="right"><strong>{formatSoles(num(s.costo_total))}</strong></Celda>
                  <Celda alinear="center"><Badge tone={TONO_ESTADO[s.estado] ?? 'gray'}>{s.estado}</Badge></Celda>
                  <Celda alinear="center">
                    <div className="inc-acciones-fila">
                      {puedeEditar && <button type="button" className="inc-icono" title="Editar" aria-label="Editar siniestro" onClick={() => { haptic('selection'); setFormulario({ siniestro: s }); }}><Pencil size={15} /></button>}
                      {puedeEliminar && <button type="button" className="inc-icono inc-icono--peligro" title="Eliminar" aria-label="Eliminar siniestro" onClick={() => { haptic('selection'); setAEliminar(s); }}><Trash2 size={15} /></button>}
                    </div>
                  </Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          </div>
        )}
      </div>

      <SiniestroSheet abierto={formulario !== null} siniestro={formulario?.siniestro ?? null} catalogo={catalogo.data} onClose={() => setFormulario(null)} />
      <MotivosSiniestroSheet open={motivos} onClose={() => setMotivos(false)} puedeAgregar={puedeCrear} puedeEliminar={puedeEliminar} />
      <ImportarSiniestrosSheet open={importando} onClose={() => setImportando(false)} catalogo={catalogo.data} alTerminar={refrescar} />
      <ConfirmSheet open={aEliminar !== null} onClose={() => setAEliminar(null)} onConfirm={confirmarEliminar} loading={eliminando} confirmLabel="Eliminar"
        title="Eliminar siniestro" message={aEliminar ? `Se eliminará el siniestro ${aEliminar.codigo} de ${aEliminar.placa} del ${formatFechaPe(aEliminar.fecha)}. No se puede deshacer.` : ''} />
    </Page>
  );
}
