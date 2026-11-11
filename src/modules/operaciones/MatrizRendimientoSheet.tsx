import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { exportarExcel } from '../../core/lib/excel';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import '../../core/ui/acciones-iconos.css';

// Matriz de rendimiento teórico (D2): consumo esperado por ruta según carga y motor.
// Contrato del servidor: /api/combustible/matriz (GET, POST, PUT/:id, DELETE/:id, importar, vaciar-todo).
export interface FilaMatriz {
  id: number; sentido: string; ruta: string; motor: string; confg: string;
  km_0: number | string; km_5: number | string; km_10: number | string; km_15: number | string;
  km_20: number | string; km_25: number | string; km_30: number | string; km: number | string;
}

const TRAMOS = ['km_0', 'km_5', 'km_10', 'km_15', 'km_20', 'km_25', 'km_30'] as const;
const ETIQUETA_TRAMO: Record<string, string> = { km_0: '0', km_5: '5', km_10: '10', km_15: '15', km_20: '20', km_25: '25', km_30: '30' };
const num = (v: unknown) => Number(v) || 0;

type Vacio = Omit<FilaMatriz, 'id'> & { id?: number };
const VACIO: Vacio = { sentido: 'IDA', ruta: '', motor: 'MC11.44', confg: 'T3', km_0: '', km_5: '', km_10: '', km_15: '', km_20: '', km_25: '', km_30: '', km: '' };

const COLUMNAS_MATRIZ: ColumnaTabla[] = [
  { id: 'sentido', titulo: 'Sentido', ancho: 95 },
  { id: 'ruta', titulo: 'Ruta', ancho: 260, minimo: 140 },
  { id: 'motor', titulo: 'Motor', ancho: 110 },
  { id: 'confg', titulo: 'Config.', ancho: 90 },
  ...TRAMOS.map(t => ({ id: t, titulo: `${ETIQUETA_TRAMO[t]} km`, ancho: 80, alinear: 'right' as const })),
  { id: 'km', titulo: 'Total km', ancho: 100, alinear: 'right' },
  { id: 'acciones', titulo: '', ancho: 100, minimo: 90 },
];

function FormularioFila({ fila, onClose }: { fila: Vacio | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Vacio>(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errRuta, setErrRuta] = useState<string | undefined>();
  const editando = !!fila?.id;

  useEffect(() => {
    if (!fila) return;
    setV({ ...VACIO, ...fila });
    setError(null);
  }, [fila]);

  async function guardar() {
    setError(null);
    if (!v.ruta.trim()) { setErrRuta('Escribe el nombre de la ruta.'); haptic('warning'); return; }
    setEnviando(true);
    try {
      await api(editando ? `/combustible/matriz/${v.id}` : '/combustible/matriz', { method: editando ? 'PUT' : 'POST', body: v });
      haptic('success');
      toast(editando ? 'Ruta actualizada' : 'Ruta agregada a la matriz');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const set = (k: keyof Vacio, val: string) => setV(prev => ({ ...prev, [k]: val }));

  return (
    <Sheet open={!!fila} onClose={() => !enviando && onClose()} title={editando ? `Editar ${v.ruta || 'ruta'}` : 'Nueva ruta'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Ruta" wide error={errRuta}>{p => <TextInput {...p} value={v.ruta} onChange={e => { set('ruta', e.target.value.toUpperCase()); setErrRuta(undefined); }} />}</Field>
        <Field label="Sentido">
          {p => (
            <SelectInput {...p} value={v.sentido} onChange={e => set('sentido', e.target.value)}>
              <option value="IDA">IDA</option><option value="RETORNO">RETORNO</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Configuración">{p => <TextInput {...p} value={v.confg} onChange={e => set('confg', e.target.value.toUpperCase())} />}</Field>
        <Field label="Motor">{p => <TextInput {...p} value={v.motor} onChange={e => set('motor', e.target.value)} />}</Field>
        <Field label="Km total">{p => <TextInput {...p} inputMode="decimal" value={String(v.km)} onChange={e => set('km', e.target.value)} />}</Field>
        {TRAMOS.map(t => (
          <Field key={t} label={`Consumo a ${ETIQUETA_TRAMO[t]}% carga`}>
            {p => <TextInput {...p} inputMode="decimal" value={String(v[t])} onChange={e => set(t, e.target.value)} />}
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

// Importación desde Excel: los encabezados se pasan tal cual, igual que el clásico (el servidor los reconoce)
async function leerMatriz(archivo: File): Promise<Record<string, string | number>[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as (string | number | boolean | Date | null)[][];
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos.');
  const encabezados = filas[0].map(h => String(h ?? '').trim());
  return filas.slice(1).filter(f => f.some(c => c !== null && c !== '')).map(f => {
    const o: Record<string, string | number> = {};
    encabezados.forEach((h, i) => { if (h) { const c = f[i]; o[h] = c == null ? '' : (c instanceof Date ? c.toISOString().slice(0, 10) : (c as string | number)); } });
    return o;
  });
}

// Plantilla de importación: mismas columnas que la del clásico (SENTIDO, RUTA, MOTOR, CONFG, tramos 0-30 y KM)
async function descargarPlantilla() {
  await exportarExcel('Plantilla_Matriz_Combustible_D2', 'Matriz_Combustible_D2',
    ['SENTIDO', 'RUTA', 'MOTOR', 'CONFG', '0', '5', '10', '15', '20', '25', '30', 'KM'],
    [
      ['IDA', 'LIMA - ICA', 'MC11.44', 'T3', 23.13, 24.5, 26.24, 28.28, 30.71, 33.93, 37.24, 330],
      ['IDA', 'LIMA - NASCA', 'MC11.44', 'T3', 32.5, 34.5, 37.03, 40, 43.53, 48.21, 53.03, 480],
      ['IDA', 'LIMA - AREQUIPA', 'MC11.44', 'T3', 74.91, 77.5, 83.27, 106.15, 115.65, 125.02, 133.75, 1050],
    ]);
  haptic('success');
}

// Excel con lo que se ve en la tabla (respeta la búsqueda y el filtro de sentido)
async function exportarMatriz(filas: FilaMatriz[]) {
  await exportarExcel('Matriz_Combustible_D2', 'Matriz_Combustible_D2',
    ['SENTIDO', 'RUTA', 'MOTOR', 'CONFG', '0', '5', '10', '15', '20', '25', '30', 'KM'],
    filas.map(f => [f.sentido, f.ruta, f.motor, f.confg, ...TRAMOS.map(t => (f[t] === '' || f[t] == null ? '' : num(f[t]) as string | number)), num(f.km)]));
  haptic('success');
}

export function MatrizRendimientoPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sentido, setSentido] = useState('');
  const [ruta, setRuta] = useState('');
  const [motor, setMotor] = useState('');
  const [confg, setConfg] = useState('');
  const [kmDesde, setKmDesde] = useState('');
  const [kmHasta, setKmHasta] = useState('');
  const [tramo, setTramo] = useState('');
  const [galDesde, setGalDesde] = useState('');
  const [galHasta, setGalHasta] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [editar, setEditar] = useState<Vacio | null>(null);
  const [borrar, setBorrar] = useState<FilaMatriz | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [vaciar, setVaciar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filasImp, setFilasImp] = useState<Record<string, string | number>[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matriz = useQuery({
    queryKey: ['operaciones', 'matriz'],
    enabled: true,
    queryFn: () => api<{ data?: FilaMatriz[] }>('/combustible/matriz').then(r => r.data ?? []),
    staleTime: 30_000,
  });

  // Consumo (galones) de un tramo de peso: se elige el tramo y el rango; sin tramo no filtra
  const gd = galDesde.trim() === '' ? null : Number(galDesde), gh = galHasta.trim() === '' ? null : Number(galHasta);
  const enRangoTramo = (f: FilaMatriz) => {
    if (!tramo || ((gd === null || Number.isNaN(gd)) && (gh === null || Number.isNaN(gh)))) return true;
    const v = f[tramo as typeof TRAMOS[number]];
    if (v === '' || v == null) return false;
    return (gd === null || Number.isNaN(gd) || num(v) >= gd) && (gh === null || Number.isNaN(gh) || num(v) <= gh);
  };
  const visibles = useMemo(() => {
    const desde = kmDesde.trim() === '' ? null : Number(kmDesde), hasta = kmHasta.trim() === '' ? null : Number(kmHasta);
    return (matriz.data ?? []).filter(f =>
      (!sentido || f.sentido === sentido) && (!ruta || f.ruta === ruta) && (!motor || f.motor === motor) && (!confg || f.confg === confg) &&
      (desde === null || Number.isNaN(desde) || num(f.km) >= desde) && (hasta === null || Number.isNaN(hasta) || num(f.km) <= hasta) &&
      enRangoTramo(f) &&
      (!q || `${f.ruta} ${f.motor} ${f.confg}`.toUpperCase().includes(q.toUpperCase())));
  }, [matriz.data, q, sentido, ruta, motor, confg, kmDesde, kmHasta, tramo, galDesde, galHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Valores que existen en cada columna: pocos = botones; muchos = lista con buscador
  const valores = useMemo(() => {
    const u = (k: 'sentido' | 'ruta' | 'motor' | 'confg') => [...new Set((matriz.data ?? []).map(f => String(f[k] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    return { sentido: u('sentido'), ruta: u('ruta'), motor: u('motor'), confg: u('confg') };
  }, [matriz.data]);
  const filtrosActivos = (sentido ? 1 : 0) + (ruta ? 1 : 0) + (motor ? 1 : 0) + (confg ? 1 : 0) + (kmDesde.trim() || kmHasta.trim() ? 1 : 0) + (tramo && (galDesde.trim() || galHasta.trim()) ? 1 : 0);
  const limpiarFiltros = () => { setSentido(''); setRuta(''); setMotor(''); setConfg(''); setKmDesde(''); setKmHasta(''); setTramo(''); setGalDesde(''); setGalHasta(''); };
  /** Hasta 5 valores: botones; más: lista con buscador */
  const selector = (titulo: string, lista: string[], valor: string, cambiar: (v: string) => void) => (
    <GrupoFiltro titulo={titulo}>
      {lista.length <= 5
        ? <ChoiceChips label={titulo} value={valor} onChange={cambiar} options={[{ value: '', label: 'Todos' }, ...lista.map(x => ({ value: x, label: x }))]} />
        : <Combobox options={lista.map(x => ({ value: x, label: x }))} value={valor || null} onChange={v => cambiar(v ?? '')} enHoja compacta placeholder={`Todas (${lista.length})`} tituloHoja={titulo} />}
    </GrupoFiltro>
  );

  async function eliminar() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await api(`/combustible/matriz/${borrar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Ruta ${borrar.ruta} eliminada`);
      setBorrar(null);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  async function vaciarTodo() {
    setBorrando(true);
    try {
      await api('/combustible/matriz/vaciar-todo', { method: 'DELETE' });
      haptic('success'); toast('Matriz vaciada');
      setVaciar(false);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  async function elegirArchivo(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setFilasImp([]); setError(null); setLeyendo(true);
    try { setFilasImp(await leerMatriz(f)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!filasImp.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; message?: string; insertados?: number; error?: string }>('/combustible/matriz/importar', { method: 'POST', body: { items: filasImp } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo importar');
      haptic('success'); toast(r.message ?? `Se importaron ${r.insertados ?? filasImp.length} registros`);
      setImportando(false); setFilasImp([]); setArchivo(null);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="acciones-iconos acciones-iconos--sinfondo">
            <button type="button" className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Exportar Excel" aria-label="Exportar Excel"
              disabled={!visibles.length} onClick={() => { exportarMatriz(visibles).catch(err => toast(errorMessage(err), 'error')); }}>
              <Download size={20} />
            </button>
            <button type="button" className="acciones-iconos__boton acciones-iconos__boton--violeta" data-tip="Plantilla Excel" aria-label="Plantilla Excel"
              onClick={() => { descargarPlantilla().catch(err => toast(errorMessage(err), 'error')); }}>
              <FileSpreadsheet size={20} />
            </button>
            {puedeEditar && (
              <>
                <button type="button" className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Importar Excel" aria-label="Importar Excel" onClick={() => setImportando(true)}>
                  <Upload size={20} />
                </button>
                <button type="button" className="acciones-iconos__boton acciones-iconos__boton--rojo" data-tip="Vaciar matriz" aria-label="Vaciar matriz"
                  disabled={!(matriz.data ?? []).length} onClick={() => setVaciar(true)}>
                  <Trash2 size={20} />
                </button>
              </>
            )}
          </div>
          {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditar(VACIO)}>Nueva ruta</Button>}
        </div>
        <BarraFiltros busqueda={q} onBusqueda={setQ} placeholder="Ruta, motor o configuración…" activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)} />
        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} onLimpiar={limpiarFiltros} resultado={visibles.length} unidad="ruta">
          {selector('Sentido', valores.sentido, sentido, setSentido)}
          {selector('Configuración', valores.confg, confg, setConfg)}
          {selector('Motor', valores.motor, motor, setMotor)}
          {selector('Ruta', valores.ruta, ruta, setRuta)}
          <GrupoFiltro titulo="Total km">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <TextInput inputMode="decimal" aria-label="Total km desde" placeholder="Desde" value={kmDesde} onChange={e => setKmDesde(e.target.value)} />
              <span className="t-footnote c-secondary">a</span>
              <TextInput inputMode="decimal" aria-label="Total km hasta" placeholder="Hasta" value={kmHasta} onChange={e => setKmHasta(e.target.value)} />
            </div>
          </GrupoFiltro>
          <GrupoFiltro titulo="Consumo por tramo de peso (galones)">
            <Combobox options={TRAMOS.map(t => ({ value: t, label: `${ETIQUETA_TRAMO[t]} Tn` }))} value={tramo || null} onChange={v => setTramo(v ?? '')} enHoja compacta placeholder="Elige el tramo de peso" tituloHoja="Tramo de peso" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <TextInput inputMode="decimal" aria-label="Consumo desde" placeholder="Desde" value={galDesde} onChange={e => setGalDesde(e.target.value)} disabled={!tramo} />
              <span className="t-footnote c-secondary">a</span>
              <TextInput inputMode="decimal" aria-label="Consumo hasta" placeholder="Hasta" value={galHasta} onChange={e => setGalHasta(e.target.value)} disabled={!tramo} />
            </div>
          </GrupoFiltro>
        </HojaFiltros>

        {matriz.isLoading ? <PageLoader /> : matriz.isError ? <Notice tone="error">{errorMessage(matriz.error)}</Notice>
          : visibles.length === 0 ? <EmptyState title="Sin rutas" icon={<FileSpreadsheet size={22} />}>Agrega rutas o importa el Excel de la matriz.</EmptyState> : (
          <TablaRedimensionable id="matriz-rendimiento" ariaLabel="Matriz de rendimiento teórico" columnas={COLUMNAS_MATRIZ} altoMax="70vh" colorEncabezado="#dbeafe" colorTextoEncabezado="#1e3a8a">
            {visibles.map(f => (
              <tr key={f.id}>
                <Celda>{f.sentido}</Celda>
                <Celda>{f.ruta}</Celda>
                <Celda mono>{f.motor}</Celda>
                <Celda mono>{f.confg}</Celda>
                {TRAMOS.map(t => (
                  <Celda key={t} alinear="right" mono>{f[t] === '' || f[t] == null ? '—' : num(f[t]).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</Celda>
                ))}
                <Celda alinear="right" mono>{num(f.km).toLocaleString('es-PE', { maximumFractionDigits: 2 })}</Celda>
                <Celda>
                  {puedeEditar && (
                    <span className="acciones-iconos acciones-iconos--sinfondo" style={{ flexWrap: 'nowrap' }}>
                      <button type="button" className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Editar" title="Editar" onClick={() => setEditar({ ...f })} aria-label={`Editar ruta ${f.ruta}`}><Pencil size={18} /></button>
                      <button type="button" className="acciones-iconos__boton acciones-iconos__boton--rojo" data-tip="Eliminar" title="Eliminar" onClick={() => setBorrar(f)} aria-label={`Eliminar ruta ${f.ruta}`}><Trash2 size={18} /></button>
                    </span>
                  )}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <FormularioFila fila={editar} onClose={() => setEditar(null)} />

      <Sheet open={importando} onClose={() => !enviando && setImportando(false)} title="Importar matriz desde Excel"
        footer={<><Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={descargarPlantilla}>Descargar plantilla</Button>
          <Button variant="secondary" onClick={() => setImportando(false)} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={importar} loading={enviando} disabled={!filasImp.length || leyendo}>
            {filasImp.length ? `Importar ${filasImp.length} filas` : 'Importar'}</Button></>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
          <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? archivo.name : 'Primera hoja con los encabezados en la fila 1'}>
            {p => <ArchivoInput {...p} accept=".xlsx,.xls,.csv" disabled={leyendo || enviando} onChange={a => elegirArchivo(a ?? undefined)} />}
          </Field>
          {leyendo && <div className="field field--wide"><Notice>Leyendo el archivo…</Notice></div>}
          {filasImp.length > 0 && <div className="field field--wide"><Notice tone="neutral">Las filas se agregan a la matriz actual. Usa "Vaciar" antes si quieres empezar de cero.</Notice></div>}
        </div>
      </Sheet>

      <ConfirmSheet open={!!borrar} onClose={() => !borrando && setBorrar(null)} onConfirm={eliminar} loading={borrando}
        title={`¿Eliminar la ruta ${borrar?.ruta ?? ''}?`} message="Se quita de la matriz de rendimiento." confirmLabel="Eliminar" />
      <ConfirmSheet open={vaciar} onClose={() => !borrando && setVaciar(false)} onConfirm={vaciarTodo} loading={borrando}
        title="¿Vaciar toda la matriz?" message="Se eliminan todas las rutas y consumos teóricos. Esta acción no se puede deshacer." confirmLabel="Vaciar matriz" />
    </>
  );
}
