import './pago.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileSpreadsheet, RefreshCw, SearchX, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { formatDolares, formatFechaHoraPe, formatFechaPe, formatMoneda, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { PagoDetalleSheet } from './pago-detalle-sheet';
import { PagoProcesarSheet } from './pago-procesar-sheet';
import {
  codigoOC, esPagada, esPendiente, esUSD, esCredito, importeOC, usePagoRequerimientos, vencimiento,
  type FiltroEstado, type OrdenPago,
} from './pago-datos';

type FiltroMoneda = 'TODAS' | 'PEN' | 'USD';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'accion', titulo: 'Acción', ancho: 130 },
  { id: 'importe', titulo: 'Monto a proceder', ancho: 150, alinear: 'right' },
  { id: 'solic', titulo: 'Solicitante', ancho: 150 },
  { id: 'centro', titulo: 'Centro costo', ancho: 120 },
  { id: 'motivo', titulo: 'Motivo', ancho: 240 },
  { id: 'oc', titulo: 'Orden de compra', ancho: 150 },
  { id: 'creador', titulo: 'Usuario creación', ancho: 160 },
  { id: 'fecha', titulo: 'Fecha registro', ancho: 130 },
  { id: 'venc', titulo: 'Días restantes', ancho: 140, alinear: 'center' },
  { id: 'aprobador', titulo: 'Usuario aprobación', ancho: 170 },
  { id: 'fechaAprob', titulo: 'Fecha aprobación', ancho: 150 },
  { id: 'prov', titulo: 'Proveedor', ancho: 240 },
  { id: 'cuenta', titulo: 'Cuenta destino (proveedor)', ancho: 280 },
  { id: 'origen', titulo: 'Cuenta origen (empresa)', ancho: 260 },
  { id: 'estado', titulo: 'Estado', ancho: 170 },
];

const ENCABEZADOS_EXCEL = [
  'N°', 'Estado', 'Moneda', 'Importe', 'Condición de pago', 'Días de crédito', 'Solicitante', 'Centro de costo',
  'Motivo', 'Orden de compra', 'Usuario de creación', 'Fecha de registro', 'Usuario de aprobación',
  'Fecha de aprobación', 'Proveedor', 'RUC', 'Cuenta destino', 'Cuenta origen', 'N° de operación / constancia',
];

// Texto para buscar: sin tildes y en mayúsculas, para que "Perez" encuentre "PÉREZ".
const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function textoBusqueda(o: OrdenPago): string {
  return normalizar([
    codigoOC(o), o.proveedor_nombre, o.proveedor_ruc, o.motivo, o.motivo_entrada, o.sub_motivo, o.centro_costo,
    o.solicitante, o.creador_nombre, o.creado_por, o.aprobador_nombre, o.aprobado_por, o.cuenta_bancaria_proveedor,
    o.cuenta_bancaria_empresa, o.numero_operacion, o.placa, o.ot_id,
  ].filter(Boolean).join(' '));
}

function estadoBadge(o: OrdenPago) {
  if (esPendiente(o)) return <Badge tone="amber">Por pagar</Badge>;
  if (esPagada(o)) return <Badge tone="green">Procesado</Badge>;
  return <Badge>{o.estado || '—'}</Badge>;
}

function VencimientoCelda({ oc }: { oc: OrdenPago }) {
  if (!esCredito(oc)) return <span className="t-footnote c-secondary">Al contado</span>;
  if (esPagada(oc)) return <Badge>Liquidado</Badge>;
  const v = vencimiento(oc);
  return (
    <span className="pago-venc">
      {v && <Badge tone={v.tono}>{v.texto}</Badge>}
      <span className="t-footnote c-secondary">{formatFechaPe(oc.fecha_vencimiento)} · {Number(oc.dias_credito) || 0} días</span>
    </span>
  );
}

function CuentaCelda({ texto, usd }: { texto?: string; usd: boolean }) {
  if (!texto) return <span className="t-footnote c-secondary">Pendiente de pago</span>;
  return (
    <span className="pago-cuenta">
      <Badge tone={usd ? 'accent' : 'green'}>{usd ? 'USD' : 'PEN'}</Badge>
      <span className="pago-cuenta__texto" title={texto}>{texto}</span>
    </span>
  );
}

export function PagoRequerimientosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const movil = useMediaQuery(MOBILE_QUERY);

  const [estado, setEstado] = useState<FiltroEstado>('aprobado');
  const [moneda, setMoneda] = useState<FiltroMoneda>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<{ oc: OrdenPago | null; abierto: boolean }>({ oc: null, abierto: false });
  const [procesar, setProcesar] = useState<{ oc: OrdenPago | null; abierto: boolean; sesion: number }>({ oc: null, abierto: false, sesion: 0 });

  const lista = usePagoRequerimientos(estado);
  // Los KPI y el filtro "Todos" usan la lista completa, así los totales no dependen de la pestaña
  const todos = usePagoRequerimientos('todos');
  const ocs = lista.data ?? [];

  const kpis = useMemo(() => {
    const t = todos.data ?? [];
    let totalPEN = 0;
    let totalUSD = 0;
    let pendientes = 0;
    let pagados = 0;
    for (const o of t) {
      if (esPendiente(o)) {
        pendientes++;
        if (esUSD(o.moneda)) totalUSD += importeOC(o);
        else totalPEN += importeOC(o);
      } else if (esPagada(o)) {
        pagados++;
      }
    }
    return { pendientes, pagados, totalPEN, totalUSD };
  }, [todos.data]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return ocs.filter(o => {
      if (moneda === 'PEN' && esUSD(o.moneda)) return false;
      if (moneda === 'USD' && !esUSD(o.moneda)) return false;
      return !q || textoBusqueda(o).includes(q);
    });
  }, [ocs, moneda, busqueda]);

  function abrirDetalle(oc: OrdenPago) {
    setDetalle({ oc, abierto: true });
  }

  function abrirProcesar(oc: OrdenPago) {
    setDetalle(d => ({ ...d, abierto: false }));
    setProcesar(p => ({ oc, abierto: true, sesion: p.sesion + 1 }));
  }

  function irKpi(e: FiltroEstado, m: FiltroMoneda) {
    haptic('selection');
    setEstado(e);
    setMoneda(m);
  }

  async function exportar() {
    if (visibles.length === 0) { toast('No hay registros para exportar', 'error'); return; }
    const filas = visibles.map((o, i) => [
      i + 1,
      esPendiente(o) ? 'Por pagar' : esPagada(o) ? 'Procesado' : (o.estado ?? ''),
      esUSD(o.moneda) ? 'USD' : 'PEN',
      importeOC(o),
      o.condicion_pago || 'Al contado',
      Number(o.dias_credito) || 0,
      o.solicitante ?? '',
      o.centro_costo ?? '',
      o.motivo_entrada || o.motivo || '',
      codigoOC(o),
      o.creador_nombre || o.creado_por || '',
      formatFechaHoraPe(o.fecha),
      o.aprobador_nombre || o.aprobado_por || '',
      formatFechaHoraPe(o.fecha_aprobacion),
      o.proveedor_nombre ?? '',
      o.proveedor_ruc ?? '',
      o.cuenta_bancaria_proveedor ?? '',
      o.cuenta_bancaria_empresa ?? '',
      o.numero_operacion ?? '',
    ]);
    try {
      await exportarExcel('Pago_Requerimientos_Tesoreria', 'Pago_Requerimientos', ENCABEZADOS_EXCEL, filas);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const tiles: Array<{ id: string; label: string; valor: string; tono: string; activo: boolean; ir: () => void }> = [
    { id: 'pendientes', label: 'Por pagar', valor: String(kpis.pendientes), tono: 'accent', activo: estado === 'aprobado' && moneda === 'TODAS', ir: () => irKpi('aprobado', 'TODAS') },
    { id: 'soles', label: 'Total en soles', valor: formatSoles(kpis.totalPEN), tono: 'green', activo: estado === 'aprobado' && moneda === 'PEN', ir: () => irKpi('aprobado', 'PEN') },
    { id: 'dolares', label: 'Total en dólares', valor: formatDolares(kpis.totalUSD), tono: 'amber', activo: estado === 'aprobado' && moneda === 'USD', ir: () => irKpi('aprobado', 'USD') },
    { id: 'pagados', label: 'Procesados', valor: String(kpis.pagados), tono: 'ink', activo: estado === 'procesados', ir: () => irKpi('procesados', 'TODAS') },
  ];

  const hayFiltro = busqueda.trim() !== '' || moneda !== 'TODAS';

  return (
    <Page wide>
      <PageHeader
        eyebrow="Tesorería"
        title="Pago de requerimientos"
        subtitle={lista.isLoading ? 'Cargando…' : `${ocs.length} ${ocs.length === 1 ? 'orden' : 'órdenes'} en esta vista`}
        actions={
          <MenuOtros opciones={[
            { label: 'Actualizar', icon: <RefreshCw size={17} />,
              onSelect: () => { qc.invalidateQueries({ queryKey: ['tesoreria', 'pago-req'] }); } },
            { label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, onSelect: exportar },
          ]} />
        }
      />

      {lista.isError && <Notice tone="error">{errorMessage(lista.error)}</Notice>}

      <div className="pago-kpis">
        {tiles.map(k => (
          <button key={k.id} type="button" className={`pago-kpi pressable${k.activo ? ' pago-kpi--activo' : ''}`}
            aria-pressed={k.activo} onClick={k.ir}>
            <span className={`pago-kpi__valor pago-kpi__valor--${k.tono}`}>{k.valor}</span>
            <span className="pago-kpi__etiqueta">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="pago-barra">
        <SegmentedControl label="Estado de la orden" value={estado} onChange={setEstado} options={[
          { value: 'aprobado', label: 'Por pagar' },
          { value: 'procesados', label: 'Procesados' },
          { value: 'todos', label: 'Todos' },
        ]} />
        <SegmentedControl label="Moneda" value={moneda} onChange={setMoneda} options={[
          { value: 'TODAS', label: 'Todas' },
          { value: 'PEN', label: 'S/ Soles' },
          { value: 'USD', label: 'US$ Dólares' },
        ]} />
        <div className="pago-barra__buscar">
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="OC, proveedor, RUC, motivo, solicitante, cuenta…" />
        </div>
      </div>

      {lista.isLoading ? <PageLoader /> : visibles.length === 0 ? (
        <EmptyState
          icon={hayFiltro ? <SearchX size={22} /> : <CreditCard size={22} />}
          title={hayFiltro ? 'Sin coincidencias' : estado === 'aprobado' ? 'Sin órdenes por pagar' : 'Sin órdenes'}
        >
          {hayFiltro && (
            <Button variant="secondary" size="sm" onClick={() => { setBusqueda(''); setMoneda('TODAS'); }}>Limpiar filtros</Button>
          )}
        </EmptyState>
      ) : movil ? (
        <ul className="pago-lista" aria-label="Órdenes de compra">
          {visibles.map(oc => {
            const pendiente = esPendiente(oc);
            const usd = esUSD(oc.moneda);
            const importe = importeOC(oc);
            return (
              <li key={String(oc.id)} className="pago-lista__item">
                <div className="pago-lista__abrir" role="button" tabIndex={0}
                  onClick={() => abrirDetalle(oc)}
                  onKeyDown={e => { if (e.key === 'Enter') abrirDetalle(oc); }}>
                  <div className="pago-lista__cuerpo">
                    <span className="pago-lista__titulo">{oc.proveedor_nombre || 'Proveedor'}</span>
                    <span className="pago-lista__sub">{codigoOC(oc)} · {oc.motivo_entrada || oc.motivo || 'Sin motivo'}</span>
                    <span className="pago-lista__sub">{oc.solicitante || '—'} · {formatFechaPe(oc.fecha)}</span>
                    <span className="pago-lista__fila-badges">
                      {estadoBadge(oc)}
                      <VencimientoCelda oc={oc} />
                    </span>
                  </div>
                  <span className="pago-lista__monto">{importe > 0 ? formatMoneda(importe, usd ? 'USD' : 'PEN') : '—'}</span>
                </div>
                {pendiente && (
                  <div className="pago-lista__acciones">
                    <Button className="pago-procesar" variant="primary" size="sm" icon={<Wallet size={15} />} onClick={() => abrirProcesar(oc)}>Procesar pago</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <TablaRedimensionable id="pago-requerimientos" columnas={COLUMNAS} ariaLabel="Órdenes de compra para pagar" altoMax="68vh">
          {visibles.map(oc => {
            const pendiente = esPendiente(oc);
            const usd = esUSD(oc.moneda);
            const importe = importeOC(oc);
            const usdDestino = oc.cuenta_destino_moneda ? oc.cuenta_destino_moneda === 'USD' : usd;
            const usdOrigen = oc.cuenta_origen_moneda === 'USD';
            return (
              <tr key={String(oc.id)} className="tabla-redim__fila--click" onClick={() => abrirDetalle(oc)}>
                <Celda>
                  {pendiente ? (
                    <Button className="pago-procesar" variant="primary" size="sm" onClick={e => { e.stopPropagation(); abrirProcesar(oc); }}>Procesar</Button>
                  ) : oc.url_voucher_presigned ? (
                    <a className="btn btn--secondary btn--sm" href={oc.url_voucher_presigned} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}>Voucher</a>
                  ) : null}
                </Celda>
                <Celda alinear="right" mono>{importe > 0 ? formatMoneda(importe, usd ? 'USD' : 'PEN') : '—'}</Celda>
                <Celda>{oc.solicitante || '—'}</Celda>
                <Celda>{oc.centro_costo || '—'}</Celda>
                <Celda>{oc.motivo_entrada || oc.motivo || '—'}</Celda>
                <Celda mono><span className="pago-codigo">{codigoOC(oc)}</span></Celda>
                <Celda>{oc.creador_nombre || oc.creado_por || '—'}</Celda>
                <Celda mono>{formatFechaPe(oc.fecha)}</Celda>
                <Celda alinear="center"><VencimientoCelda oc={oc} /></Celda>
                <Celda>{oc.aprobador_nombre || oc.aprobado_por || '—'}</Celda>
                <Celda mono>{formatFechaHoraPe(oc.fecha_aprobacion)}</Celda>
                <Celda>
                  <span className="pago-prov">
                    <span className="pago-prov__nombre">{oc.proveedor_nombre || '—'}</span>
                    {oc.proveedor_ruc && <span className="pago-prov__ruc">RUC {oc.proveedor_ruc}</span>}
                  </span>
                </Celda>
                <Celda><CuentaCelda texto={oc.cuenta_bancaria_proveedor} usd={usdDestino} /></Celda>
                <Celda><CuentaCelda texto={oc.cuenta_bancaria_empresa} usd={usdOrigen} /></Celda>
                <Celda>
                  <span className="pago-estado">
                    {estadoBadge(oc)}
                    {esPagada(oc) && (
                      <span className="t-footnote c-secondary">
                        {formatFechaPe(oc.fecha_pago)}{oc.numero_operacion ? ` · ${oc.numero_operacion}` : ''}
                      </span>
                    )}
                  </span>
                </Celda>
              </tr>
            );
          })}
        </TablaRedimensionable>
      )}

      <PagoDetalleSheet
        oc={detalle.oc}
        open={detalle.abierto}
        onClose={() => setDetalle(d => ({ ...d, abierto: false }))}
        onProcesar={abrirProcesar}
      />
      <PagoProcesarSheet
        key={procesar.sesion}
        oc={procesar.oc}
        open={procesar.abierto}
        onClose={() => setProcesar(p => ({ ...p, abierto: false }))}
      />
    </Page>
  );
}
