import './papeletas.css';
import '../../core/ui/botonesIcono.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertTriangle, Ban, BarChart3, ChevronDown, Clock, Download, Eye, FileDown, FileSpreadsheet, Gavel, Pencil, Plus, ReceiptText, RefreshCw, SlidersHorizontal, TimerReset, Upload, Wallet } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { ChoiceChips } from '../../core/ui/Chips';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { SearchField, TextInput } from '../../core/ui/Field';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { MenuFila } from '../../core/ui/MenuFila';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { BotonTip } from '../../core/ui/BotonTip';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { formatMoneda } from '../../core/lib/format';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import {
  ASUME_TXT, ESTADO_TONO, ESTADO_TXT, RAIZ_PAPELETAS, entidadTexto, fechaTxt, plazoTxt, proximoPlazo, useCatalogosPap, usePapeletas, type Papeleta, type PapeletaDetalle,
} from './pap-api';
import { PapCatalogos } from './pap-Catalogos';
import { PapDetalle } from './pap-Detalle';
import { exportarPapeletasExcel, descargarPlantillaPapeletas } from './pap-excel';
import { PapFormulario } from './pap-Formulario';
import { PapImportar } from './pap-Importar';
import { PagoSheet } from './pap-PagoSheet';
import { abrirPdfReporte } from './pap-pdf';

type Vista = 'lista' | 'unidades' | 'conductores' | 'catalogos';
type Tarjeta = 'todas' | 'por_pagar' | 'urgentes' | 'vencidas' | 'descargo' | 'pagadas' | 'anuladas';
const VISTAS: Array<{ value: Vista; label: string }> = [
  { value: 'lista', label: 'Papeletas' }, { value: 'unidades', label: 'Por unidad' }, { value: 'conductores', label: 'Por conductor' }, { value: 'catalogos', label: 'Catálogos' },
];

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acc', titulo: '', ancho: 64, minimo: 56, alinear: 'center' },
  { id: 'cod', titulo: 'Código', ancho: 125 }, { id: 'fecha', titulo: 'Fecha', ancho: 105 }, { id: 'ent', titulo: 'Entidad', ancho: 130 }, { id: 'num', titulo: 'N° documento', ancho: 140 },
  { id: 'placa', titulo: 'Unidad', ancho: 130 }, { id: 'cond', titulo: 'Conductor', ancho: 200 }, { id: 'inf', titulo: 'Infracción', ancho: 300 },
  { id: 'total', titulo: 'Total', ancho: 120, alinear: 'right' }, { id: 'pag', titulo: 'Pagado', ancho: 115, alinear: 'right' }, { id: 'saldo', titulo: 'Saldo', ancho: 120, alinear: 'right' },
  { id: 'plazo', titulo: 'Próximo plazo', ancho: 200 }, { id: 'estado', titulo: 'Estado', ancho: 125, alinear: 'center' }, { id: 'asume', titulo: 'Asume', ancho: 150 },
];
const COL_UNIDAD: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Unidad', ancho: 140 }, { id: 'emp', titulo: 'Empresa', ancho: 200 }, { id: 'n', titulo: 'Papeletas', ancho: 110, alinear: 'right' }, { id: 'pen', titulo: 'Pendientes', ancho: 110, alinear: 'right' },
  { id: 'rec', titulo: 'Últimos 12 meses', ancho: 150, alinear: 'right' }, { id: 'saldo', titulo: 'Saldo por pagar', ancho: 150, alinear: 'right' }, { id: 'ult', titulo: 'Última', ancho: 110 },
];
const COL_CONDUCTOR: ColumnaTabla[] = [
  { id: 'cond', titulo: 'Conductor', ancho: 260 }, { id: 'dni', titulo: 'DNI', ancho: 110 }, { id: 'n', titulo: 'Papeletas', ancho: 110, alinear: 'right' }, { id: 'rec', titulo: 'Últimos 12 meses', ancho: 150, alinear: 'right' },
  { id: 'pun', titulo: 'Puntos acumulados', ancho: 150, alinear: 'right' }, { id: 'saldo', titulo: 'Saldo por pagar', ancho: 150, alinear: 'right' }, { id: 'ult', titulo: 'Última', ancho: 110 },
];

const urgente = (p: Papeleta) => p.saldo > 0 && ['PENDIENTE', 'EN_DESCARGO'].includes(p.estado) && (p.vencida || (p.descuento_vigente && (p.dias_descuento ?? 99) <= 7) || (p.dias_pago != null && p.dias_pago >= 0 && p.dias_pago <= 7));
const porPagar = (p: Papeleta) => ['PENDIENTE', 'EN_DESCARGO'].includes(p.estado) && p.saldo > 0;
const suma = (lista: Papeleta[], f: (p: Papeleta) => number) => lista.filter(p => p.moneda === 'PEN').reduce((s, p) => s + f(p), 0);
const sumaUsd = (lista: Papeleta[], f: (p: Papeleta) => number) => lista.filter(p => p.moneda === 'USD').reduce((s, p) => s + f(p), 0);
const mesesAtras = (hoy: string, n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };

/** Papeletas de la flota: tablero con cifras que filtran, lista, resumen por unidad y por conductor, y catálogos */
export function PapeletasPage() {
  const q = usePapeletas();
  const cat = useCatalogosPap();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const puedeCrear = can('papeletas.crear');
  const puedeEditar = can('papeletas.crear', 'papeletas.editar');
  const puedePagar = can('papeletas.crear', 'papeletas.editar', 'tesoreria_papeletas.crear', 'tesoreria_caja.crear');

  const [vista, setVista] = useState<Vista>('lista');
  const [busqueda, setBusqueda] = useState('');
  const [tarjeta, setTarjeta] = useState<Tarjeta>('todas');
  const [filtrando, setFiltrando] = useState(false);
  const [entidad, setEntidad] = useState('TODAS');
  const [empresa, setEmpresa] = useState('TODAS');
  const [asume, setAsume] = useState('TODOS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [analisis, setAnalisis] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ papeleta: Papeleta | null } | null>(null);
  const [pago, setPago] = useState<Papeleta | null>(null);
  const [importando, setImportando] = useState(false);

  const hoy = q.data?.hoy ?? new Date().toISOString().slice(0, 10);
  const todas = useMemo(() => q.data?.data ?? [], [q.data]);
  const entidades = cat.data?.entidades ?? [];
  const refrescar = () => qc.invalidateQueries({ queryKey: RAIZ_PAPELETAS });

  const empresas = useMemo(() => [...new Set(todas.map(p => p.empresa_unidad).filter((x): x is string => !!x))].sort(), [todas]);
  const entidadesUsadas = useMemo(() => [...new Set(todas.map(p => p.entidad_codigo))], [todas]);

  // Las tarjetas reaccionan a la búsqueda, la entidad, la empresa, quién asume y las fechas; el estado lo eligen ellas mismas
  const base = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return todas.filter(p =>
      (entidad === 'TODAS' || p.entidad_codigo === entidad) && (empresa === 'TODAS' || p.empresa_unidad === empresa) && (asume === 'TODOS' || p.quien_asume === asume)
      && (!desde || p.fecha_infraccion.slice(0, 10) >= desde) && (!hasta || p.fecha_infraccion.slice(0, 10) <= hasta)
      && (!t || [p.codigo, p.numero, p.placa, p.conductor_nombre, p.conductor_dni, p.infraccion_codigo, p.infraccion_desc, p.entidad_codigo, p.lugar].some(x => String(x ?? '').toUpperCase().includes(t))));
  }, [todas, busqueda, entidad, empresa, asume, desde, hasta]);

  const cifras = useMemo(() => {
    const pp = base.filter(porPagar);
    return {
      todas: base.length,
      por_pagar: { n: pp.length, pen: suma(pp, p => p.saldo), usd: sumaUsd(pp, p => p.saldo) },
      urgentes: base.filter(urgente).length,
      vencidas: base.filter(p => p.vencida && p.saldo > 0).length,
      descargo: base.filter(p => p.estado === 'EN_DESCARGO').length,
      pagadas: { n: base.filter(p => p.estado === 'PAGADA').length, pen: suma(base.filter(p => p.estado === 'PAGADA'), p => p.pagado) },
      anuladas: base.filter(p => p.estado === 'ANULADA').length,
    };
  }, [base]);

  const filas = useMemo(() => base.filter(p => {
    switch (tarjeta) {
      case 'por_pagar': return porPagar(p);
      case 'urgentes': return urgente(p);
      case 'vencidas': return p.vencida && p.saldo > 0;
      case 'descargo': return p.estado === 'EN_DESCARGO';
      case 'pagadas': return p.estado === 'PAGADA';
      case 'anuladas': return p.estado === 'ANULADA';
      default: return true;
    }
  }), [base, tarjeta]);

  const urgentes = useMemo(() => base.filter(urgente).sort((a, b) => Math.min(a.dias_descuento ?? 99, a.dias_pago ?? 99) - Math.min(b.dias_descuento ?? 99, b.dias_pago ?? 99)).slice(0, 3), [base]);

  // Análisis: por entidad (lo que se debe) y por mes (cuántas papeletas)
  const porEntidad = useMemo(() => {
    const m = new Map<string, { n: number; saldo: number }>();
    for (const p of base.filter(x => x.estado !== 'ANULADA')) { const k = entidadTexto(p); const a = m.get(k) ?? { n: 0, saldo: 0 }; a.n++; a.saldo += p.moneda === 'PEN' ? p.saldo : 0; m.set(k, a); }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  }, [base]);
  const porMes = useMemo(() => {
    const meses: Array<{ clave: string; n: number }> = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i, 1); meses.push({ clave: d.toISOString().slice(0, 7), n: 0 }); }
    for (const p of base.filter(x => x.estado !== 'ANULADA')) { const m = meses.find(x => x.clave === p.fecha_infraccion.slice(0, 7)); if (m) m.n++; }
    return meses;
  }, [base, hoy]);

  // Resúmenes
  const porUnidad = useMemo(() => {
    const m = new Map<string, { placa: string; empresa: string | null; n: number; pen: number; rec: number; saldo: number; ult: string }>();
    const corte = mesesAtras(hoy, 12);
    for (const p of base.filter(x => x.estado !== 'ANULADA')) {
      const a = m.get(p.placa) ?? { placa: p.placa, empresa: p.empresa_unidad, n: 0, pen: 0, rec: 0, saldo: 0, ult: '' };
      a.n++; if (porPagar(p)) a.pen++; if (p.fecha_infraccion.slice(0, 10) >= corte) a.rec++; a.saldo += p.moneda === 'PEN' ? p.saldo : 0; if (p.fecha_infraccion > a.ult) a.ult = p.fecha_infraccion;
      m.set(p.placa, a);
    }
    return [...m.values()].sort((a, b) => b.rec - a.rec || b.n - a.n);
  }, [base, hoy]);
  const porConductor = useMemo(() => {
    const m = new Map<string, { nombre: string; dni: string; n: number; rec: number; puntos: number; saldo: number; ult: string }>();
    const corte = mesesAtras(hoy, 12);
    for (const p of base.filter(x => x.estado !== 'ANULADA' && (x.conductor_nombre || x.conductor_dni))) {
      const k = p.conductor_dni || p.conductor_nombre || '';
      const a = m.get(k) ?? { nombre: p.conductor_nombre || '—', dni: p.conductor_dni || '', n: 0, rec: 0, puntos: 0, saldo: 0, ult: '' };
      a.n++; if (p.fecha_infraccion.slice(0, 10) >= corte) { a.rec++; a.puntos += p.puntos ?? 0; } a.saldo += p.moneda === 'PEN' ? p.saldo : 0; if (p.fecha_infraccion > a.ult) a.ult = p.fecha_infraccion;
      m.set(k, a);
    }
    return [...m.values()].sort((a, b) => b.puntos - a.puntos || b.rec - a.rec);
  }, [base, hoy]);

  const activos = (entidad !== 'TODAS' ? 1 : 0) + (empresa !== 'TODAS' ? 1 : 0) + (asume !== 'TODOS' ? 1 : 0) + (desde || hasta ? 1 : 0);
  const abrir = (id: number) => { haptic('selection'); setDetalleId(id); };
  const aviso = (e: unknown) => toast(errorMessage(e), 'error');

  const tarjetas: Array<{ clave: Tarjeta; etiqueta: string; valor: number; sub: string; tono: string; icono: React.ReactNode }> = [
    { clave: 'por_pagar', etiqueta: 'Por pagar', valor: cifras.por_pagar.n, sub: `${formatMoneda(cifras.por_pagar.pen, 'PEN')}${cifras.por_pagar.usd ? ` + ${formatMoneda(cifras.por_pagar.usd, 'USD')}` : ''}`, tono: 'amber', icono: <Wallet size={17} /> },
    { clave: 'urgentes', etiqueta: 'Vencen pronto', valor: cifras.urgentes, sub: 'en 7 días o menos', tono: 'orange', icono: <TimerReset size={17} /> },
    { clave: 'vencidas', etiqueta: 'Vencidas', valor: cifras.vencidas, sub: 'plazo de pago vencido', tono: 'red', icono: <AlertTriangle size={17} /> },
    { clave: 'descargo', etiqueta: 'En descargo', valor: cifras.descargo, sub: 'en trámite', tono: 'blue', icono: <Gavel size={17} /> },
    { clave: 'pagadas', etiqueta: 'Pagadas', valor: cifras.pagadas.n, sub: formatMoneda(cifras.pagadas.pen, 'PEN'), tono: 'green', icono: <ReceiptText size={17} /> },
    { clave: 'anuladas', etiqueta: 'Anuladas', valor: cifras.anuladas, sub: 'sin efecto', tono: 'gray', icono: <Ban size={17} /> },
  ];

  return (
    <Page wide>
      <header className="pap-cab">
        <div className="pap-cab__titulo"><span className="t-eyebrow">Flota</span><h1 className="pap-cab__h1">Papeletas</h1></div>
        <div className="pap-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Código, N°, placa, conductor, infracción…" /></div>
        <SegmentedControl label="Vista" value={vista} onChange={v => { haptic('selection'); setVista(v); }} options={VISTAS} />
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={activos ? `Filtros, ${activos} activos` : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>{activos > 0 && <span className="placas-filtros__n t-numeric">{activos}</span>}
        </Button>
        <div className="pap-cab__acciones">
          <BotonTip tip="Actualizar" className="btn btn--plain btn--icono btn--icono-acento" disabled={q.isFetching} onClick={() => { void refrescar(); }}><RefreshCw size={18} /></BotonTip>
          <MenuFila etiqueta="Más acciones" acciones={[
            { label: 'Exportar a Excel', icon: <Download size={17} />, onSelect: () => { exportarPapeletasExcel(filas).catch(aviso); } },
            { label: 'Reporte en PDF', icon: <FileDown size={17} />, onSelect: () => { abrirPdfReporte(filas, `${ESTADO_FILTRO[tarjeta]}${activos ? ' · con filtros' : ''}`).catch(aviso); } },
            { label: 'Descargar plantilla de Excel', icon: <FileSpreadsheet size={17} />, onSelect: () => { descargarPlantillaPapeletas(entidades).catch(aviso); } },
            puedeCrear && { label: 'Importar desde Excel', icon: <Upload size={17} />, onSelect: () => setImportando(true), separada: true },
          ]} />
          {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ papeleta: null })}>Registrar papeleta</Button>}
        </div>
      </header>

      {q.isLoading ? <PageLoader variante="camion" /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <div className="pap-pagina">
          {vista !== 'catalogos' && (
            <section className="pap-panel" aria-label="Resumen">
              <div className="pap-tiles">
                {tarjetas.map(t => (
                  <button key={t.clave} type="button" className={`pap-tile pap-tile--${t.tono}`} aria-pressed={tarjeta === t.clave}
                    onClick={() => { haptic('selection'); setVista('lista'); setTarjeta(a => (a === t.clave ? 'todas' : t.clave)); }}>
                    <span className="pap-tile__icono" aria-hidden>{t.icono}</span>
                    <span className="pap-tile__txt"><span className="pap-tile__k">{t.etiqueta}</span><span className="pap-tile__v"><AnimatedNumber value={t.valor} className="t-numeric" /><small>{t.sub}</small></span></span>
                  </button>
                ))}
              </div>
              {urgentes.length > 0 && (
                <div className="pap-urgentes" role="status">
                  <AlertTriangle size={15} aria-hidden /><strong>Requieren atención</strong>
                  {urgentes.map(p => {
                    const pl = proximoPlazo(p);
                    return <button key={p.id} type="button" className="pap-urgente" onClick={() => abrir(p.id)}><b className="pap-mono">{p.placa}</b> {pl ? `${pl.tipo === 'descuento' ? 'descuento' : 'pago'} ${plazoTxt(pl.dias)}` : 'vencida'}</button>;
                  })}
                </div>
              )}
              <button type="button" className="pap-analisis-boton" aria-expanded={analisis} onClick={() => setAnalisis(a => !a)}>
                <BarChart3 size={14} aria-hidden /> {analisis ? 'Ocultar análisis' : 'Ver análisis'} <ChevronDown size={14} className={analisis ? 'pap-giro' : undefined} aria-hidden />
              </button>
              {analisis && (
                <motion.div className="pap-graficos" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={spring}>
                  <div className="pap-graf">
                    <h3>Por entidad <em>papeletas · saldo</em></h3>
                    {porEntidad.length === 0 ? <p className="pap-vacio">Sin datos.</p> : porEntidad.map(([nombre, a]) => (
                      <div key={nombre} className="pap-barra"><span>{nombre}</span><i><b style={{ width: `${(a.n / porEntidad[0][1].n) * 100}%` }} /></i><em className="t-numeric">{a.n}{a.saldo > 0 ? ` · ${formatMoneda(a.saldo, 'PEN')}` : ''}</em></div>
                    ))}
                  </div>
                  <div className="pap-graf">
                    <h3>Por mes <em>últimos 12 meses</em></h3>
                    <div className="pap-columnas" role="img" aria-label="Papeletas por mes">
                      {porMes.map(m => { const max = Math.max(1, ...porMes.map(x => x.n)); return <div key={m.clave} title={`${m.clave}: ${m.n}`}><b style={{ height: `${(m.n / max) * 100}%` }} /><span>{m.clave.slice(5)}</span></div>; })}
                    </div>
                  </div>
                </motion.div>
              )}
            </section>
          )}

          {vista === 'lista' && (filas.length === 0 ? (
            <EmptyState icon={<ReceiptText size={22} />} title={todas.length ? 'Ninguna papeleta coincide' : 'Todavía no hay papeletas'}>
              {todas.length ? <button type="button" className="placas-limpiar" onClick={() => { setTarjeta('todas'); setBusqueda(''); setEntidad('TODAS'); setEmpresa('TODAS'); setAsume('TODOS'); setDesde(''); setHasta(''); }}>Quitar filtros</button>
                : <>Registra la primera con <strong>Registrar papeleta</strong>: puedes subir una foto y se leen los datos solos, o cargar tu Excel con <strong>Importar</strong>.</>}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="flota-papeletas" columnas={COLUMNAS} ariaLabel="Papeletas" altoMax="calc(100dvh - 22rem)">
              {filas.map(p => {
                const pl = proximoPlazo(p);
                return (
                  <tr key={p.id} className="pap-fila" onClick={e => { if (!(e.target as HTMLElement).closest('button,a')) abrir(p.id); }}>
                    <Celda alinear="center"><MenuFila etiqueta={`Acciones de ${p.codigo}`} acciones={[
                      { label: 'Ver detalle', icon: <Eye size={17} />, onSelect: () => abrir(p.id) },
                      puedePagar && p.saldo > 0 && p.estado !== 'ANULADA' && { label: 'Registrar pago', icon: <Wallet size={17} />, onSelect: () => setPago(p) },
                      puedeEditar && p.estado !== 'ANULADA' && { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => setFormulario({ papeleta: p }) },
                    ]} /></Celda>
                    <Celda mono><strong>{p.codigo}</strong></Celda><Celda mono>{fechaTxt(p.fecha_infraccion)}</Celda><Celda>{entidadTexto(p)}</Celda><Celda mono>{p.numero}</Celda>
                    <Celda><LicensePlate plate={p.placa} size="sm" /></Celda><Celda>{p.conductor_nombre || '—'}</Celda>
                    <Celda><span className="pap-recorte" title={p.infraccion_desc ?? ''}>{[p.infraccion_codigo, p.infraccion_desc].filter(Boolean).join(' · ') || '—'}</span></Celda>
                    <Celda alinear="right"><strong>{formatMoneda(p.total_vigente, p.moneda)}</strong>{p.descuento_vigente && <small className="pap-desc"> −dto.</small>}</Celda>
                    <Celda alinear="right">{formatMoneda(p.pagado, p.moneda)}</Celda>
                    <Celda alinear="right"><strong className={p.saldo > 0 ? 'pap-ambar' : 'pap-suave'}>{formatMoneda(p.saldo, p.moneda)}</strong></Celda>
                    <Celda>{pl ? <span className={`pap-plazo${pl.dias < 0 ? ' pap-plazo--rojo' : pl.dias <= 3 ? ' pap-plazo--ambar' : ''}`}>{pl.texto} <small>({plazoTxt(pl.dias)})</small></span> : '—'}</Celda>
                    <Celda alinear="center"><span className={`pap-estado pap-estado--${ESTADO_TONO[p.estado_efectivo]}`}>{ESTADO_TXT[p.estado_efectivo]}</span></Celda>
                    <Celda>{ASUME_TXT[p.quien_asume]}</Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          ))}

          {vista === 'unidades' && (
            <TablaRedimensionable id="flota-papeletas-unidades" columnas={COL_UNIDAD} ariaLabel="Papeletas por unidad" altoMax="calc(100dvh - 22rem)">
              {porUnidad.map(u => (
                <tr key={u.placa} className="pap-fila" onClick={() => { setBusqueda(u.placa); setVista('lista'); setTarjeta('todas'); }}>
                  <Celda><LicensePlate plate={u.placa} size="sm" /></Celda><Celda>{u.empresa || '—'}</Celda><Celda alinear="right">{u.n}</Celda>
                  <Celda alinear="right">{u.pen ? <strong className="pap-ambar">{u.pen}</strong> : 0}</Celda>
                  <Celda alinear="right">{u.rec >= 3 ? <strong className="pap-rojo">{u.rec} · reincidente</strong> : u.rec}</Celda>
                  <Celda alinear="right"><strong>{formatMoneda(u.saldo, 'PEN')}</strong></Celda><Celda mono>{fechaTxt(u.ult)}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}

          {vista === 'conductores' && (
            <TablaRedimensionable id="flota-papeletas-conductores" columnas={COL_CONDUCTOR} ariaLabel="Papeletas por conductor" altoMax="calc(100dvh - 22rem)">
              {porConductor.map(c => (
                <tr key={c.dni || c.nombre} className="pap-fila" onClick={() => { setBusqueda(c.dni || c.nombre); setVista('lista'); setTarjeta('todas'); }}>
                  <Celda><strong>{c.nombre}</strong></Celda><Celda mono>{c.dni || '—'}</Celda><Celda alinear="right">{c.n}</Celda>
                  <Celda alinear="right">{c.rec >= 3 ? <strong className="pap-rojo">{c.rec} · reincidente</strong> : c.rec}</Celda>
                  <Celda alinear="right">{c.puntos ? <strong className={c.puntos >= 40 ? 'pap-rojo' : 'pap-ambar'}>{c.puntos}</strong> : 0}</Celda>
                  <Celda alinear="right"><strong>{formatMoneda(c.saldo, 'PEN')}</strong></Celda><Celda mono>{fechaTxt(c.ult)}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}

          {vista === 'catalogos' && <PapCatalogos puedeEditar={puedeEditar} />}
        </div>
      )}

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={() => { setEntidad('TODAS'); setEmpresa('TODAS'); setAsume('TODOS'); setDesde(''); setHasta(''); }} resultado={filas.length} unidad="papeleta">
        <GrupoFiltro titulo="Entidad">
          <ChoiceChips label="Entidad" value={entidad} onChange={setEntidad} options={[{ value: 'TODAS', label: 'Todas' }, ...entidadesUsadas.map(c => ({ value: c, label: entidades.find(e => e.codigo === c)?.nombre.split(' - ')[0] ?? c }))]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Empresa dueña de la unidad">
          <ChoiceChips label="Empresa" value={empresa} onChange={setEmpresa} options={[{ value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e, label: e }))]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Quién asume el pago">
          <ChoiceChips label="Quién asume" value={asume} onChange={setAsume} options={[{ value: 'TODOS', label: 'Todos' }, ...Object.entries(ASUME_TXT).map(([v, l]) => ({ value: v, label: l }))]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Fecha de la infracción">
          <div className="pap-fechas"><TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /><span>a</span><TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></div>
        </GrupoFiltro>
      </HojaFiltros>

      <PapDetalle id={detalleId} onClose={() => setDetalleId(null)}
        onEditar={(d: PapeletaDetalle) => { setDetalleId(null); setFormulario({ papeleta: d }); }} onPago={(d: PapeletaDetalle) => setPago(d)} />
      <PapFormulario abierto={!!formulario} papeleta={formulario?.papeleta ?? null} onClose={() => setFormulario(null)} onHecho={id => { void refrescar(); if (id && !formulario?.papeleta) setDetalleId(id); }} />
      <PagoSheet papeleta={pago} onClose={() => setPago(null)} onHecho={refrescar} />
      <PapImportar abierto={importando} entidades={entidades} onClose={() => setImportando(false)} onHecho={refrescar} />
    </Page>
  );
}

const ESTADO_FILTRO: Record<Tarjeta, string> = {
  todas: 'Todas las papeletas', por_pagar: 'Por pagar', urgentes: 'Vencen pronto', vencidas: 'Vencidas', descargo: 'En descargo', pagadas: 'Pagadas', anuladas: 'Anuladas',
};
// Evita un aviso de importación sin uso si cambia el contenido de la barra
void Clock;
