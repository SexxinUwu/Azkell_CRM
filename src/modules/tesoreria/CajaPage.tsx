import '../mantenimiento/mant.css';
import '../gerencia/gerencia-oc.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, Boxes, FileSpreadsheet, Paperclip, Plus, RefreshCw, SearchX, ShieldCheck, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page } from '../../core/ui/Display';
import '../../core/ui/acciones-iconos.css';
import './pago.css';
import './mov.css';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaHoraPe, formatFechaPe, formatSoles } from '../../core/lib/format';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useNavigate } from 'react-router-dom';
import { useCaja, type CajaMovimiento } from './api';
import {
  aSoles, esPendiente, estadoDe, hoyYMD, inicioMesYMD, montoCaja, num, numeroDoc, ordenar, ORDEN_INICIAL,
  tonoEstado,
} from './caja-lib';
import { DetalleCaja } from './caja-detalle';
import { FormularioCaja } from './caja-formulario';

// Columnas de la tabla de escritorio (mismo estilo que Pago de requerimientos)
const COLUMNAS: ColumnaTabla[] = [
  { id: 'accion', titulo: 'Acción', ancho: 130 },
  { id: 'tipo', titulo: 'Movimiento', ancho: 120 },
  { id: 'importe', titulo: 'Importe', ancho: 140, alinear: 'right' },
  { id: 'persona', titulo: 'Persona / beneficiario', ancho: 240 },
  { id: 'motivo', titulo: 'Motivo', ancho: 220 },
  { id: 'caja', titulo: 'N° caja', ancho: 140 },
  { id: 'viaje', titulo: 'Viaje · placa', ancho: 170 },
  { id: 'centro', titulo: 'Centro costo', ancho: 120 },
  { id: 'fecha', titulo: 'Fecha registro', ancho: 150 },
  { id: 'creador', titulo: 'Usuario registro', ancho: 160 },
  { id: 'autoriza', titulo: 'Autoriza', ancho: 150 },
  { id: 'aprobador', titulo: 'Usuario aprobación', ancho: 170 },
  { id: 'fechaAprob', titulo: 'Fecha aprobación', ancho: 160 },
  { id: 'modalidad', titulo: 'Modalidad', ancho: 170 },
  { id: 'destino', titulo: 'Cuenta destino', ancho: 260 },
  { id: 'origen', titulo: 'Cuenta origen (empresa)', ancho: 260 },
  { id: 'comprobante', titulo: 'Comprobante', ancho: 170 },
  { id: 'estado', titulo: 'Estado', ancho: 150 },
];

const ENCABEZADOS = [
  'Fecha', 'Hora', 'Estado', 'Movimiento', 'Número', 'Viaje', 'Conductor', 'Ruta', 'Autoriza', 'Placa', 'Centro de costos', 'Motivo',
  'Sub motivo', 'Tipo persona', 'Persona', 'Moneda', 'Importe total', 'TC', 'Modalidad de pago', 'Cuenta destino', 'Cuenta origen',
  'Comprobante', 'N° factura', 'N° constancia', 'Usuario registro', 'Usuario aprobación',
];

const PESTANAS: Array<{ key: Pestana; etiqueta: string }> = [
  { key: 'todos', etiqueta: 'Todos' },
  { key: 'pendientes', etiqueta: 'Por aprobar' },
  { key: 'aprobados', etiqueta: 'Aprobados' },
  { key: 'procesados', etiqueta: 'Procesados' },
  { key: 'anulados', etiqueta: 'Anulados' },
];
type Pestana = 'todos' | 'pendientes' | 'aprobados' | 'procesados' | 'anulados';
const PASA: Record<Pestana, (m: CajaMovimiento) => boolean> = {
  todos: () => true,
  pendientes: esPendiente,
  aprobados: m => estadoDe(m) === 'APROBADO',
  procesados: m => ['PROCESADO', 'PAGADO'].includes(estadoDe(m)),
  anulados: m => estadoDe(m) === 'ANULADO',
};

// Tesorería › Caja: movimientos de caja chica con aprobación, documentos y anulación
export function CajaPage() {
  const nav = useNavigate();
  const movil = useMediaQuery(MOBILE_QUERY);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  // Pestañas por estado (se filtran aquí; el servidor devuelve todo el periodo)
  const [pestana, setPestana] = useState<Pestana>('todos');
  // Como el clásico: por defecto el mes en curso
  const [desde, setDesde] = useState(inicioMesYMD);
  const [hasta, setHasta] = useState(hoyYMD);
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ mov: CajaMovimiento | null } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscar(busqueda.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, isError, error } = useCaja({ desde, hasta, buscar });
  const todos = useMemo(() => ordenar(data ?? [], ORDEN_INICIAL), [data]);
  const lista = useMemo(() => todos.filter(PASA[pestana]), [todos, pestana]);
  const abierto = (data ?? []).find(m => m.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_caja.crear');
  const periodoPorDefecto = desde === inicioMesYMD() && hasta === hoyYMD();
  const hayFiltros = !!busqueda || !periodoPorDefecto || pestana !== 'todos';
  const limpiarFiltros = () => { setBusqueda(''); setDesde(inicioMesYMD()); setHasta(hoyYMD()); setPestana('todos'); };

  // Ingresos y egresos en soles: los dólares se convierten con su tipo de cambio; los anulados no suman
  const resumen = useMemo(() => {
    const validos = todos.filter(m => estadoDe(m) !== 'ANULADO');
    const ingresos = validos.filter(m => m.tipo_movimiento === 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    const egresos = validos.filter(m => m.tipo_movimiento !== 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    return { ingresos, egresos, saldo: ingresos - egresos, pendientes: todos.filter(esPendiente).length };
  }, [todos]);

  async function exportar() {
    if (!lista.length) { toast('No hay movimientos para exportar', 'error'); return; }
    try {
      await exportarExcel('Caja', 'Caja', ENCABEZADOS, lista.map(m => [
        formatFechaPe(m.fecha), m.hora?.slice(0, 5) ?? '', estadoDe(m), m.tipo_movimiento ?? '', numeroDoc(m), m.orden_viaje ?? '',
        m.conductor ?? '', m.ruta_viaje ?? '', m.autoriza ?? '', m.placa ?? '', m.centro_costo ?? '', m.motivo ?? '', m.sub_motivo ?? '',
        m.tipo_persona ?? '', m.persona ?? '', m.moneda ?? '', num(m.importe_total), num(m.tipo_cambio), m.modalidad_pago ?? '',
        m.cuenta_bancaria_persona ?? '', m.cuenta_bancaria_empresa ?? '', m.tipo_comprobante ?? '', m.numero_factura ?? '',
        m.numero_constancia_deposito ?? '', m.usuario_creacion ?? '', m.usuario_aprobacion ?? '',
      ]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria'] });
  const periodo = desde || hasta ? `${desde ? formatFechaPe(desde) : '…'} al ${hasta ? formatFechaPe(hasta) : '…'}` : 'Todas las fechas';

  return (
    <Page>
      <div className="ga-page">
        <header className="ga-cab">
          <div>
            <span className="ga-pill"><ShieldCheck size={13} aria-hidden /> Tesorería</span>
            <h1 className="ga-titulo">Caja</h1>
            <p className="ga-sub">
              Egresos e ingresos de caja con aprobación, documentos y anulación
              {resumen.pendientes > 0 ? ` · ${resumen.pendientes} por aprobar` : ''} · {periodo}
            </p>
          </div>
          <div className="ga-acciones">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { void refrescar(); }}>Actualizar</Button>
            <div className="acciones-iconos acciones-iconos--sinfondo" role="group" aria-label="Acciones de caja">
              <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Exportar Excel"
                aria-label="Exportar Excel" icon={<FileSpreadsheet size={17} />} onClick={exportar} />
              <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Bancos"
                aria-label="Bancos" icon={<Banknote size={17} />} onClick={() => nav('/tesoreria/bancos')} />
              <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--ambar" data-tip="Centros de costos"
                aria-label="Centros de costos" icon={<Boxes size={17} />} onClick={() => nav('/tesoreria/centros-costos')} />
            </div>
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ mov: null })}>Nuevo</Button>}
          </div>
        </header>

        <div className="ga-kpis">
          <div className="ga-kpi ga-kpi--verde">
            <div className="ga-kpi__cab"><span className="ga-kpi__etiqueta">Ingresos</span><span className="ga-kpi__pill">Entradas</span></div>
            <span className="ga-kpi__valor">{formatSoles(resumen.ingresos)}</span>
            <span className="ga-kpi__unidad">en soles, sin anulados</span>
          </div>
          <div className="ga-kpi ga-kpi--rojo">
            <div className="ga-kpi__cab"><span className="ga-kpi__etiqueta">Egresos</span><span className="ga-kpi__pill">Salidas</span></div>
            <span className="ga-kpi__valor">{formatSoles(resumen.egresos)}</span>
            <span className="ga-kpi__unidad">en soles, sin anulados</span>
          </div>
          <div className="ga-kpi ga-kpi--indigo">
            <div className="ga-kpi__cab"><span className="ga-kpi__etiqueta">Saldo</span><span className="ga-kpi__pill">Del periodo</span></div>
            <span className="ga-kpi__valor">{formatSoles(resumen.saldo)}</span>
            <span className="ga-kpi__unidad">ingresos − egresos</span>
          </div>
          <div className="ga-kpi ga-kpi--ambar">
            <div className="ga-kpi__cab"><span className="ga-kpi__etiqueta">Por aprobar</span><span className="ga-kpi__pill">Por revisar</span></div>
            <span className="ga-kpi__valor">{resumen.pendientes}</span>
            <span className="ga-kpi__unidad">{resumen.pendientes === 1 ? 'movimiento' : 'movimientos'}</span>
          </div>
        </div>

        <div className="ga-filtros">
          <div className="ga-filtros__fila">
            <div className="ga-campo">
              <span className="ga-campo__etiqueta">Fecha desde</span>
              <input type="date" className="input" aria-label="Fecha desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
            </div>
            <div className="ga-campo">
              <span className="ga-campo__etiqueta">Fecha hasta</span>
              <input type="date" className="input" aria-label="Fecha hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
            </div>
            <div className="ga-campo ga-buscar">
              <span className="ga-campo__etiqueta">Búsqueda rápida</span>
              <input type="search" className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Persona, motivo, N°, placa, orden de viaje…" aria-label="Buscar movimientos" />
            </div>
          </div>
          <div className="ga-tabs" role="group" aria-label="Filtrar por estado">
            {PESTANAS.map(p => (
              <button key={p.key} type="button" className="ga-tab" aria-pressed={pestana === p.key} onClick={() => { haptic('selection'); setPestana(p.key); }}>
                {p.etiqueta} <span className="ga-tab__n">{todos.filter(PASA[p.key]).length}</span>
              </button>
            ))}
            {hayFiltros && <button type="button" className="ga-limpiar" onClick={limpiarFiltros}>Limpiar filtros</button>}
          </div>
        </div>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <Wallet size={22} />}
            title={hayFiltros ? 'Sin coincidencias' : 'Sin movimientos en este periodo'}>
            {puedeCrear && !hayFiltros ? <>Registra el primero con <strong>Nuevo</strong>.</> : 'Prueba con otros filtros o un periodo más amplio.'}
          </EmptyState>
        ) : (
          movil ? (
          <div className="tarjeta__lista">
            {lista.map(m => {
              const ingreso = m.tipo_movimiento === 'INGRESO';
              const est = estadoDe(m);
              return (
                <button key={m.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbiertoId(m.id); }}>
                  <div className="mov-fila__icon" style={{ background: ingreso ? 'var(--green-tint)' : 'var(--red-tint)', color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                    {ingreso ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{m.persona || m.sub_motivo || m.motivo || 'Movimiento'}</span>
                    <span className="mov-fila__sub">{[numeroDoc(m), m.motivo, m.orden_viaje, m.placa, formatFechaPe(m.fecha)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto" style={{ color: ingreso ? 'var(--green-ink)' : undefined }}>
                      {ingreso ? '+' : '-'}{montoCaja(m.importe_total, m.moneda)}
                    </span>
                    <Badge tone={tonoEstado(est)}>{est}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
          ) : (
          <TablaRedimensionable id="caja-tesoreria" columnas={COLUMNAS} ariaLabel="Movimientos de caja" altoMax="68vh">
            {lista.map(m => {
              const ingreso = m.tipo_movimiento === 'INGRESO';
              const est = estadoDe(m);
              const sustento = String(m.sustento_view_url ?? m.sustento_url ?? '');
              const voucher = String(m.voucher_view_url ?? m.voucher_url ?? '');
              const abrir = () => { haptic('selection'); setAbiertoId(m.id); };
              return (
                <tr key={m.id} className={`tabla-redim__fila--click${est === 'ANULADO' ? ' mov-tabla-anulada' : ''}`} onClick={abrir}>
                  <Celda>
                    <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); abrir(); }}>Ver detalle</Button>
                  </Celda>
                  <Celda><Badge tone={ingreso ? 'green' : 'red'}>{ingreso ? 'INGRESO' : 'EGRESO'}</Badge></Celda>
                  <Celda alinear="right" mono>
                    <span style={{ color: ingreso ? 'var(--green-ink)' : undefined, fontWeight: 700 }}>{ingreso ? '+' : '-'}{montoCaja(m.importe_total, m.moneda)}</span>
                  </Celda>
                  <Celda>
                    <span className="pago-prov">
                      <span className="pago-prov__nombre">{m.persona || m.conductor || '—'}</span>
                      {m.tipo_persona && <span className="pago-prov__ruc">{m.tipo_persona}</span>}
                    </span>
                  </Celda>
                  <Celda>
                    <span className="pago-prov">
                      <span className="pago-prov__nombre">{m.motivo || '—'}</span>
                      {m.sub_motivo && <span className="pago-prov__ruc">{m.sub_motivo}</span>}
                    </span>
                  </Celda>
                  <Celda mono><span className="pago-codigo">{numeroDoc(m) || '—'}</span></Celda>
                  <Celda mono>{[m.orden_viaje, m.placa].filter(Boolean).join(' · ') || '—'}</Celda>
                  <Celda>{m.centro_costo || '—'}</Celda>
                  <Celda mono>{formatFechaPe(m.fecha)}{m.hora ? ` ${m.hora.slice(0, 5)}` : ''}</Celda>
                  <Celda>{m.usuario_creacion || '—'}</Celda>
                  <Celda>{m.autoriza || '—'}</Celda>
                  <Celda>{m.usuario_aprobacion || '—'}</Celda>
                  <Celda mono>{m.fecha_aprobacion ? formatFechaHoraPe(m.fecha_aprobacion) : '—'}</Celda>
                  <Celda>{m.modalidad_pago || '—'}</Celda>
                  <Celda><span className="pago-cuenta__texto" title={m.cuenta_bancaria_persona ?? ''}>{m.cuenta_bancaria_persona || '—'}</span></Celda>
                  <Celda><span className="pago-cuenta__texto" title={m.cuenta_bancaria_empresa ?? ''}>{m.cuenta_bancaria_empresa || '—'}</span></Celda>
                  <Celda>
                    <span className="pago-estado">
                      <span className="t-footnote c-secondary">{m.tipo_comprobante || '—'}{m.numero_factura ? ` · ${m.numero_factura}` : ''}</span>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        {sustento && <a className="btn btn--secondary btn--sm" href={sustento} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><Paperclip size={13} /> Sustento</a>}
                        {voucher && <a className="btn btn--secondary btn--sm" href={voucher} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><Paperclip size={13} /> Voucher</a>}
                      </span>
                    </span>
                  </Celda>
                  <Celda><Badge tone={tonoEstado(est)}>{est}</Badge></Celda>
                </tr>
              );
            })}
          </TablaRedimensionable>
          )
        )}
      </div>

      <DetalleCaja mov={abierto} onClose={() => setAbiertoId(null)} onEditar={m => setFormulario({ mov: m })} onCambio={refrescar} />
      <FormularioCaja open={!!formulario} mov={formulario?.mov ?? null} onClose={() => setFormulario(null)} onGuardado={refrescar} />
    </Page>
  );
}
