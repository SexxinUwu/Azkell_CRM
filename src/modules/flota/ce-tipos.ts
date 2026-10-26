// Tipos compartidos del Checklist de Entrega de Vehículos (acta de entrega y recepción de unidades).
// Modelo tomado de modulos/flota/entrega-vehiculos/logica.js (evGuardarFormulario y evCargarRegistroEnFormulario).
// Los campos se confirman contra el clásico; si hace falta uno nuevo, se agrega aquí como opcional.

/** Un ítem de la plantilla de inspección: nombre y estado marcado en el acta */
export interface CategoriaPlantilla {
  id: string;
  titulo: string;
  items: string[];
}

/** Estado de un ítem del checklist. El valor exacto lo confirma el clásico (evSetItemState). */
export type EstadoItem = string;

/** Inventario de partes tal como lo guarda el clásico: clave plana (texto en minúsculas con _) → estado B / R / M */
export type InventarioPartes = Record<string, EstadoItem>;

/** Acta de entrega tal como la devuelve /seguridad/entrega-vehiculos */
export interface EntregaVehiculo {
  id: number | string;
  numero_inventario: string;
  fecha: string;
  motivo: string;
  quien_entrega: string;
  quien_recibe: string;
  clase: string;
  marca: string;
  tipo: string;
  modelo: string;
  placa: string;
  color: string;
  cilindros: string;
  numero_motor: string;
  numero_serie: string;
  kilometraje: number;
  configuracion: string;
  estilo_cabina: 'chata' | 'trompa';
  estilo_carroceria?: 'furgon' | 'plataforma';
  inventario_partes_json: InventarioPartes | string | null;
  observaciones: string;
  empresa?: string;
  firma_entrega?: string | null;
  firma_recibe?: string | null;
  created_at?: string;
  [campo: string]: unknown;
}

/** Respuesta de GET /seguridad/entrega-vehiculos/stats (cifras del portal y del listado) */
export interface EstadisticasEntrega {
  global: { total_flota: number; total_actas: number; hoy: number };
  empresas: Array<{ empresa: string; total_flota: number; total_actas: number; hoy: number; vehiculos: number }>;
}
