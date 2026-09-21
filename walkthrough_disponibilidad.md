# Resumen de Cambios: Disponibilidad de Flota (ERP)

## 1. Diseño 1:1 Replicado de Reporte de Fallas / Taller
- **Encabezado y Acciones**: Icono en contenedor blanco con sombra suave, tipografía limpia, botones de acción (`[Recargar]`, `[Exportar Excel]`, `[+ Registrar Unidad]`).
- **Selector Central de Vistas**:
  - `[ ⊞ Tablero ]` | `[ 📊 Gráficos ]`
- **4 Cards Bento KPIs (Desktop)**:
  - `TOTAL FLOTA` (Azul / Collection) -> Muestra todas las unidades
  - `EN BASE` (Verde / Geo-alt) -> Filtra unidades en base
  - `EN RUTA` (Azul claro / Cursor) -> Filtra unidades en ruta
  - `EN MANTENIMIENTO` (Rojo / Tools) -> Filtra unidades en mantenimiento / taller
  - *Oculto en móvil para no sobrecargar la pantalla*.
- **Buscador & Apple Segmented Control por Empresas**:
  - Buscador universal `.ck-apple-search`.
  - Control segmentado dinámico con las empresas de la flota: `[Todas] [MARSISA] [ROSYMAR] [TRAHESA] ...`.

## 2. Vista Gráficos & Dashboard por Sub Tipo
- **Desktop (1 Sola Fila Horizontal)**:
  - Todas las tarjetas de Sub Tipo se distribuyen en una sola línea continua y fluida (`disp-subtipos-flex-row`), evitando saltos de línea antiestéticos.
  - Gradientes vibrantes, siluetas vectoriales SVG de vehículos y copo de nieve para Thermo King.
  - Gráfica de barras vertical con categorías claras en el eje X y números en blanco puro `#ffffff` con sombra.
- **Móvil (Adaptación Apple Card + Gráfico Horizontal)**:
  - Las tarjetas de Sub Tipo suben al inicio de la pantalla con diseño **Apple Card** (fondo blanco, borde sutil, número grande oscuro y cápsula de icono tintada en cuadrícula de 2 columnas).
  - La gráfica en celular se transforma automáticamente en **Gráfico de Barras Horizontales** (`indexAxis: 'y'`), con altura extendida (400px), eliminando cualquier compresión o texto inclinado y haciendo la lectura 100% natural e inmediata.
  - Matriz resumen numérica compacta al pie del gráfico.

## 3. Conteo Real de Flota
- Extracción desagregada de **85 unidades** (motoras + carretas acopladas + carretas sueltas), cuadrando 1:1 con la tabla dinámica de Excel.
