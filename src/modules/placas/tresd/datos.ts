// Datos de la flota para "Placas en 3D". Funciones puras: sin three ni React.
// Lógica copiada del archivo docs/referencia/flota-3d.html (literal), con los cambios de carretas
// y de búsqueda que pidió el usuario (marcados con "Cambio:").
import type { Placa } from '../api';
import { MODELS, TLABEL, truckBase, variant, type ModeloDef } from './modelosDatos';

export type Cat = 'T' | 'C' | 'R' | 'S' | 'A' | 'O';

export interface Unidad {
  plate: string;
  f: Record<string, string>;
  cat: Cat;
  search: string;
  placa: Placa;
}

export const CATS: { id: 'all' | Cat; single: string; name: string }[] = [
  { id: 'all', single: 'Todas', name: 'Todas las unidades' },
  { id: 'C', single: 'Camión', name: 'Camiones' },
  { id: 'R', single: 'Carreta', name: 'Carretas' },
  { id: 'S', single: 'Semirremolque', name: 'Semirremolques' },
  { id: 'T', single: 'Tracto', name: 'Tractos' },
  { id: 'A', single: 'Auto', name: 'Autos y camionetas' },
  { id: 'O', single: 'Otros', name: 'Otros' },
];

/** Texto sin tildes, en mayúsculas, solo letras y números separados por espacio */
export function norm(s: unknown): string {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Cambio: letras griegas y cirílicas que se parecen a las latinas (VIN escritos con otro teclado)
const HOMOGLIFOS: Record<string, string> = {
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K',
  'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'Ё': 'E', 'Ѕ': 'S', 'І': 'I', 'Ї': 'I', 'Ј': 'J', 'А': 'A', 'В': 'B',
  'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C',
  'Т': 'T', 'У': 'Y', 'Х': 'X', 'Ү': 'Y',
};

/** Cambio: pasa a mayúsculas latinas las letras griegas/cirílicas parecidas. Solo para búsqueda. */
export function normalizarVin(s: string): string {
  return String(s == null ? '' : s)
    .toUpperCase()
    .replace(/[Ͱ-ϿЀ-ӿ]/g, ch => HOMOGLIFOS[ch] || ch);
}

// Cambio: tipos de carreta que pueden venir en TIPO
const TIPOS_CARRETA = ['FURGON', 'CISTERNA', 'PLATAFORMA', 'TOLVA'];

function catOf(f: Record<string, string>): Cat {
  const t = norm(f.TIPO);
  if (t === 'TRACTO') return 'T';
  if (t === 'CAMION') return 'C';
  if (t === 'CARRETA') return 'R';
  if (/^(AUTO|AUTOMOVIL|CAMIONETA|SUV|PICK ?UP)$/.test(t)) return 'A';
  if (/SEMI|REMOLQUE/.test(t)) return 'S';
  // Cambio: Furgón, Cisterna, Plataforma o Tolva se clasifican por la configuración (S = Semirremolque, R = Carreta)
  if (TIPOS_CARRETA.indexOf(t) >= 0) {
    const cfg = norm(f.CONFIGURACION).replace(/ /g, '');
    if (/^S/.test(cfg)) return 'S';
    if (/^R/.test(cfg)) return 'R';
  }
  return 'O';
}

/** Fuera de uso: EN USO = No, o estado inactivo */
export function estaFueraDeUso(u: Unidad): boolean {
  return norm(u.f['EN USO']) === 'NO' || /INACTIV/.test(norm(u.f.ESTADO));
}

export function textoEstado(u: Unidad): string {
  return norm(u.f['EN USO']) === 'NO' ? 'Fuera de uso' : (u.f.ESTADO || 'Sin estado');
}

export function tituloUnidad(u: Unidad): string {
  const t = [nice(u.f.MARCA), u.f.MODELO].filter(Boolean).join(' ');
  if (t) return t;
  const c = CATS.filter(x => x.id === u.cat)[0];
  return c ? c.name : '';
}

/** Búsqueda: cada palabra escrita debe aparecer en el texto de búsqueda de la unidad */
export function coincide(u: Unidad, q: string): boolean {
  const palabras = norm(normalizarVin(q)).split(' ').filter(Boolean);
  return palabras.every(w => u.search.indexOf(w) >= 0);
}

// Números: 17500 · 17,500 · 17.500 · 87.5
export function num(v: unknown): number | null {
  let s = String(v == null ? '' : v).replace(/\s/g, '');
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('es-PE', { maximumFractionDigits: 1 });
}

export function nice(s: string): string {
  return !s ? '' : s === s.toUpperCase() && s.length > 3 ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

export function tanks(f: Record<string, string>): number | null {
  const t = ['TANQUE 1', 'TANQUE 2', 'TANQUE 3', 'TANQUE'].map(k => num(f[k])).filter((n): n is number => n != null);
  return t.length ? t.reduce((a, b) => a + b, 0) : null;
}

// Colores escritos con palabras (BLANCO ROJO PLATA, Blanco - Rojo - Azul…)
const CNAMES: Record<string, number> = {
  BLANCO: 0xe9ecef, ROJO: 0x9e1b22, PLATA: 0x9aa3ad, PLATEADO: 0x9aa3ad, GRIS: 0x5d6f80, AZUL: 0x1f5aa6, CELESTE: 0x4a90c8,
  VERDE: 0x2f5a3c, ANARANJADO: 0xd9731c, NARANJA: 0xd9731c, AMARILLO: 0xe0a81a, NEGRO: 0x1c1f24, MARRON: 0x5a3b28,
  GUINDA: 0x6b1626, CREMA: 0xe8dfc8, BEIGE: 0xd8cdb4, DORADO: 0xc9a14a, MORADO: 0x4b2d6b, CHAMPAGNE: 0xcdbf9f,
};
export function colorsOf(s: string): number[] {
  return norm(s).split(' ').map(w => CNAMES[w]).filter((v): v is number => v != null);
}
export function hexCss(h: number): string {
  return '#' + h.toString(16).padStart(6, '0');
}

/** Etiquetas de los campos (las que no están aquí salen del nombre del campo) */
const LABELS: Record<string, string> = {
  'SUB TIPO': 'Subtipo', CONFIGURACION: 'Configuración', ANO: 'Año', 'MODELO MOTOR': 'Modelo de motor',
  'NRO MOTOR': 'N.º de motor', 'NRO VIN': 'N.º VIN', 'NRO CAJA': 'N.º de caja', 'NRO CORONA': 'N.º de corona',
  'RUC DNI': 'RUC / DNI', UTS: 'UTS', 'CARGA UTIL': 'Carga útil', 'PESO NETO': 'Peso neto', 'PESO BRUTO': 'Peso bruto',
  'EN USO': 'En uso',
};
export function etiquetaCampo(k: string): string {
  if (LABELS[k]) return LABELS[k];
  const s = k.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const GRUPOS: [string, string[]][] = [
  ['Unidad', ['MARCA', 'MODELO', 'TIPO', 'SUB TIPO', 'CONFIGURACION', 'ANO', 'COLOR', 'LLANTAS']],
  ['Motor y combustible', ['MODELO MOTOR', 'NRO MOTOR', 'COMBUSTIBLE', 'TANQUE 1', 'TANQUE 2', 'TANQUE 3']],
  ['Pesos', ['TARA', 'CARGA UTIL', 'PESO NETO', 'PESO BRUTO']],
  ['Identificación', ['NRO VIN', 'NRO CAJA', 'NRO CORONA']],
  ['Operación', ['CLIENTE', 'RUC DNI', 'ESTADO', 'UTS', 'MOTORA', 'EN USO']],
];

export const UNIDADES: Record<string, string> = {
  'TANQUE 1': 'gal', 'TANQUE 2': 'gal', 'TANQUE 3': 'gal', TARA: 'kg', 'CARGA UTIL': 'kg', 'PESO NETO': 'kg', 'PESO BRUTO': 'kg',
};

/** Campos que se muestran como texto fijo (números de serie, RUC) */
export const MONO = new Set<string>(['NRO VIN', 'NRO MOTOR', 'NRO CAJA', 'NRO CORONA', 'RUC DNI']);

/** Fila con las mismas claves que usa el archivo, a partir de la placa del ERP */
function filaDe(p: Placa): Record<string, string> {
  const t = (v: unknown) => (v == null ? '' : String(v).trim());
  return {
    PLACA: t(p.placa), CLIENTE: t(p.cliente), 'RUC DNI': t(p.ruc), MARCA: t(p.marca), MODELO: t(p.modelo),
    'MODELO MOTOR': t(p.modeloMotor), TIPO: t(p.tipo), 'SUB TIPO': t(p.subTipo), COLOR: t(p.color),
    'NRO MOTOR': t(p.nroMotor), 'NRO CAJA': t(p.nroCaja), 'NRO CORONA': t(p.nroCorona), 'NRO VIN': t(p.vin),
    CONFIGURACION: t(p.configuracion), 'TANQUE 1': t(p.tanque1), 'TANQUE 2': t(p.tanque2), 'TANQUE 3': t(p.tanque3),
    ANO: t(p.anio), COMBUSTIBLE: t(p.combustible), TARA: t(p.tara), 'CARGA UTIL': t(p.cargaUtil),
    'PESO NETO': t(p.pesoNeto), 'PESO BRUTO': t(p.pesoBruto), ESTADO: t(p.estado), UTS: t(p.uts),
    MOTORA: p.motora ? 'Motora' : 'No Motora', LLANTAS: t(p.llantas), 'EN USO': p.enUso ? 'Si' : 'No',
  };
}

/** Filas tal como el archivo: sin TIPO ni MARCA se omiten (cuentan en omitidas). Orden: categoría, luego placa. */
export function unidadesDe(placas: Placa[]): { rows: Unidad[]; omitidas: number } {
  const rows: Unidad[] = [];
  const vistos = new Set<string>();
  let omitidas = 0;
  placas.forEach(p => {
    const f = filaDe(p);
    const plate = norm(f.PLACA).replace(/ /g, '');
    if (!plate) return;
    if (!f.TIPO && !f.MARCA) { omitidas++; return; }
    if (vistos.has(plate)) return;
    vistos.add(plate);
    const search = norm(normalizarVin([plate, f.MARCA, f.MODELO, f.TIPO, f['SUB TIPO'], f.CLIENTE, f.CONFIGURACION,
      f.COLOR, f['NRO VIN'], f['NRO MOTOR']].join(' ')));
    rows.push({ plate, f, cat: catOf(f), search, placa: p });
  });
  const orden = CATS.map(c => c.id);
  rows.sort((a, b) => orden.indexOf(a.cat) - orden.indexOf(b.cat) || a.plate.localeCompare(b.plate));
  return { rows, omitidas };
}

export interface Resuelta {
  M: ModeloDef;
  cfg: string;
  notes: string[];
  body: string;
  ref: string;
  tt?: string;
}

// Cambio: carrocería de la carreta. Thermo King manda; luego SUB TIPO; si no, TIPO.
const CARROCERIAS: [RegExp, string][] = [[/PLATAFORMA/, 'plataforma'], [/FURGON/, 'furgon'], [/CISTERNA/, 'cisterna'], [/TOLVA/, 'tolva']];
function carroceriaRemolque(sub: string, marca: string, tipo: string): string {
  if (/THERMO|TERMO|FRIGO|REFRIG/.test(sub + ' ' + marca)) return 'frio';
  for (let k = 0; k < CARROCERIAS.length; k++) if (CARROCERIAS[k][0].test(sub)) return CARROCERIAS[k][1];
  for (let k = 0; k < CARROCERIAS.length; k++) if (CARROCERIAS[k][0].test(tipo)) return CARROCERIAS[k][1];
  return 'furgon';
}

const KLBL: Record<string, string> = { tractor: 'tracto', tipper: 'volquete', box: 'furgón', cargo: 'baranda' };

/** De la fila a la configuración 3D (literal de resolve() del archivo, con los cambios de carretas) */
export function resolverModelo(u: Unidad): Resuelta {
  const f = u.f;
  // Autos y camionetas: modelo 3D propio, configuración A2 (2 ejes, 4 llantas)
  if (u.cat === 'A') {
    const camioneta = /CAMIONETA|SUV|PICK/.test(norm(f.TIPO));
    const M = MODELS.find(m => m.id === (camioneta ? 'camioneta' : 'auto'));
    if (!M) throw new Error('No hay modelo 3D de auto');
    return { M, cfg: 'A2', notes: [], body: camioneta ? 'Camioneta' : 'Sedán', ref: M.title + ' · A2' };
  }
  const marca = norm(f.MARCA), modelo = norm(f.MODELO), sub = norm(f['SUB TIPO']);
  const cfg = norm(f.CONFIGURACION).replace(/ /g, ''), ll = parseInt(f.LLANTAS, 10) || 0;
  const notes: string[] = [];
  const truckId = truckBase(marca, modelo, u.cat === 'T');
  const trailer = u.cat === 'R' || u.cat === 'S' || /THERMO|TERMO/.test(marca) || (u.cat === 'O' && !truckId);
  if (trailer) {
    const semi = u.cat === 'S' || (u.cat === 'O' && /^S/.test(cfg));
    let c = /^S[1-3]$|^R[23]$/.test(cfg) ? cfg : '';
    if (!c) {
      const n = ll >= 12 ? 3 : ll >= 8 ? 2 : ll >= 4 ? 1 : (semi ? 3 : 2);
      c = semi ? 'S' + n : 'R' + Math.max(2, n);
      notes.push((cfg ? 'La configuración «' + f.CONFIGURACION + '» no corresponde a ' + (semi ? 'un semirremolque' : 'una carreta') : 'El Excel no trae configuración') + ': se muestra ' + c + (ll ? ' según sus ' + ll + ' llantas.' : '.'));
    }
    // Carretas, remolques y semirremolques llevan furgón; las de subtipo Plataforma van sin caja y las Thermo King con equipo de frío
    const tt = carroceriaRemolque(sub, marca, norm(f.TIPO));
    const M = MODELS.find(m => m.id === 'carreta-' + tt);
    if (!M) throw new Error('No hay modelo 3D para la carrocería ' + tt);
    return { M, cfg: c, notes, body: TLABEL[tt], ref: 'Carreta genérica · ' + TLABEL[tt] + ' ' + c, tt };
  }
  let id: string | null = truckId;
  if (!id) {
    id = u.cat === 'T' ? 'fh' : 'vm';
    notes.push('La marca «' + (f.MARCA || 'sin marca') + '» no tiene modelo 3D propio: se usa uno genérico.');
  }
  const base = MODELS.find(m => m.id === id);
  if (!base) throw new Error('No hay modelo 3D base ' + id);
  // Tractos sin carrocería; camiones, todos con furgón
  const kind = u.cat === 'T' ? 'tractor' : 'box';
  let n: number = base.axles.length;
  if (/^[CT]2$/.test(cfg)) n = 2;
  else if (/^[CT]\d$/.test(cfg)) n = 3;
  if (/^[CT][4-9]$/.test(cfg)) notes.push('Configuración ' + cfg + ' mostrada con 3 ejes.');
  if (!cfg) notes.push('El Excel no trae configuración: se usan los ejes del modelo base.');
  const M = variant(base, n, kind);
  return {
    M, cfg: '', notes, body: kind === 'tractor' ? 'Sin carrocería' : 'Furgón',
    ref: base.title + (kind !== base.kind ? ' como ' + KLBL[kind] : '') + ' · ' + n + ' ejes',
  };
}
