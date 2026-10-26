import './NeumaticosListado.css';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Disc3, SearchX } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { formatSoles } from '../../core/lib/format';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { LogoArchivo } from './NeumaticosRequerimiento';
import { vidaTexto } from './ntb-api';

// Listado de neumáticos: GET /api/neumaticos/listado (contrato en routes/neumaticos-ciclo.js).
// Cada fila abre la ficha de la llanta (ruta mantenimiento/neumaticos-ficha/:codigo).

/** Claves de situación que devuelve el servidor (conteos) */
type Clave = 'activo' | 'disponible' | 'en_actividad' | 'enviar_reforma' | 'en_reformadora' | 'esperando_descarte' | 'desactivacion' | 'sin_marca';
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
  { clave: 'sin_marca', etiqueta: 'Sin marca de fuego' },
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
  'Sin marca de fuego': 'violeta',
};

const ENCABEZADOS_EXCEL = ['Neumático', 'Vida actual', 'Medida', 'Vehículo actual', 'Gastos de compra', 'Situación'];

const COLUMNAS: ColumnaTabla[] = [
  { id: 'codigo', titulo: 'Neumático', ancho: 170 },
  { id: 'vida', titulo: 'Vida actual', ancho: 120 },
  { id: 'medida', titulo: 'Medida', ancho: 160 },
  { id: 'vehiculo', titulo: 'Vehículo actual', ancho: 150 },
  { id: 'gastos', titulo: 'Gastos de compra', ancho: 160, alinear: 'right' },
  { id: 'situacion', titulo: 'Situación', ancho: 200 },
  { id: 'acciones', titulo: 'Acciones', ancho: 96, minimo: 80, alinear: 'center' },
];

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

const gastosTexto = (v: number | '') => (v === '' ? '—' : formatSoles(v));

function SituacionChip({ texto }: { texto: string }) {
  return <span className={`nl-situacion nl-situacion--${TONO_SITUACION[texto] ?? 'gris'}`}>{texto}</span>;
}

export function NeumaticosListado() {
  const navigate = useNavigate();
  const movil = useMediaQuery(MOBILE_QUERY);
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [exportando, setExportando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);

  // La búsqueda espera 250 ms después de la última tecla antes de consultar
  useEffect(() => {
    const t = window.setTimeout(() => setQ(busqueda.trim()), 250);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, isError, error } = useListado(filtro, q);
  const filas = data?.data ?? [];
  const conteos = data?.conteos;
  const hayFiltro = filtro !== 'TODOS' || q !== '';

  const abrirFicha = (codigo: string) => navigate(`/mantenimiento/neumaticos-ficha/${encodeURIComponent(codigo)}`);

  async function exportar() {
    setExportando(true);
    setErrorExcel(null);
    try {
      // Exporta lo que se ve: las filas actuales del listado (con el filtro y la búsqueda aplicados)
      await exportarExcel('Neumaticos', 'Neumáticos', ENCABEZADOS_EXCEL, filas.map(l => [
        l.codigo, vidaTexto(l.vida), l.medida ?? '', l.placa_actual ?? '', l.gastos_compra, l.situacion,
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
          <Button variant="secondary" icon={<LogoArchivo tipo="excel" />} loading={exportando}
            disabled={filas.length === 0} onClick={exportar}>
            Excel
          </Button>
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

      <div className="nl-barra">
        <div className="nl-barra__buscar">
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, marca, medida o placa…" />
        </div>
        {!isLoading && !isError && (
          <span className="nl-conteo">{filas.length.toLocaleString('es-PE')} {filas.length === 1 ? 'neumático' : 'neumáticos'}</span>
        )}
      </div>

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
            <li key={l.codigo} className="nl-lista__item">
              <button type="button" className="nl-lista__abrir" onClick={() => abrirFicha(l.codigo)}>
                <span className="nl-lista__cuerpo">
                  <span className="nl-lista__fila">
                    <span className="nl-codigo">{l.codigo}</span>
                    <SituacionChip texto={l.situacion} />
                  </span>
                  <span className="nl-lista__sub">{[l.marca, l.modelo, l.medida].filter(Boolean).join(' · ') || 'Sin marca ni medida'}</span>
                  <span className="nl-lista__datos">
                    Vida {vidaTexto(l.vida)} · Vehículo {l.placa_actual || '—'} · Compra {gastosTexto(l.gastos_compra)}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="nl-lista__flecha" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <TablaRedimensionable id="neumaticos-listado" columnas={COLUMNAS} ariaLabel="Listado de neumáticos" altoMax="70vh">
          {filas.map(l => (
            <tr key={l.codigo} className="nl-fila" onClick={() => abrirFicha(l.codigo)}>
              <Celda mono><span className="nl-codigo">{l.codigo}</span></Celda>
              <Celda>{vidaTexto(l.vida)}</Celda>
              <Celda mono>{l.medida || '—'}</Celda>
              <Celda mono>{l.placa_actual || '—'}</Celda>
              <Celda alinear="right" mono>{gastosTexto(l.gastos_compra)}</Celda>
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
    </Page>
  );
}
