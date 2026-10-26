import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, Boxes, FileSpreadsheet, Plus, SearchX, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { BarraFiltros, GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { useNavigate } from 'react-router-dom';
import { useCaja, type CajaMovimiento } from './api';
import {
  aSoles, CAMPOS_ORDEN, ESTADOS, esPendiente, estadoDe, hoyYMD, inicioMesYMD, montoCaja, num, numeroDoc, ordenar, ORDEN_INICIAL,
  tonoEstado, type Orden,
} from './caja-lib';
import { DetalleCaja } from './caja-detalle';
import { FormularioCaja } from './caja-formulario';

const ENCABEZADOS = [
  'Fecha', 'Hora', 'Estado', 'Movimiento', 'Número', 'Viaje', 'Conductor', 'Ruta', 'Autoriza', 'Placa', 'Centro de costos', 'Motivo',
  'Sub motivo', 'Tipo persona', 'Persona', 'Moneda', 'Importe total', 'TC', 'Modalidad de pago', 'Cuenta destino', 'Cuenta origen',
  'Comprobante', 'N° factura', 'N° constancia', 'Usuario registro', 'Usuario aprobación',
];

// Tesorería › Caja: movimientos de caja chica con aprobación, documentos y anulación
export function CajaPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('');
  // Como el clásico: por defecto el mes en curso
  const [desde, setDesde] = useState(inicioMesYMD);
  const [hasta, setHasta] = useState(hoyYMD);
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const [filtrando, setFiltrando] = useState(false);
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ mov: CajaMovimiento | null } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscar(busqueda.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  const { data, isLoading, isError, error } = useCaja({ desde, hasta, estado, buscar });
  const lista = useMemo(() => ordenar(data ?? [], orden), [data, orden]);
  const abierto = (data ?? []).find(m => m.id === abiertoId) ?? null;
  const puedeCrear = can('tesoreria_caja.crear');
  const periodoPorDefecto = desde === inicioMesYMD() && hasta === hoyYMD();
  const activos = (estado ? 1 : 0) + (periodoPorDefecto ? 0 : 1);
  const filtrado = !!buscar || activos > 0;

  // Ingresos y egresos en soles: los dólares se convierten con su tipo de cambio; los anulados no suman
  const resumen = useMemo(() => {
    const validos = lista.filter(m => estadoDe(m) !== 'ANULADO');
    const ingresos = validos.filter(m => m.tipo_movimiento === 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    const egresos = validos.filter(m => m.tipo_movimiento !== 'INGRESO').reduce((s, m) => s + aSoles(m), 0);
    return { ingresos, egresos, saldo: ingresos - egresos, pendientes: lista.filter(esPendiente).length };
  }, [lista]);

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
      <PageHeader
        eyebrow="Tesorería"
        title="Caja"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} movimientos · ${resumen.pendientes} por aprobar · ${periodo}`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${lista.length} movimientos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Bancos', icon: <Banknote size={17} />, separado: true, onSelect: () => nav('/tesoreria/bancos') },
              { label: 'Centros de costos', icon: <Boxes size={17} />, onSelect: () => nav('/tesoreria/centros-costos') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ mov: null })}>Nuevo</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{formatSoles(resumen.ingresos)}</span><span className="inv-metrica__label">Ingresos</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical">{formatSoles(resumen.egresos)}</span><span className="inv-metrica__label">Egresos</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{formatSoles(resumen.saldo)}</span><span className="inv-metrica__label">Saldo</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num">{resumen.pendientes}</span><span className="inv-metrica__label">Por aprobar</span></div>
        </div>

        <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} placeholder="Persona, motivo, N°, placa, orden de viaje…"
          activos={activos} onAbrirFiltros={() => setFiltrando(true)} />
        <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} resultado={lista.length} unidad="movimiento"
          onLimpiar={() => { setEstado(''); setDesde(inicioMesYMD()); setHasta(hoyYMD()); }}>
          <GrupoFiltro titulo="Estado">
            <ChoiceChips label="Estado" value={estado} onChange={setEstado}
              options={[{ value: '', label: 'Todos' }, ...ESTADOS.map(e => ({ value: e, label: e }))]} />
          </GrupoFiltro>
          <GrupoFiltro titulo="Periodo">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
              <Field label="Desde">
                {p => <TextInput {...p} type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />}
              </Field>
              <Field label="Hasta">
                {p => <TextInput {...p} type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />}
              </Field>
            </div>
          </GrupoFiltro>
          <GrupoFiltro titulo="Ordenar por">
            <ChoiceChips label="Ordenar por" value={orden.campo} onChange={campo => setOrden(o => ({ ...o, campo }))} options={CAMPOS_ORDEN} />
            <ChoiceChips label="Sentido" value={orden.asc ? 'asc' : 'desc'} onChange={s => setOrden(o => ({ ...o, asc: s === 'asc' }))}
              options={[{ value: 'desc', label: 'Descendente' }, { value: 'asc', label: 'Ascendente' }]} />
          </GrupoFiltro>
        </HojaFiltros>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={filtrado ? <SearchX size={22} /> : <Wallet size={22} />}
            title={filtrado ? 'Sin coincidencias' : 'Sin movimientos en este periodo'}>
            {puedeCrear && !filtrado ? <>Registra el primero con <strong>Nuevo</strong>.</> : 'Prueba con otros filtros o un periodo más amplio.'}
          </EmptyState>
        ) : (
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
        )}
      </div>

      <DetalleCaja mov={abierto} onClose={() => setAbiertoId(null)} onEditar={m => setFormulario({ mov: m })} onCambio={refrescar} />
      <FormularioCaja open={!!formulario} mov={formulario?.mov ?? null} onClose={() => setFormulario(null)} onGuardado={refrescar} />
    </Page>
  );
}
