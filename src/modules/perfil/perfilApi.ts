import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Mismos endpoints que la versión actual: GET/PUT /api/perfil/me. Las imágenes van a S3 con URL firmada.
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

/** Sube una imagen a S3 con URL firmada y devuelve la URL final para guardarla en el perfil */
export async function subirImagenPerfil(archivo: File): Promise<string> {
  const tipo = archivo.type || 'image/jpeg';
  const r = await api<{ uploadUrl: string; fileUrl: string }>(
    `/documentos-flota/upload-url?filename=${encodeURIComponent(archivo.name)}&contentType=${encodeURIComponent(tipo)}`);
  const put = await fetch(r.uploadUrl, { method: 'PUT', body: archivo, headers: { 'Content-Type': tipo } });
  if (!put.ok) throw new Error('No se pudo subir la imagen. Intenta de nuevo.');
  return r.fileUrl;
}
