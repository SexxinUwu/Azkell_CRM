import { apiFetch } from '../api/client';

// Logo de la empresa del subdominio (GET /api/tenant-logo) como data URL en window._LOGO_BASE64.
// Los documentos imprimibles (OT, rampa, status de unidades, actas) lo leen de ahí. Si no hay logo
// la cabecera queda sin imagen: nunca se usa el de otra empresa.
let cache: Promise<string> | null = null;

export async function cargarLogoEmpresa(): Promise<string> {
  cache ??= (async () => {
    try {
      const res = await apiFetch('/tenant-logo');
      if (!res.ok) return '';
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return '';
      return await new Promise<string>((ok, mal) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => mal(l.error); l.readAsDataURL(blob); });
    } catch { return ''; }
  })();
  const logo = await cache;
  if (!logo) cache = null;
  else (window as unknown as { _LOGO_BASE64?: string })._LOGO_BASE64 = logo;
  return logo;
}
