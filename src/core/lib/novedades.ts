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
    id: '2026-11-18-3',
    fecha: '18 de noviembre de 2026',
    titulo: 'Documentos del personal',
    paginas: [
      {
        titulo: 'Los documentos de cada persona, en su ficha',
        puntos: [
          'En RRHH › Personal, la ficha de cada persona ahora tiene dos pestañas: Ficha y Documentos.',
          'Ahí guardas el DNI, la licencia de conducir, el certificado de antecedentes, el examen médico (EMO), el SCTR y el contrato firmado. También puedes agregar otros documentos, como certificados o cursos.',
          'Cada documento es una tarjeta con su estado: vigente, por vencer o vencido. Sube la foto o el PDF; desde el celular puedes tomar la foto en el momento.',
          'Si subes un archivo nuevo, el anterior queda en el historial. Estos documentos son sensibles: solo los ve quien tenga el permiso de RRHH.',
        ],
      },
      {
        titulo: 'Tablero de vencimientos',
        puntos: [
          'Nuevo en el menú RRHH: «Documentos del personal». Muestra a todo el personal y el estado de cada documento, con colores: verde si está vigente, ámbar si vence en 30 días o menos, rojo si está vencido o falta.',
          'Filtra por «Por cargar», «Por vencer» o «Vencidos», y por conductores. Al tocar a una persona se abre su ficha directo en Documentos.',
          'Al cargar la licencia o el examen médico con su fecha de vencimiento, el aviso de «Por vencer» de la lista de personal se actualiza solo.',
        ],
      },
    ],
  },
  {
    id: '2026-11-18-2',
    fecha: '18 de noviembre de 2026',
    titulo: 'Portal del conductor, un solo Personal y Contabilidad',
    paginas: [
      {
        titulo: 'Portal del conductor',
        puntos: [
          'Ahora el portal te reconoce por tu usuario: ya no escribes tu DNI. Al entrar te saluda por tu nombre y, si tienes un viaje activo, te lo muestra con el número de viaje, la placa del tracto y la del remolque o carreta.',
          'Ves la ubicación de la carga y la de la entrega, y con un toque las abres en Google Maps o en Waze.',
          'Debajo hay tres accesos: Vales de combustible, Reporte de fallas en ruta y Gastos en ruta.',
          'En Gastos ves tu saldo (asignado, rendido y lo que te queda) y registras cada gasto con su comprobante: boleta, factura o declaración jurada, con el RUC, la serie y el número, y la foto. Si no tienes señal, el gasto se guarda en el teléfono y se envía solo cuando vuelve.',
        ],
      },
      {
        titulo: 'Personal, Directorio y Terceros',
        puntos: [
          'Los conductores ahora son parte del Personal: hay un solo lugar en RRHH, y quien se registra como conductor queda listo también para Operaciones.',
          'El Directorio es la libreta para llamar o escribir: Personal, Clientes, Proveedores y Estaciones de servicio, en una sola pantalla. En el celular se ve como la agenda, con botones de llamar y WhatsApp en cada fila.',
          'Terceros es para quien da de alta y edita: Clientes, Proveedores y Estaciones de servicio (donde se carga el combustible), todo en un solo módulo.',
          'En RRHH, al elegir a otra persona solo cambia la ficha, sin recargar la pantalla. Los botones de la ficha ahora son iconos en la esquina superior derecha; pasa el mouse para ver su nombre.',
        ],
      },
      {
        titulo: 'Facturación y Contabilidad',
        puntos: [
          'La factura, la boleta y la nota de crédito tienen su propia plantilla de PDF, que puedes ajustar igual que la de las guías.',
          'Puedes agrupar varios servicios en una sola línea con su propia descripción, y anotar el número de liquidación. Los números se muestran cortos (por ejemplo, F001-1).',
          'Nuevo módulo Contabilidad › SIRE: trae de SUNAT tus facturas de ventas y de compras de un mes o varios, las guarda en el sistema y las puedes buscar y filtrar. En las compras te dice si ya están registradas en tus órdenes de compra, vales o caja.',
          'Exporta a Excel lo que filtraste o un comprobante, y abre el PDF de cada factura. Cada empresa carga sus credenciales de SUNAT en Sistema › Integraciones.',
        ],
      },
      {
        titulo: 'Menú y accesos',
        puntos: [
          'El menú tiene un nuevo orden: Operaciones, Flota, Mantenimiento, Almacén, Solicitudes, Directorio, RRHH, Tesorería, Terceros, Contabilidad, Conductor, Seguridad y Configuración.',
          'Dashboard y Novedades ahora son dos accesos sueltos, sin desplegable.',
          'Si no ves algo que necesitas, pídele a un administrador que te dé el permiso en Sistema › Usuarios y roles: los módulos nuevos ya aparecen ahí.',
        ],
      },
    ],
  },
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
