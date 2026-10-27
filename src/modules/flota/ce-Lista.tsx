import './ce-portal-lista.css';
import { useMemo, useState } from 'react';
import { CalendarCheck, CarFront, ClipboardList, Eye, FileSpreadsheet, FileText, LayoutGrid, MessageCircle, Pencil, Plus, RefreshCw, SearchX, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Badge, EmptyState, Notice } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
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
  { id: 'acc', titulo: 'Acciones', ancho: 210, alinear: 'center' },
];

/** Listado de actas de la empresa elegida: KPI, búsqueda, tabla (escritorio) o tarjetas (celular) */
export function CeLista({
  empresa, registros, cargando, error, cifras, actualizando, ocupadoId, puedeEliminar,
  onEmpresas, onPlantilla, onActualizar, onRegistrar, onAccion, onExcel,
}: PropsLista) {
  const movil = useMediaQuery(MOBILE_QUERY);
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return registros;
    return registros.filter(r => normalizar([r.numero_inventario, r.id, r.placa, r.quien_entrega, r.quien_recibe, r.observaciones].join(' ')).includes(q));
  }, [registros, busqueda]);

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
              CheckList de entrega de vehículos
              <Badge>{empresa === 'TODAS' ? 'Todas' : empresa}</Badge>
            </h2>
            <p className="cep-header__sub">Inventario físico y actas oficiales de entrega y recepción del estado de la flota</p>
          </div>
        </div>
        <div className="cep-header__acciones">
          <Button variant="secondary" icon={<LayoutGrid size={16} />} onClick={onEmpresas}>Empresas</Button>
          <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={onPlantilla}>Plantilla</Button>
          <Button variant="secondary" icon={<RefreshCw size={16} />} loading={actualizando} onClick={onActualizar}>Actualizar</Button>
          <Button variant="secondary" icon={<FileSpreadsheet size={16} />} loading={exportando} onClick={exportar}>Excel</Button>
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
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, inventario…" />
        </div>
        <span className="cep-barra__conteo">{cargando ? 'Cargando…' : `${visibles.length} ${visibles.length === 1 ? 'acta' : 'actas'}`}</span>
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
        <TablaRedimensionable id="checklist-entrega" columnas={COLUMNAS} ariaLabel="Actas de entrega de vehículos" altoMax="68vh">
          {visibles.map(r => (
            <tr key={String(r.id)}>
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
    <div className="cep-acciones" role="group" aria-label={`Acciones del acta ${n}`}>
      <Button variant="plain" size="sm" iconOnly icon={<Eye size={16} />} title="Ver detalle" aria-label={`Ver acta ${n}`} disabled={ocupado} onClick={accion('ver')} />
      <Button variant="plain" size="sm" iconOnly icon={<Pencil size={16} />} title="Editar acta" aria-label={`Editar acta ${n}`} disabled={ocupado} onClick={accion('editar')} />
      <Button variant="plain" size="sm" iconOnly icon={<FileText size={16} />} title="Descargar PDF" aria-label={`PDF del acta ${n}`} disabled={ocupado} onClick={accion('pdf')} />
      <Button variant="plain" size="sm" iconOnly icon={<MessageCircle size={16} />} title="Enviar por WhatsApp" aria-label={`Enviar acta ${n} por WhatsApp`} disabled={ocupado} onClick={accion('whatsapp')} />
      {puedeEliminar && (
        <Button variant="plain" size="sm" iconOnly className="cep-btn-peligro" icon={<Trash2 size={16} />} title="Eliminar acta (solo administrador)" aria-label={`Eliminar acta ${n}`} disabled={ocupado} onClick={accion('eliminar')} />
      )}
    </div>
  );
}
