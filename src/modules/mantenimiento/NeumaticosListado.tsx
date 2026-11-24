import './NeumaticosListado.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Disc3, SearchX, Settings, Truck } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { formatMoneda } from '../../core/lib/format';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { BarraFiltros, GrupoFiltro, HojaFiltros, ListaEleccion } from '../../core/ui/FiltrosListado';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { LogoArchivo } from './NeumaticosRequerimiento';
import { vidaTexto } from './ntb-api';
import { useAuth } from '../../core/auth/AuthProvider';
import { DespacharReformadoraSheet, GenerarOrdenReencaucheSheet } from './NeumaticosReencauche';

// Listado de neumáticos: GET /api/neumaticos/listado (contrato en routes/neumaticos-ciclo.js).
// Cada fila abre la ficha de la llanta (ruta mantenimiento/neumaticos-ficha/:codigo).

/** Claves de situación que devuelve el servidor (conteos) */
type Clave = 'activo' | 'disponible' | 'en_actividad' | 'enviar_reforma' | 'en_reformadora' | 'esperando_descarte' | 'desactivacion' | 'sin_codigo' | 'provisional';
type Filtro = 'TODOS' | Clave;

export interface LlantaListado {
  codigo: string;
  vida: number | null;            // 0 = R0 … 3 = R3
  medida: string | null;
  marca: string | null;
  modelo: string | null;
  estado_ciclo: string | null;
  almacen: string | null;
  placa_actual: string | null;
  gastos_compra: number | '';     // '' = sin dato de compra
  moneda_compra?: string;         // moneda de la orden de compra (PEN o USD): el costo se muestra en esa moneda
  orden_compra?: string | null;   // OC de la recepción que dio de alta la llanta (si es de recepción)
  situacion: string;              // texto legible (ver TONO_SITUACION)
}

export interface RespuestaListado {
  ok: boolean;
  error?: string;
  conteos: Record<Clave, number>;
  data: LlantaListado[];
}

// Chips de filtro: "Todos" no lleva conteo (el servidor no envía el total)
const CHIPS: { clave: Filtro; etiqueta: string }[] = [
  { clave: 'TODOS', etiqueta: 'Todos' },
  { clave: 'activo', etiqueta: 'Activo' },
  { clave: 'sin_codigo', etiqueta: 'Sin código de fuego' },
  { clave: 'provisional', etiqueta: 'Código provisional' },
  { clave: 'disponible', etiqueta: 'Disponible' },
  { clave: 'en_actividad', etiqueta: 'En actividad' },
  { clave: 'enviar_reforma', etiqueta: 'Enviar para reforma' },
  { clave: 'en_reformadora', etiqueta: 'En la reformadora' },
  { clave: 'esperando_descarte', etiqueta: 'Esperando descarte' },
  { clave: 'desactivacion', etiqueta: 'Desactivación' },
];

type Tono = 'verde' | 'azul' | 'ambar' | 'acento' | 'rojo' | 'violeta' | 'gris';

// Color pastel de la situación (mismo criterio que pago.css: fondo tintado y texto oscuro del mismo tono)
const TONO_SITUACION: Record<string, Tono> = {
  'Disponible': 'verde',
  'En actividad': 'azul',
  'Enviar para reforma': 'ambar',
  'En la reformadora': 'acento',
  'Esperando descarte': 'rojo',
  'Desactivación': 'gris',
  'Sin código de fuego': 'violeta',
  'Código provisional': 'gris',
};

const ENCABEZADOS_EXCEL = ['Neumático', 'Vida actual', 'Medida', 'Marca', 'Modelo', 'Vehículo actual', 'Gastos de compra', 'Moneda', 'Orden de compra', 'Situación'];

// Columnas de la tabla: título, cómo se ordena y cómo se mide su ancho según lo que contiene
interface DefColumna { id: string; titulo: string; alinear?: 'right' | 'center'; mono?: boolean; extra?: number; minimo: number; maximo: number; valor?: (l: LlantaListado) => string | number; texto?: (l: LlantaListado) => string }
const DEFINICION: DefColumna[] = [
  { id: 'codigo', titulo: 'Neumático', mono: true, minimo: 110, maximo: 220, valor: l => l.codigo, texto: l => l.codigo },
  { id: 'vida', titulo: 'Vida', minimo: 64, maximo: 90, valor: l => l.vida ?? -1, texto: l => vidaTexto(l.vida) },
  { id: 'medida', titulo: 'Medida', mono: true, minimo: 90, maximo: 170, valor: l => l.medida ?? '', texto: l => l.medida ?? '' },
  { id: 'marca', titulo: 'Marca', minimo: 80, maximo: 160, valor: l => l.marca ?? '', texto: l => l.marca ?? '' },
  { id: 'modelo', titulo: 'Modelo', minimo: 80, maximo: 200, valor: l => l.modelo ?? '', texto: l => l.modelo ?? '' },
  { id: 'vehiculo', titulo: 'Vehículo', mono: true, minimo: 84, maximo: 130, valor: l => l.placa_actual ?? '', texto: l => l.placa_actual ?? '' },
  { id: 'gastos', titulo: 'Gastos de compra', alinear: 'right', mono: true, minimo: 110, maximo: 180, valor: l => Number(l.gastos_compra) || 0, texto: l => gastosTexto(l.gastos_compra, l.moneda_compra) },
  { id: 'orden', titulo: 'Orden de compra', mono: true, minimo: 110, maximo: 190, valor: l => l.orden_compra ?? '', texto: l => l.orden_compra ?? '' },
  { id: 'situacion', titulo: 'Situación', extra: 34, minimo: 110, maximo: 220, valor: l => l.situacion, texto: l => l.situacion },
];

/** Ancho de una columna: el del texto más largo (o el del título) con un margen, dentro de un mínimo y un máximo */
function anchoDe(d: DefColumna, filas: LlantaListado[]): number {
  const largo = Math.max(d.titulo.length + 4, ...filas.map(l => (d.texto ? d.texto(l).length : 0)));
  return Math.min(d.maximo, Math.max(d.minimo, Math.round(largo * (d.mono ? 7.8 : 7.1) + 26 + (d.extra ?? 0))));
}

const SIN_CODIGO = 'Sin código de fuego';

interface ConfigCodigo {
  ok?: boolean;
  error?: string;
  letra: string | null;
  anio: number;
  ultimo: number;
  proximo: string | null;
  actualizado_por: string | null;
}

function useConfigCodigo() {
  return useQuery<ConfigCodigo>({
    queryKey: ['mant', 'neumaticos', 'codigo-fuego'],
    queryFn: async () => {
      const r = await api<ConfigCodigo>('/neumaticos/codigo-fuego');
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo leer la configuración del código de fuego');
      return r;
    },
    staleTime: 15_000,
  });
}

/** Panel para elegir la letra de la empresa (M, R, T, Y). Lo puede cambiar quien tenga acceso a Neumáticos. */
function ConfigCodigoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useConfigCodigo();
  const qc = useQueryClient();
  const toast = useToast();
  const [letra, setLetra] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLetra(config.data?.letra ?? '');
      setError(null);
    }
  }, [open, config.data?.letra]);

  async function guardar() {
    const v = letra.trim().toUpperCase();
    if (!/^[A-Z]$/.test(v)) {
      setError('Escribe una sola letra de la A a la Z');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api('/neumaticos/codigo-fuego/letra', { method: 'PUT', body: { letra: v } });
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos', 'codigo-fuego'] });
      toast('Letra guardada');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Código de fuego"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={guardando} onClick={guardar}>Guardar</Button>
        </>
      }>
      {config.isLoading ? <PageLoader /> : config.isError ? <Notice tone="error">{errorMessage(config.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <Field label="Letra de la empresa" hint="Marsisa M · Rosymar R · Trahesa T · Yogui Y" error={error ?? undefined}>
            {p => <TextInput {...p} value={letra} maxLength={1} onChange={e => setLetra(e.target.value.toUpperCase())} />}
          </Field>
          <p className="nl-conteo">
            Año {config.data?.anio}: el siguiente código será <strong>{config.data?.proximo ?? '—'}</strong>.
            La secuencia se reinicia cada año.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function useListado(filtro: Filtro, q: string) {
  return useQuery<RespuestaListado>({
    queryKey: ['mant', 'neumaticos', 'listado', filtro, q],
    queryFn: async () => {
      const r = await api<RespuestaListado>('/neumaticos/listado', { query: { estado: filtro, q } });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar el listado de neumáticos');
      return r;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

const gastosTexto = (v: number | '', moneda?: string) => (v === '' ? '—' : formatMoneda(v, moneda));

function SituacionChip({ texto }: { texto: string }) {
  return <span className={`nl-situacion nl-situacion--${TONO_SITUACION[texto] ?? 'gris'}`}>{texto}</span>;
}

/** Casilla de la referencia: cuadro y check que se dibuja al marcarla */
function CasillaSeleccion({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="nl-casilla" onClick={e => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <svg viewBox="0 0 95 95" aria-hidden="true">
        <rect x={30} y={20} width={50} height={50} stroke="currentColor" strokeWidth={2} fill="none" />
        <g transform="translate(0,-952.36222)">
          <path d="m 56,963 c -102,122 6,9 7,9 17,-5 -66,69 -38,52 122,-77 -7,14 18,4 29,-11 45,-43 23,-4" stroke="currentColor" strokeWidth={3} fill="none" className="nl-casilla__trazo" />
        </g>
      </svg>
    </label>
  );
}

/** Código de fuego que recibiría la llanta n-ésima de la secuencia (misma forma que el servidor) */
const codigoPrevisto = (letra: string, anio: number, n: number) => `${letra}${String(anio).slice(-2)}${String(n).padStart(5, '0')}`;

/** Máximo de códigos por vez (lo mismo que el servidor) */
const MAX_POR_VEZ = 200;

/** Ventana previa: a la izquierda el código que se asignará, a la derecha el neumático elegido */
function GenerarCodigosSheet({ open, onClose, seleccionados, onAsignado }: {
  open: boolean; onClose: () => void; seleccionados: LlantaListado[]; onAsignado: () => void;
}) {
  const config = useConfigCodigo();
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const letra = config.data?.letra ?? null;
  const anio = config.data?.anio ?? 0;
  const ultimo = config.data?.ultimo ?? 0;
  const demasiados = seleccionados.length > MAX_POR_VEZ;
  const esProvisional = (l: LlantaListado) => l.codigo.toUpperCase().startsWith('PROV-');
  const aAsignar = seleccionados.filter(l => !esProvisional(l));
  const provisionales = seleccionados.length - aAsignar.length;
  let siguiente = ultimo;
  const previa = seleccionados.map(l => {
    if (esProvisional(l)) return { l, codigo: null as string | null };
    siguiente += 1;
    return { l, codigo: codigoPrevisto(letra ?? '', anio, siguiente) };
  });

  async function asignar() {
    setGenerando(true);
    setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; asignados: { id_neumatico: string; codigo: string }[] }>(
        '/neumaticos/codigo-fuego/generar', { method: 'POST', body: { ids: aAsignar.map(l => l.codigo) } });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudieron generar los códigos');
      onAsignado();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => { if (!generando) onClose(); }} title="Generar códigos de fuego"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generando}>Cancelar</Button>
          <Button variant="primary" loading={generando} disabled={!letra || demasiados || aAsignar.length === 0} onClick={asignar}>
            Asignar {aAsignar.length} {aAsignar.length === 1 ? 'código' : 'códigos'}
          </Button>
        </>
      }>
      {config.isLoading ? <PageLoader /> : config.isError ? <Notice tone="error">{errorMessage(config.error)}</Notice> : !letra ? (
        <Notice tone="error">Falta configurar la letra del código de fuego de la empresa (botón «Código de fuego»).</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {demasiados && <Notice tone="error">Se pueden generar hasta {MAX_POR_VEZ} códigos por vez.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {provisionales > 0 && (
            <p className="nl-conteo">
              {provisionales} {provisionales === 1 ? 'llanta tiene' : 'llantas tienen'} código provisional: no reciben código de fuego y no se asignan.
            </p>
          )}
          <p className="nl-conteo">
            Los códigos se asignan en orden, desde <strong>{codigoPrevisto(letra, anio, ultimo + 1)}</strong>.
          </p>
          <table className="nl-previa" aria-label="Códigos de fuego a asignar">
            <thead>
              <tr><th>Código de fuego</th><th>Neumático</th></tr>
            </thead>
            <tbody>
              {previa.map(({ l, codigo }) => (
                <tr key={l.codigo}>
                  <td className="nl-codigo">{codigo ?? <span className="nl-conteo">No asignable</span>}</td>
                  <td><span className="nl-codigo">{l.codigo}</span><span className="nl-previa__medida">{l.medida || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}

export function NeumaticosListado() {
  const navigate = useNavigate();
  const movil = useMediaQuery(MOBILE_QUERY);
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [exportando, setExportando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [previaAbierta, setPreviaAbierta] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [ordenAbierta, setOrdenAbierta] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
  const [fMarca, setFMarca] = useState('');
  const [fModelo, setFModelo] = useState('');
  const [fMedida, setFMedida] = useState('');
  const [fVida, setFVida] = useState('');
  const [fPlaca, setFPlaca] = useState('');
  const [fOrden, setFOrden] = useState('');
  const [orden, setOrden] = useState<{ campo: string; dir: 'asc' | 'desc' } | null>(null);
  const [despachoAbierto, setDespachoAbierto] = useState(false);
  const { can } = useAuth();
  const puedeReforma = can('neumaticos.reencauche');
  const qc = useQueryClient();
  const toast = useToast();

  // La búsqueda espera 250 ms después de la última tecla antes de consultar
  useEffect(() => {
    const t = window.setTimeout(() => setQ(busqueda.trim()), 250);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  // Al cambiar el filtro o la búsqueda, la selección vuelve a empezar
  useEffect(() => { setSeleccion(new Set()); }, [filtro, q, fMarca, fModelo, fMedida, fVida, fPlaca, fOrden]);
  const { data, isLoading, isError, error } = useListado(filtro, q);
  const todas = useMemo(() => data?.data ?? [], [data]);
  const conteos = data?.conteos;
  const activos = [fMarca, fModelo, fMedida, fVida, fPlaca, fOrden].filter(Boolean).length;
  const hayFiltro = filtro !== 'TODOS' || q !== '' || activos > 0;
  const limpiarFiltros = () => { setFMarca(''); setFModelo(''); setFMedida(''); setFVida(''); setFPlaca(''); setFOrden(''); };

  // Filtros del panel y orden por columna (se aplican sobre lo que ya trajo el servidor con la situación y la búsqueda)
  const filas = useMemo(() => {
    const base = todas.filter(l => (!fMarca || l.marca === fMarca) && (!fModelo || l.modelo === fModelo) && (!fMedida || l.medida === fMedida)
      && (!fVida || String(l.vida) === fVida) && (!fPlaca || l.placa_actual === fPlaca) && (!fOrden || l.orden_compra === fOrden));
    const def = orden ? DEFINICION.find(d => d.id === orden.campo) : undefined;
    if (!def || !def.valor) return base;
    const v = def.valor; const signo = orden!.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => { const x = v(a); const y = v(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })) * signo; });
  }, [todas, fMarca, fModelo, fMedida, fVida, fPlaca, fOrden, orden]);

  const opcionesDe = (extraer: (l: LlantaListado) => string | null | undefined, todos: string) => {
    const m = new Map<string, number>();
    todas.forEach(l => { const v = extraer(l); if (v) m.set(v, (m.get(v) ?? 0) + 1); });
    return [{ value: '', label: todos, count: todas.length }, ...[...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true })).map(([value, count]) => ({ value, label: value, count }))];
  };
  const opcionesVida = [{ value: '', label: 'Todas las vidas', count: todas.length }, ...[0, 1, 2, 3].map(v => ({ value: String(v), label: vidaTexto(v), count: todas.filter(l => l.vida === v).length })).filter(o => o.count > 0)];

  function ordenarPor(campo: string) {
    setOrden(o => (!o || o.campo !== campo ? { campo, dir: 'asc' } : o.dir === 'asc' ? { campo, dir: 'desc' } : null));
  }
  // Encabezado que ordena al tocarlo
  const encabezado = (d: DefColumna): ReactNode => (
    <button type="button" className={`nl-orden${orden?.campo === d.id ? ' is-activo' : ''}`} onClick={() => ordenarPor(d.id)} aria-label={`Ordenar por ${d.titulo}`}>
      {d.titulo}
      {orden?.campo !== d.id ? <ArrowUpDown size={12} aria-hidden /> : orden.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
    </button>
  );
  const columnas: ColumnaTabla[] = useMemo(() => [
    { id: 'sel', titulo: '', ancho: 44, minimo: 40, alinear: 'center' as const },
    ...DEFINICION.map(d => ({ id: d.id, titulo: encabezado(d), ancho: anchoDe(d, filas), minimo: Math.min(d.minimo, 70), alinear: d.alinear })),
    { id: 'acciones', titulo: '', ancho: 56, minimo: 48, alinear: 'center' as const },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [filas, orden]);

  // En el filtro «Enviar para reforma» la selección es para la orden de reencauche; en los demás, para el código de fuego
  const modoReforma = filtro === 'enviar_reforma';
  const seleccionables = filas.filter(l => l.situacion === (modoReforma ? 'Enviar para reforma' : SIN_CODIGO)).map(l => l.codigo);
  const todasSeleccionadas = seleccionables.length > 0 && seleccionables.every(cod => seleccion.has(cod));

  function alternar(codigo: string) {
    setSeleccion(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(codigo)) siguiente.delete(codigo);
      else siguiente.add(codigo);
      return siguiente;
    });
  }

  function alternarTodas() {
    setSeleccion(todasSeleccionadas ? new Set() : new Set(seleccionables));
  }

  const abrirFicha = (codigo: string) => navigate(`/mantenimiento/neumaticos-ficha/${encodeURIComponent(codigo)}`);

  async function exportar() {
    setExportando(true);
    setErrorExcel(null);
    try {
      // Exporta lo que se ve: las filas actuales del listado (con el filtro y la búsqueda aplicados)
      await exportarExcel('Neumaticos', 'Neumáticos', ENCABEZADOS_EXCEL, filas.map(l => [
        l.codigo, vidaTexto(l.vida), l.medida ?? '', l.marca ?? '', l.modelo ?? '', l.placa_actual ?? '', l.gastos_compra, l.moneda_compra ?? 'PEN', l.orden_compra ?? '', l.situacion,
      ]));
    } catch (e) {
      setErrorExcel(`No se pudo exportar: ${String(e)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Page wide>
      <PageHeader
        title="Neumáticos"
        subtitle="Llantas del ciclo de vida: almacén, unidades, reencauche y descarte"
        actions={
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {puedeReforma && (
              <Button variant="secondary" icon={<Truck size={16} />} onClick={() => setDespachoAbierto(true)}>
                Despachar a la reformadora
              </Button>
            )}
            <Button variant="secondary" icon={<Settings size={16} />} onClick={() => setConfigAbierta(true)}>
              Código de fuego
            </Button>
            <Button variant="secondary" icon={<LogoArchivo tipo="excel" />} loading={exportando}
              disabled={filas.length === 0} onClick={exportar}>
              Excel
            </Button>
          </div>
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}
      {errorExcel && <Notice tone="error">{errorExcel}</Notice>}

      <div className="nl-chips" role="group" aria-label="Filtrar por situación">
        {CHIPS.map(c => (
          <button key={c.clave} type="button" className="chip" aria-pressed={filtro === c.clave}
            onClick={() => setFiltro(c.clave)}>
            {c.etiqueta}
            {c.clave !== 'TODOS' && conteos && <span className="nl-chip__n">{conteos[c.clave].toLocaleString('es-PE')}</span>}
          </button>
        ))}
      </div>

      <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Código, marca, modelo, medida o placa…" activos={activos} onAbrirFiltros={() => setFiltrando(true)}>
        {!isLoading && !isError && (
          <span className="nl-conteo">{filas.length.toLocaleString('es-PE')} {filas.length === 1 ? 'neumático' : 'neumáticos'}</span>
        )}
      </BarraFiltros>
      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={limpiarFiltros} resultado={filas.length} unidad="neumático">
        <GrupoFiltro titulo="Marca"><ListaEleccion value={fMarca} onChange={setFMarca} opciones={opcionesDe(l => l.marca, 'Todas las marcas')} /></GrupoFiltro>
        <GrupoFiltro titulo="Modelo"><ListaEleccion value={fModelo} onChange={setFModelo} opciones={opcionesDe(l => l.modelo, 'Todos los modelos')} /></GrupoFiltro>
        <GrupoFiltro titulo="Medida"><ListaEleccion value={fMedida} onChange={setFMedida} opciones={opcionesDe(l => l.medida, 'Todas las medidas')} /></GrupoFiltro>
        <GrupoFiltro titulo="Vida"><ListaEleccion value={fVida} onChange={setFVida} opciones={opcionesVida} /></GrupoFiltro>
        <GrupoFiltro titulo="Vehículo"><ListaEleccion value={fPlaca} onChange={setFPlaca} opciones={opcionesDe(l => l.placa_actual, 'Todos los vehículos')} /></GrupoFiltro>
        <GrupoFiltro titulo="Orden de compra"><ListaEleccion value={fOrden} onChange={setFOrden} opciones={opcionesDe(l => l.orden_compra, 'Todas las órdenes')} /></GrupoFiltro>
      </HojaFiltros>

      {filas.length > 0 && (
        <div className="nl-barra">
          {seleccionables.length > 0 && (
            <Button variant="plain" onClick={alternarTodas}>
              {todasSeleccionadas ? 'Quitar selección' : `Seleccionar ${modoReforma ? 'para reforma' : 'sin código'} (${seleccionables.length})`}
            </Button>
          )}
          {seleccion.size > 0 && modoReforma && puedeReforma && (
            <Button variant="primary" icon={<Truck size={16} />} onClick={() => setOrdenAbierta(true)}>
              Generar orden de reencauche ({seleccion.size})
            </Button>
          )}
          {seleccion.size > 0 && !modoReforma && (
            <Button variant="primary" onClick={() => setPreviaAbierta(true)}>
              Generar código de fuego ({seleccion.size})
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : filas.length === 0 ? (
        !isError && (
          <EmptyState icon={hayFiltro ? <SearchX size={22} /> : <Disc3 size={22} />}
            title={hayFiltro ? 'Sin coincidencias' : 'Sin neumáticos registrados'}>
            {hayFiltro ? 'Ningún neumático coincide con el filtro o la búsqueda.' : 'Aún no hay llantas en el ciclo de vida.'}
          </EmptyState>
        )
      ) : movil ? (
        <ul className="nl-lista" aria-label="Neumáticos">
          {filas.map(l => (
            <li key={l.codigo} className="nl-lista__item" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <CasillaSeleccion checked={seleccion.has(l.codigo)} onChange={() => alternar(l.codigo)} label={`Seleccionar ${l.codigo}`} />
              <button type="button" className="nl-lista__abrir" onClick={() => abrirFicha(l.codigo)}>
                <span className="nl-lista__cuerpo">
                  <span className="nl-lista__fila">
                    <span className="nl-codigo">{l.codigo}</span>
                    <SituacionChip texto={l.situacion} />
                  </span>
                  <span className="nl-lista__sub">{[l.marca, l.modelo, l.medida].filter(Boolean).join(' · ') || 'Sin marca ni medida'}</span>
                  <span className="nl-lista__datos">
                    Vida {vidaTexto(l.vida)} · Vehículo {l.placa_actual || '—'} · Compra {gastosTexto(l.gastos_compra, l.moneda_compra)}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="nl-lista__flecha" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <TablaRedimensionable id="neumaticos-listado-v2" columnas={columnas} ariaLabel="Listado de neumáticos" altoMax="72vh" className="tabla-redim--compacta">
          {filas.map(l => (
            <tr key={l.codigo} className="nl-fila" onClick={() => abrirFicha(l.codigo)}>
              <Celda alinear="center">
                <CasillaSeleccion checked={seleccion.has(l.codigo)} onChange={() => alternar(l.codigo)} label={`Seleccionar ${l.codigo}`} />
              </Celda>
              <Celda mono><span className="nl-codigo">{l.codigo}</span></Celda>
              <Celda>{vidaTexto(l.vida)}</Celda>
              <Celda mono>{l.medida || '—'}</Celda>
              <Celda>{l.marca || '—'}</Celda>
              <Celda>{l.modelo || '—'}</Celda>
              <Celda mono>{l.placa_actual || '—'}</Celda>
              <Celda alinear="right" mono>{gastosTexto(l.gastos_compra, l.moneda_compra)}</Celda>
              <Celda mono>{l.orden_compra || '—'}</Celda>
              <Celda><SituacionChip texto={l.situacion} /></Celda>
              <Celda alinear="center">
                <Button variant="plain" size="sm" iconOnly icon={<ChevronRight size={16} />}
                  title="Ver ficha" aria-label={`Ver ficha del neumático ${l.codigo}`}
                  onClick={e => { e.stopPropagation(); abrirFicha(l.codigo); }} />
              </Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}
      <GenerarCodigosSheet open={previaAbierta} onClose={() => setPreviaAbierta(false)}
        seleccionados={filas.filter(l => seleccion.has(l.codigo))}
        onAsignado={() => {
          setPreviaAbierta(false);
          setSeleccion(new Set());
          toast('Códigos de fuego asignados');
          void qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
        }} />
      <ConfigCodigoSheet open={configAbierta} onClose={() => setConfigAbierta(false)} />
      <GenerarOrdenReencaucheSheet open={ordenAbierta} onClose={() => setOrdenAbierta(false)}
        llantas={filas.filter(l => seleccion.has(l.codigo)).map(l => ({ codigo: l.codigo, medida: l.medida }))}
        onHecho={() => { setOrdenAbierta(false); setSeleccion(new Set()); }} />
      <DespacharReformadoraSheet open={despachoAbierto} onClose={() => setDespachoAbierto(false)} onHecho={() => setDespachoAbierto(false)} />
    </Page>
  );
}
