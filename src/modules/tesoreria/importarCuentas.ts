// Lectura del Excel de cuentas por cobrar. Misma lógica que el clásico (modulos/tesoreria/cuentas):
// los encabezados se reconocen aunque cambien de tilde, mayúsculas o espacios, y los importes y
// fechas se normalizan antes de enviarlos. El servidor (POST /api/tesoreria/cuentas/importar-masivo) inserta.

export interface FilaCuenta {
  codigo_liquidacion: string; fecha_liquidacion: string; numero_viaje: string; fecha_servicio: string;
  razon_social: string; placa: string; placa_camion: string; placa_carreta: string; conductor: string;
  cliente: string; lugar: string; tarifa: number; gastos_operativos: number; base_imponible: number; igv: number;
  total: number; adelanto: number; detraccion: number; neto_cobrar: number; mes_facturacion: string;
  fecha_factura: string; serie: string; factura: string; credito_dias: number; fecha_cobrar: string;
  fecha_deposito: string; estado_servicio: string; diferencia: number; observacion: string;
}

type Celda = string | number | boolean | Date | null;

// "Cód. de liquidación" → "CODDELIQUIDACION"; quita tildes, símbolos y espacios
const normalizarClave = (k: string) => k.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

const aYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fechaExcel(val: Celda): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) return aYMD(val);
  let s = String(val).trim();
  if (!s || s === '-' || s === '—') return '';
  const rango = s.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  if (rango && (s.includes(' - ') || s.includes('-2') || s.includes('-0') || s.includes('-1'))) s = rango[1];
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) {
      let anio = p[2].trim();
      if (anio.length === 2) anio = `20${anio}`;
      return `${anio}-${p[1].trim().padStart(2, '0')}-${p[0].trim().padStart(2, '0')}`;
    }
  }
  if (s.includes('-')) {
    const p = s.split('-').map(x => x.trim());
    if (p.length === 3) {
      if (p[0].length === 4) {
        const m = parseInt(p[1], 10), d = parseInt(p[2], 10);
        return m > 12
          ? `${p[0]}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
          : `${p[0]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      const anio = p[2].length === 2 ? `20${p[2]}` : p[2];
      return `${anio}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
  }
  return s;
}

function numeroExcel(val: Celda): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
  let s = String(val).trim();
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
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
  return { cam, car };
}

export async function leerCuentasExcel(archivo: File): Promise<FilaCuenta[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as Celda[][];
  if (filas.length < 2) throw new Error('El archivo Excel no contiene filas o está vacío.');
  const encabezados = filas[0].map(h => normalizarClave(String(h ?? '')));

  const procesadas: FilaCuenta[] = [];
  for (const fila of filas.slice(1)) {
    if (!fila.some(c => c !== null && c !== undefined && c !== '')) continue;
    const row: Record<string, Celda> = {};
    encabezados.forEach((k, i) => { if (k && row[k] === undefined) row[k] = fila[i] ?? null; });
    const get = (...alias: string[]): Celda => {
      for (const a of alias) {
        const v = row[normalizarClave(a)];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return '';
    };
    const txt = (...alias: string[]) => String(get(...alias) ?? '').trim();

    const placaRaw = txt('PLACA', 'PLACAS', 'UNIDAD');
    const { cam, car } = separarPlacas(txt('PLACA CAMION', 'PLACACAMION', 'CAMION', 'TRACTO', 'PLACA TRACTO'),
      txt('PLACA CARRETA', 'PLACACARRETA', 'CARRETA', 'REMOLQUE', 'PLACA REMOLQUE'), placaRaw);

    const item: FilaCuenta = {
      codigo_liquidacion: txt('COD DE LIQUIDACION', 'CODLIQUIDACION', 'CODIGO LIQUIDACION', 'CODIGO'),
      fecha_liquidacion: fechaExcel(get('FECHA DE LIQUIDACION', 'FECHALIQUIDACION', 'LIQUIDACION')),
      numero_viaje: txt('N DE VIAJE', 'NUMERO DE VIAJE', 'NRO VIAJE', 'VIAJE', 'ORDEN VIAJE', 'N VIAJE', 'NUMERO VIAJE'),
      fecha_servicio: fechaExcel(get('FECHA SERVICIO', 'FECHASERVICIO')),
      razon_social: txt('RAZON SOCIAL', 'RAZONSOCIAL', 'PROVEEDOR', 'EMPRESA'),
      placa: placaRaw, placa_camion: cam, placa_carreta: car,
      conductor: txt('CONDUCTOR', 'CHOFER'), cliente: txt('CLIENTE'), lugar: txt('LUGAR', 'ORIGEN DESTINO', 'RUTA'),
      tarifa: numeroExcel(get('TARIFA 10 YO 20 POR TIPO DE CAMION', 'TARIFA', 'FLETE')),
      gastos_operativos: numeroExcel(get('GASTOS OPERATIVOS', 'GASTOS')),
      base_imponible: numeroExcel(get('BI', 'BASE IMPONIBLE', 'SUBTOTAL')),
      igv: numeroExcel(get('IGV')), total: numeroExcel(get('TOTAL')), adelanto: numeroExcel(get('ADELANTO')),
      detraccion: numeroExcel(get('DETRACCION')),
      neto_cobrar: numeroExcel(get('NETO POR COBRAR', 'NETO COBRAR', 'SALDO')),
      mes_facturacion: txt('MES FACTURACION', 'MES'),
      fecha_factura: fechaExcel(get('FECHA', 'FECHA FACTURA')),
      serie: txt('SERIE'), factura: txt('FACTURA', 'NUMERO FACTURA', 'NRO FACTURA'),
      credito_dias: parseInt(txt('CREDITO DIAS', 'DIAS CREDITO', 'CREDITO'), 10) || 0,
      fecha_cobrar: fechaExcel(get('FECHA A COBRAR', 'FECHA COBRAR', 'VENCIMIENTO')),
      fecha_deposito: fechaExcel(get('FECHA DE DEPOSITO O TRANSF', 'FECHA DEPOSITO', 'FECHA PAGO')),
      estado_servicio: txt('ESTADO SERVICIO', 'ESTADO', 'ESTADO PAGO') || 'PENDIENTE',
      diferencia: numeroExcel(get('DIFERENCIA')),
      observacion: txt('OBSERVACION', 'OBSERVACIONES', 'DETALLE'),
    };

    if (item.codigo_liquidacion || item.razon_social || item.factura || item.placa || item.placa_camion || item.total || item.fecha_liquidacion) {
      procesadas.push(item);
    }
  }
  return procesadas;
}
