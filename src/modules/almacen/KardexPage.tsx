import { useMemo, useState } from 'react';
import { ArrowUpRight, History, Package, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { stockLabel, stockTono, useInventario, useKardex, type ArticuloInv } from './api';

function fmtQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3);
}

export function KardexPage() {
  const { data: inventario, isLoading, isError, error } = useInventario();
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<ArticuloInv | null>(null);
  const [filtroTabla, setFiltroTabla] = useState('');

  const { data: kardex, isLoading: loadingKardex } = useKardex(seleccionado?.id ?? null);

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
    if (!filtroTabla) return kardex;
    const q = filtroTabla.toUpperCase();
    return kardex.filter(k =>
      (k.documento ?? '').toUpperCase().includes(q) ||
      (k.proveedor_destino ?? '').toUpperCase().includes(q) ||
      (k.observaciones ?? '').toUpperCase().includes(q) ||
      k.tipo.toUpperCase().includes(q)
    );
  }, [kardex, filtroTabla]);

  const kpis = useMemo(() => {
    if (!kardex) return null;
    const totalEntradas = kardex.filter(k => k.tipo === 'ENTRADA').reduce((s, k) => s + k.cantidad, 0);
    const totalSalidas = kardex.filter(k => k.tipo === 'SALIDA').reduce((s, k) => s + k.cantidad, 0);
    const saldo = kardex.length > 0 ? kardex[kardex.length - 1].saldo : (seleccionado?.stock_actual ?? 0);
    return { totalEntradas, totalSalidas, saldo };
  }, [kardex, seleccionado]);

  function seleccionar(a: ArticuloInv) {
    setSeleccionado(a);
    setBusqueda(a.articulo || a.id);
    setFiltroTabla('');
  }

  function limpiar() {
    setSeleccionado(null);
    setBusqueda('');
    setFiltroTabla('');
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Kardex"
        subtitle="Historial de movimientos de stock por artículo"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/kardex') },
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
                    <button key={a.id} type="button" className="mov-fila" onClick={() => seleccionar(a)}>
                      <div className="mov-fila__icon" style={{ background: `var(--${colorKey}-tint)`, color: `var(--${colorKey}-ink)` }}>
                        <Package size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">{a.articulo || a.descripcion}</span>
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
                    <span className="inv-metrica__num" style={{ fontSize: '1.375rem' }}>{fmtQty(kpis.saldo)}</span>
                    <span className="inv-metrica__label">Saldo actual</span>
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

                  {movimientosFiltrados.length === 0 ? (
                    <EmptyState icon={<SearchX size={22} />} title={filtroTabla ? 'Sin coincidencias' : 'Sin movimientos'}>
                      {filtroTabla ? (
                        <button type="button" className="placas-limpiar" onClick={() => setFiltroTabla('')}>
                          Quitar filtro
                        </button>
                      ) : 'Este artículo no tiene movimientos registrados.'}
                    </EmptyState>
                  ) : (
                    <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
                      <table className="inv-kardex" style={{ minWidth: '42rem' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Documento</th>
                            <th>Contraparte / Motivo</th>
                            <th style={{ textAlign: 'right' }}>Entrada</th>
                            <th style={{ textAlign: 'right' }}>Salida</th>
                            <th style={{ textAlign: 'right' }}>Costo U.</th>
                            <th style={{ textAlign: 'right' }}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimientosFiltrados.map((k, i) => (
                            <tr key={i}>
                              <td style={{ whiteSpace: 'nowrap' }}>{k.fecha?.split('T')[0] ?? '—'}</td>
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
                                {k.costo_unitario != null ? `S/ ${k.costo_unitario.toFixed(2)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtQty(k.saldo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
