import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, CircleAlert, ClipboardList, FileSpreadsheet, FolderOpen, LayoutGrid, MapPin, Pencil, Play, RefreshCw, SearchX, Trash2, Truck, Wallet,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { IconoFila } from '../../core/ui/IconoFila';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import type { ReactNode } from 'react';
import { OrdenServicioSheet } from './OrdenServicioSheet';
import { SeguimientoServicio } from './SeguimientoServicio';
import { Pestanas, PuntosStrip, TituloFicha } from './FichaCards';
import { fechaGuia, fmtKg, useGuias } from './guiasApi';
import { PastillaGuia } from './PastillaGuia';
import { BitacoraViaje, HeroViaje, KpisViaje, UnidadCargaViaje } from './ViajeResumen';
import './seguimiento.css';
import { SeccionGastosViaje, SeccionOrdenesServicioViaje } from './ViajeExtras';
import { SeccionGpsViaje } from './ViajeCombustibleGps';
import { usePlacas } from '../placas/api';

interface Viaje {
  id: number;
  viaje: string;
  fecha_viaje: string | null;
  id_conductor: number | null;
  conductor: string | null;
  placa_tracto: string | null;
  placa_remolque: string | null;
  peso: number | string | null;
  ruta: string | null;
  origen: string | null;
  destino: string | null;
  ubigeo_partida: string | null;
  direccion_partida: string | null;
  ubigeo_llegada: string | null;
  direccion_llegada: string | null;
  escolta: string | null;
  observaciones: string | null;
  ejecucion?: string | null;
  tercero_nombre?: string | null;
  tercero_ruc?: string | null;
  tercero_costo?: number | string | null;
  tercero_moneda?: string | null;
  tercero_documento?: string | null;
  estado: string;                       // ACTIVO | INICIADO | FINALIZADO | LIQUIDADO | ANULADO
  fecha_inicio: string | null;
  fecha_fin: string | null;
  kilometraje_inicial: number | null;
  kilometraje_final: number | null;
  horas_motor_remolque: number | null;
  usuario_creacion: string | null;
  registrado_fmt?: string | null;
  km_recorrido_gps?: number | string | null;
  distancia_km?: number | string | null;
  conductor_telefono?: string | null;
  configuracion_tracto?: string | null;
  configuracion_remolque?: string | null;
  ordenes_list_extra?: never;
  cant_ordenes: number;
  peso_ida: number | string;
  peso_retorno: number | string;
  ordenes_list: string | null;
  rutas_list: string | null;
}

// Columnas de la tabla de órdenes de viaje
const COLUMNAS_VIAJE: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 130, minimo: 110 },
  { id: 'estado', titulo: 'Estado', ancho: 130 },
  { id: 'viaje', titulo: 'N° viaje', ancho: 140, minimo: 110 },
  { id: 'fecha', titulo: 'Fecha', ancho: 150 },
  { id: 'conductor', titulo: 'Conductor', ancho: 200 },
  { id: 'tracto', titulo: 'Tracto', ancho: 140 },
  { id: 'carreta', titulo: 'Carreta', ancho: 140 },
  { id: 'ruta', titulo: 'Ruta / origen → destino', ancho: 260, minimo: 140 },
  { id: 'peso-ida', titulo: 'Peso ida', ancho: 105, alinear: 'right' },
  { id: 'peso-ret', titulo: 'Peso retorno', ancho: 120, alinear: 'right' },
  { id: 'ordenes', titulo: 'Cant. órdenes', ancho: 120, alinear: 'right' },
  { id: 'km-ini', titulo: 'Km inicio', ancho: 110, alinear: 'right' },
  { id: 'km-fin', titulo: 'Km fin', ancho: 110, alinear: 'right' },
  { id: 'recorrido', titulo: 'Recorrido', ancho: 110, alinear: 'right' },
];

// Pastilla de color del tema (mismos tonos que el resto de la app)
function Pastilla({ tono: t, children }: { tono: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `var(--${t}-tint)`, color: `var(--${t}-ink)`, fontSize: '0.6875rem', fontWeight: 700 }}>
      {children}
    </span>
  );
}

const ESTADOS = ['ACTIVO', 'INICIADO', 'FINALIZADO', 'LIQUIDADO', 'ANULADO'];
const n = (v: unknown) => Number(v) || 0;
const tono = (e: string) => ({ ACTIVO: 'amber', INICIADO: 'blue', FINALIZADO: 'green', LIQUIDADO: 'green', ANULADO: 'neutral' }[e] ?? 'neutral') as 'amber' | 'blue' | 'green' | 'neutral';
const css = (t: string) => (t === 'neutral' ? 'gray' : t);
// Fecha peruana dd/mm/aaaa HH:mm, sin cambio de zona horaria
const fmtFecha = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : '—'; };
const esMarsisa = typeof window !== 'undefined' && window.location.hostname.split('.')[0].toLowerCase().includes('marsisa');

// Placas con SOAT o Revisión Técnica vencidos (las calcula el servidor)
interface DocVencido { placa: string; tipo: string; vence: string }
const placaNorm = (p: string | null | undefined) => String(p ?? '').trim().toUpperCase();
function useDocumentosVencidos() {
  return useQuery<DocVencido[]>({
    queryKey: ['operaciones', 'documentos-vencidos'],
    queryFn: () => api<{ ok?: boolean; vencidos?: DocVencido[] }>('/operaciones/documentos-vencidos').then(r => r.vencidos ?? []),
    staleTime: 5 * 60_000,
  });
}

function useViajes(q: string) {
  return useQuery<Viaje[]>({
    queryKey: ['operaciones', 'ordenes-viaje', q],
    queryFn: () => api<{ data?: Viaje[] }>(`/operaciones/ordenes-viaje?limit=500${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(r => r.data ?? []),
    staleTime: 20_000,
  });
}

// Operaciones › Órdenes de viaje
export function OrdenesViajePage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  // ?viaje=V-0001 abre la ficha de ese viaje (lo usa Programación); el parámetro se quita al abrirla
  const [params, setParams] = useSearchParams();
  const [abiertoId, setAbiertoId] = useState<string | null>(params.get('viaje'));
  useEffect(() => { if (params.get('viaje')) setParams({}, { replace: true }); }, [params, setParams]);
  const [formulario, setFormulario] = useState<{ viaje: Viaje | null } | null>(null);
  const [accion, setAccion] = useState<{ tipo: 'iniciar' | 'finalizar'; viaje: Viaje } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Viaje | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nuevaOS, setNuevaOS] = useState<string | null>(null);
  const [sincronizar, setSincronizar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const { data, isLoading, isError, error } = useViajes(q);
  const docsVencidos = useDocumentosVencidos();
  const vencidosPorPlaca = useMemo(() => {
    const m = new Map<string, string[]>();
    (docsVencidos.data ?? []).forEach(d => m.set(placaNorm(d.placa), [...(m.get(placaNorm(d.placa)) ?? []), d.tipo === 'SOAT' ? 'SOAT' : 'Revisión Técnica']));
    return m;
  }, [docsVencidos.data]);
  const lista = data ?? [];
  const abierto = lista.find(v => v.viaje === abiertoId) ?? null;
  const visibles = useMemo(() => lista.filter(v => !estado || v.estado === estado), [lista, estado]);
  const puedeCrear = can('op_ordenes_viaje.crear', 'op_programacion.crear');
  const puedeEditar = can('op_ordenes_viaje.editar', 'op_ordenes_viaje.crear', 'op_programacion.editar');
  const puedeEliminar = can('op_ordenes_viaje.eliminar');

  const conteo = useMemo(() => Object.fromEntries(ESTADOS.map(e => [e, lista.filter(v => v.estado === e).length])), [lista]);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['operaciones'] });

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-viaje/${encodeURIComponent(porEliminar.viaje)}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast(`Viaje ${porEliminar.viaje} eliminado`);
      setPorEliminar(null); setAbiertoId(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Ordenes-de-viaje', 'Viajes',
        ['Viaje', 'Fecha', 'Estado', 'Conductor', 'Tracto', 'Remolque', 'Ruta', 'Peso ida', 'Peso retorno', 'Órdenes de servicio', 'Km inicial', 'Km final', 'Inicio', 'Fin'],
        visibles.map(v => [v.viaje, fmtFecha(v.fecha_viaje), v.estado, v.conductor, v.placa_tracto, v.placa_remolque, v.ruta,
          n(v.peso_ida), n(v.peso_retorno), v.ordenes_list, v.kilometraje_inicial, v.kilometraje_final, fmtFecha(v.fecha_inicio), fmtFecha(v.fecha_fin)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de viaje"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} viajes · ${conteo.INICIADO ?? 0} en ruta`}
        actions={
          <>
            <AccionesCabecera etiqueta="Acciones de órdenes de viaje" acciones={[
              { label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, tono: 'verde', onClick: exportar },
              // Solo la empresa Marsisa tiene base externa; el servidor responde syncSkipped en las demás (mismo criterio que la navegación)
              puedeCrear && esMarsisa && { label: 'Sincronizar con MarsisaSoft', icon: <RefreshCw size={17} />, tono: 'violeta', onClick: () => setSincronizar(true) },
            ]} />
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <BarraFiltros busqueda={busqueda} placeholder="Viaje, conductor, placa o ruta…" activos={estado ? 1 : 0} onAbrirFiltros={() => setFiltrando(true)}
          onBusqueda={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _ovT?: number })._ovT); (window as unknown as { _ovT?: number })._ovT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={estado ? 1 : 0} onLimpiar={() => setEstado('')} resultado={visibles.length} unidad="viaje">
          <GrupoFiltro titulo="Estado">
            <ListaEleccion value={estado} onChange={setEstado} opciones={[{ value: '', label: 'Todos', count: lista.length }, ...ESTADOS.map(e => ({ value: e, label: e.charAt(0) + e.slice(1).toLowerCase(), count: conteo[e] ?? 0 }))]} />
          </GrupoFiltro>
        </HojaFiltros>

        {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <Truck size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin viajes'}>
            {!busqueda && !estado ? <>Los viajes se generan desde <strong>Órdenes de servicio</strong>.</> : 'Prueba con otro filtro.'}
          </EmptyState>
        ) : (
          <TablaRedimensionable id="ordenes-viaje-v2" columnas={COLUMNAS_VIAJE} ariaLabel="Órdenes de viaje" className="tabla-redim--compacta">
            {visibles.map(v => {
              const t = css(tono(v.estado)) as string;
              const vencidoTracto = vencidosPorPlaca.has(placaNorm(v.placa_tracto));
              const vencidoCarreta = vencidosPorPlaca.has(placaNorm(v.placa_remolque));
              const recorrido = v.kilometraje_inicial != null && v.kilometraje_final != null ? n(v.kilometraje_final) - n(v.kilometraje_inicial) : null;
              return (
                <tr key={v.viaje} className="tabla-redim__fila--click" onClick={() => { haptic('selection'); setAbiertoId(v.viaje); }}>
                  <Celda>
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      {puedeEditar && v.estado !== 'FINALIZADO' && v.estado !== 'LIQUIDADO' && v.estado !== 'ANULADO' && (
                        <IconoFila texto="Editar" tono="ambar" icono={<Pencil size={15} />} onClick={() => setFormulario({ viaje: v })} />
                      )}
                      {puedeEditar && v.estado === 'ACTIVO' && <IconoFila texto="Iniciar viaje" tono="verde" icono={<Play size={15} />} onClick={() => setAccion({ tipo: 'iniciar', viaje: v })} />}
                      {puedeEditar && v.estado === 'INICIADO' && <IconoFila texto="Finalizar viaje" tono="verde" icono={<CheckCircle2 size={15} />} onClick={() => setAccion({ tipo: 'finalizar', viaje: v })} />}
                    </span>
                  </Celda>
                  <Celda><Pastilla tono={t}>{v.estado}</Pastilla></Celda>
                  <Celda mono>{v.viaje}</Celda>
                  <Celda mono>{fmtFecha(v.fecha_viaje)}</Celda>
                  <Celda>{v.conductor || 'Sin conductor'}</Celda>
                  <Celda>
                    {v.placa_tracto ? <span className="tbl-placa">{v.placa_tracto}</span> : '—'}
                    {vencidoTracto && <span title={`${v.placa_tracto}: documento vencido`} style={{ marginLeft: 6 }}><CircleAlert size={14} style={{ color: 'var(--red-ink)', verticalAlign: 'middle' }} aria-label="Documento vencido" /></span>}
                  </Celda>
                  <Celda>
                    {v.placa_remolque ? <span className="tbl-placa">{v.placa_remolque}</span> : '—'}
                    {vencidoCarreta && <span title={`${v.placa_remolque}: documento vencido`} style={{ marginLeft: 6 }}><CircleAlert size={14} style={{ color: 'var(--red-ink)', verticalAlign: 'middle' }} aria-label="Documento vencido" /></span>}
                  </Celda>
                  <Celda>{v.ruta || v.rutas_list || [v.origen, v.destino].filter(Boolean).join(' → ') || '—'}</Celda>
                  <Celda alinear="right" mono>{n(v.peso_ida).toLocaleString('es-PE')}</Celda>
                  <Celda alinear="right" mono>{n(v.peso_retorno).toLocaleString('es-PE')}</Celda>
                  <Celda alinear="right" mono>{n(v.cant_ordenes)}</Celda>
                  <Celda alinear="right" mono>{v.kilometraje_inicial != null ? n(v.kilometraje_inicial).toLocaleString('es-PE') : '—'}</Celda>
                  <Celda alinear="right" mono>{v.kilometraje_final != null ? n(v.kilometraje_final).toLocaleString('es-PE') : '—'}</Celda>
                  <Celda alinear="right" mono>{recorrido != null && recorrido >= 0 ? recorrido.toLocaleString('es-PE') : '—'}</Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
        )}
      </div>

      <DetalleViaje
        viaje={abierto}
        onClose={() => setAbiertoId(null)}
        onEditar={puedeEditar && abierto && abierto.estado !== 'FINALIZADO' && abierto.estado !== 'LIQUIDADO' ? () => setFormulario({ viaje: abierto }) : undefined}
        onIniciar={puedeEditar && abierto?.estado === 'ACTIVO' ? () => setAccion({ tipo: 'iniciar', viaje: abierto }) : undefined}
        onFinalizar={puedeEditar && abierto?.estado === 'INICIADO' ? () => setAccion({ tipo: 'finalizar', viaje: abierto }) : undefined}
        onEliminar={puedeEliminar && abierto ? () => setPorEliminar(abierto) : undefined}
        onNuevaOS={puedeEditar && abierto ? () => { setNuevaOS(abierto.viaje); setAbiertoId(null); } : undefined}
        puedeEditarViaje={puedeEditar}
      />
      <OrdenServicioSheet open={!!nuevaOS} orden={null} viajeInicial={nuevaOS ?? ''} onClose={() => { setNuevaOS(null); refrescar(); }} />
      <ConfirmSheet open={sincronizar} onClose={() => !sincronizando && setSincronizar(false)} loading={sincronizando}
        title="¿Sincronizar viajes con MarsisaSoft?" message="Trae los viajes nuevos desde la base externa. Los que ya existen no se duplican." confirmLabel="Sincronizar"
        onConfirm={async () => {
          setSincronizando(true);
          try {
            const r = await api<{ ok?: boolean; insertados?: number; syncSkipped?: boolean; error?: string; mensaje?: string }>('/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
            if (r.ok === false) throw new Error(r.error || 'No se pudo sincronizar');
            haptic('success'); toast(r.mensaje ?? `Sincronizados: ${r.insertados ?? 0} viajes nuevos`);
            setSincronizar(false);
            await refrescar();
          } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
          finally { setSincronizando(false); }
        }} />
      <FormularioViaje open={!!formulario} viaje={formulario?.viaje ?? null} usuario={user?.name ?? ''} onClose={() => setFormulario(null)} onGuardado={refrescar} />
      <AccionViaje accion={accion} usuario={user?.name ?? ''} onClose={() => setAccion(null)} onHecho={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title={`¿Eliminar el viaje ${porEliminar?.viaje ?? ''}?`} message="Sus órdenes de servicio no se borran: vuelven a «Pendiente» para programarlas en otro viaje. No se puede deshacer." confirmLabel="Eliminar" />
    </Page>
  );
}

// Guías de las órdenes de servicio que lleva el viaje (su peso es el real)
function GuiasDelViaje({ viaje }: { viaje: string }) {
  const q = useGuias({ viaje });
  const lista = (q.data ?? []).filter(g => g.estado !== 'ANULADA');
  if (q.isLoading) return <PageLoader />;
  if (!lista.length) return <EmptyState icon={<FolderOpen size={22} />} title="Sin guías vinculadas">Vincula las guías de los clientes a las órdenes de servicio de este viaje, desde Guías de remisión.</EmptyState>;
  return (
    <section>
      <h4 className="vj-titulo">Guías del viaje · {lista.length} · {fmtKg(lista.filter(g => g.tipo === 'REMITENTE').reduce((s, g) => s + Number(g.peso_kg || 0), 0))}</h4>
      <ul className="vb__lista">
        {lista.map(g => (
          <li key={g.id} className="vb__fila">
            <span className="vb__ico vb__ico--azul" aria-hidden><FolderOpen size={16} /></span>
            <div className="vb__txt"><strong>{g.numero_completo}</strong><span>{[g.destinatario_nombre || g.remitente_nombre, g.orden_servicio_codigo ? `Servicio ${g.orden_servicio_codigo}` : null, fechaGuia(g.fecha_emision)].filter(Boolean).join(' · ')}</span></div>
            <PastillaGuia estado={g.estado} guia={g} />
            <strong className="vb__monto">{fmtKg(g.peso_kg)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

type TabViaje = 'resumen' | 'ordenes' | 'guias' | 'gps' | 'liquidaciones';
const TABS_VIAJE: { id: TabViaje; label: string; icono: ReactNode }[] = [
  { id: 'resumen', label: 'Resumen', icono: <LayoutGrid size={15} /> },
  { id: 'ordenes', label: 'Órdenes', icono: <ClipboardList size={15} /> },
  { id: 'guias', label: 'Guías', icono: <FolderOpen size={15} /> },
  { id: 'gps', label: 'GPS', icono: <MapPin size={15} /> },
  { id: 'liquidaciones', label: 'Liquidación', icono: <Wallet size={15} /> },
];

// El estado del viaje expresado en las etapas del seguimiento
const etapaDelViaje = (v: Viaje) => (v.estado === 'INICIADO' ? 'EN_EJECUCION'
  : v.estado === 'FINALIZADO' || v.estado === 'LIQUIDADO' ? 'ENTREGADO'
  : v.estado === 'ANULADO' ? 'ANULADO'
  : v.conductor || v.placa_tracto || v.tercero_nombre ? 'PROGRAMADO' : 'PENDIENTE');

function DetalleViaje({ viaje: v, onClose, onEditar, onIniciar, onFinalizar, onEliminar, onNuevaOS, puedeEditarViaje }: {
  viaje: Viaje | null; onClose: () => void; onEditar?: () => void; onIniciar?: () => void; onFinalizar?: () => void; onEliminar?: () => void; onNuevaOS?: () => void; puedeEditarViaje: boolean;
}) {
  const [tab, setTab] = useState<TabViaje>('resumen');
  // Cada viaje que se abre empieza en el resumen
  useEffect(() => { setTab('resumen'); }, [v?.viaje]);

  const vencidos = useDocumentosVencidos();
  const placasViaje = [placaNorm(v?.placa_tracto), placaNorm(v?.placa_remolque)].filter(Boolean);
  const alertas = (vencidos.data ?? []).filter(d => placasViaje.includes(placaNorm(d.placa))).map(d => ({ ...d, vence: String(d.vence).slice(0, 10).split('-').reverse().join('/') }));
  const tabs = TABS_VIAJE.map(t => (t.id === 'ordenes' && v ? { ...t, n: n(v.cant_ordenes) } : t));
  const datosSeg = v ? {
    codigo_orden: v.viaje,
    cliente_nombre: [v.conductor, v.placa_tracto].filter(Boolean).join(' · ') || 'Sin unidad asignada',
    origen: v.origen, destino: v.destino, distancia_km: v.distancia_km, creado_fmt: v.registrado_fmt,
    viajes: [{
      viaje: v.viaje, estado: v.estado, conductor: v.conductor, placa_tracto: v.placa_tracto, placa_remolque: v.placa_remolque,
      ejecucion: v.ejecucion, tercero_nombre: v.tercero_nombre, fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin,
      km_recorrido_gps: v.km_recorrido_gps, conductor_telefono: v.conductor_telefono,
    }],
  } : null;
  return (
    <Sheet extra open={!!v} onClose={onClose}
      title={v ? <TituloFicha codigo={`Viaje ${v.viaje}`} estado={<Pastilla tono={css(tono(v.estado)) as string}>{v.estado}</Pastilla>}
        sub={[v.fecha_viaje ? `Fecha del viaje ${fmtFecha(v.fecha_viaje)}` : null, v.ordenes_list ? `Órdenes ${v.ordenes_list}` : null].filter(Boolean).join(' · ')} /> : ''}
      footer={
        <>
          {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
          {onEditar && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          {onIniciar && <Button variant="primary" icon={<Play size={16} />} onClick={onIniciar}>Iniciar viaje</Button>}
          {onFinalizar && <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={onFinalizar}>Finalizar</Button>}
          {!onEliminar && !onEditar && !onIniciar && !onFinalizar && <Button variant="secondary" onClick={onClose}>Cerrar</Button>}
        </>
      }>
      {v && datosSeg && (
        <div className="fd">
          <HeroViaje v={v} etapa={etapaDelViaje(v)} datos={<SeguimientoServicio tipo="viaje" parte="pista" estado={etapaDelViaje(v)} o={datosSeg} />} />
          <KpisViaje v={v} />
          <Pestanas tabs={tabs} valor={tab} onChange={setTab} />

          <div className="vj-panel" key={tab} role="tabpanel">
            {tab === 'resumen' && (
              <>
                <div className="vr">
                  <BitacoraViaje v={v} />
                  <UnidadCargaViaje v={v} alertas={alertas} />
                </div>
                <PuntosStrip
                  carga={{ titulo: v.origen, detalle: v.direccion_partida, extra: v.ubigeo_partida ? `Ubigeo ${v.ubigeo_partida}` : null }}
                  descarga={{ titulo: v.destino, detalle: v.direccion_llegada, extra: v.ubigeo_llegada ? `Ubigeo ${v.ubigeo_llegada}` : null }} />
              </>
            )}
            {tab === 'ordenes' && <SeccionOrdenesServicioViaje codigo={v.viaje} onNueva={onNuevaOS ?? (() => undefined)} puedeCrear={!!onNuevaOS} />}
            {tab === 'guias' && <GuiasDelViaje viaje={v.viaje} />}
            {tab === 'gps' && <SeccionGpsViaje placa={v.placa_tracto} inicio={v.fecha_inicio} fin={v.fecha_fin} />}
            {tab === 'liquidaciones' && <SeccionGastosViaje codigo={v.viaje} conductor={v.conductor} placa={v.placa_tracto} puedeEditar={puedeEditarViaje} />}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function AccionViaje({ accion, usuario, onClose, onHecho }: {
  accion: { tipo: 'iniciar' | 'finalizar'; viaje: Viaje } | null; usuario: string; onClose: () => void; onHecho: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [km, setKm] = useState('');
  const [horas, setHoras] = useState('');
  const [errKm, setErrKm] = useState<string | undefined>();
  const [kmGps, setKmGps] = useState(false);
  const [fecha, setFecha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accion) return;
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setFecha(d.toISOString().slice(0, 16)); setError(null);
    setKm(accion.tipo === 'iniciar' ? String(accion.viaje.kilometraje_inicial ?? '') : ''); setKmGps(false);
    setHoras(String(accion.viaje.horas_motor_remolque ?? ''));
  }, [accion]);

  // El kilometraje se sugiere con el odómetro del GPS de la placa en esa fecha; la persona puede corregirlo
  const placaGps = accion?.viaje.placa_tracto ?? '';
  const diaGps = fecha.slice(0, 10);
  const gps = useQuery({
    queryKey: ['operaciones', 'km-gps', placaGps, diaGps], enabled: !!accion && !!placaGps && /^\d{4}-\d{2}-\d{2}$/.test(diaGps), staleTime: 60_000,
    queryFn: () => api<{ km: number | null; fecha: string | null }>(`/neumaticos/km-gps/${encodeURIComponent(placaGps)}`, { query: { fecha: diaGps } }),
  });
  useEffect(() => {
    if (accion && gps.data?.km != null && gps.data.km > 0 && !km) { setKm(String(Math.round(gps.data.km))); setKmGps(true); }
  }, [gps.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!accion) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const iniciar = accion.tipo === 'iniciar';
  const v = accion.viaje;

  async function confirmar() {
    if (!accion) return;
    if (!km) { setErrKm(iniciar ? 'Indica el kilometraje inicial.' : 'Indica el kilometraje final.'); haptic('warning'); return; }
    if (!iniciar && accion.viaje.kilometraje_inicial != null && Number(km) < accion.viaje.kilometraje_inicial) {
      setErrKm('El kilometraje final no puede ser menor al inicial.'); haptic('warning'); return;
    }
    setEnviando(true); setError(null);
    try {
      const body = iniciar
        ? { fecha_inicio: fecha.replace('T', ' ') + ':00', kilometraje_inicial: km, horas_motor_remolque: horas || undefined }
        : { fecha_fin: fecha.replace('T', ' ') + ':00', kilometraje_final: km, usuario_finalizacion: usuario };
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(
        `/operaciones/ordenes-viaje/${encodeURIComponent(accion.viaje.viaje)}/${iniciar ? 'iniciar' : 'finalizar'}`, { method: 'PUT', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo completar');
      haptic('success'); toast(r.message || (iniciar ? 'Viaje iniciado' : 'Viaje finalizado'));
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const n1 = n(v.cant_ordenes);
  const efectos = iniciar
    ? [
        n1 > 0 ? `${n1} ${n1 === 1 ? 'servicio pasa' : 'servicios pasan'} a «En ejecución»` : 'El viaje queda en ruta',
        'Se empieza a medir el recorrido con el GPS',
      ]
    : ['El viaje queda finalizado y deja de medirse el recorrido', 'Cada servicio se marca como entregado por separado'];
  return (
    <Sheet open onClose={() => !enviando && onClose()} title={iniciar ? 'Iniciar viaje' : 'Finalizar viaje'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={iniciar ? <Play size={16} /> : <CheckCircle2 size={16} />} onClick={confirmar} loading={enviando}>{iniciar ? 'Iniciar viaje' : 'Finalizar viaje'}</Button></>}>
      <div className="av">
        <div className="av__resumen">
          <span className={`av__icono${iniciar ? '' : ' av__icono--azul'}`} aria-hidden>{iniciar ? <Play size={20} /> : <CheckCircle2 size={20} />}</span>
          <div className="av__quien">
            <strong>{v.viaje}</strong>
            <span>{[v.origen, v.destino].filter(Boolean).join(' → ') || v.ruta || 'Sin ruta'}</span>
          </div>
          <div className="av__unidad">
            {v.placa_tracto ? <span className="tbl-placa">{v.placa_tracto}</span> : null}
            {v.conductor ? <small>{v.conductor}</small> : null}
          </div>
        </div>

        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <div className="av__campos">
          <Field label={iniciar ? 'Salida' : 'Llegada'} wide>
            {p => <TextInput {...p} type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />}
          </Field>
          <Field label={iniciar ? 'Kilometraje de salida' : 'Kilometraje de llegada'} error={errKm}
            hint={kmGps ? `Odómetro del GPS al ${(gps.data?.fecha ?? diaGps).split('-').reverse().join('/')}. Puedes corregirlo.` : gps.isFetching ? 'Consultando el GPS…' : placaGps ? 'Sin lectura del GPS para esta fecha: escríbelo del tablero' : undefined}>
            {p => (
              <span className="av__km">
                <TextInput {...p} inputMode="numeric" value={km} placeholder="0" autoFocus
                  onChange={e => { setKm(e.target.value.replace(/\D/g, '')); setKmGps(false); setErrKm(undefined); }} />
                <i aria-hidden>km</i>
              </span>
            )}
          </Field>
          {iniciar && (
            <Field label="Horas de motor del remolque · opcional">
              {p => <TextInput {...p} inputMode="numeric" value={horas} placeholder="0" onChange={e => setHoras(e.target.value.replace(/\D/g, ''))} />}
            </Field>
          )}
        </div>

        <ul className="av__efectos" aria-label="Qué pasa al confirmar">
          {efectos.filter(Boolean).map(t => <li key={t as string}><CheckCircle2 size={16} aria-hidden />{t}</li>)}
        </ul>
      </div>
    </Sheet>
  );
}

function FormularioViaje({ open, viaje, usuario, onClose, onGuardado }: {
  open: boolean; viaje: Viaje | null; usuario: string; onClose: () => void; onGuardado: () => Promise<unknown>;
}) {
  const toast = useToast();
  const placas = usePlacas();
  const conductores = useQuery({
    queryKey: ['operaciones', 'conductores-lista'], enabled: open,
    queryFn: () => api<{ id: number; nombre: string }[]>('/conductores-lista').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 5 * 60_000,
  });
  const [v, setV] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [errCampos, setErrCampos] = useState<Record<string, string | undefined>>({});
  const editando = !!viaje;

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const base: Record<string, string> = {
      viaje: '', fecha_viaje: d.toISOString().slice(0, 16), conductor: '', id_conductor: '', placa_tracto: '', placa_remolque: '', ruta: '', peso: '',
      direccion_partida: '', direccion_llegada: '', ubigeo_partida: '', ubigeo_llegada: '', escolta: '', observaciones: '', kilometraje_inicial: '', horas_motor_remolque: '',
      ejecucion: 'PROPIO', tercero_nombre: '', tercero_ruc: '', tercero_costo: '', tercero_moneda: 'SOLES', tercero_documento: '',
    };
    if (viaje) for (const k of Object.keys(base)) { const x = (viaje as unknown as Record<string, unknown>)[k]; if (x != null) base[k] = k === 'fecha_viaje' ? String(x).replace(' ', 'T').slice(0, 16) : String(x); }
    setV(base);
    if (!viaje) api<{ viaje?: string }>('/operaciones/ordenes-viaje/correlativo').then(r => setV(a => ({ ...a, viaje: r.viaje ?? '' }))).catch(() => undefined);
  }, [open, viaje]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const remolques = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);

  async function guardar() {
    const e: Record<string, string> = {};
    if (v.ejecucion === 'TERCERO') {
      if (!v.tercero_nombre.trim()) e.tercero_nombre = 'Indica el transportista tercero.';
    } else {
      if (!v.conductor.trim()) e.conductor = 'El conductor es obligatorio.';
      if (!v.placa_tracto) e.placa_tracto = 'El tracto es obligatorio.';
    }
    setErrCampos(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const cond = (conductores.data ?? []).find(c => c.nombre === v.conductor);
      const body = { ...v, id_conductor: cond?.id ?? (v.id_conductor || null), fecha_viaje: v.fecha_viaje ? v.fecha_viaje.replace('T', ' ') + ':00' : undefined, usuario_creacion: usuario };
      const r = editando
        ? await api<{ ok?: boolean; error?: string; advertencias?: string[] }>(`/operaciones/ordenes-viaje/${encodeURIComponent(viaje!.viaje)}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string; advertencias?: string[] }>('/operaciones/ordenes-viaje', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Viaje actualizado' : 'Viaje creado');
      await onGuardado();
      // Documentos vencidos: se guarda igual, pero el aviso queda visible hasta que el usuario cierre
      if (r.advertencias && r.advertencias.length) { setAvisos(r.advertencias); return; }
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'numeric' | 'decimal'; list?: string; disabled?: boolean }) => (
    <Field label={label} wide={o?.wide}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} disabled={o?.disabled} value={v[k] ?? ''} onChange={e => set(k, e.target.value)} />}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar viaje ${viaje?.viaje}` : 'Nuevo viaje'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<MapPin size={16} />} onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {avisos.length > 0 && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{avisos.map(a => <div key={a}>{a}</div>)}</Notice></div>}
        {txt('viaje', 'N° de viaje', { disabled: true })}
        {txt('fecha_viaje', 'Fecha y hora', { type: 'datetime-local' })}
        <div className="field field--wide">
          <SegmentedControl block label="Quién ejecuta el viaje" value={v.ejecucion === 'TERCERO' ? 'TERCERO' : 'PROPIO'} onChange={x => set('ejecucion', x)}
            options={[{ value: 'PROPIO', label: 'Flota propia' }, { value: 'TERCERO', label: 'Transportista tercero' }]} />
        </div>
        {v.ejecucion === 'TERCERO' && (<>
          <Field label="Transportista tercero *" wide error={errCampos.tercero_nombre}>{p => <TextInput {...p} value={v.tercero_nombre ?? ''} placeholder="Razón social del transportista" onChange={e => set('tercero_nombre', e.target.value)} />}</Field>
          {txt('tercero_ruc', 'RUC del transportista', { mode: 'numeric' })}
          {txt('tercero_documento', 'Documento del tercero')}
          {txt('tercero_costo', 'Costo pactado', { mode: 'decimal' })}
          <Field label="Moneda">{p => <SelectInput {...p} value={v.tercero_moneda ?? 'SOLES'} onChange={e => set('tercero_moneda', e.target.value)}><option value="SOLES">Soles (S/)</option><option value="DOLARES">Dólares (US$)</option></SelectInput>}</Field>
        </>)}
        <Field label={v.ejecucion === 'TERCERO' ? 'Conductor del tercero (opcional)' : 'Conductor'} wide error={errCampos.conductor}>
          {p => (<>
            <TextInput {...p} list="ov-conductores" value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />
            <datalist id="ov-conductores">{(conductores.data ?? []).map(c => <option key={c.id} value={c.nombre} />)}</datalist>
          </>)}
        </Field>
        <Field label={v.ejecucion === 'TERCERO' ? 'Tracto del tercero (opcional)' : 'Tracto'} error={errCampos.placa_tracto}>
          {p => (<>
            <TextInput {...p} list="ov-tractos" value={v.placa_tracto ?? ''} onChange={e => set('placa_tracto', e.target.value.toUpperCase())} />
            <datalist id="ov-tractos">{tractos.map(t => <option key={t} value={t} />)}</datalist>
          </>)}
        </Field>
        <Field label="Remolque">
          {p => (<>
            <TextInput {...p} list="ov-remolques" value={v.placa_remolque ?? ''} onChange={e => set('placa_remolque', e.target.value.toUpperCase())} />
            <datalist id="ov-remolques">{remolques.map(t => <option key={t} value={t} />)}</datalist>
          </>)}
        </Field>
        {txt('ruta', 'Ruta', { wide: true })}
        {txt('direccion_partida', 'Dirección de partida', { wide: true })}
        {txt('direccion_llegada', 'Dirección de llegada', { wide: true })}
        {txt('peso', 'Peso (kg)', { mode: 'decimal' })}
        {txt('escolta', 'Escolta')}
        {txt('kilometraje_inicial', 'Km inicial', { mode: 'numeric' })}
        {txt('horas_motor_remolque', 'Horas motor remolque', { mode: 'numeric' })}
        {txt('observaciones', 'Observaciones', { wide: true })}
      </div>
    </Sheet>
  );
}
