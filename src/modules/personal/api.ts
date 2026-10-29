// Directorio del personal (tabla rrhh_personal), sobre los endpoints de la versión actual (routes/rrhh.js):
//   GET    /api/rrhh/personal        → lista ({ ok, data })
//   GET    /api/rrhh/personal/:id    → colaborador + licencias y registros SST
//   POST   /api/rrhh/personal        → crear (documento, nombres, apellidos y cargo obligatorios)
//   PUT    /api/rrhh/personal/:id    → editar: el servidor reescribe TODOS los campos, por eso se envía el registro completo
//   DELETE /api/rrhh/personal/:id    → eliminar
//   GET    /api/proxy/documento      → nombres y apellidos desde RENIEC
// Permiso: rrhh_personal (ver, crear, editar, eliminar).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface Persona {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  sexo: string;
  fecha_nacimiento: string;
  nacionalidad: string;
  estado_civil: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
  telefono: string;
  email: string;
  contacto_emergencia_nombre: string;
  contacto_emergencia_parentesco: string;
  contacto_emergencia_telefono: string;
  categoria_rol: string;
  cargo: string;
  area: string;
  sede: string;
  centro_costo_codigo: string;
  jefe_inmediato: string;
  fecha_ingreso: string;
  fecha_cese: string;
  motivo_cese: string;
  estado: string;
  tipo_contrato: string;
  fecha_inicio_contrato: string;
  fecha_fin_contrato: string;
  regimen_pensionario: string;
  tipo_comision_afp: string;
  cuspp: string;
  tiene_asignacion_familiar: boolean;
  sueldo_basico: string;
  bono_fijo: string;
  banco_haberes: string;
  cuenta_haberes: string;
  cci_haberes: string;
  banco_cts: string;
  cuenta_cts: string;
  licencia_conducir: string;
  licencia_categoria: string;
  licencia_vencimiento: string;
  sctr_salud_vigente: boolean;
  sctr_pension_vigente: boolean;
  emo_fecha_vencimiento: string;
  emo_condicion: string;
  grupo_sanguineo: string;
  talla_polo: string;
  talla_pantalon: string;
  talla_calzado: string;
  talla_chaleco: string;
  foto_url: string;
}

type Opcion = { value: string; label: string };
const op = (pares: Array<[string, string]>): Opcion[] => pares.map(([value, label]) => ({ value, label }));

// Mismas opciones que la versión actual (los valores son los que guarda la base)
export const OPCIONES = {
  tipoDocumento: op([['DNI', 'DNI'], ['CE', 'Carnet de extranjería'], ['PASAPORTE', 'Pasaporte']]),
  sexo: op([['M', 'Masculino'], ['F', 'Femenino']]),
  estadoCivil: op([['SOLTERO(A)', 'Soltero(a)'], ['CASADO(A)', 'Casado(a)'], ['CONVIVIENTE', 'Conviviente'], ['DIVORCIADO(A)', 'Divorciado(a)'], ['VIUDO(A)', 'Viudo(a)']]),
  area: op([['OPERACIONES', 'Operaciones'], ['FLOTA', 'Flota / Transporte'], ['MANTENIMIENTO', 'Mantenimiento / Taller'], ['ALMACEN', 'Almacén / Logística'], ['GERENCIA', 'Gerencia / Administración'], ['COMERCIAL', 'Comercial / Ventas']]),
  rol: op([['CONDUCTOR', 'Conductor / Operador'], ['MECANICO_TALLER', 'Mecánico / Taller'], ['ADMINISTRATIVO', 'Administrativo'], ['LIMPIEZA_SERVICIOS', 'Limpieza / Servicios'], ['SEGURIDAD_CONTROL', 'Seguridad / Control'], ['OTRO', 'Otro']]),
  centroCosto: op([['CC-100', 'CC-100 Administración / Gerencia'], ['CC-200', 'CC-200 Comercial'], ['CC-300', 'CC-300 Operaciones / Flota'], ['CC-400', 'CC-400 Taller / Mantenimiento'], ['CC-500', 'CC-500 Almacén / Sistemas']]),
  estado: op([['ACTIVO', 'Activo'], ['VACACIONES', 'Vacaciones'], ['SUSPENDIDO', 'Suspendido'], ['CESADO', 'Cesado']]),
  tipoContrato: op([['PLAZO_FIJO', 'Plazo fijo'], ['INDETERMINADO', 'Plazo indeterminado'], ['PERIODO_PRUEBA', 'Periodo de prueba'], ['LOCACION_SERVICIOS', 'Locación de servicios (RxH)'], ['PRACTICANTE', 'Convenio de prácticas']]),
  regimen: op([['ONP', 'ONP'], ['AFP_INTEGRA', 'AFP Integra'], ['AFP_PRIMA', 'AFP Prima'], ['AFP_PROFUTURO', 'AFP Profuturo'], ['AFP_HABITAT', 'AFP Habitat'], ['SIN_REGIMEN', 'Sin régimen / RxH']]),
  comisionAfp: op([['FLUJO', 'Sobre el flujo (sueldo)'], ['MIXTA', 'Mixta (saldo + flujo)']]),
  banco: op([['BCP', 'BCP'], ['BBVA', 'BBVA'], ['INTERBANK', 'Interbank'], ['SCOTIABANK', 'Scotiabank'], ['BANCO DE LA NACIÓN', 'Banco de la Nación'], ['OTRO', 'Otro banco']]),
  bancoCts: op([['BCP', 'BCP'], ['BBVA', 'BBVA'], ['INTERBANK', 'Interbank'], ['SCOTIABANK', 'Scotiabank'], ['BANCO DE LA NACIÓN', 'Banco de la Nación'], ['CAJA HUANCAYO', 'Caja Huancayo'], ['CAJA AREQUIPA', 'Caja Arequipa'], ['OTRO', 'Otro banco o caja']]),
  grupoSanguineo: op([['O+', 'O+'], ['O-', 'O−'], ['A+', 'A+'], ['A-', 'A−'], ['B+', 'B+'], ['B-', 'B−'], ['AB+', 'AB+'], ['AB-', 'AB−'], ['NO_CONOCE', 'No conoce']]),
  categoriaLicencia: op([['A-I', 'A-I (particular)'], ['A-IIB', 'A-IIB (camionetas, furgón)'], ['A-IIIA', 'A-IIIA (buses)'], ['A-IIIB', 'A-IIIB (carga pesada)'], ['A-IIIC', 'A-IIIC (pesado especial)'], ['A-IV', 'A-IV (materiales peligrosos)']]),
  emo: op([['APTO', 'Apto'], ['APTO_RESTRICCIONES', 'Apto con restricciones'], ['NO_APTO', 'No apto'], ['PENDIENTE', 'Pendiente de evaluación']]),
  tallaPolo: op(['S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(t => [t, t])),
  tallaPantalon: op(['28', '30', '32', '34', '36', '38', '40', '42'].map(t => [t, t])),
  tallaCalzado: op(['38', '39', '40', '41', '42', '43', '44', '45'].map(t => [t, t])),
  tallaChaleco: op([['ESTANDAR', 'Estándar'], ['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']]),
};

/** Etiqueta de un valor guardado ("MECANICO_TALLER" → "Mecánico / Taller") */
export const etiqueta = (lista: Opcion[], v: string) => lista.find(o => o.value === v)?.label ?? (v ? v.replace(/_/g, ' ') : '');

/** Centro de costos que corresponde a cada área (como en la versión actual) */
export const CENTRO_POR_AREA: Record<string, string> = {
  GERENCIA: 'CC-100', COMERCIAL: 'CC-200', OPERACIONES: 'CC-300', FLOTA: 'CC-300', MANTENIMIENTO: 'CC-400', ALMACEN: 'CC-500',
};

/** Asignación familiar: 10 % de la remuneración mínima (S/ 1,130) */
export const ASIGNACION_FAMILIAR = 113;

const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

export const VACIA: Persona = {
  id: 0, tipo_documento: 'DNI', numero_documento: '', nombres: '', apellidos: '', sexo: 'M', fecha_nacimiento: '',
  nacionalidad: 'PERUANA', estado_civil: 'SOLTERO(A)', direccion: '', distrito: '', provincia: '', departamento: '',
  telefono: '', email: '', contacto_emergencia_nombre: '', contacto_emergencia_parentesco: '', contacto_emergencia_telefono: '',
  categoria_rol: 'ADMINISTRATIVO', cargo: '', area: 'OPERACIONES', sede: 'BASE PRINCIPAL', centro_costo_codigo: 'CC-300',
  jefe_inmediato: '', fecha_ingreso: '', fecha_cese: '', motivo_cese: '', estado: 'ACTIVO', tipo_contrato: 'PLAZO_FIJO',
  fecha_inicio_contrato: '', fecha_fin_contrato: '', regimen_pensionario: 'ONP', tipo_comision_afp: 'FLUJO', cuspp: '',
  tiene_asignacion_familiar: false, sueldo_basico: '', bono_fijo: '', banco_haberes: 'BCP', cuenta_haberes: '', cci_haberes: '',
  banco_cts: '', cuenta_cts: '', licencia_conducir: '', licencia_categoria: '', licencia_vencimiento: '',
  sctr_salud_vigente: true, sctr_pension_vigente: true, emo_fecha_vencimiento: '', emo_condicion: 'APTO', grupo_sanguineo: '',
  talla_polo: '', talla_pantalon: '', talla_calzado: '', talla_chaleco: '', foto_url: '',
};
export const nuevaPersona = (): Persona => ({ ...VACIA, fecha_ingreso: hoyIso() });

const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const fecha = (v: unknown) => (v ? String(v).slice(0, 10) : '');
const bool = (v: unknown) => v === 1 || v === true || v === '1';
const FECHAS = new Set(['fecha_nacimiento', 'fecha_ingreso', 'fecha_cese', 'fecha_inicio_contrato', 'fecha_fin_contrato', 'licencia_vencimiento', 'emo_fecha_vencimiento']);
const BOOLEANOS = new Set(['tiene_asignacion_familiar', 'sctr_salud_vigente', 'sctr_pension_vigente']);

export function aPersona(f: Record<string, unknown>): Persona {
  const p = { ...VACIA } as Record<string, unknown>;
  for (const k of Object.keys(VACIA)) {
    if (k === 'id') p.id = Number(f.id);
    else if (FECHAS.has(k)) p[k] = fecha(f[k]);
    else if (BOOLEANOS.has(k)) p[k] = f[k] == null ? (VACIA as unknown as Record<string, unknown>)[k] : bool(f[k]);
    else if (k === 'sueldo_basico' || k === 'bono_fijo') p[k] = f[k] == null ? '' : String(Number(f[k]) || 0);
    else p[k] = txt(f[k]);
  }
  return p as unknown as Persona;
}

export const nombreCompleto = (p: Pick<Persona, 'nombres' | 'apellidos'>) => `${p.nombres} ${p.apellidos}`.replace(/\s+/g, ' ').trim();

/** Letra del índice (por apellido, como Contactos ordenado por apellido). Ñ va con su propia letra. */
export function letraDe(p: Pick<Persona, 'apellidos' | 'nombres'>) {
  const base = (p.apellidos || p.nombres || '#').trim().charAt(0).toUpperCase();
  if (base === 'Ñ') return 'Ñ';
  const sinTilde = base.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /[A-Z]/.test(sinTilde) ? sinTilde : '#';
}
export const ALFABETO = [...'ABCDEFGHIJKLMN', 'Ñ', ...'OPQRSTUVWXYZ', '#'];
const ordenLetra = (l: string) => ALFABETO.indexOf(l);
const comparar = new Intl.Collator('es', { sensitivity: 'base' }).compare;
export const ordenarPersonas = (a: Persona, b: Persona) =>
  ordenLetra(letraDe(a)) - ordenLetra(letraDe(b)) || comparar(a.apellidos, b.apellidos) || comparar(a.nombres, b.nombres);

export function usePersonal() {
  return useQuery({
    queryKey: ['personal'],
    queryFn: async () => {
      const r = await api<{ data?: Array<Record<string, unknown>> }>('/rrhh/personal');
      return (r.data ?? []).map(aPersona).sort(ordenarPersonas);
    },
  });
}

/** Lo que el servidor espera (todos los campos: el PUT reescribe la fila completa) */
function cuerpo(p: Persona, fotoNueva?: string) {
  const { id: _id, foto_url, ...resto } = p;
  const b: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resto)) {
    if (typeof v === 'boolean') b[k] = v ? '1' : '0';
    else if (typeof v === 'string') b[k] = v.trim() || null;
    else b[k] = v;
  }
  b.numero_documento = p.numero_documento.trim();
  b.nombres = p.nombres.trim().toUpperCase();
  b.apellidos = p.apellidos.trim().toUpperCase();
  b.cargo = p.cargo.trim().toUpperCase();
  b.sueldo_basico = p.sueldo_basico || '0';
  b.bono_fijo = p.bono_fijo || '0';
  // La foto solo viaja si es nueva: el servidor conserva la anterior cuando no llega
  if (fotoNueva) b.foto_url = fotoNueva;
  else if (!p.id && foto_url) b.foto_url = foto_url;
  return b;
}

export async function guardarPersona(p: Persona, fotoNueva?: string) {
  const r = await api<{ ok?: boolean; id?: number; error?: string }>(p.id ? `/rrhh/personal/${p.id}` : '/rrhh/personal', {
    method: p.id ? 'PUT' : 'POST',
    body: cuerpo(p, fotoNueva),
  });
  if (!r.ok) throw new Error(r.error || 'No se pudo guardar');
  return r.id ?? p.id;
}

export async function eliminarPersona(id: number) {
  await api(`/rrhh/personal/${id}`, { method: 'DELETE' });
}

/** Nombres y apellidos desde RENIEC (null si no se encuentra) */
export async function datosPorDni(dni: string) {
  const r = await api<{ nombres?: string; apellidoPaterno?: string; apellidoMaterno?: string; nombre?: string }>('/proxy/documento', { query: { tipo: 'DNI', numero: dni } });
  const apellidos = `${r.apellidoPaterno ?? ''} ${r.apellidoMaterno ?? ''}`.trim().toUpperCase();
  const nombres = (r.nombres ?? '').trim().toUpperCase();
  if (nombres || apellidos) return { nombres, apellidos };
  const completo = (r.nombre ?? '').trim().toUpperCase();
  return completo ? { nombres: completo, apellidos: '' } : null;
}

/** Fin de contrato: inicio + meses − 1 día (como la versión actual) */
export function finDeContrato(inicio: string, meses: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !(meses > 0)) return '';
  const d = new Date(`${inicio}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Días hasta una fecha (negativo = ya pasó). null si no hay fecha. */
export function diasHasta(iso: string) {
  if (!iso) return null;
  const hoy = new Date(`${hoyIso()}T00:00:00Z`).getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - hoy) / 86_400_000);
}

export type Alerta = { clave: string; texto: string; tono: 'red' | 'amber' };

/** Lo que vence o falta: contrato, brevete, examen médico, SCTR */
export function alertasDe(p: Persona): Alerta[] {
  if (p.estado === 'CESADO') return [];
  const out: Alerta[] = [];
  const revisar = (clave: string, nombre: string, iso: string) => {
    const d = diasHasta(iso);
    if (d == null) return;
    if (d < 0) out.push({ clave, texto: `${nombre} vencido hace ${-d} ${-d === 1 ? 'día' : 'días'}`, tono: 'red' });
    else if (d <= 30) out.push({ clave, texto: d === 0 ? `${nombre} vence hoy` : `${nombre} vence en ${d} ${d === 1 ? 'día' : 'días'}`, tono: 'amber' });
  };
  if (p.tipo_contrato !== 'INDETERMINADO' && p.tipo_contrato !== 'LOCACION_SERVICIOS') revisar('contrato', 'Contrato', p.fecha_fin_contrato);
  revisar('licencia', 'Brevete', p.licencia_vencimiento);
  revisar('emo', 'Examen médico', p.emo_fecha_vencimiento);
  if (!p.sctr_salud_vigente || !p.sctr_pension_vigente) out.push({ clave: 'sctr', texto: 'SCTR sin cobertura', tono: 'red' });
  return out;
}

/** Edad en años cumplidos */
export function edad(nacimiento: string) {
  const d = diasHasta(nacimiento);
  if (d == null) return null;
  const [y, m, dd] = nacimiento.split('-').map(Number);
  const [hy, hm, hd] = hoyIso().split('-').map(Number);
  return hy - y - (hm < m || (hm === m && hd < dd) ? 1 : 0);
}

/** "3 años y 2 meses" desde el ingreso */
export function antiguedad(ingreso: string) {
  if (!ingreso) return '';
  const [y, m] = ingreso.split('-').map(Number);
  const [hy, hm] = hoyIso().split('-').map(Number);
  const meses = (hy - y) * 12 + (hm - m);
  if (meses < 1) return 'Menos de un mes';
  const a = Math.floor(meses / 12), r = meses % 12;
  const pa = a ? `${a} ${a === 1 ? 'año' : 'años'}` : '';
  const pm = r ? `${r} ${r === 1 ? 'mes' : 'meses'}` : '';
  return [pa, pm].filter(Boolean).join(' y ');
}

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function coincide(p: Persona, busqueda: string) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = normalizar([p.nombres, p.apellidos, p.numero_documento, p.cargo, p.area, p.email, p.telefono.replace(/\D/g, ''), p.licencia_conducir].join(' '));
  return palabras.every(w => texto.includes(w));
}

/** Celular para WhatsApp (51 + 9 dígitos) o null */
export function whatsapp(telefono: string) {
  const d = telefono.replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  return /^9\d{8}$/.test(local) ? `51${local}` : null;
}

/**
 * Foto para la ficha y el fotocheck: cuadrada de 480 px en JPEG (la columna admite más,
 * pero así la lista carga rápido en el celular).
 */
export async function comprimirFoto(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo abrir la imagen.'));
      i.src = url;
    });
    const lado = 480;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d')!;
    const corte = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - corte) / 2, (img.naturalHeight - corte) / 2, corte, corte, 0, 0, lado, lado);
    for (const calidad of [0.85, 0.75, 0.6]) {
      const dataUrl = canvas.toDataURL('image/jpeg', calidad);
      if (dataUrl.length < 160_000) return dataUrl;
    }
    return canvas.toDataURL('image/jpeg', 0.5);
  } finally {
    URL.revokeObjectURL(url);
  }
}
