import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderCheck, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { VistaPersonal } from './VistaPersonal';
import { estadoDoc, nombreCompleto, TIPOS_DOC, useDocumentosTodos, usePersonal, type DocumentoPersona, type EstadoDoc, type Persona, type TipoDocConfig } from './api';
import './personal.css';

type Filtro = 'todos' | 'pendientes' | 'por_vencer' | 'vencidos';
type Grupo = 'todos' | 'conductores';

// Los tipos que se controlan en la matriz (los «otros documentos» no tienen columna)
const COLUMNAS_DOC = TIPOS_DOC.filter(t => t.tipo !== 'OTRO');
const COLUMNAS: ColumnaTabla[] = [
  { id: 'persona', titulo: 'Persona', ancho: 280, minimo: 180 },
  ...COLUMNAS_DOC.map(t => ({ id: t.tipo, titulo: t.corto, ancho: 130, alinear: 'center' as const })),
];

interface Celdilla { estado: EstadoDoc | 'na'; doc?: DocumentoPersona; exigido: boolean }

/** Estado de un documento para una persona: «na» si no se le pide (la licencia, a quien no es conductor) */
function celdilla(p: Persona, t: TipoDocConfig, docs: DocumentoPersona[]): Celdilla {
  const doc = docs.find(d => d.personal_id === p.id && d.tipo === t.tipo);
  const aplica = !t.soloConductor || p.categoria_rol === 'CONDUCTOR';
  if (!doc && !aplica) return { estado: 'na', exigido: false };
  return { estado: estadoDoc(doc).estado, doc, exigido: t.obligatorio && aplica };
}

// RRHH › Documentos del personal: quién tiene sus documentos al día, por vencer, vencidos o sin cargar. Al tocar una fila se abre su ficha en Documentos.
export function DocumentosPersonalPage() {
  const nav = useNavigate();
  const personal = usePersonal();
  const docsQ = useDocumentosTodos();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [grupo, setGrupo] = useState<Grupo>('todos');
  const [busqueda, setBusqueda] = useState('');

  const docs = docsQ.data ?? [];
  const filas = useMemo(() => (personal.data ?? []).filter(p => p.estado !== 'CESADO').map(p => {
    const celdas = COLUMNAS_DOC.map(t => celdilla(p, t, docs));
    return {
      p, celdas,
      faltan: celdas.filter(c => c.estado === 'falta' && c.exigido).length,
      porVencer: celdas.filter(c => c.estado === 'por_vencer').length,
      vencidos: celdas.filter(c => c.estado === 'vencido').length,
    };
  }), [personal.data, docs]);

  const q = busqueda.trim().toUpperCase();
  const visibles = useMemo(() => filas
    .filter(f => grupo === 'todos' || f.p.categoria_rol === 'CONDUCTOR')
    .filter(f => filtro === 'todos' || (filtro === 'pendientes' ? f.faltan > 0 : filtro === 'por_vencer' ? f.porVencer > 0 : f.vencidos > 0))
    .filter(f => !q || [nombreCompleto(f.p), f.p.numero_documento, f.p.cargo].some(t => (t ?? '').toUpperCase().includes(q)))
    .sort((a, b) => (b.vencidos - a.vencidos) || (b.porVencer - a.porVencer) || (b.faltan - a.faltan) || a.p.apellidos.localeCompare(b.p.apellidos, 'es')),
  [filas, grupo, filtro, q]);

  const totales = {
    vencidos: filas.reduce((s, f) => s + f.vencidos, 0),
    porVencer: filas.reduce((s, f) => s + f.porVencer, 0),
    faltan: filas.reduce((s, f) => s + f.faltan, 0),
  };
  const cargando = personal.isLoading || docsQ.isLoading;
  const error = personal.error || docsQ.error;

  return (
    <Page>
      <PageHeader eyebrow="Recursos humanos" title="Personal" actions={<VistaPersonal actual="vencimientos" />}
        subtitle={cargando ? 'Cargando…' : `${totales.vencidos} vencidos · ${totales.porVencer} por vencer · ${totales.faltan} por cargar`} />

      {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : filas.length === 0 ? (
        <EmptyState icon={<FolderCheck size={22} />} title="Sin personal registrado">Cuando registres personal en RRHH, aquí verás el estado de sus documentos.</EmptyState>
      ) : (
        <>
          <div className="pv-barra">
            <SegmentedControl<Filtro> label="Estado de los documentos" value={filtro} onChange={setFiltro}
              options={[{ value: 'todos', label: 'Todos' }, { value: 'pendientes', label: 'Por cargar' }, { value: 'por_vencer', label: 'Por vencer' }, { value: 'vencidos', label: 'Vencidos' }]} />
            <SegmentedControl<Grupo> label="Grupo" value={grupo} onChange={setGrupo} options={[{ value: 'todos', label: 'Todo el personal' }, { value: 'conductores', label: 'Conductores' }]} />
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, DNI o cargo" />
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Nada coincide">
              <button type="button" className="placas-limpiar" onClick={() => { setFiltro('todos'); setGrupo('todos'); setBusqueda(''); }}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <TablaRedimensionable id="rrhh-documentos-personal" columnas={COLUMNAS} ariaLabel="Documentos del personal" altoMax="68vh">
              {visibles.map(f => (
                <tr key={f.p.id} className="pv-tr" onClick={() => { haptic('selection'); nav(`/rrhh/personal/${f.p.id}?tab=documentos`); }}>
                  <Celda>
                    <span className="docm-persona">
                      <button type="button" className="oc-codigo">{f.p.apellidos}, {f.p.nombres}</button>
                      <small>{f.p.cargo}</small>
                    </span>
                  </Celda>
                  {f.celdas.map((c, i) => (
                    <Celda key={COLUMNAS_DOC[i].tipo} alinear="center">
                      <span className={`docm-celda docm-celda--${c.estado}${c.estado === 'falta' && !c.exigido ? ' docm-celda--opcional' : ''}`}
                        title={c.doc?.fecha_vencimiento ? `Vence el ${formatFechaPe(c.doc.fecha_vencimiento)}` : undefined}>
                        {c.estado === 'na' ? '—' : c.estado === 'falta' ? (c.exigido ? 'Falta' : '—') : c.estado === 'vigente' ? 'Vigente'
                          : c.estado === 'por_vencer' ? `${estadoDoc(c.doc).dias} d` : 'Vencido'}
                      </span>
                    </Celda>
                  ))}
                </tr>
              ))}
            </TablaRedimensionable>
          )}
        </>
      )}
    </Page>
  );
}
