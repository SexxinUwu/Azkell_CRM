import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftCircle, CheckCircle2, FileText, FileSpreadsheet, Eye, Hourglass, LayoutGrid, MapPin, MessageCircle, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, Truck, User } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { empresaDePlaca, estiloEmpresa, hayAlerta, perteneceAEmpresa, tipoDe, type Pestana, type Recursos, type Registro } from './garitaBase';
import { IconoTipo, useActaGarita } from './garitaPiezas';

// Fechas tal como las guarda el clásico (dd-mm-aa); si llegan ISO se recortan
const fmt = (s?: string | null) => (s ? String(s).replace(/^(\d{4}-\d{2}-\d{2})T.*$/, '$1') : '--');

function EstadoPill({ r }: { r: Registro }) {
  if (r.estado !== 'en_ruta') return <span className="gar-pill gar-pill--ok"><CheckCircle2 size={13} /> COMPLETADO</span>;
  const t = tipoDe(r);
  if (t === 'COMPRAS') return <span className="gar-pill gar-pill--compras"><IconoTipo tipo="COMPRAS" size={13} /> EN COMPRAS</span>;
  if (t === 'TALLER') return <span className="gar-pill gar-pill--taller"><IconoTipo tipo="TALLER" size={13} /> EN TALLER</span>;
  return <span className="gar-pill gar-pill--ruta"><Truck size={13} /> EN RUTA</span>;
}

/** Lista "CheckList de Unidades" de la empresa elegida */
export function GaritaLista({ empresa, registros, cargando, error, recursos, puedeCrear, puedeEliminar, onEmpresas, onRefrescar, onSalida, onPlantilla, onAbrir, onEliminar }: {
  empresa: string; registros: Registro[]; cargando: boolean; error: unknown; recursos?: Recursos; puedeCrear: boolean; puedeEliminar: boolean;
  onEmpresas: () => void; onRefrescar: () => Promise<unknown>; onSalida: () => void; onPlantilla: () => void; onAbrir: (id: string) => void; onEliminar: (r: Registro) => void;
}) {
  const toast = useToast();
  const acta = useActaGarita();
  const [pestana, setPestana] = useState<Pestana>('activos');
  const [busqueda, setBusqueda] = useState('');
  const [refrescando, setRefrescando] = useState(false);

  const deEmpresa = useMemo(() => registros.filter(r => perteneceAEmpresa(r, empresa, recursos)), [registros, empresa, recursos]);
  const cuenta = {
    total: deEmpresa.length,
    ruta: deEmpresa.filter(r => r.estado === 'en_ruta').length,
    comp: deEmpresa.filter(r => r.estado === 'completado').length,
    alerta: deEmpresa.filter(hayAlerta).length,
  };
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return deEmpresa.filter(r => {
      if (pestana === 'activos' && r.estado !== 'en_ruta') return false;
      if (pestana === 'historial' && r.estado !== 'completado') return false;
      if (pestana === 'alertas' && !hayAlerta(r)) return false;
      if (!q) return true;
      return [r.id, r.placa_tracto, r.placa_carreta, r.conductor, r.destino].some(x => String(x ?? '').toLowerCase().includes(q));
    });
  }, [deEmpresa, pestana, busqueda]);

  const nombreEmp = empresa !== 'TODAS' ? ` de ${empresa}` : '';
  const vacio = pestana === 'activos' ? `No hay unidades${nombreEmp} en ruta actualmente.` : `No se encontraron registros coincidentes${nombreEmp}.`;

  async function refrescar() {
    setRefrescando(true);
    try { await onRefrescar(); toast('Datos actualizados'); } finally { setRefrescando(false); }
  }

  async function exportar() {
    if (!deEmpresa.length) { toast(`No hay datos de ${empresa} para exportar`, 'error'); return; }
    try {
      await exportarExcel('Checklist_Unidades', 'Checklist',
        ['Folio ID', 'Placa Tracto', 'Placa Carreta', 'Conductor', 'Destino', 'Salida Fecha', 'Salida Hora', 'Salida Km', 'Retorno Fecha', 'Retorno Hora', 'Retorno Km', 'Estado', 'Tiene Novedad'],
        deEmpresa.map(r => [r.id, r.placa_tracto, r.placa_carreta ?? '', r.conductor, r.destino ?? '', r.salida_fecha ?? '', r.salida_hora ?? '', r.salida_km ?? '',
          r.retorno_fecha ?? '', r.retorno_hora ?? '', r.retorno_km ?? '', r.estado, hayAlerta(r) ? 'SI' : 'NO']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const abrir = (id: string) => { haptic('selection'); onAbrir(id); };
  const kpi = (clave: Pestana, etiqueta: string, valor: number, icono: React.ReactNode, tinte: string, color: string) => (
    <button type="button" className="gar-kpi" aria-pressed={pestana === clave} onClick={() => { haptic('selection'); setPestana(clave); }}>
      <span className="gar-kpi__icono" style={{ background: tinte, color }}>{icono}</span>
      <span><small>{etiqueta}</small><b>{valor}</b></span>
    </button>
  );

  const acciones = (r: Registro) => (
    <div className="gar-acc" onClick={e => e.stopPropagation()}>
      {r.estado === 'en_ruta'
        ? <button type="button" className="gar-ico gar-ico--ingresar" onClick={() => abrir(r.id)}><ArrowLeftCircle size={16} /> Ingresar</button>
        : <button type="button" className="gar-ico" onClick={() => abrir(r.id)}><Eye size={16} /> Detalle</button>}
      <button type="button" className="gar-ico gar-ico--pdf" title="Descargar PDF" aria-label="Descargar PDF" disabled={!!acta.generando}
        onClick={() => acta.verPdf(r, 'completo', true)}><FileText size={17} /></button>
      <button type="button" className="gar-ico gar-ico--wa" title="Compartir WhatsApp" aria-label="Compartir WhatsApp" disabled={!!acta.generando}
        onClick={() => acta.whatsapp(r, 'completo')}><MessageCircle size={17} /></button>
      {puedeEliminar && <button type="button" className="gar-ico gar-ico--del" title="Eliminar" aria-label="Eliminar" onClick={() => onEliminar(r)}><Trash2 size={17} /></button>}
    </div>
  );

  const empBadge = (r: Registro) => {
    const e = estiloEmpresa(r.empresa_nombre || r.empresa || empresaDePlaca(r.placa_tracto, recursos));
    return e ? <span className="gar-emp-badge" style={{ background: e.bg, color: e.color }}>{e.texto}</span> : null;
  };
  const placas = (r: Registro) => (
    <>
      <span className="gar-placa">{r.placa_tracto}</span>
      {r.placa_carreta && <span className="gar-sub" style={{ marginLeft: 6, fontWeight: 600 }}>/ {r.placa_carreta}</span>}
      {empBadge(r)}
    </>
  );

  return (
    <div className="gar">
      <div className="gar-cab">
        <div className="gar-cab__izq">
          <span className="gar-cab__icono"><ShieldCheck size={22} /></span>
          <div>
            <h2>CheckList de Unidades <span className="gar-badge gar-badge--azul">{empresa}</span></h2>
            <p>Inspección física de vehículos, control de salidas y retornos de flota</p>
          </div>
        </div>
        <div className="gar-cab__acciones">
          <Button variant="secondary" icon={<LayoutGrid size={16} />} onClick={onEmpresas} title="Ir al portal multi-empresa">Empresas</Button>
          <Button variant="secondary" iconOnly icon={<RefreshCw size={16} />} loading={refrescando} onClick={refrescar} aria-label="Actualizar" title="Actualizar" />
          <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportar} title="Exportar Excel">Excel</Button>
          {puedeCrear && <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={onPlantilla} title="Ajustes de plantilla">Plantilla</Button>}
          {puedeCrear && <Button variant="accent" icon={<Plus size={16} />} onClick={onSalida}>Registrar Salida</Button>}
        </div>
      </div>

      <div className="gar-kpis">
        {kpi('todos', 'Total expedientes', cuenta.total, <Truck size={18} />, 'var(--blue-tint)', 'var(--blue-ink)')}
        {kpi('activos', 'En ruta', cuenta.ruta, <MapPin size={18} />, 'var(--amber-tint)', 'var(--amber-ink)')}
        {kpi('historial', 'Completados', cuenta.comp, <CheckCircle2 size={18} />, 'var(--green-tint)', 'var(--green-ink)')}
        {kpi('alertas', 'Con alertas', cuenta.alerta, <AlertTriangle size={18} />, 'var(--red-tint)', 'var(--red-ink)')}
      </div>

      <div className="gar-barra">
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por placa, conductor, destino…" />
        <SegmentedControl<Pestana> label="Estado" value={pestana} onChange={setPestana}
          options={[{ value: 'activos', label: 'En Ruta' }, { value: 'historial', label: 'Completados' }, { value: 'todos', label: 'Todos' }]} />
      </div>

      {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <div className="gar-card gar-card--lista">
          {visibles.length === 0 ? <div className="gar-vacio">{vacio}</div> : (
            <>
              <div className="gar-tabla-wrap">
                <table className="gar-tabla">
                  <thead>
                    <tr><th>FOLIO / ID</th><th>TRACTO / CARRETA</th><th>CONDUCTOR &amp; DESTINO</th><th>SALIDA (IDA)</th><th>RETORNO (VUELTA)</th><th>ESTADO</th><th>INSPECCIÓN</th><th style={{ textAlign: 'right' }}>ACCIONES</th></tr>
                  </thead>
                  <tbody>
                    {visibles.map(r => (
                      <tr key={r.id} onClick={() => abrir(r.id)}>
                        <td><span className="gar-folio">{r.id}</span></td>
                        <td>{placas(r)}</td>
                        <td><div style={{ fontWeight: 700 }}>{r.conductor || 'Sin conductor'}</div><div className="gar-sub">{r.destino || '---'}</div></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{fmt(r.salida_fecha)} {r.salida_hora ?? ''}</div>
                          <div className="gar-sub">{r.salida_km ? `${r.salida_km} km` : 'Sin Km'}</div>
                          {r.creado_por && <div className="gar-sub--min"><User size={11} /> {r.creado_por}</div>}
                        </td>
                        <td>
                          {r.estado === 'en_ruta'
                            ? <span className="gar-sub" style={{ fontStyle: 'italic' }}><Hourglass size={12} /> En trayecto</span>
                            : <>
                                <div style={{ fontWeight: 700 }}>{fmt(r.retorno_fecha)} {r.retorno_hora ?? ''}</div>
                                <div className="gar-sub">{r.retorno_km ? `${r.retorno_km} km` : 'Sin Km'}</div>
                                {r.retorno_creado_por && <div className="gar-sub--min"><User size={11} /> {r.retorno_creado_por}</div>}
                              </>}
                        </td>
                        <td><EstadoPill r={r} /></td>
                        <td>{hayAlerta(r)
                          ? <span className="gar-pill gar-pill--alerta" title="Presentó observaciones"><AlertTriangle size={13} /> CON NOVEDAD</span>
                          : <span className="gar-pill gar-pill--ok"><ShieldCheck size={13} /> CONFORME</span>}</td>
                        <td style={{ textAlign: 'right' }}>{acciones(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="gar-cards">
                {visibles.map(r => (
                  <div key={r.id} className="gar-reg" onClick={() => abrir(r.id)}>
                    <div className="gar-reg__fila"><span className="gar-folio">{r.id}</span><EstadoPill r={r} /></div>
                    <div>{placas(r)}</div>
                    <div style={{ fontWeight: 700 }}>{r.conductor || '---'}</div>
                    <div className="gar-sub"><MapPin size={12} /> {r.destino || '---'}</div>
                    <div className="gar-reg__fila">
                      <span className="gar-sub">{r.estado === 'completado' && r.retorno_fecha ? `${fmt(r.salida_fecha)} al ${fmt(r.retorno_fecha)}` : `${fmt(r.salida_fecha)} ${r.salida_hora ?? ''}`}</span>
                      {hayAlerta(r)
                        ? <span className="gar-pill gar-pill--alerta"><AlertTriangle size={13} /> CON NOVEDAD</span>
                        : <span className="gar-pill gar-pill--ok"><ShieldCheck size={13} /> CONFORME</span>}
                    </div>
                    {acciones(r)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
