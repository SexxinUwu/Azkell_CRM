import { Boxes, Building2, MapPin, Package, Truck, Warehouse } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { stockTono, type ArticuloInv } from './api';

interface Props {
  items: ArticuloInv[];
  almacenes: string[];
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

/** Pantalla de inicio del inventario: un almacén por tarjeta y el inventario global */
export function InventarioPortal({ items, almacenes, onElegir }: Props) {
  const activos = items.filter(i => i.activo);
  const global = resumen(activos);

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
          const lista = activos.filter(a => a.almacen === nombre);
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

        <article className="inv-alm inv-alm--global">
          <div className="inv-alm__cabecera">
            <span className="inv-alm__icono inv-alm__icono--global"><Boxes size={18} /></span>
            <span className="inv-tag inv-tag--accent">Consolidado</span>
          </div>
          <h3 className="inv-alm__nombre">Todos los almacenes</h3>
          <p className="inv-alm__sub">Vista general combinada de todos los repuestos y suministros del ERP</p>
          <Metricas r={global} />
          <Button variant="secondary" className="inv-alm__boton" onClick={() => onElegir(null)}>
            Gestionar inventario global →
          </Button>
        </article>
      </div>
    </div>
  );
}
