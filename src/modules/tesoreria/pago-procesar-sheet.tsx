import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Coins, FileCheck, FileText, Package, Paperclip, Truck, Wallet, X } from 'lucide-react';
import '../gerencia/gerencia-oc.css';
import './pago.css';
import { api, errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useBancos } from './api';
import { AplicarNotasCredito, type AplicacionElegida } from './AplicarNotasCredito';
import { useCuentasProveedor } from '../almacen/api';
import { etiquetaCuentaProveedor } from '../almacen/entradaReglas';
import { codigoOC, esUSD, importeOC, montoAPagar, redondear2, type OrdenPago } from './pago-datos';

const MAX_VOUCHER = 25 * 1024 * 1024; // mismo límite que el servidor

interface CuentaOrigen { label: string; usd: boolean; numero: string }

interface Errores { constancia?: string; cuenta?: string; monto?: string; voucher?: string; confirmado?: string }

// Etiqueta igual a la del clásico: "BCP - CTA CTE [SOLES] - 191-…". El servidor la usa para la moneda de la caja.
function preseleccion(oc: OrdenPago, cuentas: CuentaOrigen[]): string {
  const ctaEmpresa = oc.cuenta_bancaria_empresa ?? '';
  const guardada = ctaEmpresa
    ? cuentas.find(c => c.label === ctaEmpresa || (c.numero && ctaEmpresa.includes(c.numero)))
    : undefined;
  if (guardada) return guardada.label;
  return (cuentas.find(c => c.usd === esUSD(oc.moneda)) ?? cuentas[0]).label;
}

/**
 * Registra el pago de una OC aprobada: pasa a Procesado, registra el egreso en caja
 * y sube el voucher. El monto sale del total en soles (÷ T.C. si la cuenta es en US$), como en el clásico.
 * Se monta de nuevo en cada apertura (la key la pone la página), así empieza limpio.
 */
export function PagoProcesarSheet({ oc, open, onClose, onPagado }: { oc: OrdenPago | null; open: boolean; onClose: () => void; onPagado?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const bancos = useBancos();

  const [constancia, setConstancia] = useState('');
  const [cuentaSel, setCuentaSel] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);
  // Notas de crédito del proveedor aplicadas a este pago (si las hay)
  const [ncs, setNcs] = useState<AplicacionElegida[]>([]);
  const [netoNc, setNetoNc] = useState<number | null>(null);
  // OC en dólares pagada desde una cuenta en soles: tipo de cambio del día del pago
  const [tcPago, setTcPago] = useState('');
  // Cuenta del proveedor a la que se paga (de las registradas)
  const [destinoSel, setDestinoSel] = useState('');
  const ctasProv = useCuentasProveedor(oc?.proveedor_id ? String(oc.proveedor_id) : null, !!oc);
  const destinos = useMemo(() => (ctasProv.data ?? []).map(c => ({ label: etiquetaCuentaProveedor(c), usd: esUSD(c.moneda ?? 'SOLES') })), [ctasProv.data]);
  useEffect(() => {
    if (!oc || destinoSel || destinos.length === 0) return;
    const guardada = oc.cuenta_bancaria_proveedor ?? '';
    setDestinoSel((destinos.find(d => d.label === guardada) ?? destinos.find(d => guardada && guardada.includes(d.label.split(' - ').pop() ?? '#')) ?? destinos[0]).label);
  }, [oc, destinos, destinoSel]);

  const cuentas = useMemo<CuentaOrigen[]>(() =>
    (bancos.data ?? [])
      .filter(b => !b.estado || String(b.estado).toUpperCase() === 'ACTIVO')
      .map(b => {
        const usd = esUSD(b.moneda ?? 'SOLES');
        const numero = String(b.numero_cuenta ?? '').trim();
        return {
          label: `${b.banco ?? ''} - ${b.tipo_cuenta || 'CTA CTE'} [${usd ? 'DÓLARES' : 'SOLES'}] - ${numero}`,
          usd,
          numero,
        };
      }), [bancos.data]);

  useEffect(() => {
    if (!cuentaSel && oc && cuentas.length) setCuentaSel(preseleccion(oc, cuentas));
  }, [cuentas, cuentaSel, oc]);

  const cuenta = cuentas.find(c => c.label === cuentaSel) ?? null;
  const usd = cuenta ? cuenta.usd : !!oc && esUSD(oc.moneda);
  const tc = Number(oc?.tipo_cambio) || 0;
  const mixto = !!oc && esUSD(oc.moneda) && !usd;
  const importeUsd = oc && tc > 0 ? montoAPagar(oc, true) : 0;
  const tcPagoNum = Number(tcPago.replace(',', '.')) || 0;
  // En pago mixto el importe se calcula en dólares y se convierte; si no, como siempre
  const importe = oc ? (mixto ? importeUsd : montoAPagar(oc, usd)) : 0;
  // Lo que sale del banco: el importe menos las notas de crédito aplicadas
  const neto = ncs.length && netoNc != null ? netoNc : importe;
  const monto = mixto ? redondear2(neto * (tcPagoNum || tc)) : neto;
  const destino = destinos.find(d => d.label === destinoSel) ?? null;
  const difCambio = mixto ? redondear2(neto * ((tcPagoNum || tc) - tc)) : 0;

  const preview = useMemo(() => (voucher && voucher.type.startsWith('image/') ? URL.createObjectURL(voucher) : null), [voucher]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function elegirVoucher(f: File | undefined) {
    if (!f) return;
    const valido = f.type.startsWith('image/') || f.type === 'application/pdf';
    if (!valido) { setErrores(e => ({ ...e, voucher: 'Solo imágenes o PDF.' })); haptic('warning'); return; }
    if (f.size > MAX_VOUCHER) { setErrores(e => ({ ...e, voucher: 'El archivo supera 25 MB.' })); haptic('warning'); return; }
    setErrores(e => ({ ...e, voucher: undefined }));
    setVoucher(f);
  }

  async function confirmar() {
    if (!oc || guardando) return;
    const e: Errores = {};
    const totalmenteCompensada = ncs.length > 0 && monto <= 0;
    if (!constancia.trim() && !totalmenteCompensada) e.constancia = 'Ingresa el número de constancia u operación.';
    if (!cuenta) e.cuenta = 'Elige la cuenta de origen de la empresa.';
    if (mixto && tcPago.trim() && !(tcPagoNum >= 1 && tcPagoNum <= 20)) e.monto = 'El tipo de cambio del pago no parece válido (soles por dólar).';
    if (!(importe > 0)) {
      e.monto = usd && tc <= 0
        ? 'La orden no tiene tipo de cambio: no se puede calcular el monto en US$.'
        : 'La orden no tiene total en soles para pagar.';
    }
    if (!confirmado) e.confirmado = 'Marca la casilla para confirmar el pago.';
    setErrores(prev => ({ ...prev, ...e }));
    if (Object.values(e).some(Boolean)) { haptic('warning'); return; }

    const fd = new FormData();
    fd.append('numero_constancia', constancia.trim());
    fd.append('cuenta_origen', cuenta?.label ?? '');
    fd.append('moneda', usd ? 'USD' : 'PEN');
    if (mixto) fd.append('tipo_cambio_pago', String(tcPagoNum || tc));
    if (destinoSel) fd.append('cuenta_destino', destinoSel);
    fd.append('monto', String(redondear2(monto)));
    if (ncs.length) fd.append('nc_aplicaciones', JSON.stringify(ncs.map(a => ({ nc_id: a.nc_id, monto: a.monto }))));
    if (voucher) fd.append('voucher', voucher);

    setGuardando(true);
    try {
      await api(`/tesoreria/pago-requerimientos/${oc.id}/procesar`, { method: 'POST', body: fd });
      haptic('success');
      toast(`Pago de ${codigoOC(oc)} registrado`);
      qc.invalidateQueries({ queryKey: ['tesoreria'] });
      qc.invalidateQueries({ queryKey: ['almacen'] });
      onPagado?.();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  const monedaPago: 'USD' | 'PEN' = usd ? 'USD' : 'PEN';
  const monedaNeto: 'USD' | 'PEN' = usd || mixto ? 'USD' : 'PEN';
  const descuentoNc = ncs.length && netoNc != null ? redondear2(importe - netoNc) : 0;
  const docs = oc ? [
    { titulo: 'Cotización', url: oc.url_cotizacion_presigned, Icono: FileText },
    { titulo: 'Factura', url: oc.url_factura_presigned, Icono: FileCheck },
  ] : [];
  const urgente = /urgente|alta/i.test(String(oc?.prioridad ?? ''));

  return (
    <Sheet
      ancho
      open={open}
      onClose={() => { if (!guardando) onClose(); }}
      title={oc ? `Procesar pago · ${codigoOC(oc)}` : 'Procesar pago'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={guardando} onClick={confirmar}>Confirmar pago</Button>
        </>
      }
    >
      {oc && (
        <div className="ga-det">
          <div className="ga-det__col">
            <div className="ga-det__cab">
              <Badge tone="green">Aprobada</Badge>
              <Badge tone={urgente ? 'red' : 'gray'}>{urgente ? 'URGENTE' : 'NORMAL'}</Badge>
              <span className="ga-det__emitido">Emitida el {formatFechaPe(oc.fecha)}</span>
            </div>

            <section className="ga-sec" aria-label="Proveedor y orden">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} aria-hidden /> Proveedor y orden</span></h3>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Proveedor</span>
                  <span className="ga-bloque__valor">{oc.proveedor_nombre || '—'}</span>
                  <span className="ga-bloque__sub">RUC: {oc.proveedor_ruc || '—'}</span>
                  <span className="ga-bloque__sub">Condición: {oc.condicion_pago || 'Al contado'}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Motivo y destino</span>
                  <span className="ga-bloque__valor">{oc.motivo_entrada || oc.motivo || '—'}</span>
                  <span className="ga-bloque__sub">{[oc.sub_motivo, oc.centro_costo].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="ga-bloque__sub">Solicitó: {oc.solicitante || oc.creador_nombre || '—'}{oc.placa ? ` · Placa ${oc.placa}` : ''}</span>
                </div>
              </div>
            </section>

            <section className="ga-sec" aria-label="Datos del pago">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={16} aria-hidden /> Datos del pago</span></h3>

              {bancos.isError ? (
                <Notice tone="error">No se pudieron cargar las cuentas bancarias.</Notice>
              ) : !bancos.isLoading && cuentas.length === 0 ? (
                <Notice>No hay cuentas bancarias activas. Regístralas en Tesorería › Bancos.</Notice>
              ) : null}

              <div className="ga-dos">
                <Field label="Cuenta de origen (empresa)" error={errores.cuenta}>
                  {p => (
                    <SelectInput {...p} value={cuentaSel} disabled={bancos.isLoading || cuentas.length === 0}
                      onChange={e => { setCuentaSel(e.target.value); setErrores(x => ({ ...x, cuenta: undefined, monto: undefined })); }}>
                      <option value="">{bancos.isLoading ? 'Cargando cuentas…' : 'Elige una cuenta'}</option>
                      {cuentas.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Cuenta destino (proveedor)" hint={destinos.length === 0 && !ctasProv.isLoading ? 'El proveedor no tiene cuentas registradas: agrégalas en Almacén › Proveedores.' : undefined}>
                  {p => destinos.length > 0 ? (
                    <SelectInput {...p} value={destinoSel} onChange={e => setDestinoSel(e.target.value)}>
                      {destinos.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
                    </SelectInput>
                  ) : <TextInput {...p} readOnly value={ctasProv.isLoading ? 'Cargando cuentas…' : (oc.cuenta_bancaria_proveedor || 'No especificada')} />}
                </Field>
              </div>
              {destino && cuenta && destino.usd !== cuenta.usd && (
                <Notice tone="accent">Pagas desde una cuenta {cuenta.usd ? 'en dólares' : 'en soles'} a una cuenta {destino.usd ? 'en dólares' : 'en soles'} del proveedor: el banco convertirá con su propio tipo de cambio. Si el proveedor quiere soles, registra y elige su cuenta en soles.</Notice>
              )}

              <div className="ga-dos">
                {mixto && (
                  <Field label="Tipo de cambio del pago (S/ por US$)" hint={`La orden está en dólares y se paga en soles. Escribe el del día o el acordado con el proveedor; vacío = el de la orden (${tc}).`}>
                    {p => <TextInput {...p} inputMode="decimal" value={tcPago} placeholder={String(tc)} onChange={e => { setTcPago(e.target.value); setErrores(x => ({ ...x, monto: undefined })); }} />}
                  </Field>
                )}
                <Field label="N° de constancia / operación" error={errores.constancia}>
                  {p => (
                    <TextInput {...p} value={constancia} placeholder="Ej. 00482910"
                      onChange={e => { setConstancia(e.target.value); setErrores(x => ({ ...x, constancia: undefined })); }} />
                  )}
                </Field>
              </div>

              <Field label="Voucher o constancia (opcional)" hint="JPG, PNG o PDF · máximo 25 MB" error={errores.voucher}>
                {p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={a => elegirVoucher(a ?? undefined)} />}
              </Field>
              {voucher && (
                <div className="pago-proc__voucher">
                  {preview
                    ? <img className="pago-proc__miniatura" src={preview} alt="" />
                    : <span className="pago-proc__miniatura pago-proc__miniatura--pdf"><FileText size={20} /></span>}
                  <span className="pago-proc__nombre"><Paperclip size={13} /> {voucher.name}</span>
                  <Button variant="plain" size="sm" iconOnly icon={<X size={14} />} aria-label="Quitar voucher" onClick={() => setVoucher(null)} />
                </div>
              )}
            </section>

            <AplicarNotasCredito entradaId={oc.id} sugeridas={(() => { try { const x = JSON.parse(oc.nc_sugeridas || '[]'); return Array.isArray(x) ? x.map(Number) : []; } catch { return []; } })()} moneda={usd || mixto ? 'USD' : 'PEN'} importe={importe} onChange={(a, n) => { setNcs(a); setNetoNc(n); }} />

            {(oc.items?.length ?? 0) > 0 && (
              <section className="ga-sec" aria-label="Artículos">
                <h3 className="ga-sec__titulo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={16} aria-hidden /> Desglose de artículos / servicios</span>
                  <span className="ga-sec__cuenta">{oc.items!.length} {oc.items!.length === 1 ? 'ítem' : 'ítems'}</span>
                </h3>
                <div className="ga-tabla-wrap">
                  <table className="ga-tabla">
                    <thead><tr><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unitario</th><th className="num">Importe</th></tr></thead>
                    <tbody>
                      {oc.items!.map((it, i) => (
                        <tr key={i}>
                          <td>{it.descripcion || '—'}</td>
                          <td className="num">{it.cantidad}</td>
                          <td className="num">{formatMoneda(it.costo_unitario, it.moneda || oc.moneda)}</td>
                          <td className="num">{formatMoneda(it.importe, it.moneda || oc.moneda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          <div className="ga-det__col">
            <section className="ga-sec" aria-label="Resumen del pago">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Coins size={16} aria-hidden /> Resumen del pago</span></h3>
              <div className="ga-resumen">
                <div className="ga-resumen__fila"><span>Importe de la orden</span><b>{formatMoneda(importeOC(oc), oc.moneda)}</b></div>
                {descuentoNc > 0 && <div className="ga-resumen__fila"><span>Notas de crédito</span><b>− {formatMoneda(descuentoNc, monedaNeto)}</b></div>}
                {(descuentoNc > 0 || mixto) && <div className="ga-resumen__fila"><span>Neto</span><b>{formatMoneda(neto, monedaNeto)}</b></div>}
                {mixto && <div className="ga-resumen__fila"><span>Tipo de cambio del pago</span><b>{tcPagoNum || tc}{tcPagoNum ? '' : ' (de la orden)'}</b></div>}
                {mixto && difCambio !== 0 && <div className="ga-resumen__fila"><span>Diferencia de cambio</span><b>{formatMoneda(difCambio, 'PEN')}</b></div>}
                <div className="ga-resumen__fila"><span>Cuenta de origen</span><b>{cuenta ? (cuenta.usd ? 'En dólares' : 'En soles') : '—'}</b></div>
                <div className="ga-resumen__total"><span>Total a pagar</span><b>{formatMoneda(monto, monedaPago)}</b></div>
              </div>
              {errores.monto && <span className="field__error" role="alert">{errores.monto}</span>}
            </section>

            <section className="ga-sec" aria-label="Documentos adjuntos">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} aria-hidden /> Documentos de la orden</span>
                <span className="ga-sec__cuenta">{docs.filter(d => !!d.url).length} adjuntos</span>
              </h3>
              <div className="ga-docs">
                {docs.map(({ titulo, url, Icono }) => (
                  <div key={titulo} className={`ga-doc ${url ? '' : 'ga-doc--falta'}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono size={16} aria-hidden /> {titulo}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer">Ver archivo</a> : <span>Sin archivo</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="ga-sec" aria-label="Confirmación">
              <label className="pago-proc__confirmar">
                <input type="checkbox" checked={confirmado}
                  onChange={e => { setConfirmado(e.target.checked); setErrores(x => ({ ...x, confirmado: undefined })); }} />
                <span>Confirmo registrar este pago en Caja. No se puede revertir desde esta pantalla.</span>
              </label>
              {errores.confirmado && <span className="field__error" role="alert">{errores.confirmado}</span>}
              <p className="t-footnote c-secondary" style={{ margin: 0 }}>Al confirmar, la orden pasa a Procesado con esta cuenta y constancia, y el egreso queda en Caja.</p>
            </section>
          </div>
        </div>
      )}
    </Sheet>
  );
}
