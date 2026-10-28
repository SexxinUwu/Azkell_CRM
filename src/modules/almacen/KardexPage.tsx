import { useMemo, useState } from 'react';
import './almacen.css';
import { FileSpreadsheet, History, Package, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { useToast } from '../../core/ui/Toast';
import { stockLabel, stockTono, useInventario, useKardex, type ArticuloInv } from './api';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

function fmtQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3);
}

export function KardexPage() {
  const { data: inventario, isLoading, isError, error } = useInventario();
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<ArticuloInv | null>(null);
  const [filtroTabla, setFiltroTabla] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const toast = useToast();

  const { data: kardexData, isLoading: loadingKardex } = useKardex(seleccionado?.id ?? null);
  const kardex = kardexData?.items;
  const stockBase = kardexData?.stockBase ?? null;

  const resultados = useMemo(() => {
    if (!busqueda.trim() || !inventario || seleccionado) return [];
    const q = busqueda.toUpperCase();
    return inventario.filter(a =>
      a.id.toUpperCase().includes(q) ||
      (a.articulo ?? '').toUpperCase().includes(q) ||
      (a.codigo_articulo ?? '').toUpperCase().includes(q) ||
      (a.familia ?? '').toUpperCase().includes(q)
    ).slice(0, 25);
  }, [inventario, busqueda, seleccionado]);

  const movimientosFiltrados = useMemo(() => {
    if (!kardex) return [];
    const q = filtroTabla.toUpperCase();
    return kardex.filter(k => {
      const f = (k.fecha ?? '').split('T')[0];
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      if (!q) return true;
      return (k.documento ?? '').toUpperCase().includes(q) ||
        (k.proveedor_destino ?? '').toUpperCase().includes(q) ||
        (k.observaciones ?? '').toUpperCase().includes(q) ||
        k.tipo.toUpperCase().includes(q);
    });
  }, [kardex, filtroTabla, desde, hasta]);

  async function exportar() {
    if (!seleccionado) return;
    try {
      await exportarExcel(`Kardex-${seleccionado.id}`, 'Kardex',
        ['Fecha', 'Tipo', 'Documento', 'Contraparte / Motivo', 'Entrada', 'Salida', 'Costo unitario', 'Costo promedio', 'Saldo', 'Valor saldo'],
        movimientosFiltrados.map(k => [
          formatFechaPe(k.fecha), k.tipo, k.documento ?? '', k.proveedor_destino ?? k.observaciones ?? '',
          k.tipo !== 'SALIDA' ? k.cantidad : '', k.tipo === 'SALIDA' ? k.cantidad : '', k.costo_unitario ?? '', k.costo_promedio ?? '', k.saldo, k.valor_saldo ?? '',
        ]));
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const kpis = useMemo(() => {
    if (!kardex) return null;
    const totalEntradas = kardex.filter(k => k.tipo === 'ENTRADA').reduce((s, k) => s + k.cantidad, 0);
    const totalSalidas = kardex.filter(k => k.tipo === 'SALIDA').reduce((s, k) => s + k.cantidad, 0);
    const ultimo = kardex.length > 0 ? kardex[kardex.length - 1] : null;
    const saldo = ultimo ? ultimo.saldo : (seleccionado?.stock_actual ?? 0);
    const valor = ultimo?.valor_saldo ?? null;
    return { totalEntradas, totalSalidas, saldo, valor };
  }, [kardex, seleccionado]);

  function seleccionar(a: ArticuloInv) {
    setSeleccionado(a);
    setBusqueda(a.articulo || a.id);
    setFiltroTabla('');
    setDesde(''); setHasta('');
  }

  function limpiar() {
    setSeleccionado(null);
    setBusqueda('');
    setFiltroTabla('');
    setDesde(''); setHasta('');
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Kardex"
        subtitle="Historial de movimientos de stock por artículo"
        actions={
          <MenuOtros opciones={[
            seleccionado && { label: 'Exportar Excel', detalle: `${movimientosFiltrados.length} movimientos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>

          {/* Header del artículo seleccionado o campo de búsqueda */}
          {seleccionado ? (
            <div className="kardex-header">
              <div className="kardex-header__icon"><Package size={20} /></div>
              <div className="kardex-header__info">
                <span className="kardex-header__id">{seleccionado.id}</span>
                <span className="kardex-header__nombre">{seleccionado.articulo || seleccionado.descripcion}</span>
                {seleccionado.familia && (
                  <span className="kardex-header__sub">
                    {seleccionado.familia}{seleccionado.sistema ? ` · ${seleccionado.sistema}` : ''}
                  </span>
                )}
              </div>
              <button type="button" className="kardex-header__limpiar" onClick={limpiar} aria-label="Cambiar artículo">
                ×
              </button>
            </div>
          ) : (
            <SearchField
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar artículo por código, nombre o familia…"
            />
          )}

          {/* Contenido: resultados de búsqueda o kardex del artículo seleccionado */}
          {!seleccionado ? (
            !busqueda ? (
              <EmptyState icon={<History size={22} />} title="Busca un artículo">
                Escribe el código o nombre del artículo para ver su historial de movimientos.
              </EmptyState>
            ) : resultados.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
                <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>
                  Limpiar búsqueda
                </button>
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {resultados.map(a => {
                  const tono = stockTono(a);
                  const colorKey = tono === 'ok' ? 'green' : tono === 'warning' ? 'amber' : 'red';
                  return (
                    <button key={a.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); seleccionar(a); }}>
                      <div className="mov-fila__icon" style={{ background: `var(--${colorKey}-tint)`, color: `var(--${colorKey}-ink)` }}>
                        <Package size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{a.descripcion || a.articulo}</span>
                        <span className="mov-fila__sub">
                          {a.id}{a.familia ? ` · ${a.familia}` : ''}
                        </span>
                      </div>
                      <div className="mov-fila__derecha">
                        <span className="mov-fila__monto">{fmtQty(a.stock_actual)} {a.unidad ?? ''}</span>
                        <span className={`inv-badge inv-badge--${tono}`}>{stockLabel(a)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <>
              {/* KPIs */}
              {kpis && (
                <div className="inv-metricas">
                  <div className="inv-metrica">
                    <span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>+{fmtQty(kpis.totalEntradas)}</span>
                    <span className="inv-metrica__label">Total entradas</span>
                  </div>
                  <div className="inv-metrica">
                    <span className="inv-metrica__num inv-metrica__num--critical">-{fmtQty(kpis.totalSalidas)}</span>
                    <span className="inv-metrica__label">Total salidas</span>
                  </div>
                  <div className="inv-metrica">
                    <span className="inv-metrica__num" style={{ fontSize: '1.375rem' }}>{stockBase === null ? '—' : fmtQty(stockBase)}</span>
                    <span className="inv-metrica__label">Stock de apertura</span>
                  </div>
                  <div className="inv-metrica">
                    <span className="inv-metrica__num" style={{ fontSize: '1.375rem' }}>{formatSoles(kpis.valor)}</span>
                    <span className="inv-metrica__label">Saldo valorizado · {fmtQty(kpis.saldo)} u. al costo promedio</span>
                  </div>
                </div>
              )}

              {loadingKardex ? <PageLoader /> : (
                <>
                  <SearchField
                    value={filtroTabla}
                    onChange={setFiltroTabla}
                    placeholder="Filtrar por documento, contraparte o motivo"
                  />
                  <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                    <label className="aud-fecha"><span>Desde</span>
                      <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
                    </label>
                    <label className="aud-fecha"><span>Hasta</span>
                      <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
                    </label>
                  </div>

                  {movimientosFiltrados.length === 0 ? (
                    <EmptyState icon={<SearchX size={22} />} title={filtroTabla || desde || hasta ? 'Sin coincidencias' : 'Sin movimientos'}>
                      {filtroTabla || desde || hasta ? (
                        <button type="button" className="placas-limpiar" onClick={() => { setFiltroTabla(''); setDesde(''); setHasta(''); }}>
                          Quitar filtro
                        </button>
                      ) : 'Este artículo no tiene movimientos registrados.'}
                    </EmptyState>
                  ) : (
                    <div className="tarjeta__lista kardex-tabla-caja">
                      <table className="inv-kardex kardex-tabla" style={{ minWidth: '42rem' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Documento</th>
                            <th>Contraparte / Motivo</th>
                            <th style={{ textAlign: 'right' }}>Entrada</th>
                            <th style={{ textAlign: 'right' }}>Salida</th>
                            <th style={{ textAlign: 'right' }}>Costo U.</th>
                            <th style={{ textAlign: 'right' }}>Costo prom.</th>
                            <th style={{ textAlign: 'right' }}>Saldo</th>
                            <th style={{ textAlign: 'right' }}>Valor saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimientosFiltrados.map((k, i) => (
                            <tr key={i}>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatFechaPe(k.fecha)}</td>
                              <td>
                                <span className={
                                  k.tipo === 'ENTRADA' ? 'inv-kardex__entrada'
                                  : k.tipo === 'SALIDA' ? 'inv-kardex__salida'
                                  : 'inv-kardex__reg'
                                }>
                                  {k.tipo === 'REGULARIZACION' ? 'REGUL.' : k.tipo}
                                </span>
                              </td>
                              <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                                {k.documento ?? '—'}
                              </td>
                              <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {k.proveedor_destino ?? k.observaciones ?? '—'}
                              </td>
                              <td style={{ textAlign: 'right' }} className={k.tipo !== 'SALIDA' ? 'inv-kardex__entrada' : ''}>
                                {k.tipo !== 'SALIDA' ? `+${fmtQty(k.cantidad)}` : ''}
                              </td>
                              <td style={{ textAlign: 'right' }} className={k.tipo === 'SALIDA' ? 'inv-kardex__salida' : ''}>
                                {k.tipo === 'SALIDA' ? `-${fmtQty(k.cantidad)}` : ''}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                                {formatSoles(k.costo_unitario)}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                                {formatSoles(k.costo_promedio)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtQty(k.saldo)}</td>
                              <td style={{ textAlign: 'right' }}>
                                {formatSoles(k.valor_saldo)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <ul className="kardex-tarjetas" aria-label="Movimientos del kardex">
                        {movimientosFiltrados.map((k, i) => (
                          <li key={i} className="kardex-tarjeta">
                            <div className="kardex-tarjeta__cab">
                              <span className={
                                k.tipo === 'ENTRADA' ? 'inv-kardex__entrada'
                                : k.tipo === 'SALIDA' ? 'inv-kardex__salida'
                                : 'inv-kardex__reg'
                              }>{k.tipo === 'REGULARIZACION' ? 'REGUL.' : k.tipo}</span>
                              <span className="kardex-tarjeta__fecha">{formatFechaPe(k.fecha)}</span>
                            </div>
                            <div className="kardex-tarjeta__detalle">{k.proveedor_destino ?? k.observaciones ?? k.documento ?? '—'}</div>
                            <div className="kardex-tarjeta__cifras">
                              <span>{k.tipo !== 'SALIDA' ? `+${fmtQty(k.cantidad)}` : k.tipo === 'SALIDA' ? `-${fmtQty(k.cantidad)}` : ''}</span>
                              <span>Saldo <b>{fmtQty(k.saldo)}</b></span>
                              <span>{formatSoles(k.valor_saldo)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
