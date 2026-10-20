// Plantilla del inventario de entrega de vehículos.
// Igual que el clásico (modulos/flota/entrega-vehiculos/logica.js), se guarda en el navegador con la misma
// clave (`ev_global_template_flota`); el servidor no tiene endpoint para esta plantilla
// (/seguridad/template es la del checklist de Garita, otro formato).

export interface GrupoInventario { id: string; titulo: string; items: string[] }

const CLAVE = 'ev_global_template_flota';
const CLAVE_ANTIGUA = 'ev_global_template';

export const GRUPOS_INVENTARIO: GrupoInventario[] = [
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

/** Plantilla guardada en este navegador, o la de fábrica. Acepta ítems como texto o como { label | texto } */
export function leerPlantillaEntrega(): GrupoInventario[] {
  try {
    const guardada = localStorage.getItem(CLAVE) || localStorage.getItem(CLAVE_ANTIGUA);
    if (guardada) {
      const datos = JSON.parse(guardada) as Array<{ id?: string; titulo?: string; title?: string; items?: Array<string | { label?: string; texto?: string }> }>;
      if (Array.isArray(datos) && datos.length) {
        return datos.map((g, i) => ({
          id: g.id || `cat_${i}`,
          titulo: g.titulo || g.title || '',
          items: (g.items ?? []).map(it => (typeof it === 'string' ? it : it.label || it.texto || '')),
        }));
      }
    }
  } catch { /* se usa la de fábrica */ }
  return copia(GRUPOS_INVENTARIO);
}

export function guardarPlantillaEntrega(grupos: GrupoInventario[]) {
  localStorage.setItem(CLAVE, JSON.stringify(grupos));
}
