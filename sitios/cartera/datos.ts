// Contenido de la cartera. Editar aquí; la página lo dibuja sola.
// Las cifras salen del propio proyecto (docs/migracion.md y las 4 empresas activas); se redondean hacia abajo.

/** Enlaces de contacto: los que queden vacíos no se muestran. */
export const CONTACTO = {
  correo: 'azkellfleet@gmail.com',
  linkedin: 'https://www.linkedin.com/in/sthefano-avila-li-57b82532b',
  github: '',
};

export const PRODUCTO_URL = 'https://fleet.azkell.com';

export const PALABRAS_HEROE = ['operaciones', 'logística', 'mantenimiento', 'software'];

export const CIFRAS = [
  { valor: 4, sufijo: '', texto: 'empresas operando en el ERP' },
  { valor: 90, sufijo: '+', texto: 'pantallas de trabajo' },
  { valor: 490, sufijo: '+', texto: 'endpoints de API' },
  { valor: 100, sufijo: '+', texto: 'tablas de datos' },
];

export const TECNOLOGIAS = [
  'React 19', 'TypeScript', 'Node.js', 'Express', 'MySQL', 'Prisma', 'TanStack Query', 'Motion', 'Vite',
  'Wialon', 'Telemetría CAN', 'WhatsApp (Evolution API)', 'AWS S3', 'AWS SES', 'SUNAT', 'Recharts', 'JWT', '2FA TOTP',
];

export interface Capacidad { icono: string; titulo: string; texto: string }
export const CAPACIDADES: Capacidad[] = [
  { icono: 'Truck', titulo: 'Operación de flota', texto: 'Viajes, órdenes de servicio, combustible, guías y disponibilidad de unidades pensados desde la operación diaria, no desde un escritorio.' },
  { icono: 'Wrench', titulo: 'Mantenimiento y taller', texto: 'Órdenes de trabajo, rampas, horas por técnico, neumáticos, inspecciones y costos por unidad, con el detalle que pide un taller real.' },
  { icono: 'Code', titulo: 'Desarrollo de producto', texto: 'Del esquema de datos a la pantalla: React y TypeScript en el frente, Node.js y MySQL detrás, con migraciones controladas.' },
  { icono: 'Radar', titulo: 'Integraciones', texto: 'GPS y telemetría CAN de las unidades, WhatsApp, correo y SMS, guías electrónicas y almacenamiento en la nube conectados al mismo sistema.' },
  { icono: 'ShieldCheck', titulo: 'Seguridad y trazabilidad', texto: 'Cada empresa en su propia base de datos, auditoría firmada de cada cambio, doble factor y sesiones controladas.' },
  { icono: 'Gauge', titulo: 'Costos y decisiones', texto: 'Costo promedio de almacén, valorización en soles y dólares, tesorería y paneles que muestran dónde se va el dinero.' },
];

export interface Modulo { icono: string; titulo: string }
export const MODULOS: Modulo[] = [
  { icono: 'Truck', titulo: 'Flota y GPS' },
  { icono: 'Wrench', titulo: 'Mantenimiento' },
  { icono: 'Boxes', titulo: 'Almacén' },
  { icono: 'Banknote', titulo: 'Tesorería' },
  { icono: 'Route', titulo: 'Operaciones' },
  { icono: 'Users', titulo: 'RRHH' },
];

export const PRINCIPIOS = [
  { titulo: 'Los datos de cada empresa no se mezclan', texto: 'Una base de datos por empresa y un subdominio propio. Lo que ve una empresa jamás pasa por la de otra.' },
  { titulo: 'Los cambios de esquema son aditivos y con respaldo', texto: 'Antes de tocar una base de producción se respalda, se prueba en una copia y solo se agregan columnas o tablas.' },
  { titulo: 'Todo cambio deja huella', texto: 'La auditoría registra quién cambió qué, con el valor anterior y el nuevo, y firma cada registro para detectar alteraciones.' },
  { titulo: 'Se prueba con datos reales', texto: 'Cada corrección se verifica contra las bases de las empresas antes de darla por cerrada.' },
];

export const HITOS = [
  { fecha: '2026', titulo: 'Migración a React y TypeScript', texto: 'La aplicación se reescribe pantalla por pantalla sobre una arquitectura moderna, sin detener la operación de las empresas.' },
  { fecha: 'Oct 2026', titulo: 'Aislamiento total por empresa', texto: 'Cada solicitud se resuelve por subdominio contra la base de su empresa; se cerraron los puntos donde podía cruzarse información.' },
  { fecha: 'Oct 2026', titulo: 'Auditoría con firma criptográfica', texto: 'Registro de actividad con antes y después de cada cambio, firmado y visible en tiempo real.' },
  { fecha: 'Oct 2026', titulo: 'Notificaciones por WhatsApp, correo y SMS', texto: 'Un solo módulo con reglas por evento, historial de envíos y proveedores intercambiables.' },
];
