import { useState } from 'react';
import { CheckCircle2, Clock, FileText, Plus, Scale, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import {
  enviarChica, numero, useFondoChica, useFondosChica, useRefrescarChica, useReposicionesChica,
  type FondoChica, type MovimientoChica,
} from './cajaChicaApi';
import { AsignarCajaChicaSheet, GastoChicaSheet, ReposicionChicaSheet, SustentoChicaSheet } from './CajaChicaFormularios';
import './caja-formulario.css';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');
const monto = (v: number | string, moneda: string) => `${moneda === 'DOLARES' ? 'US$' : 'S/'} ${numero(v).toFixed(2)}`;

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente de aprobación', ACTIVA: 'Activa', CERRADA: 'Cerrada', RECHAZADA: 'Rechazada',
};
const TONO_ESTADO: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  ACTIVA: 'green', PENDIENTE: 'amber', CERRADA: 'gray', RECHAZADA: 'red',
};
const ETIQUETA_CONCEPTO: Record<string, string> = {
  ASIGNACION: 'Asignación', GASTO: 'Gasto', REPOSICION: 'Reposición', DESCUENTO: 'Descuento al responsable',
};

// Tesorería › Caja chica: fondos por responsable, sus gastos y la reposición a la caja central
export function CajaChicaPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const [pestana, setPestana] = useState<'fondos' | 'reposiciones'>('fondos');
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [gastando, setGastando] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);
  const fondos = useFondosChica();
  const reposiciones = useReposicionesChica();
  const puedeCrear = can('tesoreria_caja.crear');

  const lista = fondos.data ?? [];
  const seleccionado = lista.find(f => f.id === detalleId) ?? null;

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Caja chica"
        subtitle={fondos.isLoading ? 'Cargando…' : `${lista.filter(f => f.estado === 'ACTIVA').length} cajas activas · ${lista.filter(f => f.vencidos > 0).length} con gastos vencidos sin sustento`}
        actions={puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAsignando(true)}>Asignar caja chica</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SegmentedControl block label="Secciones de caja chica" value={pestana} onChange={setPestana}
          options={[{ value: 'fondos', label: 'Fondos' }, { value: 'reposiciones', label: 'Reposiciones' }]} />

        {pestana === 'fondos' && (fondos.isLoading ? <PageLoader /> : fondos.isError ? <Notice tone="error">{errorMessage(fondos.error)}</Notice>
          : lista.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="Sin cajas chicas">
              Asigna una caja chica a un responsable con el botón <strong>Asignar caja chica</strong>.
            </EmptyState>
          ) : (
            <div className="cc-fondos">
              {lista.map(f => (
                <button key={f.id} type="button" className="cc-fondo pressable" onClick={() => { haptic('selection'); setDetalleId(f.id); }}>
                  <div className="cc-fondo__cab">
                    <span className="cc-fondo__responsable">{f.responsable}</span>
                    <Badge tone={TONO_ESTADO[f.estado] ?? 'gray'}>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</Badge>
                  </div>
                  <span className="cc-fondo__moneda">{f.moneda === 'DOLARES' ? 'Dólares' : 'Soles'}</span>
                  <span className="cc-fondo__saldo">{monto(f.saldo, f.moneda)}</span>
                  <span className="cc-fondo__pie">
                    {f.pendientes > 0 && <span><Clock size={13} /> {f.pendientes} sin sustento</span>}
                    {f.vencidos > 0 && <span className="cc-fondo__vencido">{f.vencidos} vencidos</span>}
                    {f.pendientes === 0 && <span><CheckCircle2 size={13} /> Sin pendientes</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}

        {pestana === 'reposiciones' && (reposiciones.isLoading ? <PageLoader /> : (
          <ReposicionesLista reposiciones={reposiciones.data ?? []} onAprobado={refrescar} toast={toast} />
        ))}
      </div>

      <AsignarCajaChicaSheet open={asignando} onClose={() => setAsignando(false)} />
      <GastoChicaSheet open={gastando} fondo={seleccionado} onClose={() => setGastando(false)} />
      <ReposicionChicaSheet open={reponiendo} fondo={seleccionado} onClose={() => setReponiendo(false)} />

      <FondoDetalle fondoId={detalleId} onClose={() => setDetalleId(null)}
        onGasto={() => setGastando(true)} onReponer={() => setReponiendo(true)} />
    </Page>
  );
}

function FondoDetalle({ fondoId, onClose, onGasto, onReponer }: {
  fondoId: number | null; onClose: () => void; onGasto: () => void; onReponer: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const refrescar = useRefrescarChica();
  const fondo = useFondoChica(fondoId);
  const [sustentando, setSustentando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const f = fondo.data;
  const hoy = hoyLocal();
  const puedeGestionar = can('tesoreria_caja.crear');

  async function accion(clave: string, path: string) {
    setOcupado(clave);
    try {
      await enviarChica(path);
      haptic('success');
      toast('Listo');
      refrescar();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Sheet open={fondoId != null} onClose={onClose} ancho title={f ? `Caja chica de ${f.responsable}` : 'Caja chica'}
      footer={f && puedeGestionar ? <FondoAcciones f={f} onGasto={onGasto} onReponer={onReponer} /> : undefined}>
      {!f ? <PageLoader /> : (
        <div className="cf">
          <div className="cc-resumen">
            <div><span className="cc-resumen__etiqueta">Saldo</span><span className="cc-resumen__valor">{monto(f.saldo, f.moneda)}</span></div>
            <div><span className="cc-resumen__etiqueta">Asignado</span><span className="cc-resumen__valor">{monto(f.monto_asignado, f.moneda)}</span></div>
            <div><span className="cc-resumen__etiqueta">Estado</span><Badge tone={TONO_ESTADO[f.estado] ?? 'gray'}>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</Badge></div>
            <div><span className="cc-resumen__etiqueta">Cuenta</span><span className="cc-resumen__texto">{f.cuenta_origen ?? '—'}</span></div>
          </div>

          {f.estado === 'PENDIENTE' && (
            <Notice tone="accent">
              Falta aprobación: Tesorería {f.aprob_tesoreria_por ? '✓' : 'pendiente'} · Gerencia {f.aprob_gerencia_por ? '✓' : 'pendiente'}.
              {puedeGestionar && (
                <span className="cc-aprobar">
                  {!f.aprob_tesoreria_por && <Button size="sm" variant="secondary" loading={ocupado === 'at'} onClick={() => accion('at', `/fondos/${f.id}/aprobar-tesoreria`)}>Aprobar como Tesorería</Button>}
                  {!f.aprob_gerencia_por && <Button size="sm" variant="secondary" loading={ocupado === 'ag'} onClick={() => accion('ag', `/fondos/${f.id}/aprobar-gerencia`)}>Aprobar como Gerencia</Button>}
                </span>
              )}
            </Notice>
          )}

          <section className="cf-bloque">
            <h3 className="cf-bloque__titulo">Movimientos</h3>
            {(f.movimientos ?? []).length === 0 ? <p className="cc-vacio">Sin movimientos todavía.</p> : (
              <ul className="cc-movs">
                {[...(f.movimientos ?? [])].reverse().map(m => (
                  <li key={m.id} className="cc-mov">
                    <div className="cc-mov__cuerpo">
                      <span className="cc-mov__titulo">{ETIQUETA_CONCEPTO[m.concepto] ?? m.concepto} · {m.descripcion ?? '—'}</span>
                      <span className="cc-mov__sub">
                        {formatFechaPe(m.fecha)}{m.motivo ? ` · ${m.motivo}` : ''}{m.oc_id ? ` · OC ${m.oc_id}` : ''}
                      </span>
                      <span className="cc-mov__estados">
                        {m.concepto === 'GASTO' && <SustentoBadge m={m} hoy={hoy} />}
                        {m.comprobante_url && <a className="cc-mov__enlace" href={m.comprobante_url} target="_blank" rel="noreferrer"><FileText size={13} /> Sustento</a>}
                        {m.concepto === 'GASTO' && <Aprobaciones m={m} />}
                      </span>
                    </div>
                    <div className="cc-mov__derecha">
                      <span className={`cc-mov__monto cc-mov__monto--${m.tipo === 'INGRESO' ? 'in' : 'out'}`}>
                        {m.tipo === 'INGRESO' ? '+' : '−'}{numero(m.monto).toFixed(2)}
                      </span>
                      {puedeGestionar && m.concepto === 'GASTO' && m.estado_sustento === 'PENDIENTE' && (
                        <Button size="sm" variant="plain" icon={<FileText size={14} />} onClick={() => setSustentando(m.id)}>Subir sustento</Button>
                      )}
                      {puedeGestionar && m.concepto === 'GASTO' && m.estado_sustento === 'PENDIENTE' && m.plazo_vence && m.plazo_vence < hoy && (
                        <Button size="sm" variant="secondary" loading={ocupado === `d${m.id}`}
                          onClick={() => accion(`d${m.id}`, `/movimientos/${m.id}/descontar`)}>Descontar al responsable</Button>
                      )}
                      {puedeGestionar && m.concepto === 'GASTO' && m.estado_sustento === 'SUSTENTADO' && (
                        <AprobarGasto m={m} onHecho={refrescar} toast={toast} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <SustentoChicaSheet open={sustentando != null} movId={sustentando} onClose={() => setSustentando(null)} />
    </Sheet>
  );
}

function FondoAcciones({ f, onGasto, onReponer }: { f: FondoChica; onGasto: () => void; onReponer: () => void }) {
  if (f.estado !== 'ACTIVA') return null;
  return (
    <>
      <Button variant="secondary" icon={<Scale size={16} />} onClick={onReponer}>Pedir reposición</Button>
      <Button variant="primary" icon={<Plus size={16} />} onClick={onGasto}>Registrar gasto</Button>
    </>
  );
}

function SustentoBadge({ m, hoy }: { m: MovimientoChica; hoy: string }) {
  if (m.estado_sustento === 'SUSTENTADO') return <Badge tone="green">Con sustento</Badge>;
  if (m.estado_sustento === 'DESCONTADO') return <Badge tone="red">Descontado al responsable</Badge>;
  const vencido = m.plazo_vence && m.plazo_vence < hoy;
  return <Badge tone={vencido ? 'red' : 'amber'}>{vencido ? 'Vencido sin sustento' : `Sustento hasta ${formatFechaPe(m.plazo_vence)}`}</Badge>;
}

function Aprobaciones({ m }: { m: MovimientoChica }) {
  return (
    <span className="cc-mov__sub">
      Tesorería {m.aprob_tesoreria_por ? '✓' : '·'} · Gerencia {m.aprob_gerencia_por ? '✓' : '·'}
      {m.reposicion_id ? ` · reposición #${m.reposicion_id}` : ''}
    </span>
  );
}

function AprobarGasto({ m, onHecho, toast }: { m: MovimientoChica; onHecho: () => Promise<unknown>; toast: (t: string, tono?: 'error') => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function aprobar(rol: 'tesoreria' | 'gerencia') {
    setOcupado(rol);
    try {
      await enviarChica(`/movimientos/${m.id}/aprobar-${rol}`);
      haptic('success');
      await onHecho();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setOcupado(null);
    }
  }
  return (
    <>
      {!m.aprob_tesoreria_por && <Button size="sm" variant="plain" loading={ocupado === 'tesoreria'} onClick={() => aprobar('tesoreria')}>Aprobar Tesorería</Button>}
      {!m.aprob_gerencia_por && <Button size="sm" variant="plain" loading={ocupado === 'gerencia'} onClick={() => aprobar('gerencia')}>Aprobar Gerencia</Button>}
    </>
  );
}

function ReposicionesLista({ reposiciones, onAprobado, toast }: {
  reposiciones: Array<{ id: number; responsable: string; moneda: 'SOLES' | 'DOLARES'; monto: number | string; estado: string; aprob_tesoreria_por: string | null; aprob_gerencia_por: string | null }>;
  onAprobado: () => Promise<unknown>; toast: (t: string, tono?: 'error') => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (reposiciones.length === 0) {
    return <EmptyState icon={<Scale size={22} />} title="Sin reposiciones">Las reposiciones aparecen aquí cuando Tesorería las pide desde una caja chica.</EmptyState>;
  }
  async function aprobar(id: number, rol: 'tesoreria' | 'gerencia') {
    setOcupado(`${id}${rol}`);
    try {
      await enviarChica(`/reposiciones/${id}/aprobar-${rol}`);
      haptic('success');
      await onAprobado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setOcupado(null);
    }
  }
  return (
    <ul className="cc-movs">
      {reposiciones.map(r => (
        <li key={r.id} className="cc-mov">
          <div className="cc-mov__cuerpo">
            <span className="cc-mov__titulo">Reposición #{r.id} · {r.responsable}</span>
            <span className="cc-mov__estados">
              <Badge tone={r.estado === 'APROBADA' ? 'green' : 'amber'}>{r.estado === 'APROBADA' ? 'Aprobada' : 'Pendiente de aprobación'}</Badge>
              <span className="cc-mov__sub">Tesorería {r.aprob_tesoreria_por ? '✓' : '·'} · Gerencia {r.aprob_gerencia_por ? '✓' : '·'}</span>
            </span>
          </div>
          <div className="cc-mov__derecha">
            <span className="cc-mov__monto cc-mov__monto--out">{monto(r.monto, r.moneda)}</span>
            {r.estado === 'PENDIENTE' && !r.aprob_tesoreria_por && (
              <Button size="sm" variant="plain" loading={ocupado === `${r.id}tesoreria`} onClick={() => aprobar(r.id, 'tesoreria')}>Aprobar Tesorería</Button>
            )}
            {r.estado === 'PENDIENTE' && !r.aprob_gerencia_por && (
              <Button size="sm" variant="plain" loading={ocupado === `${r.id}gerencia`} onClick={() => aprobar(r.id, 'gerencia')}>Aprobar Gerencia</Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

