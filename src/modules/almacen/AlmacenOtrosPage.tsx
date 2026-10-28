import type { ReactNode } from 'react';
import { Boxes, ClipboardCheck, Layers, PackagePlus, Tag, Ruler, Cog, Warehouse, History, PackageCheck, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../../core/ui/Display';
import '../../core/ui/otros-tarjetas.css';

// Otros de Almacén: compras, aprobaciones y catálogos en casillas agrupadas (igual que Mantenimiento).
// Cada casilla abre su pantalla de la versión actual.

interface Casilla {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  ruta: string;
}

const SECCIONES: Array<{ titulo: string; casillas: Casilla[] }> = [
  {
    titulo: 'Compras y aprobaciones',
    casillas: [
      { titulo: 'Proveedores', descripcion: 'Directorio de proveedores para las órdenes de compra.', icono: <Warehouse size={20} />, ruta: '/almacen/proveedores' },
      { titulo: 'Aprobación de O/C', descripcion: 'Aprueba o rechaza las órdenes de compra pendientes.', icono: <ClipboardCheck size={20} />, ruta: '/gerencia/aprobaciones-oc' },
      { titulo: 'Recepción de compras', descripcion: 'Registra la entrada de mercadería recibida de proveedores.', icono: <PackagePlus size={20} />, ruta: '/almacen/recepcion-compras' },
    ],
  },
  {
    titulo: 'Catálogos y configuración',
    casillas: [
      { titulo: 'Familias de productos', descripcion: 'Categorías para clasificar el inventario.', icono: <Layers size={20} />, ruta: '/almacen/familias' },
      { titulo: 'Marcas', descripcion: 'Marcas registradas en el catálogo de almacén.', icono: <Tag size={20} />, ruta: '/almacen/marcas' },
      { titulo: 'Unidades de medida', descripcion: 'Unidades para el manejo de stock (kg, und, lt, etc.).', icono: <Ruler size={20} />, ruta: '/almacen/unidades' },
      { titulo: 'Sistemas del vehículo', descripcion: 'Clasificación de sistemas para repuestos y mantenimiento.', icono: <Cog size={20} />, ruta: '/almacen/sistemas' },
      { titulo: 'Almacenes', descripcion: 'Configuración de bodegas y ubicaciones físicas.', icono: <Warehouse size={20} />, ruta: '/almacen/almacenes' },
      { titulo: 'Inventario completo', descripcion: 'Vista general con todos los artículos y stock actual.', icono: <Boxes size={20} />, ruta: '/almacen/inventario' },
      { titulo: 'Kardex de movimientos', descripcion: 'Historial completo de entradas y salidas por artículo.', icono: <History size={20} />, ruta: '/almacen/kardex' },
      { titulo: 'Configuración de almacén', descripcion: 'Tipo de cambio, marcas de las unidades y cuentas de la empresa.', icono: <Settings2 size={20} />, ruta: '/almacen/configuracion' },
      { titulo: 'Kits MP', descripcion: 'Kits de materiales y repuestos por tipo de servicio.', icono: <PackageCheck size={20} />, ruta: '/mantenimiento/kits-mp' },
    ],
  },
];

export function AlmacenOtrosPage() {
  const navigate = useNavigate();

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Otros"
        subtitle="Compras, aprobaciones y configuración del almacén"
      />
      <div className="otros-panel">
        {SECCIONES.map(s => (
          <section key={s.titulo} className="otros-grupo">
            <h2 className="t-footnote c-secondary" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 var(--s-2)' }}>
              {s.titulo}
            </h2>
            <div className="otros-tarjetas">
              {s.casillas.map(c => (
                <button key={c.titulo} type="button" className="otros-tile" onClick={() => navigate(c.ruta)}>
                  <span className="otros-tile__icono" aria-hidden>{c.icono}</span>
                  <span className="otros-tile__texto">
                    <span className="otros-tile__titulo">{c.titulo}</span>
                    <span className="otros-tile__detalle">{c.descripcion}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
