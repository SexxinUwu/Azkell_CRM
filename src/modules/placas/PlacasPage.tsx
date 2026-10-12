import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Container, LayoutGrid, List, Plus, SearchX, Truck } from 'lucide-react';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { coincide, usePlacas, type Placa } from './api';
import { PlacaFicha } from './PlacaFicha';
import { PlacaFormulario } from './PlacaFormulario';
import { useAuth } from '../../core/auth/AuthProvider';
import './placas.css';

type Clase = 'todas' | 'motoras' | 'no-motoras';
type Vista = 'tarjetas' | 'lista';
const VISTA_KEY = 'azkell.placas.vista';

const esMotoraTipo = (tipo: string) => /tracto|cami/i.test(tipo);
export const IconoTipo = ({ placa, size = 18 }: { placa: Placa; size?: number }) =>
  placa.motora || esMotoraTipo(placa.tipo) ? <Truck size={size} strokeWidth={1.8} /> : <Container size={size} strokeWidth={1.8} />;

// Flota › Placas: consulta de unidades con búsqueda al instante, filtros y ficha.
// La edición sigue en la versión actual (botón "Editar en la versión actual").
export function PlacasPage() {
  const { data, isLoading, isError, error } = usePlacas();
  const reduce = useReducedMotion();
  const [busqueda, setBusqueda] = useState('');
  const [clase, setClase] = useState<Clase>('todas');
  const [tipos, setTipos] = useState<string[]>([]);
  const [vista, setVista] = useState<Vista>(() => (localStorage.getItem(VISTA_KEY) as Vista) || 'tarjetas');
  const [abierta, setAbierta] = useState<Placa | null>(null);
  const [formulario, setFormulario] = useState<{ modo: 'crear' | 'editar'; placa: Placa | null } | null>(null);
  const { can } = useAuth();

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

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Placas"
        subtitle={isLoading ? 'Cargando unidades…' : `${resumen.total} unidades · ${resumen.motoras} motoras · ${resumen.noMotoras} no motoras`}
        actions={
          <>
            <Button variant="secondary" icon={<ArrowUpRight size={16} />} onClick={() => abrirClasico('flota/placas')}>
              Versión actual
            </Button>
            {can('placas.crear') && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ modo: 'crear', placa: null })}>
                Nueva placa
              </Button>
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
          </div>
          {tiposDisponibles.length > 1 && (
            <div className="placas-tipos">
              <ToggleChips label="Tipo de unidad" value={tipos} onChange={setTipos} options={tiposDisponibles.map(t => ({ value: t, label: t }))} />
            </div>
          )}

          <p className="placas-conteo t-footnote c-secondary" aria-live="polite">
            {visibles.length === placas.length ? `${placas.length} unidades` : `${visibles.length} de ${placas.length} unidades`}
            {hayFiltros && <> · <button type="button" className="placas-limpiar" onClick={limpiar}>Quitar filtros</button></>}
          </p>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="No hay unidades con esos filtros">
              Prueba con otra búsqueda o quita los filtros.
            </EmptyState>
          ) : vista === 'tarjetas' ? (
            <motion.ul className="placas-grid" layout={!reduce}>
              <AnimatePresence mode="popLayout" initial={!reduce}>
                {visibles.map((p, i) => (
                  <motion.li
                    key={p.placa}
                    layout={!reduce}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 12) * 0.025 }}
                  >
                    <button type="button" className="placa-card pressable" onClick={() => setAbierta(p)}>
                      <div className="placa-card__top">
                        <LicensePlate plate={p.placa} size="lg" />
                        <span className={`placa-estado placa-estado--${p.estado.toLowerCase() === 'activa' ? 'on' : 'off'}`}>{p.estado}</span>
                      </div>
                      <div className="placa-card__titulo">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
                      <div className="placa-card__meta">
                        <IconoTipo placa={p} size={15} />
                        <span>{[p.tipo, p.anio].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                      </div>
                      <div className="placa-card__cliente">{p.cliente || 'Sin cliente'}</div>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.div className="list placas-lista" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}>
              {visibles.map(p => (
                <button key={p.placa} type="button" className="row placas-fila" onClick={() => setAbierta(p)}>
                  <LicensePlate plate={p.placa} size="sm" />
                  <div className="row__main">
                    <div className="row__title">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
                    <div className="row__subtitle">{[p.tipo, p.anio, p.cliente].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={`placa-estado placa-estado--${p.estado.toLowerCase() === 'activa' ? 'on' : 'off'}`}>{p.estado}</span>
                </button>
              ))}
            </motion.div>
          )}
        </>
      )}

      <PlacaFicha
        placa={abierta}
        onClose={() => setAbierta(null)}
        onEditar={can('placas.editar') ? p => { setAbierta(null); setFormulario({ modo: 'editar', placa: p }); } : undefined}
      />
      <PlacaFormulario
        open={!!formulario}
        modo={formulario?.modo ?? 'crear'}
        placa={formulario?.placa ?? null}
        existentes={placas}
        onClose={() => setFormulario(null)}
        onGuardada={p => { setFormulario(null); setAbierta(p); }}
      />
    </Page>
  );
}
