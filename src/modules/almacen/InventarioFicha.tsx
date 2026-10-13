import { useState } from 'react';
import { ChevronLeft, Edit, Package, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { stockLabel, stockTono, useKardex, type ArticuloInv } from './api';
import { RegularizarSheet } from './RegularizarSheet';

interface Props {
  articulo: ArticuloInv;
  onVolver?: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  onActualizado?: () => void;
}

function Dato({ label, valor }: { label: string; valor: string | number | null | undefined }) {
  if (valor == null || valor === '') return null;
  return (
    <div className="dato">
      <span className="dato__label">{label}</span>
      <span className="dato__valor">{valor}</span>
    </div>
  );
}

export function InventarioFicha({ articulo: a, onVolver, onEditar, onEliminar, onActualizado }: Props) {
  const [regularizando, setRegularizando] = useState(false);
  const tono = stockTono(a);

  const { data: kardex } = useKardex(a.id);

  let marcasArr: string[] = [];
  try { marcasArr = JSON.parse(a.marca_unidad ?? '[]'); } catch { /* */ }

  return (
    <div className="inv-ficha">
      {/* Barra superior */}
      <div className="tarjeta__barra">
        {onVolver && (
          <button type="button" className="tarjeta__volver" onClick={onVolver}>
            <ChevronLeft size={20} /> Inventario
          </button>
        )}
        <div className="tarjeta__barra-acciones">
          <MenuOtros opciones={[
            onEditar && { label: 'Editar artículo', icon: <Edit size={17} />, onSelect: onEditar },
            { label: 'Regularizar stock', icon: <RefreshCw size={17} />, onSelect: () => setRegularizando(true) },
            onEliminar && { label: 'Eliminar artículo', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: onEliminar },
          ]} />
          {onEditar && (
            <Button variant="secondary" size="sm" onClick={onEditar}>Editar</Button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="inv-ficha__hero">
        {a.imagen_url
          ? <img src={a.imagen_url} alt={a.articulo} className="inv-ficha__imagen" />
          : <div className="inv-ficha__imagen-vacia"><Package size={28} /></div>
        }
        <span className="inv-ficha__id">{a.id}</span>
        <h2 className="inv-ficha__nombre">{a.articulo || a.descripcion}</h2>
        {a.familia && <span className="inv-ficha__sub">{a.familia}{a.sistema ? ` · ${a.sistema}` : ''}</span>}
      </div>

      {/* Stock grande */}
      <div className="inv-ficha__stock-big">
        <span className={`inv-ficha__stock-num${tono === 'critical' ? ' inv-metrica__num--critical' : tono === 'warning' ? ' inv-metrica__num--warning' : ''}`}>
          {a.stock_actual % 1 === 0 ? a.stock_actual : a.stock_actual.toFixed(3)}
        </span>
        <span className="inv-ficha__stock-label">{a.unidad ?? 'unidades'} en stock</span>
        {a.stock_min > 0 && (
          <span className="inv-ficha__stock-min">Mínimo: {a.stock_min} · Máximo: {a.stock_max}</span>
        )}
        <span className={`inv-badge inv-badge--${tono}`} style={{ marginTop: '0.25rem' }}>{stockLabel(a)}</span>
      </div>

      {/* Datos generales */}
      <div>
        <p className="tarjeta__grupo-titulo">Identificación</p>
        <div className="tarjeta__lista">
          <Dato label="Código artículo" valor={a.codigo_articulo} />
          <Dato label="Código ítem" valor={a.codigo_item} />
          <Dato label="Código de barras" valor={a.codigo_barras} />
          <Dato label="Tipo" valor={a.tipo} />
          <Dato label="Subtipo" valor={a.sub_tipo} />
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Clasificación</p>
        <div className="tarjeta__lista">
          <Dato label="Familia" valor={a.familia} />
          <Dato label="Sistema" valor={a.sistema} />
          <Dato label="Subsistema" valor={a.sub_sistema} />
          <Dato label="Almacén" valor={a.almacen} />
          <Dato label="Ubicación" valor={a.ubicacion} />
          <Dato label="Anaquel" valor={a.anaquel} />
          {marcasArr.length > 0 && <Dato label="Compatible con" valor={marcasArr.join(', ')} />}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Costos</p>
        <div className="tarjeta__lista">
          <Dato label="Costo referencial" valor={`${a.moneda === 'USD' ? 'US$ ' : 'S/ '}${a.costo_referencial?.toFixed(2) ?? '0.00'}`} />
          {a.moneda === 'USD' && a.tipo_cambio && <Dato label="Tipo de cambio" valor={`S/ ${a.tipo_cambio.toFixed(3)}`} />}
          {a.moneda === 'USD' && <Dato label="Costo en soles" valor={`S/ ${a.costo_soles?.toFixed(2) ?? '0.00'}`} />}
          <Dato label="Último proveedor" valor={a.ultimo_proveedor} />
        </div>
      </div>

      {a.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Notas</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{a.observaciones}</span></div>
          </div>
        </div>
      )}

      {/* Kardex reciente */}
      {kardex && kardex.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Últimos movimientos</p>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="inv-kardex">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {kardex.slice(0, 15).map((k, i) => (
                  <tr key={i}>
                    <td>{k.fecha?.split('T')[0] ?? '—'}</td>
                    <td><span className={k.tipo === 'ENTRADA' ? 'inv-kardex__entrada' : 'inv-kardex__salida'}>{k.tipo}</span></td>
                    <td style={{ color: 'var(--label-2)' }}>{k.documento ?? '—'}</td>
                    <td style={{ textAlign: 'right' }} className={k.tipo === 'ENTRADA' ? 'inv-kardex__entrada' : 'inv-kardex__salida'}>
                      {k.tipo === 'ENTRADA' ? '+' : '-'}{Math.abs(k.cantidad)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{k.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RegularizarSheet
        open={regularizando}
        articulo={a}
        onClose={() => setRegularizando(false)}
        onGuardado={() => { setRegularizando(false); onActualizado?.(); }}
      />
    </div>
  );
}
