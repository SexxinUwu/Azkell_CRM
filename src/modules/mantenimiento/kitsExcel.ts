import { api, ApiError } from '../../core/api/client';

// Excel de kits: copia de modulos/mantenimiento/kits-mp/logica.js (kitsDescargarPlantilla, kitsExportarExcel,
// kitsImportarExcel). Usa la misma librería (xlsx / SheetJS), los mismos nombres de hoja y de archivo,
// los mismos encabezados y los mismos mensajes (alert).

type Registro = Record<string, unknown>;

export async function descargarPlantillaKits() {
  const XLSX = await import('xlsx');
  const plantillaData = [
    { 'Marca': 'VOLVO', 'Modelo': 'FH 500', 'Tipo MP': 'MP1', 'Alias Kit': 'Kit Filtros Motor', 'Repuesto / Ítem': 'FILTRO DE ACEITE', 'Cantidad': 2, 'Unidad': 'UND', 'Costo Unitario': 65.00, 'Observaciones': 'Cambio preventivo' },
    { 'Marca': 'VOLVO', 'Modelo': 'FH 500', 'Tipo MP': 'MP1', 'Alias Kit': 'Kit Filtros Motor', 'Repuesto / Ítem': 'ACEITE DE MOTOR 15W-40', 'Cantidad': 10, 'Unidad': 'GAL', 'Costo Unitario': 85.00, 'Observaciones': '' },
  ];
  const ws = XLSX.utils.json_to_sheet(plantillaData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Kits');
  XLSX.writeFile(wb, 'Plantilla_Kits_Mantenimiento.xlsx');
}

/** kitsExportarExcel: las filas que se ven (filtradas), con las mismas columnas del clásico. */
export async function exportarKitsExcel(filas: Registro[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kits_MP');
  XLSX.writeFile(wb, `Kits_Mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * kitsImportarExcel: lee la primera hoja, arma los ítems y los envía. Los mensajes son los del clásico.
 * Devuelve true si la tabla debe recargarse (el clásico recarga tras avisar).
 */
export async function importarKitsExcel(archivo: File): Promise<boolean> {
  let items: Registro[];
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Registro>(ws);
    if (!json.length) {
      window.alert('El archivo Excel está vacío.');
      return false;
    }
    // r['Marca'] || r['marca'] || '' … igual que el clásico (el .trim() de un número lanza error y cae en "Error leyendo")
    const pick = (r: Registro, ...claves: string[]) => {
      let v: unknown = '';
      for (const c of claves) { v = r[c]; if (v) return v; }
      return v;
    };
    items = json.map(r => {
      const costo = parseFloat(String(pick(r, 'Costo Unitario', 'costo_unitario') || 0)) || 0;
      const cantidad = parseFloat(String(pick(r, 'Cantidad', 'cantidad') || 1)) || 1;
      return {
        marca_vehiculo: (pick(r, 'Marca', 'marca') as string || '').trim().toUpperCase(),
        modelo_vehiculo: ((pick(r, 'Modelo', 'modelo') as string) || 'TODOS LOS MODELOS').trim().toUpperCase(),
        tipo_mp: ((pick(r, 'Tipo MP', 'tipo_mp') as string) || 'MP1').trim().toUpperCase(),
        nombre_kit: ((pick(r, 'Alias Kit', 'nombre_kit') as string) || '').trim(),
        item_nombre: ((pick(r, 'Repuesto / Ítem', 'item_nombre', 'Repuesto') as string) || '').trim(),
        cantidad,
        unidad_medida: ((pick(r, 'Unidad', 'unidad_medida') as string) || 'UND').trim().toUpperCase(),
        costo_unitario: costo,
        costo_total: cantidad * costo,
        observaciones: ((pick(r, 'Observaciones', 'observaciones') as string) || '').trim(),
      };
    }).filter(x => x.marca_vehiculo && x.item_nombre);
    if (!items.length) {
      window.alert('No se encontraron registros válidos con columnas Marca y Repuesto.');
      return false;
    }
  } catch {
    window.alert('Error leyendo el archivo Excel.');
    return false;
  }

  // El clásico avisa el éxito cuando el servidor responde (aunque sea con error HTTP) y solo avisa error si no hubo respuesta
  try {
    await api('/mantenimiento-kits/importarMasivo', { method: 'POST', body: { items } });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status === 0) {
      window.alert('Error al enviar la importación masiva.');
      return false;
    }
  }
  window.alert(`Se importaron ${items.length} registros exitosamente.`);
  return true;
}
