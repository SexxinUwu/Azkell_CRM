import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileDown, FileUp, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import '../../core/ui/acciones-iconos.css';
import './incidencias.css';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import {
  cambiarSolucionIncidencia,
  eliminarIncidencia,
  useCatalogoIncidencias,
  useListaIncidencias,
  type FiltrosIncidencias,
  type IncidenciaRuta,
} from './api';
import { IncidenciaSheet } from './IncidenciaSheet';
import { ImportarIncidenciasSheet, descargarPlantillaIncidencias } from './ImportarIncidenciasSheet';
import { IncidenciasGraficas } from './IncidenciasGraficas';

// Incidencias en ruta (Mantenimiento). Calca de la versión actual (modulos/mantenimiento/incidencias-ruta):
// tarjetas de totales que filtran, filtros, tabla ordenable por columna, cambio rápido de estado,
// alta y edición, borrado, importación desde Excel, plantilla y la pestaña de gráficas.

type Vista = 'matriz' | 'graficas';
type Kpi = 'todas' | 'pendientes' | 'atendidas' | 'costo';
type FiltrosTabla = Omit<FiltrosIncidencias, 'limit'>;

interface ColumnaIncidencia extends ColumnaTabla {
  /** Campo por el que ordena el servidor; si no hay, la columna no se ordena */
  orden?: string;
}

const LIMITE = 50;
const FILTROS_INICIALES: FiltrosTabla = {
  page: 1, search: '', mes: 'ALL', placa: 'ALL', area: 'ALL', solucionado: 'ALL', sortField: 'fecha_falla', sortDir: 'DESC',
};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const AREAS = ['Mantenimiento', 'Flota', 'Operaciones'];
const TONO_AREA: Record<string, 'accent' | 'ink' | 'amber'> = { Mantenimiento: 'accent', Flota: 'ink', Operaciones: 'amber' };
// Campos que arrancan ordenados de mayor a menor (fecha, costo, id); el resto de A a Z
const ORDEN_DESCENDENTE = ['fecha_falla', 'total_costo', 'id'];

const COLUMNAS: ColumnaIncidencia[] = [
  { id: 'fecha', titulo: 'Fecha', ancho: 112, orden: 'fecha_falla' },
  { id: 'placa', titulo: 'Placa', ancho: 124, orden: 'placa' },
  { id: 'conductor', titulo: 'Conductor', ancho: 180, orden: 'conductor' },
  { id: 'marca', titulo: 'Marca', ancho: 110, orden: 'marca' },
  { id: 'ubicacion', titulo: 'Ubicación', ancho: 200, orden: 'ubicacion' },
  { id: 'tipo', titulo: 'Unidad / tipo', ancho: 130, orden: 'tipo_unidad' },
  { id: 'transbordo', titulo: 'Transbordo', ancho: 116, alinear: 'center', orden: 'transbordo' },
  { id: 'motivo', titulo: 'Motivo', ancho: 240, orden: 'motivo' },
  { id: 'falla', titulo: 'Falla', ancho: 320, orden: 'falla' },
  { id: 'area', titulo: 'Área resp.', ancho: 144, orden: 'area_responsable' },
  { id: 'responsable', titulo: 'Responsable', ancho: 160, orden: 'responsable' },
  { id: 'desglose', titulo: 'Desglose de costos', ancho: 220 },
  { id: 'total', titulo: 'Total costo', ancho: 130, alinear: 'right', orden: 'total_costo' },
  { id: 'solucion', titulo: 'Solución', ancho: 132, alinear: 'center', orden: 'solucionado' },
  { id: 'observaciones', titulo: 'Observaciones', ancho: 220 },
  { id: 'acciones', titulo: 'Acciones', ancho: 96, alinear: 'center' },
];

export function IncidenciasPage() {
  const qc = useQueryClient();
  const avisar = useToast();
  const { can } = useAuth();
  const puedeCrear = can('incidencias_ruta.crear');
  const puedeEditar = can('incidencias_ruta.editar');
  const puedeEliminar = can('incidencias_ruta.eliminar');

  const [vista, setVista] = useState<Vista>('matriz');
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState<FiltrosTabla>(FILTROS_INICIALES);
  const [formulario, setFormulario] = useState<{ incidencia: IncidenciaRuta | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [aEliminar, setAEliminar] = useState<IncidenciaRuta | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const lista = useListaIncidencias({ ...filtros, limit: LIMITE });
  const catalogo = useCatalogoIncidencias();

  // La búsqueda espera una pausa de 300 ms antes de consultar, como en el clásico
  useEffect(() => {
    const t = setTimeout(() => {
      const buscado = texto.trim();
      setFiltros(f => (f.search === buscado ? f : { ...f, search: buscado, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const items = lista.data?.data ?? [];
  const kpis = lista.data?.kpis;
  const total = lista.data?.total ?? 0;
  const totalPaginas = lista.data?.totalPages ?? 1;
  const pagina = filtros.page;
  const filtrosActivos = texto.trim() !== '' || filtros.mes !== 'ALL' || filtros.placa !== 'ALL' || filtros.area !== 'ALL' || filtros.solucionado !== 'ALL';

  const kpiActivo: Kpi = filtros.sortField === 'total_costo' ? 'costo'
    : filtros.solucionado === 'Pendiente' ? 'pendientes'
    : filtros.solucionado === 'Atendido' ? 'atendidas'
    : 'todas';

  function cambiar(cambios: Partial<FiltrosTabla>) {
    setFiltros(f => ({ ...f, page: 1, ...cambios }));
  }

  function ordenar(campo: string) {
    haptic('selection');
    setFiltros(f => {
      const sortDir: 'ASC' | 'DESC' = f.sortField !== campo
        ? (ORDEN_DESCENDENTE.includes(campo) ? 'DESC' : 'ASC')
        : (f.sortDir === 'ASC' ? 'DESC' : 'ASC');
      return { ...f, sortField: campo, sortDir, page: 1 };
    });
  }

  function filtrarPorKpi(k: Kpi) {
    haptic('selection');
    if (k === 'todas') cambiar({ solucionado: 'ALL', sortField: 'fecha_falla', sortDir: 'DESC' });
    if (k === 'pendientes') cambiar({ solucionado: 'Pendiente' });
    if (k === 'atendidas') cambiar({ solucionado: 'Atendido' });
    if (k === 'costo') cambiar({ solucionado: 'ALL', sortField: 'total_costo', sortDir: 'DESC' });
  }

  function limpiarFiltros() {
    haptic('selection');
    setTexto('');
    setFiltros(FILTROS_INICIALES);
  }

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['mant', 'incidencias'] });
  }

  async function alternarSolucion(inc: IncidenciaRuta) {
    haptic('selection');
    try {
      await cambiarSolucionIncidencia(inc.id);
      haptic('success');
      refrescar();
    } catch (err) {
      haptic('warning');
      avisar(errorMessage(err), 'error');
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarIncidencia(aEliminar.id);
      haptic('success');
      avisar('Incidencia eliminada');
      setAEliminar(null);
      refrescar();
    } catch (err) {
      haptic('warning');
      avisar(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  // Encabezado ordenable: el botón cambia el orden en el servidor (página 1)
  const columnas: ColumnaTabla[] = COLUMNAS.map(c => ({
    ...c,
    titulo: c.orden ? (
      <button type="button" className={`inc-orden${filtros.sortField === c.orden ? ' is-activo' : ''}`} onClick={() => ordenar(c.orden!)}>
        {c.titulo}
        {filtros.sortField !== c.orden ? <ArrowUpDown size={13} aria-hidden /> : filtros.sortDir === 'ASC' ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />}
      </button>
    ) : c.titulo,
  }));

  const acciones: ReactNode = vista === 'matriz' ? (
    <div className="acciones-iconos">
      {puedeCrear && <Accion tip="Registrar incidencia" tono="verde" icono={<Plus size={18} />} onClick={() => { haptic('selection'); setFormulario({ incidencia: null }); }} />}
      {puedeCrear && <Accion tip="Importar desde Excel" tono="violeta" icono={<FileUp size={18} />} onClick={() => { haptic('selection'); setImportando(true); }} />}
      <Accion tip="Descargar plantilla Excel" tono="azul" icono={<FileDown size={18} />} onClick={() => { haptic('selection'); descargarPlantillaIncidencias(); }} />
      <Accion tip="Actualizar" icono={<RefreshCw size={18} />} onClick={() => { haptic('selection'); lista.refetch(); }} />
    </div>
  ) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Incidencias en ruta"
        subtitle={vista === 'graficas' ? 'Analítica por año' : lista.isLoading ? 'Cargando…' : `${total} registros`}
        actions={acciones}
      />

      <div className="inc-barra">
        <SegmentedControl
          label="Vista de incidencias"
          value={vista}
          onChange={v => { haptic('selection'); setVista(v); }}
          options={[{ value: 'matriz', label: 'Registros' }, { value: 'graficas', label: 'Gráficas' }]}
        />
      </div>

      {vista === 'graficas' ? <IncidenciasGraficas /> : (
        <div className="inc-matriz">
          <div className="inc-kpi-grilla">
            <KpiBoton tono="accent" etiqueta="Total incidencias" valor={String(kpis?.totalRegistros ?? 0)} activo={kpiActivo === 'todas'} onClick={() => filtrarPorKpi('todas')} />
            <KpiBoton tono="red" etiqueta="Pendientes de solución" valor={String(kpis?.totalPendientes ?? 0)} activo={kpiActivo === 'pendientes'} onClick={() => filtrarPorKpi('pendientes')} />
            <KpiBoton tono="green" etiqueta="Atendidas / resueltas" valor={String(kpis?.totalAtendidos ?? 0)} activo={kpiActivo === 'atendidas'} onClick={() => filtrarPorKpi('atendidas')} />
            <KpiBoton tono="amber" etiqueta="Costo total acumulado" valor={formatSoles(Number(kpis?.costoTotalAcumulado ?? 0))} activo={kpiActivo === 'costo'} onClick={() => filtrarPorKpi('costo')} />
          </div>

          <div className="inc-filtros">
            <SearchField value={texto} onChange={setTexto} placeholder="Placa, conductor, motivo, falla…" />
            <SelectInput aria-label="Mes" value={filtros.mes} onChange={e => cambiar({ mes: e.target.value })}>
              <option value="ALL">Todos los meses</option>
              {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </SelectInput>
            <SelectInput aria-label="Placa" value={filtros.placa} onChange={e => cambiar({ placa: e.target.value })}>
              <option value="ALL">Todas las placas</option>
              {(catalogo.data?.data ?? []).map(p => <option key={p.placa} value={p.placa}>{p.placa}</option>)}
            </SelectInput>
            <SelectInput aria-label="Área responsable" value={filtros.area} onChange={e => cambiar({ area: e.target.value })}>
              <option value="ALL">Todas las áreas</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </SelectInput>
            <SelectInput aria-label="Estado de la solución" value={filtros.solucionado} onChange={e => cambiar({ solucionado: e.target.value })}>
              <option value="ALL">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Atendido">Atendido</option>
            </SelectInput>
          </div>

          {lista.isLoading ? <PageLoader /> : lista.isError ? (
            <Notice tone="error">{errorMessage(lista.error)}</Notice>
          ) : items.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title="Sin incidencias">
              {filtrosActivos
                ? <button type="button" className="inc-quitar" onClick={limpiarFiltros}>Quitar filtros</button>
                : puedeCrear ? <>Registra la primera con <strong>Registrar</strong>.</> : 'No hay incidencias registradas.'}
            </EmptyState>
          ) : (
            <div className={`inc-tabla${lista.isFetching ? ' is-cargando' : ''}`}>
              <TablaRedimensionable id="incidencias-ruta" ariaLabel="Incidencias en ruta" altoMax="64vh" columnas={columnas}>
                {items.map(inc => {
                  const atendido = inc.solucionado === 'Atendido';
                  return (
                    <tr key={inc.id}>
                      <Celda mono>{formatFechaPe(inc.fecha_falla)}</Celda>
                      <Celda><LicensePlate plate={inc.placa} size="sm" /></Celda>
                      <Celda>{inc.conductor || '—'}</Celda>
                      <Celda>{inc.marca || '—'}</Celda>
                      <Celda>{inc.ubicacion || '—'}</Celda>
                      <Celda>{inc.tipo_unidad || 'TRACTO'}</Celda>
                      <Celda alinear="center"><Badge tone={inc.transbordo === 'SI' ? 'amber' : 'gray'}>{inc.transbordo === 'SI' ? 'SI' : 'NO'}</Badge></Celda>
                      <Celda>{inc.motivo || '—'}</Celda>
                      <Celda>{inc.falla || '—'}</Celda>
                      <Celda><Badge tone={TONO_AREA[inc.area_responsable ?? ''] ?? 'accent'}>{inc.area_responsable || 'Mantenimiento'}</Badge></Celda>
                      <Celda>{inc.responsable || '—'}</Celda>
                      <Celda>
                        {inc.costos_detalle?.length ? (
                          <ul className="inc-desglose">
                            {inc.costos_detalle.map((c, i) => (
                              <li key={i}><span>{c.concepto || 'Gasto'}</span><span className="t-numeric">{formatSoles(Number(c.monto) || 0)}</span></li>
                            ))}
                          </ul>
                        ) : <span className="inc-muted">—</span>}
                      </Celda>
                      <Celda mono alinear="right">{formatSoles(Number(inc.total_costo) || 0)}</Celda>
                      <Celda alinear="center">
                        <button type="button" className="inc-estado" title="Toca para cambiar el estado"
                          aria-label={`Marcar como ${atendido ? 'pendiente' : 'atendida'}`} onClick={() => alternarSolucion(inc)}>
                          <Badge tone={atendido ? 'green' : 'red'}>{atendido ? 'Atendido' : 'Pendiente'}</Badge>
                        </button>
                      </Celda>
                      <Celda>{inc.observaciones || '—'}</Celda>
                      <Celda alinear="center">
                        <div className="inc-acciones-fila">
                          {puedeEditar && (
                            <button type="button" className="inc-icono" title="Editar" aria-label="Editar incidencia"
                              onClick={() => { haptic('selection'); setFormulario({ incidencia: inc }); }}>
                              <Pencil size={15} />
                            </button>
                          )}
                          {puedeEliminar && (
                            <button type="button" className="inc-icono inc-icono--peligro" title="Eliminar" aria-label="Eliminar incidencia"
                              onClick={() => { haptic('selection'); setAEliminar(inc); }}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </Celda>
                    </tr>
                  );
                })}
              </TablaRedimensionable>
            </div>
          )}

          {total > 0 && (
            <div className="inc-paginacion">
              <span>Mostrando {(pagina - 1) * LIMITE + 1} a {Math.min(pagina * LIMITE, total)} de {total} registros</span>
              <div className="inc-paginacion__controles">
                <Button size="sm" variant="secondary" iconOnly icon={<ChevronLeft size={16} />} aria-label="Página anterior"
                  disabled={pagina <= 1} onClick={() => setFiltros(f => ({ ...f, page: f.page - 1 }))} />
                <span className="t-numeric">{pagina} / {totalPaginas}</span>
                <Button size="sm" variant="secondary" iconOnly icon={<ChevronRight size={16} />} aria-label="Página siguiente"
                  disabled={pagina >= totalPaginas} onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))} />
              </div>
            </div>
          )}
        </div>
      )}

      <IncidenciaSheet
        abierto={formulario !== null}
        incidencia={formulario?.incidencia ?? null}
        catalogo={catalogo.data}
        onClose={() => setFormulario(null)}
      />

      <ImportarIncidenciasSheet
        open={importando}
        onClose={() => setImportando(false)}
        catalogo={catalogo.data}
        alTerminar={refrescar}
      />

      <ConfirmSheet
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar incidencia"
        message={aEliminar ? `Se eliminará la incidencia de ${aEliminar.placa} del ${formatFechaPe(aEliminar.fecha_falla)}. No se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        loading={eliminando}
      />
    </Page>
  );
}

function Accion({ tip, tono, icono, onClick }: { tip: string; tono?: 'verde' | 'azul' | 'violeta' | 'rojo' | 'ambar'; icono: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`btn btn--secondary btn--icon acciones-iconos__boton${tono ? ` acciones-iconos__boton--${tono}` : ''}`}
      data-tip={tip} aria-label={tip} onClick={onClick}>
      {icono}
    </button>
  );
}

function KpiBoton({ tono, etiqueta, valor, activo, onClick }: { tono: string; etiqueta: string; valor: string; activo: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`inc-kpi inc-kpi--${tono} inc-kpi--boton${activo ? ' is-activo' : ''}`} aria-pressed={activo} onClick={onClick}>
      <span className="inc-kpi__valor t-numeric">{valor}</span>
      <span className="inc-kpi__etiqueta">{etiqueta}</span>
    </button>
  );
}
