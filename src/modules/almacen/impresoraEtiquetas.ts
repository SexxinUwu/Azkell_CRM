/**
 * Etiquetas por la etiquetadora del almacén. El navegador manda la etiqueta al servidor y la PC del almacén (la que tiene la etiquetadora
 * conectada por USB, con el programa agente-etiquetas) la recoge y la imprime. Funciona desde cualquier equipo con acceso al sistema.
 */
import { api, errorMessage } from '../../core/api/client';

export type EstadoEtiquetadora = 'lista' | 'sin-agente' | 'error';

/** ¿La PC del almacén está conectada y atendiendo la etiquetadora? */
export async function estadoEtiquetadora(): Promise<EstadoEtiquetadora> {
  try {
    const r = await api<{ agente?: boolean }>('/almacen/inventario/etiquetas/estado');
    return r.agente ? 'lista' : 'sin-agente';
  } catch {
    return 'error';
  }
}

interface Trabajo { ok?: boolean; estado?: 'pendiente' | 'enviado' | 'impreso' | 'error'; error?: string }

/** Manda el ZPL a la cola y espera a que la etiquetadora lo imprima. Lanza un error con el motivo si no se pudo. */
export async function imprimirZpl(zpl: string): Promise<void> {
  let id = '';
  try {
    const r = await api<{ id: string }>('/almacen/inventario/etiquetas/imprimir', { method: 'POST', body: { zpl } });
    id = r.id;
  } catch (e) {
    throw new Error(errorMessage(e));
  }
  const limite = Date.now() + 25000;
  while (Date.now() < limite) {
    await new Promise(r => setTimeout(r, 1000));
    let t: Trabajo;
    try { t = await api<Trabajo>(`/almacen/inventario/etiquetas/trabajo/${encodeURIComponent(id)}`); } catch { continue; }
    if (t.estado === 'impreso') return;
    if (t.estado === 'error') throw new Error(t.error || 'No se pudo imprimir la etiqueta.');
  }
  throw new Error('La etiquetadora tarda en responder. Revisa que esté encendida y con papel.');
}
