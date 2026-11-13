import './seguimiento.css';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { num } from './SeguimientoServicio';

/** Lo que el resumen necesita de una orden de servicio. */
export interface OrdenBase {
  codigo_orden: string; cliente_nombre: string | null; tipo_servicio: string | null; es_retorno: number | boolean | null;
  origen: string | null; destino: string | null; distancia_km?: number | string | null;
  moneda: string | null; tipo_cambio: number | string | null; costo_flete: number | string | null; impuesto: string | null; peso_estimado: number | string | null; peso_guias?: number | string | null; guias_n?: number;
  remitente_generador: string | null; destinatario: string | null; fecha_fmt: string | null; fecha_entrega_fmt: string | null; creado_fmt?: string | null;
  viaje: string | null; conductor: string | null; placa_tracto: string | null; ejecucion: string | null; tercero_nombre: string | null;
}

const fmt = (v: unknown, d = 0) => num(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const simbolo = (m: string | null) => (/DOL/i.test(String(m ?? '')) ? 'US$' : 'S/');
const tipoServicio = (t: string | null) => (/LOCAL/i.test(String(t ?? '')) ? 'Local' : /NACIONAL/i.test(String(t ?? '')) ? 'Nacional' : t || '—');
export const fechaCorta = (f?: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
export const plazoDias = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
  return d;
};

/** Cómo se aplicó el IGV al flete: incluido, aparte o sin IGV. */
export type ModoIgv = 'incluye' | 'mas' | 'no';
export const modoIgv = (impuesto: string | null): ModoIgv => (/M[ÁA]S/i.test(String(impuesto ?? '')) ? 'mas' : /NO\s*APLICA/i.test(String(impuesto ?? '')) ? 'no' : 'incluye');
export const etiquetaIgv = (impuesto: string | null) => ({ incluye: 'Incluye IGV', mas: 'Más IGV', no: 'Sin IGV' }[modoIgv(impuesto)]);

/**
 * Desglose del flete según lo que se acordó: el monto que se escribe es el flete. Con «incluye IGV» ese monto ya es el total;
 * con «más IGV» el IGV se suma. La detracción del 4 % (redondeada al sol) se aplica al total desde S/ 700.
 */
export function tarifaDe(flete: number, impuesto: string | null) {
  const modo = modoIgv(impuesto);
  const base = modo === 'incluye' ? flete / 1.18 : flete;
  const igv = modo === 'no' ? 0 : modo === 'incluye' ? flete - base : flete * 0.18;
  const total = modo === 'mas' ? flete + igv : flete;
  const detr = total > 700 ? Math.round(total * 0.04) : 0;
  return { modo, base, igv, total, detr, neto: total - detr };
}

const PILL: Record<string, string> = { PENDIENTE: 'Pendiente', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ejecución', ENTREGADO: 'Entregado', ANULADO: 'Anulado' };

/** Cabecera de la orden: el cliente y lo que se le vende (ruta, tramo, plazo), con el camión sobre la línea de etapas. */
export function HeroServicio({ o, estado, datos }: { o: OrdenBase; estado: string; datos: ReactNode }) {
  const dist = num(o.distancia_km);
  const dias = plazoDias(o.fecha_fmt, o.fecha_entrega_fmt);
  const tercero = o.ejecucion === 'TERCERO';
  const quien = o.placa_tracto || (tercero ? o.tercero_nombre : null);
  return (
    <section className="vh vh--os">
      <div className="vh__top">
        <span className="vh__eyebrow">{o.codigo_orden} · {tipoServicio(o.tipo_servicio)} · {o.es_retorno ? 'retorno con carga' : 'ida'}</span>
        <span className={`seg__pill${estado === 'EN_EJECUCION' ? ' seg__pill--vivo' : ''}${estado === 'ANULADO' ? ' seg__pill--gris' : ''}`}><i />{PILL[estado] ?? estado}</span>
      </div>
      <h3 className="vh__ruta">{o.cliente_nombre || 'Sin cliente'}</h3>
      <p className="vh__tramo"><strong>{o.origen || 'Sin origen'}</strong> <ArrowRight size={16} aria-hidden /> <strong>{o.destino || 'Sin destino'}</strong>{dist > 0 ? <span>{fmt(dist)} km</span> : null}</p>
      {datos}
      <div className="vh__cards">
        <div className="vh__card"><span>Viaje</span><strong>{o.viaje || 'Sin viaje todavía'}</strong>
          <small>{o.viaje ? [o.conductor, tercero ? 'Transportista tercero' : o.conductor || quien ? 'Flota propia' : null].filter(Boolean).join(' · ') || 'Aún sin conductor ni unidad' : 'Genera o asigna un viaje'}</small></div>
        <div className="vh__card"><span>Plazo</span><strong>{dias == null ? '—' : dias <= 0 ? 'Mismo día' : `${dias} ${dias === 1 ? 'día' : 'días'}`}</strong>
          <small>{o.fecha_entrega_fmt ? `Entrega estimada ${fechaCorta(o.fecha_entrega_fmt)}` : 'Sin fecha de entrega'}</small></div>
        {quien && <div className="vh__card"><span>Unidad</span><strong>{o.placa_tracto || 'Tercero'}</strong><small>{tercero ? o.tercero_nombre : o.conductor}</small></div>}
      </div>
    </section>
  );
}

/** Indicadores comerciales: lo que se factura y se cobra, la distancia y el peso. */
export function KpisServicio({ o }: { o: OrdenBase }) {
  const flete = num(o.costo_flete);
  const t = tarifaDe(flete, o.impuesto);
  const m = simbolo(o.moneda);
  const dolares = /DOL/i.test(String(o.moneda ?? ''));
  const dist = num(o.distancia_km);
  return (
    <div className="vk">
      <div className="vk__t"><span className="vk__l">Flete</span><strong>{flete > 0 ? `${m} ${fmt(flete, 2)}` : '—'}</strong><em>{flete > 0 ? etiquetaIgv(o.impuesto) : 'Sin tarifa acordada'}</em></div>
      <div className="vk__t"><span className="vk__l">Neto a cobrar</span><strong>{flete > 0 ? `${m} ${fmt(t.neto, 2)}` : '—'}</strong><em>{flete > 0 ? (t.detr ? `Detracción ${m} ${fmt(t.detr, 2)}` : 'Sin detracción') : 'Tras la detracción'}</em></div>
      <div className="vk__t"><span className="vk__l">Distancia</span><strong>{dist > 0 ? <>{fmt(dist)} <small>km</small></> : '—'}</strong><em>{tipoServicio(o.tipo_servicio)}</em></div>
      <div className="vk__t"><span className="vk__l">Peso</span><strong>{num(o.peso_guias) > 0 ? <>{fmt(o.peso_guias)} <small>kg</small></> : '—'}</strong><em>{num(o.peso_guias) > 0 ? `Según ${o.guias_n ?? ''} ${o.guias_n === 1 ? 'guía' : 'guías'}`.replace('  ', ' ') : 'Sin guías vinculadas'}</em></div>
      {dolares && <div className="vk__t"><span className="vk__l">Tipo de cambio</span><strong>{num(o.tipo_cambio).toFixed(3)}</strong><em>Dólares a soles</em></div>}
    </div>
  );
}

/** Quién interviene y cuándo: cliente, remitente, destinatario y fechas del servicio. */
export function PartesServicio({ o }: { o: OrdenBase }) {
  const filas: Array<[string, string | null]> = [
    ['Cliente', o.cliente_nombre],
    ['Remitente', o.remitente_generador],
    ['Destinatario', o.destinatario],
    ['Tipo de servicio', `${tipoServicio(o.tipo_servicio)} · ${o.es_retorno ? 'Retorno con carga' : 'Ida'}`],
    ['Fecha del servicio', o.fecha_fmt ? fechaCorta(o.fecha_fmt) : null],
    ['Entrega estimada', o.fecha_entrega_fmt ? fechaCorta(o.fecha_entrega_fmt) : null],
  ];
  return (
    <section className="vu__ficha vu__ficha--cols">
      <h4 className="vj-titulo">Partes del servicio</h4>
      <dl>
        {filas.filter(f => f[1]).map(([k, val]) => <div key={k} className="vu__fila"><dt>{k}</dt><dd>{val}</dd></div>)}
      </dl>
    </section>
  );
}

/** Desglose de la tarifa como un recibo: flete acordado arriba y, debajo, base, IGV, total, detracción y neto. */
export function DesgloseTarifa({ o }: { o: OrdenBase }) {
  const flete = num(o.costo_flete);
  const t = tarifaDe(flete, o.impuesto);
  const m = simbolo(o.moneda);
  const money = (x: number) => `${m} ${fmt(x, 2)}`;
  const dolares = /DOL/i.test(String(o.moneda ?? ''));
  return (
    <section className="td">
      <div className="td__top">
        <span className="td__label">Flete acordado</span>
        <strong className="td__monto">{money(flete)}</strong>
        <span className="td__tag">{etiquetaIgv(o.impuesto)}</span>
      </div>
      <dl className="td__filas">
        {t.modo !== 'no' && <div className="td__fila"><dt>Base imponible</dt><dd>{money(t.base)}</dd></div>}
        {t.modo !== 'no' && <div className="td__fila"><dt>IGV 18 %</dt><dd>{money(t.igv)}</dd></div>}
        <div className="td__fila td__fila--fuerte"><dt>Total a facturar</dt><dd>{money(t.total)}</dd></div>
        <div className="td__fila"><dt>Detracción 4 %{t.detr ? '' : ' · no aplica'}</dt><dd>{t.detr ? `− ${money(t.detr)}` : '—'}</dd></div>
        <div className="td__fila td__fila--fuerte"><dt>Neto a cobrar</dt><dd>{money(t.neto)}</dd></div>
      </dl>
      {dolares && <p className="os-nota">Tipo de cambio {num(o.tipo_cambio).toFixed(3)}: equivale a S/ {fmt(t.total * num(o.tipo_cambio), 2)} de total.</p>}
    </section>
  );
}
