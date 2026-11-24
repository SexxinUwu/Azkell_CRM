import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, CircleAlert, Clock, Contact, FileText, IdCard, Plus, Printer, RefreshCw, SearchX, SlidersHorizontal, Trash2, TriangleAlert, UserPlus, Wrench } from 'lucide-react';
import { FileSpreadsheet, Pencil } from '../../core/ui/IconosArchivo';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { BotonTip } from '../../core/ui/BotonTip';
import { ChoiceChips } from '../../core/ui/Chips';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { Button, PageLoader } from '../../core/ui/Button';
import '../../core/ui/acciones-iconos.css';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { alertasDe, ALFABETO, coincide, eliminarPersona, etiqueta, letraDe, nombreCompleto, OPCIONES, useDocumentosTodos, usePersonal, type DocumentoPersona, type Persona } from './api';
import { descargarVCard, exportarExcel, imprimirFicha, imprimirFotocheck } from './documentos';
import { COLOR_GRUPO, grupoDePersona, TEXTO_GRUPO, type GrupoPersona } from './estadoPersonal';
import { DocMetaVigentes } from '../flota/DocMetaVigentes';
import { repartirPorcentajes } from '../flota/docsEstado';
import '../flota/flota.css';
import '../mantenimiento/mant.css';
import '../flota/disponibilidad.css';
import '../flota/documentos.css';
import { FotoPersona } from './FotoPersona';
import { PersonaFicha } from './PersonaFicha';
import { PersonaFormulario } from './PersonaFormulario';
import './personal.css';

type FiltroEstado = 'activos' | 'todos' | 'cesados';
const DIVIDIDO = '(min-width: 900px)';

// Directorio › Personal, al estilo de Contactos de Apple: lista alfabética por apellido con índice A–Z
// y la tarjeta de la persona al lado (en el celular, la tarjeta entra encima de la lista).
export function PersonalPage({ base = '/directorio/personal', soloLectura = false, eyebrow = 'Directorio', titulo = 'Directorio', selector }: {
  base?: string; soloLectura?: boolean; eyebrow?: string; titulo?: string; selector?: ReactNode;
} = {}) {
  const BASE = base;
  const { data, isLoading, isError, error } = usePersonal();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { search } = useLocation();
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
  // Pantalla ancha (como Documentos de flota): estado de los documentos elegido en las tarjetas y hoja de filtros
  const [grupo, setGrupo] = useState<'todos' | GrupoPersona>('todos');
  const [filtrando, setFiltrando] = useState(false);
  const docsQ = useDocumentosTodos();

  const puedeCrear = !soloLectura && can('rrhh_personal.crear');
  const puedeEditar = !soloLectura && can('rrhh_personal.editar');
  const puedeEliminar = !soloLectura && can('rrhh_personal.eliminar');

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

  // Estado de los documentos de cada persona (el que ve la pantalla ancha, igual que el de cada unidad en Documentos de flota)
  const docsPorPersona = useMemo(() => {
    const m = new Map<number, DocumentoPersona[]>();
    for (const d of docsQ.data ?? []) { const a = m.get(d.personal_id) ?? []; a.push(d); m.set(d.personal_id, a); }
    return m;
  }, [docsQ.data]);
  const grupoDe = (p: Persona): GrupoPersona => grupoDePersona(p, docsPorPersona.get(p.id) ?? []);
  // Las tarjetas de estado reaccionan al estado laboral, al rol y a la búsqueda; el estado del documento no las recorta (ellas son ese estado)
  const baseEscritorio = useMemo(() => personas.filter(p =>
    (estado === 'todos' || (estado === 'cesados' ? p.estado === 'CESADO' : p.estado !== 'CESADO'))
    && (!roles.length || roles.includes(p.categoria_rol)) && coincide(p, busqueda)), [personas, estado, roles, busqueda]);
  const cifras = useMemo(() => {
    const c = { total: baseEscritorio.length, vigente: 0, alerta: 0, vencido: 0, sin: 0 };
    for (const p of baseEscritorio) c[grupoDe(p)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseEscritorio, docsPorPersona]);
  const filasEscritorio = useMemo(() => baseEscritorio.filter(p => grupo === 'todos' || grupoDe(p) === grupo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseEscritorio, grupo, docsPorPersona]);
  const pcts = repartirPorcentajes([cifras.vigente, cifras.alerta, cifras.vencido, cifras.sin], cifras.total);
  const pctDe: Record<'todos' | GrupoPersona, number> = { todos: cifras.total > 0 ? 100 : 0, vigente: pcts[0], alerta: pcts[1], vencido: pcts[2], sin: pcts[3] };
  const filtrosEscritorio = (estado !== 'activos' ? 1 : 0) + (roles.length ? 1 : 0) + (grupo !== 'todos' ? 1 : 0);
  // Lo que se muestra en la lista de la izquierda
  const lista = dividido ? filasEscritorio : visibles;

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
    if (dividido && !id && lista.length) navigate(`${BASE}/${lista[0].id}`, { replace: true });
  }, [dividido, id, lista, navigate]);

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

  const abrir = (p: Persona) => { haptic('selection'); navigate(`${BASE}/${p.id}${search}`, { replace: dividido }); };

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

  // Exportar a Excel: icono con color y, al pasar el mouse, su nombre (sin menú Otros)
  const otros = (
    <div className="acciones-iconos acciones-iconos--sinfondo" role="group" aria-label="Acciones del personal">
      <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Exportar a Excel"
        aria-label="Exportar a Excel" icon={<FileSpreadsheet size={17} />} disabled={!visibles.length}
        onClick={async () => { try { await exportarExcel(visibles); toast('Excel descargado'); } catch (err) { toast(errorMessage(err), 'error'); } }} />
    </div>
  );

  const tarjeta = seleccionada && (
    <PersonaFicha
      persona={seleccionada}
      verPagos={puedeEditar}
      embebida={dividido}
      onVolver={dividido ? undefined : () => navigate(BASE)}
      onEditar={puedeEditar ? () => setFormulario({ persona: seleccionada }) : undefined}
      onEliminar={puedeEliminar ? () => setPorEliminar(seleccionada) : undefined}
    />
  );

  // Celular con una persona abierta: solo la tarjeta (entra desde la derecha, como en iOS)
  const soloTarjeta = !dividido && !!seleccionada;

  // ─── Pantalla ancha: la misma distribución de Documentos de flota (cabecera compacta, panel de avance, lista y expediente) ───
  const kpis: Array<{ clave: 'todos' | GrupoPersona; label: string; valor: number; tono: string; icono: ReactNode }> = [
    { clave: 'todos', label: 'Personal total', valor: cifras.total, tono: 'blue', icono: <Briefcase size={18} strokeWidth={1.9} /> },
    { clave: 'vigente', label: 'Al día', valor: cifras.vigente, tono: 'green', icono: <Clock size={18} strokeWidth={1.9} /> },
    { clave: 'alerta', label: 'En alerta', valor: cifras.alerta, tono: 'amber', icono: <Wrench size={18} strokeWidth={1.9} /> },
    { clave: 'vencido', label: 'Vencidos', valor: cifras.vencido, tono: 'red', icono: <CircleAlert size={18} strokeWidth={1.9} /> },
    { clave: 'sin', label: 'Sin documentos', valor: cifras.sin, tono: 'ink', icono: <FileText size={18} strokeWidth={1.9} /> },
  ];
  const chipsRol = rolesPresentes.slice(0, 3).map(o => ({
    clave: String(o.value), etiqueta: o.label, n: baseEscritorio.filter(p => p.categoria_rol === o.value).length || personas.filter(p => p.categoria_rol === o.value).length,
    activo: roles.includes(String(o.value)), onClick: () => { haptic('selection'); setRoles(r => (r.includes(String(o.value)) ? r.filter(x => x !== o.value) : [...r, String(o.value)])); },
  }));
  const seguro = (f: () => unknown) => async () => { try { await f(); } catch (err) { toast(errorMessage(err), 'error'); } };

  if (dividido && !soloTarjeta) {
    return (
      <Page wide fill>
        <header className="doc-cab">
          <div className="doc-cab__titulo">
            <span className="t-eyebrow">{eyebrow}</span>
            <h1 className="doc-cab__h1">{titulo}</h1>
          </div>
          <div className="doc-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, DNI, cargo o celular" /></div>
          {selector}
          <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={filtrosEscritorio ? `Filtros, ${filtrosEscritorio} activos` : 'Filtros'}>
            <span className="placas-filtros__texto">Filtros</span>
            {filtrosEscritorio > 0 && <span className="placas-filtros__n t-numeric">{filtrosEscritorio}</span>}
          </Button>
          <div className="doc-cab__acciones">
            {seleccionada && (
              <>
                <BotonTip tip="Imprimir ficha" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => imprimirFicha(seleccionada, puedeEditar)}><Printer size={18} /></BotonTip>
                <BotonTip tip="Imprimir fotocheck" className="btn btn--plain btn--icono btn--icono-acento" onClick={seguro(() => imprimirFotocheck(seleccionada))}><IdCard size={18} /></BotonTip>
                <BotonTip tip="Compartir contacto (.vcf)" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => descargarVCard(seleccionada)}><Contact size={18} /></BotonTip>
                {puedeEditar && <BotonTip tip="Editar" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => setFormulario({ persona: seleccionada })}><Pencil size={18} /></BotonTip>}
                {puedeEliminar && <BotonTip tip="Eliminar" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => setPorEliminar(seleccionada)}><Trash2 size={18} /></BotonTip>}
              </>
            )}
            <BotonTip tip="Actualizar" className="btn btn--plain btn--icono btn--icono-acento" disabled={docsQ.isFetching}
              onClick={() => { void qc.invalidateQueries({ queryKey: ['personal'] }); }}><RefreshCw size={18} /></BotonTip>
            <BotonTip tip="Exportar a Excel" className="btn btn--plain btn--icono btn--icono-acento" disabled={!baseEscritorio.length}
              onClick={async () => { try { await exportarExcel(filasEscritorio); toast('Excel descargado'); } catch (err) { toast(errorMessage(err), 'error'); } }}><FileSpreadsheet size={18} /></BotonTip>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ persona: null })}>Nuevo</Button>}
          </div>
        </header>

        {isLoading ? <PageLoader variante="camion" /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : personas.length === 0 ? (
          <EmptyState icon={<Contact size={22} />} title="Aún no hay personal en el directorio">
            {puedeCrear ? <>Agrega a la primera persona con <strong>Nuevo</strong>. Con el DNI, el nombre se completa solo.</> : 'Cuando RR. HH. registre al personal, aparecerá aquí.'}
          </EmptyState>
        ) : (
          <div className="doc-pagina">
            <DocMetaVigentes vigentes={cifras.vigente} total={cifras.total} pct={pctDe.vigente} chips={[
              { clave: 'todos', etiqueta: 'Personal', n: cifras.total, activo: !roles.length, onClick: () => { haptic('selection'); setRoles([]); } }, ...chipsRol,
            ]}>
              {kpis.map(k => (
                <button key={k.clave} type="button" className={`doc-tile pressable disp-kpi--${k.tono}`} aria-pressed={grupo === k.clave}
                  onClick={() => { haptic('selection'); setGrupo(g => (g === k.clave && k.clave !== 'todos' ? 'todos' : k.clave)); }}>
                  <span className="doc-tile__icono" aria-hidden>{k.icono}</span>
                  <span className="doc-tile__txt">
                    <span className="doc-tile__k">{k.label}</span>
                    <span className="doc-tile__v"><AnimatedNumber value={k.valor} className="t-numeric" /><small>{pctDe[k.clave]}%{k.clave === 'vigente' ? ` · falta ${100 - pctDe[k.clave]}%` : ''}</small></span>
                  </span>
                </button>
              ))}
            </DocMetaVigentes>

            <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosEscritorio}
              onLimpiar={() => { setEstado('activos'); setRoles([]); setGrupo('todos'); }} resultado={filasEscritorio.length} unidad="persona">
              <GrupoFiltro titulo="Situación laboral">
                <ChoiceChips label="Situación laboral" value={estado} onChange={v => setEstado(v as FiltroEstado)}
                  options={[{ value: 'activos', label: 'En planilla' }, { value: 'cesados', label: 'Cesados' }, { value: 'todos', label: 'Todos' }]} />
              </GrupoFiltro>
              {rolesPresentes.length > 1 && (
                <GrupoFiltro titulo="Rol">
                  <ToggleChips label="Rol" value={roles} onChange={setRoles} options={rolesPresentes} />
                </GrupoFiltro>
              )}
              <GrupoFiltro titulo="Estado de los documentos">
                <ChoiceChips label="Estado de los documentos" value={grupo} onChange={v => setGrupo(v as 'todos' | GrupoPersona)}
                  options={[{ value: 'todos', label: 'Todos' }, { value: 'vigente', label: 'Al día' }, { value: 'alerta', label: 'En alerta' }, { value: 'vencido', label: 'Vencidos' }, { value: 'sin', label: 'Sin documentos' }]} />
              </GrupoFiltro>
            </HojaFiltros>

            {filasEscritorio.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Nadie coincide con los filtros">
                <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setEstado('activos'); setRoles([]); setGrupo('todos'); }}>Quitar filtros</button>
              </EmptyState>
            ) : (
              <div className="doc-expediente">
                <ul className="doc-lista" aria-label="Personal">
                  {filasEscritorio.map(p => {
                    const g = grupoDe(p);
                    const activa = seleccionada?.id === p.id;
                    return (
                      <li key={p.id}>
                        <button type="button" className={`doc-unidad pressable${activa ? ' doc-unidad--activa' : ''}`} aria-current={activa} onClick={() => abrir(p)}>
                          <FotoPersona persona={p} size={36} />
                          <span className="doc-unidad__texto">
                            <span className="doc-unidad__persona">{p.nombres} <strong>{p.apellidos}</strong></span>
                            <span className="doc-unidad__tipo">{(p.cargo || etiqueta(OPCIONES.rol, p.categoria_rol) || '').toUpperCase()}</span>
                          </span>
                          {p.estado === 'CESADO' && <span className="doc-unidad__alq">CESADO</span>}
                          <span className="doc-punto" style={{ background: COLOR_GRUPO[g] }} title={TEXTO_GRUPO[g]} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="pers-detalle">
                  <AnimatePresence mode="wait" initial={false}>
                    {tarjeta || (
                      <motion.div key="vacio" className="contactos__sin-seleccion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <UserPlus size={28} /> <span>Elige a una persona de la lista</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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

  return (
    // Celular: la lista de contactos y, al abrir a alguien, solo su tarjeta
    <Page fill={dividido && !soloTarjeta}>
      {!soloTarjeta && (
        <PageHeader
          eyebrow={eyebrow}
          title={titulo}
          subtitle={isLoading ? 'Cargando…' : `${personas.length} ${personas.length === 1 ? 'contacto' : 'contactos'}${conAlertas ? ` · ${conAlertas} con documentos por vencer` : ''}`}
          actions={<>{selector}{otros}{puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ persona: null })}>Nuevo</Button>}</>}
        />
      )}

      {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : personas.length === 0 ? (
        <EmptyState icon={<Contact size={22} />} title="Aún no hay personal en el directorio">
          {puedeCrear ? <>Agrega a la primera persona con <strong>Nuevo</strong>. Con el DNI, el nombre se completa solo.</> : 'Cuando RR. HH. registre al personal, aparecerá aquí.'}
        </EmptyState>
      ) : soloTarjeta ? tarjeta : (
        <>
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
        </>
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
