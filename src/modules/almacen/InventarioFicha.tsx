import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { ChevronLeft, Edit, Package, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { stockLabel, stockTono, useKardex, type ArticuloInv } from './api';
import { RegularizarSheet } from './RegularizarSheet';
import { api } from '../../core/api/client';
import { useToast } from '../../core/ui/Toast';
import { imprimirEtiqueta } from './etiquetaArticulo';
import { formatMoneda, formatSoles } from '../../core/lib/format';
import { KardexMovimientos } from './KardexMovimientos';

interface Props {
  articulo: ArticuloInv;
  onVolver?: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
  onActualizado?: () => void;
}

interface DatosLlanta { medida: string | null; modelo: string | null; cocada_inicial: number | null }

/** Campo de la ficha: la etiqueta va encima del valor. Sin valor, no se muestra. */
function Campo({ etiqueta, valor, ancho, children }: { etiqueta: string; valor?: ReactNode; ancho?: 'doble' | 'completo'; children?: ReactNode }) {
  const contenido = children ?? valor;
  if (contenido == null || contenido === '') return null;
  const clase = ancho === 'completo' ? ' inv-campo--completo' : ancho === 'doble' ? ' inv-campo--doble' : '';
  return (
    <div className={`inv-campo${clase}`}>
      <span className="inv-campo__etiqueta">{etiqueta}</span>
      <span className="inv-campo__valor">{contenido}</span>
    </div>
  );
}

/** Código de barras CODE128 del artículo (la etiqueta que se escanea) */
function CodigoBarras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, { format: 'CODE128', width: 2, height: 64, displayValue: true, fontSize: 14, margin: 0 });
    } catch {
      // Un valor que CODE128 no puede codificar deja el recuadro vacío
    }
  }, [valor]);
  return <div className="inv-barcode"><svg ref={ref} className="inv-barcode__svg" /></div>;
}

export function InventarioFicha({ articulo: a, onVolver, onEditar, onEliminar, onActualizado }: Props) {
  const [regularizando, setRegularizando] = useState(false);
  const toast = useToast();
  // Llantas (familia NEUMATICOS): medida, modelo y cocada viven en neumaticos_articulo
  const esLlanta = (a.familia ?? '').trim().toUpperCase() === 'NEUMATICOS';
  const llantaQ = useQuery<{ data?: DatosLlanta | null }>({
    queryKey: ['almacen', 'neumaticos-articulo', a.id],
    queryFn: () => api('/almacen/neumaticos-articulo/' + encodeURIComponent(a.id)),
    enabled: esLlanta,
  });
  const llanta = llantaQ.data?.data;

  const tono = stockTono(a);
  const stock = Number(a.stock_actual);
  const stockTexto = stock % 1 === 0 ? String(stock) : stock.toFixed(2);
  const capacidad = a.stock_max > 0 ? Math.min(100, Math.round((stock / a.stock_max) * 100)) : null;
  const codigoBarra = a.codigo_barras || a.id;

  const { data: kardexData, isLoading: cargandoKardex } = useKardex(a.id);
  const kardex = kardexData?.items;

  let marcasArr: string[] = [];
  try { marcasArr = JSON.parse(a.marca_unidad ?? '[]'); } catch { /* */ }

  return (
    <div className="inv-det">
      {/* Barra superior: título y acciones */}
      <div className="inv-det__barra">
        {onVolver && (
          <button type="button" className="tarjeta__volver" onClick={onVolver}>
            <ChevronLeft size={20} /> Inventario
          </button>
        )}
        <div className="inv-det__titulo">
          <h2 className="inv-det__nombre">{a.articulo || a.descripcion}</h2>
          <span className="inv-det__id">{a.id} • CB: {codigoBarra}</span>
        </div>
        <div className="inv-det__acciones">
          <Button variant="secondary" size="sm" icon={<Printer size={15} />}
            onClick={() => { if (!imprimirEtiqueta(a)) toast('No se pudo abrir la etiqueta. Permite las ventanas emergentes para este sitio.', 'error'); }}>
            Imprimir
          </Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setRegularizando(true)}>Regularizar</Button>
          {onEditar && <Button variant="primary" size="sm" icon={<Edit size={15} />} onClick={onEditar}>Editar</Button>}
          <MenuOtros opciones={[
            { label: 'Regularizar stock', icon: <RefreshCw size={17} />, onSelect: () => setRegularizando(true) },
            onEliminar && { label: 'Eliminar artículo', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: onEliminar },
          ]} />
        </div>
      </div>

      {/* Foto y stock actual */}
      <div className="inv-det__resumen">
        <section className="inv-tarjeta">
          {a.imagen_url
            ? <img src={a.imagen_url} alt={a.articulo} className="inv-det__foto" />
            : <div className="inv-det__foto-vacia"><Package size={28} /></div>}
          <p className="inv-tarjeta__nota">Foto del producto</p>
        </section>

        <section className="inv-tarjeta">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-2)' }}>
            <span className="inv-kpi__etiqueta">Stock físico actual</span>
            <span className={`inv-estado inv-estado--${tono}`}>{stockLabel(a)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
            <span className="inv-det__stock-num">{stockTexto}</span>
            <span className="inv-det__stock-unidad">{a.unidad ?? 'Unidades'}</span>
          </div>
          {capacidad !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
              <div className="inv-det__capacidad-texto">
                <span>Capacidad de almacén</span>
                <span>{capacidad}% ({stockTexto} / {a.stock_max})</span>
              </div>
              <div className="inv-det__capacidad-barra">
                <div className={`inv-det__capacidad-relleno${tono !== 'ok' ? ` inv-det__capacidad-relleno--${tono}` : ''}`} style={{ width: `${capacidad}%` }} />
              </div>
            </div>
          )}
          <p className="inv-tarjeta__nota">Mínimo: {a.stock_min} · Máximo: {a.stock_max}</p>
        </section>
      </div>

      {/* Código de barras y SKU */}
      <section className="inv-tarjeta">
        <h3 className="inv-tarjeta__titulo"><Package size={15} /> Código de barras y SKU</h3>
        <CodigoBarras valor={codigoBarra} />
        <p className="inv-tarjeta__nota" style={{ textAlign: 'center' }}>SKU: {a.id} • CB oficial: {codigoBarra}</p>
      </section>

      {/* Ficha técnica */}
      <section className="inv-tarjeta">
        <h3 className="inv-tarjeta__titulo">Ficha técnica y almacenamiento</h3>
        <div className="inv-campos">
          <Campo etiqueta="Nombre / descripción del artículo" valor={a.descripcion || a.articulo} ancho="completo" />
          <Campo etiqueta="Código interno" valor={a.id} />
          <Campo etiqueta="Código de barra" valor={a.codigo_barras} />
          <Campo etiqueta="Código de parte" valor={a.codigo_articulo} />
          <Campo etiqueta="Código ítem" valor={a.codigo_item} />
          <Campo etiqueta="Familia" valor={a.familia} />
          <Campo etiqueta="Tipo" valor={a.tipo} />
          <Campo etiqueta="Sub-tipo" valor={a.sub_tipo} />
          <Campo etiqueta="Marca" valor={a.marca} />
          <Campo etiqueta="Almacén" valor={a.almacen} />
          <Campo etiqueta="Anaquel / fila" valor={a.anaquel} />
          <Campo etiqueta="Ubicación" valor={a.ubicacion} />
          <Campo etiqueta="Sistema" valor={a.sistema} />
          <Campo etiqueta="Subsistema" valor={a.sub_sistema} />
          <Campo etiqueta="Unidad de medida" valor={a.unidad} />
          <Campo etiqueta="Estado">
            <span className={`inv-estado inv-estado--${a.estado_art === 'Inactivo' ? 'critical' : 'ok'}`}>{a.estado_art ?? 'Activo'}</span>
          </Campo>
          <Campo etiqueta="Stock mínimo" valor={`${a.stock_min} ${a.unidad ?? ''}`.trim()} />
          <Campo etiqueta="Stock máximo" valor={`${a.stock_max} ${a.unidad ?? ''}`.trim()} />
          <Campo etiqueta="Último proveedor (OC / entrada)" valor={a.ultimo_proveedor} ancho="doble" />
          {marcasArr.length > 0 && <Campo etiqueta="Compatible con" valor={marcasArr.join(', ')} ancho="completo" />}
          {esLlanta && <Campo etiqueta="Medida" valor={llanta?.medida} />}
          {esLlanta && <Campo etiqueta="Modelo" valor={llanta?.modelo} />}
          {esLlanta && <Campo etiqueta="Cocada inicial (mm)" valor={llanta?.cocada_inicial} />}
        </div>
      </section>

      {/* Costos */}
      <section className="inv-tarjeta">
        <h3 className="inv-tarjeta__titulo">Costos</h3>
        <div className="inv-campos">
          <Campo etiqueta="Costo referencial (moneda y T/C)" valor={formatMoneda(Number(a.costo_referencial ?? 0), a.moneda)} ancho="doble" />
          {a.moneda === 'USD' && a.tipo_cambio != null && <Campo etiqueta="Tipo de cambio" valor={`S/ ${Number(a.tipo_cambio).toFixed(3)}`} />}
          {a.moneda === 'USD' && <Campo etiqueta="Costo en soles" valor={formatSoles(Number(a.costo_soles ?? 0))} />}
        </div>
      </section>

      {a.observaciones && (
        <section className="inv-tarjeta">
          <h3 className="inv-tarjeta__titulo">Notas</h3>
          <p className="inv-tarjeta__nota" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{a.observaciones}</p>
        </section>
      )}

      {/* Movimientos: el más reciente primero, con saldo desde la última regularización */}
      <section className="inv-tarjeta">
        <h3 className="inv-tarjeta__titulo">Movimientos</h3>
        {cargandoKardex
          ? <p className="inv-tarjeta__nota">Cargando movimientos…</p>
          : <KardexMovimientos items={kardex ?? []} />}
      </section>

      <RegularizarSheet
        open={regularizando}
        articulo={a}
        onClose={() => setRegularizando(false)}
        onGuardado={() => { setRegularizando(false); onActualizado?.(); }}
      />
    </div>
  );
}
