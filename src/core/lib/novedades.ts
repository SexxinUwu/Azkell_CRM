/**
 * Novedades que ven las personas después de actualizar. Texto escrito a mano, en lenguaje de todos los días.
 * Cada publicación es UNA entrada con varias páginas (así se lee de a poco): se agrega ARRIBA (la más nueva primero) con un `id` nuevo.
 * Se muestran en la ventana «Qué hay de nuevo» (una sola vez por persona) y quedan para siempre en la pantalla Novedades del menú.
 * Los cambios internos (correcciones, velocidad) no se anotan.
 */
export interface PaginaNovedad {
  titulo: string;
  puntos: string[];
}

export interface Novedad {
  /** Identificador único; la fecha de publicación sirve (si hay dos el mismo día, agrega -2) */
  id: string;
  fecha: string;
  titulo: string;
  paginas: PaginaNovedad[];
}

export const NOVEDADES: Novedad[] = [
  {
    id: '2026-11-18',
    fecha: '18 de noviembre de 2026',
    titulo: 'Solicitudes, caja, combustible, rentabilidad y facturación',
    paginas: [
      {
        titulo: 'Solicitudes, clientes y personal',
        puntos: [
          'Nuevo módulo «Solicitudes»: pide que se agregue un proveedor, un cliente o una cuenta bancaria. Gerencia aprueba y todo queda en el historial. Cada persona ve solo las suyas y puede cancelarlas indicando el motivo.',
          'Al escribir un RUC o un DNI, los datos se completan solos desde SUNAT o RENIEC.',
          '«Terceros» junta clientes y proveedores en un solo lugar.',
          'RRHH › Personal es el único sitio para dar de alta al personal. El Directorio queda solo para consultar, con el diseño de Contactos.',
        ],
      },
      {
        titulo: 'Caja, pagos y movimientos',
        puntos: [
          'Caja y Aprobación de caja ahora se ven igual que las órdenes de compra, con el número de caja de 5 dígitos.',
          'Nuevo formulario de caja, con los mismos datos y el mismo orden que la orden de compra.',
          'Al procesar un pago, las cuentas de origen y de destino se ven completas y se pueden copiar con un toque. Si falta la cuenta del destinatario, el sistema avisa y no deja pagar.',
          'Pago de requerimientos y Movimientos muestran el folio de la caja y el origen correcto.',
          'Las columnas de las tablas se ajustan al tamaño del texto.',
        ],
      },
      {
        titulo: 'Combustible y viajes',
        puntos: [
          'El vale de combustible se registra dentro del viaje: eliges el servicio (ida o regreso), la estación de servicio donde se cargó y el tipo de recarga (ida, vuelta o fin de servicio).',
          'En la tabla de vales verás la placa con su diseño, el combustible y la recarga, y al final el comprobante y el voucher. Al tocar el código se abre el detalle del vale.',
          'La liquidación del viaje se muestra en tabla, y el vale de combustible ya no se cuenta como viático depositado al conductor.',
          'Yoguitransport y Rosymar usan el mismo proceso que Trahesa: Programación, Órdenes de viaje, Órdenes de servicio y vales dentro del viaje.',
          'El análisis de combustible, la matriz y la urea leen también los vales que se registran dentro del viaje.',
        ],
      },
      {
        titulo: 'Rentabilidad y facturación',
        puntos: [
          'Operaciones › Rentabilidad: lo que deja cada servicio, con el ingreso sin IGV menos el combustible, los gastos del viaje y el costo del tercero. Solo lo ve quien tenga el permiso.',
          'Operaciones › Facturación: elige los servicios de un cliente y emite factura, boleta o nota de crédito a SUNAT, con detracción y crédito. El RUC y la dirección del cliente se completan solos. Por ahora funciona en modo prueba.',
          'La cuenta de detracciones del Banco de la Nación se registra en Tesorería › Bancos.',
          'Sistema › Integraciones se renovó: Wialon y APISUNAT aparecen plegados y se abren al tocarlos.',
        ],
      },
    ],
  },
  {
    id: '2026-11-11',
    fecha: '11 de noviembre de 2026',
    titulo: 'Proveedores con varios contactos',
    paginas: [
      {
        titulo: 'Proveedores e inspecciones',
        puntos: [
          'Cada proveedor ahora tiene su lista de asesores, con teléfono, WhatsApp y correo. El RUC se registra una sola vez y ya no se repite.',
          'Nuevo directorio con dos vistas: «Contactos», como la agenda del teléfono, y «Proveedores», una fila por empresa. Al tocar una fila se abre su ficha.',
          'Un aviso te muestra los proveedores a los que les falta el RUC o DNI para que los completes.',
          'Notas de crédito de proveedores: registra la devolución, la nota que te da el proveedor y aplica su saldo al pagar otra orden. Cada proveedor tiene su estado de cuenta.',
          'Inspecciones: medidor de combustible, kilometraje tomado del GPS y un informe en PDF nuevo, con fotos, para abrir o enviar por WhatsApp.',
        ],
      },
    ],
  },
];

const CLAVE_VISTA = 'fleet_novedades_vista';

/** Id de la última novedad que esta persona ya vio (en este navegador) */
export function novedadVista(): string | null {
  try { return localStorage.getItem(CLAVE_VISTA); } catch { return null; }
}

export function marcarNovedadesVistas() {
  const id = NOVEDADES[0]?.id;
  if (!id) return;
  try { localStorage.setItem(CLAVE_VISTA, id); } catch { /* sin almacenamiento */ }
}

/** Novedades que esta persona todavía no vio, la más nueva primero (máximo 3) */
export function novedadesPendientes(): Novedad[] {
  const ultima = NOVEDADES[0]?.id;
  if (!ultima) return [];
  const vista = novedadVista();
  if (vista === ultima) return [];
  const i = NOVEDADES.findIndex(n => n.id === vista);
  return NOVEDADES.slice(0, i === -1 ? 3 : Math.min(i, 3));
}
