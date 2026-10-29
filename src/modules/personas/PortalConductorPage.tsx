import '../mantenimiento/mant.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert, CloudOff, Paperclip, Plus, Search, Smartphone, Trash2, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { uuid } from '../../core/lib/uuid';
import { abrirClasico } from '../../core/layout/navigation';
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
  const [porEliminar, setPorEliminar] = useState<Eliminar | null>(null);
  const [ocupado, setOcupado] = useState(false);
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
        actions={<MenuOtros opciones={[{ label: 'Checklist y vales en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/conductor-portal') }]} />}
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
                      {puedeEditar && <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)' }} onClick={() => setPorEliminar({ tipo: 'servidor', gasto: g })} aria-label="Eliminar gasto"><Trash2 size={16} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <GastoSheet open={nuevo} viaje={viaje?.codigo ?? ''} conductor={r?.conductor?.nombre ?? ''} onClose={() => setNuevo(false)} onHecho={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title={porEliminar?.tipo === 'pendiente' ? '¿Quitar este gasto del teléfono?' : '¿Eliminar este gasto?'}
        message={porEliminar ? `${porEliminar.tipo === 'pendiente' ? porEliminar.gasto.sub_motivo : (porEliminar.gasto.sub_motivo || porEliminar.gasto.tipo_gasto)} · ${s(porEliminar.gasto.importe)}` : ''}
        confirmLabel={porEliminar?.tipo === 'pendiente' ? 'Quitar' : 'Eliminar'} />
    </Page>
  );
}

// Registro local primero: el gasto se guarda en el teléfono con su UUID y luego se intenta enviar.
// Si no hay señal, queda pendiente; el servidor no lo duplica aunque se reenvíe.
function GastoSheet({ open, viaje, conductor, onClose, onHecho }: { open: boolean; viaje: string; conductor: string; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState(MOTIVOS[6]);
  const [importe, setImporte] = useState('');
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setMotivo(MOTIVOS[6]); setImporte(''); setNota(''); setFoto(null); setError(null); } }, [open]);

  async function guardar() {
    const v = parseFloat(importe.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setError('Indica el importe del gasto.'); return; }
    if (!viaje) { setError('Este conductor no tiene un viaje asignado.'); return; }
    setEnviando(true); setError(null);
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
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar gasto del viaje"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar gasto</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {!navigator.onLine && (
          <div className="field field--wide"><Notice tone="neutral" icon={<CloudOff size={16} />}>Sin señal: el gasto se guardará en el teléfono y se enviará al volver la señal.</Notice></div>
        )}
        <Field label="¿En qué se gastó?" wide>
          {p => <SelectInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}</SelectInput>}
        </Field>
        <Field label="Importe (S/)">{p => <TextInput {...p} inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} autoFocus />}</Field>
        <Field label="Foto del comprobante" hint={foto?.name}>{p => <TextInput {...p} type="file" accept="image/*" capture="environment" onChange={e => setFoto(e.target.files?.[0] ?? null)} />}</Field>
        <Field label="Nota" wide>{p => <TextInput {...p} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />}</Field>
      </div>
    </Sheet>
  );
}
