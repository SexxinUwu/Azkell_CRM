# Resumen de Cambios: Disponibilidad de Flota (ERP)

## 1. Diseño 1:1 Replicado de Reporte de Fallas
- **Encabezado y Acciones**: Icono en contenedor blanco con sombra suave, tipografía limpia, botones de acción (`[Recargar]`, `[Resumen Flota]`, `[Exportar Excel]`, `[+ Registrar Unidad]`).
- **4 Cards Bento KPIs**:
  - `TOTAL FLOTA` (Azul / Collection)
  - `EN BASE` (Verde / Geo-alt)
  - `EN RUTA` (Azul claro / Cursor)
  - `EN MANTENIMIENTO` (Rojo / Tools)
- **Buscador & Apple Segmented Control**:
  - Buscador universal `.ck-apple-search`.
  - Filtro segmentado estilo Apple: `[Todos] [En Base] [En Ruta] [En Mantenimiento]`.
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

## 2. Lógica de Acoplamiento y Mantenimiento
- Las columnas ahora se llaman estrictamente **CAMIÓN** y **CARRETA**.
- **En CAMIÓN**: Solo unidades motoras (Tractos, Camiones, Volquetes, Furgones, Cisternas).
- **En CARRETA**: Solo unidades no motoras (Semirremolques, Carretas, Plataformas, Tanques).
- **Acoplamiento en Taller / OTs**:
  - Si un camión y una carreta ingresaron juntos a taller con OTs (ejemplo: `BDJ729` con `BHV971` y conductor `JUAN BENIGNO CAMARA GOMEZ`), aparecen **juntos acoplados en la misma fila** con estado `En Mantenimiento`.
  - Si solo una unidad ingresó a taller, únicamente esa unidad figura en `En Mantenimiento`, manteniéndose la otra de forma independiente en su estado correspondiente.
