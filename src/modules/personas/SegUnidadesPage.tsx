import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CircleAlert, FileSpreadsheet, LogIn, LogOut, Plus, SearchX, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { usePlacas } from '../placas/api';

interface Registro {
  id: string; placa_tracto: string; placa_carreta: string | null; conductor: string; destino: string | null; tipo_salida: string | null;
  orden_viaje: string | null; estado: string; salida_fecha: string | null; salida_hora: string | null; salida_km: number | null;
  salida_observaciones: string | null; salida_has_alert: number | boolean; retorno_fecha: string | null; retorno_hora: string | null; retorno_km: number | null;
  retorno_observaciones: string | null; retorno_has_alert: number | boolean; creado_por: string | null; retorno_creado_por: string | null;
  empresa_nombre?: string; fotos?: unknown[];
}
interface Stats { total: number; en_ruta: number; completados: number; alertas: number }

const n = (v: unknown) => Number(v) || 0;
const dia = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const hoy = () => new Date().toISOString().slice(0, 10);
const ahora = () => new Date().toTimeString().slice(0, 5);
const TIPOS = ['RUTA', 'LOCAL', 'TALLER', 'TRASLADO', 'OTRO'];

// Personas y seguridad › Garita: control de salida y retorno de unidades.
// El checklist de revisión, las firmas y las fotos se capturan en la versión actual.
export function SegUnidadesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [salida, setSalida] = useState(false);
  const [retorno, setRetorno] = useState<Registro | null>(null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<Registro | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lista = useQuery<Registro[]>({
    queryKey: ['personas', 'garita', estado],
    queryFn: () => api<Registro[]>(`/seguridad/unidades?limit=300${estado ? `&estado=${estado}` : ''}`).then(r => (Array.isArray(r) ? r : [])),
    staleTime: 15_000, refetchInterval: 60_000,
  });
  const stats = useQuery<Stats>({ queryKey: ['personas', 'garita-stats'], queryFn: () => api<Stats>('/seguridad/unidades/stats'), staleTime: 15_000 });

  const datos = lista.data ?? [];
  const visibles = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return t ? datos.filter(r => [r.id, r.placa_tracto, r.placa_carreta, r.conductor, r.destino, r.orden_viaje].some(x => String(x ?? '').toUpperCase().includes(t))) : datos;
  }, [datos, busqueda]);
  const abierto = datos.find(r => r.id === abiertoId) ?? null;
  const puedeCrear = can('seg_unidades.crear', 'seguridad_unidades.crear');
  const puedeEliminar = can('seg_unidades.eliminar', 'seguridad_unidades.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['personas'] });

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(true);
    try {
      await api(`/seguridad/unidades/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Registro ${porEliminar.id} eliminado`); setPorEliminar(null); setAbiertoId(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Garita-unidades', 'Garita',
        ['Folio', 'Estado', 'Tracto', 'Carreta', 'Conductor', 'Destino', 'Tipo', 'Orden de viaje', 'Salida', 'Km salida', 'Retorno', 'Km retorno', 'Alerta'],
        visibles.map(r => [r.id, r.estado, r.placa_tracto, r.placa_carreta, r.conductor, r.destino, r.tipo_salida, r.orden_viaje,
          `${dia(r.salida_fecha)} ${r.salida_hora ?? ''}`.trim(), r.salida_km, `${dia(r.retorno_fecha)} ${r.retorno_hora ?? ''}`.trim(), r.retorno_km,
          r.salida_has_alert || r.retorno_has_alert ? 'Sí' : '']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Garita · unidades"
        subtitle={lista.isLoading ? 'Cargando…' : `${stats.data?.en_ruta ?? 0} en ruta · ${stats.data?.total ?? datos.length} registros`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} registros`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Checklist, firmas, fotos y PDF', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('seguridad/unidades') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<LogOut size={16} />} onClick={() => setSalida(true)}>Registrar salida</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{stats.data?.en_ruta ?? 0}</span><span className="inv-metrica__label">En ruta</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{stats.data?.completados ?? 0}</span><span className="inv-metrica__label">Completados</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical">{stats.data?.alertas ?? 0}</span><span className="inv-metrica__label">Con alerta</span></div>
        </div>

        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Folio, placa, conductor o destino…" />
        <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option><option value="en_ruta">En ruta</option><option value="completado">Completados</option>
        </SelectInput>

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <ShieldCheck size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin registros de garita'}>
            {puedeCrear ? <>Registra la primera salida con <strong>Registrar salida</strong>.</> : 'Aún no hay movimientos.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(r => {
              const enRuta = r.estado === 'en_ruta';
              const alerta = !!(r.salida_has_alert || r.retorno_has_alert);
              return (
                <button key={r.id} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbiertoId(r.id); }}>
                  <div className="mov-fila__icon" style={{ background: enRuta ? 'var(--amber-tint)' : 'var(--green-tint)', color: enRuta ? 'var(--amber-ink)' : 'var(--green-ink)' }}>
                    {alerta ? <AlertTriangle size={16} /> : enRuta ? <LogOut size={16} /> : <LogIn size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{r.placa_tracto}{r.placa_carreta ? ` + ${r.placa_carreta}` : ''} · {r.conductor}</span>
                    <span className="mov-fila__sub">{[r.id, r.destino, `${dia(r.salida_fecha)} ${r.salida_hora ?? ''}`.trim()].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: enRuta ? 'var(--amber-ink)' : 'var(--green-ink)' }}>{enRuta ? 'EN RUTA' : 'COMPLETADO'}</span>
                    {alerta && <span style={{ fontSize: '0.6875rem', color: 'var(--red-ink)', fontWeight: 700 }}>Alerta</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!abierto} onClose={() => setAbiertoId(null)} title={abierto ? `Registro ${abierto.id}` : ''}
        footer={
          abierto && (
            <>
              {puedeEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setPorEliminar(abierto)}>Eliminar</Button>}
              {abierto.estado === 'en_ruta' && puedeCrear && (
                <Button variant="primary" icon={<LogIn size={16} />} onClick={() => { setRetorno(abierto); setAbiertoId(null); }}>Registrar retorno</Button>
              )}
            </>
          )
        }>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            {(abierto.salida_has_alert || abierto.retorno_has_alert) && <Notice tone="error" icon={<AlertTriangle size={16} />}>Este registro tiene observaciones marcadas en el checklist.</Notice>}
            <div className="tarjeta__lista">
              {fila('Empresa', abierto.empresa_nombre)}{fila('Tracto', abierto.placa_tracto, true)}{fila('Carreta', abierto.placa_carreta, true)}{fila('Conductor', abierto.conductor)}
              {fila('Destino', abierto.destino)}{fila('Tipo', abierto.tipo_salida)}{fila('Orden de viaje', abierto.orden_viaje, true)}
            </div>
            <div className="tarjeta__lista">
              {fila('Salida', `${dia(abierto.salida_fecha)} ${abierto.salida_hora ?? ''}`, true)}{fila('Km de salida', n(abierto.salida_km) ? n(abierto.salida_km).toLocaleString('es-PE') : '', true)}
              {fila('Obs. de salida', abierto.salida_observaciones)}{fila('Registrada por', abierto.creado_por)}
            </div>
            {abierto.estado !== 'en_ruta' && (
              <div className="tarjeta__lista">
                {fila('Retorno', `${dia(abierto.retorno_fecha)} ${abierto.retorno_hora ?? ''}`, true)}{fila('Km de retorno', n(abierto.retorno_km) ? n(abierto.retorno_km).toLocaleString('es-PE') : '', true)}
                {n(abierto.retorno_km) > 0 && n(abierto.salida_km) > 0 && fila('Recorrido', `${(n(abierto.retorno_km) - n(abierto.salida_km)).toLocaleString('es-PE')} km`, true)}
                {fila('Obs. de retorno', abierto.retorno_observaciones)}{fila('Recibida por', abierto.retorno_creado_por)}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <SalidaSheet open={salida} onClose={() => setSalida(false)} onHecho={refrescar} />
      <RetornoSheet registro={retorno} onClose={() => setRetorno(null)} onHecho={refrescar} />

      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title={`¿Eliminar ${porEliminar?.id ?? ''}?`} message="Se borra el registro con sus fotos. No se puede deshacer." confirmLabel="Eliminar" />
    </Page>
  );
}

function SalidaSheet({ open, onClose, onHecho }: { open: boolean; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const { user } = useAuth();
  const placas = usePlacas();
  const [v, setV] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setV({ placa_tracto: '', placa_carreta: '', conductor: '', destino: '', tipo_salida: 'RUTA', orden_viaje: '', salida_fecha: hoy(), salida_hora: ahora(), salida_km: '', salida_observaciones: '' });
  }, [open]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const carretas = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);

  async function traerKm() {
    const p = (v.placa_tracto ?? '').trim();
    if (!p) return;
    try {
      const r = await api<{ ok?: boolean; ultimoKm?: number | null }>(`/seguridad/unidades/ultimo-km/${encodeURIComponent(p)}`);
      if (r.ok && r.ultimoKm) setV(a => ({ ...a, salida_km: a.salida_km || String(r.ultimoKm) }));
    } catch { /* sin dato previo */ }
  }

  async function guardar() {
    if (!v.placa_tracto.trim() || !v.conductor.trim()) { setError('La placa del tracto y el conductor son obligatorios.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>('/seguridad/unidades', {
        method: 'POST', body: { ...v, salida_km: v.salida_km || null, salida_has_alert: false, creado_por: user?.name },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar');
      haptic('success'); toast(`Salida registrada: ${r.id ?? ''}`);
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'numeric'; list?: string; onBlur?: () => void }) => (
    <Field label={label} wide={o?.wide}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} value={v[k] ?? ''} onBlur={o?.onBlur}
        onChange={e => set(k, k.startsWith('placa') ? e.target.value.toUpperCase() : e.target.value)} />}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar salida de unidad"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={guardar} loading={enviando}>Registrar salida</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <datalist id="gar-tractos">{tractos.map(x => <option key={x} value={x} />)}</datalist>
        <datalist id="gar-carretas">{carretas.map(x => <option key={x} value={x} />)}</datalist>
        {txt('placa_tracto', 'Tracto / camión', { list: 'gar-tractos', onBlur: traerKm })}
        {txt('placa_carreta', 'Carreta', { list: 'gar-carretas' })}
        {txt('conductor', 'Conductor', { wide: true })}
        {txt('destino', 'Destino', { wide: true })}
        <Field label="Tipo de salida">
          {p => <SelectInput {...p} value={v.tipo_salida ?? 'RUTA'} onChange={e => set('tipo_salida', e.target.value)}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</SelectInput>}
        </Field>
        {txt('orden_viaje', 'Orden de viaje')}
        {txt('salida_fecha', 'Fecha', { type: 'date' })}
        {txt('salida_hora', 'Hora', { type: 'time' })}
        {txt('salida_km', 'Kilometraje', { mode: 'numeric' })}
        {txt('salida_observaciones', 'Observaciones', { wide: true })}
      </div>
    </Sheet>
  );
}

function RetornoSheet({ registro, onClose, onHecho }: { registro: Registro | null; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const { user } = useAuth();
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [km, setKm] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (registro) { setFecha(hoy()); setHora(ahora()); setKm(''); setObs(''); setError(null); } }, [registro]);
  if (!registro) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;

  async function guardar() {
    if (!registro) return;
    if (!km) { setError('Indica el kilometraje de retorno.'); return; }
    if (registro.salida_km && Number(km) < registro.salida_km) { setError(`El kilometraje de retorno no puede ser menor al de salida (${registro.salida_km}).`); return; }
    setEnviando(true); setError(null);
    try {
      await api(`/seguridad/unidades/${registro.id}`, {
        method: 'PUT',
        body: { retorno_fecha: fecha, retorno_hora: hora, retorno_km: km, retorno_observaciones: obs, retorno_has_alert: false, estado: 'completado', retorno_creado_por: user?.name },
      });
      haptic('success'); toast(`Retorno registrado: ${registro.placa_tracto}`);
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open onClose={() => !enviando && onClose()} title={`Retorno de ${registro.placa_tracto}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<LogIn size={16} />} onClick={guardar} loading={enviando}>Registrar retorno</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Hora">{p => <TextInput {...p} type="time" value={hora} onChange={e => setHora(e.target.value)} />}</Field>
        <Field label={`Kilometraje${registro.salida_km ? ` (salió con ${registro.salida_km.toLocaleString('es-PE')})` : ''}`} wide>
          {p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} autoFocus />}
        </Field>
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
