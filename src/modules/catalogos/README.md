# Catálogos

Una sola pantalla (`CatalogoPage.tsx`) para todas las listas simples. Cada catálogo se describe en `configs.ts`: campos, permiso y los endpoints de la versión actual que usa (mismas reglas).

| Ruta en /app | Endpoint | Permiso |
|---|---|---|
| almacen/familias | `/almacen/familias` | cfg_familias |
| almacen/marcas | `/almacen/marcas` | cfg_marcas |
| almacen/unidades | `/almacen/unidades` (abreviatura de hasta 20 letras) | cfg_unidades |
| almacen/sistemas | `/almacen/sistemas` (subsistemas en columna JSON) | cfg_sistemas |
| almacen/almacenes | `/almacen/almacenes` (el Principal no se elimina) | cfg_almacen |
| mantenimiento/tipos-mp | `/tipos-preventivo` (responde `{ data }`) | cfg_mant |
| mantenimiento/personal | `/taller-personal` (costo hora = sueldo ÷ 208) | pers_mant |
| preferencias/situaciones | `/catalogos_taller` + `/cat-situaciones` | cfg_situacion |

Para agregar otro catálogo: una entrada en `CATALOGOS`, una ruta en `src/App.tsx` y un ítem en `src/core/layout/navigation.ts`.
