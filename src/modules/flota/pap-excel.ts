import { exportarExcel } from '../../core/lib/excel';
import { ASUME_TXT, ESTADO_TXT, GRAVEDAD_TXT, TIPO_DOC_TXT, entidadTexto, type EntidadPap, type Papeleta } from './pap-api';

// Excel de Papeletas: plantilla, exportación e importación (con los mismos nombres de columna en las tres).

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
type Fila = Record<string, unknown>;

/** Columna del Excel → campo de la papeleta */
const COLUMNAS: Array<[string, string]> = [
  ['Entidad (código)', 'entidad_codigo'], ['Tipo de documento', 'tipo_documento'], ['N° documento', 'numero'], ['Fecha y hora infracción', 'fecha_infraccion'],
  ['Departamento', 'departamento'], ['Lugar', 'lugar'], ['Agente', 'agente'], ['Placa', 'placa'], ['Empresa de la unidad', 'empresa_unidad'],
  ['Conductor', 'conductor_nombre'], ['DNI conductor', 'conductor_dni'], ['Licencia', 'licencia'],
  ['Código infracción', 'infraccion_codigo'], ['Descripción infracción', 'infraccion_desc'], ['Gravedad', 'gravedad'], ['Puntos', 'puntos'],
  ['Moneda', 'moneda'], ['Monto multa', 'monto'], ['Descuento (monto)', 'descuento_monto'], ['Fecha límite descuento', 'fecha_limite_descuento'], ['Recargos', 'recargos'],
  ['Fecha notificación', 'fecha_notificacion'], ['Fecha límite descargo', 'fecha_limite_descargo'], ['Fecha límite pago', 'fecha_limite_pago'],
  ['Quién asume', 'quien_asume'], ['Estado', 'estado'], ['Fecha de pago', 'fecha_pago'], ['Monto pagado', 'monto_pagado'], ['Medio de pago', 'medio_pago'], ['N° operación', 'nro_operacion'], ['Pagado por', 'pagado_por'],
  ['Observaciones', 'observaciones'],
];

export async function descargarPlantillaPapeletas(entidades: EntidadPap[]) {
  const XLSX = await import('xlsx');
  const ejemplo: Fila = {
    'Entidad (código)': 'SUTRAN', 'Tipo de documento': 'Acta de control', 'N° documento': 'ACT-000123', 'Fecha y hora infracción': '2026-10-15 09:30',
    'Departamento': 'Lima', 'Lugar': 'Panamericana Sur km 45', 'Agente': 'Inspector Pérez', 'Placa': 'ABC123', 'Conductor': 'JUAN PÉREZ GÓMEZ', 'DNI conductor': '12345678',
    'Código infracción': 'M-01', 'Descripción infracción': 'Descripción de la infracción', 'Moneda': 'PEN', 'Monto multa': 1500, 'Fecha notificación': '2026-10-20',
    'Fecha límite pago': '2026-11-20', 'Quién asume': 'Empresa', 'Estado': 'Pendiente',
  };
  const hoja1 = XLSX.utils.json_to_sheet([ejemplo], { header: COLUMNAS.map(c => c[0]) });
  const hoja2 = XLSX.utils.json_to_sheet(entidades.filter(e => e.activo).map(e => ({ 'Código': e.codigo, 'Entidad': e.nombre })));
  const hoja3 = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar la plantilla'],
    ['• Obligatorios: Entidad (código), N° documento, Fecha de infracción y Placa. El resto se completa solo si lo dejas vacío.'],
    ['• Entidad: usa el código de la hoja «Entidades» (SUTRAN, PNP, SAT_LIMA…).'],
    ['• Si pones el código de infracción y ya está en el catálogo, se completa la descripción, la gravedad, los puntos y la multa.'],
    ['• Los plazos (descargo, descuento y pago) se calculan solos con los días de la entidad si dejas las fechas límite vacías.'],
    ['• Fechas: AAAA-MM-DD (o AAAA-MM-DD HH:mm). También sirve DD/MM/AAAA.'],
    ['• Estado: Pendiente, En descargo, Pagada o Anulada. Si es Pagada, completa Fecha de pago y Monto pagado.'],
    ['• Quién asume: Empresa, Conductor, Empresa que alquila o Tercero.'],
    ['• Las papeletas repetidas (misma entidad y mismo número) se omiten.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja1, 'Papeletas');
  XLSX.utils.book_append_sheet(wb, hoja2, 'Entidades');
  XLSX.utils.book_append_sheet(wb, hoja3, 'Instrucciones');
  XLSX.writeFile(wb, 'Plantilla_Papeletas.xlsx');
}

export async function exportarPapeletasExcel(filas: Papeleta[]) {
  await exportarExcel('Papeletas', 'Papeletas',
    ['Código', 'Entidad', 'Tipo', 'N° documento', 'Fecha infracción', 'Placa', 'Empresa', 'Conductor', 'DNI', 'Infracción', 'Descripción', 'Gravedad', 'Puntos', 'Moneda', 'Monto', 'Descuento', 'Recargos', 'Total vigente',
      'Pagado', 'Saldo', 'Fin del descuento', 'Límite de pago', 'Quién asume', 'Estado', 'Observaciones'],
    filas.map(p => [p.codigo, entidadTexto(p), TIPO_DOC_TXT[p.tipo_documento] || p.tipo_documento, p.numero, p.fecha_infraccion.replace('T', ' '), p.placa, p.empresa_unidad, p.conductor_nombre, p.conductor_dni,
      p.infraccion_codigo, p.infraccion_desc, p.gravedad ? GRAVEDAD_TXT[p.gravedad] : '', p.puntos, p.moneda, p.monto, p.descuento_monto, p.recargos, p.total_vigente, p.pagado, p.saldo,
      p.fecha_limite_descuento, p.fecha_limite_pago, ASUME_TXT[p.quien_asume], ESTADO_TXT[p.estado_efectivo], p.observaciones]));
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────────────
const dos = (n: number) => String(n).padStart(2, '0');
function aFecha(v: unknown, conHora: boolean): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const d = new Date(Math.round(v.getTime() / 60000) * 60000); // sin segundos sueltos
    const f = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    return conHora && (d.getHours() || d.getMinutes()) ? `${f}T${dos(d.getHours())}:${dos(d.getMinutes())}` : f;
  }
  const t = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return conHora && m[4] ? `${m[1]}-${m[2]}-${m[3]}T${dos(+m[4])}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return conHora && m[4] ? `${m[3]}-${dos(+m[2])}-${dos(+m[1])}T${dos(+m[4])}:${m[5]}` : `${m[3]}-${dos(+m[2])}-${dos(+m[1])}`;
  return null;
}

const mapa = (opciones: Record<string, string>) => (v: unknown) => opciones[sinAcentos(String(v ?? ''))] ?? undefined;
const tipoDoc = mapa({ papeleta: 'PAPELETA', actadecontrol: 'ACTA_CONTROL', actacontrol: 'ACTA_CONTROL', resoluciondemulta: 'RESOLUCION_MULTA', resolucionmulta: 'RESOLUCION_MULTA', fotopapeleta: 'FOTOPAPELETA', notificacion: 'NOTIFICACION', otro: 'OTRO', otrodocumento: 'OTRO' });
const gravedad = mapa({ leve: 'LEVE', grave: 'GRAVE', muygrave: 'MUY_GRAVE' });
const asume = mapa({ empresa: 'EMPRESA', laempresa: 'EMPRESA', conductor: 'CONDUCTOR', elconductor: 'CONDUCTOR', empresaquealquila: 'ALQUILADA', alquilada: 'ALQUILADA', tercero: 'TERCERO', untercero: 'TERCERO' });
const estado = mapa({ pendiente: 'PENDIENTE', endescargo: 'EN_DESCARGO', descargo: 'EN_DESCARGO', pagada: 'PAGADA', pagado: 'PAGADA', anulada: 'ANULADA' });

/** Lee la primera hoja de un Excel de papeletas y arma las filas para el servidor (que las valida una por una) */
export async function leerExcelPapeletas(archivo: File, entidades: EntidadPap[]): Promise<{ filas: Fila[]; avisos: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: 'array', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames.find(n => sinAcentos(n) === 'papeletas') ?? wb.SheetNames[0]];
  const crudas = XLSX.utils.sheet_to_json<Fila>(hoja, { defval: '' });
  const porNombre = new Map(COLUMNAS.map(([titulo, campo]) => [sinAcentos(titulo), campo]));
  const avisos: string[] = [];
  const entidadDe = (v: unknown): string => {
    const t = String(v ?? '').trim();
    if (!t) return '';
    const n = sinAcentos(t);
    const e = entidades.find(x => sinAcentos(x.codigo) === n) ?? entidades.find(x => sinAcentos(x.nombre).includes(n) || n.includes(sinAcentos(x.codigo)));
    return e ? e.codigo : t.toUpperCase();
  };
  const filas = crudas.map((fila, i) => {
    const o: Fila = {};
    for (const [col, val] of Object.entries(fila)) {
      const campo = porNombre.get(sinAcentos(col));
      if (campo) o[campo] = val;
    }
    o.entidad_codigo = entidadDe(o.entidad_codigo);
    if (o.entidad_codigo && !entidades.some(e => e.codigo === o.entidad_codigo)) { o.entidad_otra = String(fila['Entidad (código)'] ?? ''); o.entidad_codigo = 'OTRA'; avisos.push(`Fila ${i + 2}: la entidad «${o.entidad_otra}» no está en el catálogo; se carga como «Otra entidad».`); }
    o.tipo_documento = tipoDoc(o.tipo_documento) ?? 'PAPELETA';
    o.fecha_infraccion = aFecha(o.fecha_infraccion, true);
    for (const c of ['fecha_limite_descuento', 'fecha_notificacion', 'fecha_limite_descargo', 'fecha_limite_pago', 'fecha_pago']) o[c] = aFecha(o[c], false);
    o.gravedad = gravedad(o.gravedad) ?? '';
    o.quien_asume = asume(o.quien_asume) ?? 'EMPRESA';
    o.estado = estado(o.estado) ?? 'PENDIENTE';
    o.moneda = /usd|d[oó]lar/i.test(String(o.moneda ?? '')) ? 'USD' : 'PEN';
    o.placa = String(o.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return o;
  }).filter(f => f.numero || f.placa || f.fecha_infraccion);
  return { filas, avisos };
}

// ── Catálogo de infracciones ─────────────────────────────────────────────────────────────────────
const COL_INF: Array<[string, string]> = [
  ['Entidad (código)', 'entidad_codigo'], ['Código', 'codigo'], ['Descripción', 'descripcion'], ['Gravedad', 'gravedad'], ['Puntos', 'puntos'], ['Multa (% de UIT)', 'multa_uit'], ['Multa (S/)', 'multa_soles'], ['Medida', 'medida'],
];
export async function descargarPlantillaInfracciones() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet([{ 'Entidad (código)': 'PNP', 'Código': 'M-01', 'Descripción': 'Texto de la infracción', 'Gravedad': 'Muy grave', 'Puntos': 50, 'Multa (% de UIT)': 1.0, 'Multa (S/)': '', 'Medida': '' }], { header: COL_INF.map(c => c[0]) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Infracciones');
  XLSX.writeFile(wb, 'Plantilla_Infracciones.xlsx');
}
export async function leerExcelInfracciones(archivo: File): Promise<Fila[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: 'array' });
  const crudas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const porNombre = new Map(COL_INF.map(([t, c]) => [sinAcentos(t), c]));
  return crudas.map(fila => {
    const o: Fila = {};
    for (const [col, val] of Object.entries(fila)) { const c = porNombre.get(sinAcentos(col)); if (c) o[c] = val; }
    o.gravedad = gravedad(o.gravedad) ?? '';
    return o;
  }).filter(f => f.codigo || f.descripcion);
}
