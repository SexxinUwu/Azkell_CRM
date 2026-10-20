// Contenido de la página del producto (fleet.azkell.com). Todo lo que se describe existe hoy en el ERP.

export const CARTERA_URL = 'https://azkell.com';

export interface ModuloProducto { icono: string; titulo: string; texto: string; puntos: string[] }
export const MODULOS: ModuloProducto[] = [
  { icono: 'Truck', titulo: 'Flota y GPS', texto: 'Cada unidad, su ubicación y sus papeles al día.',
    puntos: ['Ubicación en vivo con historial de recorrido', 'Disponibilidad por placa y estado', 'Documentos con alertas de vencimiento', 'Entrega de vehículos con acta y firmas'] },
  { icono: 'Wrench', titulo: 'Mantenimiento y taller', texto: 'Del ingreso a rampa hasta el costo final de la orden.',
    puntos: ['Órdenes de trabajo con cronómetro y pausas', 'Tablero de rampas en tiempo real', 'Horas y eficiencia por técnico', 'Neumáticos, inspecciones y planificación preventiva'] },
  { icono: 'Boxes', titulo: 'Almacén e inventario', texto: 'Stock, compras y salidas con costo real.',
    puntos: ['Kardex con costo promedio', 'Órdenes de compra y recepción', 'Salidas directas a la orden de trabajo', 'Soles y dólares con tipo de cambio de la compra'] },
  { icono: 'Banknote', titulo: 'Tesorería', texto: 'Lo que entra, lo que sale y lo que se debe.',
    puntos: ['Caja y bancos', 'Cuentas por cobrar y por pagar', 'Pago de requerimientos con constancia', 'Liquidación de viajes y viáticos'] },
  { icono: 'Route', titulo: 'Operaciones', texto: 'Viajes programados, servicios y combustible bajo control.',
    puntos: ['Programación y órdenes de viaje', 'Órdenes de servicio con rutas y flete', 'Vales de combustible y análisis de consumo', 'Guías de remisión electrónicas'] },
  { icono: 'Users', titulo: 'Personas y seguridad', texto: 'Quién trabaja, quién entra y quién sale.',
    puntos: ['Directorio de personal y conductores', 'Asistencia y nómina', 'Control de garita y de unidades', 'Portal del conductor para sus gastos'] },
];

export const PASOS = [
  { n: '1', titulo: 'Tu espacio propio', texto: 'Tu empresa recibe su dirección (tu-empresa.azkell.com) y su propia base de datos.' },
  { n: '2', titulo: 'Carga tu operación', texto: 'Importa unidades, personal e inventario desde Excel y empieza a registrar.' },
  { n: '3', titulo: 'Trabaja desde donde estés', texto: 'En computadora o celular, instalable como aplicación, con avisos por WhatsApp y correo.' },
];

export const SEGURIDAD = [
  { titulo: 'Datos separados', texto: 'Una base de datos por empresa. Nada se mezcla.' },
  { titulo: 'Auditoría firmada', texto: 'Quién cambió qué y cuándo, con valor anterior y nuevo.' },
  { titulo: 'Acceso protegido', texto: 'Roles por módulo, doble factor y sesiones que se pueden cerrar.' },
  { titulo: 'Respaldos antes de cada cambio', texto: 'Ninguna actualización de datos se aplica sin copia previa.' },
];

export const INTEGRACIONES = ['Wialon GPS', 'Telemetría CAN', 'WhatsApp', 'Correo (AWS SES)', 'SMS', 'SUNAT', 'AWS S3', 'Excel', 'PWA instalable', 'Tipo de cambio SUNAT'];
