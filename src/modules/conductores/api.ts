// Conductores: endpoints de la versión actual (mismas reglas).
//   GET    /api/conductores                 → lista
//   POST   /api/script/guardarConductor     → crear o editar (idConductor presente = editar)
//   DELETE /api/conductores/:id             → eliminar
//   POST   /api/conductores/importarMasivo  → importar (solo inserta)
//   GET    /api/proxy/documento?tipo=DNI    → nombre desde RENIEC
//   GET    /api/almacen/clientes-placas     → empresas (clientes y dueños de placas)
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface Conductor {
  id: number;
  nombre: string;
  empresa: string;
  telefono: string;
  dni: string;
  licencia: string;
  estado: string;
  foto: string;
}

const txt = (v: unknown) => (v == null ? '' : String(v).trim());

export function useConductores() {
  return useQuery({
    queryKey: ['conductores'],
    queryFn: async () => {
      const filas = await api<Array<Record<string, unknown>>>('/conductores');
      return filas.map(f => ({
        id: Number(f.idConductor),
        nombre: txt(f.nombre),
        empresa: txt(f.empresa),
        telefono: txt(f.telefono),
        dni: txt(f.dni),
        licencia: txt(f.licencia),
        estado: txt(f.estado) || 'Activo',
        foto: txt(f.foto),
      })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
  });
}

/** Empresas para elegir (si no hay permiso de verlas, se usan las de los conductores) */
export function useEmpresas() {
  return useQuery({
    queryKey: ['conductores', 'empresas'],
    queryFn: () => api<string[]>('/almacen/clientes-placas').catch(() => [] as string[]),
    staleTime: 5 * 60_000,
  });
}

export async function guardarConductor(c: Conductor, fotoNueva?: string) {
  const r = await api<{ data?: string }>('/script/guardarConductor', {
    method: 'POST',
    body: {
      args: [{
        idConductor: c.id || '',
        c_nombre: c.nombre, c_empresa: c.empresa, c_telefono: c.telefono, c_dni: c.dni,
        c_licencia: c.licencia, c_estado: c.estado,
        // Solo si hay foto nueva: el servidor conserva la anterior cuando llega vacía
        c_foto_base64: fotoNueva ?? '',
      }],
    },
  });
  if (r.data !== 'Éxito') throw new Error(r.data || 'No se pudo guardar');
}

export async function eliminarConductor(id: number) {
  await api(`/conductores/${id}`, { method: 'DELETE' });
}

/** Nombre completo desde RENIEC ('' si no se encuentra) */
export async function nombrePorDni(dni: string) {
  const r = await api<{ nombre?: string }>('/proxy/documento', { query: { tipo: 'DNI', numero: dni } });
  return (r.nombre ?? '').trim().toUpperCase();
}

/**
 * Reduce la foto antes de enviarla: la columna `foto` es TEXT (≈64 KB) y una foto de celular
 * no entra. Cuadrada, 320 px, JPEG; baja la calidad hasta que quepa holgada.
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
    const lado = 320;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d')!;
    const corte = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - corte) / 2, (img.naturalHeight - corte) / 2, corte, corte, 0, 0, lado, lado);
    for (const calidad of [0.82, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', calidad);
      if (dataUrl.length < 55_000) return dataUrl;
    }
    throw new Error('La foto es demasiado pesada incluso reducida. Prueba con otra.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function coincide(c: Conductor, busqueda: string) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = normalizar([c.nombre, c.dni, c.licencia, c.empresa, c.telefono.replace(/\D/g, '')].join(' '));
  return palabras.every(w => texto.includes(w));
}

/** Teléfono para WhatsApp (51 + 9 dígitos) o null */
export function whatsapp(telefono: string) {
  const d = telefono.replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  return /^9\d{8}$/.test(local) ? `51${local}` : null;
}
