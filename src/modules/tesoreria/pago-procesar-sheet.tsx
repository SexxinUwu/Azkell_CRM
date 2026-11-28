import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CheckCircle2, ClipboardList, Coins, Copy, FileCheck, FileText, Layers, Package, Paperclip, Percent, Truck, Wallet, X } from 'lucide-react';
import { Pencil } from '../../core/ui/IconosArchivo';
import '../gerencia/gerencia-oc.css';
import './pago.css';
import { api, ApiError, errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { Combobox } from '../../core/ui/Combobox';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useBancos } from './api';
import { AplicarNotasCredito, type AplicacionElegida } from './AplicarNotasCredito';
import { useCuentasProveedor, useDetraccionTipos, useTipoCambioSunat } from '../almacen/api';
import { etiquetaCuentaProveedor } from '../almacen/entradaReglas';
import { codigoOC, esUSD, importeOC, montoAPagar, num, redondear2, type OrdenPago } from './pago-datos';

/** total: pago completo de siempre · cuota: parte de la orden · entrega: factura parcial (detracción proporcional) · adelanto: pago a cuenta antes de la factura */
type ModoPago = 'total' | 'cuota' | 'entrega' | 'adelanto';
const MODOS: Array<{ id: ModoPago; titulo: string; ayuda: string }> = [
  { id: 'total', titulo: 'Pago completo', ayuda: 'Se paga toda la orden de una vez.' },
  { id: 'cuota', titulo: 'En cuotas', ayuda: 'Varios pagos que suman el total. La detracción de toda la factura se deposita una sola vez, en el primer pago.' },
  { id: 'entrega', titulo: 'Entrega con factura parcial', ayuda: 'El proveedor factura por partes: cada pago lleva la detracción proporcional a su factura.' },
  { id: 'adelanto', titulo: 'Adelanto (antes de la factura)', ayuda: 'Pago a cuenta sin detracción; se descuenta del saldo.' },
];
const TXT_MODO: Record<string, string> = { CUOTA: 'Cuota', ENTREGA: 'Entrega', ADELANTO: 'Adelanto' };

const MAX_VOUCHER = 25 * 1024 * 1024; // mismo límite que el servidor

interface CuentaOrigen { label: string; usd: boolean; numero: string; banco: string; tipo: string; cci: string; detraccion?: boolean }

/** "BCP (BANCO DE CRÉDITO DEL PERÚ)" → "BCP" */
const bancoCorto = (b: string) => (b.split(' (')[0] || b).trim() || '—';
function tipoCorto(t: string): string {
  const x = t.toUpperCase();
  if (x.includes('AHORRO')) return 'Ahorros';
  if (x.includes('DETRAC')) return 'Detracción';
  if (x.includes('CORRIENTE') || x.includes('CTE')) return 'Corriente';
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : 'Cuenta';
}

/** Cuentas como tarjetas elegibles: se lee todo (banco, tipo, moneda, número y CCI) sin cortes */
function CuentasElegibles({ titulo, cuentas, valor, onElegir, vacio, error }: {
  titulo: string; cuentas: CuentaOrigen[]; valor: string; onElegir: (label: string) => void; vacio: string; error?: string;
}) {
  return (
    <div className="pp-ctas">
      <span className="pp-ctas__titulo">{titulo}</span>
      {cuentas.length === 0 ? <span className="pp-ctas__vacio">{vacio}</span> : (
        <div className="pp-ctas__lista" role="radiogroup" aria-label={titulo}>
          {cuentas.map(c => {
            const sel = c.label === valor;
            return (
              <button key={c.label} type="button" role="radio" aria-checked={sel} title={c.label}
                className={`pp-cta${sel ? ' pp-cta--sel' : ''}`} onClick={() => onElegir(c.label)}>
                <span className="pp-cta__fila">
                  <b className="pp-cta__banco">{bancoCorto(c.banco)}</b>
                  <span className={`pp-cta__mon${c.usd ? ' pp-cta__mon--usd' : ''}`}>{c.usd ? 'US$' : 'S/'}</span>
                  <span className="pp-cta__tipo">{tipoCorto(c.tipo)}{c.detraccion ? ' · Detracción' : ''}</span>
                  {sel && <Check size={15} className="pp-cta__check" aria-hidden />}
                </span>
                <span className="pp-cta__num">{c.numero || '—'}</span>
                {c.cci && <span className="pp-cta__cci">CCI {c.cci}</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && <span className="field__error" role="alert">{error}</span>}
    </div>
  );
}

/** Copia al portapapeles (sin espacios) y confirma con un check */
function Copiar({ texto, que }: { texto: string; que: string }) {
  const toast = useToast();
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={`pp-copiar${ok ? ' pp-copiar--ok' : ''}`} aria-label={`Copiar ${que}`} title={`Copiar ${que}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto.replace(/\s/g, ''));
          setOk(true); haptic('success'); toast(`${que} copiado`);
          window.setTimeout(() => setOk(false), 1500);
        } catch { toast('No se pudo copiar', 'error'); }
      }}>
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** Una línea por cuenta: banco, moneda y tipo; número y CCI seleccionables y con botón de copiar */
function CuentaFila({ etiqueta, cuenta, vacio, recien }: { etiqueta: string; cuenta: CuentaOrigen | null; vacio: string; recien: boolean }) {
  return (
    <div className="pp-fila">
      <span className="pp-fila__etq">{etiqueta}</span>
      {cuenta ? (
        <div className="pp-fila__val">
          <span className="pp-fila__banco">
            <b>{bancoCorto(cuenta.banco)}</b>
            <span className={`pp-cta__mon${cuenta.usd ? ' pp-cta__mon--usd' : ''}`}>{cuenta.usd ? 'US$' : 'S/'}</span>
            <span className="pp-cta__tipo">{tipoCorto(cuenta.tipo)}{cuenta.detraccion ? ' · Detracción' : ''}</span>
            <AnimatePresence>
              {recien && (
                <motion.span className="pp-fila__ok" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}>
                  <Check size={12} strokeWidth={3} /> Elegida
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="pp-fila__num"><span className="pp-sel">{cuenta.numero || '—'}</span>{cuenta.numero && <Copiar texto={cuenta.numero} que="Número de cuenta" />}</span>
          {cuenta.cci && <span className="pp-fila__cci">CCI <span className="pp-sel">{cuenta.cci}</span><Copiar texto={cuenta.cci} que="CCI" /></span>}
        </div>
      ) : <span className="pp-fila__vacio">{vacio}</span>}
    </div>
  );
}

const animLista = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, transition: { type: 'spring' as const, bounce: 0, duration: 0.35 } };

interface Errores { constanciaDet?: string; constancia?: string; cuenta?: string; monto?: string; voucher?: string; confirmado?: string; parte?: string }

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
  // Pago en partes: la forma de pago, la parte de la orden que cubre este pago y, en entregas, la factura parcial
  const pp = oc?.pagos_parciales ?? null;
  const [modo, setModo] = useState<ModoPago>(pp ? (pp.modo === 'ENTREGA' ? 'entrega' : 'cuota') : 'total');
  const [parteTxt, setParteTxt] = useState('');
  const [facturaRef, setFacturaRef] = useState('');
  // Detracción: constancia del depósito y cuenta de la empresa desde la que se hace (vacía = la misma de origen)
  const [constanciaDet, setConstanciaDet] = useState('');
  const [cuentaDetSel, setCuentaDetSel] = useState('');
  // Detracción confirmada con la factura: se agrega si la orden la olvidó, o se corrige el T.C. (el de la fecha de la factura) y el monto
  const [detEditando, setDetEditando] = useState(false);
  const [detCodigoE, setDetCodigoE] = useState('');
  const [detPctE, setDetPctE] = useState('');
  const [detFechaE, setDetFechaE] = useState('');
  const [detTcE, setDetTcE] = useState('');
  const [detMontoE, setDetMontoE] = useState('');
  const detTipos = useDetraccionTipos();
  const ordenEnUsd = !!oc && esUSD(oc.moneda);
  const sunatDet = useTipoCambioSunat(detEditando && ordenEnUsd, detFechaE || undefined);
  // Notas de crédito del proveedor aplicadas a este pago (si las hay)
  const [ncs, setNcs] = useState<AplicacionElegida[]>([]);
  const [netoNc, setNetoNc] = useState<number | null>(null);
  // OC en dólares pagada desde una cuenta en soles: tipo de cambio del día del pago
  const [tcPago, setTcPago] = useState('');
  // Cuenta del proveedor a la que se paga (de las registradas)
  const [destinoSel, setDestinoSel] = useState('');
  // Las cuentas vienen elegidas; «Editar» abre las tarjetas y al elegir una se cierra ese lado
  const [editOrigen, setEditOrigen] = useState(false);
  const [editDestino, setEditDestino] = useState(false);
  const [recien, setRecien] = useState<'origen' | 'destino' | null>(null);
  useEffect(() => { if (!recien) return; const t = window.setTimeout(() => setRecien(null), 1600); return () => window.clearTimeout(t); }, [recien]);
  const esVale = !!oc?.cuentas_destino;
  const ctasProv = useCuentasProveedor(oc?.proveedor_id ? String(oc.proveedor_id) : null, !!oc && !esVale);
  const cuentasFuente = esVale ? (oc?.cuentas_destino ?? []) : (ctasProv.data ?? []);
  const cargandoCuentas = !esVale && !!oc && ctasProv.isLoading;
  const destinos = useMemo<CuentaOrigen[]>(() => cuentasFuente.map(c => {
    const x = c as typeof c & { cci?: string | null };
    return { label: etiquetaCuentaProveedor(c), usd: esUSD(c.moneda ?? 'SOLES'), numero: String(c.numero_cuenta ?? '').trim(),
      banco: String(c.banco ?? ''), tipo: String(c.tipo_cuenta ?? ''), cci: String(x.cci ?? '').trim(), detraccion: !!c.detraccion && c.detraccion !== '0' };
  }), [cuentasFuente]);
  // Sin cuenta bancaria registrada del proveedor o beneficiario no se confirma ni se sube el pago
  const sinCuentaDestino = !!oc && !cargandoCuentas && destinos.length === 0;
  const rutaRegistro = oc?.pagar_a === 'CONDUCTOR' ? '/tesoreria/cuentas-personal' : '/tesoreria/cuentas-proveedores';
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
          banco: String(b.banco ?? ''),
          tipo: String(b.tipo_cuenta ?? ''),
          cci: String(b.cci ?? '').trim(),
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
  // Detracción: se retiene del importe y se deposita aparte en soles (al Banco de la Nación)
  const detOrden = oc?.detraccion ?? null;
  const cuentaDetDestino = destinos.find(d => d.detraccion);
  let det: typeof detOrden = detOrden;
  if (detEditando && oc) {
    const totalOrden = ordenEnUsd ? importeUsd : montoAPagar(oc, false);
    const pctE = num(detPctE);
    const tcE = num(detTcE) || sunatDet.data?.venta || detOrden?.tc || tc || 1;
    const basePen = ordenEnUsd ? totalOrden * tcE : totalOrden;
    const calculado = detCodigoE && pctE > 0 ? Math.round(basePen * pctE / 100) : 0;
    const montoE = num(detMontoE) > 0 ? Math.round(num(detMontoE)) : calculado;
    det = {
      codigo: detCodigoE || '—', pct: pctE, tc: ordenEnUsd ? tcE : null, monto_pen: montoE,
      monto_origen: ordenEnUsd ? redondear2(totalOrden * pctE / 100) : montoE,
      constancia: null, pagada_en: null, cuenta_proveedor: detOrden?.cuenta_proveedor ?? cuentaDetDestino?.label ?? null,
    };
  }
  const detMontoPen = det ? num(det.monto_pen) : 0;
  const detOrigen = det ? num(det.monto_origen) : 0;
  // En la misma moneda del importe que se paga
  const detEnImporte = !det ? 0
    : (mixto || esUSD(oc?.moneda) === usd) ? redondear2(detOrigen)
    : usd ? (tc > 0 ? redondear2(detMontoPen / tc) : 0) : redondear2(detMontoPen);
  // Pago en partes (nunca en pago mixto: la parte y el saldo se llevan en la moneda de la orden)
  const esParcial = modo !== 'total';
  const hayCajaChicaParcial = !!oc && !pp && String(oc.estado ?? '').toLowerCase() === 'pago parcial';
  const puedeEnPartes = !!oc && !esVale && !hayCajaChicaParcial;
  const monedaDistinta = esParcial && !!oc && esUSD(oc.moneda) !== usd;
  const saldoOrden = pp ? pp.saldo : importe;
  const parteNum = redondear2(num(parteTxt));
  const completaSaldo = esParcial && parteNum > 0 && parteNum >= saldoOrden - 0.004;
  const modosPermitidos: ModoPago[] = !puedeEnPartes ? ['total'] : !pp ? ['total', 'cuota', 'entrega', 'adelanto'] : pp.modo === 'ENTREGA' ? ['entrega'] : pp.modo === 'CUOTA' ? ['cuota'] : ['cuota', 'adelanto'];
  // La detracción de ESTE pago (el servidor aplica la misma regla)
  let detPagoPen = 0, detPagoImp = 0;
  if (!esParcial) { detPagoPen = detMontoPen; detPagoImp = detEnImporte; }
  else if (det && parteNum > 0) {
    if (modo === 'cuota' && (pp?.detDepositadoPen ?? 0) <= 0) { detPagoPen = detMontoPen; detPagoImp = detEnImporte; }
    else if (modo === 'entrega') {
      if (completaSaldo) { detPagoPen = Math.max(0, detMontoPen - (pp?.detDepositadoPen ?? 0)); detPagoImp = Math.max(0, redondear2(detEnImporte - (pp?.detDepositadoOrigen ?? 0))); }
      else { detPagoPen = Math.round(detMontoPen * parteNum / (importe || 1)); detPagoImp = ordenEnUsd ? redondear2(parteNum * num(det.pct) / 100) : detPagoPen; }
    }
  }
  const detActiva = esParcial ? detPagoPen > 0 : !!det;
  const detYaDepositada = !!pp && pp.detDepositadoPen > 0;
  const sinCuentaDetraccion = !!det && !det.cuenta_proveedor && (!esParcial || detPagoPen > 0);
  const importeSinDet = redondear2(Math.max(0, (esParcial ? parteNum : importe) - (esParcial ? detPagoImp : detEnImporte)));
  // Lo que sale del banco: el importe menos la detracción y las notas de crédito aplicadas
  const neto = !esParcial && ncs.length && netoNc != null ? netoNc : importeSinDet;
  const monto = mixto ? redondear2(neto * (tcPagoNum || tc)) : neto;
  const destino = destinos.find(d => d.label === destinoSel) ?? null;
  const difCambio = mixto ? redondear2(neto * ((tcPagoNum || tc) - tc)) : 0;

  const preview = useMemo(() => (voucher && voucher.type.startsWith('image/') ? URL.createObjectURL(voucher) : null), [voucher]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function abrirEdicionDet() {
    setDetEditando(true);
    setDetCodigoE(detOrden?.codigo ?? ''); setDetPctE(detOrden ? String(num(detOrden.pct)) : '');
    setDetFechaE(''); setDetTcE(detOrden?.tc ? String(detOrden.tc) : ''); setDetMontoE('');
  }
  function elegirTipoDet(codigo: string) {
    setDetCodigoE(codigo);
    const t = (detTipos.data ?? []).find(x => x.codigo === codigo);
    setDetPctE(t ? String(t.porcentaje) : '');
  }

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
    if (sinCuentaDetraccion) { toast('El proveedor no tiene cuenta de detracciones: regístrala en Almacén › Proveedores.', 'error'); haptic('warning'); return; }
    if (sinCuentaDestino) { toast('No hay cuenta bancaria registrada del destinatario: no se puede pagar.', 'error'); haptic('warning'); return; }
    const e: Errores = {};
    const totalmenteCompensada = ncs.length > 0 && monto <= 0;
    if (!constancia.trim() && !totalmenteCompensada) e.constancia = 'Ingresa el número de constancia u operación.';
    if (!cuenta) e.cuenta = 'Elige la cuenta de origen de la empresa.';
    if (mixto && tcPago.trim() && !(tcPagoNum >= 1 && tcPagoNum <= 20)) e.monto = 'El tipo de cambio del pago no parece válido (soles por dólar).';
    if (monedaDistinta) e.monto = 'Los pagos en partes se hacen desde una cuenta en la misma moneda de la orden.';
    if (esParcial) {
      if (!(parteNum > 0)) e.parte = modo === 'entrega' ? 'Escribe el importe de la factura parcial.' : 'Escribe el monto de este pago.';
      else if (parteNum > saldoOrden + 0.004) e.parte = `Supera el saldo pendiente (${formatMoneda(saldoOrden, monedaNeto)}).`;
      else if (modo === 'adelanto' && completaSaldo) e.parte = 'Un adelanto no puede cubrir todo el saldo: usa cuota o pago completo.';
      else if (!(neto > 0)) e.parte = 'El monto no cubre la detracción que se retiene en este pago.';
    }
    if (!(importe > 0)) {
      e.monto = usd && tc <= 0
        ? 'La orden no tiene tipo de cambio: no se puede calcular el monto en US$.'
        : 'La orden no tiene total en soles para pagar.';
    }
    if (detEditando && !detCodigoE) { toast('Elige el tipo de detracción o quita la corrección.', 'error'); haptic('warning'); return; }
    if (detEditando && !(num(detPctE) > 0)) { toast('Escribe el porcentaje de la detracción.', 'error'); haptic('warning'); return; }
    if (detActiva && !constanciaDet.trim()) e.constanciaDet = 'Ingresa el número de constancia del depósito de la detracción.';
    if (!confirmado) e.confirmado = 'Marca la casilla para confirmar el pago.';
    setErrores(prev => ({ ...prev, ...e }));
    if (Object.values(e).some(Boolean)) { haptic('warning'); return; }

    const fd = new FormData();
    fd.append('numero_constancia', constancia.trim());
    fd.append('cuenta_origen', cuenta?.label ?? '');
    fd.append('moneda', usd ? 'USD' : 'PEN');
    if (esParcial) {
      fd.append('modo_pago', modo);
      fd.append('parte', String(parteNum));
      if (facturaRef.trim()) fd.append('factura_ref', facturaRef.trim());
    }
    if (mixto) fd.append('tipo_cambio_pago', String(tcPagoNum || tc));
    if (destinoSel) fd.append('cuenta_destino', destinoSel);
    fd.append('monto', String(redondear2(monto)));
    if (!esParcial && ncs.length) fd.append('nc_aplicaciones', JSON.stringify(ncs.map(a => ({ nc_id: a.nc_id, monto: a.monto }))));
    if (detEditando) {
      fd.append('det_codigo', detCodigoE); fd.append('det_pct', String(num(detPctE)));
      if (ordenEnUsd) fd.append('det_tc', String(num(detTcE) || sunatDet.data?.venta || detOrden?.tc || tc));
      if (num(detMontoE) > 0) fd.append('det_monto_pen', String(num(detMontoE)));
    }
    if (detActiva) {
      fd.append('detraccion_constancia', constanciaDet.trim());
      if (cuentaDetSel) fd.append('cuenta_origen_detraccion', cuentaDetSel);
    }
    if (voucher) fd.append('voucher', voucher);

    setGuardando(true);
    try {
      await api(`/tesoreria/pago-requerimientos/${oc.id}/procesar`, { method: 'POST', body: fd });
      haptic('success');
      toast(esParcial ? `${TXT_MODO[modo.toUpperCase()] ?? 'Pago'} de ${codigoOC(oc)} registrado` : `Pago de ${codigoOC(oc)} registrado`);
      qc.invalidateQueries({ queryKey: ['tesoreria'] });
      qc.invalidateQueries({ queryKey: ['almacen'] });
      onPagado?.();
      onClose();
    } catch (err) {
      const dato = err instanceof ApiError ? err.data : null;
      const mensajeErr = dato && typeof dato.mensaje === 'string' ? dato.mensaje : '';
      if (mensajeErr) toast(mensajeErr, 'error');
      else toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  const monedaPago: 'USD' | 'PEN' = usd ? 'USD' : 'PEN';
  const monedaNeto: 'USD' | 'PEN' = usd || mixto ? 'USD' : 'PEN';
  const descuentoNc = !esParcial && ncs.length && netoNc != null ? redondear2(importeSinDet - netoNc) : 0;
  const saldoDespues = esParcial && parteNum > 0 ? redondear2(Math.max(0, saldoOrden - parteNum)) : saldoOrden;
  const docs = oc ? [
    { titulo: 'Cotización', url: oc.url_cotizacion_presigned, Icono: FileText },
    { titulo: 'Factura', url: oc.url_factura_presigned, Icono: FileCheck },
  ] : [];
  const urgente = /urgente|alta/i.test(String(oc?.prioridad ?? ''));
  function elegirModo(m: ModoPago) {
    setModo(m); setNcs([]); setNetoNc(null); setErrores(x => ({ ...x, parte: undefined, monto: undefined }));
    if (m === 'total') setParteTxt('');
  }

  return (
    <Sheet
      ancho
      open={open}
      onClose={() => { if (!guardando) onClose(); }}
      title={oc ? `Procesar pago · ${codigoOC(oc)}` : 'Procesar pago'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={guardando} disabled={sinCuentaDestino || sinCuentaDetraccion || cargandoCuentas} onClick={confirmar}>Confirmar pago</Button>
        </>
      }
    >
      {oc && (
        <div className="ga-det pp-hoja">
          <div className="ga-det__col">
            <div className="ga-det__cab">
              <Badge tone={pp ? 'amber' : 'green'}>{pp ? 'Pago parcial' : 'Aprobada'}</Badge>
              <Badge tone={urgente ? 'red' : 'gray'}>{urgente ? 'URGENTE' : 'NORMAL'}</Badge>
              <span className="ga-det__emitido">Emitida el {formatFechaPe(oc.fecha)}</span>
            </div>

            <section className="ga-sec" aria-label="Proveedor y orden">
              <h3 className="ga-sec__titulo"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} aria-hidden /> Proveedor y orden</span></h3>
              <dl className="pp-dl">
                <dt>Proveedor</dt>
                <dd>
                  <b>{oc.proveedor_nombre || '—'}</b>
                  <span>{/^d{8}$/.test((oc.proveedor_ruc || '').trim()) ? 'DNI' : 'RUC'} {oc.proveedor_ruc || '—'} · {oc.condicion_pago || 'Al contado'}</span>
                </dd>
                <dt>Motivo y destino</dt>
                <dd>
                  <b>{oc.motivo_entrada || oc.motivo || '—'}</b>
                  {[oc.sub_motivo, oc.centro_costo].filter(Boolean).length > 0 && <span>{[oc.sub_motivo, oc.centro_costo].filter(Boolean).join(' · ')}</span>}
                  <span>Solicitó: {oc.solicitante || oc.creador_nombre || '—'}{oc.placa ? ` · Placa ${oc.placa}` : ''}</span>
                </dd>
              </dl>
            </section>

            {puedeEnPartes && (
              <section className="ga-sec" aria-label="Forma de pago">
                <h3 className="ga-sec__titulo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={16} aria-hidden /> Forma de pago</span>
                  {pp && <span className="ga-sec__cuenta">Pagado {formatMoneda(pp.pagado, monedaNeto)} · saldo {formatMoneda(pp.saldo, monedaNeto)}</span>}
                </h3>
                {modosPermitidos.length > 1 && (
                  <div role="radiogroup" aria-label="Forma de pago" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
                    {modosPermitidos.map(m => (
                      <Button key={m} variant={modo === m ? 'primary' : 'secondary'} size="sm" role="radio" aria-checked={modo === m} onClick={() => elegirModo(m)}>
                        {MODOS.find(x => x.id === m)?.titulo}
                      </Button>
                    ))}
                  </div>
                )}
                {pp && modosPermitidos.length === 1 && <p className="t-footnote c-secondary" style={{ margin: 0 }}>Esta orden se paga {pp.modo === 'ENTREGA' ? 'por entregas con factura parcial' : 'en cuotas'}.</p>}
                {esParcial && <p className="t-footnote c-secondary" style={{ margin: 0 }}>{MODOS.find(x => x.id === modo)?.ayuda}</p>}
                {monedaDistinta && <Notice tone="error">Los pagos en partes se hacen desde una cuenta en la misma moneda de la orden ({esUSD(oc.moneda) ? 'dólares' : 'soles'}). Cambia la cuenta de origen.</Notice>}
                {modo === 'adelanto' && (
                  <Notice tone="accent">
                    <strong>Pendiente de validación del contador:</strong> el adelanto se registra sin detracción y se descuenta del saldo. Cómo se calcula la detracción de un adelanto aún no está validado; la detracción de la factura se deposita con el primer pago de la factura (cuota).
                  </Notice>
                )}
                {pp?.hayAdelantos && modo === 'cuota' && !detYaDepositada && det && (
                  <Notice tone="accent">Hay adelantos registrados. La detracción de toda la factura se deposita en este pago, con el monto de la factura completa.</Notice>
                )}
                {esParcial && (
                  <>
                    <div className="ga-dos">
                      <Field label={modo === 'entrega' ? `Importe de la factura parcial (${monedaNeto === 'USD' ? 'US$' : 'S/'})` : `Monto de este pago (${monedaNeto === 'USD' ? 'US$' : 'S/'})`}
                        hint={`Saldo pendiente: ${formatMoneda(saldoOrden, monedaNeto)}`} error={errores.parte}>
                        {p => <TextInput {...p} inputMode="decimal" value={parteTxt} placeholder="0.00" onChange={e => { setParteTxt(e.target.value.replace(/[^\d.,]/g, '')); setErrores(x => ({ ...x, parte: undefined })); }} />}
                      </Field>
                      {modo === 'entrega' && (
                        <Field label="N° de la factura parcial (opcional)">
                          {p => <TextInput {...p} value={facturaRef} placeholder="Ej. F001-123" onChange={e => setFacturaRef(e.target.value)} />}
                        </Field>
                      )}
                    </div>
                    {saldoOrden > 0 && modo !== 'adelanto' && (
                      <div><Button variant="plain" size="sm" onClick={() => { setParteTxt(String(saldoOrden)); setErrores(x => ({ ...x, parte: undefined })); }}>Usar todo el saldo ({formatMoneda(saldoOrden, monedaNeto)})</Button></div>
                    )}
                  </>
                )}
              </section>
            )}

            <section className="ga-sec" aria-label="Datos del pago">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={16} aria-hidden /> Datos del pago</span>
                <Button variant="plain" size="sm" icon={(editOrigen || editDestino) ? <Check size={14} /> : <Pencil size={14} />}
                  onClick={() => { const abrir = !(editOrigen || editDestino); setEditOrigen(abrir); setEditDestino(abrir); }}>
                  {(editOrigen || editDestino) ? 'Listo' : 'Editar'}
                </Button>
              </h3>

              {bancos.isError ? (
                <Notice tone="error">No se pudieron cargar las cuentas bancarias.</Notice>
              ) : !bancos.isLoading && cuentas.length === 0 ? (
                <Notice>No hay cuentas bancarias activas. Regístralas en Tesorería › Bancos.</Notice>
              ) : null}

              <div className="pp-filas">
                <AnimatePresence initial={false} mode="popLayout">
                  {editOrigen && cuentas.length > 0 ? (
                    <motion.div key="lo" className="pp-editar" {...animLista}>
                      <CuentasElegibles titulo="Pagar desde (empresa)" cuentas={cuentas} valor={cuentaSel} vacio=""
                        onElegir={l => { setCuentaSel(l); setEditOrigen(false); setRecien('origen'); haptic('selection'); setErrores(x => ({ ...x, cuenta: undefined, monto: undefined })); }} />
                    </motion.div>
                  ) : (
                    <motion.div key="fo" {...animLista}>
                      <CuentaFila etiqueta="Empresa" cuenta={cuenta} recien={recien === 'origen'}
                        vacio={bancos.isLoading ? 'Cargando cuentas…' : 'Sin cuenta elegida'} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false} mode="popLayout">
                  {editDestino && destinos.length > 0 ? (
                    <motion.div key="ld" className="pp-editar" {...animLista}>
                      <CuentasElegibles titulo="Depositar a (proveedor)" cuentas={destinos} valor={destinoSel} vacio=""
                        onElegir={l => { setDestinoSel(l); setEditDestino(false); setRecien('destino'); haptic('selection'); }} />
                    </motion.div>
                  ) : (
                    <motion.div key="fd" {...animLista}>
                      <CuentaFila etiqueta={oc.pagar_a === 'CONDUCTOR' ? 'Beneficiario' : 'Proveedor'} cuenta={destino} recien={recien === 'destino'}
                        vacio={cargandoCuentas ? 'Cargando cuentas…' : 'Sin cuenta registrada'} />
                    </motion.div>
                  )}
                </AnimatePresence>
                {errores.cuenta && <span className="field__error" role="alert">{errores.cuenta}</span>}
              </div>
              {sinCuentaDestino && (
                <Notice tone="error">
                  <strong>No hay cuenta bancaria registrada.</strong> {oc.pagar_a === 'CONDUCTOR' ? 'Este beneficiario' : 'Este proveedor'} no tiene una cuenta registrada, por eso no se puede confirmar ni subir el pago.
                  {' '}<Link to={rutaRegistro} onClick={onClose}>Regístrala aquí</Link> y vuelve a abrir el pago.
                </Notice>
              )}
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

            {!det && (
              <section className="ga-sec" aria-label="Detracción">
                <h3 className="ga-sec__titulo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Percent size={16} aria-hidden /> Detracción (SUNAT)</span>
                  <span className="ga-sec__cuenta">Sin detracción</span>
                </h3>
                <p className="t-footnote c-secondary" style={{ margin: 0 }}>La orden no lleva detracción. Si la factura la indica, agrégala aquí antes de pagar.</p>
                <div><Button variant="secondary" size="sm" onClick={abrirEdicionDet}>Agregar detracción</Button></div>
              </section>
            )}
            {det && (
              <section className="ga-sec" aria-label="Detracción">
                <h3 className="ga-sec__titulo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Percent size={16} aria-hidden /> Detracción (SUNAT)</span>
                  <span className="ga-sec__cuenta">{det.codigo} · {num(det.pct)} %</span>
                </h3>
                {!esParcial && (
                  <p className="t-footnote c-secondary" style={{ margin: 0 }}>
                    Se deposita {formatMoneda(detMontoPen, 'PEN')} en la cuenta de detracciones del proveedor y se le paga el resto. En Caja quedan dos egresos.
                  </p>
                )}
                {esParcial && detActiva && (
                  <p className="t-footnote c-secondary" style={{ margin: 0 }}>
                    {modo === 'entrega'
                      ? `En esta entrega se deposita ${formatMoneda(detPagoPen, 'PEN')} (la parte proporcional de ${formatMoneda(detMontoPen, 'PEN')}${completaSaldo ? ', con el resto de la detracción por ser el último pago' : ''}).`
                      : `La detracción de toda la factura (${formatMoneda(detMontoPen, 'PEN')}) se deposita una sola vez, con este primer pago. En Caja quedan dos egresos.`}
                  </p>
                )}
                {esParcial && !detActiva && modo !== 'adelanto' && detYaDepositada && (
                  <p className="t-footnote c-secondary" style={{ margin: 0 }}>
                    La detracción ya se depositó antes ({formatMoneda(pp!.detDepositadoPen, 'PEN')}). Este pago es neto, sin detracción.
                  </p>
                )}
                {esParcial && !detActiva && modo === 'adelanto' && (
                  <p className="t-footnote c-secondary" style={{ margin: 0 }}>El adelanto no lleva detracción (pendiente de validación del contador).</p>
                )}
                {sinCuentaDetraccion ? (
                  <Notice tone="error">
                    <strong>El proveedor no tiene cuenta de detracciones (Banco de la Nación):</strong> regístrala en Almacén › Proveedores, casilla «Cuenta de detracciones».
                  </Notice>
                ) : (
                  <div className="pp-fila"><span className="pp-fila__etq">Depositar a</span><div className="pp-fila__val"><span className="pp-fila__num"><span className="pp-sel">{det.cuenta_proveedor}</span></span></div></div>
                )}
                {!detEditando ? (
                  !detYaDepositada && <div><Button variant="secondary" size="sm" onClick={abrirEdicionDet}>Corregir con la factura</Button></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                    <Notice tone="accent">Datos de la factura del proveedor. Solo cambia la detracción; queda en la auditoría con el valor anterior.</Notice>
                    <Field label="Tipo de detracción">
                      {p => (
                        <Combobox {...p} enHoja tituloHoja="Tipo de detracción" value={detCodigoE || null} onChange={v => elegirTipoDet(v ?? '')}
                          options={(detTipos.data ?? []).map(t => ({ value: t.codigo, label: `${t.codigo} · ${t.descripcion} · ${Number(t.porcentaje)} %`, keywords: `${t.codigo} ${t.descripcion}` }))} placeholder="Elige el tipo" />
                      )}
                    </Field>
                    <Field label="Porcentaje (%)">
                      {p => <TextInput {...p} inputMode="decimal" value={detPctE} onChange={e => setDetPctE(e.target.value)} />}
                    </Field>
                    {ordenEnUsd && (
                      <>
                        <Field label="Fecha de la factura" hint={detFechaE ? (sunatDet.data?.venta ? `SUNAT venta del ${sunatDet.data.fecha}: ${sunatDet.data.venta}` : sunatDet.isError ? 'No se pudo consultar esa fecha: escribe el T.C. a mano' : 'Consultando la SUNAT…') : 'Con la fecha de emisión se usa el T.C. SUNAT de ese día'}>
                          {p => <TextInput {...p} type="date" max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })} value={detFechaE} onChange={e => { setDetFechaE(e.target.value); setDetTcE(''); }} />}
                        </Field>
                        <Field label="T.C. de la detracción">
                          {p => <TextInput {...p} inputMode="decimal" value={detTcE} placeholder={sunatDet.data?.venta ? String(sunatDet.data.venta) : ''} onChange={e => setDetTcE(e.target.value)} />}
                        </Field>
                      </>
                    )}
                    <Field label="Monto de la detracción en la factura (S/)" hint="Opcional: si lo escribes, se usa ese monto exacto (debe ser cercano al calculado)">
                      {p => <TextInput {...p} inputMode="numeric" value={detMontoE} placeholder={String(det.monto_pen)} onChange={e => setDetMontoE(e.target.value.replace(/[^\d.]/g, ''))} />}
                    </Field>
                    <div><Button variant="plain" size="sm" onClick={() => setDetEditando(false)}>Quitar la corrección</Button></div>
                  </div>
                )}
                {detActiva && (
                  <>
                    <Field label="N° de constancia del depósito de la detracción *" error={errores.constanciaDet}>
                      {p => <TextInput {...p} value={constanciaDet} placeholder="Ej. 00482910"
                        onChange={e => { setConstanciaDet(e.target.value); setErrores(x => ({ ...x, constanciaDet: undefined })); }} />}
                    </Field>
                    <Field label="Cuenta de la empresa para el depósito de la detracción" hint="Opcional. Si no eliges, se usa la misma cuenta de origen del pago.">
                      {p => (
                        <Combobox {...p} enHoja tituloHoja="Cuenta para el depósito de la detracción" value={cuentaDetSel || null} onChange={v => setCuentaDetSel(v ?? '')}
                          options={cuentas.map(c => ({ value: c.label, label: c.label }))} placeholder="La misma cuenta de origen" />
                      )}
                    </Field>
                  </>
                )}
              </section>
            )}

            {!esParcial && <AplicarNotasCredito entradaId={oc.id} sugeridas={(() => { try { const x = JSON.parse(oc.nc_sugeridas || '[]'); return Array.isArray(x) ? x.map(Number) : []; } catch { return []; } })()} moneda={usd || mixto ? 'USD' : 'PEN'} importe={importeSinDet} onChange={(a, n) => { setNcs(a); setNetoNc(n); }} />}

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
                {pp && <div className="ga-resumen__fila"><span>Pagado antes</span><b>{formatMoneda(pp.pagado, monedaNeto)}</b></div>}
                {esParcial && <div className="ga-resumen__fila"><span>Saldo antes de este pago</span><b>{formatMoneda(saldoOrden, monedaNeto)}</b></div>}
                {esParcial && <div className="ga-resumen__fila"><span>{modo === 'entrega' ? 'Factura parcial' : modo === 'adelanto' ? 'Adelanto' : 'Parte de la orden en este pago'}</span><b>{formatMoneda(parteNum, monedaNeto)}</b></div>}
                {detActiva && det && <div className="ga-resumen__fila"><span>Detracción {esParcial && modo === 'entrega' ? '(proporcional) ' : ''}{num(det.pct)} % ({formatMoneda(esParcial ? detPagoPen : detMontoPen, 'PEN')}, depósito al Banco de la Nación)</span><b>− {formatMoneda(esParcial ? detPagoImp : detEnImporte, monedaNeto)}</b></div>}
                {esParcial && det && !detActiva && detYaDepositada && <div className="ga-resumen__fila"><span>Detracción ya depositada antes</span><b>{formatMoneda(pp!.detDepositadoPen, 'PEN')}</b></div>}
                {descuentoNc > 0 && <div className="ga-resumen__fila"><span>Notas de crédito</span><b>− {formatMoneda(descuentoNc, monedaNeto)}</b></div>}
                {(descuentoNc > 0 || mixto || detActiva) && <div className="ga-resumen__fila"><span>Neto</span><b>{formatMoneda(neto, monedaNeto)}</b></div>}
                {mixto && <div className="ga-resumen__fila"><span>Tipo de cambio del pago</span><b>{tcPagoNum || tc}{tcPagoNum ? '' : ' (de la orden)'}</b></div>}
                {mixto && difCambio !== 0 && <div className="ga-resumen__fila"><span>Diferencia de cambio</span><b>{formatMoneda(difCambio, 'PEN')}</b></div>}
                <div className="ga-resumen__fila"><span>Cuenta de origen</span><b>{cuenta ? (cuenta.usd ? 'En dólares' : 'En soles') : '—'}</b></div>
                <div className="ga-resumen__total"><span>{detActiva ? 'A pagar al proveedor (neto)' : 'Total a pagar'}</span><b>{formatMoneda(monto, monedaPago)}</b></div>
                {esParcial && <div className="ga-resumen__fila"><span>Saldo después de este pago</span><b>{formatMoneda(saldoDespues, monedaNeto)}</b></div>}
              </div>
              {errores.monto && <span className="field__error" role="alert">{errores.monto}</span>}
            </section>

            {pp && (
              <section className="ga-sec" aria-label="Pagos anteriores">
                <h3 className="ga-sec__titulo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} aria-hidden /> Pagos anteriores</span>
                  <span className="ga-sec__cuenta">{pp.pagos.length} {pp.pagos.length === 1 ? 'pago' : 'pagos'}</span>
                </h3>
                <div className="ga-tabla-wrap">
                  <table className="ga-tabla">
                    <thead><tr><th>N°</th><th>Tipo</th><th className="num">Parte</th><th className="num">Neto</th><th className="num">Detracción</th></tr></thead>
                    <tbody>
                      {pp.pagos.map(x => (
                        <tr key={x.numero}>
                          <td>{x.numero}</td>
                          <td>{TXT_MODO[x.tipo] ?? x.tipo}{x.factura_ref ? ` · ${x.factura_ref}` : ''}<br /><span className="t-footnote c-secondary">{formatFechaPe(x.fecha)}{x.numero_operacion ? ` · ${x.numero_operacion}` : ''}</span></td>
                          <td className="num">{formatMoneda(x.parte, monedaNeto)}</td>
                          <td className="num">{formatMoneda(x.neto, monedaNeto)}</td>
                          <td className="num">{x.detraccion_pen > 0 ? `${formatMoneda(x.detraccion_pen, 'PEN')}${x.detraccion_constancia ? ` · ${x.detraccion_constancia}` : ''}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ga-resumen">
                  <div className="ga-resumen__fila"><span>Pagado</span><b>{formatMoneda(pp.pagado, monedaNeto)}</b></div>
                  <div className="ga-resumen__fila"><span>Saldo</span><b>{formatMoneda(pp.saldo, monedaNeto)}</b></div>
                  <div className="ga-resumen__fila"><span>Detracción ya depositada</span><b>{pp.detDepositadoPen > 0 ? formatMoneda(pp.detDepositadoPen, 'PEN') : 'Ninguna todavía'}</b></div>
                </div>
              </section>
            )}

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
                <input type="checkbox" checked={confirmado} disabled={sinCuentaDestino}
                  onChange={e => { setConfirmado(e.target.checked); setErrores(x => ({ ...x, confirmado: undefined })); }} />
                <span>Confirmo registrar este pago en Caja. No se puede revertir desde esta pantalla.</span>
              </label>
              {errores.confirmado && <span className="field__error" role="alert">{errores.confirmado}</span>}
              <p className="t-footnote c-secondary" style={{ margin: 0 }}>{esParcial ? 'Al confirmar, este pago queda en Caja; la orden pasa a Procesado cuando el saldo llega a cero y, mientras tanto, queda en Pago parcial.' : 'Al confirmar, la orden pasa a Procesado con esta cuenta y constancia, y el egreso queda en Caja.'}</p>
            </section>
          </div>
        </div>
      )}
    </Sheet>
  );
}
