// Lista de puntos por defecto: copia exacta de DEFAULT_INSP_SCHEMA (modulos/mantenimiento/inspecciones/logica.js).
// Se usa solo si la empresa no configuró la suya (GET /api/mantenimiento/inspecciones/config).
import type { Seccion } from './registro';

export const ESQUEMA_POR_DEFECTO: Seccion[] = [
  {
    titulo: "LLANTA",
    items: [
      {
        label: "Cortes o Averías",
        tipo: "okfalla"
      },
      {
        label: "PSI del Neumático",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "MOTOR",
    items: [
      {
        label: "Niveles de Motor",
        tipo: "okfalla"
      },
      {
        label: "Sistema de Lubricación Fugas",
        tipo: "okfalla"
      },
      {
        label: "Sistema de Combustible",
        tipo: "okfalla"
      },
      {
        label: "Sistema de Refrigeración",
        tipo: "okfalla"
      },
      {
        label: "Correas, Ventilador y Accesorios",
        tipo: "okfalla"
      },
      {
        label: "Código de Falla",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "SISTEMA ELECTRICO",
    items: [
      {
        label: "Sistema Eléctrico General",
        tipo: "okfalla"
      },
      {
        label: "Estado de Bateria",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "SISTEMA DE AIRE",
    items: [
      {
        label: "Inspección General de Aire",
        tipo: "okfalla"
      },
      {
        label: "Mantenimiento de Válvulas",
        tipo: "okfalla"
      },
      {
        label: "Inspección de Manitos de Aire",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "TRANSMISION",
    items: [
      {
        label: "Embrague",
        tipo: "okfalla"
      },
      {
        label: "Caja de Cambio",
        tipo: "okfalla"
      },
      {
        label: "Diferencial",
        tipo: "okfalla"
      },
      {
        label: "Cardanes",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "DIRECCION",
    items: [
      {
        label: "Servo Dirección",
        tipo: "okfalla"
      },
      {
        label: "Alineamiento",
        tipo: "okfalla"
      },
      {
        label: "Pines, Bocinas y Terminales",
        tipo: "okfalla"
      },
      {
        label: "Caja de Dirección",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "FRENOS",
    items: [
      {
        label: "Limpieza y Regulación",
        tipo: "okfalla"
      },
      {
        label: "Zapatas Delanteras o Pastillas Delanteras",
        tipo: "percent"
      },
      {
        label: "Zapatas Tracción o 1er Eje Tracciona",
        tipo: "percent"
      },
      {
        label: "Zapatas Eje Loca o 2do Eje Tracciona",
        tipo: "percent"
      },
      {
        label: "Disco de Embrague",
        tipo: "percent"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "SUSPENSION",
    items: [
      {
        label: "Muelles o Bolsas de Aire",
        tipo: "okfalla"
      },
      {
        label: "Amortiguadores",
        tipo: "okfalla"
      },
      {
        label: "Eje de Barra Estabilizadora",
        tipo: "okfalla"
      },
      {
        label: "Otros",
        tipo: "okfalla"
      }
    ]
  },
  {
    titulo: "HERMETIZADO",
    items: [
      {
        label: "Cabina Exterior e Interior",
        tipo: "okfalla"
      },
      {
        label: "Puerta, Chapas y Asientos",
        tipo: "okfalla"
      },
      {
        label: "Chasis, Tornamesa y Bastidor",
        tipo: "okfalla"
      },
      {
        label: "Furgón (Estructura Laterales)",
        tipo: "okfalla"
      },
      {
        label: "Lavado y Limpieza Interior de ThermoKing",
        tipo: "okfalla"
      }
    ]
  }
];
