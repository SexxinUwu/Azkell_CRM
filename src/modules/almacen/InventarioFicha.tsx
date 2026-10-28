import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { Edit, MapPin, Package, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { stockTono, useKardex, type ArticuloInv } from './api';
import { RegularizarSheet } from './RegularizarSheet';
import { api } from '../../core/api/client';
import { useToast } from '../../core/ui/Toast';
import { imprimirEtiqueta } from './etiquetaArticulo';
import { formatMoneda, formatSoles } from '../../core/lib/format';
import { KardexMovimientos } from './KardexMovimientos';
import { marcasCompatibles } from './InventarioGrid';

interface Props {
  articulo: ArticuloInv;
  onEditar?: () => void;
  onEliminar?: () => void;
  onActualizado?: () => void;
}

interface DatosLlanta { medida: string | null; modelo: string | null; cocada_inicial: number | null }
type Pestana = 'especificaciones' | 'movimientos';

const ESTADO_TEXTO = { ok: 'Stock óptimo', warning: 'Stock bajo', critical: 'Sin stock' } as const;

/** Casilla de dato: la etiqueta va encima del valor. Sin valor, no se muestra. */
function Dato({ etiqueta, valor, children }: { etiqueta: string; valor?: ReactNode; children?: ReactNode }) {
  const contenido = children ?? valor;
  if (contenido == null || contenido === '') return null;
  return (
    <div className="ficha__dato">
      <span className="ficha__dato-etiqueta">{etiqueta}</span>
      <span className="ficha__dato-valor">{contenido}</span>
    </div>
  );
}

/** Código de barras CODE128 del artículo (la etiqueta que se escanea) */
function CodigoBarras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, { format: 'CODE128', width: 1.6, height: 48, displayValue: true, fontSize: 12, margin: 0 });
    } catch {
      // Un valor que CODE128 no puede codificar deja el recuadro vacío
    }
  }, [valor]);
  return <svg ref={ref} className="ficha__barcode" />;
}

export function InventarioFicha({ articulo: a, onEditar, onEliminar, onActualizado }: Props) {
  const toast = useToast();
  const [regularizando, setRegularizando] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('especificaciones');

  // Llantas (familia NEUMATICOS): medida, modelo y cocada viven en neumaticos_articulo
  const esLlanta = (a.familia ?? '').trim().toUpperCase() === 'NEUMATICOS';
  const llantaQ = useQuery<{ data?: DatosLlanta | null }>({
    queryKey: ['almacen', 'neumaticos-articulo', a.id],
    queryFn: () => api('/almacen/neumaticos-articulo/' + encodeURIComponent(a.id)),
    enabled: esLlanta,
  });
  const llanta = llantaQ.data?.data;

  const { data: kardexData, isLoading: cargandoKardex } = useKardex(a.id);
  const kardex = kardexData?.items ?? [];

  const tono = stockTono(a);
  const stock = Number(a.stock_actual);
  const stockTexto = stock % 1 === 0 ? String(stock) : stock.toFixed(2);
  const unidad = a.unidad ?? 'Unidades';
  const codigoBarra = a.codigo_barras || a.id;
  const marcas = marcasCompatibles(a);
  const ubicacion = [a.ubicacion, a.anaquel ? `Anaquel ${a.anaquel}` : ''].filter(Boolean).join(' • ');

  // Costo promedio ponderado (S/): el último movimiento del kardex lo trae; si no hay movimientos, el referencial
  const ultimo = kardex.length > 0 ? kardex[kardex.length - 1] : null;
  const costoPromedio = ultimo?.costo_promedio ?? (a.moneda === 'USD' ? Number(a.costo_soles ?? 0) : Number(a.costo_referencial ?? 0));
  const valorStock = stock * costoPromedio;
  const pctStock = a.stock_max > 0 ? Math.min(100, Math.round((stock / a.stock_max) * 100)) : 0;

  return (
    <div className="ficha">
      {/* Encabezado: identificación y acciones */}
      <header className="ficha__cabecera">
        <div className="ficha__identidad">
          <div className="ficha__chips">
            {a.familia && <span className="ficha__chip">{a.familia}</span>}
            <span className="ficha__mono">{a.id}</span>
            {a.codigo_articulo && <span className="ficha__mono ficha__mono--acento">Cód. Int. {a.codigo_articulo}</span>}
          </div>
        </div>
        <div className="ficha__acciones">
          <Button variant="secondary" size="sm" icon={<Printer size={15} />}
            onClick={() => { if (!imprimirEtiqueta(a)) toast('No se pudo abrir la etiqueta. Permite las ventanas emergentes para este sitio.', 'error'); }}>
            Imprimir
          </Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setRegularizando(true)}>Regularizar</Button>
          {onEditar && <Button variant="primary" size="sm" icon={<Edit size={15} />} onClick={onEditar}>Editar</Button>}
          <MenuOtros opciones={[
            onEliminar && { label: 'Eliminar artículo', icon: <Trash2 size={17} />, destructiva: true, onSelect: onEliminar },
          ]} />
        </div>
      </header>

      <div className="ficha__cuerpo">
        {/* Columna izquierda: imagen, ubicación y compatibilidad */}
        <aside className="ficha__columna ficha__columna--media">
          <div className="ficha__bloque" style={{ '--i': 0 } as CSSProperties}>
            <div className="ficha__foto">
              <span className={`ficha__estado ficha__estado--${tono}`}>{ESTADO_TEXTO[tono]} ({stockTexto} disp.)</span>
              {a.imagen_url
                ? <img src={a.imagen_url} alt={a.articulo} />
                : <Package size={56} strokeWidth={1.3} />}
            </div>
          </div>

          <div className="ficha__bloque" style={{ '--i': 1 } as CSSProperties}>
            <h3 className="ficha__titulo-bloque"><MapPin size={15} /> Ubicación física</h3>
            <div className="ficha__tres">
              <Dato etiqueta="Almacén" valor={a.almacen || 'Sin almacén'} />
              <Dato etiqueta="Anaquel" valor={a.anaquel} />
              <Dato etiqueta="Ubicación" valor={a.ubicacion} />
            </div>
            {!ubicacion && <p className="ficha__nota">Sin ubicación registrada.</p>}
          </div>

          {marcas.length > 0 && (
            <div className="ficha__bloque" style={{ '--i': 2 } as CSSProperties}>
              <h3 className="ficha__titulo-bloque">Homologado para flota</h3>
              <div className="ficha__chips-wrap">
                {marcas.map(m => <span key={m} className="ficha__chip ficha__chip--check">{m}</span>)}
              </div>
            </div>
          )}

          <div className="ficha__bloque" style={{ '--i': 3 } as CSSProperties}>
            <h3 className="ficha__titulo-bloque">Código de barras</h3>
            <div className="ficha__barras"><CodigoBarras valor={codigoBarra} /></div>
          </div>
        </aside>

        {/* Columna derecha: identidad del producto, costos y pestañas */}
        <section className="ficha__columna ficha__columna--info">
          <div className="ficha__bloque" style={{ '--i': 0 } as CSSProperties}>
            <h2 className="ficha__titulo">{a.descripcion || a.articulo}</h2>
            {a.observaciones && <p className="ficha__descripcion">{a.observaciones}</p>}
          </div>

          <div className="ficha__bloque ficha__costos" style={{ '--i': 1 } as CSSProperties}>
            <div className="ficha__costos-cabecera">
              <span className="ficha__titulo-bloque">Estructura de costos</span>
              <span className="ficha__mono">Costo promedio ponderado</span>
            </div>
            <div className="ficha__costos-grid">
              <div className="ficha__costo">
                <span>Costo referencial</span>
                <strong>{formatMoneda(Number(a.costo_referencial ?? 0), a.moneda)}</strong>
              </div>
              <div className="ficha__costo">
                <span>Costo promedio (S/)</span>
                <strong>{formatSoles(costoPromedio)}</strong>
              </div>
              <div className="ficha__costo ficha__costo--oscuro">
                <span>Valor en stock</span>
                <strong>{formatSoles(valorStock)}</strong>
              </div>
            </div>
            <div className="ficha__stock">
              <div className="ficha__stock-texto">
                <span>Stock actual</span>
                <span><b>{stockTexto}</b> {unidad} · Mín {a.stock_min} · Máx {a.stock_max}</span>
              </div>
              <div className="ficha__barra">
                <div className={`ficha__barra-relleno ficha__barra-relleno--${tono}`} style={{ width: `${pctStock}%` }} />
              </div>
            </div>
          </div>

          <div className="ficha__pestanas" role="tablist" aria-label="Detalle del artículo" style={{ '--i': 2 } as CSSProperties}>
            <button type="button" role="tab" aria-selected={pestana === 'especificaciones'}
              className={`ficha__pestana${pestana === 'especificaciones' ? ' ficha__pestana--activa' : ''}`}
              onClick={() => setPestana('especificaciones')}>Especificaciones</button>
            <button type="button" role="tab" aria-selected={pestana === 'movimientos'}
              className={`ficha__pestana${pestana === 'movimientos' ? ' ficha__pestana--activa' : ''}`}
              onClick={() => setPestana('movimientos')}>Movimientos</button>
          </div>

          {pestana === 'especificaciones' ? (
            <div className="ficha__datos ficha__panel" role="tabpanel">
              <Dato etiqueta="Código interno" valor={a.id} />
              <Dato etiqueta="Código Int." valor={a.codigo_articulo} />
              <Dato etiqueta="Código ítem" valor={a.codigo_item} />
              <Dato etiqueta="Código de barras" valor={a.codigo_barras} />
              <Dato etiqueta="Familia" valor={a.familia} />
              <Dato etiqueta="Tipo" valor={a.tipo} />
              <Dato etiqueta="Sub-tipo" valor={a.sub_tipo} />
              <Dato etiqueta="Sistema" valor={a.sistema} />
              <Dato etiqueta="Subsistema" valor={a.sub_sistema} />
              <Dato etiqueta="Unidad de medida" valor={unidad} />
              <Dato etiqueta="Moneda" valor={a.moneda} />
              <Dato etiqueta="Último proveedor" valor={a.ultimo_proveedor} />
              <Dato etiqueta="Estado">
                <span className={`ficha__estado-chip ficha__estado-chip--${a.estado_art === 'Inactivo' ? 'critical' : 'ok'}`}>{a.estado_art ?? 'Activo'}</span>
              </Dato>
              {esLlanta && <Dato etiqueta="Medida" valor={llanta?.medida} />}
              {esLlanta && <Dato etiqueta="Modelo" valor={llanta?.modelo} />}
              {esLlanta && <Dato etiqueta="Cocada inicial (mm)" valor={llanta?.cocada_inicial} />}
            </div>
          ) : (
            <div className="ficha__panel" role="tabpanel">
              {cargandoKardex
                ? <p className="ficha__nota">Cargando movimientos…</p>
                : <KardexMovimientos items={kardex} />}
            </div>
          )}
        </section>
      </div>

      <RegularizarSheet
        open={regularizando}
        articulo={a}
        onClose={() => setRegularizando(false)}
        onGuardado={() => { setRegularizando(false); onActualizado?.(); }}
      />
    </div>
  );
}
