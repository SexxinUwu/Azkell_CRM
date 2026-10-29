import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Contact, FileSpreadsheet, Plus, SearchX, TriangleAlert, UserPlus } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { abrirClasico } from '../../core/layout/navigation';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { alertasDe, ALFABETO, coincide, eliminarPersona, etiqueta, letraDe, nombreCompleto, OPCIONES, usePersonal, type Persona } from './api';
import { exportarExcel } from './documentos';
import { FotoPersona } from './FotoPersona';
import { PersonaTarjeta } from './PersonaTarjeta';
import { PersonaFormulario } from './PersonaFormulario';
import './personal.css';

type FiltroEstado = 'activos' | 'todos' | 'cesados';
const DIVIDIDO = '(min-width: 900px)';
const BASE = '/directorio/personal';

// Directorio › Personal, al estilo de Contactos de Apple: lista alfabética por apellido con índice A–Z
// y la tarjeta de la persona al lado (en el celular, la tarjeta entra encima de la lista).
export function PersonalPage() {
  const { data, isLoading, isError, error } = usePersonal();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { id } = useParams();
  const dividido = useMediaQuery(DIVIDIDO);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('activos');
  const [roles, setRoles] = useState<string[]>([]);
  const [porVencer, setPorVencer] = useState(false);
  const [formulario, setFormulario] = useState<{ persona: Persona | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Persona | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [letraActiva, setLetraActiva] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const puedeCrear = can('rrhh_personal.crear');
  const puedeEditar = can('rrhh_personal.editar');
  const puedeEliminar = can('rrhh_personal.eliminar');

  const personas = data ?? [];
  const seleccionada = id ? personas.find(p => String(p.id) === id) ?? null : null;

  const rolesPresentes = useMemo(() => {
    const s = new Set(personas.map(p => p.categoria_rol).filter(Boolean));
    return OPCIONES.rol.filter(o => s.has(o.value));
  }, [personas]);
  const conAlertas = useMemo(() => personas.filter(p => alertasDe(p).length).length, [personas]);

  const visibles = useMemo(() => personas.filter(p =>
    (estado === 'todos' || (estado === 'cesados' ? p.estado === 'CESADO' : p.estado !== 'CESADO'))
    && (!roles.length || roles.includes(p.categoria_rol))
    && (!porVencer || alertasDe(p).length > 0)
    && coincide(p, busqueda),
  ), [personas, estado, roles, porVencer, busqueda]);
  const hayFiltros = !!busqueda || estado !== 'activos' || roles.length > 0 || porVencer;

  const secciones = useMemo(() => {
    const m = new Map<string, Persona[]>();
    for (const p of visibles) {
      const l = letraDe(p);
      if (!m.has(l)) m.set(l, []);
      m.get(l)!.push(p);
    }
    return ALFABETO.filter(l => m.has(l)).map(l => ({ letra: l, personas: m.get(l)! }));
  }, [visibles]);

  // En pantalla ancha, abre la primera persona para que la tarjeta no quede vacía
  useEffect(() => {
    if (dividido && !id && visibles.length) navigate(`${BASE}/${visibles[0].id}`, { replace: true });
  }, [dividido, id, visibles, navigate]);

  // Si la persona abierta ya no existe (se eliminó), vuelve a la lista
  useEffect(() => {
    if (id && data && !seleccionada) navigate(BASE, { replace: true });
  }, [id, data, seleccionada, navigate]);

  // Pantalla ancha: las letras se pegan justo debajo de la búsqueda (su alto cambia con los filtros)
  useEffect(() => {
    const lista = listaRef.current;
    const filtros = lista?.querySelector<HTMLElement>('.contactos__filtros');
    if (!lista || !filtros || !dividido) return;
    const ro = new ResizeObserver(() => lista.style.setProperty('--contactos-filtros-h', `${filtros.offsetHeight}px`));
    ro.observe(filtros);
    return () => ro.disconnect();
  }, [dividido, isLoading, personas.length]);

  const abrir = (p: Persona) => { haptic('selection'); navigate(`${BASE}/${p.id}`, { replace: dividido }); };

  // Índice A–Z: tocar o deslizar el dedo por las letras salta a esa sección
  function irALetra(l: string) {
    const destino = ALFABETO.slice(ALFABETO.indexOf(l)).find(x => secciones.some(s => s.letra === x))
      ?? [...secciones].reverse()[0]?.letra;
    if (!destino) return;
    const el = document.getElementById(`letra-${destino}`);
    el?.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (destino !== letraActiva) { setLetraActiva(destino); haptic('selection'); }
  }
  function indicePointer(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(ALFABETO.length - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * ALFABETO.length)));
    irALetra(ALFABETO[i]);
  }

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarPersona(porEliminar.id);
      toast(`${nombreCompleto(porEliminar)} se eliminó del directorio`);
      haptic('success');
      setPorEliminar(null);
      navigate(BASE, { replace: true });
      await qc.invalidateQueries({ queryKey: ['personal'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  const otros = (
    <MenuOtros opciones={[
      { label: 'Exportar a Excel', detalle: `${visibles.length} personas de la lista`, icon: <FileSpreadsheet size={17} />, disabled: !visibles.length,
        onSelect: async () => { try { await exportarExcel(visibles); toast('Excel descargado'); } catch (err) { toast(errorMessage(err), 'error'); } } },
      { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('rrhh/personal') },
    ]} />
  );

  const tarjeta = seleccionada && (
    <PersonaTarjeta
      persona={seleccionada}
      verPagos={puedeEditar}
      onVolver={dividido ? undefined : () => navigate(BASE)}
      onEditar={puedeEditar ? () => setFormulario({ persona: seleccionada }) : undefined}
      onEliminar={puedeEliminar ? () => setPorEliminar(seleccionada) : undefined}
    />
  );

  // Celular con una persona abierta: solo la tarjeta (entra desde la derecha, como en iOS)
  const soloTarjeta = !dividido && !!seleccionada;

  return (
    <Page>
      {!soloTarjeta && (
        <PageHeader
          eyebrow="Directorio"
          title="Personal"
          subtitle={isLoading ? 'Cargando…' : `${personas.length} ${personas.length === 1 ? 'contacto' : 'contactos'}${conAlertas ? ` · ${conAlertas} con documentos por vencer` : ''}`}
          actions={<>{otros}{puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ persona: null })}>Nuevo</Button>}</>}
        />
      )}

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : personas.length === 0 ? (
        <EmptyState icon={<Contact size={22} />} title="Aún no hay personal en el directorio">
          {puedeCrear ? <>Agrega a la primera persona con <strong>Nuevo</strong>. Con el DNI, el nombre se completa solo.</> : 'Cuando RR. HH. registre al personal, aparecerá aquí.'}
        </EmptyState>
      ) : soloTarjeta ? tarjeta : (
        <div className={`contactos${dividido ? ' contactos--dividido' : ''}`}>
          <div className="contactos__lista" ref={listaRef}>
            <div className="contactos__filtros">
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, DNI, cargo o celular" />
              <SegmentedControl<FiltroEstado> block label="Estado" value={estado} onChange={setEstado}
                options={[{ value: 'activos', label: 'En planilla' }, { value: 'cesados', label: 'Cesados' }, { value: 'todos', label: 'Todos' }]} />
              {(rolesPresentes.length > 1 || conAlertas > 0) && (
                <div className="contactos__chips">
                  {conAlertas > 0 && (
                    <button type="button" className="chip pressable" aria-pressed={porVencer} onClick={() => { haptic('selection'); setPorVencer(v => !v); }}>
                      <TriangleAlert size={14} /> Por vencer
                    </button>
                  )}
                  {rolesPresentes.length > 1 && <ToggleChips label="Rol" value={roles} onChange={setRoles} options={rolesPresentes} />}
                </div>
              )}
            </div>

            {visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Nadie coincide con la búsqueda">
                {hayFiltros && <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setEstado('activos'); setRoles([]); setPorVencer(false); }}>Quitar filtros</button>}
              </EmptyState>
            ) : (
              <div className="contactos__cuerpo">
                <nav className="contactos__secciones" aria-label="Personal por letra">
                  {secciones.map(s => (
                    <section key={s.letra} className="contactos__seccion" aria-labelledby={`letra-${s.letra}`}>
                      <h3 id={`letra-${s.letra}`} className="contactos__letra">{s.letra}</h3>
                      <ul className="contactos__personas">
                        <AnimatePresence initial={false}>
                          {s.personas.map(p => {
                            const activa = seleccionada?.id === p.id;
                            const alerta = alertasDe(p)[0];
                            return (
                              <motion.li key={p.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                                <button type="button" className={`contacto pressable${activa ? ' contacto--activo' : ''}`} aria-current={activa ? 'true' : undefined} onClick={() => abrir(p)}>
                                  <FotoPersona persona={p} size={36} />
                                  <span className="contacto__texto">
                                    <span className="contacto__nombre">{p.nombres} <strong>{p.apellidos}</strong></span>
                                    <span className="contacto__detalle">{p.cargo || etiqueta(OPCIONES.rol, p.categoria_rol)}</span>
                                  </span>
                                  {alerta && <span className={`contacto__punto contacto__punto--${alerta.tono}`} title={alerta.texto} aria-label={alerta.texto} />}
                                  {p.estado !== 'ACTIVO' && p.estado !== 'CESADO' && <span className="contacto__estado">{etiqueta(OPCIONES.estado, p.estado)}</span>}
                                </button>
                              </motion.li>
                            );
                          })}
                        </AnimatePresence>
                      </ul>
                    </section>
                  ))}
                  <p className="contactos__total">{visibles.length} {visibles.length === 1 ? 'contacto' : 'contactos'}</p>
                </nav>

                {secciones.length > 3 && (
                  <div className="contactos__indice" role="navigation" aria-label="Índice alfabético"
                    onPointerDown={indicePointer} onPointerMove={indicePointer} onPointerUp={() => setLetraActiva(null)} onPointerCancel={() => setLetraActiva(null)}>
                    {ALFABETO.map(l => (
                      <span key={l} className={`contactos__indice-letra${secciones.some(s => s.letra === l) ? '' : ' contactos__indice-letra--vacia'}${letraActiva === l ? ' contactos__indice-letra--activa' : ''}`}>{l}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {dividido && (
            <div className="contactos__detalle">
              <AnimatePresence mode="wait" initial={false}>
                {tarjeta || (
                  <motion.div key="vacio" className="contactos__sin-seleccion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <UserPlus size={28} /> <span>Elige a una persona de la lista</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <PersonaFormulario
        open={!!formulario}
        persona={formulario?.persona ?? null}
        existentes={personas}
        onClose={() => setFormulario(null)}
        onGuardado={nuevoId => { setFormulario(null); if (nuevoId) navigate(`${BASE}/${nuevoId}`, { replace: dividido }); }}
      />
      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title={`¿Eliminar a ${porEliminar ? nombreCompleto(porEliminar) : ''}?`}
        message="Se borra del directorio con su legajo, licencias y registros de seguridad. Si dejó de trabajar, mejor cámbialo a Cesado para conservar su historial. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}
