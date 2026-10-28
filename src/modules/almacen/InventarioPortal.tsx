import { useMemo } from 'react';
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
            <article key={nombre} className="inv-alm">
              <div className="inv-alm__cabecera">
                <span className={`inv-alm__icono inv-alm__icono--${i % 5}`}><Icono size={18} /></span>
                <span className="inv-tag">{lista.length} artículos</span>
              </div>
              <h3 className="inv-alm__nombre">{nombre}</h3>
              <p className="inv-alm__sub">Inventario del almacén {nombre}</p>
              <Metricas r={resumen(lista)} />
              <Button variant="secondary" className="inv-alm__boton" onClick={() => onElegir(nombre)}>
                Gestionar inventario →
              </Button>
            </article>
          );
        })}

        {sinAlmacen.length > 0 && (
          <article className="inv-alm inv-alm--alerta">
            <div className="inv-alm__cabecera">
              <span className="inv-alm__icono inv-alm__icono--alerta"><TriangleAlert size={18} /></span>
              <span className="inv-tag inv-tag--alerta">{sinAlmacen.length} artículos</span>
            </div>
            <h3 className="inv-alm__nombre">Sin almacén válido</h3>
            <p className="inv-alm__sub">
              Artículos sin almacén o con un nombre que no está registrado
              {nombresSinAlmacen.length > 0 && <>: {nombresSinAlmacen.map(n => `"${n}"`).join(', ')}</>}. Corrige su almacén desde la ficha.
            </p>
            <Metricas r={resumen(sinAlmacen)} />
            <Button variant="secondary" className="inv-alm__boton" onClick={() => onElegir(SIN_ALMACEN)}>
              Revisar artículos →
            </Button>
          </article>
        )}

        <article className="inv-alm inv-alm--global">
          <div className="inv-alm__cabecera">
            <span className="inv-alm__icono inv-alm__icono--global"><Boxes size={18} /></span>
            <span className="inv-tag inv-tag--accent">Consolidado</span>
          </div>
          <h3 className="inv-alm__nombre">Todos los almacenes</h3>
          <p className="inv-alm__sub">Vista general combinada de todos los repuestos y suministros del ERP</p>
          <Metricas r={resumen(activos)} />
          <Button variant="secondary" className="inv-alm__boton" onClick={() => onElegir(null)}>
            Gestionar inventario global →
          </Button>
        </article>
      </div>
    </div>
  );
}
