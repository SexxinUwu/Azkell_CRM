import './flota.css';
import '../mantenimiento/mant.css';
import './disponibilidad.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { BarChart3, LayoutGrid } from 'lucide-react';
import { ArrowUpRight, Briefcase, FileSpreadsheet, FileText, Gauge, MapPin, MessageCircle, Navigation, Pencil, Plus, RefreshCw, SearchX, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoDispColor, useDisponibilidad, useUbicacionesGps, type UbicacionGps, type VehiculoDisponibilidad } from './api';
import { DisponibilidadFormulario } from './DisponibilidadFormulario';
import { compartirDisponibilidadPDF, descargarDisponibilidadPDF } from './disponibilidadReporte';
import { cifrasDisponibilidad, estadoDeTexto, unidadesDe, type Estado } from './disponibilidadCifras';
import { LicensePlate } from '../../core/ui/LicensePlate';

type Filtro = 'Todos' | Estado;
const COLOR_ESTADO: Record<Estado, string> = { 'En Base': 'green', 'En Ruta': 'blue', 'En Mantenimiento': 'red' };

const categoria = (v: VehiculoDisponibilidad): Estado => estadoDeTexto(v.estado);


// Búsqueda sobre los mismos campos que la versión actual
const CAMPOS_BUSQUEDA = ['placa_camion', 'placa_carreta', 'conductor_asignado', 'marca', 'tipo_unidad', 'sub_tipo', 'estado', 'empresa', 'cliente', 'observaciones', 'capacidad_tanque'] as const;
const coincideBusqueda = (v: VehiculoDisponibilidad, q: string) =>
  !q || CAMPOS_BUSQUEDA.some(c => String(v[c] ?? '').toUpperCase().includes(q));

// Texto de la ubicación GPS, como en el Excel de la versión actual
const textoGps = (g: UbicacionGps | undefined) => {
  if (!g) return 'Sin Señal';
  const vel = g.velocidad;
  return `${vel > 3 ? `En Ruta (${Math.round(vel)} km/h)` : 'Detenido'} [${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}]`;
};

const nombreEmpresa = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t && t !== '-' && t.toUpperCase() !== 'CLIENTE' ? t : '';
};

// Empresa del vehículo: la del camión o la de la carreta, sin distinguir escritura
const coincideEmpresa = (v: VehiculoDisponibilidad, clave: string) =>
  claveEmpresa(v.empresa || v.cliente) === clave || claveEmpresa(v.empresa_carreta) === clave;

const placaLimpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const KPI_TONO = { Todos: 'ink', 'En Base': 'green', 'En Ruta': 'blue', 'En Mantenimiento': 'red' } as const;

export function DisponibilidadPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useDisponibilidad();
  const gps = useUbicacionesGps();
  const [filtro, setFiltro] = useState<Filtro>('Todos');
  const [empresa, setEmpresa] = useState('TODAS');
  const [vista, setVista] = useState<'tablero' | 'graficos'>('tablero');
  const [filtrando, setFiltrando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<VehiculoDisponibilidad | null>(null);
  const [formulario, setFormulario] = useState<{ veh: VehiculoDisponibilidad | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<VehiculoDisponibilidad | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const vehiculos = data ?? [];
  const puedeCrear = can('disponibilidad.crear');
  const puedeEditar = can('disponibilidad.editar');
  const puedeEliminar = can('disponibilidad.eliminar');
  const mapaGps = gps.data ?? new Map<string, UbicacionGps>();

  // Empresas como botones (la forma más usada de cada una)
  const empresas = useMemo(() => agruparEmpresas(vehiculos.flatMap(v => [nombreEmpresa(v.empresa || v.cliente), nombreEmpresa(v.empresa_carreta)])), [vehiculos]);
  const nombreDeEmpresa = empresas.find(e => e.clave === empresa)?.nombre ?? '';

  // Cifras y tabla se calculan sobre la empresa elegida. Cada placa cuenta como una unidad (igual que la versión actual)
  const delEmpresa = useMemo(() => vehiculos.filter(v => empresa === 'TODAS' || coincideEmpresa(v, empresa)), [vehiculos, empresa]);
  const q = busqueda.trim().toUpperCase();
  const delBusqueda = useMemo(() => delEmpresa.filter(v => coincideBusqueda(v, q)), [delEmpresa, q]);
  const cifras = useMemo(() => cifrasDisponibilidad(delBusqueda), [delBusqueda]);

  // La tabla muestra la fila si alguna de sus placas está en el estado elegido
  const visibles = useMemo(
    () => delBusqueda.filter(v => filtro === 'Todos' || unidadesDe(v).some(u => u.estado === filtro)),
    [delBusqueda, filtro],
  );

  const matriz = useMemo(() => {
    const m = new Map<string, { total: number; base: number; ruta: number; mantenimiento: number }>();
    for (const v of visibles) for (const u of unidadesDe(v)) {
      if (filtro !== 'Todos' && u.estado !== filtro) continue;
      const f = m.get(u.sub) ?? { total: 0, base: 0, ruta: 0, mantenimiento: 0 };
      f.total++;
      if (u.estado === 'En Base') f.base++;
      else if (u.estado === 'En Ruta') f.ruta++;
      else f.mantenimiento++;
      m.set(u.sub, f);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [visibles, filtro]);

  const criterios = [
    filtro !== 'Todos' && `Estado: ${filtro}`,
    empresa !== 'TODAS' && `Empresa: ${nombreDeEmpresa}`,
    busqueda.trim() && `Búsqueda: «${busqueda.trim()}»`,
  ].filter((c): c is string => !!c);

  const aviso = (err: unknown) => toast(errorMessage(err), 'error');

  async function eliminar() {
    if (!porEliminar?.id) return;
    setEliminando(true);
    try {
      const r = await api<{ error?: string }>(`/disponibilidad-flota/${porEliminar.id}`, { method: 'DELETE' });
      if (r?.error) throw new Error(r.error);
      haptic('success'); toast('Registro eliminado');
      setPorEliminar(null); setSeleccionado(null);
      await qc.invalidateQueries({ queryKey: ['flota', 'disponibilidad'] });
    } catch (err) { aviso(err); haptic('warning'); }
    finally { setEliminando(false); }
  }

  const excel = async () => {
    try {
      const filas = visibles.map((v, i) => [
        i + 1, v.placa_camion || '—', v.placa_carreta || '—', v.conductor_asignado || '—', categoria(v),
        v.empresa || v.cliente || '—', v.marca || '—', v.capacidad_tanque || '—', v.tipo_unidad || '—', v.observaciones || '—',
        textoGps(mapaGps.get(placaLimpia(v.placa_camion || v.placa_carreta || ''))),
      ]);
      await exportarExcel('Disponibilidad-flota', 'Disponibilidad Flota',
        ['#', 'CAMIÓN', 'CARRETA', 'CONDUCTOR', 'ESTADO', 'EMPRESA', 'MARCA', 'CAPACIDAD DE TANQUE', 'TIPO UNIDAD', 'OBSERVACIONES', 'UBICACIÓN GPS'], filas);
      haptic('success');
    } catch (err) { aviso(err); }
  };
  const pdf = async () => {
    try {
      await descargarDisponibilidadPDF(visibles, cifras, criterios, user?.companyName ?? '');
      toast('PDF descargado');
    } catch (err) { aviso(err); }
  };
  const whatsapp = async () => {
    try {
      const r = await compartirDisponibilidadPDF(visibles, cifras, criterios, user?.companyName ?? '');
      if (r === 'descargado') toast('PDF descargado. Adjúntalo en la conversación de WhatsApp.');
    } catch (err) { aviso(err); }
  };

  if (seleccionado) {
    return (
      <Page push>
        <DisponibilidadDetalle
          veh={seleccionado}
          onVolver={() => setSeleccionado(null)}
          onEditar={puedeEditar && seleccionado.id ? () => setFormulario({ veh: seleccionado }) : undefined}
          onEliminar={puedeEliminar && seleccionado.id ? () => setPorEliminar(seleccionado) : undefined}
        />
        <DisponibilidadFormulario open={!!formulario} veh={formulario?.veh ?? null} usuario={user?.name ?? ''}
          onClose={() => { setFormulario(null); setSeleccionado(null); }} />
        <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
          title="¿Eliminar este registro?" message="Se quita la unidad de la disponibilidad. No afecta el registro de placas." confirmLabel="Eliminar" />
      </Page>
    );
  }

  const actualizado = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
  const kpis: Array<{ clave: Filtro; label: string; valor: number; icono: React.ReactNode }> = [
    { clave: 'Todos', label: 'Total flota', valor: cifras.total, icono: <Briefcase size={18} strokeWidth={1.9} /> },
    { clave: 'En Base', label: 'En base', valor: cifras.base, icono: <MapPin size={18} strokeWidth={1.9} /> },
    { clave: 'En Ruta', label: 'En ruta', valor: cifras.ruta, icono: <Navigation size={18} strokeWidth={1.9} /> },
    { clave: 'En Mantenimiento', label: 'En mantenimiento', valor: cifras.mantenimiento, icono: <Wrench size={18} strokeWidth={1.9} /> },
  ];

  return (
    <Page wide fill>
      <PageHeader
        eyebrow="Flota"
        title="Disponibilidad de flota"
        subtitle={isLoading ? 'Cargando…' : `Control de disponibilidad operativa y asignación de flota${actualizado ? ` · ${actualizado}` : ''}`}
        actions={
          <div className="disp-acciones">
            <Button variant="plain" className="btn--icono btn--icono-acento" icon={<RefreshCw size={18} />} aria-label="Actualizar" title="Actualizar"
              onClick={() => qc.invalidateQueries({ queryKey: ['flota', 'disponibilidad'] })} />
            <Button variant="plain" className="btn--icono btn--icono-whatsapp" icon={<MessageCircle size={18} />} aria-label="Compartir PDF por WhatsApp" title="Compartir PDF por WhatsApp"
              disabled={!visibles.length} onClick={whatsapp} />
            <Button variant="plain" className="btn--icono btn--icono-pdf" icon={<FileText size={18} />} aria-label="Descargar PDF" title="Descargar PDF"
              disabled={!visibles.length} onClick={pdf} />
            <Button variant="plain" className="btn--icono btn--icono-excel" icon={<FileSpreadsheet size={18} />} aria-label="Exportar Excel" title="Exportar Excel"
              disabled={!visibles.length} onClick={excel} />
            <MenuOtros opciones={[
              { label: 'GPS, conductores y reportes', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/disponibilidad') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ veh: null })}>Registrar unidad</Button>}
          </div>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="disp-pagina" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="disp-kpis">
            {kpis.map((k, i) => (
              <motion.button key={k.clave} type="button" className={`disp-kpi pressable disp-kpi--${KPI_TONO[k.clave]}`}
                aria-pressed={filtro === k.clave}
                onClick={() => { haptic('selection'); setFiltro(f => (f === k.clave ? 'Todos' : k.clave)); }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 * i }}>
                <span>
                  <span className="disp-kpi__label">{k.label}</span>
                  <AnimatedNumber value={k.valor} className="disp-kpi__valor t-numeric" />
                </span>
                <span className="disp-kpi__icono" aria-hidden>{k.icono}</span>
              </motion.button>
            ))}
          </div>

          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Buscar camión, carreta, chofer…"
            activos={(empresa !== 'TODAS' ? 1 : 0) + (filtro !== 'Todos' ? 1 : 0)} onAbrirFiltros={() => setFiltrando(true)}>
            <div className="placas-toolbar__vista" role="group" aria-label="Vista">
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'tablero'} onClick={() => setVista('tablero')} aria-label="Ver tablero"><LayoutGrid size={18} /></button>
              <button type="button" className="placas-vista-btn pressable" aria-pressed={vista === 'graficos'} onClick={() => setVista('graficos')} aria-label="Ver gráficos"><BarChart3 size={18} /></button>
            </div>
          </BarraFiltros>
          <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={(empresa !== 'TODAS' ? 1 : 0) + (filtro !== 'Todos' ? 1 : 0)}
            onLimpiar={() => { setEmpresa('TODAS'); setFiltro('Todos'); }} resultado={visibles.length} unidad="unidad">
            <GrupoFiltro titulo="Empresa">
              <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre }))]} />
            </GrupoFiltro>
            <GrupoFiltro titulo="Estado">
              <ChoiceChips label="Estado" value={filtro} onChange={v => setFiltro(v as Filtro)} options={[
                { value: 'Todos', label: 'Todos' }, { value: 'En Base', label: 'En base' }, { value: 'En Ruta', label: 'En ruta' }, { value: 'En Mantenimiento', label: 'En mantenimiento' },
              ]} />
            </GrupoFiltro>
          </HojaFiltros>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin vehículos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'No hay vehículos para los filtros actuales.'}
            </EmptyState>
          ) : vista === 'graficos' ? (
            <div className="disp-tabla-wrap">
              <table className="disp-matriz">
                <thead>
                  <tr><th>Sub tipo de unidad</th><th>Total</th><th>En base</th><th>En ruta</th><th>En mantenimiento</th></tr>
                </thead>
                <tbody>
                  {matriz.map(([nombre, f]) => (
                    <tr key={nombre}><td>{nombre}</td><td>{f.total}</td><td>{f.base}</td><td>{f.ruta}</td><td>{f.mantenimiento}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {/* Escritorio: tabla */}
              <div className="disp-tabla-wrap disp-solo-escritorio">
                <table className="disp-tabla">
                  <thead>
                    <tr>
                      <th className="disp-num">#</th>
                      <th>Camión</th><th>Carreta</th><th>Conductor</th><th>Estado</th><th>Marca</th>
                      <th>Capacidad de tanque</th><th>Tipo unidad</th><th>Observaciones</th><th>Ubicación GPS</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((v, i) => {
                      const cat = categoria(v);
                      return (
                        <tr key={`${v.id ?? i}-${v.placa_camion}`} className="disp-fila pressable" onClick={() => { haptic('selection'); setSeleccionado(v); }}>
                          <td className="disp-num">{i + 1}</td>
                          <td>{v.placa_camion ? <LicensePlate plate={v.placa_camion} size="sm" /> : <span className="disp-sin">—</span>}</td>
                          <td>{v.placa_carreta ? <LicensePlate plate={v.placa_carreta} size="sm" /> : <span className="disp-sin">—</span>}</td>
                          <td className="disp-conductor">{v.conductor_asignado || <span className="disp-sin">—</span>}</td>
                          <td>
                            <span className={`disp-estado disp-estado--${COLOR_ESTADO[cat]}`}>{v.estado || cat}</span>
                            {v.aviso_viaje && <span className="t-caption c-secondary" style={{ display: 'block', maxWidth: 280, marginTop: 4 }}>{v.aviso_viaje}</span>}
                          </td>
                          <td>{v.marca || <span className="disp-sin">—</span>}</td>
                          <td>{v.capacidad_tanque || <span className="disp-sin">—</span>}</td>
                          <td>{v.tipo_unidad || <span className="disp-sin">—</span>}</td>
                          <td className="disp-obs">{v.observaciones || <span className="disp-sin">—</span>}</td>
                          <td><GpsCelda v={v} mapa={mapaGps} /></td>
                          <td className="disp-celda-acciones"><span className="disp-botones">
                            {puedeEditar && v.id && (
                              <Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} aria-label="Editar"
                                onClick={e => { e.stopPropagation(); setFormulario({ veh: v }); }} />
                            )}
                            {puedeEliminar && v.id && (
                              <Button variant="secondary" size="sm" iconOnly icon={<Trash2 size={14} />} aria-label="Eliminar"
                                onClick={e => { e.stopPropagation(); setPorEliminar(v); }} />
                            )}
                          </span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Celular: tarjetas como en la versión actual */}
              <div className="disp-lista-movil disp-solo-movil">
                {visibles.map((v, i) => {
                  const cat = categoria(v);
                  return (
                    <article key={`${v.id ?? i}-${v.placa_camion}`} className="disp-mcard pressable" onClick={() => { haptic('selection'); setSeleccionado(v); }}>
                      <div className="disp-mcard__cab">
                        {v.placa_camion ? <LicensePlate plate={v.placa_camion} size="sm" /> : <span className="disp-sin">—</span>}
                        {v.placa_carreta && <LicensePlate plate={v.placa_carreta} size="sm" />}
                        <span className={`disp-estado disp-estado--${COLOR_ESTADO[cat]}`}>{v.estado || cat}</span>
                        {v.aviso_viaje && <span className="t-caption c-secondary">{v.aviso_viaje}</span>}
                      </div>
                      <strong className="disp-mcard__titulo">{v.conductor_asignado || 'Sin conductor asignado'}</strong>
                      <span className="disp-mcard__sub">{[v.marca, v.tipo_unidad, v.capacidad_tanque && `Tanque: ${v.capacidad_tanque}`].filter(Boolean).join(' • ')}</span>
                      {v.observaciones && <span className="disp-mcard__obs">{v.observaciones}</span>}
                      <GpsCelda v={v} mapa={mapaGps} />
                      {puedeEditar && v.id && (
                        <div className="disp-mcard__pie">
                          <Button variant="secondary" size="sm" icon={<Pencil size={14} />}
                            onClick={e => { e.stopPropagation(); setFormulario({ veh: v }); }}>Editar</Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <DisponibilidadFormulario open={!!formulario} veh={formulario?.veh ?? null} usuario={user?.name ?? ''} onClose={() => setFormulario(null)} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title="¿Eliminar este registro?" message="Se quita la unidad de la disponibilidad. No afecta el registro de placas." confirmLabel="Eliminar" />
    </Page>
  );
}

/** Ubicación del GPS de la unidad (camión o carreta), con enlace al mapa */
function GpsCelda({ v, mapa }: { v: VehiculoDisponibilidad; mapa: Map<string, UbicacionGps> }) {
  const g = mapa.get(placaLimpia(v.placa_camion || v.placa_carreta || ''));
  if (!g) return <span className="disp-sin">Sin señal GPS</span>;
  const texto = g.ubicacion || `${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`;
  return (
    <a className="disp-gps" href={`https://maps.google.com/maps?q=${g.lat},${g.lng}`} target="_blank" rel="noopener noreferrer"
      title={texto} onClick={e => e.stopPropagation()}>
      <MapPin size={14} strokeWidth={2} />
      <span>{texto}</span>
    </a>
  );
}

function DisponibilidadDetalle({ veh, onVolver, onEditar, onEliminar }: {
  veh: VehiculoDisponibilidad; onVolver: () => void; onEditar?: () => void; onEliminar?: () => void;
}) {
  const color = estadoDispColor(veh.estado);
  const placaPrincipal = veh.placa_camion || veh.placa_carreta;
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Disponibilidad
        </button>
        {(onEditar || onEliminar) && (
          <div className="tarjeta__barra-acciones">
            {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
            {onEditar && <Button variant="primary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          </div>
        )}
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{veh.estado}</span>
        <h2 className="ot-ficha__placa">{placaPrincipal}</h2>
        <span className="ot-ficha__id">{[veh.sub_tipo, veh.tipo_unidad].filter(Boolean).join(' · ')}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Unidad</p>
        <div className="tarjeta__lista">
          {veh.placa_camion && <div className="dato"><span className="dato__label">Placa camión</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{veh.placa_camion}</span></div>}
          {veh.placa_carreta && <div className="dato"><span className="dato__label">Placa carreta</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{veh.placa_carreta}</span></div>}
          {veh.marca && <div className="dato"><span className="dato__label">Marca</span><span className="dato__valor">{veh.marca}</span></div>}
          {veh.empresa && <div className="dato"><span className="dato__label">Empresa</span><span className="dato__valor">{veh.empresa}</span></div>}
          {veh.capacidad_tanque && veh.capacidad_tanque !== '—' && <div className="dato"><span className="dato__label">Capacidad tanque</span><span className="dato__valor">{veh.capacidad_tanque}</span></div>}
        </div>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Estado actual</p>
        <div className="tarjeta__lista">
          {veh.conductor_asignado && <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{veh.conductor_asignado}</span></div>}
          {veh.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{veh.observaciones}</span></div>}
          {!veh.conductor_asignado && !veh.observaciones && (
            <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin detalles adicionales</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
