# Paridad React vs. versión actual: botones «Abrir en la versión actual»

Fecha de revisión: 2026-10-29. Tarea solo de lectura: no se modificó `src/` ni `modulos/`, no hubo commit ni push, no se usó la base de producción ni se llamó a Wialon.

**Método.** Se buscó `Abrir en la versión actual`, `Versión actual`, `abrirClasico(` y `clasico` en `src/`. Para cada destino se listaron los botones, los `onchange`/`onclick` y las funciones (`function` / `window.x = function`) de `modulos/<destino>/vista.html` y `logica.js`. Luego se buscó en el código React de la pantalla la función equivalente (por texto de botón, nombre de componente o palabra clave). Una función cuenta como cubierta solo si aparece en el código React. Lo que no se pudo comparar pantalla por pantalla queda en REVISAR.

**Excluidos:** `AppShell.tsx`, `InicioPage.tsx`, `PaletaComandos.tsx` y `navigation.ts` usan `abrirClasico` como acceso del menú, no como botón de una pantalla.

**Nota sobre `CrudLista.tsx`:** agrega «Abrir en la versión actual» cuando la pantalla pasa la prop `clasico`. Lo hacen `ClientesPage.tsx` y `CentrosCostosPage.tsx`.

| pantalla React | destino clásico | funciones del clásico que NO están en React | ¿se puede quitar el botón? | motivo |
|---|---|---|---|---|
| `conductores/ConductoresPage.tsx` | `directorio/conductores` | Exportar a Excel (`descargarExcelDinamico`). React sí tiene alta, edición, eliminación, importación y plantilla, foto, consulta DNI, WhatsApp, filtros y agrupación por empresa | NO | No hay ninguna exportación Excel en `conductores/` (búsqueda de `exportar`/`exportarExcel` vacía). |
| `directorio/ClientesPage.tsx` (vía `CrudLista`) | `directorio/clientes` | Consulta de RUC/DNI en SUNAT desde el formulario (`cliConsultarSUNAT`) | NO | React tiene CRUD, importación, exportación y plantilla, pero no hay consulta SUNAT en `directorio/`. |
| `gerencia/AprobacionesOCPage.tsx` (botón «Abrir») | `gerencia/aprobaciones-oc` | Exportar resumen de aprobaciones (`exportarResumenAprobaciones`). Vista tarjetas/tabla, pestañas, firma y observar/rechazar ya están en React | NO | El propio menú de React tiene «Exportar acta» enlazado al clásico, así que esa exportación no está migrada. |
| `gerencia/AprobacionesOCPage.tsx` (botón «Exportar acta») | `gerencia/aprobaciones-oc` | Exportación del acta (la misma que la anterior) | NO | Mismo motivo: la exportación depende del clásico. |
| `gerencia/AprobacionesCajaPage.tsx` | `gerencia/aprobaciones-caja` | Pestaña/filtro «Anulados» (`filtrarPorTabCaja('anulado')`). React solo tiene Pendientes, Aprobados y Total. Filtro por motivo (`poblarFiltroMotivos`) sin verificar | NO | Falta la pestaña de anulados. |
| `gerencia/DashboardPage.tsx` | `dashboard` | Tablero de accesos a 11 módulos y recarga ejecutiva (`apRecargarDashboardEjecutivo`). React tiene KPIs y gráficos propios | REVISAR | Hay cobertura parcial, pero no se pudo verificar que los números y gráficos coincidan con el clásico, y los accesos dependen de la navegación. |
| `inspecciones/InspeccionesPage.tsx` | `mantenimiento/inspecciones` | No identificada con certeza. React tiene PDF, Excel, importación, plantilla, frenos, neumáticos y firma. El clásico tiene 4.664 líneas de lógica | REVISAR | Cobertura amplia, pero no se pudo comparar función por función ni revisar el PDF y la firma en el navegador. |
| `tesoreria/LiquidacionesPage.tsx` | `tesoreria/liquidaciones` | No identificada en código. React tiene destinos de compensación (`CAJA_CHICA`, `DESCUENTO_PLANILLA`, `TRANSFERENCIA`, `EFECTIVO`), búsqueda, filtros y confirmación de caja | REVISAR | La confirmación genera cajas de forma irreversible. No se pudo verificar que los montos y saldos coincidan con el clásico. |
| `tesoreria/PagoRequerimientosPage.tsx` | `tesoreria/pago-requerimientos` | Imprimir PDF desde el detalle de la OC (`imprimirPDFDesdeDetalleOC`) con importe en letras (`numeroALetras`). El detalle de React (`pago-detalle-sheet.tsx`) no genera PDF | NO | Falta la impresión PDF del detalle de la OC. |
| `tesoreria/cc-MotivosGasto.tsx` | `tesoreria/centros-costos` (pestaña motivos) | Eliminar concepto (`ccEliminarMotivoGastoTab`): el clásico llama a `DELETE /api/tesoreria/motivos-gastos/:id`, pero `routes/tesoreria.js` no tiene esa ruta, así que la función no funciona en el clásico. React desactiva con Estado. Filtros de la pestaña sin verificar | REVISAR | El botón abre toda la página del clásico, que tiene KPIs por área. Decidir si esos KPIs se llevan a React. |
| `tesoreria/CentrosCostosPage.tsx` (vía `CrudLista`) | `tesoreria/centros-costos` | KPIs por área (`cc-kpi-admin`, `cc-kpi-ventas`, `cc-kpi-ruta`, `cc-kpi-taller`) que calcula `ccActualizarKPIs`. React no los muestra | NO | Falta el resumen por área. El CRUD y los campos (PCGE, placa, nivel) sí están en React. |
| `tesoreria/BancosPage.tsx` | `tesoreria/bancos` | Ninguna. El clásico tiene listar, crear (con «otro banco», que está en `banc-NuevaCuenta.tsx`) y eliminar; no tiene edición ni Excel. React tiene todo eso más Excel y filtro por moneda | SI | Todas las funciones del clásico tienen equivalente en código. |
| `tesoreria/CuentasPage.tsx` | `tesoreria/cuentas` | Cambiar estado PAGADO a PENDIENTE (`toggleEstadoCuenta`). No se encontró equivalente en React (solo registrar pago) | NO | Falta revertir el pago. El resto (NC, historial, importación, plantilla, Excel, edición, eliminación) está en React. |
| `mantenimiento/FleetrunPage.tsx` («Abrir versión completa») | `mantenimiento/fleetrun` | Gestión de técnicos (`fleetrunAbrirTecnicos`, `fleetrunAplicarTecnicos`). No aparece en React. Frecuencias multi-tipo (`agregarTipoMulti`) sin verificar | NO | Falta el modal de técnicos. |
| `flota/DisponibilidadPage.tsx` («GPS, conductores y reportes») | `flota/disponibilidad` | Modal «Cuadro» de resumen por tipo (`dispAbrirModalCuadro`). React tiene tablero, gráficos por subtipo, PDF, Excel y WhatsApp, pero no el cuadro | NO | No se encontró el cuadro en React. El texto del botón coincide con lo que falta. |
| `personas/SegPatrimonialPage.tsx` («Ver garita») | `seguridad/unidades` | PDF del registro y acta HTML de la garita (CLAUDE.md §13 los deja en el clásico). Impresión de ventana (`_sguAbrirVentanaImpresion`) | NO | La garita de React no genera el PDF del registro. |
| `operaciones/GuiasElectronicas.tsx` (remitente y transportista) | `operaciones/guia-remitente` / `guia-transportista` | Redactar guía nueva, emisión masiva y configuración (`greEmitirGuia`, `greSincronizarApisunat`, credenciales) | NO | Falta la redacción y emisión masiva. Se dejó sin migrar a propósito porque emite en SUNAT (CLAUDE.md §13). |
| `personas/PortalConductorPage.tsx` («Checklist y vales») | `operaciones/conductor-portal` | Reporte de fallas (`condAbrirModalReporteFallas`), checklist y vales. React solo tiene gastos | NO | Falta el reporte de fallas. Los vales en el clásico aparecen como «próximamente». |
| `personas/NominaPage.tsx` | `rrhh/nomina` | Imprimir boleta (`window.print` en `vista.html`). La boleta de React es un panel sin botón de imprimir | NO | Falta imprimir la boleta. El resto (planilla, SST, Excel) está en React. |
| `mantenimiento/KitsMpPage.tsx` (tarjeta y menú) | `mantenimiento/kits-mp` | Importar Excel, exportar Excel y descargar plantilla (`kitsImportarExcel`, `kitsExportarExcel`, `kitsDescargarPlantilla`). En `KitsMpPage.tsx` no hay ninguna referencia a Excel ni a plantilla | NO | Falta todo el flujo Excel de kits. |
| `operaciones/OrdenesViajePage.tsx` | `operaciones/ordenes-viaje` | Monitoreo del viaje con mapa GPS y telemetría (`ovAbrirModalMonitoreoViaje`, `ovRenderGpsMap`), manifiesto (`ovDescargarManifiestoMock`). React tiene OS, vales, liquidaciones, Excel y sincronización Marsisa | NO | No hay monitoreo GPS del viaje en React. |
| `operaciones/OrdenesServicioPage.tsx` | `operaciones/ordenes-servicio` | Imprimir tabla (`osImprimirTabla`) | NO | No hay impresión de la tabla en React (`grep mprim` vacío). |
| `personas/AsistenciaPage.tsx` | `rrhh/asistencia` | Ninguna. El clásico tiene licencia, marcar asistencia de hoy, matriz, rotar estado con clic y sincronizar viajes. React tiene todo eso y suma Excel | SI | Todas las funciones del clásico tienen equivalente en código (`rotar`, «Marcar asistencia de hoy», «Sincronizar con viajes», `LicenciaSheet`). |
| `sistema/AuditoriaPage.tsx` | `sistema/auditoria` | Ordenar por columna (`toggleOrdenAudit`) y tamaño de página con paginación numerada (`cambiarPageSizeAudit`). React usa «Cargar más» y no ordena | NO | Faltan ordenar y tamaño de página. Excel, filtros y detalle sí están. |
| `sistema/IntegracionesPage.tsx` | `sistema/integraciones` | Conectar Wialon (`intgConectarWialon`: captura el token de la ventana de autorización). React tiene guardar, probar Wialon y probar SUNAT | NO | No hay flujo para conectar Wialon. |
| `personal/PersonalPage.tsx` | `rrhh/personal` | Eliminar foto guardada (`rrhhPersonalEliminarFoto`). React solo permite quitar la foto nueva antes de guardar | NO | Falta eliminar la foto existente. El resto (fichas, fotocheck, ficha impresa, Excel, consulta DNI, roles, fecha fin de contrato) está en React. |
| `placas/PlacasPage.tsx` | `flota/placas` | Consulta de datos de placa (`consultarDatosPlaca`) y consulta de RUC/DNI al crear cliente (`consultarDocNuevoCliente`, `abrirModalNuevoCliente`). No aparece en `placas/` | NO | Faltan las consultas de datos de placa y de cliente. |
| `placas/PlacaFicha.tsx` («Versión actual») | `flota/placas` | Mismas que `PlacasPage` (consultas de placa y de cliente) | NO | Mismo motivo. Imprimir mapa, QR, historial y PDF sí están. |
| `mantenimiento/OTDetalle.tsx` | `mantenimiento/reportes-ot` | No identificada con certeza. React tiene PDF, plantillas (OT, llantas, inspección), costos, tiempos, repuestos, terceros y cierre de OT. El clásico tiene 6.279 líneas de lógica (backlog, km, neumáticos, materiales) | REVISAR | Cobertura amplia, pero no se pudo comparar función por función ni revisar los PDF en el navegador. |
| `mantenimiento/OrdenesTrabajoPage.tsx` | `mantenimiento/reportes-ot` | Igual que `OTDetalle` (mismo destino) | REVISAR | Mismo motivo. |
| `mantenimiento/StatusRampaPage.tsx` (tarjeta «OT, trabajos y catálogos») | `mantenimiento/status-rampa` | Plantilla de parabrisas (`srDescargarPlantillaParabrisas`); no aparece en React. También: PDF vectorial del estado, reordenar rampas y colores (`srGuardarOrdenRampas`, `srGuardarColorRampa`) sin verificar | NO | Falta la plantilla de parabrisas. |
| `mantenimiento/OtrosMantenimientoPage.tsx` | (sin destino activo) | Ninguno. Las claves de «Otros» ya apuntan a rutas React, así que la rama `else if (i.clasico)` no se ejecuta | REVISAR | No hay botón que abra el clásico. Revisar si se elimina la rama muerta. |

## Resumen

| pantalla React | decisión |
|---|---|
| `tesoreria/BancosPage.tsx` | SI |
| `personas/AsistenciaPage.tsx` | SI |
| `conductores/ConductoresPage.tsx` | NO |
| `directorio/ClientesPage.tsx` | NO |
| `gerencia/AprobacionesOCPage.tsx` (Abrir y Exportar acta) | NO |
| `gerencia/AprobacionesCajaPage.tsx` | NO |
| `gerencia/DashboardPage.tsx` | REVISAR |
| `inspecciones/InspeccionesPage.tsx` | REVISAR |
| `tesoreria/LiquidacionesPage.tsx` | REVISAR |
| `tesoreria/PagoRequerimientosPage.tsx` | NO |
| `tesoreria/cc-MotivosGasto.tsx` | REVISAR |
| `tesoreria/CentrosCostosPage.tsx` | NO |
| `tesoreria/CuentasPage.tsx` | NO |
| `mantenimiento/FleetrunPage.tsx` | NO |
| `flota/DisponibilidadPage.tsx` | NO |
| `personas/SegPatrimonialPage.tsx` | NO |
| `operaciones/GuiasElectronicas.tsx` | NO |
| `personas/PortalConductorPage.tsx` | NO |
| `personas/NominaPage.tsx` | NO |
| `mantenimiento/KitsMpPage.tsx` (2 botones) | NO |
| `operaciones/OrdenesViajePage.tsx` | NO |
| `operaciones/OrdenesServicioPage.tsx` | NO |
| `sistema/AuditoriaPage.tsx` | NO |
| `sistema/IntegracionesPage.tsx` | NO |
| `personal/PersonalPage.tsx` | NO |
| `placas/PlacasPage.tsx` | NO |
| `placas/PlacaFicha.tsx` | NO |
| `mantenimiento/OTDetalle.tsx` | REVISAR |
| `mantenimiento/OrdenesTrabajoPage.tsx` | REVISAR |
| `mantenimiento/StatusRampaPage.tsx` | NO |
| `mantenimiento/OtrosMantenimientoPage.tsx` | REVISAR |

**Botones que se pueden quitar hoy: 2** (Bancos y Asistencia). Los REVISAR (7 entradas) pasan a SI solo si se prueban en el navegador o se comparan a fondo.

## Estado de cierre (2026-10-29)

- **Escapes «Abrir en la versión actual»:** quitados de todas las pantallas de la app nueva. Único acceso que queda: el enlace de emisión de **guías SUNAT** (`/clasico#operaciones/guia-remitente` y `/clasico#operaciones/guia-transportista`), por decisión: el clásico sigue emitiendo a SUNAT hasta validar el sandbox.
- **Raíz y clásico:** `/` redirige a `/app`; la versión actual queda en `/clasico`.
- **Menú:** ninguna entrada abre el clásico; las guías abren su pantalla React, que enlaza a la emisión.

### Pendiente de calca (reportado por los agentes, no verificado en navegador)

- Auditoría: columnas y filtros Módulo / Sub-Módulo (el clásico los deriva de otra fuente, no de `audit_logs`).
- Centro de Comando: la Torre de alertas del clásico no está en React.
- Operaciones: cuenta bancaria del conductor no se autollena (`/seguridad/recursos` devuelve solo nombres).
- Órdenes de viaje: adjuntos, eventos, cambios y peajes quedan vacíos, como en el clásico.
- Mantenimiento: «Confirmar y Generar OTs» del clásico asumido cubierto por «Nueva OT»; sin verificar en código.
- Vales: la separación de vales usa palabras clave (aproximación).
- Todos los flujos nuevos: pendientes de prueba en navegador con datos reales.

## Decisiones de seguimiento (2026-10-29)

- **Torre de alertas (Centro de Comando):** fuera de la app nueva. Las alertas de documentos vencidos, llantas y mantenimiento se ven en el Centro de Notificaciones y en Documentos.
- **Auditoría, Módulo:** la columna y el filtro «Módulo» muestran el campo `entity` de `audit_logs`. Hoy casi todos los eventos son de sesión: el campo se llena solo en las acciones que lo pasan al registrar.
- **Auditoría, Sub-Módulo:** sin campo equivalente en `audit_logs`; no se muestra.
- **Cuenta bancaria del conductor:** pendiente. El clásico la lee de `/api/seguridad/recursos`, pero la tabla `conductores` no tiene columnas bancarias y la ruta devuelve solo nombres. Requiere agregar columnas a `conductores` (migración aditiva) y capturarlas en el formulario de conductores.

## Cierre total (2026-10-30)

No quedan escapes ni enlaces al clásico. La versión anterior fue eliminada del repositorio (respaldo: tag `v1.0-legacy-backup`). Guías SUNAT se emiten desde React.
