// Conocimiento del asistente: cómo se usa Azkell Fleet. Es lo único que se le da a Gemini.
// No incluye datos de la empresa (placas, clientes, OT): el asistente no los ve nunca.
// Si cambia una pantalla o una regla, cambia también este texto.

const KNOWLEDGE = `
## Qué es Azkell Fleet
Sistema integral de gestión de flotas (Lima, Perú): vehículos, mantenimiento, conductores, GPS, operaciones y administración de empresas de transporte. Se usa desde el celular (pestañas inferiores) y desde la computadora (barra lateral izquierda). Hay dos versiones conviviendo: la versión nueva (React, esta app) y la versión actual (accesible desde "Abrir en la versión actual").

## Pantallas de la versión nueva
- **Inicio:** resumen del día con accesos rápidos.
- **Placas:** catálogo de vehículos con vista en tarjetas o lista. Se puede buscar por placa, cliente o marca. Desde una placa se ven todos sus detalles (técnicos, operativos, documentos).
- **Disponibilidad:** estado actual de cada unidad (disponible, en ruta, en taller).
- **Incidencias en ruta:** fallas reportadas durante el trayecto. Se registra placa, conductor, motivo, tipo de falla y estado (Pendiente / Atendido).
- **Fallas (Reportes de falla):** formulario más completo para reportar fallas mecánicas, eléctricas, neumáticos, etc.
- **Órdenes de Trabajo:** panel de taller, OTs abiertas, pendientes y en rampa.
- **Conductores:** directorio de conductores con DNI, licencia, teléfono y estado.
- **Usuarios:** gestión de cuentas del sistema (solo administradores).
- **Auditoría:** bitácora de actividad: quién hizo cada cambio y cuándo.
- **Mi cuenta:** cambiar contraseña, ver tus permisos y activar 2FA.

## Pantallas en la versión actual (se abren con "Abrir en la versión actual")
- **Dashboard / Centro de Comando:** KPIs generales, gráficos de inspecciones y fleetrun.
- **Inspecciones técnicas:** registro de inspecciones por categoría (motor, neumáticos, frenos, etc.), wizard por fases, firma digital y exportación a PDF.
- **Fleetrun (Datos de Mantenimiento):** historial de mantenimientos preventivos por vehículo, con km, fechas y estado.
- **Status Rampa:** resumen de inspecciones vigentes y vencidas por tipo de vehículo.
- **Ubicación GPS:** mapa con posición en tiempo real desde Wialon (se conecta con token).
- **Almacén / Inventario:** productos, familias, marcas y movimientos de stock.
- **Combustible / D2 y Urea:** análisis de consumo con datos de telemetría CAN Bus (Wialon).
- **Aprobación de compras y caja:** aprobar o rechazar órdenes de compra y movimientos de caja.
- **Gerencia / Centro de Control:** panel exclusivo para gerentes.

## Vehículos (Placas)
- Cada vehículo tiene: placa, cliente (empresa a quien pertenece), marca, modelo, tipo (tracto, remolque, camión, motora…), sub-tipo, color, año, combustible, tara, cargas útiles y estado (Activa / Inactiva).
- Se puede importar masivamente desde Excel con la plantilla descargable.
- El panel derecho de detalle muestra secciones: General, Técnico y Operatividad.

## Conductores
- Directorio con nombre, DNI, número de licencia, teléfono y estado.
- Un conductor puede estar activo o inactivo. Al inactivar, deja de aparecer en los formularios.

## Inspecciones técnicas
- Categorías: llanta, motor, sistema eléctrico, sistema de aire, transmisión, dirección, frenos, suspensión, hermetizado.
- El wizard guía fase a fase. La última fase incluye firma digital del inspector.
- Se exporta a PDF con un botón.
- El estado puede ser: VIGENTE, VENCIDA o PENDIENTE.

## Mantenimientos Fleetrun
- Registro de cada mantenimiento preventivo: placa, fecha, km actual, km próximo, tipo de mantenimiento.
- Se puede ver en modo "Activos" o "Historial".
- Los gráficos resumen la flota por tipo (motoras vs no motoras) y combustible.

## Órdenes de Trabajo (OT)
- Se abren desde taller para registrar trabajos mecánicos o eléctricos.
- Estados: Abierto → En Proceso → Cerrado / Anulado.
- Cada OT tiene trabajos detallados (técnico, tipo, costo, sistema del vehículo).

## GPS / Ubicación
- Mapa con posición en tiempo real de las unidades vía Wialon.
- El token de Wialon se guarda en la tabla de configuración del sistema (no en el código).
- Se accede desde Flota → Ubicación GPS.

## Permisos y roles
- Los roles se definen por matrices de permisos (lectura, creación, edición, eliminación por módulo).
- Los administradores ven y hacen todo.
- Si una sección no aparece o dice "Sin acceso", el administrador puede modificar los permisos en Usuarios.
- Para cambiar la contraseña o ver tus permisos: Mi cuenta.

## Reportes (desde este asistente)
- Pide el reporte en el chat, por ejemplo "reporte de placas en Excel" o "inspecciones de este mes en PDF".
- Reportes disponibles según tus permisos: placas (catálogo de vehículos), inspecciones técnicas (por fechas), directorio de conductores, y datos Fleetrun (por fechas).
- Los pedidos claros ("lista de conductores en Excel") se preparan al instante aunque el asistente esté sin cuota.
- Aparece una tarjeta con el archivo listo para descargar o ver.

## Instalar la app en el celular
- Android: menú "Más" → "Instalar app en este teléfono".
- iPhone: abrir en Safari → botón Compartir → "Añadir a pantalla de inicio".

## Sesión y seguridad
- Al iniciar sesión con "Recuérdame", el dispositivo recuerda la sesión durante 30 días.
- Hay autenticación de dos factores (2FA) disponible desde Mi cuenta.
- El sistema cierra la sesión automáticamente tras 10 minutos de inactividad (configurable).
- Para cerrar sesión: barra lateral → Cerrar sesión.
`;

module.exports = { KNOWLEDGE };
