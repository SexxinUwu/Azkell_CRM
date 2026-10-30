import '../mantenimiento/mant.css';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CloudOff, Paperclip, Pencil, Plus, Search, Smartphone, Trash2, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConductorFallaSheet } from './ConductorFallaSheet';
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

interface Gasto { id: number; fecha_formateada: string; tipo_gasto: string; sub_motivo: string; detalle: string; importe: number | string; sustento_url: string | null; estado: string; uuid_cliente?: string | null }
interface Deposito { id: number; serie: string; numero: string; motivo: string; sub_motivo: string; importe_total: number | string; tipo_movimiento: string; fecha: string; estado: string }
interface Portal {
  ok: boolean; message?: string;
  conductor?: { nombre: string; dni: string };
  viaje?: { id: number; codigo: string; placa_tracto: string; placa_remolque: string; origen: string; destino: string; ruta: string; estado: string; fecha: string } | null;
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
const colorEstado = (e: string) => ({ ACTIVO: 'amber', INICIADO: 'accent', FINALIZADO: 'green', LIQUIDADO: 'green' }[String(e).toUpperCase()] ?? 'gray');
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

// Personas y seguridad › Portal del conductor: viaje asignado, saldo de viáticos y rendición de gastos.
// Sin señal: se ve la última copia guardada del conductor y los gastos quedan en el teléfono hasta enviarse.
export function PortalConductorPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const pendientes = usePendientes();
  const [entrada, setEntrada] = useState('');
  const [consulta, setConsulta] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [porEliminar, setPorEliminar] = useState<Eliminar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>('gastos');
  const [reportando, setReportando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const q = useQuery<Portal>({
    queryKey: ['personas', 'portal-conductor', consulta],
    enabled: !!consulta,
    retry: false, // sin señal se usa la copia del teléfono sin esperar reintentos
    queryFn: async () => {
      const esDni = /^\d{8}$/.test(consulta);
      const clave = consulta.trim().toUpperCase();
      try {
        const datos = await api<Portal>(`/operaciones/conductor-portal/viaje-activo?${esDni ? 'dni' : 'nombre'}=${encodeURIComponent(consulta)}`);
        guardarViaje(clave, datos).catch(() => {}); // copia para usarla sin señal
        return datos;
      } catch (err) {
        if (!sinSenal(err)) throw err;
        const copia = await leerViaje(clave).catch(() => null);
        if (!copia) throw new Error('No hay señal y este conductor no tiene datos guardados en el teléfono. Consulta su viaje con señal una vez.');
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

  function buscar(e: FormEvent) { e.preventDefault(); setConsulta(entrada.trim()); }

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

  // Fallas y vales del viaje, como en el clásico (se cargan al abrir el viaje para mostrar los contadores)
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

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Portal del conductor"
        subtitle="Viaje asignado, saldo de viáticos y rendición de gastos"
      />

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

      <form onSubmit={buscar} style={{ display: 'flex', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <div style={{ flex: 1 }}>
          <TextInput value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="DNI (8 dígitos) o nombre del conductor…" aria-label="Conductor" />
        </div>
        <Button type="submit" variant="primary" icon={<Search size={16} />} disabled={!entrada.trim()} loading={q.isFetching}>Buscar</Button>
      </form>

      {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
      {r?._sinSenal && (
        <div style={{ marginBottom: 'var(--s-3)' }}>
          <Notice tone="neutral" icon={<CloudOff size={16} />}>
            Sin señal: se muestran los datos guardados{r._guardadoEn ? ` el ${fechaHora(r._guardadoEn)}` : ''}. Los gastos que registres se enviarán al volver la señal.
          </Notice>
        </div>
      )}
      {q.isFetching && !r ? <PageLoader /> : !consulta ? (
        <EmptyState icon={<Smartphone size={28} />} title="Consulta un conductor">Escribe su DNI o nombre para ver su viaje, el saldo de viáticos y los gastos que rindió.</EmptyState>
      ) : r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor" style={{ fontWeight: 700 }}>{r.conductor?.nombre ?? '—'}</span></div>
            {r.conductor?.dni && <div className="dato"><span className="dato__label">DNI</span><span className="dato__valor dato__valor--mono">{r.conductor.dni}</span></div>}
          </div>

          {!viaje ? (
            <Notice tone="neutral">{r.message ?? 'No se encontró un viaje asignado para este conductor.'}</Notice>
          ) : (
            <>
              <div className="tarjeta__lista">
                <div className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                  <Truck size={20} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{viaje.placa_tracto}{viaje.placa_remolque && viaje.placa_remolque !== '---' ? ` + ${viaje.placa_remolque}` : ''}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Viaje {viaje.codigo} · {viaje.ruta} · {viaje.fecha}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: `var(--${colorEstado(viaje.estado)}-ink)` }}>{viaje.estado}</span>
                </div>
              </div>

              <SegmentedControl<Seccion> block label="Sección del viaje" value={seccion} onChange={setSeccion}
                options={[
                  { value: 'gastos', label: `Gastos (${(r.gastos?.length ?? 0) + pendientesViaje.length})` },
                  { value: 'fallas', label: `Fallas (${fallasQ.data?.length ?? 0})` },
                  { value: 'vales', label: `Vales (${valesQ.data?.length ?? 0})` },
                ]} />

              {seccion === 'fallas' && (
                <div className="tarjeta__lista">
                  <div className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>Reporte de Fallas</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Reporta averías de tu tracto y carreta en ruta.</div>
                    </div>
                    <Button variant="primary" disabled={!puedeEditar || !!r._sinSenal} onClick={() => setReportando(true)}>Reportar Falla</Button>
                  </div>
                  <ListaFallas datos={fallasQ.data} cargando={fallasQ.isFetching && !fallasQ.data} />
                </div>
              )}

              {seccion === 'vales' && (
                <div className="tarjeta__lista">
                  <button type="button" className="dato" aria-disabled="true" onClick={() => toast(`Módulo de Vales de Combustible para Conductor. ${MENSAJE_VALES}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)', width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>Vale de Combustible <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--amber-ink)' }}>PRÓXIMAMENTE</span></div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Registro y abastecimiento de Diésel / Urea en ruta.</div>
                    </div>
                  </button>
                  <ListaVales datos={valesQ.data} cargando={valesQ.isFetching && !valesQ.data} />
                </div>
              )}

              {seccion === 'gastos' && balance && (
                <div className="inv-metricas">
                  <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{s(balance.asignado)}</span><span className="inv-metrica__label">Asignado</span></div>
                  <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{s(balance.rendido)}</span><span className="inv-metrica__label">Rendido</span></div>
                  <div className="inv-metrica">
                    <span className="inv-metrica__num" style={{ fontSize: '1.0625rem', color: balance.saldo < 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>{s(balance.saldo)}</span>
                    <span className="inv-metrica__label">Saldo</span>
                  </div>
                </div>
              )}

              {seccion === 'gastos' && (r.depositos ?? []).length > 0 && (
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

              <div hidden={seccion !== 'gastos'}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
                  <p className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Gastos rendidos ({(r.gastos?.length ?? 0) + pendientesViaje.length})</p>
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
        </div>
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
// Con `editar` se corrige un gasto ya enviado (PUT directo, como el clásico: requiere señal).
function GastoSheet({ open, editar, viaje, conductor, onClose, onHecho }: { open: boolean; editar?: Gasto | null; viaje: string; conductor: string; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState(MOTIVOS[6]);
  const [importe, setImporte] = useState('');
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editar) {
      setMotivo(editar.sub_motivo || editar.tipo_gasto || MOTIVOS[6]);
      setImporte(String(Number(editar.importe) || 0));
      setNota(editar.detalle || '');
    } else {
      setMotivo(MOTIVOS[6]); setImporte(''); setNota('');
    }
    setFoto(null); setError(null);
  }, [open, editar]);

  async function guardarEdicion(v: number) {
    if (!editar) return;
    const f = new FormData();
    f.append('orden_viaje', viaje);
    f.append('conductor', conductor || 'Conductor');
    f.append('tipo_gasto', 'Gastos de Viaje y Ruta');
    f.append('sub_motivo', motivo);
    f.append('importe', String(v));
    f.append('detalle', nota.trim() || motivo);
    f.append('usuario_creacion', conductor ? `${conductor} (Conductor)` : 'CONDUCTOR MÓVIL');
    if (foto) f.append('sustento', foto);
    const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/liquidaciones-gastos/${editar.id}`, { method: 'PUT', body: f });
    if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el gasto');
    haptic('success'); toast('Gasto actualizado');
    await onHecho(); onClose();
  }

  async function guardar() {
    const v = parseFloat(importe.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setError('Indica el importe del gasto.'); return; }
    if (!viaje) { setError('Este conductor no tiene un viaje asignado.'); return; }
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
      usuario_creacion: conductor ? `${conductor} (Conductor)` : 'CONDUCTOR MÓVIL',
      fecha: hoyLocal(),
      registrado_en: new Date().toISOString(),
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
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editar ? 'Editar gasto del viaje' : 'Registrar gasto del viaje'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editar ? 'Guardar cambios' : 'Guardar gasto'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {!editar && !navigator.onLine && (
          <div className="field field--wide"><Notice tone="neutral" icon={<CloudOff size={16} />}>Sin señal: el gasto se guardará en el teléfono y se enviará al volver la señal.</Notice></div>
        )}
        <Field label="¿En qué se gastó?" wide>
          {p => (
            <SelectInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)}>
              {(MOTIVOS.includes(motivo) ? MOTIVOS : [motivo, ...MOTIVOS]).map(m => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Importe (S/)">{p => <TextInput {...p} inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} autoFocus />}</Field>
        <Field label="Foto del comprobante" hint={foto?.name ?? (editar?.sustento_url ? 'Ya tiene sustento; elige otra foto solo para reemplazarlo' : undefined)}>
          {p => <ArchivoInput {...p} accept="image/*" capture="environment" onChange={setFoto} />}
        </Field>
        <Field label="Nota" wide>{p => <TextInput {...p} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />}</Field>
      </div>
    </Sheet>
  );
}
