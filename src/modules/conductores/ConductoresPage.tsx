import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, IdCard, MessageCircle, Phone, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { exportarExcel } from '../../core/lib/excel';
import { coincide, eliminarConductor, useConductores, whatsapp, type Conductor } from './api';
import { ConductorFicha } from './ConductorFicha';
import { ConductorFormulario } from './ConductorFormulario';
import { ImportarConductores } from './ImportarConductores';
import { FotoConductor } from './FotoConductor';
import './conductores.css';

// Estados del clásico: Activo, Cesado y Bloqueado (Inactivo se conserva para registros antiguos)
type FiltroEstado = 'todos' | 'activos' | 'cesados' | 'bloqueados' | 'inactivos';
const activo = (c: Conductor) => c.estado.toLowerCase() === 'activo';
const estadoDe = (c: Conductor) => c.estado.toLowerCase();

// Excel con las mismas columnas y formato que el clásico (Directorio_Personal): nombre en título, teléfono solo dígitos, TERCERO → 3ro.
const nombreTitulo = (s: string) => s.replace(/Ã'/g, 'Ñ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
const exportarConductores = (filas: Conductor[]) => exportarExcel('Directorio_Personal', 'Conductores',
  ['Nombre', 'Empresa', 'DNI', 'Licencia', 'Teléfono', 'Estado'],
  filas.map(c => [
    c.nombre ? nombreTitulo(c.nombre) : '',
    c.empresa.replace(/TERCERO/gi, '3ro'),
    c.dni,
    c.licencia,
    c.telefono.replace(/\D/g, ''),
    c.estado,
  ]));

// Directorio › Conductores: consulta, alta, edición, importación y eliminación.
export function ConductoresPage() {
  const { data, isLoading, isError, error } = useConductores();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [abierto, setAbierto] = useState<Conductor | null>(null);
  const [formulario, setFormulario] = useState<{ conductor: Conductor | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Conductor | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('cond.crear');
  const puedeEditar = can('cond.editar', 'cond.crear'); // la versión actual exige "crear" para guardar
  const puedeEliminar = can('cond.eliminar');

  const conductores = data ?? [];
  const resumen = useMemo(() => ({
    activos: conductores.filter(activo).length,
    cesados: conductores.filter(c => estadoDe(c) === 'cesado').length,
    bloqueados: conductores.filter(c => estadoDe(c) === 'bloqueado').length,
    conLicencia: conductores.filter(c => c.licencia).length,
    sinDni: conductores.filter(c => !c.dni).length,
  }), [conductores]);
  // Empresas como filtro rápido: las que son la misma (aunque escritas distinto) cuentan como una
  const gruposEmpresa = useMemo(() => agruparEmpresas(conductores.map(c => c.empresa)), [conductores]);
  const nombreEmpresa = (e: string) => gruposEmpresa.find(g => g.clave === claveEmpresa(e))?.nombre ?? e;

  const visibles = useMemo(() => conductores.filter(c =>
    (estado === 'todos' || (estado === 'activos' ? activo(c) : estado === 'cesados' ? estadoDe(c) === 'cesado'
      : estado === 'bloqueados' ? estadoDe(c) === 'bloqueado' : estadoDe(c) === 'inactivo'))
    && (!empresas.length || empresas.some(e => claveEmpresa(e) === claveEmpresa(c.empresa)))
    && coincide(c, busqueda),
  ), [conductores, estado, empresas, busqueda]);
  const hayFiltros = !!busqueda || estado !== 'todos' || empresas.length > 0;

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarConductor(porEliminar.id);
      toast(`${porEliminar.nombre} eliminado del directorio`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['conductores'] });
      setPorEliminar(null);
      setAbierto(null);
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
        eyebrow="Directorio"
        title="Conductores"
        subtitle={isLoading ? 'Cargando…' : `${conductores.length} personas · ${resumen.activos} activas`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} ${visibles.length === 1 ? 'persona' : 'personas'} con los filtros actuales`, icon: <FileSpreadsheet size={17} />,
                onSelect: () => exportarConductores(visibles).catch(err => toast(errorMessage(err), 'error')) },
              puedeCrear && { label: 'Importar desde Excel', detalle: 'Agrega conductores en lote', icon: <FileSpreadsheet size={17} />, onSelect: () => setImportando(true) },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ conductor: null })}>Nuevo conductor</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          <div className="placas-resumen">
            {[
              { label: 'Activos', value: resumen.activos, tone: 'green' },
              { label: 'Cesados', value: resumen.cesados, tone: 'gray' },
              { label: 'Bloqueados', value: resumen.bloqueados, tone: 'red' },
              { label: 'Con licencia', value: resumen.conLicencia, tone: 'blue' },
              { label: 'Sin DNI', value: resumen.sinDni, tone: resumen.sinDni ? 'amber' : 'gray' },
            ].map((k, i) => (
              <motion.div key={k.label} className={`placas-kpi placas-kpi--${k.tone}`}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.05 * i }}>
                <AnimatedNumber value={k.value} className="placas-kpi__valor t-numeric" />
                <span className="placas-kpi__label">{k.label}</span>
              </motion.div>
            ))}
          </div>

          <div className="toolbar placas-toolbar">
            <div className="placas-toolbar__buscar">
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, DNI, licencia, empresa o teléfono" />
            </div>
            <SegmentedControl<FiltroEstado> label="Estado" value={estado} onChange={setEstado}
              options={[
                { value: 'todos', label: 'Todos' }, { value: 'activos', label: 'Activos' }, { value: 'cesados', label: 'Cesados' },
                { value: 'bloqueados', label: 'Bloqueados' }, ...(conductores.some(c => estadoDe(c) === 'inactivo') ? [{ value: 'inactivos' as const, label: 'Inactivos' }] : []),
              ]} />
          </div>
          {gruposEmpresa.length > 1 && (
            <div className="placas-tipos">
              <MultiSelect label="Empresa" value={empresas} onChange={setEmpresas} options={gruposEmpresa.map(g => g.nombre)} placeholder="Todas" />
            </div>
          )}

          <p className="placas-conteo t-footnote c-secondary" aria-live="polite">
            {visibles.length === conductores.length ? `${conductores.length} personas` : `${visibles.length} de ${conductores.length} personas`}
            {hayFiltros && <> · <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setEstado('todos'); setEmpresas([]); }}>Quitar filtros</button></>}
          </p>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="No hay conductores con esos filtros">Prueba con otra búsqueda o quita los filtros.</EmptyState>
          ) : (
            <motion.ul className="conductores-grid" layout={!reduce}>
              <AnimatePresence mode="popLayout" initial={!reduce}>
                {visibles.map((c, i) => {
                  const wa = whatsapp(c.telefono);
                  return (
                    <motion.li key={c.id} layout={!reduce}
                      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 12) * 0.025 }}>
                      <div className="conductor-card">
                        <button type="button" className="conductor-card__principal pressable" onClick={() => setAbierto(c)}>
                          <FotoConductor conductor={c} size={52} />
                          <div className="conductor-card__texto">
                            <div className="conductor-card__nombre">{c.nombre || 'Sin nombre'}</div>
                            <div className="conductor-card__meta">
                              <IdCard size={13} />
                              <span>{[c.dni && `DNI ${c.dni}`, c.licencia].filter(Boolean).join(' · ') || 'Sin documentos'}</span>
                            </div>
                            <div className="conductor-card__empresa">{c.empresa ? nombreEmpresa(c.empresa) : 'Sin empresa'}</div>
                          </div>
                          {!activo(c) && <span className="placa-estado placa-estado--off">{c.estado}</span>}
                        </button>
                        {(c.telefono || wa) && (
                          <div className="conductor-card__acciones">
                            {c.telefono && <a className="conductor-accion pressable" href={`tel:${c.telefono.replace(/\s/g, '')}`} aria-label={`Llamar a ${c.nombre}`}><Phone size={16} /></a>}
                            {wa && <a className="conductor-accion conductor-accion--wa pressable" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.nombre}`}><MessageCircle size={16} /></a>}
                          </div>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      )}

      <ConductorFicha
        conductor={abierto}
        onClose={() => setAbierto(null)}
        onEditar={puedeEditar ? c => { setAbierto(null); setFormulario({ conductor: c }); } : undefined}
        onEliminar={puedeEliminar ? c => setPorEliminar(c) : undefined}
      />
      <ConductorFormulario
        open={!!formulario}
        conductor={formulario?.conductor ?? null}
        existentes={conductores}
        onClose={() => setFormulario(null)}
        onGuardado={() => setFormulario(null)}
      />
      <ImportarConductores open={importando} onClose={() => setImportando(false)} existentes={conductores} />
      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title={`¿Eliminar a ${porEliminar?.nombre ?? ''}?`}
        message="Se borra del directorio de conductores. Los viajes, vales y registros que ya tiene no se modifican. Esta acción no se puede deshacer."
        confirmLabel="Eliminar conductor"
      />
    </Page>
  );
}
