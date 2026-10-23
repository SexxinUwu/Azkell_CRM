import './mant.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CheckCircle2, Clock,
  DollarSign, FileText, History, LayoutDashboard, Plus,
  ScrollText, ShieldCheck, Sun,
  Truck, Wrench,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Page, PageHeader } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { BarrasGrafico, DonaGrafico } from '../../core/ui/Graficos';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { useFleetrunStats, useEmpresaNombre, PanelEstadoFlota } from './FleetrunPage';
import { api } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import {
  formatoDuracion, otDetalles, otId, otTipo,
  useCatalogosTaller, useOrdenesTrabajoData, useStatusRampa,
  type OrdenTrabajo, type RampaEntrada,
} from './api';
import { enReporte, type CatRampa } from './rampasReporte';
import { clavePlaca, useInspecciones, useInspeccionesNeumaticos, type Inspeccion } from '../inspecciones/api';
import { evaluarCiclo } from '../inspecciones/vigencia';
import { usePlacas } from '../placas/api';
import { InspeccionFicha } from '../inspecciones/InspeccionFicha';
import { useDisponibilidad } from '../flota/api';
import { cifrasDisponibilidad, porcentajeOperativa } from '../flota/disponibilidadCifras';
import { horasTxt, indicadoresTaller, sumaCostoEnPeriodo } from './tiemposTaller';

// ─── Tipos y Helpers ──────────────────────────────────────────────────────────

const fechaLimaDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
};

type RangoTiempo = 'hoy' | 'semana' | 'mes' | '30d';

interface FallasStats {
  total?: number;
  abiertas?: number;
  criticas?: number;
  sin_stock?: number;
  hoy?: number;
}

/** Clima real de Base Lurigancho; `null` cuando la consulta no responde (no se inventan cifras) */
interface ClimaData {
  temp: number | null;
  tempMax: number | null;
  tempMin: number | null;
  condicion: string;
  ciudad: string;
}

/** Tiempo transcurrido desde el ingreso a la bahía (hh:mm:ss, en vivo) */
function tiempoEnBahia(r: RampaEntrada, ahora: number): string {
  if (!r.fecha_ingreso) return 'Sin fecha';
  const t = new Date(`${r.fecha_ingreso}T${r.hora_ingreso || '00:00:00'}`).getTime();
  if (Number.isNaN(t)) return '—';
  return formatoDuracion(Math.max(0, ahora - t));
}

const soles = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Reloj vivo para cronómetros de rampa y hora actual */
function useAhora(activo = true) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

// ─── Tarjeta KPI del Bento ────────────────────────────────────────────────────

function BentoKpiCard({
  icon,
  label,
  valor,
  sub,
  color,
  badge,
  onClick,
  keycap,
}: {
  icon: React.ReactNode;
  label: string;
  valor: number | string;
  sub?: string;
  color?: string;
  badge?: { texto: string; tono: 'green' | 'amber' | 'red' | 'blue' };
  onClick?: () => void;
  keycap?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="tarjeta__lista"
      onClick={onClick}
      whileHover={!reduce && onClick ? { scale: 1.015, transition: spring } : undefined}
      whileTap={!reduce && onClick ? { scale: 0.985 } : undefined}
      style={{
        padding: 'var(--s-3) var(--s-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-2)',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--surface)',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--separator)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ color: color ?? 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          {keycap && <span className="mant-keycap">{keycap}</span>}
        </div>
        {badge && (
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--r-full)',
              background: `var(--${badge.tono}-tint)`,
              color: `var(--${badge.tono}-ink)`,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {badge.texto}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: '1.625rem', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.15 }}>
          {valor}
        </div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginTop: 4, color: 'var(--label)' }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>{sub}</div>}
      </div>
    </motion.button>
  );
}

// ─── Hoja Detalle de Rampa (RampaQuickSheet) ───────────────────────────────────

function RampaQuickSheet({
  rampa,
  otRelacionada,
  onClose,
  onVerOT,
  onVerStatusRampa,
}: {
  rampa: RampaEntrada | null;
  otRelacionada?: OrdenTrabajo;
  onClose: () => void;
  onVerOT?: (ot: OrdenTrabajo) => void;
  onVerStatusRampa: () => void;
}) {
  const ahora = useAhora(Boolean(rampa));
  if (!rampa) return null;

  // Cálculo de tiempo transcurrido en la bahía
  let msTranscurridos = 0;
  if (rampa.fecha_ingreso) {
    const fStr = `${rampa.fecha_ingreso}T${rampa.hora_ingreso || '00:00:00'}`;
    const tIngreso = new Date(fStr).getTime();
    if (!Number.isNaN(tIngreso)) {
      msTranscurridos = Math.max(0, ahora - tIngreso);
    }
  }

  const ocupada = rampa.estado !== 'Liberado';

  return (
    <Sheet
      open={Boolean(rampa)}
      onClose={onClose}
      title={`Bahía: ${rampa.rampa || 'Rampa'}`}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {otRelacionada && onVerOT && (
            <Button variant="primary" icon={<Wrench size={15} />} onClick={() => onVerOT(otRelacionada)}>
              Ver OT {otId(otRelacionada)}
            </Button>
          )}
          <Button variant={otRelacionada ? 'secondary' : 'primary'} icon={<LayoutDashboard size={15} />} onClick={onVerStatusRampa}>
            Ir a Status Rampa
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Cabecera con Placa grande y Estado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--fill-subtle)', borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LicensePlate plate={rampa.placa || 'SIN-PLACA'} size="lg" />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)' }}>Unidad en bahía</div>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>{rampa.rampa}</div>
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              background: ocupada ? 'var(--amber-tint)' : 'var(--green-tint)',
              color: ocupada ? 'var(--amber-ink)' : 'var(--green-ink)',
            }}
          >
            {ocupada ? 'Ocupada' : 'Liberada'}
          </span>
        </div>

        {/* Bento de Datos de la Visita */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <div className="tarjeta__lista" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--label-2)' }}>Ingreso</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {rampa.fecha_ingreso || '—'} {rampa.hora_ingreso ? `· ${rampa.hora_ingreso}` : ''}
            </div>
          </div>

          <div className="tarjeta__lista" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--label-2)' }}>Tiempo en Bahía</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
              {msTranscurridos > 0 ? formatoDuracion(msTranscurridos) : 'En curso'}
            </div>
          </div>

          <div className="tarjeta__lista" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--label-2)' }}>Conductor</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rampa.conductor || 'No especificado'}</div>
          </div>

          <div className="tarjeta__lista" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--label-2)' }}>Kilometraje</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {rampa.km ? `${Number(rampa.km).toLocaleString('es-PE')} km` : '—'}
            </div>
          </div>
        </div>

        {/* Motivo y Observaciones */}
        {rampa.situacion && (
          <div style={{ padding: '10px 14px', background: 'var(--fill-2)', borderRadius: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase' }}>Situación / Motivo</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: 2 }}>{rampa.situacion}</div>
          </div>
        )}

        {rampa.observaciones && (
          <div style={{ padding: '10px 14px', background: 'var(--fill-2)', borderRadius: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase' }}>Observaciones del taller</div>
            <div style={{ fontSize: '0.8125rem', marginTop: 2, color: 'var(--label)' }}>{rampa.observaciones}</div>
          </div>
        )}

        {/* OT Vinculada */}
        {otRelacionada && (
          <div style={{ padding: 14, border: '1px solid var(--accent)', borderRadius: 14, background: 'var(--accent-tint)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--accent)', fontSize: '0.8125rem' }}>
                <Wrench size={16} /> Orden de Trabajo Vinculada
              </div>
              <span className={`ot-estado ot-estado--${otRelacionada.estado === 'En Proceso' ? 'green' : 'amber'}`}>
                {otRelacionada.estado}
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {otId(otRelacionada)} · {otTipo(otRelacionada)}
            </div>
            {otRelacionada.tecnico && (
              <div style={{ fontSize: '0.8rem', color: 'var(--label-2)', marginTop: 2 }}>
                Técnico asignado: <strong>{otRelacionada.tecnico}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ─── Componente Principal: MantDashboardPage ──────────────────────────────────

export function MantDashboardPage() {
  const navigate = useNavigate();

  // 1. Estado de Filtro de Fechas
  const [rango, setRango] = useState<RangoTiempo>('mes');

  // 2. Modales e interacción
  const [rampaSeleccionada, setRampaSeleccionada] = useState<RampaEntrada | null>(null);
  const [inspeccionSeleccionada, setInspeccionSeleccionada] = useState<Inspeccion | null>(null);

  // 3. Consultas en Tiempo Real
  const otsQ    = useOrdenesTrabajoData();
  const rampasQ = useStatusRampa();
  const inspQ   = useInspecciones();
  const neuQ    = useInspeccionesNeumaticos();
  const placasQ = usePlacas();
  const dispQ   = useDisponibilidad();

  const fallasQ = useQuery<FallasStats>({
    queryKey: ['mant-dashboard', 'fallas-stats'],
    queryFn: () => api('/fallas/stats') as Promise<FallasStats>,
    staleTime: 60_000,
  });

  // Clima en Base Lurigancho (con fallback elegante para offline/dev)
  const climaQ = useQuery<ClimaData>({
    queryKey: ['mant-dashboard', 'clima-lurigancho'],
    queryFn: async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=-11.9833&longitude=-76.9500&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FLima',
        );
        if (!res.ok) throw new Error('Clima no disponible');
        const d = await res.json();
        const cur = d.current_weather?.temperature;
        const max = d.daily?.temperature_2m_max?.[0];
        const min = d.daily?.temperature_2m_min?.[0];
        const t = typeof cur === 'number' ? Math.round(cur) : null;
        return {
          temp: t,
          tempMax: typeof max === 'number' ? Math.round(max) : null,
          tempMin: typeof min === 'number' ? Math.round(min) : null,
          condicion: t !== null && t >= 23 ? 'Cálido y despejado' : 'Temperatura actual',
          ciudad: 'Lurigancho, Lima',
        };
      } catch {
        return { temp: null, tempMax: null, tempMin: null, condicion: 'Clima no disponible', ciudad: 'Lurigancho, Lima' };
      }
    },
    staleTime: 1000 * 60 * 20, // 20 minutos
  });

  const ahora = useAhora(true);
  const horaActualStr = new Date(ahora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ── Atajos de Teclado (N, R, O, C, F) ──────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Con Ctrl/Cmd/Alt son atajos del navegador (Ctrl+R recarga): no se interceptan
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // No mientras se escribe en un campo ni con una hoja o diálogo abierto
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || ['input', 'textarea', 'select'].includes(el?.tagName?.toLowerCase() ?? '')) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        haptic('selection');
        navigate('/mantenimiento/reportes-ot', { state: { nuevaOT: true } });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        haptic('selection');
        navigate('/mantenimiento/status-rampa');
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        haptic('selection');
        navigate('/mantenimiento/reportes-ot');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        haptic('selection');
        navigate('/flota/checklist');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        haptic('selection');
        setRango(prev => {
          if (prev === 'hoy') return 'semana';
          if (prev === 'semana') return 'mes';
          if (prev === 'mes') return '30d';
          return 'hoy';
        });
      }
    },
    [navigate],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Procesamiento de Datos ─────────────────────────────────────────────────
  const otsData    = otsQ.data ?? [];
  const rampasData = rampasQ.data ?? [];
  const fallasData = fallasQ.data ?? {};

  // Filtro de OTs por Rango Temporal
  const otsFiltradas = useMemo(() => {
    const dHoy = new Date();
    dHoy.setHours(0, 0, 0, 0);

    return otsData.filter(ot => {
      const fStr = ot.fecha_ingreso || ot.creado_en || ot.fecha_inicio_ot || '';
      if (!fStr) return true;
      const fOT = new Date(fStr.replace(' ', 'T'));
      if (Number.isNaN(fOT.getTime())) return true;

      const diffMs = Date.now() - fOT.getTime();
      const diffDias = diffMs / (1000 * 60 * 60 * 24);

      if (rango === 'hoy') return diffDias <= 1.2 && fOT >= dHoy;
      if (rango === 'semana') return diffDias <= 7;
      if (rango === 'mes') return diffDias <= 31;
      if (rango === '30d') return diffDias <= 30;
      return true;
    });
  }, [otsData, rango]);

  // Métricas de OTs
  const otsEnProceso = otsData.filter(o => o.estado === 'En Proceso').length;
  const otsPausadas  = otsData.filter(o => o.estado === 'Pausada').length;
  const otsAbiertas  = otsEnProceso + otsPausadas;

  const otsCerradasPeriodo = otsFiltradas.filter(
    o => o.estado === 'Finalizado' || o.estado === 'Cerrada',
  ).length;

  // Indicadores de tiempo con la regla de Ingresos a taller (tiemposTaller.ts). Intervalo según el rango elegido.
  const indTaller = useMemo(() => {
    const dias = rango === 'hoy' ? 0 : rango === 'semana' ? 6 : rango === 'mes' ? 30 : 29;
    const d = new Date();
    d.setDate(d.getDate() - dias);
    const desde = d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const hasta = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    return indicadoresTaller(rampasData, otsData, desde, hasta);
  }, [rampasData, otsData, rango]);
  const mttrHoras = indTaller.mttrHoras;

  // Costo total del periodo: misma regla que Ingresos a taller (fecha de ingreso dentro del rango, costo de la OT)
  const periodoCosto = useMemo(() => {
    const dias = rango === 'hoy' ? 0 : rango === 'semana' ? 6 : rango === 'mes' ? 30 : 29;
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return {
      desde: d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
      hasta: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
    };
  }, [rango]);
  const costoTotalPeriodo = useMemo(() => sumaCostoEnPeriodo(otsData, periodoCosto.desde, periodoCosto.hasta), [otsData, periodoCosto]);

  // Proporción de trabajos: intervalo propio de la tarjeta y tipos del catálogo (igual que el clásico)
  const [propDesde, setPropDesde] = useState(() => fechaLimaDias(30));
  const [propHasta, setPropHasta] = useState(() => fechaLimaDias(0));
  const tiposCounts = useMemo(() => {
    const cuenta: Record<string, number> = { Correctivo: 0, Preventivo: 0, Predictivo: 0, Proactivo: 0, Servicio: 0, Otros: 0 };
    otsData.forEach(o => {
      const f = (o.fecha_ingreso || o.creado_en || o.created_at || '').slice(0, 10);
      if (!f || f < propDesde || f > propHasta) return;
      const tipo = String(otDetalles(o).tipo_ot || otTipo(o).split(' / ')[0] || '').trim().toLowerCase();
      const clave = ['Correctivo', 'Preventivo', 'Predictivo', 'Proactivo', 'Servicio'].find(k => k.toLowerCase() === tipo) ?? 'Otros';
      cuenta[clave]++;
    });
    return { cuenta, total: Object.values(cuenta).reduce((a, b) => a + b, 0) };
  }, [otsData, propDesde, propHasta]);

  // Bahías / Rampas Activas
  const rampasOcupadas = rampasData.filter(r => r.estado !== 'Liberado');

  // Bahías del tablero: visitas activas más las bahías libres del catálogo (igual que Status de rampa), en orden del catálogo
  const catalogoQ = useCatalogosTaller();
  const bahiasDashboard = useMemo<RampaEntrada[]>(() => {
    const catRampas = (catalogoQ.data?.rampas ?? []) as CatRampa[];
    const activas = rampasOcupadas;
    const ocupadas = new Set(activas.map(r => r.rampaCatId));
    const libres = catRampas.filter(c => enReporte(c) && !ocupadas.has(String(c.id))).map(c => ({
      _id: `libre-${c.id}`, id: `libre-${c.id}`, rampa: String(c.nombre_rampa ?? c.nombre ?? c.id), rampaCatId: String(c.id), color: c.color ?? null,
      placa: null, conductor: null, chofer: null, reportado_por: null, ticket_entrada: null,
      fecha_ingreso: null, hora_ingreso: null, fecha_salida: null, salida_programada: null, hora_salida_programada: null,
      situacion: 'Libre', estado: 'Libre', km: null, observaciones: null, evidencia_url: null, liberado_por: null,
    }) as unknown as RampaEntrada);
    const orden = (r: RampaEntrada) => Number(catRampas.find(c => String(c.id) === r.rampaCatId)?.orden ?? 999);
    return [...activas, ...libres].sort((a, b) => orden(a) - orden(b));
  }, [rampasOcupadas, catalogoQ.data]);

  // Mapear rampa activa con su OT correspondiente
  const mapRampaOT = useMemo(() => {
    const map = new Map<string, OrdenTrabajo>();
    otsData.forEach(o => {
      if ((o.estado === 'En Proceso' || o.estado === 'Pausada') && o.placa) {
        map.set(o.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''), o);
      }
    });
    return map;
  }, [otsData]);

  // Vigencia de Inspecciones (Cálculo Fiel a Inspecciones)
  const ciclos = useMemo(() => {
    const ultimaMec = new Map<string, NonNullable<typeof inspQ.data>[number]>();
    [...(inspQ.data ?? [])]
      .filter(i => i.tipo !== 'Solo Frenos')
      .sort((x, y) => (y.fecha?.getTime() ?? 0) - (x.fecha?.getTime() ?? 0))
      .forEach(i => {
        const k = clavePlaca(i.placa);
        if (!ultimaMec.has(k)) ultimaMec.set(k, i);
      });

    const ultimaNeu = new Map<string, NonNullable<typeof neuQ.data>[number]>();
    (neuQ.data ?? []).forEach(n => {
      const k = clavePlaca(n.placa);
      if (!ultimaNeu.has(k)) ultimaNeu.set(k, n);
    });

    return (placasQ.data ?? [])
      .filter(p => p.estado.toLowerCase() === 'activa' && p.enUso)
      .map(p => ({
        placa: p.placa,
        cliente: p.cliente || 'Sin empresa',
        ciclo: evaluarCiclo(ultimaMec.get(clavePlaca(p.placa)) ?? null, ultimaNeu.get(clavePlaca(p.placa)) ?? null),
        inspeccion: ultimaMec.get(clavePlaca(p.placa)) ?? null,
      }));
  }, [inspQ.data, neuQ.data, placasQ.data]);

  // Filtro por empresa del semáforo preventivo (vacío = todas)
  const [empresasSel, setEmpresasSel] = useState<string[]>([]);
  const empresasOpc = useMemo(() => [...new Set(ciclos.map(c => c.cliente))].sort((a, b) => a.localeCompare(b, 'es')), [ciclos]);
  // Con una sola empresa el filtro se oculta y se ignora cualquier selección previa (equivale a elegirla)
  const hayVariasEmpresas = empresasOpc.length > 1;
  const ciclosSel = useMemo(() => (hayVariasEmpresas && empresasSel.length ? ciclos.filter(c => empresasSel.includes(c.cliente)) : ciclos), [ciclos, empresasSel, hayVariasEmpresas]);
  const fleetrun = useFleetrunStats();
  const empresa = useEmpresaNombre();

  // Flota = placas activas en uso (sin valores de respaldo): si no hay datos, los porcentajes quedan sin cifra
  const totalFlota     = ciclosSel.length;
  const inspVencidas   = ciclosSel.filter(c => c.ciclo.estado === 'vencido').length;
  const inspProximas   = ciclosSel.filter(c => c.ciclo.estado === 'proximo').length;
  const inspSinRegistro = ciclosSel.filter(c => c.ciclo.estado === 'sin-registro').length;
  const inspConformes  = ciclosSel.filter(c => c.ciclo.estado === 'vigente').length;
  // % flota operativa = (En Ruta + En Base) / flota activa, con el estado consolidado de Disponibilidad
  const cifrasFlota   = useMemo(() => cifrasDisponibilidad(dispQ.data ?? []), [dispQ.data]);
  const pctOperativas = porcentajeOperativa(cifrasFlota);
  // Igual que Análisis de inspecciones: (vigentes + próximas a vencer) / unidades
  const pctConformes   = totalFlota > 0 ? Math.round(((inspConformes + inspProximas) / totalFlota) * 100) : null;

  // Distribución de días para el próximo vencimiento de inspección (misma vigencia de arriba)
  const distribucionVencimientos = useMemo(() => {
    const cuenta = { vencidas: 0, a7: 0, a15: 0, a30: 0, mas30: 0, sinRegistro: 0 };
    for (const c of ciclosSel) {
      const d = c.ciclo.dias;
      if (c.ciclo.estado === 'sin-registro' || d === null) cuenta.sinRegistro++;
      else if (d < 0 || c.ciclo.estado === 'vencido') cuenta.vencidas++;
      else if (d <= 7) cuenta.a7++;
      else if (d <= 15) cuenta.a15++;
      else if (d <= 30) cuenta.a30++;
      else cuenta.mas30++;
    }
    return [
      { nombre: 'Vencidas', valor: cuenta.vencidas, color: 'var(--red-ink)' },
      { nombre: '0 a 7 días', valor: cuenta.a7, color: 'var(--amber-ink)' },
      { nombre: '8 a 15 días', valor: cuenta.a15, color: 'var(--accent)' },
      { nombre: '16 a 30 días', valor: cuenta.a30, color: '#3b82f6' },
      { nombre: 'Más de 30 días', valor: cuenta.mas30, color: 'var(--green-ink)' },
      { nombre: 'Sin registro', valor: cuenta.sinRegistro, color: 'var(--label-3)' },
    ];
  }, [ciclosSel]);

  // OT abiertas por semana de ingreso, últimas 8 semanas (lunes a domingo, hora de Lima)
  const otsPorSemana = useMemo(() => {
    const lunes = (d: Date) => { const x = new Date(d); const dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); x.setHours(0, 0, 0, 0); return x; };
    const semanas: { inicio: Date; valor: number }[] = [];
    const base = lunes(new Date());
    for (let i = 7; i >= 0; i--) {
      const inicio = new Date(base); inicio.setDate(base.getDate() - i * 7);
      semanas.push({ inicio, valor: 0 });
    }
    for (const o of otsData) {
      const f = o.fecha_ingreso ?? o.creado_en ?? o.created_at;
      if (!f) continue;
      const t = new Date(String(f).replace(' ', 'T'));
      if (Number.isNaN(t.getTime())) continue;
      const ini = lunes(t).getTime();
      const hit = semanas.find(w => w.inicio.getTime() === ini);
      if (hit) hit.valor++;
    }
    return semanas.map(w => ({
      nombre: w.inicio.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
      valor: w.valor,
      color: 'var(--accent)',
    }));
  }, [otsData]);

  const unidadesUrgentes = useMemo(() => {
    return ciclosSel
      .filter(c => c.ciclo.dias !== null && c.ciclo.dias <= 7)
      .sort((a, b) => (a.ciclo.dias ?? 0) - (b.ciclo.dias ?? 0))
      .slice(0, 6);
  }, [ciclos]);

  const isLoading = otsQ.isLoading || rampasQ.isLoading;

  return (
    <Page>
      {/* ─── Encabezado Maestro ────────────────────────────────────────────── */}
      <PageHeader
        eyebrow="Mantenimiento & Taller"
        title="Torre de Control de Taller"
        subtitle="Monitoreo operativo y financiero en tiempo real"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => {
                haptic('selection');
                navigate('/mantenimiento/reportes-ot', { state: { nuevaOT: true } });
              }}
            >
              Nueva OT <span className="mant-keycap">N</span>
            </Button>
            <MenuOtros
              opciones={[
                { label: 'Status de Rampa [R]', icon: <LayoutDashboard size={17} />, onSelect: () => navigate('/mantenimiento/status-rampa') },
                { label: 'Órdenes de Trabajo [O]', icon: <ScrollText size={17} />, onSelect: () => navigate('/mantenimiento/reportes-ot') },
                { label: 'Checklist Móvil [C]', icon: <FileText size={17} />, onSelect: () => navigate('/flota/checklist') },
              ]}
            />
          </div>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="mant-dash">
          {/* ─── Banner Hero Atmosférico (Base + Clima + Estado en Vivo) ────── */}
          <div className="mant-dash-hero">
            <div className="mant-dash-hero__base">
              <div className="mant-dash-hero__icon">
                <Truck size={22} />
              </div>
              <div className="mant-dash-hero__info">
                <div className="mant-dash-hero__title">
                  Base Lurigancho-Chosica
                  <span className="mant-pulse">
                    <span className="mant-pulse__dot" />
                    En vivo
                  </span>
                </div>
                <div className="mant-dash-hero__sub">
                  <span>{horaActualStr} (Lima)</span>
                  <span>·</span>
                  <span>{rampasOcupadas.length} {rampasOcupadas.length === 1 ? 'unidad' : 'unidades'} en bahía</span>
                  <span>·</span>
                  <span style={{ color: 'var(--green-ink)', fontWeight: 700 }}>
                    {pctOperativas != null
                      ? `${pctOperativas}% flota operativa (${cifrasFlota.ruta + cifrasFlota.base} de ${cifrasFlota.total})`
                      : 'Sin datos de flota'}
                  </span>
                </div>
              </div>
            </div>

            {/* Widget de Clima Apple */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="mant-clima-pill" title={climaQ.data?.condicion}>
                <Sun size={17} style={{ color: '#f59e0b' }} />
                <span>{climaQ.data?.ciudad ?? 'Lurigancho'}</span>
                <span className="mant-clima-pill__temp">{climaQ.data?.temp != null ? `${climaQ.data.temp}°C` : 'Sin datos'}</span>
                {climaQ.data?.tempMin != null && climaQ.data?.tempMax != null && (
                  <span className="mant-clima-pill__rango">{climaQ.data.tempMin}° / {climaQ.data.tempMax}°</span>
                )}
              </div>

              {/* Filtro Rápido de Rango de Fechas */}
              <SegmentedControl<RangoTiempo>
                label="Filtro de fecha"
                value={rango}
                onChange={v => {
                  haptic('selection');
                  setRango(v);
                }}
                options={[
                  { value: 'hoy', label: 'Hoy' },
                  { value: 'semana', label: 'Semana' },
                  { value: 'mes', label: 'Mes' },
                  { value: '30d', label: '30 Días' },
                ]}
              />
            </div>
          </div>

          {/* ─── Fila 1: KPIs Principales de Mantenimiento ─────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: 'var(--s-3)' }}>
            <BentoKpiCard
              icon={<Wrench size={22} />}
              label="OTs en Proceso"
              valor={otsAbiertas}
              sub={`${otsEnProceso} activas · ${otsPausadas} pausadas`}
              color="var(--accent)"
              badge={otsPausadas > 0 ? { texto: `${otsPausadas} en pausa`, tono: 'amber' } : undefined}
              keycap="O"
              onClick={() => navigate('/mantenimiento/reportes-ot')}
            />

            <BentoKpiCard
              icon={<CheckCircle2 size={22} />}
              label={`Cerradas (${rango})`}
              valor={otsCerradasPeriodo}
              sub="OTs finalizadas en el período"
              color="var(--green-ink)"
              onClick={() => navigate('/mantenimiento/reportes-ot')}
            />

            <BentoKpiCard
              icon={<Clock size={22} />}
              label="MTTR (trabajo sin pausas)"
              valor={horasTxt(mttrHoras)}
              sub={`${indTaller.mttrN} OT · ${indTaller.mttrExcluidas} excluidas sin fecha de inicio`}
              color="#3b82f6"
            />
            <BentoKpiCard
              icon={<Clock size={22} />}
              label="Permanencia promedio"
              valor={horasTxt(indTaller.permanenciaHoras)}
              sub={`${indTaller.permanenciaN} visitas liberadas · ${indTaller.permanenciaEnRampa} en rampa`}
              color="#0ea5e9"
            />
            <BentoKpiCard
              icon={<Clock size={22} />}
              label="Tiempo de espera promedio"
              valor={horasTxt(indTaller.esperaHoras)}
              sub={`${indTaller.esperaN} OT con visita · ${indTaller.esperaSinVisita} sin visita`}
              color="#f59e0b"
            />

            <BentoKpiCard
              icon={<DollarSign size={22} />}
              label="Costo taller del periodo"
              valor={soles(costoTotalPeriodo)}
              sub={`Ingreso del ${periodoCosto.desde.split('-').reverse().join('/')} al ${periodoCosto.hasta.split('-').reverse().join('/')} · mismo criterio que Ingresos a taller`}
              color="var(--ink)"
            />
          </div>

          {/* ─── Fila 2: Bento Grid (Bahías en Vivo + Distribución OTs) ──────── */}
          <div className="mant-grid">
            {/* Visualizador de Bahías de Taller (Col 8) */}
            <div className="mant-col-8">
              <div className="mant-card">
                <div className="mant-card__header">
                  <div className="mant-card__title">
                    <LayoutDashboard size={15} /> Bahías de Taller en Vivo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mant-card__badge" style={{ background: 'var(--fill-2)', color: 'var(--label-2)' }}>
                      {rampasOcupadas.length} {rampasOcupadas.length === 1 ? 'bahía ocupada' : 'bahías ocupadas'}
                    </span>
                    <Button variant="secondary" size="sm" icon={<LayoutDashboard size={14} />} onClick={() => navigate('/mantenimiento/status-rampa')}>
                      Status Rampa <span className="mant-keycap">R</span>
                    </Button>
                  </div>
                </div>

                {/* Grid de Bahías */}
                <div className="mant-bays">
                  {bahiasDashboard.map(r => {
                    const ocupada = r.estado !== 'Liberado' && r.estado !== 'Libre';
                    const ot = r.placa ? mapRampaOT.get(r.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')) : undefined;

                    return (
                      <button
                        key={r.id || r._id}
                        type="button"
                        className={`mant-bay ${ocupada ? 'mant-bay--ocupada' : 'mant-bay--libre'}`}
                        style={{ '--bay-color': r.color || 'var(--accent)' } as React.CSSProperties}
                        onClick={() => {
                          haptic('selection');
                          setRampaSeleccionada(r);
                        }}
                      >
                        <div className="mant-bay__top">
                          <span className="mant-bay__nombre">{r.rampa}</span>
                          {ocupada ? (
                            <span className="mant-bay__timer">
                              <Clock size={11} /> {tiempoEnBahia(r, ahora)}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.6875rem', color: 'var(--green-ink)', fontWeight: 700 }}>
                              LIBRE
                            </span>
                          )}
                        </div>

                        {ocupada && r.placa ? (
                          <>
                            <div style={{ marginTop: 2 }}>
                              <LicensePlate plate={r.placa} size="sm" />
                            </div>
                            <div className="mant-bay__situacion" title={r.situacion || 'Servicio técnico'}>
                              {r.situacion || 'En mantenimiento'}
                            </div>
                            {r.conductor && (
                              <div className="mant-bay__chofer" title={r.conductor}>
                                Cond: {r.conductor}
                              </div>
                            )}
                            {ot && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>
                                OT: {otId(ot)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ minHeight: 64, display: 'grid', placeItems: 'center', color: 'var(--label-3)', fontSize: '0.8125rem' }}>
                            Disponible para ingreso
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Proporción de Tipos de OT (Col 4) */}
            <div className="mant-col-4">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title">
                    <Activity size={15} /> Proporción de Trabajos
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: 'var(--s-2) 0' }}>
                  <label className="aud-fecha"><span>Desde</span><input type="date" value={propDesde} max={propHasta} onChange={e => setPropDesde(e.target.value)} /></label>
                  <label className="aud-fecha"><span>Hasta</span><input type="date" value={propHasta} min={propDesde} onChange={e => setPropHasta(e.target.value)} /></label>
                </div>

                <div style={{ padding: 'var(--s-2) 0' }}>
                  <DonaGrafico
                    centro={`${tiposCounts.total} OTs`}
                    porciones={[
                      { nombre: 'Correctivo', valor: tiposCounts.cuenta.Correctivo, color: 'var(--accent)' },
                      { nombre: 'Preventivo', valor: tiposCounts.cuenta.Preventivo, color: 'var(--green-ink)' },
                      { nombre: 'Predictivo', valor: tiposCounts.cuenta.Predictivo, color: '#3b82f6' },
                      { nombre: 'Proactivo', valor: tiposCounts.cuenta.Proactivo, color: '#8b5cf6' },
                      { nombre: 'Servicio', valor: tiposCounts.cuenta.Servicio, color: 'var(--amber-ink)' },
                      ...(tiposCounts.cuenta.Otros ? [{ nombre: 'Otros', valor: tiposCounts.cuenta.Otros, color: 'var(--label-3)' }] : []),
                    ]}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 'auto' }}>
                  {(['Correctivo', 'Preventivo', 'Predictivo', 'Proactivo', 'Servicio'] as const).map(t => (
                    <div key={t} style={{ padding: 8, background: 'var(--fill-2)', borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--label-2)' }}>{t}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        {tiposCounts.cuenta[t]} <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
                          {tiposCounts.total ? Math.round((tiposCounts.cuenta[t] / tiposCounts.total) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Centro de comando: estado de la flota (igual que el clásico) ───── */}
          <div className="placas-resumen">
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{totalFlota}</span><span className="placas-kpi__label">Flota activa</span></div>
            <div className="placas-kpi placas-kpi--green"><span className="placas-kpi__valor t-numeric">{inspConformes}</span><span className="placas-kpi__label">Inspecciones vigentes</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{inspProximas}</span><span className="placas-kpi__label">Por vencer (7 días)</span></div>
            <div className="placas-kpi"><span className="placas-kpi__valor t-numeric" style={{ color: 'var(--red-ink)' }}>{inspVencidas}</span><span className="placas-kpi__label">No vigentes</span></div>
          </div>

          {/* ─── Fila 2b: Estado de mantenimientos, vencimientos y OT por semana ─── */}
          <div className="mant-grid">
            <div className="mant-col-4">
              <PanelEstadoFlota stats={fleetrun} empresa={empresa.data ?? ''} />
            </div>
            <div className="mant-col-4">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><ShieldCheck size={15} /> Vencimientos de inspección</div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-2)' }}>{ciclosSel.length} unidades</span>
                </div>
                <BarrasGrafico porciones={distribucionVencimientos} altura={220} />
              </div>
            </div>
            <div className="mant-col-4">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Wrench size={15} /> OT ingresadas por semana</div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-2)' }}>últimas 8 semanas</span>
                </div>
                <BarrasGrafico porciones={otsPorSemana} altura={220} />
              </div>
            </div>
          </div>

          {/* ─── Fila 3: Semáforo Preventivo + Fallas en Ruta ────────────────── */}
          <div className="mant-grid">
            {/* Semáforo Preventivo e Inspecciones (Col 7) */}
            <div className="mant-col-7">
              <div className="mant-card">
                <div className="mant-card__header">
                  <div className="mant-card__title">
                    <ShieldCheck size={15} /> Semáforo Preventivo de Flota
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {hayVariasEmpresas && (
                      <div style={{ minWidth: 200 }}>
                        <MultiSelect label="Empresa" options={empresasOpc} value={empresasSel} onChange={setEmpresasSel} placeholder="Todas las empresas" />
                      </div>
                    )}
                    <Button variant="secondary" size="sm" icon={<History size={14} />} onClick={() => navigate('/inspecciones')}>
                      Inspecciones
                    </Button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <DonaGrafico
                      centro={pctConformes != null ? `${pctConformes}%` : '—'}
                      porciones={[
                        { nombre: 'Vigente', valor: inspConformes, color: 'var(--green-ink)' },
                        { nombre: 'Por vencer (7d)', valor: inspProximas, color: 'var(--amber-ink)' },
                        { nombre: 'No vigente', valor: inspVencidas, color: 'var(--red-ink)' },
                        { nombre: 'Sin registro', valor: inspSinRegistro, color: 'var(--label-3)' },
                      ]}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase' }}>
                      Próximas a vencer o urgentes
                    </div>

                    {unidadesUrgentes.length === 0 ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--green-ink)', fontWeight: 600, padding: '12px 0' }}>
                        ✓ Toda la flota se encuentra al día con sus inspecciones.
                      </div>
                    ) : (
                      unidadesUrgentes.map(u => {
                        const dias = u.ciclo.dias ?? 0;
                        const esVencido = dias <= 0;
                        return (
                          <div
                            key={u.placa}
                            onClick={() => {
                              if (u.inspeccion) setInspeccionSeleccionada(u.inspeccion);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 10px',
                              borderRadius: 8,
                              background: 'var(--fill-2)',
                              cursor: u.inspeccion ? 'pointer' : 'default',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <LicensePlate plate={u.placa} size="sm" />
                              <span style={{ fontSize: '0.78rem', color: 'var(--label-2)' }}>{u.ciclo.texto}</span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                                color: esVencido ? 'var(--red-ink)' : 'var(--amber-ink)',
                              }}
                            >
                              {esVencido ? 'VENCIDA' : `${dias}d rest.`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fallas Reportadas en Ruta (Checklist Móvil) (Col 5) */}
            <div className="mant-col-5">
              <div className="mant-card">
                <div className="mant-card__header">
                  <div className="mant-card__title">
                    <AlertTriangle size={15} /> Fallas en Ruta (Checklist)
                  </div>
                  <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={() => navigate('/flota/checklist')}>
                    F-MAN-001 <span className="mant-keycap">C</span>
                  </Button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <div style={{ padding: '10px 12px', background: 'var(--fill-2)', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--label-2)', fontWeight: 700, textTransform: 'uppercase' }}>Abiertas</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--amber-ink)' }}>
                      {fallasData.abiertas ?? 0}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'var(--red-tint)', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--red-ink)', fontWeight: 700, textTransform: 'uppercase' }}>Críticas</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--red-ink)' }}>
                      {fallasData.criticas ?? 0}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'var(--fill-2)', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--label-2)', fontWeight: 700, textTransform: 'uppercase' }}>Sin Repuesto</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      {fallasData.sin_stock ?? 0}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'var(--fill-2)', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--label-2)', fontWeight: 700, textTransform: 'uppercase' }}>Reportadas Hoy</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--blue-ink)' }}>
                      {fallasData.hoy ?? 0}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 4 }}>
                  Las fallas marcadas como críticas inhabilitan la unidad para despacho hasta su conformidad en taller.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sheet: Detalle Rápido de Rampa ───────────────────────────────── */}
      <RampaQuickSheet
        rampa={rampaSeleccionada}
        otRelacionada={rampaSeleccionada?.placa ? mapRampaOT.get(rampaSeleccionada.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')) : undefined}
        onClose={() => setRampaSeleccionada(null)}
        onVerOT={ot => {
          setRampaSeleccionada(null);
          navigate('/mantenimiento/reportes-ot', { state: { abrirOT: otId(ot) } });
        }}
        onVerStatusRampa={() => {
          setRampaSeleccionada(null);
          navigate('/mantenimiento/status-rampa');
        }}
      />

      {/* ─── Sheet: Ficha de Inspección ──────────────────────────────────── */}
      <InspeccionFicha
        inspeccion={inspeccionSeleccionada}
        onClose={() => setInspeccionSeleccionada(null)}
      />
    </Page>
  );
}
