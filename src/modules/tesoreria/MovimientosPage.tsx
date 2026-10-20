import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, Paperclip, Printer, SearchX, ArrowLeftRight } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { fmtMonto, useBancos, useMovimientos, type MovimientoTesoreria } from './api';

const ESTADOS = ['PROCESADO', 'APROBADO', 'PENDIENTE', 'REGISTRADO', 'PAGADO', 'ANULADO'];
const num = (v: unknown) => Number(v) || 0;
// Fecha peruana dd/mm/aaaa, sin cambio de zona horaria
const dia = (s?: string | null) => { const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const esDolar = (m?: string | null) => /DOL|USD|US\$/i.test(m ?? '');
const dinero = (v: unknown, moneda?: string | null) => `${esDolar(moneda) ? 'US$' : 'S/'} ${fmtMonto(num(v))}`;
const tonoEstado = (e: string) => ({ APROBADO: 'accent', PROCESADO: 'green', PAGADO: 'green', ANULADO: 'neutral', REGISTRADO: 'amber', PENDIENTE: 'amber' }[e] ?? 'neutral');
const limpio = (v: unknown) => { const t = String(v ?? '').trim(); return t === '-' ? '' : t; };
const primerDiaMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
const hoyLima = () => new Date().toLocaleDateString('en-CA');

export function MovimientosPage() {
  const toast = useToast();
  const bancos = useBancos();
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('PROCESADO');
  const [banco, setBanco] = useState('');
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyLima());
  const [abierto, setAbierto] = useState<MovimientoTesoreria | null>(null);

  const { data, isLoading, isError, error } = useMovimientos({ desde, hasta, estado });
  const todos = data ?? [];

  const nombresBanco = useMemo(() => [...new Set((bancos.data ?? []).filter(b => b.estado !== 'INACTIVO').map(b => String(b.banco ?? '').trim()).filter(Boolean))], [bancos.data]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todos.filter(m => {
      if (tipo && m.tipo_movimiento !== tipo) return false;
      if (banco && !String(m.banco_cuenta ?? '').toUpperCase().includes(banco.toUpperCase())) return false;
      if (!q) return true;
      return [m.caja_folio, m.codigo_oc, m.motivo, m.sub_motivo, m.descripcion, m.numero_operacion, m.numero_factura, m.beneficiario, m.solicitante,
        m.autoriza, m.banco_cuenta, m.centro_costo, m.placa, m.orden_viaje, m.estado].join(' ').toLowerCase().includes(q);
    });
  }, [todos, busqueda, tipo, banco]);

  // Lo anulado no cuenta en los totales, y soles y dólares no se mezclan
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

  async function exportar() {
    try {
      await exportarExcel('Movimientos-Tesoreria', 'Movimientos',
        ['Origen', 'Folio / N° OC', 'Fecha', 'Movimiento', 'Moneda', 'Monto', 'Debe', 'Haber', 'Motivo', 'Sub motivo', 'Descripción', 'Banco / cuenta',
          'N° operación', 'N° factura', 'Beneficiario', 'Tipo persona', 'Registró', 'Solicitante', 'Autoriza', 'Fecha aprobación', 'Centro de costos',
          'Placa', 'Orden de viaje', 'Estado'],
        lista.map(m => [m.tipo_origen, m.codigo_oc || m.caja_folio, dia(m.fecha_valuta || m.fecha), m.tipo_movimiento, m.moneda, num(m.monto), num(m.debe), num(m.haber),
          m.motivo, limpio(m.sub_motivo), limpio(m.descripcion), m.banco_cuenta, limpio(m.numero_operacion), limpio(m.numero_factura), limpio(m.beneficiario),
          m.tipo_persona, limpio(m.usuario_creacion), limpio(m.solicitante), limpio(m.autoriza), dia(m.fecha_aprobacion), m.centro_costo,
          limpio(m.placa), limpio(m.orden_viaje), m.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Movimientos"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}${filtrando ? ` de ${todos.length}` : ''}`}
        actions={
          <MenuOtros opciones={[
            { label: 'Exportar Excel', detalle: `${lista.length} movimientos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            { label: 'Imprimir listado', icon: <Printer size={17} />, onSelect: () => window.print() },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="inv-metricas">
          <button type="button" className="inv-metrica pressable" onClick={() => setTipo(t => t === 'INGRESO' ? '' : 'INGRESO')} aria-pressed={tipo === 'INGRESO'}>
            <span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{dinero(resumen.ingSol)}</span>
            {hayDolares && <span className="inv-metrica__label">{dinero(resumen.ingUsd, 'USD')}</span>}
            <span className="inv-metrica__label">Ingresos</span>
          </button>
          <button type="button" className="inv-metrica pressable" onClick={() => setTipo(t => t === 'EGRESO' ? '' : 'EGRESO')} aria-pressed={tipo === 'EGRESO'}>
            <span className="inv-metrica__num inv-metrica__num--critical">{dinero(resumen.egSol)}</span>
            {hayDolares && <span className="inv-metrica__label">{dinero(resumen.egUsd, 'USD')}</span>}
            <span className="inv-metrica__label">Egresos</span>
          </button>
          <div className="inv-metrica">
            <span className="inv-metrica__num" style={{ color: resumen.ingSol - resumen.egSol < 0 ? 'var(--red-ink)' : undefined }}>{dinero(resumen.ingSol - resumen.egSol)}</span>
            {hayDolares && <span className="inv-metrica__label">{dinero(resumen.ingUsd - resumen.egUsd, 'USD')}</span>}
            <span className="inv-metrica__label">Balance neto</span>
          </div>
        </div>

        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Beneficiario, motivo, folio, N° de operación, placa, orden de viaje…" />
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de movimiento" style={{ width: 'auto' }}>
            <option value="">Ingresos y egresos</option>
            <option value="INGRESO">Solo ingresos</option>
            <option value="EGRESO">Solo egresos</option>
          </SelectInput>
          <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
          <SelectInput value={banco} onChange={e => setBanco(e.target.value)} aria-label="Banco o cuenta" style={{ width: 'auto' }}>
            <option value="">Todos los bancos y cajas</option>
            {nombresBanco.map(b => <option key={b} value={b}>{b}</option>)}
            <option value="CAJA">Caja chica</option>
          </SelectInput>
          <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></label>
        </div>

        {isLoading ? <PageLoader /> : isError ? (
          <Notice tone="error">{errorMessage(error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={filtrando ? <SearchX size={22} /> : <ArrowLeftRight size={22} />} title={filtrando ? 'Sin coincidencias' : 'Sin movimientos en este período'}>
            Prueba con otras fechas o con otro estado.
          </EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {lista.map(m => {
              const ingreso = m.tipo_movimiento === 'INGRESO';
              return (
                <button key={m.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setAbierto(m); }}>
                  <div className="mov-fila__icon" style={{ background: ingreso ? 'var(--green-tint)' : 'var(--red-tint)', color: ingreso ? 'var(--green-ink)' : 'var(--red-ink)' }}>
                    {ingreso ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{limpio(m.beneficiario) || limpio(m.sub_motivo) || m.motivo}</span>
                    <span className="mov-fila__sub">{[m.codigo_oc ? `OC ${m.codigo_oc}` : m.caja_folio, m.motivo, limpio(m.sub_motivo), limpio(m.placa), dia(m.fecha_valuta || m.fecha)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto" style={{ color: ingreso ? 'var(--green-ink)' : undefined, textDecoration: m.estado === 'ANULADO' ? 'line-through' : undefined }}>
                      {ingreso ? '+' : '-'}{dinero(m.monto, m.moneda)}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tonoEstado(m.estado)}-ink)` }}>{m.estado}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DetalleMovimiento mov={abierto} onClose={() => setAbierto(null)} />
    </Page>
  );
}

function DetalleMovimiento({ mov: m, onClose }: { mov: MovimientoTesoreria | null; onClose: () => void }) {
  if (!m) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  const fila = (label: string, valor: unknown, mono = false) => {
    const t = limpio(valor);
    return t ? <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{t}</span></div> : null;
  };
  const comprobante = m.voucher_url_presigned || m.voucher_url;
  return (
    <Sheet open onClose={onClose} title={m.codigo_oc ? `OC ${m.codigo_oc}` : `Caja ${m.caja_folio}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div className="inv-metricas">
          <div className="inv-metrica"><span className="inv-metrica__num">{dinero(m.monto, m.moneda)}</span><span className="inv-metrica__label">Monto</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{m.tipo_movimiento}</span><span className="inv-metrica__label">Movimiento</span></div>
          <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1rem' }}>{m.estado}</span><span className="inv-metrica__label">Estado</span></div>
        </div>
        <div className="tarjeta__lista">
          {fila('Origen', m.tipo_origen)}{fila('Fecha de depósito', dia(m.fecha_valuta || m.fecha), true)}{fila('Motivo', [m.motivo, limpio(m.sub_motivo)].filter(Boolean).join(' › '))}
          {fila('Descripción', m.descripcion)}{fila('Beneficiario', [limpio(m.tipo_persona), limpio(m.beneficiario)].filter(Boolean).join(' · '))}
          {fila('Banco / cuenta', m.banco_cuenta)}{fila('N° de operación', m.numero_operacion, true)}{fila('N° de factura', m.numero_factura, true)}
          {fila('Centro de costos', [m.centro_costo, m.centro_costo_nombre].filter(Boolean).join(' · '))}
          {fila('Placa', m.placa, true)}{fila('Orden de viaje', m.orden_viaje, true)}{fila('Ruta', m.ruta)}
          {fila('Registrado por', m.usuario_creacion)}{fila('Solicitante', m.solicitante)}{fila('Autoriza', m.autoriza)}{fila('Fecha de aprobación', dia(m.fecha_aprobacion), true)}
          {fila('Observación', m.observacion)}
        </div>
        {comprobante && (
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <a className="btn btn--secondary btn--sm" href={comprobante} target="_blank" rel="noreferrer"><Paperclip size={14} /> Ver comprobante</a>
          </div>
        )}
      </div>
    </Sheet>
  );
}
