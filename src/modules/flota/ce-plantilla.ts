// Plantilla del inventario de partes del Checklist de Entrega de Vehículos.
// Es corporativa: vive en el servidor (GET/PUT /flota/entrega-vehiculos/plantilla) y la comparten el clásico y la app nueva.
// PLANTILLA_FABRICA es copia exacta de GRUPOS_SISTEMAS_DEFAULT de modulos/flota/entrega-vehiculos/logica.js.
// Aquí también viven los helpers que leen el inventario de un acta (mismo formato que guarda el clásico).

import { api } from '../../core/api/client';
import type { CategoriaPlantilla, EntregaVehiculo } from './ce-tipos';

const RUTA = '/flota/entrega-vehiculos/plantilla';

export const PLANTILLA_FABRICA: CategoriaPlantilla[] = [
  { id: 'frente_exterior', titulo: 'Frente Exterior', items: ['Emblemas', 'Persianas', 'Defensa Delantera', 'Luz Chica', 'Unidades', 'Direccionales'] },
  { id: 'interior_motor', titulo: 'Interior del Motor', items: ['Batería Marca', 'Tapa Radiador', 'Tapa Aceite', 'Varilla Medidora de Aceite', 'Correas de Ventilador', 'Corneta', 'Sirenas'] },
  { id: 'frente_superior', titulo: 'Frente Superior', items: ['Vidrio Panorámico', 'Brazos Limpia Brisas', 'Cuchillas Limpia Brisas', 'Antena Radio'] },
  { id: 'costado_izquierdo', titulo: 'Costado Izquierdo', items: ['Vidrios Laterales', 'Manija', 'Cerraduras', 'Copas Ruedas'] },
  { id: 'estribos', titulo: 'Estribos', items: ['Estribo Derecho', 'Estribo Izquierdo'] },
  { id: 'costado_trasero', titulo: 'Costado Trasero', items: ['Emblemas', 'Defensa Trasera', 'Steps Frenos', 'Luces de Parqueo', 'Freno Auxiliar'] },
  { id: 'direccionales_luces', titulo: 'Direccionales y Luces', items: ['Direccionales', 'Reversos', 'Vidrios Traseros', 'Tapa Tanque Combustible'] },
  { id: 'costado_derecho', titulo: 'Costado Derecho', items: ['Vidrios Laterales', 'Manijas', 'Cerraduras', 'Copas Ruedas'] },
  { id: 'llaves', titulo: 'Llaves', items: ['Puertas', 'Ignición', 'Baúl'] },
  { id: 'interior_vehiculo', titulo: 'Interior del Vehículo (Cabina)', items: ['Consola', 'Autoradio', 'Guantera', 'Seguro Puerta', 'Manija Puerta', 'Manija Vidrio', 'Luz Interior', 'Cojinería', 'Forros', 'Tapetes', 'Cenicero', 'Descansabrazos', 'Descansacabezas', 'Radio Teléfono', 'Intercomunicador', 'Espejo Retrovisor'] },
  { id: 'tablero_controles', titulo: 'Tablero de Controles e Instrumentos', items: ['Switch Ignición', 'Interruptor Luces Delanteras', 'Interruptor Luces Parqueo', 'Direccionales', 'Claxon', 'Sirena', 'Calefacción', 'Tacómetro', 'Encendedor Cigarrillos', 'Velocímetro', 'Medidor de Combustible', 'Medidor de Temperatura', 'Medidor de Aceite'] },
  { id: 'herramientas', titulo: 'Herramientas', items: ['Gata', 'Llave de Ruedas', 'Cable de Corriente', 'Palancas', 'Destornillador', 'Desarmador Mixto', 'Llaves Fijas', 'Alicate', 'Linterna (Pilas o Conexión)', 'Kit de Herramientas', 'Llave Allen para Semirremolque', 'Llave Allen para Doble Nivel', 'Pernos de Seguridad'] },
  { id: 'seguridad_emergencia', titulo: 'Señales de Advertencia y Seguridad', items: ['Triángulos', 'Lámparas de Luz Intermitente', 'Tacos para Bloquear Vehículo', 'Extintor (Expira)', 'Conos', 'Bonificación Vehicular', 'Mando'] },
];

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type CategoriaCruda = { id?: string; titulo?: string; title?: string; items?: Array<string | { label?: string; texto?: string }> };

/** Normaliza lo que llega del servidor a la forma del contrato. Devuelve null si no hay categorías. */
function normalizar(datos: unknown): CategoriaPlantilla[] | null {
  if (!Array.isArray(datos) || !datos.length) return null;
  return (datos as CategoriaCruda[]).map((g, i) => ({
    id: g.id || `cat_${i}`,
    titulo: g.titulo || g.title || '',
    items: (g.items ?? []).map(it => (typeof it === 'string' ? it : it.label || it.texto || '')),
  }));
}

/**
 * Plantilla vigente de la empresa. Si el servidor no tiene una guardada, devuelve la de fábrica.
 * Devuelve null si no se pudo leer el servidor: el editor no debe guardar sobre una copia desconocida.
 */
export async function cargarPlantilla(): Promise<CategoriaPlantilla[] | null> {
  try {
    const r = await api<{ plantilla: unknown }>(RUTA);
    return normalizar(r.plantilla) ?? copia(PLANTILLA_FABRICA);
  } catch (err) {
    console.warn('No se pudo leer la plantilla de entrega de vehículos', err);
    return null;
  }
}

/** Guarda la plantilla para toda la empresa. Con null vuelve a la de fábrica (el servidor borra la personalizada). */
export async function guardarPlantilla(lista: CategoriaPlantilla[] | null): Promise<void> {
  const plantilla = lista === null
    ? null
    : lista.map(g => ({ id: g.id, titulo: g.titulo, items: g.items }));
  await api(RUTA, { method: 'PUT', body: { plantilla } });
}

// ── Inventario de un acta ────────────────────────────────────────────────────
// El clásico guarda cada ítem por su texto en minúsculas con guiones bajos ("Batería Marca" → "bateria_marca"),
// con valor 'B' (bueno), 'R' (regular) o 'M' (malo). Un ítem sin calificar cuenta como bueno.

export type Calificacion = 'B' | 'R' | 'M';

export const ETIQUETA_CALIFICACION: Record<Calificacion, string> = { B: 'Bueno', R: 'Regular', M: 'Malo' };

/** Clave de un ítem dentro de inventario_partes_json (igual que el clásico) */
export const claveItem = (texto: string) => texto.toLowerCase().replace(/[^a-z0-9]/g, '_');

/** Lee inventario_partes_json, venga como texto o como objeto */
export function leerPartes(raw: EntregaVehiculo['inventario_partes_json']): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch { return {}; }
  }
  return raw as Record<string, unknown>;
}

/** Estado y cantidad de un ítem del acta. Busca la clave del clásico y, si no existe, "categoria|item". */
export function calificacionDe(
  partes: Record<string, unknown>,
  categoria: CategoriaPlantilla,
  item: string,
): { estado: Calificacion | null; cantidad: number } {
  const crudo = partes[claveItem(item)] ?? partes[`${categoria.id}|${item}`];
  let estado: unknown = crudo;
  let cantidad: unknown = 1;
  if (crudo && typeof crudo === 'object') {
    const obj = crudo as { estado?: unknown; cantidad?: unknown };
    estado = obj.estado;
    cantidad = obj.cantidad ?? 1;
  }
  const letra = typeof estado === 'string' ? estado.toUpperCase().trim() : '';
  const n = Number(cantidad);
  return {
    estado: letra === 'R' || letra === 'M' || letra === 'B' ? letra : null,
    cantidad: Number.isFinite(n) && n > 0 ? n : 1,
  };
}
