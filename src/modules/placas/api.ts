// Placas: datos de la versión actual (POST /api/script/obtenerDatosPlacas, routes/legacy.js),
// que devuelve cada placa como una fila de 30 posiciones. Aquí se convierte a un objeto con nombres.
// Cuando el servidor nuevo tenga /api/v2/placas (Prisma), solo cambia este archivo.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { normalizarTipo } from './tiposUnidad';

export interface Placa {
  placa: string;
  cliente: string;
  ruc: string;
  marca: string;
  modelo: string;
  tipo: string;
  subTipo: string;
  color: string;
  nroMotor: string;
  nroCaja: string;
  nroCorona: string;
  vin: string;
  configuracion: string;
  anio: string;
  combustible: string;
  cargaUtil: string;
  pesoNeto: string;
  pesoBruto: string;
  estado: string;
  uts: string;
  motora: boolean;
  llantas: string;
  enUso: boolean;
  wialon: string;
  tanque1: string;
  tanque2: string;
  tanque3: string;
  capacidadTanque: string;
  tara: string;
  modeloMotor: string;
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

function desdeFila(f: unknown[]): Placa {
  return {
    placa: txt(f[0]).toUpperCase(),
    cliente: txt(f[1]),
    ruc: txt(f[2]),
    marca: txt(f[3]),
    modelo: txt(f[4]),
    tipo: normalizarTipo(txt(f[5])),
    subTipo: txt(f[6]),
    color: txt(f[7]),
    nroMotor: txt(f[8]),
    nroCaja: txt(f[9]),
    nroCorona: txt(f[10]),
    vin: txt(f[11]),
    configuracion: txt(f[12]),
    anio: txt(f[13]),
    combustible: txt(f[14]),
    cargaUtil: txt(f[15]),
    pesoNeto: txt(f[16]),
    pesoBruto: txt(f[17]),
    estado: txt(f[18]) || 'Inactiva',
    uts: txt(f[19]),
    motora: txt(f[20]).toLowerCase() === 'motora',
    llantas: txt(f[21]),
    enUso: txt(f[22]).toLowerCase().startsWith('s'),
    wialon: txt(f[23]),
    tanque1: txt(f[24]),
    tanque2: txt(f[25]),
    tanque3: txt(f[26]),
    capacidadTanque: txt(f[27]),
    tara: txt(f[28]),
    modeloMotor: txt(f[29]),
  };
}

export function usePlacas() {
  return useQuery({
    queryKey: ['placas'],
    queryFn: async () => {
      const r = await api<{ data?: unknown[][] }>('/script/obtenerDatosPlacas', { method: 'POST', body: { args: [] } });
      return (r.data ?? []).map(desdeFila).filter(p => p.placa).sort((a, b) => a.placa.localeCompare(b.placa));
    },
  });
}

// ─── Escritura (mismos endpoints y reglas que la versión actual) ───────────────

/** Métrica de mantenimiento de cada placa (km u horas). Se conserva al editar. */
export function useMetricas() {
  return useQuery({
    queryKey: ['placas', 'metricas'],
    queryFn: async () => {
      const filas = await api<Array<{ placa: string; metrica?: string }>>('/config-metrica');
      return new Map(filas.map(f => [String(f.placa).toUpperCase(), f.metrica === 'horas' ? 'horas' : 'km']));
    },
  });
}

/** Columnas que reemplaza PUT /api/placas/:placa (server.js) — se envían todas */
function columnas(p: Placa, metrica: string) {
  return {
    cliente: p.cliente, ruc_dni: p.ruc, marca: p.marca, modelo_uts: p.modelo, tipo: p.tipo, sub_tipo: p.subTipo,
    color: p.color, nro_motor: p.nroMotor, modelo_motor: p.modeloMotor, nro_caja: p.nroCaja, nro_corona: p.nroCorona,
    nro_vin: p.vin, configuracion: p.configuracion, tanque_1: p.tanque1, tanque_2: p.tanque2, tanque_3: p.tanque3,
    capacidad_tanque: p.capacidadTanque, anio: p.anio, combustible: p.combustible, tara: p.tara,
    carga_util: p.cargaUtil, peso_neto: p.pesoNeto, peso_bruto: p.pesoBruto, estado: p.estado, uts: p.uts,
    motora: p.motora ? 'Motora' : 'No Motora', llantas: p.llantas, en_uso: p.enUso ? 'Si' : 'No',
    metrica, wialon_name: p.wialon,
  };
}

/** Editar: el servidor registra en placa_auditoria cada campo que cambió y devuelve cuántos */
export async function actualizarPlaca(p: Placa, metrica: string) {
  return api<{ ok: boolean; cambios: number }>(`/placas/${encodeURIComponent(p.placa)}`, {
    method: 'PUT',
    body: { ...columnas(p, metrica), usuario_autor: localStorage.getItem('fleet_user') || '' },
  });
}

/** Crear: guardarPlaca hace "insertar o actualizar"; la pantalla impide antes las placas repetidas */
export async function crearPlaca(p: Placa) {
  const c = columnas(p, 'km');
  const form: Record<string, string> = {
    p_placa: p.placa, p_cliente: c.cliente, p_ruc: c.ruc_dni, p_marca: c.marca, p_modelo: c.modelo_uts, p_tipo: c.tipo,
    p_sub_tipo: c.sub_tipo, p_color: c.color, p_nro_motor: c.nro_motor, p_modelo_motor: c.modelo_motor,
    p_nro_caja: c.nro_caja, p_nro_corona: c.nro_corona, p_nro_vin: c.nro_vin, p_conf: c.configuracion,
    p_tanque_1: c.tanque_1, p_tanque_2: c.tanque_2, p_tanque_3: c.tanque_3, p_capacidad_tanque: c.capacidad_tanque,
    p_anio: c.anio, p_comb: c.combustible, p_tara: c.tara, p_carga_util: c.carga_util, p_peso_neto: c.peso_neto,
    p_peso_bruto: c.peso_bruto, p_estado: c.estado, p_uts: c.uts, p_motora: c.motora, p_llantas: c.llantas,
    p_enuso: c.en_uso, p_wialon_name: c.wialon_name,
  };
  const r = await api<{ data?: string }>('/script/guardarPlaca', {
    method: 'POST',
    body: { args: [form], usuario: localStorage.getItem('fleet_user') || '' },
  });
  if (r.data !== 'Éxito') throw new Error(r.data || 'No se pudo registrar la placa');
}

export interface CambioPlaca { id: number; campo: string; valor_ant: string; valor_nuevo: string; usuario: string; fecha: string }

/** Historial de cambios de la placa (placa_auditoria) */
export function useHistorial(placa: string | null) {
  return useQuery({
    queryKey: ['placas', 'historial', placa],
    enabled: !!placa,
    queryFn: () => api<CambioPlaca[]>(`/placas/${encodeURIComponent(placa!)}/historial`),
  });
}

/** Suma de tanques como la calcula el servidor ('' si no hay tanques) */
export function sumaTanques(t1: string, t2: string, t3: string) {
  const s = (parseFloat(t1) || 0) + (parseFloat(t2) || 0) + (parseFloat(t3) || 0);
  return s > 0 ? String(s % 1 === 0 ? s : s.toFixed(2)) : '';
}

/** Texto sin tildes ni mayúsculas, para buscar */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿La placa coincide con todas las palabras buscadas (en cualquier orden)? */
export function coincide(p: Placa, busqueda: string) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = normalizar([p.placa, p.placa.replace(/-/g, ''), p.cliente, p.marca, p.modelo, p.tipo, p.vin, p.wialon].join(' '));
  // "A5B-891" encuentra "A5B891" y al revés
  return palabras.every(w => texto.includes(w) || texto.includes(w.replace(/-/g, '')));
}

/** Eliminar placas: POST /api/eliminarMasivo (exige permiso de eliminar placas en el servidor) */
export async function eliminarPlacas(placas: string[]) {
  const r = await api<{ data?: string; afectados?: number; error?: string }>('/eliminarMasivo', {
    method: 'POST',
    body: { ids: placas, coleccion: 'Placas' },
  });
  if (r.error) throw new Error(r.error);
  return r.afectados ?? placas.length;
}
