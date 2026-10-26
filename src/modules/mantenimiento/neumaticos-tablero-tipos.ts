// Contratos compartidos de la ficha de placa (pestaña Neumáticos), el tablero de movimientos y la línea de tiempo.
// Los endpoints los implementa routes/neumaticos-ciclo.js (agente backend); el frontend solo consume estos tipos.

// Permisos (src/modules/sistema/permisosCatalogo.ts). El servidor debe comprobarlos en cada endpoint de escritura.
export const PERMISO_VER_NEUMATICOS = 'neumaticos';            // consultar tablero, pestaña, mapa y línea de tiempo
export const PERMISO_MOVER_NEUMATICOS = 'neumaticos.mover';    // instalar y retirar llantas de una unidad
export const PERMISO_REENCAUCHE = 'neumaticos.reencauche';     // enviar llantas a reencauche
export const PERMISO_BAJA = 'neumaticos.baja';                 // dar de baja (desecho / scrap)

/** Una llanta tal como la muestra el tablero */
export interface LlantaTablero {
  codigo: string;
  marca: string | null;
  modelo: string | null;
  medida: string | null;
  vida: number | null;
  estado_ciclo: string;            // nuevo | en_unidad | en_almacen | en_reencauche | desechado
  almacen: string | null;
  placa_actual: string | null;
  posicion_actual: string | null;
  remanente_mm: number | null;     // última medición conocida
  r1?: number | null;              // franjas de la banda de la última medición (mm): R1 arriba, R2 centro, R3 abajo
  r2?: number | null;
  r3?: number | null;
  fecha_montaje: string | null;    // yyyy-mm-dd
  km_montaje: number | null;
  km_recorridos: number | null;
}

/** Una posición del vehículo (la lista la define la configuración de la unidad) */
export interface PosicionTablero {
  posicion: string;                // código de posición, p. ej. "1LDI"
  llanta: LlantaTablero | null;    // null = posición vacía
}

/** GET /neumaticos/tablero/:placa */
export interface TableroPlaca {
  ok: boolean;
  placa: string;
  configuracion: string | null;    // p. ej. "2DD-1L-2L" o "T3"; lo usa el frontend para dibujar el layout
  posiciones: PosicionTablero[];   // montadas en la unidad
  disponibles: LlantaTablero[];    // en almacén utilizable para instalar (Nuevas 100, Reencauche 1142, Reparadas 1144)
  reforma: LlantaTablero[];        // en reencauche
  descarte: LlantaTablero[];       // desechadas o pendientes de descarte
}

/** Un evento de la línea de tiempo de una llanta (tabla neumaticos_movimientos) */
export interface EventoLlanta {
  id: number | string;
  fecha: string;                   // yyyy-mm-dd hh:mm
  tipo: string;                    // INSTALACION | RETIRO | REENCAUCHE | DESECHO | ...
  detalle: string;                 // texto legible
  origen: string | null;
  destino: string | null;
  placa: string | null;
  posicion: string | null;
  km: number | null;
  usuario: string | null;
}

/** GET /neumaticos/linea-tiempo/:codigo */
export interface LineaTiempoLlanta {
  ok: boolean;
  codigo: string;
  eventos: EventoLlanta[];
}

/** Respuesta de error de los endpoints de escritura */
export interface RespuestaMovimiento {
  ok: boolean;
  error?: string;
}
