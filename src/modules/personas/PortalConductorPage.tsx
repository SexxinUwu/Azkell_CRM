import '../mantenimiento/mant.css';
import './portalConductor.css';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, CircleAlert, CloudOff, Fuel, MapPin, Navigation, Paperclip, Pencil, Plus, Receipt, Trash2, Truck, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { ConductorFallaSheet } from './ConductorFallaSheet';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { uuid } from '../../core/lib/uuid';
import {
  EVENTO_COLA, enviarGasto, enviarPendientes, guardarPendiente, guardarViaje, leerViaje,
  listarPendientes, quitarPendiente, sinSenal, type GastoPendiente,
} from './portalConductorCola';

type Comprobante = 'BOLETA' | 'FACTURA' | 'DECLARACION JURADA';
interface Gasto { id: number; fecha_formateada: string; tipo_gasto: string; sub_motivo: string; detalle: string; tipo_comprobante?: string | null; serie?: string | null; numero?: string | null; proveedor_ruc?: string | null; proveedor_nombre?: string | null; importe: number | string; sustento_url: string | null; estado: string; uuid_cliente?: string | null }
interface Deposito { id: number; serie: string; numero: string; motivo: string; sub_motivo: string; importe_total: number | string; tipo_movimiento: string; fecha: string; estado: string }
interface Portal {
  ok: boolean; message?: string;
  conductor?: { nombre: string; dni: string };
  sin_datos?: boolean;
  viaje?: { id: number; codigo: string; placa_tracto: string; placa_remolque: string; origen: string; destino: string; direccion_partida: string; direccion_llegada: string; ruta: string; estado: string; fecha: string } | null;
  balance?: { total_asignado: number; total_rendido: number; saldo_restante: number };
  depositos?: Deposito[];
  gastos?: Gasto[];
  /** Copia guardada en el teléfono: no hay señal */
  _sinSenal?: boolean;
  _guardadoEn?: string;
}
type Eliminar = { tipo: 'servidor'; gasto: Gasto } | { tipo: 'pendiente'; gasto: GastoPendiente };
type Seccion = 'gastos' | 'fallas' | 'vales';

const MOTIVOS = ['Balanza y pesaje', 'Cochera / Parqueo de ruta', 'Estibadores / Carga y descarga menor', 'Lavado y engrase de unidad en viaje',
  'Peajes (físico / telepeaje)', 'Pernocte / Hospedaje en ruta', 'Viáticos / Alimentación choferes'];
const s = (v: unknown) => 'S/ ' + (Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

/** Fecha local AAAA-MM-DD (la del teléfono, al registrar el gasto) */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Gastos guardados en el teléfono; se actualiza con cada cambio de la cola */
function usePendientes() {
  const [lista, setLista] = useState<GastoPendiente[]>([]);
  const recargar = useCallback(() => { listarPendientes().then(setLista).catch(() => setLista([])); }, []);
  useEffect(() => {
    recargar();
    window.addEventListener(EVENTO_COLA, recargar);
    return () => window.removeEventListener(EVENTO_COLA, recargar);
  }, [recargar]);
  return lista;
}

// Portal del conductor: entra con su propio usuario (su DNI y nombre salen de la cuenta), el sistema busca su viaje activo
// y le muestra la unidad, la ruta y tres accesos: vales de combustible, fallas en ruta y gastos en ruta.
// Sin señal: se ve la última copia guardada y los gastos quedan en el teléfono hasta enviarse.
export function PortalConductorPage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reducir = useReducedMotion();
  const pendientes = usePendientes();
  const [entrada, setEntrada] = useState('');
  const [consulta, setConsulta] = useState('');
  const [otro, setOtro] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [porEliminar, setPorEliminar] = useState<Eliminar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<Seccion | null>(null);
  const [reportando, setReportando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const puedeConsultarOtro = can('usuarios.editar');

  const q = useQuery<Portal>({
    queryKey: ['personas', 'portal-conductor', user?.name ?? '', consulta],
    retry: false, // sin señal se usa la copia del teléfono sin esperar reintentos
    queryFn: async () => {
      const esDni = /^\d{8}$/.test(consulta);
      const clave = consulta ? consulta.trim().toUpperCase() : `YO:${(user?.name ?? '').toUpperCase()}`;
      const parametro = !consulta ? 'yo=1' : `${esDni ? 'dni' : 'nombre'}=${encodeURIComponent(consulta)}`;
      try {
        const datos = await api<Portal>(`/operaciones/conductor-portal/viaje-activo?${parametro}`);
        guardarViaje(clave, datos).catch(() => {}); // copia para usarla sin señal
        return datos;
      } catch (err) {
        if (!sinSenal(err)) throw err;
        const copia = await leerViaje(clave).catch(() => null);
        if (!copia) throw new Error('No hay señal y no hay datos guardados en el teléfono. Abre tu viaje una vez con señal.');
        return { ...(copia.datos as Portal), _sinSenal: true, _guardadoEn: copia.guardado_en };
      }
    },
  });

  // Cuando la cola envía gastos al servidor, la pantalla vuelve a leer el viaje
  const refrescar = useCallback(() => qc.invalidateQueries({ queryKey: ['personas', 'portal-conductor'] }), [qc]);
  useEffect(() => {
    const alEnviar = (e: Event) => { if ((e as CustomEvent<{ enviados?: number }>).detail?.enviados) void refrescar(); };
    window.addEventListener(EVENTO_COLA, alEnviar);
    return () => window.removeEventListener(EVENTO_COLA, alEnviar);
  }, [refrescar]);
  // Al abrir la pantalla se intenta enviar lo que quedó guardado sin señal
  useEffect(() => { void enviarPendientes(); }, []);

  function buscar(e: FormEvent) { e.preventDefault(); setConsulta(entrada.trim()); setVista(null); }

  const r = q.data;
  const viaje = r?.viaje;
  const puedeEditar = can('conductor_portal.crear', 'conductor_portal.editar');

  // Gastos del viaje que siguen en el teléfono (los que ya aparecen en el servidor no se repiten)
  const sincronizados = new Set((r?.gastos ?? []).map(g => g.uuid_cliente).filter((x): x is string => !!x));
  const pendientesViaje = viaje ? pendientes.filter(g => g.orden_viaje === viaje.codigo && !sincronizados.has(g.uuid)) : [];
  const sumaPendientes = pendientesViaje.reduce((t, g) => t + g.importe, 0);
  const balance = r?.balance && {
    asignado: r.balance.total_asignado,
    rendido: r.balance.total_rendido + sumaPendientes,
    saldo: r.balance.saldo_restante - sumaPendientes,
  };
  const totalPendientes = pendientes.length;
  const totalGastos = (r?.gastos?.length ?? 0) + pendientesViaje.length;

  // Fallas y vales del viaje (se cargan al abrir el viaje para mostrar los contadores)
  const codigo = viaje?.codigo ?? '';
  const fallasQ = useQuery({ queryKey: ['personas', 'portal-fallas', codigo], enabled: !!codigo && !r?._sinSenal, queryFn: () => cargarFallasViaje(codigo) });
  const valesQ = useQuery({ queryKey: ['personas', 'portal-vales', codigo], enabled: !!codigo && !r?._sinSenal, queryFn: () => cargarValesViaje(codigo) });

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(true);
    try {
      if (porEliminar.tipo === 'pendiente') {
        await quitarPendiente(porEliminar.gasto.uuid);
        toast('Gasto quitado del teléfono');
      } else {
        const x = await api<{ ok?: boolean; error?: string }>(`/tesoreria/liquidaciones-gastos/${porEliminar.gasto.id}`, { method: 'DELETE' });
        if (x.ok === false) throw new Error(x.error || 'No se pudo eliminar');
        toast('Gasto eliminado');
      }
      haptic('success'); setPorEliminar(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function enviarAhora() {
    setEnviando(true);
    try {
      const enviados = await enviarPendientes();
      const quedan = (await listarPendientes().catch(() => [])).length;
      if (quedan === 0) toast(enviados === 1 ? 'Gasto enviado' : enviados > 1 ? `${enviados} gastos enviados` : 'Todo está enviado');
      else toast(`Quedan ${quedan} gasto(s) sin enviar. Revisa la señal.`, 'error');
    } finally { setEnviando(false); }
  }

  // El saludo usa el nombre del usuario que entró; solo al consultar a otro conductor usa el de ese conductor
  const nombreSaludo = (consulta ? r?.conductor?.nombre : user?.name) || user?.name || '';
  const primerNombre = nombreSaludo.trim().split(/s+/)[0] ?? '';
  const entra = reducir ? { opacity: 0 } : { opacity: 0, x: 24 };
  const resorte = { type: 'spring' as const, bounce: 0, duration: 0.4 };

  return (
    <Page narrow>
      <PageHeader eyebrow="Conductor" title={primerNombre ? `Hola, ${primerNombre[0].toUpperCase()}${primerNombre.slice(1).toLowerCase()}` : 'Mi viaje'}
        subtitle={viaje ? 'Tu viaje de hoy, tus vales, fallas y gastos en ruta' : 'Aquí verás tu viaje cuando te asignen uno'} />

      {totalPendientes > 0 && (
        <div style={{ marginBottom: 'var(--s-3)' }}>
          <Notice tone="accent" icon={<CloudOff size={16} />}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              <span>{totalPendientes === 1 ? '1 gasto guardado en el teléfono, pendiente de enviar.' : `${totalPendientes} gastos guardados en el teléfono, pendientes de enviar.`}</span>
              <Button size="sm" variant="secondary" loading={enviando} onClick={enviarAhora}>Enviar ahora</Button>
            </span>
          </Notice>
        </div>
      )}

      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {r?._sinSenal && (
        <div style={{ marginBottom: 'var(--s-3)' }}>
          <Notice tone="neutral" icon={<CloudOff size={16} />}>
            Sin señal: se muestran los datos guardados{r._guardadoEn ? ` el ${fechaHora(r._guardadoEn)}` : ''}. Los gastos que registres se enviarán al volver la señal.
          </Notice>
        </div>
      )}

      {q.isFetching && !r ? <PageLoader /> : r && (
        <AnimatePresence mode="wait" initial={false}>
          {!vista || !viaje ? (
            <motion.div key="inicio" className="pc" initial={entra} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={resorte}>
              {!viaje ? (
                <EmptyState icon={<Truck size={28} />} title={r.sin_datos ? 'Falta tu DNI en el sistema' : 'No tienes un viaje activo'}>
                  {r.sin_datos ? 'Pide a administración que registre tu DNI en tu usuario para encontrar tu viaje.' : (r.message ?? 'Cuando te asignen un viaje aparecerá aquí con la unidad, la ruta y los accesos.')}
                </EmptyState>
              ) : (
                <>
                  <section className="pc-hero" aria-label="Viaje activo">
                    <div className="pc-hero__cab">
                      <span className="pc-estado"><span className="pc-estado__punto" aria-hidden />{String(viaje.estado).toUpperCase() === 'INICIADO' ? 'En ruta' : 'Viaje activo'}</span>
                      <span className="pc-hero__fecha">{viaje.fecha}</span>
                    </div>
                    <p className="pc-hero__aviso">Tienes un viaje activo</p>
                    <h2 className="pc-hero__codigo">{viaje.codigo}</h2>

                    <div className="pc-unidades">
                      <div className="pc-unidad"><span className="pc-unidad__label">Tracto</span><span className="pc-unidad__placa">{viaje.placa_tracto || '—'}</span></div>
                      <div className="pc-unidad"><span className="pc-unidad__label">Remolque / carreta</span><span className="pc-unidad__placa">{viaje.placa_remolque && viaje.placa_remolque !== '---' ? viaje.placa_remolque : '—'}</span></div>
                    </div>

                    {balance && (
                      <button type="button" className="pc-saldo" onClick={() => { haptic('selection'); setVista('gastos'); }} aria-label="Ver gastos en ruta">
                        <span className="pc-saldo__dato"><span className="pc-saldo__label">Asignado</span><span className="pc-saldo__valor">{s(balance.asignado)}</span></span>
                        <span className="pc-saldo__dato"><span className="pc-saldo__label">Rendido</span><span className="pc-saldo__valor">{s(balance.rendido)}</span></span>
                        <span className="pc-saldo__dato"><span className="pc-saldo__label">Saldo</span><span className={`pc-saldo__valor ${balance.saldo < 0 ? 'pc-saldo__valor--neg' : 'pc-saldo__valor--pos'}`}>{s(balance.saldo)}</span></span>
                      </button>
                    )}

                    <div className="pc-ruta">
                      <PuntoRuta tipo="carga" titulo="Ubicación de la carga" lugar={viaje.origen} direccion={viaje.direccion_partida} />
                      <PuntoRuta tipo="entrega" titulo="Ubicación de la entrega" lugar={viaje.destino} direccion={viaje.direccion_llegada} />
                    </div>
                  </section>

                  <div className="pc-accesos">
                    <button type="button" className="pc-acceso" onClick={() => { haptic('selection'); setVista('vales'); }}>
                      <span className="pc-acceso__icono pc-acceso__icono--vale"><Fuel size={22} strokeWidth={2} /></span>
                      <span className="pc-acceso__titulo">Vales de combustible</span>
                      <span className="pc-acceso__sub">{valesQ.data ? `${valesQ.data.length} en este viaje` : 'Diésel y urea'}</span>
                    </button>
                    <button type="button" className="pc-acceso" onClick={() => { haptic('selection'); setVista('fallas'); }}>
                      <span className="pc-acceso__icono pc-acceso__icono--falla"><Wrench size={22} strokeWidth={2} /></span>
                      <span className="pc-acceso__titulo">Reporte de fallas en ruta</span>
                      <span className="pc-acceso__sub">{fallasQ.data ? `${fallasQ.data.length} reportada${fallasQ.data.length === 1 ? '' : 's'}` : 'Avisa una avería'}</span>
                    </button>
                    <button type="button" className="pc-acceso" onClick={() => { haptic('selection'); setVista('gastos'); }}>
                      <span className="pc-acceso__icono pc-acceso__icono--gasto"><Receipt size={22} strokeWidth={2} /></span>
                      <span className="pc-acceso__titulo">Gastos en ruta</span>
                      <span className="pc-acceso__sub">{balance ? `Saldo ${s(balance.saldo)}` : `${totalGastos} registrados`}</span>
                    </button>
                  </div>
                </>
              )}

              {puedeConsultarOtro && (
                <div className="pc-otro">
                  {!otro ? (
                    <button type="button" className="pc-otro__abrir" onClick={() => setOtro(true)}>Consultar a otro conductor</button>
                  ) : (
                    <form onSubmit={buscar} style={{ display: 'flex', gap: 'var(--s-2)' }}>
                      <div style={{ flex: 1 }}><TextInput value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="DNI (8 dígitos) o nombre" aria-label="Conductor" autoFocus /></div>
                      <Button type="submit" variant="primary" disabled={!entrada.trim()} loading={q.isFetching}>Ver</Button>
                      {consulta && <Button variant="secondary" onClick={() => { setConsulta(''); setEntrada(''); }}>Mi viaje</Button>}
                    </form>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key={vista} className="pc" initial={entra} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={resorte}>
              <button type="button" className="pc-atras" onClick={() => setVista(null)}><ChevronLeft size={20} strokeWidth={2.2} />Mi viaje</button>
              <h2 className="pc-titulo">{vista === 'vales' ? 'Vales de combustible' : vista === 'fallas' ? 'Fallas en ruta' : 'Gastos en ruta'}</h2>
              <p className="pc-subtitulo">Viaje {viaje.codigo} · {viaje.placa_tracto}</p>

              {vista === 'fallas' && (
                <div className="tarjeta__lista">
                  <div className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>Reporte de fallas</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Reporta averías de tu tracto y carreta en ruta.</div>
                    </div>
                    <Button variant="primary" disabled={!puedeEditar || !!r._sinSenal} onClick={() => setReportando(true)}>Reportar falla</Button>
                  </div>
                  <ListaFallas datos={fallasQ.data} cargando={fallasQ.isFetching && !fallasQ.data} />
                </div>
              )}

              {vista === 'vales' && (
                <div className="tarjeta__lista">
                  <button type="button" className="dato" aria-disabled="true" onClick={() => toast(`Módulo de Vales de Combustible para Conductor. ${MENSAJE_VALES}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)', width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>Registrar vale <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--amber-ink)' }}>PRÓXIMAMENTE</span></div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Registro y abastecimiento de Diésel / Urea en ruta.</div>
                    </div>
                  </button>
                  <ListaVales datos={valesQ.data} cargando={valesQ.isFetching && !valesQ.data} />
                </div>
              )}

              {vista === 'gastos' && (
                <>
                  {balance && (
                    <div className="inv-metricas">
                      <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{s(balance.asignado)}</span><span className="inv-metrica__label">Asignado</span></div>
                      <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{s(balance.rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
                      <div className="inv-metrica">
                        <span className="inv-metrica__num" style={{ fontSize: '1.0625rem', color: balance.saldo < 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>{s(balance.saldo)}</span>
                        <span className="inv-metrica__label">Saldo</span>
                      </div>
                    </div>
                  )}

                  {(r.depositos ?? []).length > 0 && (
                    <div>
                      <p className="tarjeta__grupo-titulo">Depósitos y cajas ({r.depositos!.length})</p>
                      <div className="tarjeta__lista">
                        {r.depositos!.map(d => (
                          <div key={d.id} className="dato">
                            <span className="dato__label">{d.serie}-{d.numero} · {d.fecha} · {d.estado}</span>
                            <span className="dato__valor">{[d.motivo, d.sub_motivo].filter(Boolean).join(' › ')} — <strong>{d.tipo_movimiento === 'INGRESO' ? '- ' : ''}{s(d.importe_total)}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
                      <p className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Gastos rendidos ({totalGastos})</p>
                      {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Registrar gasto</Button>}
                    </div>
                    <div className="tarjeta__lista">
                      {pendientesViaje.length === 0 && (r.gastos ?? []).length === 0 && <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Aún no hay gastos rendidos.</span></div>}
                      {pendientesViaje.map(g => (
                        <div key={g.uuid} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{g.sub_motivo}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{fechaHora(g.registrado_en)}{g.detalle ? ` · ${g.detalle}` : ''}</div>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--amber-ink)' }}>PENDIENTE DE ENVIAR</span>
                            {g.ultimo_error && <div style={{ fontSize: '0.6875rem', color: 'var(--red-ink)' }}>{g.ultimo_error}</div>}
                          </div>
                          <strong>{s(g.importe)}</strong>
                          {puedeEditar && <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)' }} onClick={() => setPorEliminar({ tipo: 'pendiente', gasto: g })} aria-label="Quitar gasto del teléfono"><Trash2 size={16} /></button>}
                        </div>
                      ))}
                      {(r.gastos ?? []).map(g => (
                        <div key={g.id} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{g.sub_motivo || g.tipo_gasto}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{g.fecha_formateada}{g.detalle ? ` · ${g.detalle}` : ''}</div>
                            {g.estado === 'RECHAZADO' && <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--red-ink)' }}>RECHAZADO</span>}
                          </div>
                          <strong>{s(g.importe)}</strong>
                          {g.sustento_url && <a href={g.sustento_url} target="_blank" rel="noreferrer" className="placas-limpiar" aria-label="Ver sustento"><Paperclip size={16} /></a>}
                          {puedeEditar && <button type="button" className="placas-limpiar" onClick={() => setEditando(g)} aria-label="Editar gasto"><Pencil size={16} /></button>}
                          {puedeEditar && <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)' }} onClick={() => setPorEliminar({ tipo: 'servidor', gasto: g })} aria-label="Eliminar gasto"><Trash2 size={16} /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {viaje && (
        <ConductorFallaSheet open={reportando} viaje={viaje} conductor={r?.conductor?.nombre ?? ''} onClose={() => setReportando(false)}
          onHecho={() => qc.invalidateQueries({ queryKey: ['personas', 'portal-fallas'] })} />
      )}
      <GastoSheet open={nuevo || !!editando} editar={editando} viaje={viaje?.codigo ?? ''} conductor={r?.conductor?.nombre ?? ''}
        onClose={() => { setNuevo(false); setEditando(null); }} onHecho={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title={porEliminar?.tipo === 'pendiente' ? '¿Quitar este gasto del teléfono?' : '¿Eliminar este gasto?'}
        message={porEliminar ? `${porEliminar.tipo === 'pendiente' ? porEliminar.gasto.sub_motivo : (porEliminar.gasto.sub_motivo || porEliminar.gasto.tipo_gasto)} · ${s(porEliminar.gasto.importe)}` : ''}
        confirmLabel={porEliminar?.tipo === 'pendiente' ? 'Quitar' : 'Eliminar'} />
    </Page>
  );
}

/** Un punto de la ruta (carga o entrega) con botones para abrir Maps o Waze */
function PuntoRuta({ tipo, titulo, lugar, direccion }: { tipo: 'carga' | 'entrega'; titulo: string; lugar: string; direccion: string }) {
  const destino = [direccion, lugar].map(x => (x ?? '').trim()).filter(x => x && x !== 'BASE' && x !== 'DESTINO').join(', ');
  const q = encodeURIComponent(destino);
  return (
    <div className={`pc-punto pc-punto--${tipo}`}>
      <span className="pc-punto__marca" aria-hidden><MapPin size={14} strokeWidth={2.4} /></span>
      <div className="pc-punto__texto">
        <span className="pc-punto__titulo">{titulo}</span>
        <span className="pc-punto__lugar">{lugar || '—'}</span>
        {direccion && <span className="pc-punto__dir">{direccion}</span>}
        {destino ? (
          <span className="pc-punto__botones">
            <a className="pc-mapa" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer"><Navigation size={14} aria-hidden />Google Maps</a>
            <a className="pc-mapa" href={`https://waze.com/ul?q=${q}&navigate=yes`} target="_blank" rel="noopener noreferrer"><Navigation size={14} aria-hidden />Waze</a>
          </span>
        ) : <span className="pc-punto__dir">Sin ubicación registrada</span>}
      </div>
    </div>
  );
}

// Textos de la versión actual (portal del conductor): Vale de Combustible aún no tiene formulario allí.
const MENSAJE_VALES = 'Esta función estará disponible muy pronto para que registres tus cargas de Diésel y Urea en ruta de manera directa.';

type Fila = Record<string, unknown>;
interface FallaItem { sistema?: string; item?: string; obs?: string }
interface Falla { id: number; folio: string | null; fecha_reporte: string | null; placa_tracto: string | null; estado: string | null; fallas_tracto_json: unknown; fallas_remolque_json: unknown; fotos: string[] }
interface Vale { id: number; fecha: string | null; tipo: string | null; estacion: string | null; grifo: string | null; kilometraje: number | string | null; km_odometro: number | string | null; galones: number | string | null; cantidad: number | string | null; foto_url: string | null; sustento_url: string | null }

const listaDe = (d: unknown): Fila[] => (Array.isArray(d) ? d : Array.isArray((d as { data?: unknown } | null)?.data) ? (d as { data: unknown[] }).data : []) as Fila[];
const texto = (v: unknown) => (v == null ? null : String(v));
const mismoViaje = (ov: unknown, codigo: string) => { const a = String(ov ?? '').trim().toUpperCase(); return !!a && (a === codigo || codigo.includes(a) || a.includes(codigo)); };
const jsonLista = (v: unknown): unknown[] => {
  if (typeof v === 'string') { try { const x: unknown = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } }
  return Array.isArray(v) ? v : [];
};
const urlFoto = (u: unknown) => (typeof u === 'string' ? u : String((u as { url?: unknown } | null)?.url ?? ''));
const fechaTxt = (v: string | null) => (v ? new Date(v.replace(' ', 'T')).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
/** Estado como en el clásico: En Proceso / En Taller = EN TALLER; Finalizado / Atendido = ATENDIDO; lo demás, PENDIENTE */
function estadoFalla(e: string | null): { txt: string; color: string } {
  if (e === 'En Proceso' || e === 'En Taller') return { txt: 'EN TALLER', color: 'accent' };
  if (e === 'Finalizado' || e === 'Atendido') return { txt: 'ATENDIDO', color: 'green' };
  return { txt: 'PENDIENTE', color: 'amber' };
}

/** Reportes de fallas del viaje (GET /api/checklist filtrado por orden de viaje) con sus fotos firmadas */
async function cargarFallasViaje(codigo: string): Promise<Falla[]> {
  const cod = codigo.trim().toUpperCase();
  const reportes = listaDe(await api<unknown>('/checklist')).filter(r => mismoViaje(r.orden_viaje, cod));
  const fotosDe = (r: Fila) => jsonLista(r.fotos_json).map(urlFoto).filter(Boolean);
  const s3 = reportes.flatMap(fotosDe).filter(u => u.startsWith('http') || u.includes('s3') || u.includes('amazonaws.com'));
  let firmadas: Record<string, string> = {};
  if (s3.length) {
    try { firmadas = (await api<{ signed?: Record<string, string> }>('/checklist/presign-read', { method: 'POST', body: { urls: s3 } })).signed ?? {}; } catch { firmadas = {}; }
  }
  return reportes.map(r => ({
    id: Number(r.id), folio: texto(r.folio), fecha_reporte: texto(r.fecha_reporte), placa_tracto: texto(r.placa_tracto), estado: texto(r.estado),
    fallas_tracto_json: r.fallas_tracto_json, fallas_remolque_json: r.fallas_remolque_json,
    fotos: fotosDe(r).map(u => firmadas[u] ?? u),
  }));
}

/** Vales de combustible del viaje (GET /api/combustible/vales) */
async function cargarValesViaje(codigo: string): Promise<Vale[]> {
  const cod = codigo.trim().toUpperCase();
  const vales = listaDe(await api<unknown>(`/combustible/vales?viaje=${encodeURIComponent(codigo)}`));
  return vales.filter(v => mismoViaje(v.viaje ?? v.orden_viaje, cod)) as unknown as Vale[];
}

function ListaFallas({ datos, cargando }: { datos: Falla[] | undefined; cargando: boolean }) {
  if (cargando) return <p className="t-footnote c-secondary">Cargando fallas…</p>;
  if (!datos?.length) return <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>No has reportado fallas mecánicas en este viaje.</span></div>;
  return (
    <>
      {datos.map(f => {
        const est = estadoFalla(f.estado);
        const items = [
          ...jsonLista(f.fallas_tracto_json).map(x => ({ unidad: 'TRACTO', ...(x as FallaItem) })),
          ...jsonLista(f.fallas_remolque_json).map(x => ({ unidad: 'REMOLQUE', ...(x as FallaItem) })),
        ];
        return (
          <div key={f.id} className="dato" style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{f.placa_tracto || 'UNIDAD'} · {f.folio || 'REPORTE'}</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${est.color}-ink)` }}>{est.txt}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{fechaTxt(f.fecha_reporte)}</div>
            {items.length > 0 ? items.map((it, i) => (
              <div key={i} style={{ marginTop: 'var(--s-1)' }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{it.unidad}</span>{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-ink)' }}>[{it.sistema || 'GENERAL'}]</span>{' '}
                <span style={{ color: 'var(--red-ink)', fontWeight: 600 }}>{it.item || 'Falla Observada'}</span>
                <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>{it.obs && it.obs !== it.item ? it.obs : 'Observación registrada en ruta.'}</div>
              </div>
            )) : <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Sin fallas específicas detalladas.</div>}
            {f.fotos.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)', flexWrap: 'wrap' }}>
                {f.fotos.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden' }}>
                    <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ListaVales({ datos, cargando }: { datos: Vale[] | undefined; cargando: boolean }) {
  if (cargando) return <p className="t-footnote c-secondary">Cargando vales…</p>;
  if (!datos?.length) return <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Sin vales de combustible registrados para este viaje.</span></div>;
  return (
    <>
      {datos.map(v => {
        const galones = (parseFloat(String(v.galones || v.cantidad || 0)) || 0).toFixed(2);
        const grifo = v.grifo || v.estacion || 'Estación de Ruta';
        const fec = v.fecha ? String(v.fecha).slice(0, 10) : '—';
        const tipo = String(v.tipo || 'DIESEL D2').toUpperCase();
        const sUrl = v.foto_url || v.sustento_url;
        return (
          <div key={v.id} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{tipo} · <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400 }}>{fec}</span></div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{grifo}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>Km: {v.km_odometro || v.kilometraje || '---'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{galones} Gl</div>
              {sUrl && <a href={sUrl} target="_blank" rel="noopener noreferrer" aria-label="Ver Vale" style={{ fontSize: '0.75rem' }}>Ver Vale</a>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// Registro local primero: el gasto se guarda en el teléfono con su UUID y luego se intenta enviar.
// Si no hay señal, queda pendiente; el servidor no lo duplica aunque se reenvíe.
// Con `editar` se corrige un gasto ya enviado (PUT directo: requiere señal).
const COMPROBANTES: Array<{ value: Comprobante; label: string }> = [
  { value: 'BOLETA', label: 'Boleta' }, { value: 'FACTURA', label: 'Factura' }, { value: 'DECLARACION JURADA', label: 'Decl. jurada' },
];

function GastoSheet({ open, editar, viaje, conductor, onClose, onHecho }: { open: boolean; editar?: Gasto | null; viaje: string; conductor: string; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState(MOTIVOS[6]);
  const [importe, setImporte] = useState('');
  const [comprobante, setComprobante] = useState<Comprobante>('BOLETA');
  const [ruc, setRuc] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [serie, setSerie] = useState('');
  const [numero, setNumero] = useState('');
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Motivos de Tesorería (Gastos de Viaje y Ruta); si no hay señal se usa la lista de respaldo
  const motivosQ = useQuery({
    queryKey: ['personas', 'motivos-gasto-viaje'], enabled: open, staleTime: 10 * 60_000, retry: false,
    queryFn: async () => {
      const r = await api<{ data?: Array<{ motivo: string; sub_motivo: string }> }>('/tesoreria/motivos-gastos?solo_activos=1');
      return (r.data ?? []).filter(m => m.motivo === 'Gastos de Viaje y Ruta' && m.sub_motivo).map(m => m.sub_motivo);
    },
  });
  const motivos = motivosQ.data?.length ? motivosQ.data : MOTIVOS;

  useEffect(() => {
    if (!open) return;
    if (editar) {
      setMotivo(editar.sub_motivo || editar.tipo_gasto || MOTIVOS[6]);
      setImporte(String(Number(editar.importe) || 0));
      setNota(editar.detalle || '');
      setComprobante((COMPROBANTES.find(c => c.value === String(editar.tipo_comprobante ?? '').toUpperCase())?.value) ?? 'BOLETA');
      setRuc(editar.proveedor_ruc ?? ''); setProveedor(editar.proveedor_nombre ?? '');
      setSerie(editar.serie ?? ''); setNumero(editar.numero ?? '');
    } else {
      setMotivo(MOTIVOS[6]); setImporte(''); setNota(''); setComprobante('BOLETA'); setRuc(''); setProveedor(''); setSerie(''); setNumero('');
    }
    setFoto(null); setError(null);
  }, [open, editar]);

  const conDatos = comprobante !== 'DECLARACION JURADA';

  async function guardarEdicion(v: number) {
    if (!editar) return;
    const f = new FormData();
    f.append('orden_viaje', viaje);
    f.append('conductor', conductor || 'Conductor');
    f.append('tipo_gasto', 'Gastos de Viaje y Ruta');
    f.append('sub_motivo', motivo);
    f.append('importe', String(v));
    f.append('detalle', nota.trim() || motivo);
    f.append('usuario_creacion', conductor || 'CONDUCTOR MÓVIL');
    f.append('tipo_comprobante', comprobante);
    f.append('serie', conDatos ? serie.trim() : '');
    f.append('numero', conDatos ? numero.trim() : '');
    f.append('proveedor_ruc', conDatos ? ruc.trim() : '');
    f.append('proveedor_nombre', conDatos ? proveedor.trim() : '');
    if (foto) f.append('sustento', foto);
    const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/liquidaciones-gastos/${editar.id}`, { method: 'PUT', body: f });
    if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el gasto');
    haptic('success'); toast('Gasto actualizado');
    await onHecho(); onClose();
  }

  async function guardar() {
    const v = parseFloat(importe.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setError('Indica el importe del gasto.'); return; }
    if (!viaje) { setError('No tienes un viaje activo.'); return; }
    if (conDatos && ruc.trim() && !/^\d{11}$/.test(ruc.trim())) { setError('El RUC debe tener 11 dígitos.'); return; }
    if (comprobante === 'FACTURA' && !ruc.trim()) { setError('Para una factura indica el RUC del proveedor.'); return; }
    setEnviando(true); setError(null);
    if (editar) {
      try { await guardarEdicion(v); } catch (err) { setError(errorMessage(err)); haptic('warning'); } finally { setEnviando(false); }
      return;
    }
    const gasto: GastoPendiente = {
      uuid: uuid(),
      orden_viaje: viaje,
      conductor: conductor || 'Conductor',
      sub_motivo: motivo,
      importe: v,
      detalle: nota.trim() || motivo,
      usuario_creacion: conductor || 'CONDUCTOR MÓVIL',
      fecha: hoyLocal(),
      registrado_en: new Date().toISOString(),
      tipo_comprobante: comprobante,
      serie: conDatos ? serie.trim() : '',
      numero: conDatos ? numero.trim() : '',
      proveedor_ruc: conDatos ? ruc.trim() : '',
      proveedor_nombre: conDatos ? proveedor.trim() : '',
      foto,
      foto_nombre: foto?.name ?? null,
      intentos: 0,
      ultimo_error: null,
    };
    try {
      try {
        await guardarPendiente(gasto);
      } catch {
        // Este navegador no permite guardar en el teléfono: solo se puede registrar con señal
        await enviarGasto(gasto);
        haptic('success'); toast('Gasto registrado');
        await onHecho(); onClose();
        return;
      }
      await enviarPendientes();
      const sigue = await listarPendientes().then(l => l.some(x => x.uuid === gasto.uuid)).catch(() => true);
      haptic('success');
      toast(sigue ? 'Gasto guardado en el teléfono. Se enviará al volver la señal.' : 'Gasto registrado');
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editar ? 'Editar gasto' : 'Nuevo gasto en ruta'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editar ? 'Guardar cambios' : 'Guardar gasto'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {!editar && !navigator.onLine && (
          <div className="field field--wide"><Notice tone="neutral" icon={<CloudOff size={16} />}>Sin señal: el gasto se guardará en el teléfono y se enviará al volver la señal.</Notice></div>
        )}
        <Field label="Importe (S/)" wide>{p => <TextInput {...p} className="pc-importe" inputMode="decimal" placeholder="0.00" value={importe} onChange={e => setImporte(e.target.value)} autoFocus />}</Field>
        <Field label="¿En qué se gastó?" wide>
          {p => (
            <SelectInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)}>
              {(motivos.includes(motivo) ? motivos : [motivo, ...motivos]).map(m => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
          )}
        </Field>
        <div className="field field--wide">
          <SegmentedControl<Comprobante> block label="Comprobante" value={comprobante} onChange={setComprobante} options={COMPROBANTES} />
        </div>
        {conDatos && (
          <>
            <Field label="RUC del proveedor">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={ruc} onChange={e => setRuc(e.target.value.replace(/\D/g, ''))} placeholder={comprobante === 'FACTURA' ? 'Obligatorio' : 'Opcional'} />}</Field>
            <Field label="Proveedor">{p => <TextInput {...p} value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Opcional" />}</Field>
            <Field label="Serie">{p => <TextInput {...p} autoCapitalize="characters" value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} placeholder="F001" />}</Field>
            <Field label="Número">{p => <TextInput {...p} inputMode="numeric" value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="000123" />}</Field>
          </>
        )}
        <Field label="Foto del comprobante" wide hint={foto?.name ?? (editar?.sustento_url ? 'Ya tiene sustento; elige otra foto solo para reemplazarlo' : undefined)}>
          {p => <ArchivoInput {...p} accept="image/*" capture="environment" onChange={setFoto} />}
        </Field>
        <Field label="Nota" wide>{p => <TextInput {...p} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />}</Field>
      </div>
    </Sheet>
  );
}
