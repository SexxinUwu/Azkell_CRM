import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, CheckSquare, Container, FileSpreadsheet, LayoutGrid, List, Plus, SearchX, Trash2, Truck, X } from 'lucide-react';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { coincide, eliminarPlacas, usePlacas, type Placa } from './api';
import { PlacaFicha } from './PlacaFicha';
import { PlacaFormulario } from './PlacaFormulario';
import { ImportarPlacas } from './ImportarPlacas';
import './placas.css';

type Clase = 'todas' | 'motoras' | 'no-motoras';
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
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [busqueda, setBusqueda] = useState('');
  const [clase, setClase] = useState<Clase>('todas');
  const [tipos, setTipos] = useState<string[]>([]);
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

  const visibles = useMemo(() => placas.filter(p =>
    (clase === 'todas' || (clase === 'motoras' ? p.motora : !p.motora))
    && (!tipos.length || tipos.includes(p.tipo))
    && coincide(p, busqueda),
  ), [placas, clase, tipos, busqueda]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    try { localStorage.setItem(VISTA_KEY, v); } catch { /* nada */ }
  };
  const limpiar = () => { setBusqueda(''); setClase('todas'); setTipos([]); };
  const hayFiltros = !!busqueda || clase !== 'todas' || tipos.length > 0;

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

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Placas"
        subtitle={isLoading ? 'Cargando unidades…' : `${resumen.total} unidades · ${resumen.motoras} motoras · ${resumen.noMotoras} no motoras`}
        actions={
          <>
            {puedeCrear && (
              <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => setImportando(true)}>Importar</Button>
            )}
            {puedeCrear && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ modo: 'crear', placa: null })}>Nueva placa</Button>
            )}
            {!puedeCrear && (
              <Button variant="secondary" icon={<ArrowUpRight size={16} />} onClick={() => abrirClasico('flota/placas')}>Versión actual</Button>
            )}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          {/* Resumen con cifras que cuentan al aparecer */}
          <div className="placas-resumen">
            {[
              { label: 'Activas', value: resumen.activas, tone: 'green' },
              { label: 'Motoras', value: resumen.motoras, tone: 'accent' },
              { label: 'No motoras', value: resumen.noMotoras, tone: 'ink' },
              { label: 'Inactivas', value: resumen.total - resumen.activas, tone: 'gray' },
            ].map((k, i) => (
              <motion.div
                key={k.label}
                className={`placas-kpi placas-kpi--${k.tone}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: reduce ? 0 : 0.05 * i }}
              >
                <AnimatedNumber value={k.value} className="placas-kpi__valor t-numeric" />
                <span className="placas-kpi__label">{k.label}</span>
              </motion.div>
            ))}
          </div>

          <div className="toolbar placas-toolbar">
            <div className="placas-toolbar__buscar">
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, cliente, marca, modelo o VIN" />
            </div>
            <SegmentedControl<Clase>
              label="Clase de unidad"
              value={clase}
              onChange={setClase}
              options={[{ value: 'todas', label: 'Todas' }, { value: 'motoras', label: 'Motoras' }, { value: 'no-motoras', label: 'No motoras' }]}
            />
            <div className="placas-toolbar__vista" role="group" aria-label="Vista">
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'tarjetas'} onClick={() => cambiarVista('tarjetas')} aria-label="Ver en tarjetas">
                <LayoutGrid size={18} />
              </button>
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')} aria-label="Ver en lista">
                <List size={18} />
              </button>
            </div>
            {puedeEliminar && (
              <Button variant={seleccionando ? 'primary' : 'secondary'} icon={seleccionando ? <X size={16} /> : <CheckSquare size={16} />}
                onClick={() => (seleccionando ? salirSeleccion() : setSeleccionando(true))}>
                {seleccionando ? 'Terminar' : 'Seleccionar'}
              </Button>
            )}
          </div>
          {tiposDisponibles.length > 1 && (
            <div className="placas-tipos">
              <ToggleChips label="Tipo de unidad" value={tipos} onChange={setTipos} options={tiposDisponibles.map(t => ({ value: t, label: t }))} />
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
