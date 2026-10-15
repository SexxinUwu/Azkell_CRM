import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Mismos datos que la versión actual (GET/PUT /api/perfil/me). Las imágenes van a S3 por URL firmada
// y se ven con otra URL firmada, porque el bucket es privado.
export interface MiPerfil {
  nombre: string;
  correo: string;
  cargo: string | null;
  telefono: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  firma_digital: string | null;
}

export function useMiPerfil() {
  return useQuery({
    queryKey: ['perfil', 'me'],
    queryFn: () => api<MiPerfil>('/perfil/me'),
    staleTime: 30_000,
  });
}

/** Solo los campos que se envían; el servidor ignora los que no llegan */
export function guardarMiPerfil(cambios: Record<string, string | null>) {
  return api<{ ok: boolean }>('/perfil/me', { method: 'PUT', body: cambios });
}

const LADO_FOTO = 512;      // la foto se ve en círculos pequeños
const LADO_PORTADA = 1600;  // la portada ocupa el ancho del celular o del escritorio
const TIEMPO_MAX_SUBIDA_MS = 60_000;

/**
 * Reduce la imagen antes de subirla. Una foto de celular pesa 3–8 MB; a estos tamaños queda en
 * 50–300 KB, así la subida no se queda pensando en una conexión normal.
 */
async function reducirImagen(archivo: File, ladoMax: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.');
  }
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.fillStyle = '#fff'; // los PNG transparentes no quedan negros al pasar a JPG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((ok, mal) => canvas.toBlob(
    b => (b ? ok(b) : mal(new Error('No se pudo preparar la imagen.'))), 'image/jpeg', 0.85));
}

/** PUT del archivo a S3 con progreso y tiempo límite (fetch no informa el avance de la subida) */
function subirAS3(url: string, cuerpo: Blob, tipo: string, alProgreso: (porcentaje: number) => void) {
  return new Promise<void>((ok, mal) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', tipo);
    xhr.timeout = TIEMPO_MAX_SUBIDA_MS;
    xhr.upload.onprogress = e => { if (e.lengthComputable) alProgreso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? ok()
      : mal(new Error(`No se pudo guardar la imagen (código ${xhr.status}).`)));
    xhr.onerror = () => mal(new Error('Sin conexión con el almacenamiento. Revisa tu internet e intenta de nuevo.'));
    xhr.ontimeout = () => mal(new Error('La subida tardó demasiado. Intenta de nuevo.'));
    xhr.send(cuerpo);
  });
}

/** Reduce, sube a S3 y devuelve la URL para guardarla en el perfil (avatar_url o banner_url) */
export async function subirImagenPerfil(archivo: File, tipo: 'foto' | 'portada', alProgreso: (porcentaje: number) => void): Promise<string> {
  const cuerpo = await reducirImagen(archivo, tipo === 'foto' ? LADO_FOTO : LADO_PORTADA);
  const r = await api<{ uploadUrl: string; fileUrl: string }>('/perfil/imagen-upload-url?contentType=image/jpeg');
  await subirAS3(r.uploadUrl, cuerpo, 'image/jpeg', alProgreso);
  return r.fileUrl;
}

/** URL firmada (1 h) para mostrar una foto o portada guardada */
export function useImagenPerfil(url: string | null | undefined) {
  return useQuery({
    queryKey: ['perfil', 'imagen', url],
    enabled: !!url,
    queryFn: () => api<{ url: string }>('/perfil/imagen-lectura', { method: 'POST', body: { url } }).then(r => r.url),
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
  });
}
