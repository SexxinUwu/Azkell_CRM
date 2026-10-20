// Datos que entrega GET /api/tv/feed (sin sesión; la empresa sale del subdominio)
export interface Unidad {
  placa: string; nombre_wialon?: string; empresa?: string; velocidad?: number; estado_motor?: string;
  marca_modelo?: string; tipo_vehiculo?: string; km?: number | string; lat?: number; lng?: number; curso?: number;
  ignicion?: boolean | number; voltaje?: number | string;
}
export interface OtTv { id_ot?: string; placa?: string; tipo_ot?: string; sub_tipo?: string; motivo?: string; supervisor?: string; mecanico?: string; rampa?: string; fecha_ingreso?: string; estado?: string; tecnicos?: string[] }
export interface BacklogTv { backlog_id?: string; placa?: string; tema?: string; tarea?: string; km?: string | number; reportado_por?: string; ticket_ot?: string; fecha_reporte?: string; estado?: string }
export interface FallaTv { folio?: string; placa?: string; conductor?: string; procedencia?: string; descripcion?: string; fecha?: string; estado?: string }
export interface RampaTv { rampa?: string; placa?: string; hora_ingreso?: string; hora_salida?: string; trabajo?: string; km?: string | number; situacion?: string; tipo_zona?: string; tecnicos?: string[] }

type Kpis = Record<string, number | undefined>;
export interface Feed {
  ok: boolean; empresa?: string;
  gps: { kpis: Kpis; unidades: Unidad[] };
  ots: { kpis: Kpis; list: OtTv[] };
  backlog: { kpis: Kpis; list: BacklogTv[] };
  fallas: { kpis: Kpis; list: FallaTv[] };
  rampas: { kpis: Kpis; list: RampaTv[] };
}
