import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Banknote, CircleAlert, FileSpreadsheet, FileText, Pencil, Plus, SearchX, Trash2, Wallet } from 'lucide-react';
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
import { fmtMonto, useCuentas, type CuentaPorCobrar } from './api';
import { ImportarCuentasSheet } from './ImportarCuentasSheet';
import { NotaCreditoSheet } from './NotaCreditoSheet';

const ESTADOS = ['PENDIENTE', 'PAGADO', 'ANULADO'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const n = (v: unknown) => Number(v) || 0;
// Fecha peruana dd/mm/aaaa, sin cambio de zona horaria
const dia = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
// Soles con S/ y espacio no divisible
const soles = (v: unknown) => `S/\u00a0${fmtMonto(v as number)}`;

function diasA(fecha?: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(dia(fecha) + 'T00:00:00');
  return Number.isNaN(f.getTime()) ? null : Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
}

function tono(c: CuentaPorCobrar): 'green' | 'amber' | 'red' | 'neutral' {
  const e = String(c.estado_servicio ?? '').toUpperCase();
  if (e === 'PAGADO') return 'green';
  if (e === 'ANULADO') return 'neutral';
  const d = diasA(c.fecha_cobrar);
  if (d !== null && d < 0) return 'red';
  if (d !== null && d <= 7) return 'amber';
  return 'amber';
}

export function CuentasPage() {
  const { data, isLoading, isError, error } = useCuentas();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [mes, setMes] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ cuenta: CuentaPorCobrar | null } | null>(null);
  const [pagando, setPagando] = useState<CuentaPorCobrar | null>(null);
  const [porEliminar, setPorEliminar] = useState<CuentaPorCobrar | null>(null);
  const [importando, setImportando] = useState(false);
  const [notaCredito, setNotaCredito] = useState<CuentaPorCobrar | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const lista: CuentaPorCobrar[] = data ?? [];
  const abierta = lista.find(c => c.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_cuentas.crear');
  const puedeEditar = can('tesoreria_cuentas.editar', 'tesoreria_cuentas.crear');
  const puedeEliminar = can('tesoreria_cuentas.eliminar');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return lista.filter(c =>
      (!estado || String(c.estado_servicio).toUpperCase() === estado) &&
      (!mes || String(c.mes_facturacion).toUpperCase() === mes) &&
      (!q || [c.cliente, c.razon_social, c.factura, c.serie, c.codigo_liquidacion, c.orden_servicio, c.placa_camion, c.conductor, c.numero_viaje]
        .some(v => String(v ?? '').toUpperCase().includes(q))));
  }, [lista, busqueda, estado, mes]);

  const resumen = useMemo(() => {
    const abiertas = visibles.filter(c => String(c.estado_servicio).toUpperCase() === 'PENDIENTE');
    return {
      porCobrar: abiertas.reduce((s, c) => s + n(c.neto_cobrar), 0),
      vencido: abiertas.filter(c => { const d = diasA(c.fecha_cobrar); return d !== null && d < 0; }).reduce((s, c) => s + n(c.neto_cobrar), 0),
      cobrado: visibles.filter(c => String(c.estado_servicio).toUpperCase() === 'PAGADO').reduce((s, c) => s + n(c.neto_cobrado), 0),
    };
  }, [visibles]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/cuentas/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Registro eliminado'); setPorEliminar(null); setAbiertoId(null);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Cuentas-por-cobrar', 'Cuentas',
        ['Liquidación', 'Cliente', 'Razón social', 'Factura', 'Fecha factura', 'Total', 'Detracción', 'Neto por cobrar', 'Neto cobrado', 'Vence', 'Depósito', 'Estado'],
        visibles.map(c => [c.codigo_liquidacion, c.cliente, c.razon_social, `${c.serie ?? ''}-${c.factura ?? ''}`, dia(c.fecha_factura),
          n(c.total), n(c.detraccion), n(c.neto_cobrar), c.neto_cobrado == null ? '' : n(c.neto_cobrado), dia(c.fecha_cobrar), dia(c.fecha_deposito), c.estado_servicio]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Cuentas por cobrar"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} registros`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} registros`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              ...(puedeCrear ? [{ label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) }] : []),
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: !puedeCrear, onSelect: () => abrirClasico('tesoreria/cuentas') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ cuenta: null })}>Nuevo</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{soles(resumen.porCobrar)}</span><span className="inv-metrica__label">Por cobrar</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical">{soles(resumen.vencido)}</span><span className="inv-metrica__label">Vencido</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{soles(resumen.cobrado)}</span><span className="inv-metrica__label">Cobrado</span></div>
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Cliente, factura, liquidación, placa…" />
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
              <option value="">Todos los estados</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
            <SelectInput value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes de facturación" style={{ width: 'auto' }}>
              <option value="">Todos los meses</option>
              {MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda || estado || mes ? <SearchX size={22} /> : <Wallet size={22} />} title={busqueda || estado || mes ? 'Sin coincidencias' : 'Sin cuentas por cobrar'}>
              {puedeCrear && !busqueda && !estado && !mes ? <>Registra la primera con <strong>Nuevo</strong>.</> : 'Prueba con otros filtros.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(c => {
                const t = tono(c);
                const d = diasA(c.fecha_cobrar);
                const pend = String(c.estado_servicio).toUpperCase() === 'PENDIENTE';
                return (
                  <button key={c.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbiertoId(c.id); }}>
                    <div className="mov-fila__icon" style={{ background: `var(--${t === 'neutral' ? 'gray' : t}-tint)`, color: `var(--${t === 'neutral' ? 'gray' : t}-ink)` }}>
                      <FileText size={16} />
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{c.cliente || c.razon_social || 'Sin cliente'}</span>
                      <span className="mov-fila__sub">{[c.serie && c.factura ? `${c.serie}-${c.factura}` : c.codigo_liquidacion, c.placa_camion, dia(c.fecha_factura)].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className="mov-fila__monto">{soles(pend ? c.neto_cobrar : c.neto_cobrado ?? c.neto_cobrar)}</span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${t === 'neutral' ? 'gray' : t}-ink)` }}>
                        {pend && d !== null ? (d < 0 ? `Vencida hace ${Math.abs(d)} d` : d === 0 ? 'Vence hoy' : `Vence en ${d} d`) : c.estado_servicio}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <DetalleCuenta
        cuenta={abierta}
        onClose={() => setAbiertoId(null)}
        onEditar={puedeEditar && abierta ? () => setFormulario({ cuenta: abierta }) : undefined}
        onNotaCredito={puedeEditar && abierta ? () => { setNotaCredito(abierta); setAbiertoId(null); } : undefined}
        onPagar={puedeEditar && abierta && String(abierta.estado_servicio).toUpperCase() === 'PENDIENTE' ? () => setPagando(abierta) : undefined}
        onEliminar={puedeEliminar && abierta && String(abierta.estado_servicio).toUpperCase() !== 'PAGADO' ? () => setPorEliminar(abierta) : undefined}
      />
      <FormularioCuenta open={!!formulario} cuenta={formulario?.cuenta ?? null} onClose={() => setFormulario(null)} />
      <ImportarCuentasSheet open={importando} onClose={() => setImportando(false)} />
      <NotaCreditoSheet cuenta={notaCredito} onClose={() => setNotaCredito(null)} />
      <PagoCuenta cuenta={pagando} onClose={() => setPagando(null)} usuario={user?.name ?? ''} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title="¿Eliminar este registro?" message={porEliminar ? `${porEliminar.cliente ?? ''} · ${porEliminar.serie ?? ''}-${porEliminar.factura ?? ''}` : ''} confirmLabel="Eliminar" />
    </Page>
  );
}

function DetalleCuenta({ cuenta: c, onClose, onEditar, onPagar, onEliminar, onNotaCredito }: {
  cuenta: CuentaPorCobrar | null; onClose: () => void; onEditar?: () => void; onPagar?: () => void; onEliminar?: () => void; onNotaCredito?: () => void;
}) {
  const fila = (label: string, valor: unknown, mono = false) => (valor === null || valor === undefined || valor === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{String(valor)}</span></div>
  ));
  const monto = (label: string, v: unknown, fuerte = false) => (v === null || v === undefined || v === '' ? null : (
    <div className="dato"><span className="dato__label">{label}</span><span className="dato__valor" style={fuerte ? { fontWeight: 700 } : undefined}>{soles(v as number)}</span></div>
  ));
  return (
    <Sheet open={!!c} onClose={onClose} title={c ? `${c.serie ?? ''}${c.serie && c.factura ? '-' : ''}${c.factura ?? c.codigo_liquidacion ?? 'Registro'}` : ''}
      footer={
        <>
          {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
          {onNotaCredito && <Button variant="secondary" icon={<FileText size={16} />} onClick={onNotaCredito}>Nota de crédito</Button>}
          {onEditar && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
          {onPagar && <Button variant="primary" icon={<Banknote size={16} />} onClick={onPagar}>Registrar pago</Button>}
          {!onEliminar && !onEditar && !onPagar && !onNotaCredito && <Button variant="secondary" onClick={onClose}>Cerrar</Button>}
        </>
      }>
      {c && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="tarjeta__lista">
            {fila('Cliente', c.cliente)}{fila('Razón social', c.razon_social)}{fila('Estado', c.estado_servicio)}
            {fila('Liquidación', c.codigo_liquidacion, true)}{fila('Orden de servicio', c.orden_servicio, true)}{fila('Viaje', c.numero_viaje, true)}
            {fila('Lugar', c.lugar)}{fila('Conductor', c.conductor)}{fila('Placas', [c.placa_camion, c.placa_carreta].filter(Boolean).join(' / '), true)}
          </div>
          <div className="tarjeta__lista">
            {monto('Flete', c.flete)}{monto('Tarifa', c.tarifa)}{monto('Gastos operativos', c.gastos_operativos)}
            {monto('Base imponible', c.base_imponible)}{monto('IGV', c.igv)}{monto('Total', c.total, true)}
            {monto('Adelanto', c.adelanto)}{monto('Detracción', c.detraccion)}{monto('Neto por cobrar', c.neto_cobrar, true)}
            {monto('Neto cobrado', c.neto_cobrado)}{monto('Diferencia', c.diferencia)}
          </div>
          <div className="tarjeta__lista">
            {fila('Mes de facturación', c.mes_facturacion)}{fila('Fecha de factura', dia(c.fecha_factura), true)}{fila('Crédito', c.credito_dias ? `${c.credito_dias} días` : '')}
            {fila('Fecha de cobro', dia(c.fecha_cobrar), true)}{fila('Fecha de depósito', dia(c.fecha_deposito), true)}{fila('Nota de crédito', c.nota_credito)}
            {fila('Observación', c.observacion)}
          </div>
          {[['Factura', c.factura_documento_url], ['Liquidación', c.documento_url], ['Sustento de pago', c.sustento_pago_url], ['Nota de crédito', c.nota_credito_url]]
            .filter(([, u]) => u).length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {[['Factura', c.factura_documento_url], ['Liquidación', c.documento_url], ['Sustento de pago', c.sustento_pago_url], ['Nota de crédito', c.nota_credito_url]]
                .filter(([, u]) => u).map(([l, u]) => (
                  <a key={String(l)} className="btn btn--secondary btn--sm" href={String(u)} target="_blank" rel="noreferrer">{l}</a>
                ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PagoCuenta({ cuenta, usuario, onClose }: { cuenta: CuentaPorCobrar | null; usuario: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cuenta) return;
    setMonto(String(cuenta.neto_cobrado ?? cuenta.neto_cobrar ?? '')); setFecha(new Date().toISOString().slice(0, 10)); setArchivo(null); setError(null);
  }, [cuenta]);

  const [errMonto, setErrMonto] = useState<string | undefined>();
  const diferencia = cuenta ? (parseFloat(monto.replace(',', '.')) || 0) - n(cuenta.neto_cobrar) : 0;

  async function guardar() {
    if (!cuenta) return;
    const v = parseFloat(monto.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setErrMonto('Indica el monto cobrado.'); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const f = new FormData();
      f.append('neto_cobrado', String(v)); f.append('fecha_deposito', fecha); f.append('usuario', usuario);
      if (archivo) f.append('archivo_sustento', archivo);
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/cuentas/${cuenta.id}/registrar-pago`, { method: 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar el pago');
      haptic('success'); toast('Pago registrado: la cuenta quedó PAGADA');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!cuenta} onClose={() => !enviando && onClose()} title="Registrar pago"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Marcar como pagado</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Neto por cobrar">{p => <TextInput {...p} value={soles(cuenta?.neto_cobrar)} disabled readOnly />}</Field>
        <Field label="Neto cobrado" hint={diferencia !== 0 ? `Diferencia: ${soles(diferencia)}` : undefined} error={errMonto}>
          {p => <TextInput {...p} inputMode="decimal" value={monto} onChange={e => { setMonto(e.target.value); setErrMonto(undefined); }} autoFocus />}
        </Field>
        <Field label="Fecha de depósito">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Sustento (voucher)" hint={archivo?.name}>{p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />}</Field>
      </div>
    </Sheet>
  );
}

const VACIO: Record<string, string> = {
  codigo_liquidacion: '', orden_servicio: '', fecha_liquidacion: '', numero_viaje: '', fecha_servicio: '', razon_social: '',
  placa_camion: '', placa_carreta: '', conductor: '', cliente: '', lugar: '', flete: '', comision_porcentaje: '', tarifa: '',
  gastos_operativos: '', base_imponible: '', adelanto: '', mes_facturacion: '', fecha_factura: '', serie: '', factura: '',
  credito_dias: '15', fecha_cobrar: '', estado_servicio: 'PENDIENTE', observacion: '',
};

function FormularioCuenta({ open, cuenta, onClose }: { open: boolean; cuenta: CuentaPorCobrar | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(VACIO);
  const [facturaArchivo, setFacturaArchivo] = useState<File | null>(null);
  const [liqArchivo, setLiqArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = !!cuenta;

  useEffect(() => {
    if (!open) return;
    const ini: Record<string, string> = { ...VACIO };
    if (cuenta) for (const k of Object.keys(VACIO)) { const x = (cuenta as Record<string, unknown>)[k]; ini[k] = x == null ? '' : String(x).split('T')[0] === String(x) || /\d{4}-\d{2}-\d{2}/.test(String(x)) ? String(x).split('T')[0] : String(x); }
    setV(ini); setFacturaArchivo(null); setLiqArchivo(null); setError(null);
  }, [open, cuenta]);

  const set = (k: string) => (e: { target: { value: string } }) => setV(a => ({ ...a, [k]: e.target.value }));

  // Cálculo igual al de la versión actual: IGV 18 %, detracción 4 % si el total pasa de S/ 700
  const base = parseFloat(v.base_imponible) || 0;
  const igv = +(base * 0.18).toFixed(2);
  const total = +(base + igv).toFixed(2);
  const detraccion = total > 700 ? Math.round(total * 0.04) : 0;
  const adelanto = parseFloat(v.adelanto) || 0;
  const neto = +(total - adelanto - detraccion).toFixed(2);

  async function guardar() {
    if (!v.cliente.trim() && !v.razon_social.trim()) { setError('Indica el cliente o la razón social.'); return; }
    if (!base) { setError('Indica la base imponible.'); return; }
    setEnviando(true); setError(null);
    try {
      const f = new FormData();
      for (const [k, val] of Object.entries(v)) f.append(k, val);
      f.append('igv', String(igv)); f.append('total', String(total)); f.append('detraccion', String(detraccion)); f.append('neto_cobrar', String(neto));
      if (cuenta?.documento_url) f.append('documento_url', cuenta.documento_url);
      if (cuenta?.factura_documento_url) f.append('factura_documento_url', cuenta.factura_documento_url);
      if (liqArchivo) f.append('archivo_adjunto', liqArchivo);
      if (facturaArchivo) f.append('archivo_factura', facturaArchivo);
      const r = await api<{ ok?: boolean; error?: string }>(cuenta ? `/tesoreria/cuentas/${cuenta.id}` : '/tesoreria/cuentas', { method: cuenta ? 'PUT' : 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Registro actualizado' : 'Registro creado');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const txt = (k: string, label: string, extra?: { wide?: boolean; type?: string; mode?: 'decimal' | 'numeric' }) => (
    <Field label={label} wide={extra?.wide}>
      {p => <TextInput {...p} type={extra?.type ?? 'text'} inputMode={extra?.mode} value={v[k] ?? ''} onChange={set(k)} />}
    </Field>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? 'Editar cuenta por cobrar' : 'Nueva cuenta por cobrar'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {txt('cliente', 'Cliente', { wide: true })}
        {txt('razon_social', 'Razón social', { wide: true })}
        {txt('codigo_liquidacion', 'N° de liquidación')}
        {txt('orden_servicio', 'Orden de servicio')}
        {txt('fecha_liquidacion', 'Fecha de liquidación', { type: 'date' })}
        {txt('fecha_servicio', 'Fecha de servicio', { type: 'date' })}
        {txt('numero_viaje', 'N° de viaje')}
        {txt('lugar', 'Lugar')}
        {txt('placa_camion', 'Placa camión')}
        {txt('placa_carreta', 'Placa carreta')}
        {txt('conductor', 'Conductor', { wide: true })}
        {txt('flete', 'Flete', { mode: 'decimal' })}
        {txt('tarifa', 'Tarifa', { mode: 'decimal' })}
        {txt('gastos_operativos', 'Gastos operativos', { mode: 'decimal' })}
        {txt('base_imponible', 'Base imponible', { mode: 'decimal' })}
        {txt('adelanto', 'Adelanto', { mode: 'decimal' })}
        <Field label="IGV · Total · Detracción · Neto" wide hint="Se calculan solos: IGV 18 %, detracción 4 % si el total supera S/ 700">
          {() => <TextInput readOnly disabled value={`IGV ${igv.toFixed(2)} · Total ${total.toFixed(2)} · Detracción ${detraccion.toFixed(2)} · Neto ${neto.toFixed(2)}`} />}
        </Field>
        <Field label="Mes de facturación">
          {p => (
            <SelectInput {...p} value={v.mes_facturacion} onChange={set('mes_facturacion')}>
              <option value="">—</option>{MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
          )}
        </Field>
        {txt('fecha_factura', 'Fecha de factura', { type: 'date' })}
        {txt('serie', 'Serie')}
        {txt('factura', 'N° de factura')}
        {txt('credito_dias', 'Días de crédito', { mode: 'numeric' })}
        {txt('fecha_cobrar', 'Fecha de cobro', { type: 'date' })}
        <Field label="Estado">
          {p => <SelectInput {...p} value={v.estado_servicio} onChange={set('estado_servicio')}>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}</SelectInput>}
        </Field>
        {txt('observacion', 'Observación', { wide: true })}
        <Field label="PDF de la factura" hint={facturaArchivo?.name}>{p => <TextInput {...p} type="file" accept="application/pdf,image/*" onChange={e => setFacturaArchivo(e.target.files?.[0] ?? null)} />}</Field>
        <Field label="PDF de la liquidación" hint={liqArchivo?.name}>{p => <TextInput {...p} type="file" accept="application/pdf,image/*" onChange={e => setLiqArchivo(e.target.files?.[0] ?? null)} />}</Field>
      </div>
    </Sheet>
  );
}
