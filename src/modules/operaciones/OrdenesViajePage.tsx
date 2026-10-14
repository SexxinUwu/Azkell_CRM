import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight, CheckCircle2, CircleAlert, FileSpreadsheet, MapPin, Pencil, Play, Plus, SearchX, Trash2, Truck,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
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
  estado: string;                       // ACTIVO | INICIADO | FINALIZADO | ANULADO
  fecha_inicio: string | null;
  fecha_fin: string | null;
  kilometraje_inicial: number | null;
  kilometraje_final: number | null;
  horas_motor_remolque: number | null;
  usuario_creacion: string | null;
  cant_ordenes: number;
  peso_ida: number | string;
  peso_retorno: number | string;
  ordenes_list: string | null;
  rutas_list: string | null;
}

const ESTADOS = ['ACTIVO', 'INICIADO', 'FINALIZADO', 'ANULADO'];
const n = (v: unknown) => Number(v) || 0;
const tono = (e: string) => ({ ACTIVO: 'amber', INICIADO: 'blue', FINALIZADO: 'green', ANULADO: 'neutral' }[e] ?? 'neutral') as 'amber' | 'blue' | 'green' | 'neutral';
const css = (t: string) => (t === 'blue' ? 'accent' : t === 'neutral' ? 'gray' : t);
const fmtFecha = (s?: string | null) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');

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
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ viaje: Viaje | null } | null>(null);
  const [accion, setAccion] = useState<{ tipo: 'iniciar' | 'finalizar'; viaje: Viaje } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Viaje | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, isError, error } = useViajes(q);
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
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} viajes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Rutas, órdenes de servicio y gastos del viaje', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('operaciones/ordenes-viaje') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ viaje: null })}>Nuevo viaje</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {[['', 'Todos', lista.length], ...ESTADOS.map(e => [e, e.charAt(0) + e.slice(1).toLowerCase(), conteo[e] ?? 0])].map(([val, label, c]) => (
            <button key={String(val)} type="button" onClick={() => setEstado(String(val))}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: estado === val ? 'var(--ink)' : 'var(--fill)', color: estado === val ? 'var(--label-inverse)' : 'var(--label-2)',
              }}>
              {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{c}</span>
            </button>
          ))}
        </div>

        <SearchField value={busqueda} placeholder="Viaje, conductor, placa o ruta…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _ovT?: number })._ovT); (window as unknown as { _ovT?: number })._ovT = window.setTimeout(() => setQ(v.trim()), 350); }} />

        {isLoading ? <PageLoader /> : isError ? <Notice tone="error">{errorMessage(error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={busqueda || estado ? <SearchX size={22} /> : <Truck size={22} />} title={busqueda || estado ? 'Sin coincidencias' : 'Sin viajes'}>
            {puedeCrear && !busqueda && !estado ? <>Crea el primero con <strong>Nuevo viaje</strong>.</> : 'Prueba con otro filtro.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {visibles.map(v => (
              <button key={v.viaje} type="button" className="mov-fila" onClick={() => { haptic('selection'); setAbiertoId(v.viaje); }}>
                <div className="mov-fila__icon" style={{ background: `var(--${css(tono(v.estado))}-tint)`, color: `var(--${css(tono(v.estado))}-ink)` }}><Truck size={16} /></div>
                <div className="mov-fila__cuerpo">
                  <span className="mov-fila__titulo">{v.viaje} · {v.conductor || 'Sin conductor'}</span>
                  <span className="mov-fila__sub">{[v.placa_tracto, v.placa_remolque, v.ruta || v.rutas_list].filter(Boolean).join(' · ') || fmtFecha(v.fecha_viaje)}</span>
                </div>
                <div className="mov-fila__derecha">
                  <span className="mov-fila__monto">{n(v.peso_ida) + n(v.peso_retorno) ? `${(n(v.peso_ida) + n(v.peso_retorno)).toLocaleString('es-PE')} kg` : ''}</span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${css(tono(v.estado))}-ink)` }}>{v.estado}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <DetalleViaje
        viaje={abierto}
        onClose={() => setAbiertoId(null)}
        onEditar={puedeEditar && abierto && abierto.estado !== 'FINALIZADO' ? () => setFormulario({ viaje: abierto }) : undefined}
        onIniciar={puedeEditar && abierto?.estado === 'ACTIVO' ? () => setAccion({ tipo: 'iniciar', viaje: abierto }) : undefined}
        onFinalizar={puedeEditar && abierto?.estado === 'INICIADO' ? () => setAccion({ tipo: 'finalizar', viaje: abierto }) : undefined}
        onEliminar={puedeEliminar && abierto ? () => setPorEliminar(abierto) : undefined}
      />
      <FormularioViaje open={!!formulario} viaje={formulario?.viaje ?? null} usuario={user?.name ?? ''} onClose={() => setFormulario(null)} onGuardado={refrescar} />
      <AccionViaje accion={accion} usuario={user?.name ?? ''} onClose={() => setAccion(null)} onHecho={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title={`¿Eliminar el viaje ${porEliminar?.viaje ?? ''}?`} message="Se borran también sus rutas y órdenes de servicio asociadas. No se puede deshacer." confirmLabel="Eliminar" />
    </Page>
  );
}

function DetalleViaje({ viaje: v, onClose, onEditar, onIniciar, onFinalizar, onEliminar }: {
  viaje: Viaje | null; onClose: () => void; onEditar?: () => void; onIniciar?: () => void; onFinalizar?: () => void; onEliminar?: () => void;
}) {
  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));
  return (
    <Sheet open={!!v} onClose={onClose} title={v ? `Viaje ${v.viaje}` : ''}
      footer={
        <>
          {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
          {onEditar && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          {onIniciar && <Button variant="primary" icon={<Play size={16} />} onClick={onIniciar}>Iniciar viaje</Button>}
          {onFinalizar && <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={onFinalizar}>Finalizar</Button>}
          {!onEliminar && !onEditar && !onIniciar && !onFinalizar && <Button variant="secondary" onClick={onClose}>Cerrar</Button>}
        </>
      }>
      {v && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem', color: `var(--${css(tono(v.estado))}-ink)` }}>{v.estado}</span><span className="inv-metrica__label">Estado</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{n(v.cant_ordenes)}</span><span className="inv-metrica__label">Órdenes de servicio</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{(n(v.peso_ida) + n(v.peso_retorno)).toLocaleString('es-PE')} kg</span><span className="inv-metrica__label">Peso total</span></div>
          </div>
          <div className="tarjeta__lista">
            {fila('Conductor', v.conductor)}{fila('Tracto', v.placa_tracto, true)}{fila('Remolque', v.placa_remolque, true)}{fila('Escolta', v.escolta)}
            {fila('Ruta', v.ruta)}{fila('Partida', v.direccion_partida)}{fila('Llegada', v.direccion_llegada)}
            {fila('Rutas', v.rutas_list)}{fila('Órdenes de servicio', v.ordenes_list)}
          </div>
          <div className="tarjeta__lista">
            {fila('Fecha del viaje', fmtFecha(v.fecha_viaje), true)}{fila('Inicio', v.fecha_inicio ? fmtFecha(v.fecha_inicio) : '', true)}{fila('Fin', v.fecha_fin ? fmtFecha(v.fecha_fin) : '', true)}
            {fila('Km inicial', v.kilometraje_inicial?.toLocaleString('es-PE'), true)}{fila('Km final', v.kilometraje_final?.toLocaleString('es-PE'), true)}
            {fila('Horas motor remolque', v.horas_motor_remolque, true)}{fila('Observaciones', v.observaciones)}{fila('Creado por', v.usuario_creacion)}
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
  const [fecha, setFecha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accion) return;
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setFecha(d.toISOString().slice(0, 16)); setError(null);
    setKm(accion.tipo === 'iniciar' ? String(accion.viaje.kilometraje_inicial ?? '') : '');
    setHoras(String(accion.viaje.horas_motor_remolque ?? ''));
  }, [accion]);

  if (!accion) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const iniciar = accion.tipo === 'iniciar';

  async function confirmar() {
    if (!accion) return;
    if (!km) { setError(iniciar ? 'Indica el kilometraje inicial.' : 'Indica el kilometraje final.'); return; }
    if (!iniciar && accion.viaje.kilometraje_inicial != null && Number(km) < accion.viaje.kilometraje_inicial) {
      setError('El kilometraje final no puede ser menor al inicial.'); return;
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

  return (
    <Sheet open onClose={() => !enviando && onClose()} title={`${iniciar ? 'Iniciar' : 'Finalizar'} viaje ${accion.viaje.viaje}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={confirmar} loading={enviando}>{iniciar ? 'Iniciar' : 'Finalizar'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label={iniciar ? 'Fecha y hora de salida' : 'Fecha y hora de llegada'} wide>
          {p => <TextInput {...p} type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />}
        </Field>
        <Field label={iniciar ? 'Kilometraje inicial' : 'Kilometraje final'}>{p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} autoFocus />}</Field>
        {iniciar && <Field label="Horas motor del remolque">{p => <TextInput {...p} inputMode="numeric" value={horas} onChange={e => setHoras(e.target.value.replace(/\D/g, ''))} />}</Field>}
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
  const editando = !!viaje;

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const base: Record<string, string> = {
      viaje: '', fecha_viaje: d.toISOString().slice(0, 16), conductor: '', id_conductor: '', placa_tracto: '', placa_remolque: '', ruta: '', peso: '',
      direccion_partida: '', direccion_llegada: '', ubigeo_partida: '', ubigeo_llegada: '', escolta: '', observaciones: '', kilometraje_inicial: '', horas_motor_remolque: '',
    };
    if (viaje) for (const k of Object.keys(base)) { const x = (viaje as unknown as Record<string, unknown>)[k]; if (x != null) base[k] = k === 'fecha_viaje' ? String(x).replace(' ', 'T').slice(0, 16) : String(x); }
    setV(base);
    if (!viaje) api<{ viaje?: string }>('/operaciones/ordenes-viaje/correlativo').then(r => setV(a => ({ ...a, viaje: r.viaje ?? '' }))).catch(() => undefined);
  }, [open, viaje]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const remolques = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);

  async function guardar() {
    if (!v.conductor.trim() || !v.placa_tracto) { setError('El conductor y el tracto son obligatorios.'); return; }
    setEnviando(true); setError(null);
    try {
      const cond = (conductores.data ?? []).find(c => c.nombre === v.conductor);
      const body = { ...v, id_conductor: cond?.id ?? (v.id_conductor || null), fecha_viaje: v.fecha_viaje ? v.fecha_viaje.replace('T', ' ') + ':00' : undefined, usuario_creacion: usuario };
      const r = editando
        ? await api<{ ok?: boolean; error?: string }>(`/operaciones/ordenes-viaje/${encodeURIComponent(viaje!.viaje)}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string }>('/operaciones/ordenes-viaje', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Viaje actualizado' : 'Viaje creado');
      await onGuardado(); onClose();
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
        {txt('viaje', 'N° de viaje', { disabled: true })}
        {txt('fecha_viaje', 'Fecha y hora', { type: 'datetime-local' })}
        <Field label="Conductor" wide>
          {p => (<>
            <TextInput {...p} list="ov-conductores" value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />
            <datalist id="ov-conductores">{(conductores.data ?? []).map(c => <option key={c.id} value={c.nombre} />)}</datalist>
          </>)}
        </Field>
        <Field label="Tracto">
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
