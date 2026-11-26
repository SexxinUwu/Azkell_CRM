/**
 * Comunicación con el agente de etiquetas (agente-etiquetas/agente.js), que corre en la PC con la etiquetadora USB.
 * El navegador no puede hablarle a la impresora; le manda la etiqueta al agente y este la pasa por USB.
 */
const AGENTE = 'http://127.0.0.1:9101';

export type EstadoEtiquetadora = 'lista' | 'sin-impresora' | 'sin-agente';

/** ¿Hay agente en esta PC y la etiquetadora está encendida y conectada? */
export async function estadoEtiquetadora(): Promise<EstadoEtiquetadora> {
  try {
    const r = await fetch(`${AGENTE}/estado`, { signal: AbortSignal.timeout(6000) });
    const j = (await r.json()) as { impresora?: boolean };
    return j.impresora ? 'lista' : 'sin-impresora';
  } catch {
    return 'sin-agente';
  }
}

/** Manda el ZPL a la etiquetadora. Lanza un error con el motivo si no se pudo. */
export async function imprimirZpl(zpl: string): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${AGENTE}/imprimir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zpl }), signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error('No se encontró el programa de la etiquetadora en esta PC.');
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo imprimir la etiqueta.');
}
