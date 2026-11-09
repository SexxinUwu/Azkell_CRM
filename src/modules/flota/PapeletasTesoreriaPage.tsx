import './papeletas.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, ReceiptText, Wallet } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuFila } from '../../core/ui/MenuFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { formatMoneda } from '../../core/lib/format';
import { ESTADO_TONO, ESTADO_TXT, RAIZ_PAPELETAS, entidadTexto, fechaTxt, plazoTxt, proximoPlazo, usePapeletas, type Papeleta } from './pap-api';
import { PapDetalle } from './pap-Detalle';
import { PagoSheet } from './pap-PagoSheet';

type Vista = 'por_pagar' | 'pagadas';
const COLUMNAS: ColumnaTabla[] = [
  { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
  { id: 'cod', titulo: 'Código', ancho: 125 }, { id: 'ent', titulo: 'Entidad', ancho: 130 }, { id: 'num', titulo: 'N° documento', ancho: 140 }, { id: 'placa', titulo: 'Unidad', ancho: 130 },
  { id: 'plazo', titulo: 'Próximo plazo', ancho: 200 }, { id: 'total', titulo: 'Total', ancho: 120, alinear: 'right' }, { id: 'saldo', titulo: 'Saldo', ancho: 120, alinear: 'right' }, { id: 'estado', titulo: 'Estado', ancho: 125, alinear: 'center' },
];

/** Papeletas dentro de Tesorería: lo que hay que pagar (con descuento por pronto pago) y lo ya pagado */
export function PapeletasTesoreriaPage() {
  const q = usePapeletas();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>('por_pagar');
  const [busqueda, setBusqueda] = useState('');
  const [pago, setPago] = useState<Papeleta | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: RAIZ_PAPELETAS });

  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (q.data?.data ?? []).filter(p => (vista === 'pagadas' ? p.pagado > 0 : ['PENDIENTE', 'EN_DESCARGO'].includes(p.estado) && p.saldo > 0)
      && (!t || [p.codigo, p.numero, p.placa, p.conductor_nombre].some(x => String(x ?? '').toUpperCase().includes(t))))
      .sort((a, b) => (Math.min(a.dias_descuento ?? 999, a.dias_pago ?? 999)) - (Math.min(b.dias_descuento ?? 999, b.dias_pago ?? 999)));
  }, [q.data, vista, busqueda]);
  const total = filas.filter(p => p.moneda === 'PEN').reduce((s, p) => s + (vista === 'pagadas' ? p.pagado : p.saldo), 0);

  return (
    <Page wide>
      <header className="pap-cab">
        <div className="pap-cab__titulo"><span className="t-eyebrow">Tesorería</span><h1 className="pap-cab__h1">Papeletas</h1></div>
        <div className="pap-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, N°, placa, conductor…" /></div>
        <SegmentedControl label="Vista" value={vista} onChange={setVista} options={[{ value: 'por_pagar', label: 'Por pagar' }, { value: 'pagadas', label: 'Pagadas' }]} />
      </header>
      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <div className="pap-pagina">
          <p className="pap-resumen"><strong className="t-numeric">{filas.length}</strong> papeletas · {vista === 'pagadas' ? 'pagado' : 'por pagar'} <strong className="t-numeric">{formatMoneda(total, 'PEN')}</strong></p>
          {filas.length === 0 ? <EmptyState icon={<ReceiptText size={22} />} title={vista === 'pagadas' ? 'Aún no hay pagos' : 'Nada por pagar'}>Las papeletas se registran en Flota → Papeletas.</EmptyState> : (
            <TablaRedimensionable id="tesoreria-papeletas" columnas={COLUMNAS} ariaLabel="Papeletas por pagar" altoMax="calc(100dvh - 18rem)">
              {filas.map(p => {
                const pl = proximoPlazo(p);
                return (
                  <tr key={p.id} className="pap-fila" onClick={e => { if (!(e.target as HTMLElement).closest('button,a')) setDetalleId(p.id); }}>
                    <Celda alinear="center"><MenuFila etiqueta={`Acciones de ${p.codigo}`} acciones={[
                      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => setDetalleId(p.id) },
                      p.saldo > 0 && p.estado !== 'ANULADA' && { label: 'Registrar pago', icon: <Wallet size={17} />, onSelect: () => setPago(p) },
                    ]} /></Celda>
                    <Celda mono><strong>{p.codigo}</strong></Celda><Celda>{entidadTexto(p)}</Celda><Celda mono>{p.numero}</Celda><Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                    <Celda>{pl ? <span className={`pap-plazo${pl.dias < 0 ? ' pap-plazo--rojo' : pl.dias <= 3 ? ' pap-plazo--ambar' : ''}`}>{pl.texto} <small>({plazoTxt(pl.dias)})</small></span> : fechaTxt(p.fecha_infraccion)}</Celda>
                    <Celda alinear="right"><strong>{formatMoneda(p.total_vigente, p.moneda)}</strong>{p.descuento_vigente && <small className="pap-desc"> −dto.</small>}</Celda>
                    <Celda alinear="right"><strong className={p.saldo > 0 ? 'pap-ambar' : 'pap-suave'}>{formatMoneda(p.saldo, p.moneda)}</strong></Celda>
                    <Celda alinear="center"><span className={`pap-estado pap-estado--${ESTADO_TONO[p.estado_efectivo]}`}>{ESTADO_TXT[p.estado_efectivo]}</span></Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          )}
        </div>
      )}
      <PapDetalle id={detalleId} onClose={() => setDetalleId(null)} onEditar={() => setDetalleId(null)} onPago={d => setPago(d)} />
      <PagoSheet papeleta={pago} egresoPorDefecto onClose={() => setPago(null)} onHecho={refrescar} />
    </Page>
  );
}
