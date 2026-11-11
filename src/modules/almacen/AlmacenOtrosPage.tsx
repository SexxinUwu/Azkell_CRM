import type { ReactNode } from 'react';
import { Boxes, ClipboardCheck, Layers, PackagePlus, Tag, Ruler, Cog, Warehouse, History, PackageCheck, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { OtrosHub, type SeccionHub } from '../../core/ui/OtrosHub';

// Otros de Almacén: compras, aprobaciones y catálogos en casillas agrupadas (igual que Mantenimiento).
// Cada casilla abre su pantalla de la versión actual.

interface Casilla {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  ruta: string;
  /** Permisos que dan acceso a la pantalla (con uno basta) */
  permisos: string[];
}

const CAT = ['almacen_otros.ver', 'inv.ver'];
const SECCIONES: Array<{ titulo: string; casillas: Casilla[] }> = [
  {
    titulo: 'Compras y aprobaciones',
    casillas: [
      { titulo: 'Proveedores', descripcion: 'Directorio de proveedores para las órdenes de compra.', icono: <Warehouse size={24} />, ruta: '/almacen/proveedores', permisos: ['prov_inv.ver'] },
      { titulo: 'Aprobación de O/C', descripcion: 'Aprueba o rechaza las órdenes de compra pendientes.', icono: <ClipboardCheck size={24} />, ruta: '/gerencia/aprobaciones-oc', permisos: ['gerencia_aprobaciones_oc.ver'] },
      { titulo: 'Recepción de compras', descripcion: 'Registra la entrada de mercadería recibida de proveedores.', icono: <PackagePlus size={24} />, ruta: '/almacen/recepcion-compras', permisos: ['rec_compras.ver', 'ent_inv.ver', 'inv.ver'] },
    ],
  },
  {
    titulo: 'Catálogos y configuración',
    casillas: [
      { titulo: 'Familias de productos', descripcion: 'Categorías para clasificar el inventario.', icono: <Layers size={24} />, ruta: '/almacen/familias', permisos: CAT },
      { titulo: 'Marcas', descripcion: 'Marcas registradas en el catálogo de almacén.', icono: <Tag size={24} />, ruta: '/almacen/marcas', permisos: CAT },
      { titulo: 'Unidades de medida', descripcion: 'Unidades para el manejo de stock (kg, und, lt, etc.).', icono: <Ruler size={24} />, ruta: '/almacen/unidades', permisos: CAT },
      { titulo: 'Sistemas del vehículo', descripcion: 'Clasificación de sistemas para repuestos y mantenimiento.', icono: <Cog size={24} />, ruta: '/almacen/sistemas', permisos: CAT },
      { titulo: 'Almacenes', descripcion: 'Configuración de bodegas y ubicaciones físicas.', icono: <Warehouse size={24} />, ruta: '/almacen/almacenes', permisos: CAT },
      { titulo: 'Inventario completo', descripcion: 'Vista general con todos los artículos y stock actual.', icono: <Boxes size={24} />, ruta: '/almacen/inventario', permisos: ['inv.ver'] },
      { titulo: 'Kardex de movimientos', descripcion: 'Historial completo de entradas y salidas por artículo.', icono: <History size={24} />, ruta: '/almacen/kardex', permisos: ['kardex.ver'] },
      { titulo: 'Configuración de almacén', descripcion: 'Tipo de cambio, marcas de las unidades y cuentas de la empresa.', icono: <Settings2 size={24} />, ruta: '/almacen/configuracion', permisos: [...CAT, 'ent_inv.ver', 'sal_inv.ver'] },
      { titulo: 'Kits MP', descripcion: 'Kits de materiales y repuestos por tipo de servicio.', icono: <PackageCheck size={24} />, ruta: '/mantenimiento/kits-mp', permisos: ['cfg_mant.ver'] },
    ],
  },
];

const TONOS: Record<string, SeccionHub['tono']> = { 'Compras y aprobaciones': 'green', 'Catálogos y configuración': 'blue' };

export function AlmacenOtrosPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const secciones: SeccionHub[] = SECCIONES.map(s => ({
    titulo: s.titulo, tono: TONOS[s.titulo] ?? 'blue',
    casillas: s.casillas.filter(c => can(...c.permisos)).map(c => ({ key: c.ruta, titulo: c.titulo, descripcion: c.descripcion, icono: c.icono, onAbrir: () => navigate(c.ruta) })),
  }));
  return <OtrosHub eyebrow="Almacén" subtitle="Compras, aprobaciones y configuración del almacén" secciones={secciones} />;
}
