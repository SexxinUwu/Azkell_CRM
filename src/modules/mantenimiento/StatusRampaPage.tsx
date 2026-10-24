import { formatFechaPe } from '../../core/lib/format';
import './mant.css';
import './StatusRampa.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, Clock, FileSpreadsheet, FileText, LayoutDashboard, LogOut, MessageCircle, Pencil, Plus, RefreshCw, RotateCcw, SearchX, Settings2, Trash2, Wrench } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { descargarArchivo } from '../../core/lib/pdf';
import { pdfRampa, type MaterialOT } from './rampaPdf';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { crearOTHija, eliminarRampaRegistro, reactivarRampa, rampaConductor, rampaId, useCatalogosTaller, useOrdenesTrabajoData, useOTsHijas, useTrabajosOT, useStatusRampa, tecnicosDeOT, type OrdenTrabajo, type RampaEntrada, type TrabajoOT } from './api';
import { ConfigurarRampasSheet, abrirPdfRampas, compartirRampasPdf, textoReporteRampas, type CatRampa, type DatosPdfRampa, type FilaPdfRampa } from './RampasHerramientas';
import { enReporte, rampasDelReporte } from './rampasReporte';
import type { ReactNode } from 'react';
import { LiberarRampa, RampaFormulario } from './RampaFormulario';
import { SUBTIPOS_OT, TIPOS_OT } from './tipos-ot';
import { useInspecciones, type Inspeccion } from '../inspecciones/api';
import { diasInspeccion, semaforoInspeccion, ultimasPorPlaca } from './inspeccionDias';
import { InspeccionFicha } from '../inspecciones/InspeccionFicha';
import { clavePlaca } from '../inspecciones/api';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { motivoIngreso, nombrePersona } from './rampasFormato';

const TABS = ['Activas', 'Historial'] as const;

// Preferencia de pantalla: mostrar u ocultar la columna de inspección (por dispositivo)
const CLAVE_VER_INSPECCION = 'fleet_rampa_ver_inspeccion';
function leerVerInspeccion(): boolean {
  try { return localStorage.getItem(CLAVE_VER_INSPECCION) !== '0'; } catch { return true; }
}

const placaNorm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

// OT abiertas de una rampa: enlazadas a esa rampa, o de la misma placa cuando su rampa ya no está activa
// (p. ej. la unidad se liberó y volvió a ingresar: la OT en curso no debe quedar huérfana)
function otsDeRampa(e: RampaEntrada, ots: OrdenTrabajo[], entradas: RampaEntrada[]): OrdenTrabajo[] {
  const rampasActivas = new Set(entradas.map(x => String(x.id ?? '')));
  return ots.filter(o => {
    const rampaOT = String(o.id_rampa ?? '');
    if (rampaOT && rampaOT === String(e.id ?? '')) return true;
    if (/cerrad|finaliz|anulad/i.test(String(o.estado ?? ''))) return false;
    return placaNorm(o.placa) !== '' && placaNorm(o.placa) === placaNorm(e.placa) && !rampasActivas.has(rampaOT);
  });
}

// Técnicos únicos de las OT abiertas de cada rampa: los de la OT (detalles) y los de sus trabajos (trabajos_ot.tecnico, separados por coma)
function tecnicosDeRampas(entradas: RampaEntrada[], ots: OrdenTrabajo[], trabajos: TrabajoOT[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const e of entradas) {
    const abiertas = otsDeRampa(e, ots, entradas);
    const ids = new Set(abiertas.map(o => o.id_ot).filter(Boolean));
    const tickets = new Set(abiertas.map(o => o.ticket_entrada).filter((x): x is string => !!x));
    // Los técnicos de la OT (los que se eligen al crearla) y los de sus trabajos: la OT cuenta aunque no esté iniciada
    const nombres = new Set<string>(abiertas.flatMap(o => tecnicosDeOT(o)));
    for (const t of trabajos) {
      const enOT = (t.ot_id ?? '') !== '' && ids.has(t.ot_id ?? '');
      const enTicket = !!t.ticket_visita && tickets.has(t.ticket_visita);
      if (!enOT && !enTicket) continue;
      for (const n of String(t.tecnico ?? '').split(',')) {
        const nombre = n.trim();
        if (nombre) nombres.add(nombre);
      }
    }
    mapa.set(rampaId(e), [...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  }
  return mapa;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function horasEnRampa(fechaIngreso: string | null): number {
  if (!fechaIngreso) return 0;
  const ingreso = new Date(fechaIngreso.includes('T') ? fechaIngreso : fechaIngreso + 'T00:00:00');
  return Math.max(0, (Date.now() - ingreso.getTime()) / 3_600_000);
}

function formatTiempo(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}m`;
  if (horas < 24) return `${Math.round(horas)}h`;
  const dias = Math.floor(horas / 24);
  const hrs  = Math.round(horas % 24);
  return hrs > 0 ? `${dias}d ${hrs}h` : `${dias}d`;
}

/** Filas del F-MAN-005 con los mismos valores que la tabla de pantalla (tiempos y semáforo de inspección) */
function filasPdfRampas(entradas: RampaEntrada[], catalogo: CatRampa[], tecnicos: Map<string, string[]>, ultimas: Map<string, Inspeccion>): FilaPdfRampa[] {
  const HEX = { green: '#15803d', amber: '#b45309', red: '#b91c1c', gray: '#64748b' } as const;
  return rampasDelReporte(entradas, catalogo).map(e => {
    const horas = horasEnRampa(e.fecha_ingreso);
    const dias = diasInspeccion(e.placa, ultimas);
    const insp = e.placa ? ultimas.get(clavePlaca(e.placa)) ?? null : null;
    const sem = semaforoInspeccion(insp, dias);
    const libre = !e.placa;
    const tono = situacionTono(e.situacion);
    return {
      rampa: e.rampa,
      fIn: formatFechaPe(e.fecha_ingreso) || '—',
      hIn: soloHora(e.hora_ingreso),
      placa: e.placa ?? '—',
      situacion: libre ? 'LIBRE' : (e.situacion ?? '—'),
      situacionColor: tono === 'amber' ? HEX.amber : tono === 'green' ? HEX.green : HEX.gray,
      obs: motivoIngreso(e.observaciones) || (libre ? 'Disponible para ingreso' : '—'),
      fOut: formatFechaPe(e.salida_programada) || '—',
      hOut: soloHora(e.hora_salida_programada),
      horas: horas > 0 ? formatTiempo(horas) : '—',
      horasColor: horas > 48 ? HEX.red : horas > 24 ? HEX.amber : HEX.green,
      tecnicos: (tecnicos.get(rampaId(e)) ?? []).map(nombrePersona).join('\n') || '—',
      insp: dias.texto,
      inspColor: HEX[sem],
      libre,
    };
  });
}

/** Botón solo con icono de color (sin texto), visible en la barra superior */
function BotonAccion({ titulo, color, icono, onClick }: { titulo: string; color: string; icono: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="btn-accion-color" style={{ color }} aria-label={titulo} title={titulo} onClick={onClick}>
      {icono}
    </button>
  );
}

function tiempoColor(horas: number): string {
  if (horas > 48) return 'var(--red-ink)';
  if (horas > 24) return 'var(--amber-ink)';
  return 'var(--green-ink)';
}

// ─── Donut SVG ────────────────────────────────────────────────────────────────

function Donut({ pct, color, label, size = 64 }: { pct: number; color: string; label?: string; size?: number }) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fill-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      {label !== undefined && (
        <span style={{ position: 'absolute', fontSize: size < 60 ? '0.7rem' : '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ─── Panel de analíticas ──────────────────────────────────────────────────────

function PanelAnaliticas({ activas, historial }: { activas: RampaEntrada[]; historial: RampaEntrada[] }) {
  // Distribución por situación (activas)
  const distSituacion = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of activas) {
      const s = e.situacion ?? e.estado ?? 'Sin estado';
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [activas]);

  // Tiempo promedio en rampa (activas)
  const tiempos = activas.map(e => horasEnRampa(e.fecha_ingreso));
  const promedioHoras = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;

  // Más de 48h = críticas
  const criticas = tiempos.filter(h => h > 48).length;

  // Historial del mes actual
  const mesActual = new Date().toISOString().slice(0, 7);
  const histMes = historial.filter(e =>
    (e.fecha_salida ?? e.fecha_ingreso ?? '').slice(0, 7) === mesActual
  ).length;

  if (activas.length === 0 && historial.length === 0) return null;

  return (
    <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {/* KPIs rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: 'var(--s-2)' }}>
        <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <Wrench size={18} style={{ color: activas.length > 0 ? 'var(--amber-ink)' : 'var(--green-ink)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{activas.length}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>En rampa</div>
          </div>
        </div>

        {activas.length > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Clock size={18} style={{ color: tiempoColor(promedioHoras), flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2, color: tiempoColor(promedioHoras) }}>
                {formatTiempo(promedioHoras)}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>Prom. espera</div>
            </div>
          </div>
        )}

        {criticas > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Clock size={18} style={{ color: 'var(--red-ink)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2, color: 'var(--red-ink)' }}>{criticas}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>+48 horas</div>
            </div>
          </div>
        )}

        {histMes > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <LayoutDashboard size={18} style={{ color: 'var(--ink)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{histMes}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>Este mes</div>
            </div>
          </div>
        )}
      </div>

      {/* Distribución por situación */}
      {distSituacion.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Donut
            pct={activas.length > 0 ? Math.round((distSituacion[0]?.[1] ?? 0) / activas.length * 100) : 0}
            color="var(--amber-ink)"
            label={String(activas.length)}
            size={68}
          />
          <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {distSituacion.slice(0, 4).map(([sit, n]) => {
              const pct = activas.length > 0 ? Math.round((n / activas.length) * 100) : 0;
              return (
                <div key={sit}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, marginBottom: 2 }}>
                    <span style={{ color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{sit}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber-ink)' }}>{n}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--fill-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber-ink)', borderRadius: 99, transition: 'width 600ms ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function StatusRampaPage() {
  const { data, isLoading, isError, error } = useStatusRampa();
  const catalogo = useCatalogosTaller();
  const ordenes = useOrdenesTrabajoData();
  const inspecciones = useInspecciones();
  const ultimasInsp = useMemo(() => ultimasPorPlaca(inspecciones.data ?? []), [inspecciones.data]);
  const [inspAbierta, setInspAbierta] = useState<Inspeccion | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [tab, setTab] = useState<'Activas' | 'Historial'>('Activas');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ entrada: RampaEntrada | null } | null>(null);
  // Visita a la que se le da salida desde la tabla (botón de liberar)
  const [liberando, setLiberando] = useState<RampaEntrada | null>(null);
  // Rampa que se preselecciona al ingresar desde una bahía libre (vacío = elegir)
  const [rampaInicial, setRampaInicial] = useState<string | undefined>(undefined);
  function abrirIngresoEn(catId: string) {
    setRampaInicial(catId);
    setFormulario({ entrada: null });
  }
  const { can, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const entradas = data ?? [];
  // Se busca por id para que el detalle se refresque solo tras liberar o editar
  const seleccionada = entradas.find(e => rampaId(e) === seleccionadaId) ?? null;
  const puedeCrear = can('status_rampa.crear');
  const puedeEditar = can('status_rampa.editar');

  const activas = useMemo(() => entradas.filter(e => e.estado !== 'Liberado'), [entradas]);
  const historial = useMemo(() => entradas.filter(e => e.estado === 'Liberado'), [entradas]);
  const trabajosOT = useTrabajosOT();
  const tecnicosPorRampa = useMemo(() => tecnicosDeRampas(activas, ordenes.data ?? [], trabajosOT.data ?? []), [activas, ordenes.data, trabajosOT.data]);
  // Bahías libres: rampas del catálogo que salen en el reporte y no tienen una visita activa
  const catRampas = useMemo(() => (catalogo.data?.rampas ?? []) as CatRampa[], [catalogo.data]);
  const nombreCat = (c: CatRampa) => String(c.nombre_rampa ?? c.nombre ?? c.id);
  const ordenCat = (catId: string) => Number(catRampas.find(c => String(c.id) === catId)?.orden ?? 999);
  const libresEntradas = useMemo<RampaEntrada[]>(() => {
    const ocupadas = new Set(activas.map(e => e.rampaCatId));
    return catRampas.filter(c => enReporte(c) && !ocupadas.has(String(c.id))).map(c => ({
      _id: `libre-${c.id}`, id: `libre-${c.id}`, rampa: nombreCat(c), rampaCatId: String(c.id), color: c.color ?? null,
      placa: null, conductor: null, chofer: null, reportado_por: null, ticket_entrada: null,
      fecha_ingreso: null, hora_ingreso: null, fecha_salida: null, salida_programada: null, hora_salida_programada: null,
      situacion: 'Libre', estado: 'Libre', km: null, observaciones: null, evidencia_url: null, liberado_por: null,
    }) as unknown as RampaEntrada);
  }, [activas, catRampas]);
  // Orden del catálogo: Rampa 1, Rampa 2, Rampa 3…, igual que el clásico
  const tablaEntradas = useMemo(
    () => [...activas, ...libresEntradas].sort((a, b) => ordenCat(a.rampaCatId) - ordenCat(b.rampaCatId)),
    [activas, libresEntradas, catRampas],
  );
  const filasPdf = useMemo(() => filasPdfRampas(tablaEntradas, catRampas, tecnicosPorRampa, ultimasInsp),
    [tablaEntradas, catRampas, tecnicosPorRampa, ultimasInsp]);
  // Al tocar una bahía libre se ingresa una unidad ahí; una visita abre su detalle
  function abrirRampa(e: RampaEntrada) {
    if (e.estado === 'Libre') abrirIngresoEn(e.rampaCatId);
    else setSeleccionadaId(rampaId(e));
  }
  const datosPdf: DatosPdfRampa = useMemo(() => {
    const ahora = new Date();
    const libres = filasPdf.filter(f => f.libre).length;
    const espera = filasPdf.filter(f => !f.libre && f.situacionColor === '#b45309').length;
    const u = user as { nombre?: string; email?: string } | null;
    return {
      fecha: ahora.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      emisor: String(u?.nombre ?? u?.email ?? ''),
      total: filasPdf.length,
      ocupadas: filasPdf.length - libres - espera,
      espera,
      libres,
    };
  }, [filasPdf, user]);
  async function exportarHistorialExcel() {
    try {
      await exportarExcel('Status-rampa', 'Rampas',
        ['Rampa', 'Placa', 'Conductor', 'Km', 'Ingreso', 'Salida real', 'Situación', 'Observaciones'],
        [...activas, ...historial].map(e => [e.rampa, e.placa, rampaConductor(e), e.km, formatFechaPe(e.fecha_ingreso),
          formatFechaPe(e.fecha_salida), e.situacion, e.observaciones]));
    } catch (err) { toast(errorMessage(err), 'error'); }
  }
  async function verPdf() {
    try { await abrirPdfRampas(filasPdf, datosPdf); } catch (err) { toast(errorMessage(err), 'error'); }
  }
  async function enviarWa() {
    try { await compartirRampasPdf(filasPdf, datosPdf, textoReporteRampas(activas, (catalogo.data?.rampas ?? []) as CatRampa[])); }
    catch (err) { toast(errorMessage(err), 'error'); }
  }
  const [verInspeccion, setVerInspeccion] = useState(leerVerInspeccion);
  function cambiarVerInspeccion(v: boolean) {
    setVerInspeccion(v);
    try { localStorage.setItem(CLAVE_VER_INSPECCION, v ? '1' : '0'); } catch { /* sin almacenamiento: dura solo la sesión */ }
  }

  const lista = tab === 'Activas' ? tablaEntradas : historial;

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(e =>
      (e.rampa ?? '').toUpperCase().includes(q) ||
      (e.placa ?? '').toUpperCase().includes(q) ||
      rampaConductor(e).toUpperCase().includes(q) ||
      (e.situacion ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Status de rampa"
          subtitle={isLoading ? 'Cargando…' : `${activas.length} rampas activas`}
          actions={
            <>
              <Button variant="plain" iconOnly className="btn--icono btn--icono-acento" icon={<RefreshCw size={18} />} aria-label="Actualizar" title="Actualizar"
                onClick={() => qc.invalidateQueries({ queryKey: ['mant'] })} />
              <BotonAccion titulo="Exportar historial a Excel" color="#15803d" icono={<FileSpreadsheet size={19} />} onClick={exportarHistorialExcel} />
              <BotonAccion titulo="Ver PDF del reporte" color="var(--red-ink)" icono={<FileText size={19} />} onClick={verPdf} />
              <BotonAccion titulo="Enviar reporte por WhatsApp" color="#16a34a" icono={<MessageCircle size={19} />} onClick={enviarWa} />
              <MenuOtros opciones={[
                { label: 'Configurar rampas', detalle: 'Orden, color y si sale en el reporte', icon: <Settings2 size={17} />, onSelect: () => setConfigurando(true) },
                { label: 'OT, trabajos y catálogos de rampas', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('mantenimiento/status-rampa') },
              ]} />
              {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setRampaInicial(undefined); setFormulario({ entrada: null }); }}>Ingresar</Button>}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <RampaDetalle
          entrada={seleccionada}
          puedeEditar={puedeEditar}
          usuario={user?.name ?? ''}
          onEditar={() => setFormulario({ entrada: seleccionada })}
          onVolver={() => setSeleccionadaId(null)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Panel de analíticas */}
          <PanelAnaliticas activas={activas} historial={historial} />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { haptic('selection'); setTab(t); setBusqueda(''); }}
                style={{
                  padding: '0.375rem 1rem',
                  borderRadius: 'var(--r-full)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: tab === t ? 'var(--ink)' : 'var(--fill)',
                  color: tab === t ? 'var(--label-inverse)' : 'var(--label-2)',
                }}
              >
                {t}
                <span style={{
                  marginLeft: '0.375rem',
                  background: tab === t ? 'rgba(255,255,255,0.2)' : 'var(--fill-subtle)',
                  borderRadius: 'var(--r-full)',
                  padding: '0 0.375rem',
                  fontSize: '0.75rem',
                }}>
                  {t === 'Activas' ? activas.length : historial.length}
                </span>
              </button>
            ))}
            {tab === 'Activas' && (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)' }}>
                Ver inspección
                <Switch id="sr-ver-inspeccion" checked={verInspeccion} onChange={cambiarVerInspeccion} label="Ver inspección" />
              </span>
            )}
          </div>

          {tab === 'Historial' && (
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Rampa, placa, conductor…" />
          )}

          {tab === 'Activas' ? (
            activas.length === 0 ? (
              <EmptyState icon={<Wrench size={22} />} title="Todas las rampas libres">
                No hay vehículos en rampas actualmente.
              </EmptyState>
            ) : (
              <>
                <div className="rt-solo-web">
                  <RampaTabla entradas={tablaEntradas} ots={ordenes.data ?? []} tecnicosPorRampa={tecnicosPorRampa} verInspeccion={verInspeccion} ultimasInsp={ultimasInsp} puedeEditar={puedeEditar} onEditar={e => setFormulario({ entrada: e })} onLiberar={setLiberando} onInspeccion={setInspAbierta} onAbrir={(e: RampaEntrada) => { haptic('selection'); abrirRampa(e); }} />
                </div>
                <div className="rm-solo-movil">
                  <RampaMovil entradas={tablaEntradas} tecnicosPorRampa={tecnicosPorRampa} verInspeccion={verInspeccion} ultimasInsp={ultimasInsp} onInspeccion={setInspAbierta} onAbrir={(e: RampaEntrada) => { haptic('selection'); abrirRampa(e); }} />
                </div>
              </>
            )
          ) : (
            visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin historial'}>
                {busqueda && (
                  <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>
                    Quitar búsqueda
                  </button>
                )}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visibles.map(e => (
                  <button
                    key={rampaId(e)}
                    type="button"
                    className="sr-hist-fila"
                    onClick={() => { haptic('selection'); setSeleccionadaId(rampaId(e)); }}
                  >
                    <div className="sr-hist-fila__cuerpo">
                      <span className="sr-hist-fila__placa">{e.placa ?? '—'}</span>
                      <span className="sr-hist-fila__sub">
                        {e.rampa} · {rampaConductor(e)}
                        {e.situacion ? ` · ${e.situacion}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="sr-hist-fila__fecha">
                        {formatFechaPe(e.fecha_ingreso) ?? '—'}
                      </span>
                      {e.fecha_salida && e.fecha_ingreso && (
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--label-3)' }}>
                          {formatTiempo(
                            Math.max(0, (new Date(e.fecha_salida).getTime() - new Date(e.fecha_ingreso).getTime()) / 3_600_000)
                          )}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <RampaFormulario open={!!formulario} rampaInicial={rampaInicial} entrada={formulario?.entrada ?? null} usuario={user?.name ?? ''} onClose={() => setFormulario(null)} />
      {liberando && <LiberarRampa entrada={liberando} usuario={user?.name ?? ''} open onClose={() => setLiberando(null)} />}
      <ConfigurarRampasSheet open={configurando} onClose={() => setConfigurando(false)} />
      <InspeccionFicha inspeccion={inspAbierta} onClose={() => setInspAbierta(null)} />
    </Page>
  );
}

// ─── Tarjeta de rampa activa ─────────────────────────────────────────────────

// ─── Rampas activas: tabla en escritorio, tarjetas compactas en celular ───────

const COLOR_RAMPA = (e: RampaEntrada) => (e.color && !['#ef4444', '#007aff', '#64748b'].includes(e.color) ? e.color : 'var(--ink)');
const NUM_RAMPA = (nombre: string) => nombre.match(/\d+/)?.[0] ?? nombre.trim().charAt(0).toUpperCase();
const soloFecha = (f: string | null | undefined) => formatFechaPe(f);
const soloHora = (h: string | null | undefined) => (h ? h.slice(0, 5) : '—');
function situacionTono(s: string | null) {
  const t = (s ?? '').toLowerCase();
  if (t.includes('espera')) return 'amber';
  if (t.includes('atenc')) return 'green';
  return 'gray';
}

function RampaTabla({ entradas, ots, tecnicosPorRampa, verInspeccion, ultimasInsp, puedeEditar, onEditar, onLiberar, onInspeccion, onAbrir }: { entradas: RampaEntrada[]; ots: OrdenTrabajo[]; tecnicosPorRampa: Map<string, string[]>; verInspeccion: boolean; ultimasInsp: Map<string, Inspeccion>; puedeEditar: boolean; onEditar: (e: RampaEntrada) => void; onLiberar: (e: RampaEntrada) => void; onInspeccion: (i: Inspeccion) => void; onAbrir: (e: RampaEntrada) => void }) {
  return (
    <div className="rt-caja">
      <table className="rt">
        <colgroup>
          {[150, 88, 52, 112, 168, undefined, 88, 52, 76, 150, 150, ...(verInspeccion ? [150] : []), 84].map((w, i) => (
            <col key={i} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>Rampa</th><th>Ingreso</th><th>Hora</th><th>Placa</th><th>Situación</th><th>Motivo de Ingreso</th>
            <th>Salida est.</th><th>Hora</th><th>H. taller</th><th>OT</th><th>Técnicos</th>{verInspeccion && <th>Inspección</th>}<th aria-label="Abrir" />
          </tr>
        </thead>
        <tbody>
          {entradas.map(e => {
            const horas = horasEnRampa(e.fecha_ingreso);
            return (
              <tr key={rampaId(e)} className="rt__fila pressable" tabIndex={0} onClick={() => { haptic('selection'); onAbrir(e); }}
                onKeyDown={ev => { if (ev.key === 'Enter') onAbrir(e); }}>
                <td>
                  <span className="rt__rampa">
                    <span className="rt__num" style={{ background: COLOR_RAMPA(e) }}>{NUM_RAMPA(e.rampa)}</span>
                    {e.rampa}
                  </span>
                </td>
                <td>{soloFecha(e.fecha_ingreso)}</td>
                <td>{soloHora(e.hora_ingreso)}</td>
                <td>{e.placa ? <LicensePlate plate={e.placa} size="sm" /> : '—'}</td>
                <td><span className={`rt__pill rt__pill--${situacionTono(e.situacion)}`}>{e.situacion ?? '—'}</span></td>
                <td className="rt__obs"><span className="rt__obs-texto" title={motivoIngreso(e.observaciones)}>{motivoIngreso(e.observaciones) || '—'}</span></td>
                <td>{soloFecha(e.salida_programada)}</td>
                <td>{soloHora(e.hora_salida_programada)}</td>
                <td><span className="rt__tiempo" style={{ color: tiempoColor(horas) }}>{horas > 0 ? formatTiempo(horas) : '—'}</span></td>
                <td>{(() => {
                  const de = otsDeRampa(e, ots, entradas);
                  return de.length ? <span className="rt__ot" title={de.map(o => o.id_ot).join(', ')}>{de.length} OT · {de[0].id_ot}</span> : '—';
                })()}</td>
                <td>{(() => {
                  const tecs = tecnicosPorRampa.get(rampaId(e)) ?? [];
                  return tecs.length ? tecs.map(n => <span key={n} className="rt__tecnico">{nombrePersona(n)}</span>) : '—';
                })()}</td>
                {verInspeccion && <td><BadgeInspeccion placa={e.placa} ultimas={ultimasInsp} onAbrir={onInspeccion} /></td>}
                <td>{e.estado === 'Libre' ? <span className="rt__ingresar">+ Ingresar</span> : puedeEditar ? (
                  <span className="rt__acciones">
                    <button type="button" className="rt__accion" title="Editar" aria-label="Editar rampa" onClick={ev => { ev.stopPropagation(); onEditar(e); }}><Pencil size={14} /></button>
                    <button type="button" className="rt__accion rt__accion--peligro" title="Liberar" aria-label="Liberar rampa" onClick={ev => { ev.stopPropagation(); onLiberar(e); }}><LogOut size={14} /></button>
                  </span>
                ) : <ChevronRight size={16} className="rt__flecha" aria-hidden />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Código de la última inspección con semáforo; al tocarlo abre el resumen sin salir de la pantalla */
function BadgeInspeccion({ placa, ultimas, onAbrir }: { placa: string | null; ultimas: Map<string, Inspeccion>; onAbrir: (i: Inspeccion) => void }) {
  const insp = placa ? ultimas.get(clavePlaca(placa)) ?? null : null;
  const dias = diasInspeccion(placa, ultimas);
  if (!insp) return <span className="rt__insp-dias" style={{ color: dias.color }}>{dias.texto}</span>;
  return (
    <button type="button" className="rt__insp" aria-label={`Ver inspección ${insp.id}`}
      onClick={e => { e.stopPropagation(); onAbrir(insp); }}>
      <span className="rt__insp-dias" style={{ color: dias.color }}>{dias.texto}</span>
    </button>
  );
}

function RampaMovil({ entradas, tecnicosPorRampa, verInspeccion, ultimasInsp, onInspeccion, onAbrir }: { entradas: RampaEntrada[]; tecnicosPorRampa: Map<string, string[]>; verInspeccion: boolean; ultimasInsp: Map<string, Inspeccion>; onInspeccion: (i: Inspeccion) => void; onAbrir: (e: RampaEntrada) => void }) {
  return (
    <div className="rm-lista">
      {entradas.map(e => {
        const horas = horasEnRampa(e.fecha_ingreso);
        return (
          <button key={rampaId(e)} type="button" className="rm-card pressable" onClick={() => { haptic('selection'); onAbrir(e); }}>
            <span className="rm-num" style={{ background: COLOR_RAMPA(e) }}>{NUM_RAMPA(e.rampa)}</span>
            <span className="rm-cuerpo">
              <span className="rm-cab">
                <span className="rm-rampa">{e.rampa}</span>
                <span className={`rt__pill rt__pill--${situacionTono(e.situacion)}`}>{e.situacion ?? '—'}</span>
              </span>
              <strong className="rm-placa">{e.placa ?? '—'}</strong>
              {(tecnicosPorRampa.get(rampaId(e)) ?? []).length > 0 && <span className="rm-km">Técnicos: {tecnicosPorRampa.get(rampaId(e))?.map(nombrePersona).join(', ')}</span>}
              <span className="rm-fechas">
                <span className="rm-chip rm-chip--in">Entrada {soloFecha(e.fecha_ingreso)} · {soloHora(e.hora_ingreso)}</span>
                <span className="rm-chip rm-chip--out">Salida est. {soloFecha(e.salida_programada)} · {soloHora(e.hora_salida_programada)}</span>
              </span>
              <span className="rm-pie">
                <span className="rm-km">KM: {e.km ? String(e.km) : '—'}</span>
                {verInspeccion && <span className="rm-km"><BadgeInspeccion placa={e.placa} ultimas={ultimasInsp} onAbrir={onInspeccion} /></span>}
                {horas > 0 && (
                  <span className="rt__tiempo" style={{ color: tiempoColor(horas) }}><Clock size={11} /> {formatTiempo(horas)}</span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface RampaDetalleProps {
  entrada: RampaEntrada;
  puedeEditar: boolean;
  usuario: string;
  onEditar: () => void;
  onVolver: () => void;
}

function RampaDetalle({ entrada: e, puedeEditar, usuario, onEditar, onVolver }: RampaDetalleProps) {
  const horas = horasEnRampa(e.fecha_ingreso);
  const qc = useQueryClient();
  const toast = useToast();
  const [liberando, setLiberando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [nuevaOT, setNuevaOT] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const liberada = e.estado === 'Liberado';
  const otsHijas = useOTsHijas(e.ticket_entrada);
  const ordenesData = useOrdenesTrabajoData();
  const trabajosData = useTrabajosOT();
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // PDF de la rampa: OT de la visita, trabajos, materiales y evidencia firmada desde S3
  async function imprimirRampa() {
    setGenerandoPdf(true);
    try {
      const otsVisita = (ordenesData.data ?? []).filter(o => (o.ticket_entrada && o.ticket_entrada === e.ticket_entrada) || (o.id_rampa && o.id_rampa === e.id));
      const materiales = (await Promise.all(otsVisita.map(async o => ({
        id_ot: o.id_ot,
        solicitudes: await api<MaterialOT[]>(`/taller/ot-materiales?ticket_ot=${encodeURIComponent(o.id_ot)}`).catch(() => [] as MaterialOT[]),
      })))).flatMap(x => x.solicitudes.map(s => ({ id_ot: x.id_ot, solicitud: s })));
      let evidenciaFirmada: string | null = null;
      if (e.evidencia_url) {
        const r = await api<{ signed?: Record<string, string> }>('/mantenimiento/inspecciones/presign-read', { method: 'POST', body: { urls: [e.evidencia_url] } });
        evidenciaFirmada = r.signed?.[e.evidencia_url] ?? null;
      }
      const blob = await pdfRampa({ entrada: e, ots: ordenesData.data ?? [], trabajos: trabajosData.data ?? [], materiales, evidenciaFirmada, usuario });
      descargarArchivo(blob, `Rampa-${e.placa ?? 'sin-placa'}-${e.ticket_entrada ?? e.id ?? ''}.pdf`);
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGenerandoPdf(false); }
  }

  async function reactivar() {
    setOcupado(true);
    try {
      await reactivarRampa(rampaId(e), usuario);
      haptic('success'); toast(`${e.rampa} reactivada`);
      await qc.invalidateQueries({ queryKey: ['mant', 'rampas'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  // Borra la rampa y en cadena sus OTs, trabajos e inspecciones: por eso se pide confirmación aparte
  async function eliminarRampa() {
    setEliminando(true);
    try {
      await eliminarRampaRegistro(rampaId(e), usuario);
      haptic('success'); toast('Registro de rampa y sus OTs eliminados');
      setEliminar(false);
      await qc.invalidateQueries({ queryKey: ['mant', 'rampas'] });
      await qc.invalidateQueries({ queryKey: ['mant', 'ots-hijas'] });
      onVolver();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Rampas
        </button>
        {puedeEditar && (
          <div className="tarjeta__barra-acciones">
            <Button variant="secondary" icon={<FileText size={16} />} onClick={imprimirRampa} loading={generandoPdf}>PDF de la rampa</Button>
            {!liberada && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
            {!liberada
              ? <Button variant="primary" icon={<LogOut size={16} />} onClick={() => setLiberando(true)}>Liberar</Button>
              : <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reactivar} loading={ocupado}>Reactivar</Button>}
            <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setEliminar(true)}>Eliminar</Button>
          </div>
        )}
      </div>

      <div className="ot-ficha__hero">
        {e.situacion && <span className="ot-estado ot-estado--neutral">{e.situacion}</span>}
        <h2 className="ot-ficha__placa">{e.placa ?? '—'}</h2>
        <span className="ot-ficha__id">{e.rampa}</span>
        {horas > 0 && !e.fecha_salida && (
          <span style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.85rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: tiempoColor(horas),
          }}>
            <Clock size={14} /> {formatTiempo(horas)} en rampa
          </span>
        )}
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Entrada</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{rampaConductor(e)}</span></div>
          {e.km && <div className="dato"><span className="dato__label">Km</span><span className="dato__valor dato__valor--mono">{String(e.km)}</span></div>}
          {e.ticket_entrada && <div className="dato"><span className="dato__label">Ticket</span><span className="dato__valor dato__valor--mono">{e.ticket_entrada}</span></div>}
          {e.salida_programada && <div className="dato"><span className="dato__label">Salida estimada</span><span className="dato__valor dato__valor--mono">{formatFechaPe(e.salida_programada)} {e.hora_salida_programada ?? ''}</span></div>}
          {e.liberado_por && <div className="dato"><span className="dato__label">Liberada por</span><span className="dato__valor">{e.liberado_por}</span></div>}
          {e.evidencia_url && <div className="dato"><span className="dato__label">Evidencia</span><a className="dato__valor dato__valor--enlace" href={e.evidencia_url} target="_blank" rel="noreferrer">Ver archivo</a></div>}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Fechas</p>
        <div className="tarjeta__lista">
          {e.fecha_ingreso && <div className="dato"><span className="dato__label">Fecha ingreso</span><span className="dato__valor dato__valor--mono">{formatFechaPe(e.fecha_ingreso)}</span></div>}
          {e.hora_ingreso && <div className="dato"><span className="dato__label">Hora ingreso</span><span className="dato__valor dato__valor--mono">{e.hora_ingreso}</span></div>}
          {e.fecha_salida && (
            <>
              <div className="dato"><span className="dato__label">Fecha salida</span><span className="dato__valor dato__valor--mono">{formatFechaPe(e.fecha_salida)}</span></div>
              {e.fecha_ingreso && (
                <div className="dato">
                  <span className="dato__label">Tiempo total</span>
                  <span className="dato__valor dato__valor--mono">
                    {formatTiempo(Math.max(0, (new Date(e.fecha_salida).getTime() - new Date(e.fecha_ingreso).getTime()) / 3_600_000))}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {e.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{e.observaciones}</span></div>
          </div>
        </div>
      )}

      {/* Órdenes de trabajo hijas de esta visita */}
      {e.ticket_entrada && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="tarjeta__grupo-titulo">Órdenes de trabajo</p>
            {puedeEditar && <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setNuevaOT(true)}>Nueva OT</Button>}
          </div>
          <div className="tarjeta__lista">
            {otsHijas.isLoading && <div className="dato"><span className="dato__valor">Cargando…</span></div>}
            {!otsHijas.isLoading && (otsHijas.data ?? []).length === 0 && (
              <div className="dato"><span className="dato__valor" style={{ color: 'var(--label-2)' }}>Aún no hay órdenes de trabajo en esta visita.</span></div>
            )}
            {(otsHijas.data ?? []).map(ot => (
              <div key={ot.id_ot} className="dato">
                <span className="dato__label">{ot.id_ot}</span>
                <span className="dato__valor">{[ot.tipo_ot, ot.sub_tipo].filter(Boolean).join(' · ')} · {ot.estado ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <LiberarRampa entrada={e} usuario={usuario} open={liberando} onClose={() => setLiberando(false)} />
      {e.ticket_entrada && (
        <NuevaOTHijaSheet ticket={e.ticket_entrada} usuario={usuario} open={nuevaOT} onClose={() => setNuevaOT(false)} />
      )}
      <ConfirmSheet open={eliminar} onClose={() => !eliminando && setEliminar(false)} onConfirm={eliminarRampa} loading={eliminando}
        title={`¿Eliminar el registro de ${e.placa ?? 'la rampa'}?`}
        message="Se eliminan también todas las órdenes de trabajo de esta visita, con sus trabajos e inspecciones. No se puede deshacer."
        confirmLabel="Eliminar" />
    </div>
  );
}

// Nueva OT hija de una visita: tipo y subtipo (mismo catálogo que el clásico)
function NuevaOTHijaSheet({ ticket, usuario, open, onClose }: { ticket: string; usuario: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tipo, setTipo] = useState<string>(TIPOS_OT[0]);
  const [sub, setSub] = useState<string>(SUBTIPOS_OT[TIPOS_OT[0]][0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTipo(TIPOS_OT[0]); setSub(SUBTIPOS_OT[TIPOS_OT[0]][0]); setError(null);
  }, [open]);

  async function crear() {
    setEnviando(true); setError(null);
    try {
      const r = await crearOTHija(ticket, tipo, sub, usuario);
      haptic('success'); toast(`OT ${r.id_ot ?? ''} creada`.trim());
      await qc.invalidateQueries({ queryKey: ['mant', 'ots-hijas', ticket] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nueva orden de trabajo"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={crear} loading={enviando}>Crear OT</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        <Field label="Tipo de OT">
          {p => (
            <SelectInput {...p} value={tipo} onChange={e => { setTipo(e.target.value); setSub(SUBTIPOS_OT[e.target.value][0]); }}>
              {TIPOS_OT.map(t => <option key={t} value={t}>{t}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Sub tipo">
          {p => (
            <SelectInput {...p} value={sub} onChange={e => setSub(e.target.value)}>
              {(SUBTIPOS_OT[tipo] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
