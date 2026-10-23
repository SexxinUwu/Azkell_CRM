import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Disc3, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, SearchField, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { exportarExcel } from '../../core/lib/excel';
import { MM_CRITICO } from './neumaticosSemaforo';
import { EsquemaNeumaticos, HistorialLlantaSheet, LeyendaSemaforo, configReconocida, remanenteDe, tonoMm, type LlantaDato } from './NeumaticosEsquema';

// Extras de neumáticos que el clásico tiene en "Análisis": esquema por placa
// (GET /api/neumaticos/estado-actual/:placa), importación con validación previa
// (POST /api/neumaticos/importar), exportación (GET /api/neumaticos/exportar-datos)
// y detalle por medida (GET /api/neumaticos/medida-detalle?medida=).

const dia = (v: unknown) => (v ? String(v).split('T')[0] : '—');
const num = (v: unknown) => (v == null || v === '' ? '—' : Number(v).toLocaleString('es-PE'));

// ─── Esquema de neumáticos por placa ─────────────────────────────────────────

export interface EstadoActual {
  ok?: boolean; error?: string; placa: string;
  unidad: { marca?: string; modelo_uts?: string; tipo?: string; configuracion?: string | null };
  ultima_inspeccion: { fecha_inspeccion?: string; km_vehiculo?: number } | null;
  posiciones: LlantaDato[];
}

function usePlacas() {
  return useQuery<string[]>({
    queryKey: ['mant', 'placas-lista'],
    queryFn: () => api<{ data?: string[] }>('/placas-lista').then(r => r.data ?? []),
    staleTime: 300_000,
  });
}

export function EsquemaPlacaSheet({ open, onClose, placaInicial = '' }: { open: boolean; onClose: () => void; placaInicial?: string }) {
  const { data: placas } = usePlacas();
  const [placa, setPlaca] = useState('');
  const [llanta, setLlanta] = useState<LlantaDato | null>(null);
  useEffect(() => { if (open) { setPlaca(placaInicial); setLlanta(null); } }, [open, placaInicial]);

  const { data, isFetching, error } = useQuery<EstadoActual>({
    queryKey: ['mant', 'neumaticos-estado-actual', placa],
    enabled: open && !!placa,
    queryFn: async () => {
      const r = await api<EstadoActual>(`/neumaticos/estado-actual/${encodeURIComponent(placa)}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo obtener el estado de la unidad');
      return r;
    },
  });

  const u = data?.unidad;
  const configuracion = configReconocida(u?.configuracion, u?.tipo);
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Esquema de neumáticos por placa"
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        <div className="form-grid">
          <div className="field field--wide">
            <label className="field__label">Placa</label>
            <PlacaPicker value={placa} onChange={setPlaca} opciones={(placas ?? []).map(p => ({ placa: p }))} />
          </div>
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(error)}</Notice></div>}
          {isFetching && <div className="field field--wide"><PageLoader /></div>}
          {!placa && !isFetching && (
            <div className="field field--wide"><EmptyState icon={<Disc3 size={22} />} title="Elige una placa">Verás el diagrama de ejes con las llantas de su última inspección.</EmptyState></div>
          )}
          {data && !isFetching && (
            data.posiciones.length === 0 ? (
              <div className="field field--wide"><EmptyState icon={<Disc3 size={22} />} title="Sin inspecciones">No hay inspecciones de neumáticos registradas para {data.placa}.</EmptyState></div>
            ) : (
              <div className="field field--wide" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: '0.8125rem' }}>
                  <span><b>{data.placa}</b> · {[u?.marca, u?.modelo_uts].filter(Boolean).join(' ')} ({u?.tipo || 'Unidad'})</span>
                  <span style={{ color: 'var(--label-2)' }}>
                    Última inspección: <b>{dia(data.ultima_inspeccion?.fecha_inspeccion)}</b>
                    {data.ultima_inspeccion?.km_vehiculo ? ` · ${num(data.ultima_inspeccion.km_vehiculo)} km` : ''}
                  </span>
                </div>
                <EsquemaNeumaticos llantas={data.posiciones} configuracion={configuracion} activa={llanta?.posicion ?? ''} onSelect={setLlanta} />
                <p className="t-footnote c-secondary">Toca una llanta para ver su historial de rotaciones, presiones e inspecciones.</p>
              </div>
            )
          )}
        </div>
      </Sheet>
      <HistorialLlantaSheet placa={data?.placa ?? placa} llanta={llanta} onClose={() => setLlanta(null)} />
    </>
  );
}

// ─── Detalle por medida ──────────────────────────────────────────────────────

interface LlantaMedida {
  placa: string; tipo_unidad: string | null; marca_unidad: string | null; modelo_unidad: string | null; dueno: string | null;
  posicion: string | null; marca_llanta: string | null; modelo_llanta: string | null; medida: string | null;
  r1: number | null; r2: number | null; r3: number | null; remanente_promedio: number | null; presion_actual: number | null;
  estado: string | null; alerta_cambio: number | null; fecha_inspeccion: string | null; km_vehiculo: number | null;
}
interface RespMedida { ok?: boolean; error?: string; total_llantas: number; total_unidades: number; llantas: LlantaMedida[] }

function remanenteMedida(i: LlantaMedida): number | null {
  return remanenteDe(i);
}

export function MedidaDetalleSheet({ medida, onClose }: { medida: string | null; onClose: () => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { setQ(''); }, [medida]);

  const { data, isLoading, error } = useQuery<RespMedida>({
    queryKey: ['mant', 'neumaticos-medida', medida],
    enabled: medida !== null,
    queryFn: async () => {
      const r = await api<RespMedida>(`/neumaticos/medida-detalle?medida=${encodeURIComponent(medida ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo obtener el detalle de la medida');
      return r;
    },
  });

  const lista = useMemo(() => {
    const t = q.toLowerCase().trim();
    const todas = data?.llantas ?? [];
    if (!t) return todas;
    return todas.filter(i => [i.placa, i.tipo_unidad, i.marca_unidad, i.posicion, i.marca_llanta, i.modelo_llanta, i.estado]
      .some(c => c != null && String(c).toLowerCase().includes(t)));
  }, [data, q]);

  async function exportar() {
    try {
      await exportarExcel(`Llantas_Medida_${(medida || 'Medida').replace(/[^a-zA-Z0-9]/g, '_')}`, `Llantas ${medida}`.slice(0, 31),
        ['Placa', 'Tipo Unidad', 'Marca Unidad', 'Modelo Unidad', 'Dueño / Cliente', 'Posición', 'Marca Llanta', 'Modelo Llanta', 'Medida',
          'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'Remanente Promedio (mm)', 'Presión Actual (PSI)', 'Estado', 'Alerta Cambio', 'Fecha Inspección', 'Km Vehículo'],
        lista.map(i => [i.placa, i.tipo_unidad ?? '', i.marca_unidad ?? '', i.modelo_unidad ?? '', i.dueno ?? '', i.posicion ?? '',
          i.marca_llanta ?? '', i.modelo_llanta ?? '', i.medida ?? '', i.r1 ?? '', i.r2 ?? '', i.r3 ?? '', i.remanente_promedio ?? '',
          i.presion_actual ?? '', i.estado || (i.alerta_cambio === 1 ? 'CRÍTICO' : 'BUENO'), i.alerta_cambio === 1 ? 'SÍ' : 'NO',
          dia(i.fecha_inspeccion) === '—' ? '' : dia(i.fecha_inspeccion), i.km_vehiculo ?? '']));
    } catch { /* el aviso lo da el navegador si la descarga falla */ }
  }

  return (
    <Sheet open={medida !== null} onClose={onClose} title={`Llantas instaladas · ${medida ?? ''}`}
      footer={<><Button variant="secondary" onClick={exportar} disabled={!lista.length}>Exportar Excel</Button>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(error)}</Notice></div>}
        {isLoading ? <div className="field field--wide"><PageLoader /></div> : data && (
          <div className="field field--wide" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
              <b>{num(data.total_llantas)}</b> llantas · <b>{num(data.total_unidades)}</b> unidades (última inspección de cada unidad en uso)
            </div>
            <LeyendaSemaforo />
            <SearchField value={q} onChange={setQ} placeholder="Placa, tipo, marca, posición, estado…" />
            {lista.length === 0 ? <EmptyState icon={<Disc3 size={22} />} title="Sin registros">No hay llantas para esta búsqueda.</EmptyState> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="inv-kardex" style={{ minWidth: '64rem', fontSize: '0.8rem' }}>
                  <thead><tr>
                    <th>Placa</th><th>Tipo</th><th>Modelo unidad</th><th>Posición</th><th>Marca</th><th>Modelo</th>
                    <th>Medida</th><th>Remanente</th><th>PSI</th><th>Estado</th><th>Inspección</th>
                  </tr></thead>
                  <tbody>
                    {lista.map((i, k) => {
                      const mm = remanenteMedida(i);
                      const tono = tonoMm(mm);
                      const est = String(i.estado || (i.alerta_cambio === 1 ? 'CRÍTICO' : 'BUENO')).toUpperCase();
                      const estado = i.alerta_cambio === 1 || est.includes('CRIT') ? 'CRÍTICO' : est.includes('REG') || est.includes('OBS') ? 'REGULAR' : est;
                      return (
                        <tr key={i.placa + (i.posicion ?? '') + k}>
                          <td><b>{i.placa}</b></td>
                          <td>{i.tipo_unidad || 'Unidad'}</td>
                          <td>{[i.marca_unidad, i.modelo_unidad].filter(Boolean).join(' ') || '—'}</td>
                          <td>{i.posicion || '—'}</td>
                          <td>{i.marca_llanta || '—'}</td>
                          <td>{i.modelo_llanta || '—'}</td>
                          <td>{i.medida || '—'}</td>
                          <td style={{ color: tono === 'gray' ? undefined : `var(--${tono}-ink)`, fontWeight: 700 }}>{mm === null ? '—' : `${mm.toFixed(1)} mm`}</td>
                          <td>{i.presion_actual ? `${i.presion_actual} PSI` : '—'}</td>
                          <td>{estado}</td>
                          <td>{dia(i.fecha_inspeccion)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ─── Exportación completa (27 columnas oficiales) ───────────────────────────

export async function exportarNeumaticos() {
  const r = await api<{ ok?: boolean; error?: string; data?: Array<Record<string, string | number | null>> }>('/neumaticos/exportar-datos');
  if (r.ok === false || !r.data) throw new Error(r.error ?? 'No se pudieron obtener datos para exportar');
  if (r.data.length === 0) throw new Error('No hay registros de inspecciones para exportar.');
  const encabezados = Object.keys(r.data[0]);
  await exportarExcel('Reporte_Inspecciones_Neumaticos', 'Inspecciones_Neumaticos', encabezados, r.data.map(f => encabezados.map(h => f[h])));
}

// ─── Importación con validación previa ──────────────────────────────────────

interface ItemImp {
  posicion: string; tipo_eje: string; marca: string; medida: string; modelo: string;
  r1: number; r2: number; r3: number; r4: number; presion_ant: number; presion_actual: number;
  estado: string; accion: string; observaciones: string; rot: string; foto1: string; foto2: string; foto3: string;
}
interface InspImp { id_inspeccion: string | null; placa: string; fecha_inspeccion: string; km_vehiculo: number; items: ItemImp[] }
interface Lectura { inspecciones: InspImp[]; errores: string[]; avisos: string[]; filas: number }

type Celda = string | number | boolean | Date | null;

// Mismos encabezados que la plantilla y la exportación del clásico
const ENCABEZADOS_PLANTILLA = [
  'ID', 'F. INSPECCION', 'PLACA', 'ESTADO LLANT', 'KM', 'LLANTA',
  'DUEÑO', 'MARCA', 'UNIDAD', 'Delantera o Traccion', 'MARCA DE LLANTA', 'MEDIDA', 'MODELO',
  'R1', 'R2', 'R3', 'R4', 'PRESION DE AIRE ANT', 'PRESION DE AIRE ACTUAL',
  'ESTADO', 'ACCION', 'OBS', 'ROT', 'R Min', 'FOTO1', 'FOTO2', 'FOTO3',
];
const EJEMPLOS: (string | number)[][] = [
  [3, '2024-01-02', 'BEQ986', 'Activa', 150000, 1, 'PROPIO', 'VOLVO', 'TRACTO', 'DELANTERA', 'MAXELL', '295/80R22.5', 'GAU867', 12, 13, 13, 0, 100, 100, 'NUEVA', 'INSPECCION', 'Ninguna', 'NO', 12, '', '', ''],
  [3, '2024-01-02', 'BEQ986', 'Activa', 150000, 2, 'PROPIO', 'VOLVO', 'TRACTO', 'DELANTERA', 'MAXELL', '295/80R22.5', 'GAU867', 14, 13, 13, 0, 100, 100, 'NUEVA', 'INSPECCION', 'Ninguna', 'NO', 13, '', '', ''],
  [3, '2024-01-02', 'BEQ986', 'Activa', 150000, 3, 'PROPIO', 'VOLVO', 'TRACTO', 'TRACCION', 'JKTIRE', '295/80R22.5', 'GAU867', 6, 6, 10, 0, 100, 100, 'NUEVA', 'INSPECCION', 'Ninguna', 'NO', 6, '', '', ''],
  [5, '2024-01-03', 'ARW987', 'Activa', 180000, 1, 'PROPIO', 'SCANIA', 'TRACTO', 'DELANTERA', 'STEELMARK', '275/70R22.5', 'KT512', 6, 7, 6, 0, 100, 100, 'RENCAUCHADA', 'INSPECCION', 'Ninguna', 'NO', 6, '', '', ''],
];

const plegar = (k: string) => k.trim().toUpperCase();
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fechaIso(v: Celda): string {
  if (v instanceof Date) return isoLocal(v);
  if (typeof v === 'number') return isoLocal(new Date(Math.round((v - 25569) * 86400 * 1000) + new Date().getTimezoneOffset() * 60000));
  const s = String(v ?? '').trim();
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dm) return `${dm[3]}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
  return s.split('T')[0];
}

async function leerNeumaticos(archivo: File): Promise<Lectura> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as Celda[][];
  if (filas.length < 2) throw new Error('El archivo Excel no contiene filas válidas.');
  const claves = filas[0].map(h => plegar(String(h ?? '')));
  const grupos = new Map<string, InspImp>();
  const errores: string[] = [];
  const avisos: string[] = [];
  let leidas = 0;

  filas.slice(1).forEach((fila, idx) => {
    const n = idx + 2; // número de fila en Excel
    const norm: Record<string, Celda> = {};
    claves.forEach((k, i) => { if (k && norm[k] === undefined) norm[k] = fila[i] ?? null; });
    const get = (...alias: string[]): Celda => {
      for (const a of alias) { const v = norm[a.toUpperCase()]; if (v !== undefined && v !== null && v !== '') return v; }
      return '';
    };
    if (fila.every(c => c === null || c === '')) return;
    const placa = String(get('PLACA', 'VEHICULO')).trim().toUpperCase();
    if (!placa) { avisos.push(`Fila ${n}: sin placa, se omite.`); return; }

    const idRef = String(get('ID', 'ID INSPECCION', 'ID_INSPECCION', 'REF')).trim();
    const fecha = fechaIso(get('F. INSPECCION', 'F_INSPECCION', 'FECHA INSPECCION', 'FECHA') || new Date());
    if (Number.isNaN(new Date(fecha).getTime())) errores.push(`Fila ${n}: fecha no válida (${fecha}).`);
    const km = parseInt(String(get('KM', 'KM TABLERO', 'KM_VEHICULO') || 0), 10) || 0;
    const clave = idRef ? `ID_${idRef}` : `${placa}_${fecha}`;
    let g = grupos.get(clave);
    if (!g) { g = { id_inspeccion: idRef || null, placa, fecha_inspeccion: fecha, km_vehiculo: km, items: [] }; grupos.set(clave, g); }

    const entero = (alias: string[], defecto: number, etiqueta: string) => {
      const crudo = get(...alias);
      if (crudo === '') return defecto;
      const v = Number(String(crudo).replace(',', '.'));
      if (Number.isNaN(v) || v < 0) { errores.push(`Fila ${n}: ${etiqueta} no es un número válido (${crudo}).`); return defecto; }
      return Math.trunc(v);
    };
    const item: ItemImp = {
      posicion: String(get('LLANTA', 'POSICION', 'POS') || idx + 1).trim().toUpperCase(),
      tipo_eje: String(get('Delantera o Traccion', 'TIPO_EJE', 'EJE')).trim(),
      marca: String(get('MARCA DE LLANTA', 'MARCA_LLANTA', 'MARCA')).trim(),
      medida: String(get('MEDIDA', 'TAMANO')).trim(),
      modelo: String(get('MODELO')).trim(),
      r1: entero(['R1', 'REMANENTE 1'], 0, 'R1'),
      r2: entero(['R2', 'REMANENTE 2'], 0, 'R2'),
      r3: entero(['R3', 'REMANENTE 3'], 0, 'R3'),
      r4: entero(['R4', 'REMANENTE 4'], 0, 'R4'),
      presion_ant: entero(['PRESION DE AIRE ANT', 'PRESION_ANT', 'PRESION ANTERIOR'], 100, 'presión anterior'),
      presion_actual: entero(['PRESION DE AIRE ACTUAL', 'PRESION_ACTUAL', 'PRESION ACTUAL'], 100, 'presión actual'),
      estado: String(get('ESTADO', 'ESTADO_LLANTA') || 'NUEVA').trim().toUpperCase(),
      accion: String(get('ACCION') || 'INSPECCION').trim(),
      observaciones: String(get('OBS', 'OBSERVACIONES')).trim(),
      rot: String(get('ROT', 'ROTACION') || 'NO').trim(),
      foto1: String(get('FOTO1', 'FOTO 1')).trim(),
      foto2: String(get('FOTO2', 'FOTO 2')).trim(),
      foto3: String(get('FOTO3', 'FOTO 3')).trim(),
    };
    if (g.items.some(x => x.posicion === item.posicion)) errores.push(`Fila ${n}: la posición ${item.posicion} está repetida en la inspección de ${placa} (${fecha}).`);
    if (!item.marca) avisos.push(`Fila ${n}: ${placa} pos. ${item.posicion} sin marca de llanta.`);
    if (!item.medida) avisos.push(`Fila ${n}: ${placa} pos. ${item.posicion} sin medida.`);
    if (!item.r1 && !item.r2 && !item.r3 && !item.r4) avisos.push(`Fila ${n}: ${placa} pos. ${item.posicion} sin remanentes (se guardará como crítica).`);
    g.items.push(item);
    leidas++;
  });
  return { inspecciones: [...grupos.values()], errores, avisos, filas: leidas };
}

export async function descargarPlantillaNeumaticos() {
  await exportarExcel('Plantilla_Inspeccion_Neumaticos_Azkell', 'Plantilla_Neumaticos', ENCABEZADOS_PLANTILLA, EJEMPLOS);
}

export function ImportarNeumaticosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setArchivo(null); setLectura(null); setError(null); } }, [open]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setLectura(null); setError(null); setLeyendo(true);
    try {
      const l = await leerNeumaticos(f);
      setLectura(l);
      if (!l.inspecciones.length) setError('No se detectaron placas válidas en el Excel.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!lectura?.inspecciones.length || lectura.errores.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; mensaje?: string; error?: string }>('/neumaticos/importar', { method: 'POST', body: { inspecciones: lectura.inspecciones } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo importar');
      haptic('success');
      toast(r.mensaje ?? 'Importación terminada');
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-analisis'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const insp = lectura?.inspecciones ?? [];
  const llantas = insp.reduce((a, i) => a + i.items.length, 0);
  const bloqueado = !insp.length || (lectura?.errores.length ?? 0) > 0;

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar inspecciones de neumáticos"
      footer={<><Button variant="secondary" onClick={() => descargarPlantillaNeumaticos().catch(e => toast(errorMessage(e), 'error'))} disabled={enviando}>Descargar plantilla</Button>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={importar} loading={enviando} disabled={bloqueado || leyendo}>
          {insp.length ? `Importar ${insp.length} inspecciones` : 'Importar'}
        </Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${insp.length ? ` · ${insp.length} inspecciones (${llantas} llantas)` : ''}` : 'Usa la plantilla oficial de 27 columnas (la misma que genera Exportar)'}>
          {p => <TextInput {...p} type="file" accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>
        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}
        {lectura && lectura.errores.length > 0 && (
          <div className="field field--wide">
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              <b>{lectura.errores.length} error(es) a corregir antes de importar</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{lectura.errores.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>
              {lectura.errores.length > 8 && <span>… y {lectura.errores.length - 8} más.</span>}
            </Notice>
          </div>
        )}
        {lectura && lectura.avisos.length > 0 && (
          <div className="field field--wide">
            <Notice>
              <b>{lectura.avisos.length} aviso(s)</b> (no bloquean la importación)
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{lectura.avisos.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
              {lectura.avisos.length > 5 && <span>… y {lectura.avisos.length - 5} más.</span>}
            </Notice>
          </div>
        )}
        {insp.length > 0 && (
          <div className="field field--wide" style={{ overflowX: 'auto' }}>
            <table className="inv-kardex" style={{ minWidth: '40rem', fontSize: '0.8rem' }}>
              <thead><tr><th>ID</th><th>Fecha</th><th>Placa</th><th>KM</th><th>Llantas</th><th>Críticas (&lt;3 mm)</th></tr></thead>
              <tbody>
                {insp.slice(0, 50).map((i, k) => {
                  // Misma fórmula que el servidor: promedio de R1..R3 (o R1..R4 si hay R4); crítica con menos de 3 mm
                  const criticas = i.items.filter(it => (it.r4 > 0 ? (it.r1 + it.r2 + it.r3 + it.r4) / 4 : (it.r1 + it.r2 + it.r3) / 3) < MM_CRITICO).length;
                  return (
                    <tr key={k}>
                      <td>{i.id_inspeccion || 'Auto'}</td><td>{i.fecha_inspeccion}</td><td><b>{i.placa}</b></td>
                      <td>{num(i.km_vehiculo)}</td><td>{i.items.length}</td>
                      <td style={{ color: criticas ? 'var(--red-ink)' : undefined, fontWeight: criticas ? 700 : undefined }}>{criticas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {insp.length > 50 && <p className="t-footnote c-secondary">Se muestran 50 de {insp.length} inspecciones.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
