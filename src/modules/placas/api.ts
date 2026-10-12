// Placas: datos de la versión actual (POST /api/script/obtenerDatosPlacas, routes/legacy.js),
// que devuelve cada placa como una fila de 30 posiciones. Aquí se convierte a un objeto con nombres.
// Cuando el servidor nuevo tenga /api/v2/placas (Prisma), solo cambia este archivo.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

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
    tipo: txt(f[5]),
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
