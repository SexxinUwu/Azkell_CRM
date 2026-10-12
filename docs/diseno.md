# Sistema de diseño de AZKELL FLEET

Modo claro, al estilo de apple.com y de las apps de Apple, con materiales Liquid Glass. Es el mismo sistema de KINTSUGI, basado en la skill **apple-design** (`.claude/skills/apple-design/`; WWDC *Designing Fluid Interfaces* y *Principles of Great Design*). Código en `src/core/styles/` y `src/core/ui/` (copiados de KINTSUGI en la Fase 2).

## Color

| Uso | Token | Valor |
| --- | --- | --- |
| Fondo de página | `--bg` | `#f5f5f7` |
| Tarjetas y listas | `--surface` | `#ffffff` |
| Texto principal | `--label` | `#1d1d1f` |
| Texto secundario | `--label-2` | `#6e6e73` |
| **Acento naranja** (relleno) | `--accent` | `#f56300` |
| Naranja para texto sobre blanco | `--accent-ink` | `#c2410c` (contraste 5.2:1) |
| Acción principal | `--ink` | `#1d1d1f` (negro) |

**Regla del naranja:** marca lo activo y lo importante: ítem seleccionado, interruptores encendidos, foco, marca, cifras destacadas. **Las acciones principales son negras** ("Registrar OT", "Guardar", "Continuar").

Verde, ámbar y rojo se usan **solo** para estados (operativa, en taller, vencido), nunca como decoración. Nunca colores sueltos: siempre tokens.

## Tipografía

Fuente del sistema (SF en Apple; **Inter** en Windows y Android, la más cercana, con tamaño óptico). Espaciado entre letras negativo en títulos grandes y cerca de 0 en el cuerpo. Clases: `t-display`, `t-title1`…`t-caption`, `t-eyebrow`. Tamaños en `rem`. Placas con `DIN Alternate` / `Bahnschrift` mediante `LicensePlate`; datos técnicos con `--font-mono`.

## Movimiento

| Caso | Resorte (`src/core/lib/motion.ts`) |
| --- | --- |
| Interfaz en general | `spring` — sin rebote, ~0.4 s |
| Controles pequeños (interruptor, segmentado) | `springSnappy` — sin rebote, ~0.3 s |
| Después de arrastrar o lanzar | `springMomentum` — rebote leve |

- **Respuesta inmediata:** lo que se presiona se reduce a 97 % al tocar, sin esperar a soltar.
- **Hojas en el celular:** se cierran arrastrando hacia abajo, proyectando el impulso del dedo.
- **Entran y salen por el mismo camino.** El detalle (un nivel más adentro) entra desde la derecha.
- **Hápticos** (Android): solo en momentos con significado — encajar una pestaña, guardar, error.
- Con "Reducir movimiento" no hay desplazamientos ni escalas ni vibración.

## Materiales: Liquid Glass

El vidrio es una **capa funcional que flota sobre el contenido**: navegación, controles y hojas. El contenido (tarjetas, listas, tablas) es sólido y blanco. Nunca vidrio sobre vidrio.

- **Pestañas del celular:** cápsula flotante; la lente sigue al dedo y encaja con el impulso.
- **Barra lateral del escritorio:** panel de vidrio flotante, separado del borde, agrupado por proceso.
- **Hojas y diálogos:** superficie sólida. Escape cierra solo la de arriba.
- "Reducir transparencia" vuelve sólidos los materiales; "Aumentar contraste" agrega bordes.

## Componentes

Los de KINTSUGI (`Button`, `Field`, `Switch`, `EyeIcon`, `SegmentedControl`, `ToggleChips`, `TagInput`, `Combobox`, `LicensePlate`, `QrCode`, `Sheet`/`ConfirmSheet`, `useToast`, `Avatar`, `Badge`, `Notice`, `EmptyState`, `PageHeader`, `Page`, `CameraShell`). Ver la tabla completa en `docs/diseno.md` de KINTSUGI. Antes de crear uno nuevo, revisa si alguno sirve.

Propios de Azkell (se agregan cuando un módulo los necesite, con el mismo lenguaje visual):
- **Tabla densa** para listados grandes (OT, kardex, vales): encabezado fijo, filas de 44 px en celular que se vuelven tarjetas.
- **Gráficos**: misma paleta de tokens; librería por decidir.
- **Mapa** (GPS Wialon): controles de vidrio sobre el mapa, como la cámara.

## Momentos de marca

- **Ingreso:** tarjeta de vidrio con etiquetas flotantes, "negación" lateral ante un error y, al entrar, la **bienvenida**: la tarjeta se vuelve el ícono de Azkell, se anima y se abre sobre la app. Se salta con un toque. *(Ícono por definir.)*
- **Salida:** el reverso, "Hasta pronto, {nombre}". La salida por inactividad o sesión vencida es sin animación.
- **Multiempresa:** el nombre y el logo de la empresa del subdominio aparecen en el login, la barra lateral y el saludo ("Así está Marsisa hoy").
- Estos momentos son pocos a propósito: el resto responde rápido y en silencio.

## Escritura

- Etiquetas específicas ("Órdenes de trabajo", no "Gestión").
- Mensajes que dicen qué pasó y qué hacer.
- Validar al salir del campo, no solo al enviar.
- Fechas y horas en zona de Lima.

## Navegación

- Escritorio: barra lateral agrupada por proceso (Gerencia, Flota, Mantenimiento, Almacén, Operaciones, Tesorería, RRHH, Sistema).
- Celular: 3 pestañas según los permisos + "Más" con todo.
- Cada persona ve solo lo que sus permisos permiten. Durante la migración, los módulos aún no migrados abren su pantalla actual.
