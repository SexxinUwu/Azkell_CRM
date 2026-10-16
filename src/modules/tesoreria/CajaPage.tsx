import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight as IconoIngreso, ArrowUpRight, Ban, CheckCircle2, CircleAlert, FileSpreadsheet, Paperclip,
  Pencil, Plus, SearchX, Trash2, Upload, Wallet,
} from 'lucide-react';
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
import {
  buscarOrdenesViaje, fmtMonto, siguienteNumeroCaja, useBancos, useCaja, useCentrosCostos, useMotivosGastos,
  type CajaMovimiento,
} from './api';

const ESTADOS = ['REGISTRADO', 'PENDIENTE', 'APROBADO', 'PROCESADO', 'PAGADO', 'ANULADO'];
const MODALIDADES = ['TRANSFERENCIA BANCARIA', 'EFECTIVO', 'YAPE / PLIN', 'DEPOSITO EN CUENTA', 'TARJETA DE CRÉDITO/DÉBITO'];
const COMPROBANTES = ['FACTURA', 'BOLETA DE VENTA', 'RECIBO POR HONORARIOS', 'VALE PROVISIONAL DE CAJA', 'TICKET DE PEAJE', 'SIN COMPROBANTE'];
const PERSONAS = ['ADMINISTRATIVO', 'CONDUCTOR', 'PROVEEDOR', 'BANCO'];
const n = (v: unknown) => Number(v) || 0;
// Fecha peruana dd/mm/aaaa, sin cambio de zona horaria
const dia = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
// Soles con S/ y espacio no divisible; US$ para dólares
const sol = (v: unknown) => `S/\u00a0${fmtMonto(v as number)}`;
const monto = (v: unknown, moneda?: string | null) => `${moneda === 'DOLARES' ? 'US$' : 'S/'}\u00a0${fmtMonto(v as number)}`;
const tonoEstado = (e: string) => ({ APROBADO: 'blue', PROCESADO: 'green', PAGADO: 'green', ANULADO: 'neutral', REGISTRADO: 'amber', PENDIENTE: 'amber' }[e] ?? 'neutral');

export function CajaPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ mov: CajaMovimiento | null } | null>(null);

  const { data, isLoading, isError, error } = useCaja({ desde, hasta, estado, buscar });
  const lista = data ?? [];
  const abierto = lista.find(m => m.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_caja.crear');

  const resumen = useMemo(() => {
    const validos = lista.filter(m => m.estado !== 'ANULADO');
    const ingresos = validos.filter(m => m.tipo_movimiento === 'INGRESO').reduce((s, m) => s + n(m.importe_total), 0);
    const egresos = validos.filter(m => m.tipo_movimiento !== 'INGRESO').reduce((s, m) => s + n(m.importe_total), 0);
    return { ingresos, egresos, saldo: ingresos - egresos, pendientes: lista.filter(m => m.estado === 'REGISTRADO' || m.estado === 'PENDIENTE').length };
  }, [lista]);

  async function exportar() {
    try {
      await exportarExcel('Caja', 'Caja',
        ['Fecha', 'Serie-N°', 'Movimiento', 'Motivo', 'Sub motivo', 'Persona', 'Orden de viaje', 'Placa', 'Modalidad', 'Moneda', 'Importe', 'Estado'],
        lista.map(m => [dia(m.fecha), `${m.serie ?? ''}-${m.numero ?? ''}`, m.tipo_movimiento, m.motivo, m.sub_motivo, m.persona, m.orden_viaje,
          m.placa, m.modalidad_pago, m.moneda, n(m.importe_total), m.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria'] });

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Caja"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} movimientos · ${resumen.pendientes} sin aprobar`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${lista.length} movimientos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Bancos y motivos de gasto', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('tesoreria/caja') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ mov: null })}>Nuevo</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{sol(resumen.ingresos)}</span><span className="inv-metrica__label">Ingresos</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical">{sol(resumen.egresos)}</span><span className="inv-metrica__label">Egresos</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{sol(resumen.saldo)}</span><span className="inv-metrica__label">Saldo</span></div>
        </div>

        <SearchField value={busqueda} placeholder="Persona, motivo, N°, placa, orden de viaje…"
          onChange={v => { setBusqueda(v); window.clearTimeout((window as unknown as { _cajaT?: number })._cajaT); (window as unknown as { _cajaT?: number })._cajaT = window.setTimeout(() => setBuscar(v.trim()), 350); }} />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={buscar || estado || desde || hasta ? <SearchX size={22} /> : <Wallet size={22} />} title={buscar || estado || desde || hasta ? 'Sin coincidencias' : 'Sin movimientos de caja'}>
            {puedeCrear && !buscar && !estado ? <>Registra el primero con <strong>Nuevo</strong>.</> : 'Prueba con otros filtros.'}
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {lista.map(m => {
              const ingreso = m.tipo_movimiento === 'INGRESO';
              return (
                <button key={m.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbiertoId(m.id); }}>
                  <div className="mov-fila__icon" style={{ background: ingreso ? 'var(--green-tint)' : 'var(--red-tint)', color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                    {ingreso ? <IconoIngreso size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{m.persona || m.sub_motivo || m.motivo || 'Movimiento'}</span>
                    <span className="mov-fila__sub">{[`${m.serie ?? ''}-${m.numero ?? ''}`, m.motivo, m.orden_viaje, dia(m.fecha)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto" style={{ color: ingreso ? 'var(--green-ink)' : undefined }}>{ingreso ? '+' : '-'}{monto(m.importe_total, m.moneda)}</span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tonoEstado(m.estado) === 'blue' ? 'accent' : tonoEstado(m.estado)}-ink)` }}>{m.estado}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DetalleCaja mov={abierto} onClose={() => setAbiertoId(null)} onEditar={m => setFormulario({ mov: m })} onCambio={refrescar} />
      <FormularioCaja open={!!formulario} mov={formulario?.mov ?? null} onClose={() => setFormulario(null)} onGuardado={refrescar} />
    </Page>
  );
}

function DetalleCaja({ mov: m, onClose, onEditar, onCambio }: {
  mov: CajaMovimiento | null; onClose: () => void; onEditar: (m: CajaMovimiento) => void; onCambio: () => Promise<unknown>;
}) {
  const { can, user } = useAuth();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errMotivo, setErrMotivo] = useState<string | undefined>();
  const [borrando, setBorrando] = useState(false);
  const [docs, setDocs] = useState(false);
  const [voucher, setVoucher] = useState<File | null>(null);
  const [sustento, setSustento] = useState<File | null>(null);
  const [constancia, setConstancia] = useState('');

  useEffect(() => { setMotivo(''); setVoucher(null); setSustento(null); setConstancia(''); }, [m?.id]);
  if (!m) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;

  const editable = m.estado === 'REGISTRADO' || m.estado === 'PENDIENTE';

  async function ejecutar(fn: () => Promise<unknown>, ok: string, cerrar = false) {
    setOcupado(true);
    try { await fn(); haptic('success'); toast(ok); await onCambio(); if (cerrar) onClose(); }
    catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }
  const comprobar = (r: { ok?: boolean; error?: string }) => { if (r.ok === false) throw new Error(r.error || 'No se pudo completar'); };

  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));

  return (
    <>
      <Sheet open onClose={() => !ocupado && onClose()} title={`Caja ${m.serie ?? ''}-${m.numero ?? ''}`}
        footer={
          <>
            {can('tesoreria_caja.eliminar') && editable && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setBorrando(true)}>Eliminar</Button>}
            {can('gerencia.editar', 'tesoreria_caja.editar') && m.estado !== 'ANULADO' && m.estado !== 'PAGADO' &&
              <Button variant="secondary" icon={<Ban size={16} />} onClick={() => setAnulando(true)}>Anular</Button>}
            {can('tesoreria_caja.editar', 'tesoreria_caja.crear') && editable && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => { onClose(); onEditar(m); }}>Editar</Button>}
            {can('gerencia.editar', 'tesoreria_caja.editar') && editable &&
              <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={ocupado}
                onClick={() => ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id + '/aprobar', { method: 'POST', body: { usuario_aprobacion: user?.name } })), 'Caja aprobada')}>Aprobar</Button>}
            {(m.estado === 'APROBADO' || m.estado === 'PROCESADO') && can('tesoreria_caja.editar', 'tesoreria_caja.crear') &&
              <Button variant="primary" icon={<Upload size={16} />} onClick={() => setDocs(true)}>Subir documentos</Button>}
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num">{monto(m.importe_total, m.moneda)}</span><span className="inv-metrica__label">Importe</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{m.tipo_movimiento}</span><span className="inv-metrica__label">Movimiento</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{m.estado}</span><span className="inv-metrica__label">Estado</span></div>
          </div>
          <div className="tarjeta__lista">
            {fila('Fecha', `${dia(m.fecha)} ${m.hora ?? ''}`, true)}{fila('Motivo', [m.motivo, m.sub_motivo].filter(Boolean).join(' › '))}
            {fila('Centro de costos', m.centro_costo)}{fila('Persona', [m.tipo_persona, m.persona].filter(Boolean).join(' · '))}
            {fila('Autoriza', m.autoriza)}{fila('Orden de viaje', m.orden_viaje, true)}{fila('Conductor', m.conductor)}{fila('Ruta', m.ruta_viaje)}{fila('Placa', m.placa, true)}
            {fila('Modalidad de pago', m.modalidad_pago)}{fila('Comprobante', [m.tipo_comprobante, m.numero_factura].filter(Boolean).join(' '))}
            {fila('Constancia de depósito', m.numero_constancia_deposito, true)}{fila('Cuenta de la persona', m.cuenta_bancaria_persona, true)}{fila('Cuenta de la empresa', m.cuenta_bancaria_empresa, true)}
            {fila('Retención / detracción', n(m.retencion_detraccion) ? sol(m.retencion_detraccion) : '')}{fila('Descripción', m.descripcion)}{fila('Observación', m.observacion)}
            {fila('Registrado por', m.usuario_creacion)}{fila('Aprobado por', m.usuario_aprobacion ? `${m.usuario_aprobacion} ${m.fecha_aprobacion ?? ''}` : '')}
          </div>
          {(m.voucher_url || m.sustento_url) && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {m.voucher_url && <a className="btn btn--secondary btn--sm" href={m.voucher_url} target="_blank" rel="noreferrer"><Paperclip size={14} /> Voucher</a>}
              {m.sustento_url && <a className="btn btn--secondary btn--sm" href={m.sustento_url} target="_blank" rel="noreferrer"><Paperclip size={14} /> Sustento</a>}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={anulando} onClose={() => setAnulando(false)} title="Anular caja"
        footer={<><Button variant="secondary" onClick={() => setAnulando(false)}>Volver</Button>
          <Button variant="destructive" loading={ocupado} onClick={async () => {
            if (!motivo.trim()) { setErrMotivo('Escribe el motivo de la anulación.'); haptic('warning'); return; }
            await ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id + '/anular', { method: 'POST', body: { motivo: motivo.trim(), usuario_anulacion: user?.name } })), 'Caja anulada');
            setAnulando(false);
          }}>Anular</Button></>}>
        <div className="form-grid"><Field label="Motivo" wide error={errMotivo}>{p => <TextInput {...p} value={motivo} onChange={e => { setMotivo(e.target.value); setErrMotivo(undefined); }} autoFocus />}</Field></div>
      </Sheet>

      <Sheet open={docs} onClose={() => setDocs(false)} title="Subir documentos"
        footer={<><Button variant="secondary" onClick={() => setDocs(false)}>Cancelar</Button>
          <Button variant="primary" loading={ocupado} onClick={async () => {
            const f = new FormData();
            if (voucher) f.append('voucher', voucher);
            if (sustento) f.append('sustento', sustento);
            f.append('numero_constancia_deposito', constancia);
            await ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id + '/subir-documentos', { method: 'POST', body: f })), 'Documentos guardados');
            setDocs(false);
          }}>Guardar</Button></>}>
        <div className="form-grid">
          <Field label="N° de constancia de depósito" wide>{p => <TextInput {...p} value={constancia} onChange={e => setConstancia(e.target.value)} />}</Field>
          <Field label="Voucher" hint={voucher?.name}>{p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setVoucher(e.target.files?.[0] ?? null)} />}</Field>
          <Field label="Sustento" hint={sustento?.name}>{p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setSustento(e.target.files?.[0] ?? null)} />}</Field>
        </div>
      </Sheet>

      <ConfirmSheet open={borrando} onClose={() => !ocupado && setBorrando(false)} loading={ocupado}
        title="¿Eliminar este movimiento?" message="Solo se puede eliminar antes de aprobarlo." confirmLabel="Eliminar"
        onConfirm={async () => { await ejecutar(async () => comprobar(await api('/tesoreria/caja/' + m.id, { method: 'DELETE' })), 'Movimiento eliminado', true); setBorrando(false); }} />
    </>
  );
}

const ahora = () => new Date().toTimeString().slice(0, 5);
const hoy = () => new Date().toISOString().slice(0, 10);

function FormularioCaja({ open, mov, onClose, onGuardado }: { open: boolean; mov: CajaMovimiento | null; onClose: () => void; onGuardado: () => Promise<unknown> }) {
  const toast = useToast();
  const { user } = useAuth();
  const centros = useCentrosCostos();
  const motivos = useMotivosGastos();
  const bancos = useBancos();
  const [v, setV] = useState<Record<string, string>>({});
  const [voucher, setVoucher] = useState<File | null>(null);
  const [sustento, setSustento] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampos, setErrCampos] = useState<Record<string, string | undefined>>({});
  const [qViaje, setQViaje] = useState('');
  const editando = !!mov;

  const ordenes = useQuery({ queryKey: ['tesoreria', 'ordenes-viaje', qViaje], enabled: open, queryFn: () => buscarOrdenesViaje(qViaje), staleTime: 60_000 });
  const personas = useQuery({
    queryKey: ['tesoreria', 'personas', v.tipo_persona], enabled: open && (v.tipo_persona === 'CONDUCTOR' || v.tipo_persona === 'PROVEEDOR'),
    queryFn: async () => {
      const r = await api<unknown>(v.tipo_persona === 'CONDUCTOR' ? '/conductores-lista' : '/almacen/proveedores');
      return ((Array.isArray(r) ? r : []) as { nombre?: string }[]).map(x => String(x.nombre ?? '').trim()).filter(Boolean);
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setError(null); setErrCampos({}); setVoucher(null); setSustento(null); setQViaje('');
    const base: Record<string, string> = {
      fecha: hoy(), hora: ahora(), tipo_movimiento: 'EGRESO', serie: String(new Date().getFullYear()), numero: '', moneda: 'SOLES',
      tipo_cambio: '1', modalidad_pago: 'TRANSFERENCIA BANCARIA', tipo_persona: 'ADMINISTRATIVO',
    };
    if (mov) for (const k of Object.keys(mov)) { const x = (mov as Record<string, unknown>)[k]; if (x != null && typeof x !== 'object') base[k] = k.startsWith('fecha') ? String(x).split('T')[0] : String(x); }
    setV(base);
    if (!mov) siguienteNumeroCaja(base.serie).then(num => setV(a => ({ ...a, numero: a.numero || num }))).catch(() => undefined);
  }, [open, mov]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const ocupado = (v.serie ?? '') + '-' + (v.numero ?? '');
  const motivosUnicos = [...new Set((motivos.data ?? []).filter(m => m.estado === 'ACTIVO').map(m => m.motivo))];
  const subMotivos = (motivos.data ?? []).filter(m => m.estado === 'ACTIVO' && m.motivo === v.motivo);
  const cuentas = (bancos.data ?? []).filter(b => b.estado !== 'INACTIVO').map(b => `${b.banco} · ${b.numero_cuenta}`);

  function elegirViaje(codigo: string) {
    set('orden_viaje', codigo);
    const o = (ordenes.data ?? []).find(x => x.viaje === codigo);
    if (o) setV(a => ({ ...a, orden_viaje: codigo, conductor: o.conductor ?? a.conductor ?? '', placa: o.placa_tracto ?? a.placa ?? '', ruta_viaje: o.ruta ?? a.ruta_viaje ?? '' }));
  }

  async function guardar() {
    const e: Record<string, string> = {};
    if (!n(v.importe_total)) e.importe_total = 'Indica el importe.';
    if (!v.motivo) e.motivo = 'Elige el motivo.';
    setErrCampos(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const f = new FormData();
      const claves = ['fecha', 'hora', 'fecha_valuta', 'hora_valuta', 'numero_constancia_deposito', 'numero_factura', 'serie', 'numero', 'orden_viaje', 'conductor',
        'ruta_viaje', 'placa', 'autoriza', 'motivo', 'centro_costo', 'sub_motivo', 'modalidad_pago', 'moneda', 'tipo_persona', 'persona', 'tipo_movimiento',
        'retencion_detraccion', 'importe_total', 'tipo_cambio', 'descripcion', 'tipo_comprobante', 'cuenta_bancaria_persona', 'cuenta_bancaria_empresa', 'observacion'];
      for (const k of claves) f.append(k, v[k] ?? '');
      f.append('no_aplica_liquidacion', v.no_aplica_liquidacion === '1' ? '1' : '0');
      f.append('usuario_creacion', user?.name ?? '');
      if (voucher) f.append('voucher', voucher);
      if (sustento) f.append('sustento', sustento);
      const r = await api<{ ok?: boolean; error?: string }>(mov ? `/tesoreria/caja/${mov.id}` : '/tesoreria/caja', { method: mov ? 'PUT' : 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Movimiento actualizado' : 'Movimiento registrado');
      await onGuardado();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, o?: { type?: string; wide?: boolean; mode?: 'decimal' | 'numeric'; list?: string }) => (
    <Field label={label} wide={o?.wide} error={errCampos[k]}>
      {p => <TextInput {...p} type={o?.type ?? 'text'} inputMode={o?.mode} list={o?.list} value={v[k] ?? ''} onChange={e => { set(k, e.target.value); setErrCampos(x => ({ ...x, [k]: undefined })); }} />}
    </Field>
  );
  const sel = (k: string, label: string, opciones: string[], vacio = true, wide = false) => (
    <Field label={label} wide={wide} error={errCampos[k]}>
      {p => (
        <SelectInput {...p} value={v[k] ?? ''} onChange={e => { set(k, e.target.value); setErrCampos(x => ({ ...x, [k]: undefined })); }}>
          {vacio && <option value="">—</option>}
          {[...new Set([...opciones, ...(v[k] ? [v[k]] : [])])].map(o => <option key={o} value={o}>{o}</option>)}
        </SelectInput>
      )}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar caja ${ocupado}` : 'Nuevo movimiento de caja'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {sel('tipo_movimiento', 'Movimiento', ['EGRESO', 'INGRESO'], false)}
        {txt('numero', `N° (serie ${v.serie ?? ''})`)}
        {txt('fecha', 'Fecha', { type: 'date' })}
        {txt('hora', 'Hora', { type: 'time' })}
        {sel('moneda', 'Moneda', ['SOLES', 'DOLARES'], false)}
        {txt('importe_total', 'Importe total', { mode: 'decimal' })}
        {txt('retencion_detraccion', 'Retención / detracción', { mode: 'decimal' })}
        {v.moneda === 'DOLARES' && txt('tipo_cambio', 'Tipo de cambio', { mode: 'decimal' })}
        {sel('motivo', 'Motivo', motivosUnicos, true, true)}
        {sel('sub_motivo', 'Sub motivo', subMotivos.map(s => s.sub_motivo), true, true)}
        <Field label="Centro de costos" wide>
          {p => (
            <SelectInput {...p} value={v.centro_costo ?? ''} onChange={e => set('centro_costo', e.target.value)}>
              <option value="">—</option>
              {(centros.data ?? []).filter(c => c.estado === 'ACTIVO').map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Orden de viaje" wide hint="Escribe para buscar; completa conductor, placa y ruta">
          {p => (<>
            <TextInput {...p} list="caja-viajes" value={v.orden_viaje ?? ''} onChange={e => { set('orden_viaje', e.target.value); setQViaje(e.target.value.trim()); }} onBlur={e => elegirViaje(e.target.value)} />
            <datalist id="caja-viajes">{(ordenes.data ?? []).map(o => <option key={o.viaje} value={o.viaje}>{o.conductor} · {o.ruta}</option>)}</datalist>
          </>)}
        </Field>
        {txt('conductor', 'Conductor')}
        {txt('placa', 'Placa')}
        {sel('tipo_persona', 'Tipo de persona', PERSONAS, false)}
        <Field label="Persona" wide>
          {p => (<>
            <TextInput {...p} list="caja-personas" value={v.persona ?? ''} onChange={e => set('persona', e.target.value)} />
            <datalist id="caja-personas">{(personas.data ?? []).map(x => <option key={x} value={x} />)}</datalist>
          </>)}
        </Field>
        {txt('autoriza', 'Autoriza')}
        {sel('modalidad_pago', 'Modalidad de pago', MODALIDADES, false)}
        {sel('tipo_comprobante', 'Comprobante', COMPROBANTES)}
        {txt('numero_factura', 'N° de comprobante')}
        {sel('cuenta_bancaria_empresa', 'Cuenta de la empresa', cuentas, true, true)}
        {txt('cuenta_bancaria_persona', 'Cuenta de la persona', { wide: true })}
        {txt('descripcion', 'Descripción', { wide: true })}
        {txt('observacion', 'Observación', { wide: true })}
        <Field label="Voucher" hint={voucher?.name}>{p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setVoucher(e.target.files?.[0] ?? null)} />}</Field>
        <Field label="Sustento" hint={sustento?.name}>{p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setSustento(e.target.files?.[0] ?? null)} />}</Field>
        <label className="field field--wide" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <input type="checkbox" checked={v.no_aplica_liquidacion === '1'} onChange={e => set('no_aplica_liquidacion', e.target.checked ? '1' : '0')} />
          No aplica a liquidación de viaje
        </label>
      </div>
    </Sheet>
  );
}
