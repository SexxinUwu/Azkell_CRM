# Fase 1 — Igualar el esquema de las empresas

Comparación hecha el 2026-10-12 sobre `information_schema` (solo estructura, sin leer datos). MySQL 8.4.9, `lower_case_table_names=0` (los nombres distinguen mayúsculas).

## Bases

| Empresa | Base | Tablas |
| --- | --- | --- |
| Marsisa | `azkell_tenant_marsisa` | 104 |
| Rosymar Perú | `azkell_tenant_rosymarperu` | 98 |
| Yogui Transport | `azkell_tenant_yoguitransport` | 107 |
| Trahesa | `azkell_tenant_trahesa` | 102 |
| (maestra) | `azkell_master` | 3 — esquema Prisma aparte |

**107 tablas en total**, 98 en todas las empresas. Sin vistas, todas con llave primaria, 21 llaves foráneas.
**64 diferencias de columnas**: 21 columnas que faltan en alguna empresa y 43 con definición distinta. La causa es `init_db.js` y los `ALTER` condicionales del código: cada base recibió los cambios en un orden y momento distintos.

Prisma necesita **un solo esquema** para todas las bases. Por eso, antes de crear la migración `0_baseline`, hay que igualarlas.

## Regla general

**Se ensancha, nunca se recorta.** Mientras conviva la versión actual, cada diferencia se resuelve hacia la definición que acepta más:

- Tabla o columna que falta → se crea (vacía o con su valor por defecto).
- Longitud distinta → la mayor (`varchar(20)` y `varchar(100)` → `varchar(100)`).
- `NOT NULL` en unas y nulo en otras → nulo.
- `enum` en unas y `varchar` en otras → `varchar`.
- `text` / `longtext` → `longtext`; `date` / `datetime` → `datetime`.
- Valores por defecto distintos → se conserva el de cada empresa (es configuración de negocio, ver abajo).

Así ningún `INSERT` que hoy funcione dejará de funcionar.

## Casos que necesitan decisión

Revisados con conteos sobre los datos reales:

| Columna | Diferencia | Datos | Propuesta |
| --- | --- | --- | --- |
| `inventario.anaquel` | Marsisa `varchar(50)`; resto `decimal(6,2)` | Marsisa tiene 34 de 956 anaqueles con códigos no numéricos | **`varchar(50)` en todas**: un anaquel es un código, no una cantidad |
| `trabajos_ot.fecha_trabajo` | Marsisa `datetime`; resto `date` | En Marsisa 2 886 de 2 904 tienen hora | **`datetime` en todas** (en las demás la hora queda 00:00) |
| `tipos_mantenimiento.frecuencia_horas` | Marsisa `varchar(50)`; resto `decimal(10,2)` | En Marsisa los 492 valores son números | **`decimal(10,2)` en todas** (excepción a la regla: los datos ya son numéricos) |
| `tipos_mantenimiento.frecuencia_km` | Marsisa `decimal(10,2)`; resto `int` | Ninguno tiene decimales | **`decimal(10,2)` en todas** |
| `placas.placa` y la placa en OT, inspecciones, backlog, rampas | Marsisa `varchar(100)`; resto `varchar(20)` | La más larga mide 14 caracteres | **`varchar(100)`** por la regla general; se puede recortar cuando ya no exista la versión actual |
| `tesoreria_cuentas.comision_porcentaje` | Por defecto 0 % en Marsisa y Yogui; 10 % en Rosymar y Trahesa | — | **Conservar el de cada empresa** fuera del esquema: el valor por defecto pasa a la configuración de la empresa en el código nuevo |
| `tesoreria_cuentas.credito_dias` | Por defecto 0 en Marsisa y Rosymar; 15 en Yogui y Trahesa | — | Igual que el anterior |
| `neumaticos_inspecciones_det.remanente_promedio` | Calculada (`STORED GENERATED`) en Marsisa y Rosymar; normal en Yogui y Trahesa | — | **Calculada en todas** si el código no la escribe; por revisar en el código antes de decidir |

## Tablas que solo existen en algunas empresas

Se crean vacías en las demás (módulos que esas empresas aún no usan):

- `guias_items`, `guias_remitente`, `guias_transportista` — solo Yogui
- `rrhh_licencias`, `rrhh_personal`, `rrhh_sst_registros`, `rrhh_tareo` — faltan en Rosymar
- `tesoreria_cuentas_historial_facturas`, `tesoreria_liquidaciones_gastos` — solo Marsisa y Yogui

## Resultado de la prueba (2026-10-12)

Casos especiales **aprobados**. El SQL está en [`sql/igualacion-2026-10/`](../sql/igualacion-2026-10/) (un archivo por empresa + `resumen.md`), generado con `scripts/igualar_esquemas.js` y verificado con `scripts/comparar_esquemas.js`.

- **Respaldo:** las 6 bases (`azkell_master`, `azkell_fleet` y las 4 empresas) en `C:\Users\teffa\Respaldos_Azkell\2026-10-12_1426\`, **restauradas y verificadas** fila por fila en un MySQL 8.4 aislado.
- **Prueba sobre la copia:** el SQL se aplicó sin errores en segundos. Después: 107 tablas en las 4 empresas, 0 columnas faltantes, tipos idénticos, **0 filas perdidas** (165 462 antes y después).
- **Quedan a propósito 14 diferencias de valor por defecto** (`''` frente a ninguno, y los de tesorería): cambiarlas alteraría lo que guarda la app actual cuando no envía el campo. No afectan a Prisma.
- **Verificado con Prisma:** `prisma db pull` de las 4 empresas igualadas da el **mismo esquema** (107 modelos, 36 listas), salvo las diferencias aceptadas de abajo.
- **Índices duplicados exactos** (mismas columnas que otro índice que ya los cubre, por ejemplo tres índices de `viaje` en Marsisa o `uq_idregistro`, que repite la llave primaria): se quitan. No cambian ningún comportamiento y solo hacían más lentas las escrituras.
- **Índices:** se agregan los normales que faltan. Dos únicos no se agregan: `tipos_mantenimiento.uq_config` (solo Marsisa) y `flota_disponibilidad.uq_placa_camion` (Marsisa tiene placas repetidas).

### Errores del sistema actual encontrados y corregidos

1. **Fleetrun no importaba en Yogui ni Trahesa.** `init_db.js` creaba `fleetrun` con tres columnas de la tabla de secuencias (`modulo` obligatoria y única, `prefijo`, `ultimo_numero`). En modo estricto, todo `INSERT` fallaba. Se quitan en esas dos empresas (tabla vacía) y se corrigió `init_db.js`.
2. **Promedio de neumáticos en 0** en Yogui y Trahesa: la columna debía ser calculada. Se convierte (tabla vacía) y se corrigió `init_db.js`.

Ambos se probaron en la copia con el `INSERT` real del código: funcionan en las 4 empresas.

## Cómo se aplicaría (sin detener la app)

1. **Respaldo** completo de las 4 bases (`mysqldump`) y prueba de que el respaldo se puede restaurar.
2. Un script genera el SQL de igualación **por empresa** y lo deja para revisión (no lo ejecuta).
3. Se aplica primero sobre una **copia** de Marsisa (la más distinta) y se prueba la app actual contra esa copia.
4. Se aplica en producción, una empresa a la vez, en horario de poco uso. Son `ALTER TABLE` que ensanchan columnas: MySQL 8 los hace en línea, en segundos.
5. Se vuelve a comparar: 0 diferencias.
6. `prisma db pull` → modelos por módulo → migración `0_baseline` marcada como aplicada en las 4 bases.
7. `init_db.js` deja de crear y modificar tablas al arrancar; una empresa nueva se crea con `prisma migrate deploy`.

Pendiente también comparar **índices** (no incluido en esta pasada).
