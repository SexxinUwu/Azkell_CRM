// Reporte F-MAN-006 de mantenimientos preventivos: la pantalla arma las filas visibles y el servidor (services/fleetrun_reporte.js)
// lo convierte a PDF con Chromium, con el mismo formato del clásico. También sirve para mandarlo por WhatsApp.
import { apiFetch } from '../../core/api/client';
import { pestanaConCamion } from '../../core/ui/CargaCamion';

/** Fila del reporte, tal como la espera el servidor */
export interface FilaReporte {
  placa: string;
  cliente: string;
  clase: string;
  marca: string;
  uts: string;
  tipo: string;
  fecha: string;
  kmCambio: number;
  kmGps: number;
  kmProx: number;
  frecuencia: number;
  obs: string;
  ubicacion: string;
  esHoras: boolean;
  umbral: number;
  ultimoCambio: string;
}

/**
 * Tipo de mantenimiento para mostrar: mayúscula al inicio y el resto en minúscula ("Faja de alternador").
 * Las siglas con número, como MP1, se quedan en mayúscula. Los datos siguen guardados en mayúscula.
 */
export function tipoOracion(t: string): string {
  const s = t.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s+,/g, ',');
  if (!s) return '';
  const palabras = s.split(' ').map(p => (/^[a-z]{1,3}\d+$/.test(p) ? p.toUpperCase() : p));
  const unido = palabras.join(' ');
  return unido.charAt(0).toUpperCase() + unido.slice(1);
}

/** Logo de la empresa como data URL (el servidor lo incrusta en el PDF); null si no hay logo */
async function logoComoDataUrl(): Promise<string | null> {
  try {
    const res = await apiFetch('/tenant-logo');
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result));
      lector.onerror = () => rechazar(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Pide el PDF del reporte al servidor (Chromium) */
export async function pedirReportePreventivo(filas: FilaReporte[], empresa: string, emisor: string): Promise<Blob> {
  const logo = await logoComoDataUrl();
  const res = await apiFetch('/taller/fleetrun-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filas, empresa, emisor, logo }),
  });
  if (!res.ok) throw new Error('No se pudo generar el PDF del reporte');
  return res.blob();
}

/**
 * PDF en otra pestaña (visor de PDF del navegador), igual que la orden de trabajo: la pestaña se abre al tocar
 * el botón con un aviso mientras se genera, y al llegar el PDF se muestra en el visor.
 */
export async function abrirPdfEnVisor(generar: () => Promise<Blob>, nombre: string): Promise<void> {
  const win = window.open('', '_blank');
  pestanaConCamion(win);
  try {
    const url = URL.createObjectURL(await generar());
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

/** Nombre del archivo: Mantenimiento-preventivo-AAAA-MM-DD.pdf (fecha de Lima) */
export function nombreReportePreventivo(): string {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `Mantenimiento-preventivo-${fecha}.pdf`;
}
