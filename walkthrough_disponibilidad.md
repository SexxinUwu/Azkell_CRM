# Resumen de Cambios: Disponibilidad de Flota (ERP)

## 1. Diseño 1:1 Replicado de Reporte de Fallas
- **Encabezado y Acciones**: Icono en contenedor blanco con sombra suave, tipografía limpia, botones de acción (`[Recargar]`, `[Resumen Flota]`, `[Exportar Excel]`, `[+ Registrar Unidad]`).
- **4 Cards Bento KPIs (Clickeables)**:
  - `TOTAL FLOTA` (Azul / Collection) -> Muestra todas las unidades
  - `EN BASE` (Verde / Geo-alt) -> Filtra unidades en base
  - `EN RUTA` (Azul claro / Cursor) -> Filtra unidades en ruta
  - `EN MANTENIMIENTO` (Rojo / Tools) -> Filtra unidades en mantenimiento / taller
- **Buscador & Apple Segmented Control por Empresas**:
  - Buscador universal `.ck-apple-search`.
  - Control segmentado dinámico con las empresas de la flota: `[Todas] [MARSISA] [ROSYMAR] [TRAHESA] ...`.
- **Doble Nivel de Filtrado Interactivo**:
  - **Nivel 1 (Cards Bento)**: Al hacer clic en un card (ej. *En Base*, *En Ruta*, *En Mantenimiento*), se filtra el estado y el botón inferior se resetea automáticamente a `[ Todas ]`.
  - **Nivel 2 (Empresas)**: Al seleccionar una empresa específica (ej. *MARSISA*), actúa como un sub-filtro mostrando solo las unidades de esa empresa bajo el estado seleccionado.
- **Tabla Desktop**:
  - Encabezado `bg-light sticky-top shadow-2xs border-bottom`.
  - Columnas exactas en orden: `#`, `CAMIÓN`, `CARRETA`, `CONDUCTOR`, `ESTADO`, `MARCA`, `CAPACIDAD DE TANQUE`, `TIPO UNIDAD`, `OBSERVACIONES`, `ACCIONES`.
  - Badges de placas estilo cápsula monoespaciada en blanco con borde sutil.
  - Badges de estado con píldoras de colores (`En Base` en verde, `En Ruta` en azul, `En Mantenimiento` en rojo).
  - Botones de acción tipo cápsula `.ck-action-btn` (`.ck-btn-edit` y `.ck-btn-delete`).
- **Vista Móvil Nativa (Responsive)**:
  - Tarjetas nativas `.ck-mobile-card` para celulares (`d-md-none`).
  - Botón Flotante **FAB (+)** en la esquina inferior derecha en vista móvil.
- **Formulario Modal Drawer Flotante**:
  - Formulario que sube desde abajo (`ck-floating-drawer-dialog`) idéntico a Reporte de Fallas, con tarjetas interiores blancas, etiquetas estilizadas y autocompletado inteligente.
