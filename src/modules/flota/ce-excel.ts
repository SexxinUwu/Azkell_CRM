// Exportación a Excel del Checklist de Entrega de Vehículos: hoja "Actas" (cada campo del acta)
// e "Inventario" (una fila por acta y por ítem de la plantilla, igual que el checklist y el PDF).
import { exportarExcelHojas, type HojaExcel } from '../../core/lib/excel';
import { calificacionDe, ETIQUETA_CALIFICACION, leerPartes, PLANTILLA_FABRICA } from './ce-plantilla';
import type { CategoriaPlantilla, EntregaVehiculo } from './ce-tipos';

type Celda = string | number | Date | null | undefined;

/**
 * Fecha como celda de Excel con formato dd/mm/aaaa (el valor sigue siendo fecha, para filtros y orden).
 * exportarExcelHojas deja pasar las celdas {value, format} tal cual; su tipo no lo declara, de ahí el cast.
 */
function fechaCelda(f: string | null | undefined): Celda {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  if (!m) return '';
  const value = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return { value, format: 'dd/mm/yyyy' } as unknown as Celda;
}

const ENCABEZADOS_ACTAS = [
  'Nº inventario', 'Fecha', 'Motivo', 'Entregado por', 'Recibido por', 'Clase', 'Marca', 'Tipo', 'Modelo',
  'Placa', 'Color', 'Cilindros', 'Nº motor', 'Nº serie / VIN', 'Kilometraje', 'Configuración', 'Cabina',
  'Carrocería', 'Observaciones', 'Empresa',
];

const ENCABEZADOS_INVENTARIO = ['Nº inventario', 'Fecha', 'Placa', 'Categoría', 'Ítem', 'Estado', 'Cantidad'];

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function filaActa(r: EntregaVehiculo): Celda[] {
  const km = Number(r.kilometraje);
  return [
    texto(r.numero_inventario) || texto(r.id),
    fechaCelda(r.fecha),
    texto(r.motivo),
    texto(r.quien_entrega),
    texto(r.quien_recibe),
    texto(r.clase),
    texto(r.marca),
    texto(r.tipo),
    texto(r.modelo),
    texto(r.placa).toUpperCase(),
    texto(r.color),
    texto(r.cilindros),
    texto(r.numero_motor),
    texto(r.numero_serie),
    Number.isFinite(km) ? km : '',
    texto(r.configuracion),
    r.estilo_cabina === 'trompa' ? 'Trompa' : r.estilo_cabina === 'chata' ? 'Chata' : '',
    r.estilo_carroceria === 'plataforma' ? 'Plataforma' : r.estilo_carroceria === 'furgon' ? 'Furgón' : '',
    texto(r.observaciones),
    texto(r.empresa),
  ];
}

function filasInventario(r: EntregaVehiculo, grupos: CategoriaPlantilla[]): Celda[][] {
  const partes = leerPartes(r.inventario_partes_json);
  const nro = texto(r.numero_inventario) || texto(r.id);
  const fecha = fechaCelda(r.fecha);
  const placa = texto(r.placa).toUpperCase();
  return grupos.flatMap(g => g.items.map(item => {
    const { estado, cantidad } = calificacionDe(partes, g, item);
    return [nro, fecha, placa, g.titulo, item, ETIQUETA_CALIFICACION[estado], cantidad];
  }));
}

/**
 * Descarga un .xlsx con las hojas Actas e Inventario. Si no hay plantilla (null), usa la de fábrica.
 * Las fechas van en dd/mm/aaaa.
 */
export async function exportarEntregasExcel(registros: EntregaVehiculo[], plantilla: CategoriaPlantilla[] | null): Promise<void> {
  const grupos = plantilla ?? PLANTILLA_FABRICA;
  const hojas: HojaExcel[] = [
    { hoja: 'Actas', encabezados: ENCABEZADOS_ACTAS, filas: registros.map(filaActa) },
    { hoja: 'Inventario', encabezados: ENCABEZADOS_INVENTARIO, filas: registros.flatMap(r => filasInventario(r, grupos)) },
  ];
  await exportarExcelHojas('Entrega_de_vehiculos', hojas);
}
