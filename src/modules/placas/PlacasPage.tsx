import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckSquare, Container, Download, FileSpreadsheet, FileText, LayoutGrid, List, MessageCircle, Plus, SearchX, SlidersHorizontal, Trash2, Truck, X } from 'lucide-react';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button, PageLoader } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ToggleChips } from '../../core/ui/Chips';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { eliminarPlacas, usePlacas, type Placa } from './api';
import { FILTROS_VACIOS, cuentaFiltros, describirFiltros, filtrarPlacas, type Clase, type FiltrosPlacas } from './filtros';
import { compartirReportePDF, descargarReportePDF, exportarPlacasExcel } from './reporte';
import { descargarPlantilla } from './importar';
import { FiltrosPlacasSheet } from './FiltrosPlacasSheet';
import { PlacaFicha } from './PlacaFicha';
import { PlacaFormulario } from './PlacaFormulario';
import { ImportarPlacas } from './ImportarPlacas';
import './placas.css';

type Vista = 'tarjetas' | 'lista';
const VISTA_KEY = 'azkell.placas.vista';

const esMotoraTipo = (tipo: string) => /tracto|cami/i.test(tipo);
export const IconoTipo = ({ placa, size = 18 }: { placa: Placa; size?: number }) =>
  placa.motora || esMotoraTipo(placa.tipo) ? <Truck size={size} strokeWidth={1.8} /> : <Container size={size} strokeWidth={1.8} />;

const Estado = ({ p }: { p: Placa }) => (
  <span className={`placa-estado placa-estado--${p.estado.toLowerCase() === 'activa' ? 'on' : 'off'}`}>{p.estado}</span>
);

// Flota › Placas: consulta, alta, edición, importación y eliminación de unidades.
export function PlacasPage() {
  const { data, isLoading, isError, error } = usePlacas();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<FiltrosPlacas>(FILTROS_VACIOS);
  const [filtrando, setFiltrando] = useState(false);
  const [vista, setVista] = useState<Vista>(() => (localStorage.getItem(VISTA_KEY) as Vista) || 'tarjetas');
  const [abierta, setAbierta] = useState<Placa | null>(null);
  const [formulario, setFormulario] = useState<{ modo: 'crear' | 'editar'; placa: Placa | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [porEliminar, setPorEliminar] = useState<string[] | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('placas.crear');
  const puedeEditar = can('placas.editar');
  const puedeEliminar = can('placas.eliminar');

  const placas = data ?? [];
  const tiposDisponibles = useMemo(() => [...new Set(placas.map(p => p.tipo).filter(Boolean))].sort(), [placas]);
  const resumen = useMemo(() => ({
    total: placas.length,
    activas: placas.filter(p => p.estado.toLowerCase() === 'activa').length,
    motoras: placas.filter(p => p.motora).length,
    noMotoras: placas.filter(p => !p.motora).length,
  }), [placas]);

  const visibles = useMemo(() => filtrarPlacas(placas, filtros, busqueda), [placas, filtros, busqueda]);
  const cuentaActivos = cuentaFiltros(filtros);
  const descriptores = describirFiltros(filtros, busqueda);
  const empresa = user?.companyName ?? '';

  const cambiarVista = (v: Vista) => {
    setVista(v);
    try { localStorage.setItem(VISTA_KEY, v); } catch { /* nada */ }
  };
  const limpiar = () => { setBusqueda(''); setFiltros(FILTROS_VACIOS); };
  const hayFiltros = !!busqueda || cuentaActivos > 0;

  const salirSeleccion = () => { setSeleccionando(false); setSeleccion(new Set()); };
  const alternar = (placa: string) => {
    haptic('selection');
    setSeleccion(s => { const n = new Set(s); if (n.has(placa)) n.delete(placa); else n.add(placa); return n; });
  };
  const tocar = (p: Placa) => (seleccionando ? alternar(p.placa) : setAbierta(p));
  const todasVisibles = visibles.length > 0 && visibles.every(p => seleccion.has(p.placa));

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const n = await eliminarPlacas(porEliminar);
      toast(n === 1 ? `Placa ${porEliminar[0]} eliminada` : `${n} placas eliminadas`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['placas'] });
      setPorEliminar(null);
      setAbierta(null);
      salirSeleccion();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  const aviso = (err: unknown) => toast(errorMessage(err), 'error');
  const excel = async () => {
    try {
      await exportarPlacasExcel(visibles);
      toast(`Excel con ${visibles.length} ${visibles.length === 1 ? 'unidad' : 'unidades'}`);
    } catch (err) { aviso(err); }
  };
  const pdf = async () => {
    try {
      await descargarReportePDF(visibles, descriptores, empresa);
      toast('Reporte descargado');
    } catch (err) { aviso(err); }
  };
  const whatsapp = async () => {
    try {
      const r = await compartirReportePDF(visibles, descriptores, empresa);
      if (r === 'descargado') toast('PDF descargado. Adjúntalo en la conversación de WhatsApp.');
    } catch (err) { aviso(err); }
  };

  return (
    <Page wide fill>
      <PageHeader
        eyebrow="Flota"
        title="Placas"
        subtitle={isLoading ? 'Cargando unidades…' : `${resumen.total} unidades · ${resumen.motoras} motoras · ${resumen.noMotoras} no motoras`}
        actions={
          <>
            <MenuOtros opciones={[
              puedeCrear && { label: 'Importar desde Excel', detalle: 'Crea o actualiza placas en lote', icon: <FileSpreadsheet size={17} />, onSelect: () => setImportando(true) },
              puedeCrear && { label: 'Descargar plantilla', detalle: 'Excel con las columnas para importar', icon: <Download size={17} />, onSelect: () => descargarPlantilla().catch(aviso) },
              { label: 'Exportar a Excel', detalle: 'Las unidades que ves con los filtros', icon: <FileSpreadsheet size={17} />, separado: true, disabled: !visibles.length, onSelect: excel },
              { label: 'Reporte en PDF', detalle: 'Descarga el reporte de lo filtrado', icon: <FileText size={17} />, disabled: !visibles.length, onSelect: pdf },
              { label: 'Enviar por WhatsApp', detalle: 'Comparte el PDF del reporte', icon: <MessageCircle size={17} />, disabled: !visibles.length, onSelect: whatsapp },
            ]} />
            {puedeCrear && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ modo: 'crear', placa: null })}>Nueva placa</Button>
            )}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          {/* Resumen con cifras que cuentan al aparecer */}
          <div className="placas-resumen">
            {([
              { label: 'Activas', value: resumen.activas, tone: 'green', filtro: null },
              { label: 'Motoras', value: resumen.motoras, tone: 'blue', filtro: 'motoras' },
              { label: 'No motoras', value: resumen.noMotoras, tone: 'ink', filtro: 'no-motoras' },
              { label: 'Inactivas', value: resumen.total - resumen.activas, tone: 'gray', filtro: null },
            ] as Array<{ label: string; value: number; tone: string; filtro: Clase | null }>).map((k, i) => {
              const animacion = {
                initial: { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0 },
                transition: { ...spring, delay: reduce ? 0 : 0.05 * i },
              };
              const contenido = (
                <>
                  <AnimatedNumber value={k.value} className="placas-kpi__valor t-numeric" />
                  <span className="placas-kpi__label">{k.label}</span>
                </>
              );
              // Motoras y No motoras son filtros: la tarjeta reemplaza a la barra que repetía estos datos
              return k.filtro ? (
                <motion.button
                  key={k.label}
                  type="button"
                  className={`placas-kpi placas-kpi--${k.tone} placas-kpi--filtro`}
                  aria-pressed={filtros.clase === k.filtro}
                  onClick={() => { haptic('selection'); setFiltros(f => ({ ...f, clase: f.clase === k.filtro ? 'todas' : k.filtro! })); }}
                  {...animacion}
                >
                  {contenido}
                </motion.button>
              ) : (
                <motion.div key={k.label} className={`placas-kpi placas-kpi--${k.tone}`} {...animacion}>
                  {contenido}
                </motion.div>
              );
            })}
          </div>

          <div className="toolbar placas-toolbar">
            <div className="placas-toolbar__buscar">
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, cliente, marca, modelo o VIN" />
            </div>
            <div className="placas-toolbar__vista" role="group" aria-label="Vista">
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'tarjetas'} onClick={() => cambiarVista('tarjetas')} aria-label="Ver en tarjetas">
                <LayoutGrid size={18} />
              </button>
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')} aria-label="Ver en lista">
                <List size={18} />
              </button>
            </div>
            <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={cuentaActivos ? `Filtros, ${cuentaActivos} activos` : 'Filtros'}>
              <span className="placas-filtros__texto">Filtros</span>{cuentaActivos > 0 && <span className="placas-filtros__n t-numeric">{cuentaActivos}</span>}
            </Button>
            {puedeEliminar && (
              <Button variant={seleccionando ? 'primary' : 'secondary'} icon={seleccionando ? <X size={16} /> : <CheckSquare size={16} />}
                onClick={() => (seleccionando ? salirSeleccion() : setSeleccionando(true))}>
                {seleccionando ? 'Terminar' : 'Seleccionar'}
              </Button>
            )}
          </div>
          {tiposDisponibles.length > 1 && (
            <div className="placas-tipos">
              <ToggleChips label="Tipo de unidad" value={filtros.tipos} onChange={tipos => setFiltros(f => ({ ...f, tipos }))} options={tiposDisponibles.map(t => ({ value: t, label: t }))} />
            </div>
          )}

          <p className="placas-conteo t-footnote c-secondary" aria-live="polite">
            {visibles.length === placas.length ? `${placas.length} unidades` : `${visibles.length} de ${placas.length} unidades`}
            {hayFiltros && <> · <button type="button" className="placas-limpiar" onClick={limpiar}>Quitar filtros</button></>}
            {seleccionando && visibles.length > 0 && (
              <> · <button type="button" className="placas-limpiar" onClick={() => setSeleccion(todasVisibles ? new Set() : new Set(visibles.map(p => p.placa)))}>
                {todasVisibles ? 'Quitar selección' : `Seleccionar las ${visibles.length}`}
              </button></>
            )}
          </p>

          <div className="placas-area">
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="No hay unidades con esos filtros">
              Prueba con otra búsqueda o quita los filtros.
            </EmptyState>
          ) : vista === 'tarjetas' ? (
            <motion.ul className={`placas-grid${seleccionando ? ' placas-grid--seleccion' : ''}`} layout={!reduce}>
              <AnimatePresence mode="popLayout" initial={!reduce}>
                {visibles.map((p, i) => {
                  const marcada = seleccion.has(p.placa);
                  return (
                    <motion.li
                      key={p.placa}
                      layout={!reduce}
                      initial={{ opacity: 0, y: 14, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 12) * 0.025 }}
                    >
                      <button type="button" className={`placa-card pressable${marcada ? ' placa-card--marcada' : ''}`} onClick={() => tocar(p)} aria-pressed={seleccionando ? marcada : undefined}>
                        <div className="placa-card__top">
                          <LicensePlate plate={p.placa} size="lg" />
                          {seleccionando ? (
                            <motion.span className={`placa-check${marcada ? ' placa-check--on' : ''}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
                              {marcada && <Check size={14} strokeWidth={3} />}
                            </motion.span>
                          ) : <Estado p={p} />}
                        </div>
                        <div className="placa-card__titulo">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
                        <div className="placa-card__meta">
                          <IconoTipo placa={p} size={15} />
                          <span>{[p.tipo, p.anio].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                        </div>
                        <div className="placa-card__cliente">{p.cliente || 'Sin cliente'}</div>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.div className="list placas-lista" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
              {visibles.map(p => (
                <button key={p.placa} type="button" className={`row placas-fila${seleccion.has(p.placa) ? ' placas-fila--marcada' : ''}`} onClick={() => tocar(p)}>
                  {seleccionando && (
                    <span className={`placa-check${seleccion.has(p.placa) ? ' placa-check--on' : ''}`}>{seleccion.has(p.placa) && <Check size={14} strokeWidth={3} />}</span>
                  )}
                  <LicensePlate plate={p.placa} size="sm" />
                  <div className="row__main">
                    <div className="row__title">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
                    <div className="row__subtitle">{[p.tipo, p.anio, p.cliente].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Estado p={p} />
                </button>
              ))}
            </motion.div>
          )}
          </div>
        </>
      )}

      {/* Barra flotante de la selección */}
      <AnimatePresence>
        {seleccionando && seleccion.size > 0 && (
          <motion.div
            className="seleccion-barra glass"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={spring}
            role="toolbar"
            aria-label="Acciones de la selección"
          >
            <span className="seleccion-barra__conteo">
              <AnimatedNumber value={seleccion.size} className="t-numeric" /> {seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}
            </span>
            <Button variant="destructive" icon={<Trash2 size={16} />} onClick={() => setPorEliminar([...seleccion])}>Eliminar</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <PlacaFicha
        placa={abierta}
        onClose={() => setAbierta(null)}
        onEditar={puedeEditar ? p => { setAbierta(null); setFormulario({ modo: 'editar', placa: p }); } : undefined}
        onEliminar={puedeEliminar ? p => setPorEliminar([p.placa]) : undefined}
      />
      <PlacaFormulario
        open={!!formulario}
        modo={formulario?.modo ?? 'crear'}
        placa={formulario?.placa ?? null}
        existentes={placas}
        onClose={() => setFormulario(null)}
        onGuardada={p => { setFormulario(null); setAbierta(p); }}
      />
      <FiltrosPlacasSheet open={filtrando} onClose={() => setFiltrando(false)} placas={placas} filtros={filtros} onChange={setFiltros} resultado={visibles.length} />
      <ImportarPlacas open={importando} onClose={() => setImportando(false)} existentes={placas} />
      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title={porEliminar?.length === 1 ? `¿Eliminar la placa ${porEliminar[0]}?` : `¿Eliminar ${porEliminar?.length ?? 0} placas?`}
        message={
          <>
            Se borra la ficha de {porEliminar?.length === 1 ? 'la unidad' : 'las unidades'}
            {porEliminar && porEliminar.length > 1 && porEliminar.length <= 8 ? ` (${porEliminar.join(', ')})` : ''}.
            Esta acción no se puede deshacer.
          </>
        }
        confirmLabel={porEliminar?.length === 1 ? 'Eliminar placa' : `Eliminar ${porEliminar?.length ?? 0} placas`}
      />
    </Page>
  );
}
