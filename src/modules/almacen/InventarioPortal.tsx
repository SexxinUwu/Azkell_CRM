import { useMemo, useState, type ReactNode, type KeyboardEvent } from 'react';
import { Boxes, Building2, MapPin, Package, TriangleAlert, Truck, Warehouse } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { repartirPorAlmacen, SIN_ALMACEN, stockTono, type ArticuloInv } from './api';

interface Props {
  items: ArticuloInv[];
  /** Solo los almacenes registrados (tabla de almacenes) */
  almacenes: string[];
  /** null = inventario global; SIN_ALMACEN = artículos sin almacén válido */
  onElegir: (almacen: string | null) => void;
}

const ICONOS = [Building2, Truck, MapPin, Package, Warehouse];

interface Resumen { total: number; optimo: number; critico: number }

function resumen(lista: ArticuloInv[]): Resumen {
  return {
    total: lista.length,
    optimo: lista.filter(i => stockTono(i) === 'ok').length,
    critico: lista.filter(i => stockTono(i) === 'critical').length,
  };
}

function Metricas({ r }: { r: Resumen }) {
  return (
    <div className="inv-alm__metricas">
      <div className="inv-alm__metrica">
        <span className="inv-alm__cifra">{r.total}</span>
        <span className="inv-alm__etiqueta">Total</span>
      </div>
      <div className="inv-alm__metrica">
        <span className="inv-alm__cifra inv-alm__cifra--ok">{r.optimo}</span>
        <span className="inv-alm__etiqueta">Óptimo</span>
      </div>
      <div className="inv-alm__metrica">
        <span className="inv-alm__cifra inv-alm__cifra--critical">{r.critico}</span>
        <span className="inv-alm__etiqueta">Crítico</span>
      </div>
    </div>
  );
}

/**
 * Tarjeta de almacén que se voltea: la cara de frente muestra el almacén y sus cifras;
 * la de atrás, la acción. En el teléfono se voltea al tocarla; con mouse, al pasar encima.
 */
function TarjetaAlmacen({ frente, dorso, tono = 'normal' }: { frente: ReactNode; dorso: ReactNode; tono?: 'normal' | 'global' | 'alerta' }) {
  const [volteada, setVolteada] = useState(false);
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setVolteada(v => !v);
    }
  };
  return (
    <div className={`inv-flip inv-flip--${tono}${volteada ? ' inv-flip--volteada' : ''}`}>
      <div className="inv-flip__caja">
        <div
          className="inv-flip__cara inv-flip__cara--frente"
          role="button"
          tabIndex={0}
          aria-pressed={volteada}
          onClick={() => setVolteada(v => !v)}
          onKeyDown={alTeclear}
        >
          {frente}
        </div>
        <div className="inv-flip__cara inv-flip__cara--dorso" aria-hidden={!volteada}>
          {dorso}
        </div>
      </div>
    </div>
  );
}

/** Pantalla de inicio del inventario: un almacén registrado por tarjeta, el inventario global y los artículos sin almacén válido */
export function InventarioPortal({ items, almacenes, onElegir }: Props) {
  const activos = useMemo(() => items.filter(i => i.activo), [items]);
  const { porAlmacen, sinAlmacen } = useMemo(() => repartirPorAlmacen(activos, almacenes), [activos, almacenes]);
  const nombresSinAlmacen = useMemo(
    () => [...new Set(sinAlmacen.map(i => (i.almacen ?? '').trim()).filter(Boolean))],
    [sinAlmacen],
  );

  return (
    <div className="inv-portal">
      <header className="inv-head">
        <div className="inv-head__icono"><Boxes size={22} /></div>
        <div className="inv-head__texto">
          <h2 className="inv-head__titulo">Gestión de almacenes y stock</h2>
          <p className="inv-head__sub">Selecciona el almacén o el inventario central para auditar y operar repuestos en tiempo real</p>
        </div>
        <div className="inv-head__acciones">
          <Button variant="primary" icon={<Boxes size={16} />} onClick={() => onElegir(null)}>Ver inventario global</Button>
        </div>
      </header>

      <div className="inv-portal__grid">
        {almacenes.map((nombre, i) => {
          const Icono = ICONOS[i % ICONOS.length];
          const lista = porAlmacen.get(nombre) ?? [];
          return (
            <TarjetaAlmacen
              key={nombre}
              frente={
                <>
                  <div className="inv-alm__cabecera">
                    <span className={`inv-alm__icono inv-alm__icono--${i % 5}`}><Icono size={18} /></span>
                    <span className="inv-tag">{lista.length} artículos</span>
                  </div>
                  <h3 className="inv-alm__nombre">{nombre}</h3>
                  <Metricas r={resumen(lista)} />
                </>
              }
              dorso={
                <>
                  <span className={`inv-alm__icono inv-alm__icono--${i % 5}`}><Icono size={22} /></span>
                  <h3 className="inv-alm__nombre">{nombre}</h3>
                  <Button variant="primary" className="inv-alm__boton" onClick={() => onElegir(nombre)}>
                    Gestionar inventario →
                  </Button>
                </>
              }
            />
          );
        })}

        {sinAlmacen.length > 0 && (
          <TarjetaAlmacen
            tono="alerta"
            frente={
              <>
                <div className="inv-alm__cabecera">
                  <span className="inv-alm__icono inv-alm__icono--alerta"><TriangleAlert size={18} /></span>
                  <span className="inv-tag inv-tag--alerta">{sinAlmacen.length} artículos</span>
                </div>
                <h3 className="inv-alm__nombre">Sin almacén válido</h3>
                <p className="inv-alm__sub">
                  Sin almacén o con un nombre no registrado
                  {nombresSinAlmacen.length > 0 && <>: {nombresSinAlmacen.map(n => `"${n}"`).join(', ')}</>}.
                </p>
                <Metricas r={resumen(sinAlmacen)} />
              </>
            }
            dorso={
              <>
                <span className="inv-alm__icono inv-alm__icono--alerta"><TriangleAlert size={22} /></span>
                <h3 className="inv-alm__nombre">Sin almacén válido</h3>
                <Button variant="primary" className="inv-alm__boton" onClick={() => onElegir(SIN_ALMACEN)}>
                  Revisar artículos →
                </Button>
              </>
            }
          />
        )}

        <TarjetaAlmacen
          tono="global"
          frente={
            <>
              <div className="inv-alm__cabecera">
                <span className="inv-alm__icono inv-alm__icono--global"><Boxes size={18} /></span>
                <span className="inv-tag inv-tag--accent">Consolidado</span>
              </div>
              <h3 className="inv-alm__nombre">Todos los almacenes</h3>
              <p className="inv-alm__sub">Vista general combinada de todos los repuestos y suministros del ERP</p>
              <Metricas r={resumen(activos)} />
            </>
          }
          dorso={
            <>
              <span className="inv-alm__icono inv-alm__icono--global"><Boxes size={22} /></span>
              <h3 className="inv-alm__nombre">Todos los almacenes</h3>
              <Button variant="primary" className="inv-alm__boton" onClick={() => onElegir(null)}>
                Gestionar inventario global →
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}
