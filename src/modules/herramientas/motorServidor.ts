// Conversiones que se hacen en el servidor de Azkell (LibreOffice y Chromium): Word, PowerPoint y Excel ↔ PDF, y HTML → PDF.
// El archivo viaja solo a nuestro servidor, se convierte y se borra al terminar. No pasa por ningún tercero.
import { apiFetch } from '../../core/api/client';
import type { Salida } from './motorPdf';

export type DestinoServidor = 'pdf' | 'docx' | 'pptx' | 'pdf-html';

export interface EstadoConversiones { libreoffice: boolean; chromium: boolean; destinos: string[] }

/** Qué conversiones tiene disponibles este servidor (null si no se pudo consultar) */
export async function estadoConversiones(): Promise<EstadoConversiones | null> {
  try {
    const r = await apiFetch('/herramientas/estado');
    if (!r.ok) return null;
    const j = await r.json() as { ok?: boolean } & Partial<EstadoConversiones>;
    return j.ok ? { libreoffice: !!j.libreoffice, chromium: !!j.chromium, destinos: j.destinos ?? [] } : null;
  } catch { return null; }
}

const sinExt = (n: string) => n.replace(/\.[^.]+$/, '');

export async function convertirEnServidor(f: File, destino: DestinoServidor): Promise<Salida> {
  const fd = new FormData();
  fd.append('destino', destino);
  fd.append('archivo', f);
  const r = await apiFetch('/herramientas/convertir', { method: 'POST', body: fd });
  if (!r.ok) {
    const j = await r.json().catch(() => null) as { error?: string } | null;
    throw new Error(j?.error ?? `No se pudo convertir el archivo (error ${r.status}).`);
  }
  const ext = r.headers.get('x-azkell-extension') ?? (destino === 'pdf' || destino === 'pdf-html' ? 'pdf' : destino);
  const blob = await r.blob();
  return { nombre: `${sinExt(f.name)}.${ext}`, blob };
}
