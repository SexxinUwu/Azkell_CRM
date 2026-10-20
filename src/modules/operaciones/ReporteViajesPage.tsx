import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileSpreadsheet, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';

interface Tramo { ruta?: string | null; ordenes: string[]; peso_tn: number; galones_estimados: number }
interface ViajeReporte {
  viaje: string; fecha: string | null; placa_tracto: string | null; placa_remolque: string | null; conductor: string | null;
  ruta_principal: string | null; estado: string | null; modelo_motor: string | null; configuracion: string | null;
  configuracion_tracto: string | null; configuracion_remolque: string | null;
  peso_total_tn: number; galones_teoricos_total: number; ida: Tramo; retorno: Tramo;
}

const POR_PAGINA = 30;
const n = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown) => n(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mayus = (v: unknown) => String(v ?? '').trim().toUpperCase();
const hoyLocal = () => new Date().toLocaleDateString('en-CA');
// AAAA-MM-DD a DD/MM/AAAA, igual que el clásico
const fechaCorta = (f: string | null) => {
  if (!f) return '---';
  const p = f.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f;
};

const COLUMNAS: ColumnaTabla[] = [
  { id: 'exp', titulo: '', ancho: 44, minimo: 44 },
  { id: 'viaje', titulo: 'N° viaje', ancho: 140, minimo: 110 },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'tracto', titulo: 'Tracto', ancho: 120 },
  { id: 'carreta', titulo: 'Carreta', ancho: 150 },
  { id: 'config', titulo: 'Config.', ancho: 90 },
  { id: 'motor', titulo: 'Motor', ancho: 120 },
  { id: 'ruta', titulo: 'Ruta', ancho: 240, minimo: 140 },
  { id: 'conductor', titulo: 'Conductor', ancho: 200 },
  { id: 'peso', titulo: 'Peso (TN)', ancho: 110, alinear: 'right' },
  { id: 'galones', titulo: 'Galones (GL)', ancho: 120, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 120 },
];

// Mismos encabezados que el CSV del clásico
const ENCABEZADOS_EXCEL = [
  'Nro Viaje', 'Fecha', 'Tracto', 'Carreta', 'Configuracion Combinada', 'Config Tracto', 'Config Carreta', 'Motor', 'Conductor', 'Ruta Principal',
  'Peso Ida (TN)', 'Galones Ida (GL)', 'Ruta Retorno', 'Peso Retorno (TN)', 'Galones Retorno (GL)', 'Peso Total (TN)', 'Galones Totales Programados (GL)', 'Estado',
];

// Tarjeta de indicador de la cabecera
function Kpi({ titulo, valor, unidad }: { titulo: string; valor: string; unidad?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 16, padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-2)' }}>{titulo}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {valor}{unidad && <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--label-2)' }}> {unidad}</span>}
      </span>
    </div>
  );
}

// Operaciones › Reporte de viajes: ida, retorno y galones teóricos de la matriz D2 por viaje
export function ReporteViajesPage() {
  const toast = useToast();
  const hoy = hoyLocal();
  const [viaje, setViaje] = useState('');
  const [q, setQ] = useState('');
  const [motor, setMotor] = useState('ALL');
  const [config, setConfig] = useState('ALL');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [pagina, setPagina] = useState(1);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const datos = useQuery({
    queryKey: ['operaciones', 'reporte-viajes'],
    queryFn: () => api<{ ok?: boolean; data?: ViajeReporte[]; error?: string }>('/operaciones/reporte-viajes').then(r => {
      if (r.ok === false) throw new Error(r.error || 'No se pudieron obtener datos');
      return r.data ?? [];
    }),
    staleTime: 60_000,
  });
  const lista = useMemo(() => datos.data ?? [], [datos.data]);

  const motores = useMemo(() => [...new Set(lista.map(v => mayus(v.modelo_motor)).filter(Boolean))].sort(), [lista]);
  const configs = useMemo(() => [...new Set(lista.map(v => mayus(v.configuracion || v.configuracion_tracto)).filter(Boolean))].sort(), [lista]);

  // Mismos filtros que el clásico
  const filtrados = useMemo(() => {
    const fv = mayus(viaje);
    const t = mayus(q);
    return lista.filter(v => {
      if (fv && !mayus(v.viaje).includes(fv)) return false;
      if (t) {
        const campos = [v.placa_tracto, v.placa_remolque, v.conductor, v.ruta_principal, v.ida?.ruta, v.retorno?.ruta, v.configuracion, v.configuracion_tracto, v.configuracion_remolque];
        if (!campos.some(c => mayus(c).includes(t))) return false;
      }
      if (motor !== 'ALL' && mayus(v.modelo_motor) !== motor) return false;
      if (config !== 'ALL' && mayus(v.configuracion) !== config && mayus(v.configuracion_tracto) !== config) return false;
      if (desde && v.fecha && v.fecha < desde) return false;
      if (hasta && v.fecha && v.fecha > hasta) return false;
      return true;
    });
  }, [lista, viaje, q, motor, config, desde, hasta]);

  useEffect(() => { setPagina(1); }, [viaje, q, motor, config, desde, hasta]);

  const kpis = useMemo(() => {
    const galones = filtrados.reduce((s, v) => s + n(v.galones_teoricos_total), 0);
    const tn = filtrados.reduce((s, v) => s + n(v.peso_total_tn), 0);
    return { viajes: filtrados.length, galones, tn, prom: filtrados.length ? galones / filtrados.length : 0 };
  }, [filtrados]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  const visibles = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const alternar = (c: string) => setAbiertos(prev => { const s = new Set(prev); if (s.has(c)) s.delete(c); else s.add(c); return s; });
  const limpiar = () => { setViaje(''); setQ(''); setMotor('ALL'); setConfig('ALL'); setDesde(hoy); setHasta(hoy); };

  async function exportar() {
    if (filtrados.length === 0) { toast('No hay datos para exportar.', 'error'); return; }
    try {
      const filas = filtrados.map(v => [
        v.viaje, v.fecha ?? '', v.placa_tracto ?? '', v.placa_remolque ?? '', v.configuracion || v.configuracion_tracto || 'T3',
        v.configuracion_tracto || 'T3', v.configuracion_remolque ?? '', v.modelo_motor ?? '', v.conductor ?? '', v.ruta_principal ?? '',
        +n(v.ida?.peso_tn).toFixed(2), +n(v.ida?.galones_estimados).toFixed(2), v.retorno?.ruta ?? '', +n(v.retorno?.peso_tn).toFixed(2),
        +n(v.retorno?.galones_estimados).toFixed(2), +n(v.peso_total_tn).toFixed(2), +n(v.galones_teoricos_total).toFixed(2), v.estado ?? '',
      ]);
      await exportarExcel('Reporte-viajes-combustible', 'Viajes', ENCABEZADOS_EXCEL, filas);
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Reporte de viajes"
        subtitle={datos.isLoading ? 'Cargando…' : `${kpis.viajes} viajes · galones teóricos con la matriz D2`}
        actions={<MenuOtros opciones={[{ label: 'Exportar Excel', detalle: `${filtrados.length} viajes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar }]} />}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-3)' }}>
          <Kpi titulo="Viajes" valor={kpis.viajes.toLocaleString('es-PE')} />
          <Kpi titulo="Galones teóricos" valor={fmt(kpis.galones)} unidad="GL" />
          <Kpi titulo="Toneladas" valor={fmt(kpis.tn)} unidad="TN" />
          <Kpi titulo="Promedio" valor={fmt(kpis.prom)} unidad="GL/viaje" />
        </div>

        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <TextInput value={viaje} onChange={e => setViaje(e.target.value)} placeholder="N° de viaje" aria-label="N° de viaje" style={{ width: 150 }} />
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <SearchField value={q} onChange={setQ} placeholder="Placa, conductor, ruta o configuración…" />
          </div>
          <SelectInput value={motor} onChange={e => setMotor(e.target.value)} aria-label="Motor" style={{ width: 'auto' }}>
            <option value="ALL">Todos los motores</option>{motores.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectInput>
          <SelectInput value={config} onChange={e => setConfig(e.target.value)} aria-label="Configuración" style={{ width: 'auto' }}>
            <option value="ALL">Config.</option>{configs.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          <Button variant="secondary" onClick={limpiar}>Limpiar</Button>
        </div>

        {datos.isLoading ? <PageLoader /> : datos.isError ? <Notice tone="error">{errorMessage(datos.error)}</Notice> : visibles.length === 0 ? (
          <EmptyState icon={<SearchX size={22} />} title="No se encontraron viajes registrados">Ajusta los filtros de búsqueda.</EmptyState>
        ) : (
          <>
            <TablaRedimensionable id="reporte-viajes" columnas={COLUMNAS} ariaLabel="Reporte de viajes">
              {visibles.map(v => {
                const abierto = abiertos.has(v.viaje);
                const tramos: { etiqueta: string; t: Tramo; vacio: string; porDefecto: string }[] = [
                  { etiqueta: 'IDA', t: v.ida, vacio: 'Tramo principal', porDefecto: 'LIMA - DESTINO' },
                  { etiqueta: 'RETORNO', t: v.retorno, vacio: 'Retorno estándar', porDefecto: 'DESTINO - LIMA' },
                ];
                return (
                  <Fragment key={v.viaje}>
                    <tr className="tabla-redim__fila--click" onClick={() => { haptic('selection'); alternar(v.viaje); }} title="Clic para ver el desglose de ida y retorno">
                      <Celda>{abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Celda>
                      <Celda mono>{v.viaje}</Celda>
                      <Celda mono>{fechaCorta(v.fecha)}</Celda>
                      <Celda mono>{v.placa_tracto || '—'}</Celda>
                      <Celda mono>{v.placa_remolque?.trim() ? v.placa_remolque : 'SOLO TRACTO (-25%)'}</Celda>
                      <Celda>{v.configuracion || 'T3'}</Celda>
                      <Celda mono>{v.modelo_motor || '—'}</Celda>
                      <Celda>{v.ruta_principal || '—'}</Celda>
                      <Celda>{v.conductor || '—'}</Celda>
                      <Celda alinear="right" mono>{fmt(v.peso_total_tn)}</Celda>
                      <Celda alinear="right" mono>{fmt(v.galones_teoricos_total)}</Celda>
                      <Celda>{v.estado || '—'}</Celda>
                    </tr>
                    {abierto && tramos.map(({ etiqueta, t, vacio, porDefecto }) => (
                      <tr key={etiqueta} className="tabla-redim__sub">
                        <Celda>—</Celda>
                        <Celda>{etiqueta}</Celda>
                        <Celda>—</Celda>
                        <Celda mono>{v.placa_tracto || '—'}</Celda>
                        <Celda mono>{v.placa_remolque || '—'}</Celda>
                        <Celda>—</Celda>
                        <Celda>—</Celda>
                        <Celda>{`Ruta: ${t?.ruta || porDefecto}`}</Celda>
                        <Celda>{t?.ordenes?.length ? `O/S: ${t.ordenes.join(', ')}` : vacio}</Celda>
                        <Celda alinear="right" mono>{fmt(t?.peso_tn)}</Celda>
                        <Celda alinear="right" mono>{fmt(t?.galones_estimados)}</Celda>
                        <Celda>—</Celda>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </TablaRedimensionable>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
              <span className="t-footnote c-secondary">Mostrando {(pag - 1) * POR_PAGINA + 1} a {Math.min(pag * POR_PAGINA, filtrados.length)} de {filtrados.length} viajes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <Button variant="secondary" disabled={pag <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button>
                <span className="t-footnote c-secondary">{pag} / {paginas}</span>
                <Button variant="secondary" disabled={pag >= paginas} onClick={() => setPagina(p => Math.min(paginas, p + 1))}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
