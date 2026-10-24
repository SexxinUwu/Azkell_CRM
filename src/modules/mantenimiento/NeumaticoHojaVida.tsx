import './NeumaticoHojaVida.css';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Calculator, CircleDollarSign, Disc3, Gauge, History, MapPin, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../../core/api/client';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { useColores } from '../../core/ui/Graficos';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Sheet } from '../../core/ui/Sheet';
import { MM_CRITICO, MM_PREVENTIVO } from './neumaticosSemaforo';

// Hoja de vida de una llanta (GET /neumaticos/llantas/:codigo): cabecera, cifras de costo y km,
// gráfico de remanente promedio contra kilometraje, y las líneas de tiempo de instalaciones y movimientos.

// ---- Contrato de la API (tal como llega; los decimales de MySQL pueden venir como texto) ----
interface LlantaRaw {
  codigo?: string | null; marca?: string | null; medida?: string | null; modelo?: string | null; estado?: string | null;
  almacen?: string | null; placa_actual?: string | null; posicion_actual?: string | null;
  vida?: number | string | null; reencauches?: number | string | null; km_acumulado?: number | string | null;
  costo_compra?: number | string | null; costo_reencauches?: number | string | null; cpk?: number | string | null;
}
interface InstalacionRaw {
  placa?: string | null; posicion?: string | null; fecha_in?: string | null; km_in?: number | string | null;
  fecha_out?: string | null; km_out?: number | string | null; km_recorridos?: number | string | null;
}
interface MovimientoRaw {
  fecha?: string | null; tipo?: string | null; origen?: string | null; destino?: string | null; placa?: string | null;
  posicion?: string | null; km?: number | string | null; usuario?: string | null; observacion?: string | null;
}
interface MedicionRaw { fecha?: string | null; r1?: number | string | null; r2?: number | string | null; r3?: number | string | null; km?: number | string | null }
interface RespLlanta {
  ok?: boolean; error?: string;
  llanta?: LlantaRaw | null; instalaciones?: InstalacionRaw[] | null; movimientos?: MovimientoRaw[] | null; mediciones?: MedicionRaw[] | null;
}

// ---- Modelo ya normalizado para la pantalla ----
interface Llanta {
  codigo: string; marca: string | null; medida: string | null; modelo: string | null; estado: string | null;
  vida: string | null; ubicacion: string; reencauches: number | null; kmAcumulado: number | null;
  costoCompra: number | null; costoReencauches: number | null; cpk: number | null;
}
interface Instalacion {
  placa: string | null; posicion: string | null; fechaIn: string | null; kmIn: number | null;
  fechaOut: string | null; kmOut: number | null; kmRecorridos: number | null;
}
interface Movimiento {
  fecha: string | null; tipo: string | null; origen: string | null; destino: string | null; placa: string | null;
  posicion: string | null; km: number | null; usuario: string | null; observacion: string | null;
}
interface Medicion { fecha: string | null; prom: number | null; km: number | null }
interface Hoja { llanta: Llanta | null; instalaciones: Instalacion[]; movimientos: Movimiento[]; mediciones: Medicion[] }

// ---- Utilidades de formato y normalización ----
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
/** Fecha como AAAA-MM-DD (acepta también ISO con hora) */
const isoDia = (v: unknown): string | null => {
  const m = String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const fmtDia = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtKm = (n: number | null): string => (n === null ? '—' : `${Math.round(n).toLocaleString('es-PE')} km`);
const fmtSoles = (n: number | null): string =>
  n === null ? '—' : `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Vida: el número 0 a 3 se muestra como R0 a R3; si llega como texto (p. ej. "R2"), se muestra tal cual */
const fmtVida = (v: unknown): string | null => {
  const n = num(v);
  return n !== null ? `R${n}` : txt(v);
};
/** Remanente promedio de una medición: solo cuentan las mediciones de la llanta con valor mayor a 0 (0 = sin medir) */
const promedioMm = (r1: unknown, r2: unknown, r3: unknown): number | null => {
  const valores = [r1, r2, r3].map(num).filter((v): v is number => v !== null && v > 0);
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
};
const porFechaDesc = <T,>(f: (x: T) => string | null) => (a: T, b: T) => (f(b) ?? '').localeCompare(f(a) ?? '');

function normalizar(r: RespLlanta): Hoja {
  const l = r.llanta;
  const placa = txt(l?.placa_actual);
  const posicion = txt(l?.posicion_actual);
  return {
    llanta: l ? {
      codigo: txt(l.codigo) ?? '—',
      marca: txt(l.marca), medida: txt(l.medida), modelo: txt(l.modelo), estado: txt(l.estado),
      vida: fmtVida(l.vida),
      ubicacion: placa ? `${placa}${posicion ? ` · ${posicion}` : ''}` : (txt(l.almacen) ?? 'Almacén'),
      reencauches: num(l.reencauches), kmAcumulado: num(l.km_acumulado),
      costoCompra: num(l.costo_compra), costoReencauches: num(l.costo_reencauches), cpk: num(l.cpk),
    } : null,
    instalaciones: (r.instalaciones ?? []).map(i => ({
      placa: txt(i.placa), posicion: txt(i.posicion), fechaIn: isoDia(i.fecha_in), kmIn: num(i.km_in),
      fechaOut: isoDia(i.fecha_out), kmOut: num(i.km_out), kmRecorridos: num(i.km_recorridos),
    })).sort(porFechaDesc(i => i.fechaIn)),
    movimientos: (r.movimientos ?? []).map(m => ({
      fecha: isoDia(m.fecha), tipo: txt(m.tipo), origen: txt(m.origen), destino: txt(m.destino), placa: txt(m.placa),
      posicion: txt(m.posicion), km: num(m.km), usuario: txt(m.usuario), observacion: txt(m.observacion),
    })).sort(porFechaDesc(m => m.fecha)),
    mediciones: (r.mediciones ?? []).map(m => ({
      fecha: isoDia(m.fecha), prom: promedioMm(m.r1, m.r2, m.r3), km: num(m.km),
    })),
  };
}

function Campo({ etiqueta, valor, icono, clase = '' }: { etiqueta: string; valor: string; icono?: ReactNode; clase?: string }) {
  return (
    <div className={`hv__campo ${clase}`.trim()}>
      <span className="hv__campo-etiqueta">{icono}{etiqueta}</span>
      <strong className="hv__campo-valor">{valor}</strong>
    </div>
  );
}

/** Remanente promedio (mm) contra kilómetros. Las líneas de referencia son los umbrales del semáforo. */
function GraficoDesgaste({ puntos }: { puntos: { km: number; prom: number }[] }) {
  const [acento, secundario, grilla, rojo, ambar] = useColores(['var(--accent)', 'var(--label-2)', 'var(--separator)', 'var(--red-ink)', 'var(--amber-ink)']);
  return (
    <div className="hv__grafico">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={grilla} strokeDasharray="3 4" />
          <XAxis type="number" dataKey="km" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false}
            tickFormatter={v => Math.round(Number(v)).toLocaleString('es-PE')} tick={{ fill: secundario, fontSize: 11 }} />
          <YAxis width={60} domain={[0, 'auto']} tickLine={false} axisLine={false}
            tickFormatter={v => `${v} mm`} tick={{ fill: secundario, fontSize: 11 }} />
          <ReferenceLine y={MM_CRITICO} stroke={rojo} strokeDasharray="5 4"
            label={{ value: `Crítico ${MM_CRITICO} mm`, position: 'insideTopRight', fill: rojo, fontSize: 11 }} />
          <ReferenceLine y={MM_PREVENTIVO} stroke={ambar} strokeDasharray="5 4"
            label={{ value: `Preventivo ${MM_PREVENTIVO} mm`, position: 'insideTopRight', fill: ambar, fontSize: 11 }} />
          <Tooltip formatter={(v) => `${Number(v).toFixed(1)} mm`} labelFormatter={(km) => fmtKm(Number(km))} />
          <Line type="monotone" dataKey="prom" name="Remanente promedio" stroke={acento} strokeWidth={2.5}
            dot={{ r: 4, fill: acento, strokeWidth: 0 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Contenido({ hoja, llanta }: { hoja: Hoja; llanta: Llanta }) {
  const costoTotal = llanta.costoCompra === null && llanta.costoReencauches === null
    ? null
    : (llanta.costoCompra ?? 0) + (llanta.costoReencauches ?? 0);
  const puntos = hoja.mediciones
    .flatMap(m => (m.prom !== null && m.km !== null ? [{ km: m.km, prom: m.prom }] : []))
    .sort((a, b) => a.km - b.km);

  return (
    <div className="hv">
      <header className="hv__cab">
        <div className="hv__codigo">
          <span>Código</span>
          <strong>{llanta.codigo}</strong>
        </div>
        <div className="hv__pills">
          {llanta.estado && <span className="hv__pill">{llanta.estado}</span>}
          {llanta.vida && <span className="hv__pill hv__pill--vida">Vida {llanta.vida}</span>}
        </div>
      </header>

      <div className="hv__campos">
        <Campo etiqueta="Marca" valor={llanta.marca ?? '—'} />
        <Campo etiqueta="Medida" valor={llanta.medida ?? '—'} />
        <Campo etiqueta="Modelo" valor={llanta.modelo ?? '—'} />
        <Campo etiqueta="Ubicación" valor={llanta.ubicacion} icono={<MapPin size={13} />} />
      </div>

      <div className="hv__cifras">
        <Campo clase="hv__campo--cifra" etiqueta="Km acumulados" valor={fmtKm(llanta.kmAcumulado)} icono={<Gauge size={13} />} />
        <Campo clase="hv__campo--cifra" etiqueta="Reencauches" valor={llanta.reencauches === null ? '—' : String(llanta.reencauches)} icono={<RefreshCw size={13} />} />
        <Campo clase="hv__campo--cifra" etiqueta="CPK (S/ por km)"
          valor={llanta.cpk === null ? '—' : `S/ ${llanta.cpk.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
          icono={<Calculator size={13} />} />
        <Campo clase="hv__campo--cifra" etiqueta="Costo total" valor={fmtSoles(costoTotal)} icono={<CircleDollarSign size={13} />} />
      </div>

      <section className="hv__seccion">
        <h3>Desgaste: remanente promedio contra kilómetros</h3>
        {puntos.length > 0 ? <GraficoDesgaste puntos={puntos} /> : (
          <EmptyState icon={<Gauge size={22} />} title="Sin mediciones con kilometraje">
            Hace falta una inspección con odómetro para graficar el desgaste.
          </EmptyState>
        )}
      </section>

      <section className="hv__seccion">
        <h3>Instalaciones ({hoja.instalaciones.length})</h3>
        {hoja.instalaciones.length === 0 ? (
          <EmptyState icon={<Disc3 size={22} />} title="Sin instalaciones registradas" />
        ) : (
          <ol className="hv__linea">
            {hoja.instalaciones.map((i, n) => (
              <li key={`${i.placa ?? 'x'}-${i.fechaIn ?? n}-${n}`}>
                <div className="hv__item-cab">
                  <span className="hv__item-titulo">
                    {i.placa ? <LicensePlate plate={i.placa} size="sm" /> : <strong>Sin placa</strong>}
                    {i.posicion && <span className="hv__pill">{i.posicion}</span>}
                  </span>
                  <span className="hv__item-fecha">{fmtDia(i.fechaIn)} → {i.fechaOut ? fmtDia(i.fechaOut) : 'Actual'}</span>
                </div>
                <div className="hv__item-datos">
                  <span>Km entrada <strong>{fmtKm(i.kmIn)}</strong></span>
                  <span>Km salida <strong>{fmtKm(i.kmOut)}</strong></span>
                  <span>Recorrido <strong>{fmtKm(i.kmRecorridos)}</strong></span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="hv__seccion">
        <h3>Movimientos ({hoja.movimientos.length})</h3>
        {hoja.movimientos.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="Sin movimientos registrados" />
        ) : (
          <ol className="hv__linea">
            {hoja.movimientos.map((m, n) => (
              <li key={`${m.fecha ?? 'x'}-${m.tipo ?? ''}-${n}`}>
                <div className="hv__item-cab">
                  <span className="hv__pill">{m.tipo ?? 'Movimiento'}</span>
                  <span className="hv__item-fecha">{fmtDia(m.fecha)}</span>
                </div>
                <div className="hv__item-ruta">
                  <span>{m.origen ?? '—'}</span><ArrowRight size={14} aria-hidden /><span>{m.destino ?? '—'}</span>
                </div>
                <div className="hv__item-datos">
                  {m.placa && <span>Unidad <strong>{m.placa}{m.posicion ? ` · ${m.posicion}` : ''}</strong></span>}
                  <span>Km <strong>{fmtKm(m.km)}</strong></span>
                  {m.usuario && <span>Por <strong>{m.usuario}</strong></span>}
                </div>
                {m.observacion && <p className="hv__item-obs">{m.observacion}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * Hoja de vida de una llanta. Se abre con el código de la llanta; con `codigo` en null queda cerrada.
 * Un error del servidor se muestra como aviso dentro de la hoja, sin romper la pantalla de atrás.
 */
export function NeumaticoHojaVida({ codigo, onClose }: { codigo: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<Hoja>({
    queryKey: ['mant', 'neumatico-hoja-vida', codigo],
    enabled: codigo !== null,
    queryFn: async () => {
      const r = await api<RespLlanta>(`/neumaticos/llantas/${encodeURIComponent(codigo ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar la hoja de vida');
      return normalizar(r);
    },
  });

  return (
    <Sheet open={codigo !== null} onClose={onClose} title={codigo ? `Hoja de vida · ${codigo}` : 'Hoja de vida'} ancho
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {isLoading && <PageLoader />}
      {data && !data.llanta && !error && <Notice tone="error">No se encontró la llanta {codigo}.</Notice>}
      {data?.llanta && <Contenido hoja={data} llanta={data.llanta} />}
    </Sheet>
  );
}
