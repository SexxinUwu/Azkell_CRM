import './ce-portal-lista.css';
import '../../core/ui/acciones-iconos.css';
import { useMemo, useState } from 'react';
import { CalendarCheck, CarFront, ClipboardList, Eye, FileSpreadsheet, FileText, LayoutGrid, MessageCircle, Pencil, Plus, RefreshCw, SearchX, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuFila } from '../../core/ui/MenuFila';
import { Badge, EmptyState, Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe, formatQuantity } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import type { EntregaVehiculo } from './ce-tipos';

export type AccionFila = 'ver' | 'editar' | 'pdf' | 'whatsapp' | 'eliminar';

export interface CifrasLista {
  total: number;
  hoy: number;
  vehiculos: number;
  /** Unidades motoras de la empresa (o de todas): el denominador de las actas */
  motoras?: number;
}

interface PropsLista {
  empresa: string;
  registros: EntregaVehiculo[];
  cargando: boolean;
  error: unknown;
  cifras: CifrasLista;
  actualizando: boolean;
  /** Id del acta cuyo detalle se está cargando (sus botones quedan en pausa) */
  ocupadoId: string | null;
  puedeEliminar: boolean;
  onEmpresas: () => void;
  onPlantilla: () => void;
  onActualizar: () => void;
  onRegistrar: () => void;
  onAccion: (accion: AccionFila, registro: EntregaVehiculo) => void;
  /** Recibe los registros visibles (con el filtro de búsqueda aplicado) */
  onExcel: (visibles: EntregaVehiculo[]) => Promise<void>;
}

// Texto para buscar: sin tildes y en mayúsculas (igual que en Pago de requerimientos)
const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const folio = (r: EntregaVehiculo) => String(r.numero_inventario || r.id);
const kilometros = (k: unknown) => `${formatQuantity(Number(k) || 0)} km`;

const COLUMNAS: ColumnaTabla[] = [
  { id: 'inv', titulo: 'N° inventario', ancho: 150 },
  { id: 'fecha', titulo: 'Fecha', ancho: 120 },
  { id: 'placa', titulo: 'Placa', ancho: 120 },
  { id: 'entrega', titulo: 'Quién entrega', ancho: 200 },
  { id: 'recibe', titulo: 'Quién recibe', ancho: 200 },
  { id: 'km', titulo: 'Kilometraje', ancho: 130, alinear: 'right' },
  { id: 'obs', titulo: 'Observaciones', ancho: 260 },
  { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
];

/** Listado de actas de la empresa elegida: KPI, búsqueda, tabla (escritorio) o tarjetas (celular) */
export function CeLista({
  empresa, registros, cargando, error, cifras, actualizando, ocupadoId, puedeEliminar,
  onEmpresas, onPlantilla, onActualizar, onRegistrar, onAccion, onExcel,
}: PropsLista) {
  const movil = useMediaQuery(MOBILE_QUERY);
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivoF, setMotivoF] = useState('');
  const [tipoF, setTipoF] = useState('');
  const filtrosActivos = (desde || hasta ? 1 : 0) + (motivoF ? 1 : 0) + (tipoF ? 1 : 0);
  const opcionesMotivo = useMemo(() => [...new Set(registros.map(r => (r.motivo || '').trim()).filter(Boolean))].sort().map(v => ({ value: v, label: v })), [registros]);
  const opcionesTipo = useMemo(() => [...new Set(registros.map(r => (r.tipo || '').trim()).filter(Boolean))].sort().map(v => ({ value: v, label: v })), [registros]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return registros.filter(r => {
      if (q && !normalizar([r.numero_inventario, r.id, r.placa, r.quien_entrega, r.quien_recibe, r.observaciones].join(' ')).includes(q)) return false;
      const f = (r.fecha || '').slice(0, 10);
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      if (motivoF && (r.motivo || '').trim() !== motivoF) return false;
      if (tipoF && (r.tipo || '').trim() !== tipoF) return false;
      return true;
    });
  }, [registros, busqueda, desde, hasta, motivoF, tipoF]);

  async function exportar() {
    haptic('selection');
    setExportando(true);
    try { await onExcel(visibles); } finally { setExportando(false); }
  }

  const kpis = [
    { id: 'total', etiqueta: cifras.motoras != null ? 'Actas / unidades motoras' : 'Total actas', valor: cifras.motoras != null ? `${cifras.total}/${cifras.motoras}` : cifras.total, fondo: 'var(--blue-tint)', color: 'var(--blue-ink)', Icono: ClipboardList },
    { id: 'hoy', etiqueta: 'Entregas hoy', valor: cifras.hoy, fondo: 'var(--green-tint)', color: 'var(--green-ink)', Icono: CalendarCheck },
    { id: 'veh', etiqueta: 'Vehículos', valor: cifras.vehiculos, fondo: 'var(--amber-tint)', color: 'var(--amber-ink)', Icono: CarFront },
  ];

  const hayBusqueda = busqueda.trim() !== '';

  return (
    <div className="cep-vista">
      <header className="cep-header">
        <div className="cep-header__izq">
          <span className="cep-header__icono" aria-hidden><CarFront size={22} /></span>
          <div>
            <h2 className="cep-header__titulo">
              Inventario de vehículos
              <Badge>{empresa === 'TODAS' ? 'Todas' : empresa}</Badge>
            </h2>
            <p className="cep-header__sub">Inventario físico y actas oficiales de entrega y recepción del estado de la flota</p>
          </div>
        </div>
        <div className="cep-header__acciones">
          <div className="acciones-iconos acciones-iconos--sinfondo">
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--azul"
              data-tip="Empresas" aria-label="Empresas" onClick={onEmpresas}>
              <LayoutGrid size={17} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--ambar"
              data-tip="Plantilla" aria-label="Plantilla de inventario" onClick={onPlantilla}>
              <SlidersHorizontal size={17} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--violeta"
              data-tip="Actualizar" aria-label="Actualizar" disabled={actualizando} onClick={onActualizar}>
              <RefreshCw size={17} className={actualizando ? 'cep-girando' : undefined} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--verde"
              data-tip="Exportar Excel" aria-label="Exportar Excel" disabled={exportando} onClick={exportar}>
              <FileSpreadsheet size={17} />
            </button>
          </div>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { haptic('selection'); onRegistrar(); }}>Registrar entrega</Button>
        </div>
      </header>

      <div className="cep-kpis">
        {kpis.map(k => (
          <div key={k.id} className="cep-kpi">
            <span className="cep-kpi__icono" style={{ background: k.fondo, color: k.color }} aria-hidden><k.Icono size={18} /></span>
            <div className="cep-kpi__cuerpo">
              <span className="cep-kpi__valor">{typeof k.valor === 'number' ? formatQuantity(k.valor) : k.valor}</span>
              <span className="cep-kpi__etiqueta">{k.etiqueta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cep-barra">
        <div className="cep-barra__buscar">
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Placa, conductor, inventario…" activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)} />
        </div>
        <span className="cep-barra__conteo">{cargando ? 'Cargando…' : `${visibles.length} ${visibles.length === 1 ? 'acta' : 'actas'}`}</span>
        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} resultado={visibles.length} unidad="acta"
          onLimpiar={() => { setDesde(''); setHasta(''); setMotivoF(''); setTipoF(''); }}>
          <GrupoFiltro titulo="Fecha de la entrega">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <TextInput type="date" aria-label="Desde" value={desde} onChange={e => setDesde(e.target.value)} />
              <span className="t-footnote c-secondary">a</span>
              <TextInput type="date" aria-label="Hasta" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </GrupoFiltro>
          <GrupoFiltro titulo="Motivo">
            <Combobox options={opcionesMotivo} value={motivoF || null} onChange={v => setMotivoF(v ?? '')} enHoja compacta placeholder="Todos los motivos" tituloHoja="Motivo" />
          </GrupoFiltro>
          <GrupoFiltro titulo="Tipo de unidad">
            <Combobox options={opcionesTipo} value={tipoF || null} onChange={v => setTipoF(v ?? '')} enHoja compacta placeholder="Todos los tipos" tituloHoja="Tipo de unidad" />
          </GrupoFiltro>
        </HojaFiltros>
      </div>

      {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}

      {cargando ? (
        <div className="cep-vacio">Cargando actas de entrega…</div>
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={hayBusqueda ? <SearchX size={22} /> : <ClipboardList size={22} />}
          title={hayBusqueda ? 'Sin coincidencias' : 'Sin actas registradas'}
        >
          {hayBusqueda ? (
            <Button variant="secondary" size="sm" onClick={() => setBusqueda('')}>Limpiar búsqueda</Button>
          ) : (
            <>
              No hay actas para {empresa === 'TODAS' ? 'ninguna empresa' : empresa}. Usa “Registrar entrega”.
            </>
          )}
        </EmptyState>
      ) : movil ? (
        <ul className="cep-lista" aria-label="Actas de entrega">
          {visibles.map(r => (
            <li key={String(r.id)} className="cep-lista__item">
              <div className="cep-lista__cuerpo">
                <div className="cep-lista__fila">
                  <span className="cep-placa">{r.placa || '—'}</span>
                  <span className="cep-inv">{folio(r)}</span>
                </div>
                <span className="cep-lista__titulo">{r.quien_recibe || r.quien_entrega || 'Sin conductor'}</span>
                <span className="cep-lista__sub">{formatFechaPe(r.fecha)} · {kilometros(r.kilometraje)}</span>
                <span className="cep-lista__sub">{r.observaciones || 'Sin observaciones'}</span>
              </div>
              <div className="cep-lista__acciones">
                <Acciones registro={r} ocupado={ocupadoId === String(r.id)} puedeEliminar={puedeEliminar} onAccion={onAccion} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <TablaRedimensionable id="checklist-entrega" columnas={COLUMNAS} ariaLabel="Actas de entrega de vehículos" altoMax="calc(100dvh - 300px)" className="tabla-sin-barras">
          {visibles.map(r => (
            <tr key={String(r.id)} className="cep-fila" onClick={e => { if (!(e.target as HTMLElement).closest('button,a')) onAccion('ver', r); }}>
              <Celda mono><span className="cep-inv">{folio(r)}</span></Celda>
              <Celda mono>{formatFechaPe(r.fecha)}</Celda>
              <Celda><span className="cep-placa">{r.placa || '—'}</span></Celda>
              <Celda><span className="cep-recorte" title={r.quien_entrega}>{r.quien_entrega || '—'}</span></Celda>
              <Celda><span className="cep-recorte" title={r.quien_recibe}>{r.quien_recibe || '—'}</span></Celda>
              <Celda alinear="right" mono>{kilometros(r.kilometraje)}</Celda>
              <Celda><span className="cep-recorte cep-muted" title={r.observaciones || ''}>{r.observaciones || 'Sin observaciones'}</span></Celda>
              <Celda alinear="center">
                <Acciones registro={r} ocupado={ocupadoId === String(r.id)} puedeEliminar={puedeEliminar} onAccion={onAccion} />
              </Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}
    </div>
  );
}

function Acciones({ registro, ocupado, puedeEliminar, onAccion }: {
  registro: EntregaVehiculo; ocupado: boolean; puedeEliminar: boolean; onAccion: (a: AccionFila, r: EntregaVehiculo) => void;
}) {
  const n = folio(registro);
  const accion = (a: AccionFila) => () => onAccion(a, registro);
  return (
    <MenuFila etiqueta={`Acciones del acta ${n}`} deshabilitado={ocupado} acciones={[
      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: accion('ver') },
      { label: 'Editar acta', icon: <Pencil size={17} />, onSelect: accion('editar') },
      { label: 'Ver PDF', icon: <FileText size={17} />, onSelect: accion('pdf') },
      { label: 'Enviar por WhatsApp', icon: <MessageCircle size={17} />, onSelect: accion('whatsapp') },
      puedeEliminar && { label: 'Eliminar acta', icon: <Trash2 size={17} />, onSelect: accion('eliminar'), destructiva: true, separada: true },
    ]} />
  );
}
