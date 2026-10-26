import { exportarExcel } from '../../core/lib/excel';
import { formatSoles } from '../../core/lib/format';
import { claveEncabezado, leerTabla, textoCelda, type CeldaExcel, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import type { CuentaPorCobrar } from './api';
import { ESTADOS, MESES, mesDe } from './cuentas-util';

// Lectura del Excel de cuentas por cobrar con revisión fila por fila (el envío lo hace ImportarCuentasSheet).
// Encabezados y alias como el clásico (modulos/tesoreria/cuentas/logica.js), con estas diferencias:
// - una fecha o un importe que no se entiende marca la fila con error (el clásico lo convertía en vacío o 0);
// - se revisan campos obligatorios, estado, factura repetida (en el archivo o ya registrada) y cuadre de importes.

export interface FilaCuenta {
  codigo_liquidacion: string; fecha_liquidacion: string; numero_viaje: string; fecha_servicio: string;
  razon_social: string; placa: string; placa_camion: string; placa_carreta: string; conductor: string;
  cliente: string; lugar: string; tarifa: number; gastos_operativos: number; base_imponible: number; igv: number;
  total: number; adelanto: number; detraccion: number; neto_cobrar: number; mes_facturacion: string;
  fecha_factura: string; serie: string; factura: string; credito_dias: number; fecha_cobrar: string;
  fecha_deposito: string; estado_servicio: string; diferencia: number; observacion: string;
}

/** Mismos encabezados que la plantilla del clásico */
export const CABECERAS_PLANTILLA = [
  'COD DE LIQUIDACION', 'FECHA DE LIQUIDACION', 'N° DE VIAJE', 'FECHA SERVICIO', 'RAZON SOCIAL',
  'PLACA (CAMION)', 'PLACA (CARRETA)', 'CONDUCTOR', 'CLIENTE', 'LUGAR',
  'TARIFA -10% Y/O 20% POR TIPO DE CAMION', '(-) GASTOS OPERATIVOS', 'B.I', 'IGV', 'TOTAL', 'ADELANTO', 'DETRACCION',
  'NETO POR COBRAR', 'MES FACTURACION', 'FECHA', 'SERIE', 'FACTURA', 'CREDITO DIAS', 'FECHA A COBRAR',
  'FECHA DE DEPOSITO O TRANSF.', 'ESTADO SERVICIO', 'DIFERENCIA', 'OBSERVACION',
];

const EJEMPLOS = [
  ['LIQ-2026-0001', '2026-01-05', 'VIAJE-101', '2025-12-12', 'TRAHESA SAC', 'T8S942', 'AWB973', 'KENNY ALEXANDER ARTEAGA MARQUEZ',
    'AJINOMOTO DEL PERU', 'CALLAO - TARAPOTO', 8357.63, 237.29, 8120.34, 1461.66, 9582.0,
    0, 383, 9199, 'ENERO', '2026-01-05', 'E001', '0160', 45, '2026-02-20', '2026-02-20', 'PAGADO', 0, 'LIQ.01'],
  ['LIQ-2026-0002', '2026-01-05', 'VIAJE-102', '2026-01-05', 'JHOSTIL PERU', 'AMV803', 'AZO983', 'JOSE UZURIAGA GALARZA',
    '', 'ATE', 0, 0, 15254.24, 2745.76, 18000.0,
    0, 720, 17280, 'ENERO', '2026-01-05', 'E001', '0161', 15, '2026-01-20', '', 'PENDIENTE', 0, 'LLANTAS'],
];

export const descargarPlantillaCuentas = () =>
  exportarExcel('Plantilla_Cuentas_Tesoreria', 'Cuentas_Cobrar_Pagar', CABECERAS_PLANTILLA, EJEMPLOS);

// Alias por campo (ya normalizados con claveEncabezado al comparar)
const ALIAS = {
  codigo: ['COD DE LIQUIDACION', 'CODLIQUIDACION', 'CODIGO LIQUIDACION', 'CODIGO'],
  fechaLiq: ['FECHA DE LIQUIDACION', 'FECHALIQUIDACION', 'LIQUIDACION'],
  viaje: ['N DE VIAJE', 'NUMERO DE VIAJE', 'NRO VIAJE', 'VIAJE', 'ORDEN VIAJE', 'N VIAJE', 'NUMERO VIAJE'],
  fechaServ: ['FECHA SERVICIO', 'FECHASERVICIO'],
  razon: ['RAZON SOCIAL', 'RAZONSOCIAL', 'PROVEEDOR', 'EMPRESA'],
  placa: ['PLACA', 'PLACAS', 'UNIDAD'],
  camion: ['PLACA CAMION', 'PLACACAMION', 'CAMION', 'TRACTO', 'PLACA TRACTO'],
  carreta: ['PLACA CARRETA', 'PLACACARRETA', 'CARRETA', 'REMOLQUE', 'PLACA REMOLQUE'],
  conductor: ['CONDUCTOR', 'CHOFER'],
  cliente: ['CLIENTE'],
  lugar: ['LUGAR', 'ORIGEN DESTINO', 'RUTA'],
  tarifa: ['TARIFA 10 YO 20 POR TIPO DE CAMION', 'TARIFA', 'FLETE'],
  gastos: ['GASTOS OPERATIVOS', 'GASTOS'],
  bi: ['BI', 'BASE IMPONIBLE', 'SUBTOTAL'],
  igv: ['IGV'],
  total: ['TOTAL'],
  adelanto: ['ADELANTO'],
  detraccion: ['DETRACCION'],
  neto: ['NETO POR COBRAR', 'NETO COBRAR', 'SALDO'],
  mes: ['MES FACTURACION', 'MES'],
  fechaFac: ['FECHA', 'FECHA FACTURA'],
  serie: ['SERIE'],
  factura: ['FACTURA', 'NUMERO FACTURA', 'NRO FACTURA'],
  credito: ['CREDITO DIAS', 'DIAS CREDITO', 'CREDITO'],
  fechaCobrar: ['FECHA A COBRAR', 'FECHA COBRAR', 'VENCIMIENTO'],
  deposito: ['FECHA DE DEPOSITO O TRANSF', 'FECHA DEPOSITO', 'FECHA PAGO'],
  estado: ['ESTADO SERVICIO', 'ESTADO', 'ESTADO PAGO'],
  diferencia: ['DIFERENCIA'],
  observacion: ['OBSERVACION', 'OBSERVACIONES', 'DETALLE'],
} as const;
type Campo = keyof typeof ALIAS;

const ISO = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Fecha de una celda: texto dd/mm/aaaa, aaaa-mm-dd, fecha de Excel o número de serie. Ok=false si no se entiende. */
function fechaCelda(v: CeldaExcel | undefined): { iso: string; ok: boolean } {
  if (v === null || v === undefined || v === '') return { iso: '', ok: true };
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? { iso: '', ok: false } : { iso: ISO(v.getFullYear(), v.getMonth() + 1, v.getDate()), ok: true };
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return { iso: '', ok: false };
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
    return { iso: ISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), ok: true };
  }
  let s = String(v).trim();
  if (!s || s === '-' || s === '—') return { iso: '', ok: true };
  // Rango de dos fechas ("6/04/2026-23/04/26" o "23/04/26 - 07/05/26"): se toma la primera
  const rango = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*-\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.exec(s);
  if (rango) s = rango[1];

  let y: number, m: number, d: number;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (dmy) {
    d = Number(dmy[1]); m = Number(dmy[2]); y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
  } else if (ymd) {
    y = Number(ymd[1]); m = Number(ymd[2]); d = Number(ymd[3]);
    if (m > 12 && d <= 12) [m, d] = [d, m]; // YYYY-DD-MM, como el clásico
  } else {
    return { iso: '', ok: false };
  }
  const real = new Date(y, m - 1, d);
  const ok = m >= 1 && m <= 12 && real.getFullYear() === y && real.getMonth() === m - 1 && real.getDate() === d;
  return ok ? { iso: ISO(y, m, d), ok: true } : { iso: '', ok: false };
}

/** Importe de una celda ("1,234.50", "S/ 980", 980). Ok=false si no es un número. */
function numeroCelda(v: CeldaExcel | undefined): { n: number; ok: boolean } {
  if (v === null || v === undefined || v === '') return { n: 0, ok: true };
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v, ok: true } : { n: 0, ok: false };
  if (v instanceof Date || typeof v === 'boolean') return { n: 0, ok: false };
  let s = String(v).trim().replace(/^S\/\.?/i, '').replace(/\s/g, '');
  if (s === '' || s === '-' || s === '—') return { n: 0, ok: true };
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { n: 0, ok: false };
  return { n: parseFloat(s), ok: true };
}

// Si la placa trae guion o barra (T8S942-AWB973), se separa en camión y carreta
function separarPlacas(camion: string, carreta: string, placa: string) {
  let cam = camion, car = carreta;
  if (!car) {
    const fuente = cam || placa || '';
    if (fuente.includes('-')) {
      const partes = fuente.split('-').map(p => p.trim()).filter(Boolean);
      if (partes.length >= 2) { cam = partes[0]; car = partes[1]; } else if (partes.length === 1) cam = partes[0];
    } else if (fuente.includes('/')) {
      const partes = fuente.split('/').map(p => p.trim()).filter(Boolean);
      cam = partes[0] ?? ''; car = partes[1] ?? '';
    }
  }
  return { cam: cam.toUpperCase(), car: car.toUpperCase() };
}

/** Placa estándar: 5 a 7 letras o números (T8S942, AWB973, ABC123) */
const PLACA_ESTANDAR = /^[A-Z0-9]{5,7}$/;

/**
 * Lee la primera hoja y revisa cada fila. Las filas con error no se importan; las de aviso sí.
 * `existentes` sirve para detectar facturas ya registradas.
 */
export async function leerCuentasExcel(archivo: File, existentes: CuentaPorCobrar[]): Promise<FilaRevisada<FilaCuenta>[]> {
  const { claves, datos } = await leerTabla(archivo);
  const columnas = (campo: Campo) => ALIAS[campo].map(a => claves.indexOf(claveEncabezado(a))).filter(i => i >= 0);
  const idx = Object.fromEntries((Object.keys(ALIAS) as Campo[]).map(c => [c, columnas(c)])) as Record<Campo, number[]>;
  const reconocidas: Campo[] = ['codigo', 'razon', 'factura', 'total'];
  if (!reconocidas.some(c => idx[c].length)) {
    throw new Error('No se reconocen las columnas de cuentas por cobrar. Descarga la plantilla y usa sus encabezados.');
  }

  const existe = new Set(existentes
    .filter(c => c.serie && c.factura)
    .map(c => `${String(c.serie).trim().toUpperCase()}-${String(c.factura).trim().toUpperCase()}`));
  const vistas = new Map<string, number>();

  const filas: FilaRevisada<FilaCuenta>[] = [];
  for (const { fila, celdas } of datos) {
    const crudo = (campo: Campo): CeldaExcel | undefined => {
      for (const i of idx[campo]) if (textoCelda(celdas[i]) !== '') return celdas[i];
      return undefined;
    };
    const txt = (campo: Campo) => textoCelda(crudo(campo));
    const errores: string[] = [];
    const avisos: string[] = [];
    const fecha = (campo: Campo, nombre: string) => {
      const r = fechaCelda(crudo(campo));
      if (!r.ok) errores.push(`${nombre}: fecha no válida "${txt(campo)}"`);
      return r.iso;
    };
    const importe = (campo: Campo, nombre: string) => {
      const r = numeroCelda(crudo(campo));
      if (!r.ok) errores.push(`${nombre}: importe no válido "${txt(campo)}"`);
      return r.n;
    };

    const codigo = txt('codigo'), razon = txt('razon'), cliente = txt('cliente'), factura = txt('factura');
    const placaRaw = txt('placa').toUpperCase(), total = importe('total', 'TOTAL');
    const fechaLiq = fecha('fechaLiq', 'Fecha de liquidación');
    // Fila vacía en lo importante (p. ej. notas al pie): no cuenta
    if (!(codigo || razon || factura || placaRaw || txt('camion') || total || fechaLiq)) continue;

    const { cam, car } = separarPlacas(txt('camion').toUpperCase(), txt('carreta').toUpperCase(), placaRaw);
    const serie = txt('serie').toUpperCase();
    const estado = (txt('estado') || 'PENDIENTE').toUpperCase();
    const fechaFac = fecha('fechaFac', 'Fecha de factura');
    const mes = txt('mes').toUpperCase() || mesDe(fechaFac);
    const bi = importe('bi', 'B.I'), igv = importe('igv', 'IGV'), adelanto = importe('adelanto', 'Adelanto');
    const detraccion = importe('detraccion', 'Detracción'), neto = importe('neto', 'Neto por cobrar');

    // Campos obligatorios y formato
    if (!cliente && !razon) errores.push('falta el cliente o la razón social');
    if (!cam) errores.push('falta la placa del camión');
    else if (!PLACA_ESTANDAR.test(cam.replace(/[\s-]/g, ''))) avisos.push(`placa "${cam}" con formato no estándar`);
    if (!ESTADOS.includes(estado as (typeof ESTADOS)[number])) errores.push(`estado "${estado}" no válido (PENDIENTE, PAGADO o ANULADO)`);
    if (!!serie !== !!factura) errores.push('la factura necesita serie y número');
    if (mes && !MESES.includes(mes)) avisos.push(`mes "${mes}" no reconocido`);

    // Factura repetida: en el archivo o ya registrada
    if (serie && factura) {
      const clave = `${serie}-${factura.toUpperCase()}`;
      if (existe.has(clave)) errores.push(`la factura ${clave} ya está registrada`);
      else if (vistas.has(clave)) errores.push(`la factura ${clave} se repite en la fila ${vistas.get(clave)}`);
      else vistas.set(clave, fila);
    }

    // Cuadre de importes (solo avisa: a veces el Excel redondea)
    if (total && (bi || igv) && Math.abs(bi + igv - total) > 0.05) avisos.push('B.I. + IGV no cuadra con el total');
    if (total && neto && Math.abs(total - adelanto - detraccion - neto) > 0.05) avisos.push('neto no cuadra con total − adelanto − detracción');

    const dato: FilaCuenta = {
      codigo_liquidacion: codigo,
      fecha_liquidacion: fechaLiq,
      numero_viaje: txt('viaje'),
      fecha_servicio: fecha('fechaServ', 'Fecha de servicio'),
      razon_social: razon,
      placa: placaRaw,
      placa_camion: cam,
      placa_carreta: car,
      conductor: txt('conductor'),
      cliente,
      lugar: txt('lugar'),
      tarifa: importe('tarifa', 'Tarifa'),
      gastos_operativos: importe('gastos', 'Gastos operativos'),
      base_imponible: bi,
      igv,
      total,
      adelanto,
      detraccion,
      neto_cobrar: neto,
      mes_facturacion: mes,
      fecha_factura: fechaFac,
      serie,
      factura,
      credito_dias: parseInt(txt('credito'), 10) || 0,
      fecha_cobrar: fecha('fechaCobrar', 'Fecha a cobrar'),
      fecha_deposito: fecha('deposito', 'Fecha de depósito'),
      estado_servicio: estado,
      diferencia: importe('diferencia', 'Diferencia'),
      observacion: txt('observacion'),
    };

    filas.push({
      fila,
      dato,
      error: errores.length ? errores.join(' · ') : undefined,
      nota: avisos.length ? avisos.join(' · ') : undefined,
      celdas: [serie && factura ? `${serie}-${factura}` : codigo, razon || cliente, cam, total ? formatSoles(total) : ''],
    });
  }
  return filas;
}
