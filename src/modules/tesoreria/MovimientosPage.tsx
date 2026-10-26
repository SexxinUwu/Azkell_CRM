import '../mantenimiento/mant.css';
import './mov.css';
import { useMemo, useState } from 'react';
import { ArrowLeftRight, FileSpreadsheet, Printer, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatDolares, formatFechaPe, formatSoles } from '../../core/lib/format';
import { useBancos, useMovimientos, type MovimientoTesoreria } from './api';
import { esDolar, hoyLima, limpio, num, primerDiaMesLima } from './mov-utilidades';
import { MovDetalleSheet } from './mov-DetalleSheet';
import { MovFilaMovil, MovFilaTabla } from './mov-Filas';

type Tipo = '' | 'INGRESO' | 'EGRESO';

const ESTADOS = ['PROCESADO', 'APROBADO', 'PENDIENTE', 'REGISTRADO', 'PAGADO', 'ANULADO'];
const TIPOS: Array<{ value: Tipo; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'EGRESO', label: 'Egresos' },
  { value: 'INGRESO', label: 'Ingresos' },
];

const COLUMNAS: ColumnaTabla[] = [
  { id: 'comprobante', titulo: 'Comprobante', ancho: 120, alinear: 'center' },
  { id: 'tipo', titulo: 'Tipo mov.', ancho: 120 },
  { id: 'debe', titulo: 'Debe', ancho: 140, alinear: 'right' },
  { id: 'haber', titulo: 'Haber', ancho: 140, alinear: 'right' },
  { id: 'motivo', titulo: 'Motivo', ancho: 170 },
  { id: 'submotivo', titulo: 'Sub motivo', ancho: 170 },
  { id: 'origen', titulo: 'Tipo origen', ancho: 160 },
  { id: 'folio', titulo: 'Folio / N° OC', ancho: 130 },
  { id: 'descripcion', titulo: 'Descripción', ancho: 260 },
  { id: 'fecha', titulo: 'Fecha depósito', ancho: 120 },
  { id: 'operacion', titulo: 'N° operación', ancho: 130 },
  { id: 'factura', titulo: 'N° factura', ancho: 120 },
  { id: 'beneficiario', titulo: 'Beneficiario', ancho: 240 },
  { id: 'persona', titulo: 'Tipo persona', ancho: 120 },
  { id: 'registro', titulo: 'Usuario creación', ancho: 150 },
  { id: 'solicitante', titulo: 'Solicitante', ancho: 150 },
  { id: 'autoriza', titulo: 'Autoriza', ancho: 150 },
  { id: 'aprobacion', titulo: 'Fecha aprob.', ancho: 130 },
  { id: 'centro', titulo: 'Centro costo', ancho: 200 },
  { id: 'operativo', titulo: 'Datos operativos', ancho: 200 },
  { id: 'estado', titulo: 'Estado', ancho: 120 },
  { id: 'cuenta', titulo: 'Banco / cuenta', ancho: 220 },
];

export function MovimientosPage() {
  const toast = useToast();
  const bancos = useBancos();
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<Tipo>('');
  const [estado, setEstado] = useState('PROCESADO');
  const [banco, setBanco] = useState('');
  const [desde, setDesde] = useState(primerDiaMesLima);
  const [hasta, setHasta] = useState(hoyLima);
  const [abierto, setAbierto] = useState<MovimientoTesoreria | null>(null);

  // El período y el estado viajan al servidor; el resto se filtra en la pantalla
  const { data, isLoading, isError, error } = useMovimientos({ desde, hasta, estado });
  const todos = data ?? [];

  const nombresBanco = useMemo(
    () => [...new Set((bancos.data ?? []).filter(b => b.estado !== 'INACTIVO').map(b => String(b.banco ?? '').trim()).filter(Boolean))],
    [bancos.data],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todos.filter(m => {
      if (tipo && m.tipo_movimiento !== tipo) return false;
      if (banco && !String(m.banco_cuenta ?? '').toUpperCase().includes(banco)) return false;
      if (!q) return true;
      return [m.id, m.caja_folio, m.codigo_oc, m.motivo, m.sub_motivo, m.descripcion, m.numero_operacion, m.numero_factura, m.beneficiario,
        m.tipo_persona, m.solicitante, m.autoriza, m.banco_cuenta, m.centro_costo, m.centro_costo_nombre, m.placa, m.orden_viaje, m.estado]
        .join(' ').toLowerCase().includes(q);
    });
  }, [todos, busqueda, tipo, banco]);

  // Lo anulado no cuenta en los totales, y soles y dólares nunca se suman entre sí
  const resumen = useMemo(() => {
    const r = { ingSol: 0, egSol: 0, ingUsd: 0, egUsd: 0 };
    for (const m of lista) {
      if (m.estado === 'ANULADO') continue;
      const ing = m.tipo_movimiento === 'INGRESO';
      if (esDolar(m.moneda)) { if (ing) r.ingUsd += num(m.monto); else r.egUsd += num(m.monto); }
      else if (ing) r.ingSol += num(m.monto); else r.egSol += num(m.monto);
    }
    return r;
  }, [lista]);
  const hayDolares = resumen.ingUsd > 0 || resumen.egUsd > 0;
  const filtrando = !!(busqueda || tipo || banco);
  const balanceSol = resumen.ingSol - resumen.egSol;
  const balanceUsd = resumen.ingUsd - resumen.egUsd;
  const periodo = `${formatFechaPe(desde)} al ${formatFechaPe(hasta)}`;

  function alternarTipo(t: Tipo) {
    haptic('selection');
    setTipo(actual => (actual === t ? '' : t));
  }

  async function exportar() {
    try {
      const fmt = (s: string | null | undefined) => formatFechaPe(s);
      await exportarExcel('Movimientos-Tesoreria', 'Movimientos',
        ['N°', 'Origen', 'Folio / N° OC', 'Fecha depósito', 'Movimiento', 'Moneda', 'Monto', 'Debe', 'Haber', 'Motivo', 'Sub motivo', 'Descripción',
          'Banco / cuenta', 'N° operación', 'N° factura', 'Beneficiario', 'Tipo persona', 'Registró', 'Solicitante', 'Autoriza', 'Fecha aprobación',
          'Centro de costos', 'Placa', 'Orden de viaje', 'Estado'],
        lista.map((m, i) => [i + 1, m.tipo_origen, m.codigo_oc || m.caja_folio, fmt(m.fecha_valuta || m.fecha), m.tipo_movimiento, m.moneda, num(m.monto),
          m.tipo_movimiento === 'INGRESO' ? num(m.monto) : 0, m.tipo_movimiento === 'EGRESO' ? num(m.monto) : 0,
          m.motivo, limpio(m.sub_motivo), limpio(m.descripcion), limpio(m.banco_cuenta), limpio(m.numero_operacion), limpio(m.numero_factura),
          limpio(m.beneficiario), limpio(m.tipo_persona), limpio(m.usuario_creacion), limpio(m.solicitante), limpio(m.autoriza), fmt(m.fecha_aprobacion),
          limpio(m.centro_costo_nombre || m.centro_costo), limpio(m.placa), limpio(m.orden_viaje), m.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Tesorería"
        title="Movimientos"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}${filtrando ? ` de ${todos.length}` : ''} · ${periodo}`}
        actions={
          <MenuOtros opciones={[
            { label: 'Exportar Excel', detalle: `${lista.length} movimientos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar, disabled: lista.length === 0 },
            { label: 'Imprimir listado', detalle: 'Tarjetas y tabla del período', icon: <Printer size={17} />, onSelect: () => window.print() },
          ]} />
        }
      />

      <div className="mov-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="mov-solo-impresion"><strong>Movimientos de tesorería</strong> · {periodo} · estado {estado || 'todos'}</p>

        <div className="mov-kpis">
          <button type="button" className="mov-kpi pressable" onClick={() => alternarTipo('INGRESO')} aria-pressed={tipo === 'INGRESO'}>
            <span className="mov-kpi__etiqueta">Ingresos</span>
            <span className="mov-kpi__num mov-kpi__num--ingreso">{formatSoles(resumen.ingSol)}</span>
            {hayDolares && <span className="mov-kpi__usd">{formatDolares(resumen.ingUsd)}</span>}
          </button>
          <button type="button" className="mov-kpi pressable" onClick={() => alternarTipo('EGRESO')} aria-pressed={tipo === 'EGRESO'}>
            <span className="mov-kpi__etiqueta">Egresos</span>
            <span className="mov-kpi__num mov-kpi__num--egreso">{formatSoles(resumen.egSol)}</span>
            {hayDolares && <span className="mov-kpi__usd">{formatDolares(resumen.egUsd)}</span>}
          </button>
          <div className="mov-kpi">
            <span className="mov-kpi__etiqueta">Balance neto</span>
            <span className={`mov-kpi__num${balanceSol < 0 ? ' mov-kpi__num--negativo' : ''}`}>{formatSoles(balanceSol)}</span>
            {hayDolares && <span className={`mov-kpi__usd${balanceUsd < 0 ? ' mov-kpi__num--negativo' : ''}`}>{formatDolares(balanceUsd)}</span>}
          </div>
          <button type="button" className="mov-kpi pressable" onClick={() => { haptic('selection'); setTipo(''); }} aria-pressed={tipo === ''}>
            <span className="mov-kpi__etiqueta">Registros</span>
            <span className="mov-kpi__num">{lista.length}</span>
            {filtrando && <span className="mov-kpi__nota">de {todos.length} en el período</span>}
          </button>
        </div>

        <div className="mov-filtros mov-no-imprimir">
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Beneficiario, motivo, folio, N° de operación, placa, orden de viaje…" />
          <div className="mov-filtros__fila">
            <SegmentedControl label="Tipo de movimiento" value={tipo} onChange={setTipo} options={TIPOS} />
            <SelectInput value={banco} onChange={e => setBanco(e.target.value)} aria-label="Banco o cuenta">
              <option value="">Todos los bancos y cajas</option>
              {nombresBanco.map(b => <option key={b} value={b}>{b}</option>)}
              <option value="CAJA">Solo cajas</option>
            </SelectInput>
            <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
            <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
            <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
          </div>
        </div>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={filtrando ? <SearchX size={22} /> : <ArrowLeftRight size={22} />} title={filtrando ? 'Sin coincidencias' : 'Sin movimientos en este período'}>
            Prueba con otras fechas o con otro estado.
          </EmptyState>
        ) : (
          <>
            <div className="mov-solo-escritorio">
              <TablaRedimensionable id="movimientos-tesoreria" columnas={COLUMNAS} ariaLabel="Movimientos de tesorería" altoMax="68vh">
                {lista.map(m => <MovFilaTabla key={m.id} m={m} onAbrir={setAbierto} />)}
              </TablaRedimensionable>
            </div>
            <div className="tarjeta__lista mov-solo-movil">
              {lista.map(m => <MovFilaMovil key={m.id} m={m} onAbrir={setAbierto} />)}
            </div>
          </>
        )}
      </div>

      <MovDetalleSheet mov={abierto} onClose={() => setAbierto(null)} />
    </Page>
  );
}
