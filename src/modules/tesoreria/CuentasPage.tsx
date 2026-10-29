import '../mantenimiento/mant.css';
import './cuentas.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Plus, SearchX, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { cambiarEstadoCuenta, useCuentas, type CuentaPorCobrar } from './api';
import { ImportarCuentasSheet } from './ImportarCuentasSheet';
import { NotaCreditoSheet } from './NotaCreditoSheet';
import { DetalleCuenta } from './cuentas-detalle';
import { FormularioCuenta } from './cuentas-formulario';
import { HistorialNC } from './cuentas-historial';
import { PagoCuenta } from './cuentas-pago';
import { descargarPlantillaCuentas } from './importarCuentas';
import { MESES, diasHasta, estadoDe, fechaDeFiltro, isoDe, num, soles, tonoCuenta, textoVencimiento } from './cuentas-util';

type EstadoFiltro = '' | 'PENDIENTE' | 'PAGADO' | 'ANULADO';
const ESTADO_OPCIONES: Array<{ value: EstadoFiltro; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'PAGADO', label: 'Pagadas' },
  { value: 'ANULADO', label: 'Anuladas' },
];

// Mismas columnas que el Excel del clásico
const CABECERAS_EXPORTAR = [
  'ID', 'COD DE LIQUIDACION', 'FECHA DE LIQUIDACION', 'N° DE VIAJE', 'FECHA SERVICIO', 'RAZON SOCIAL',
  'PLACA (CAMION)', 'PLACA (CARRETA)', 'CONDUCTOR', 'CLIENTE', 'LUGAR', 'FLETE', 'COMISION (%)', 'TARIFA',
  '(-) GASTOS OPERATIVOS', 'B.I', 'IGV', 'TOTAL', 'ADELANTO', 'DETRACCION', 'NETO POR COBRAR', 'NETO COBRADO',
  'MES FACTURACION', 'FECHA', 'SERIE', 'FACTURA', 'CREDITO DIAS', 'FECHA A COBRAR', 'FECHA DE DEPOSITO O TRANSF.',
  'ESTADO SERVICIO', 'DIFERENCIA', 'OBSERVACION',
];

// Búsqueda libre: cualquiera de estos campos contiene el texto
const CAMPOS_BUSQUEDA: Array<keyof CuentaPorCobrar> = [
  'codigo_liquidacion', 'orden_servicio', 'numero_viaje', 'razon_social', 'cliente', 'placa_camion', 'placa_carreta',
  'conductor', 'lugar', 'serie', 'factura', 'nota_credito', 'observacion',
];

export function CuentasPage() {
  const { data, isLoading, isError, error } = useCuentas();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('');
  const [mes, setMes] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ cuenta: CuentaPorCobrar | null } | null>(null);
  const [pagando, setPagando] = useState<CuentaPorCobrar | null>(null);
  const [porEliminar, setPorEliminar] = useState<CuentaPorCobrar | null>(null);
  const [importando, setImportando] = useState(false);
  const [notaCredito, setNotaCredito] = useState<CuentaPorCobrar | null>(null);
  const [historialDe, setHistorialDe] = useState<CuentaPorCobrar | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const lista: CuentaPorCobrar[] = useMemo(() => data ?? [], [data]);
  const abierta = lista.find(c => c.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_cuentas.crear');
  const puedeEditar = can('tesoreria_cuentas.editar', 'tesoreria_cuentas.crear');
  const puedeEliminar = can('tesoreria_cuentas.eliminar');
  const hayFiltros = !!(busqueda || estado || mes || desde || hasta);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter(c => {
      if (estado && estadoDe(c) !== estado) return false;
      if (mes && String(c.mes_facturacion ?? '').toUpperCase() !== mes) return false;
      if (desde || hasta) {
        const f = fechaDeFiltro(c);
        if (!f || (desde && f < desde) || (hasta && f > hasta)) return false;
      }
      if (!q) return true;
      return String(c.id).includes(q)
        || `${c.serie ?? ''}-${c.factura ?? ''}`.toLowerCase().includes(q)
        || CAMPOS_BUSQUEDA.some(k => String(c[k] ?? '').toLowerCase().includes(q));
    });
  }, [lista, busqueda, estado, mes, desde, hasta]);

  // Totales de lo que se ve (como el clásico): facturado sin anuladas; cobrado = neto cobrado, o el neto si no hay
  const resumen = useMemo(() => {
    let facturado = 0, porCobrar = 0, vencido = 0, cobrado = 0, vencidas = 0;
    for (const c of visibles) {
      const e = estadoDe(c);
      if (e !== 'ANULADO') facturado += num(c.total);
      if (e === 'PENDIENTE') {
        porCobrar += num(c.neto_cobrar);
        const d = diasHasta(c.fecha_cobrar);
        if (d !== null && d < 0) { vencido += num(c.neto_cobrar); vencidas++; }
      }
      if (e === 'PAGADO') cobrado += num(c.neto_cobrado ?? c.neto_cobrar);
    }
    return { facturado, porCobrar, vencido, vencidas, cobrado };
  }, [visibles]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/cuentas/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Registro eliminado'); setPorEliminar(null); setAbiertoId(null);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  // Igual que el clásico (toggleEstadoCuenta): sin confirmación; si falla, alert y el estado no cambia
  async function volverAPendiente(c: CuentaPorCobrar) {
    try {
      await cambiarEstadoCuenta(c.id, 'PENDIENTE');
      setAbiertoId(null);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
    } catch (err) {
      alert(`No se pudo actualizar el estado: ${errorMessage(err)}`);
    }
  }

  async function exportar() {
    try {
      await exportarExcel('Cuentas-por-cobrar', 'Cuentas', CABECERAS_EXPORTAR, visibles.map(c => [
        c.id, c.codigo_liquidacion, isoDe(c.fecha_liquidacion), c.numero_viaje, isoDe(c.fecha_servicio), c.razon_social,
        c.placa_camion, c.placa_carreta, c.conductor, c.cliente, c.lugar, num(c.flete), num(c.comision_porcentaje), num(c.tarifa),
        num(c.gastos_operativos), num(c.base_imponible), num(c.igv), num(c.total), num(c.adelanto), num(c.detraccion),
        num(c.neto_cobrar), c.neto_cobrado == null ? '' : num(c.neto_cobrado), c.mes_facturacion, isoDe(c.fecha_factura),
        c.serie, c.factura, c.credito_dias ?? '', isoDe(c.fecha_cobrar), isoDe(c.fecha_deposito), estadoDe(c), num(c.diferencia), c.observacion,
      ]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  function limpiarFiltros() {
    setBusqueda(''); setEstado(''); setMes(''); setDesde(''); setHasta('');
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Cuentas por cobrar"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} registros visibles`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Descargar plantilla', detalle: 'Encabezados para importar', icon: <FileSpreadsheet size={17} />, onSelect: () => { descargarPlantillaCuentas().catch(err => toast(errorMessage(err), 'error')); } },
              ...(puedeCrear ? [{ label: 'Importar desde Excel', icon: <FileSpreadsheet size={17} />, separado: true, onSelect: () => setImportando(true) }] : []),
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ cuenta: null })}>Nuevo</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div className="cuentas-metricas">
            <div className="cuentas-metrica">
              <span className="cuentas-metrica__num">{soles(resumen.facturado)}</span>
              <span className="cuentas-metrica__label">Facturado</span>
            </div>
            <div className="cuentas-metrica cuentas-metrica--ambar">
              <span className="cuentas-metrica__num">{soles(resumen.porCobrar)}</span>
              <span className="cuentas-metrica__label">Por cobrar</span>
              {resumen.vencido > 0 && <span className="cuentas-metrica__pie">Vencido {soles(resumen.vencido)} · {resumen.vencidas} {resumen.vencidas === 1 ? 'cuenta' : 'cuentas'}</span>}
            </div>
            <div className="cuentas-metrica cuentas-metrica--verde">
              <span className="cuentas-metrica__num">{soles(resumen.cobrado)}</span>
              <span className="cuentas-metrica__label">Cobrado</span>
            </div>
            <div className="cuentas-metrica">
              <span className="cuentas-metrica__num">{visibles.length}</span>
              <span className="cuentas-metrica__label">Comprobantes</span>
            </div>
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Cliente, factura, liquidación, placa, viaje…" />

          <div className="cuentas-filtros">
            <SegmentedControl<EstadoFiltro> value={estado} onChange={setEstado} options={ESTADO_OPCIONES} label="Estado" />
            <SelectInput value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes de facturación" style={{ width: 'auto' }}>
              <option value="">Todos los meses</option>
              {MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </SelectInput>
            <div className="cuentas-rango">
              <span className="cuentas-rango__etiqueta">Desde</span>
              <TextInput type="date" value={desde} onChange={e => setDesde(e.target.value)} aria-label="Desde" style={{ width: 'auto' }} />
              <span className="cuentas-rango__etiqueta">Hasta</span>
              <TextInput type="date" value={hasta} onChange={e => setHasta(e.target.value)} aria-label="Hasta" style={{ width: 'auto' }} />
            </div>
            {hayFiltros && <Button variant="plain" size="sm" onClick={limpiarFiltros}>Limpiar filtros</Button>}
            <span className="cuentas-filtros__cuenta">{visibles.length} de {lista.length}</span>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <Wallet size={22} />} title={hayFiltros ? 'Sin coincidencias' : 'Sin cuentas por cobrar'}>
              {puedeCrear && !hayFiltros ? <>Registra la primera con <strong>Nuevo</strong> o importa un Excel.</> : 'Prueba con otros filtros.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(c => {
                const t = tonoCuenta(c);
                const e = estadoDe(c);
                const pendiente = e === 'PENDIENTE';
                const monto = pendiente ? num(c.neto_cobrar) : (c.neto_cobrado ?? c.neto_cobrar);
                const texto = e === 'PAGADO' && c.fecha_deposito ? `Pagada el ${formatFechaPe(c.fecha_deposito)}` : textoVencimiento(c);
                const sub = [
                  c.serie && c.factura ? `${c.serie}-${c.factura}` : c.codigo_liquidacion,
                  c.placa_camion,
                  c.fecha_factura ? formatFechaPe(c.fecha_factura) : '',
                  c.nota_credito ? 'con NC' : '',
                ].filter(Boolean).join(' · ');
                return (
                  <button key={c.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbiertoId(c.id); }}>
                    <div className="mov-fila__icon" style={{ background: `var(--${t}-tint)`, color: `var(--${t}-ink)` }}>
                      <FileText size={16} />
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{c.cliente || c.razon_social || 'Sin cliente'}</span>
                      <span className="mov-fila__sub">{sub || '—'}</span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className="mov-fila__monto">{soles(monto)}</span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${t}-ink)` }}>{texto}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <DetalleCuenta
        cuenta={abierta}
        onClose={() => setAbiertoId(null)}
        onEditar={puedeEditar && abierta && estadoDe(abierta) !== 'PAGADO' ? () => setFormulario({ cuenta: abierta }) : undefined}
        onPagar={puedeEditar && abierta && estadoDe(abierta) !== 'ANULADO' ? () => { setPagando(abierta); setAbiertoId(null); } : undefined}
        onRevertir={puedeEditar && abierta && estadoDe(abierta) === 'PAGADO' ? () => volverAPendiente(abierta) : undefined}
        onNotaCredito={puedeEditar && abierta && abierta.serie && abierta.factura ? () => { setNotaCredito(abierta); setAbiertoId(null); } : undefined}
        onEliminar={puedeEliminar && abierta && estadoDe(abierta) !== 'PAGADO' ? () => setPorEliminar(abierta) : undefined}
        onHistorial={() => { if (abierta) setHistorialDe(abierta); }}
      />
      <FormularioCuenta open={!!formulario} cuenta={formulario?.cuenta ?? null} existentes={lista} onClose={() => setFormulario(null)} />
      <ImportarCuentasSheet open={importando} onClose={() => setImportando(false)} existentes={lista} />
      <NotaCreditoSheet cuenta={notaCredito} onClose={() => setNotaCredito(null)} />
      <PagoCuenta cuenta={pagando} onClose={() => setPagando(null)} usuario={user?.name ?? ''} />
      <HistorialNC cuenta={historialDe} onClose={() => setHistorialDe(null)} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title="¿Eliminar este registro?"
        message={porEliminar ? `${porEliminar.cliente ?? porEliminar.razon_social ?? ''} · ${porEliminar.serie ?? ''}-${porEliminar.factura ?? porEliminar.codigo_liquidacion ?? ''}. No se puede recuperar.` : ''}
        confirmLabel="Eliminar" />
    </Page>
  );
}
