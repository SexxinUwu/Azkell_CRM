import './nc.css';
import '../../core/ui/acciones-iconos.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Clock, Coins, FileText, PackageMinus, Plus, ReceiptText, RefreshCw, SearchX, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { NcFormulario, type NcInicial } from './nc-Formulario';
import { NcDevolucion } from './nc-Devolucion';
import { NcEstadoCuenta } from './nc-EstadoCuenta';
import { NcDetalle } from './nc-Detalle';
import { ETIQUETA_ESTADO, TONO_ESTADO, montoNc, useNotasCredito, useResumenProveedoresNc, type EstadoNc, type NotaCredito } from './nc-api';

type Vista = 'notas' | 'proveedores';
type FiltroEstado = 'todas' | EstadoNc;

const ESTADOS: Array<{ value: FiltroEstado; label: string }> = [
  { value: 'todas', label: 'Todas' }, { value: 'REGISTRADA', label: 'Por aprobar' }, { value: 'APROBADA', label: 'Aprobadas' },
  { value: 'APLICADA_PARCIAL', label: 'En uso' }, { value: 'APLICADA', label: 'Aplicadas' }, { value: 'REEMBOLSADA', label: 'Reembolsadas' }, { value: 'ANULADA', label: 'Anuladas' },
];

const sumar = (xs: number[]) => Math.round(xs.reduce((s, v) => s + v, 0) * 100) / 100;

/** Tesorería › Notas de crédito de proveedores: registro, aprobación, saldo a favor y su aplicación al pago de órdenes de compra */
export function NotasCreditoPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const notas = useNotasCredito();
  const resumen = useResumenProveedoresNc();
  const puedeCrear = can('tesoreria_nc.crear');

  const [vista, setVista] = useState<Vista>('notas');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todas');
  const [proveedor, setProveedor] = useState('');
  const [moneda, setMoneda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [formulario, setFormulario] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [devolucion, setDevolucion] = useState(false);
  const [inicial, setInicial] = useState<NcInicial | null>(null);
  const [cuenta, setCuenta] = useState<{ clave: string; nombre: string } | null>(null);

  const lista = useMemo(() => notas.data ?? [], [notas.data]);
  const proveedores = useMemo(() => [...new Set(lista.map(n => n.proveedor_nombre))].sort().map(v => ({ value: v, label: v })), [lista]);
  const filtrosActivos = (estado !== 'todas' ? 1 : 0) + (proveedor ? 1 : 0) + (moneda ? 1 : 0);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return lista.filter(n =>
      (estado === 'todas' || n.estado === estado) && (!proveedor || n.proveedor_nombre === proveedor) && (!moneda || n.moneda === moneda)
      && (!q || [n.codigo, n.proveedor_nombre, n.serie, n.numero, n.oc_origen, n.motivo_texto].some(x => String(x ?? '').toUpperCase().includes(q))));
  }, [lista, busqueda, estado, proveedor, moneda]);

  const cifras = useMemo(() => {
    const act = lista.filter(n => n.estado !== 'ANULADA');
    const aFavor = (m: string) => sumar(act.filter(n => ['APROBADA', 'APLICADA_PARCIAL'].includes(n.estado) && n.forma === 'APLICAR' && n.moneda === m).map(n => n.saldo));
    return {
      porAprobar: lista.filter(n => n.estado === 'REGISTRADA').length,
      sol: aFavor('PEN'), usd: aFavor('USD'),
      enUso: lista.filter(n => n.estado === 'APLICADA_PARCIAL').length,
      total: act.length,
    };
  }, [lista]);

  const cargando = notas.isLoading;
  const refrescar = () => { haptic('selection'); void qc.invalidateQueries({ queryKey: ['tesoreria', 'notas-credito'] }); };

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Notas de crédito de proveedores"
        subtitle={cargando ? 'Cargando…' : `${cifras.total} notas · ${cifras.porAprobar} por aprobar`}
        actions={
          <>
            <div className="acciones-iconos acciones-iconos--sinfondo">
              <button type="button" className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Actualizar" aria-label="Actualizar" disabled={notas.isFetching} onClick={refrescar}>
                <RefreshCw size={20} />
              </button>
            </div>
            {puedeCrear && <Button variant="secondary" icon={<PackageMinus size={16} />} onClick={() => { haptic('selection'); setDevolucion(true); }}>Devolver mercadería</Button>}
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { haptic('selection'); setInicial(null); setFormulario(true); }}>Registrar nota de crédito</Button>}
          </>
        }
      />

      <div className="inv-kpis" style={{ marginBottom: 'var(--s-3)' }}>
        <KpiTarjeta etiqueta="Por aprobar" valor={String(cifras.porAprobar)} icono={<Clock size={18} />} tono="warning"
          activo={estado === 'REGISTRADA'} onClick={() => { haptic('selection'); setVista('notas'); setEstado(e => (e === 'REGISTRADA' ? 'todas' : 'REGISTRADA')); }} />
        <KpiTarjeta etiqueta="Saldo a favor (S/)" valor={montoNc(cifras.sol, 'PEN')} icono={<Wallet size={18} />} tono="ok" />
        <KpiTarjeta etiqueta="Saldo a favor (US$)" valor={montoNc(cifras.usd, 'USD')} icono={<Coins size={18} />} tono="ok" />
        <KpiTarjeta etiqueta="Notas en uso" valor={String(cifras.enUso)} icono={<ReceiptText size={18} />} tono="valor"
          activo={estado === 'APLICADA_PARCIAL'} onClick={() => { haptic('selection'); setVista('notas'); setEstado(e => (e === 'APLICADA_PARCIAL' ? 'todas' : 'APLICADA_PARCIAL')); }} />
      </div>

      <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Código, proveedor, serie, número u orden" activos={filtrosActivos} onAbrirFiltros={() => setFiltrando(true)}>
        <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista} options={[{ value: 'notas', label: 'Notas' }, { value: 'proveedores', label: 'Por proveedor' }]} />
      </BarraFiltros>

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={filtrosActivos} resultado={visibles.length} unidad="nota"
        onLimpiar={() => { setEstado('todas'); setProveedor(''); setMoneda(''); }}>
        <GrupoFiltro titulo="Estado">
          <ChoiceChips label="Estado" value={estado} onChange={v => setEstado(v as FiltroEstado)} options={ESTADOS} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Moneda">
          <ChoiceChips label="Moneda" value={moneda} onChange={setMoneda} options={[{ value: '', label: 'Todas' }, { value: 'PEN', label: 'Soles' }, { value: 'USD', label: 'Dólares' }]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Proveedor">
          <Combobox options={proveedores} value={proveedor || null} onChange={v => setProveedor(v ?? '')} enHoja compacta placeholder="Todos los proveedores" tituloHoja="Proveedor" />
        </GrupoFiltro>
      </HojaFiltros>

      {notas.isError ? <Notice tone="error">{errorMessage(notas.error)}</Notice> : cargando ? <PageLoader /> : vista === 'proveedores' ? (
        <PorProveedor datos={resumen.data ?? []} cargando={resumen.isLoading} onElegir={(clave, nombre) => setCuenta({ clave, nombre })} />
      ) : visibles.length === 0 ? (
        <EmptyState icon={busqueda || filtrosActivos ? <SearchX size={22} /> : <ReceiptText size={22} />} title={lista.length ? 'Ninguna nota coincide' : 'Sin notas de crédito'}>
          {lista.length ? 'Prueba con otra búsqueda o quita los filtros.' : puedeCrear ? <>Cuando un proveedor te dé una nota por una devolución, regístrala con <strong>Registrar nota de crédito</strong>.</> : 'Aún no hay notas registradas.'}
        </EmptyState>
      ) : (
        <div className="list">
          {visibles.map(n => <FilaNota key={n.id} n={n} onAbrir={() => { haptic('selection'); setDetalleId(n.id); }} />)}
        </div>
      )}

      <NcFormulario open={formulario} inicial={inicial} onClose={() => setFormulario(false)} onCreada={id => { setFormulario(false); setDetalleId(id); }} />
      <NcDevolucion open={devolucion} onClose={() => setDevolucion(false)}
        onHecha={d => { setDevolucion(false); setInicial({ proveedorId: d.proveedorId, ocOrigen: d.ocOrigen, referencia: d.referencia, total: d.total, moneda: d.moneda }); setFormulario(true); }} />
      <NcEstadoCuenta proveedor={cuenta?.clave ?? null} nombre={cuenta?.nombre ?? ''} onClose={() => setCuenta(null)}
        onVerNotas={() => { if (cuenta) setProveedor(cuenta.nombre); setCuenta(null); setVista('notas'); }} />
      <NcDetalle id={detalleId} onClose={() => setDetalleId(null)} />
    </Page>
  );
}

function FilaNota({ n, onAbrir }: { n: NotaCredito; onAbrir: () => void }) {
  return (
    <button type="button" className="row pressable" onClick={onAbrir} style={{ textAlign: 'left' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: '2.5rem', height: '2.5rem', borderRadius: 'var(--r-md)', background: 'var(--accent-tint)', color: 'var(--accent-ink)', flexShrink: 0 }}>
        <FileText size={18} aria-hidden />
      </span>
      <span className="row__main">
        <span className="row__title">{n.codigo} · {n.proveedor_nombre}</span>
        <span className="row__subtitle">
          {n.serie}-{n.numero} · {formatFechaPe(n.fecha_emision)}{n.oc_origen ? ` · orden ${n.oc_origen}` : ''}{n.forma === 'REEMBOLSO' ? ' · reembolso' : ''}
        </span>
      </span>
      <span style={{ textAlign: 'right', flexShrink: 0 }}>
        <span className="row__title" style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>{montoNc(n.total, n.moneda)}</span>
        <span className="row__subtitle" style={{ display: 'block' }}>{['APROBADA', 'APLICADA_PARCIAL'].includes(n.estado) ? `Saldo ${montoNc(n.saldo, n.moneda)}` : ' '}</span>
      </span>
      <span className={`nc-estado nc-estado--${TONO_ESTADO[n.estado]}`}>{ETIQUETA_ESTADO[n.estado]}</span>
      <ChevronRight size={18} className="row__chevron" aria-hidden />
    </button>
  );
}

function PorProveedor({ datos, cargando, onElegir }: { datos: Array<{ clave: string; proveedor_nombre: string; moneda: 'PEN' | 'USD'; notas: number; por_aprobar: number; saldo_a_favor: number; aplicado: number; total: number }>; cargando: boolean; onElegir: (clave: string, nombre: string) => void }) {
  if (cargando) return <PageLoader />;
  if (!datos.length) return <EmptyState icon={<CheckCircle2 size={22} />} title="Sin saldos por proveedor">Cuando registres notas de crédito, aquí verás cuánto tiene a favor cada proveedor.</EmptyState>;
  return (
    <div className="list">
      {datos.map(d => (
        <button key={`${d.clave}-${d.moneda}`} type="button" className="row pressable" onClick={() => onElegir(d.clave, d.proveedor_nombre)} style={{ textAlign: 'left' }}>
          <span className="row__main">
            <span className="row__title">{d.proveedor_nombre}</span>
            <span className="row__subtitle">{d.notas} {d.notas === 1 ? 'nota' : 'notas'}{d.por_aprobar ? ` · ${d.por_aprobar} por aprobar` : ''} · aplicado {montoNc(d.aplicado, d.moneda)} de {montoNc(d.total, d.moneda)}</span>
          </span>
          <span style={{ textAlign: 'right' }}>
            <span className="row__title" style={{ display: 'block', color: d.saldo_a_favor > 0 ? 'var(--green-ink)' : undefined, fontVariantNumeric: 'tabular-nums' }}>{montoNc(d.saldo_a_favor, d.moneda)}</span>
            <span className="row__subtitle" style={{ display: 'block' }}>a favor</span>
          </span>
          <ChevronRight size={18} className="row__chevron" aria-hidden />
        </button>
      ))}
    </div>
  );
}
