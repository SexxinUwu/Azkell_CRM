import { exportarExcel } from '../../core/lib/excel';
import { otDetalles, otId, otTipo, pausasDe, tiempoNetoOT, type OrdenTrabajo } from './api';

// Excel de Reportes OT. Mismas 28 columnas y orden que el clásico (modulos/mantenimiento/reportes-ot).
// Las fechas salen como fecha y hora nativas de Excel (exportarExcel convierte 'AAAA-MM-DD HH:mm');
// los minutos y el costo salen como número.

const texto = (v: unknown) => (v == null ? '' : String(v));
const fechaHora = (v: string | null | undefined) => (v ? v.replace('T', ' ').slice(0, 16) : '');
const fecha = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const minutos = (ms: number) => Math.round(ms / 60000);

export async function exportarReportesOT(lista: OrdenTrabajo[]) {
  const encabezados = [
    'N° OT', 'Placa', 'Estado', 'Tipo OT', 'Sub Tipo', 'Sistema', 'Sub Sistema',
    'Supervisor', 'Situación Inicial', 'Observaciones', 'Costo Total (S/)',
    'Ingreso Taller', 'Inicio OT', 'Iniciado Por',
    'Pausa 1', 'Motivo Pausa 1', 'Fin Pausa 1',
    'Pausa 2', 'Motivo Pausa 2', 'Fin Pausa 2',
    'Pausa 3', 'Motivo Pausa 3', 'Fin Pausa 3',
    'Cierre OT', 'Cerrado Por', 'Comentario Cierre',
    'Tiempo Trabajado (min)', 'Tiempo Muerto (min)',
  ];

  const filas = lista.map(ot => {
    const det = otDetalles(ot) as Record<string, unknown>;
    const pausas = pausasDe(ot);
    const t = tiempoNetoOT(ot);
    const pausa = (i: number) => pausas[i];
    return [
      otId(ot),
      texto(ot.placa),
      texto(ot.estado || 'Pendiente'),
      texto(det.tipo_ot || otTipo(ot)),
      texto(det.sub_tipo),
      texto(det.sistema),
      texto(det.sub_sistema),
      texto(det.supervisor || ot.supervisor),
      texto(det.situacion_inicial || ot.situacion),
      texto(det.motivo || ot.observaciones),
      Number(ot.costo_total ?? 0),
      fecha(ot.fecha_ingreso || ot.creado_en),
      fechaHora(ot.fecha_inicio_ot),
      texto(ot.iniciado_por),
      fechaHora(pausa(0)?.inicio), texto(pausa(0)?.motivo), fechaHora(pausa(0)?.fin),
      fechaHora(pausa(1)?.inicio), texto(pausa(1)?.motivo), fechaHora(pausa(1)?.fin),
      fechaHora(pausa(2)?.inicio), texto(pausa(2)?.motivo), fechaHora(pausa(2)?.fin),
      fechaHora(ot.fecha_hora_salida),
      texto(ot.cerrado_por),
      texto(ot.comentario_cierre),
      minutos(t.neto),
      minutos(t.pausado),
    ];
  });

  await exportarExcel('Reportes_OT', 'Reportes OT', encabezados, filas);
}
