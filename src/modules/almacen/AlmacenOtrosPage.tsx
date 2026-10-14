import type { ReactNode } from 'react';
import { ArrowUpRight, Boxes, ClipboardCheck, FileText, Layers, PackagePlus, Tag, Ruler, Cog, Warehouse, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

interface Tarjeta {
  titulo: string;
  descripcion: string;
  icon: ReactNode;
  accion: () => void;
  color?: string;
  esBadge?: string;
}

function CardModulo({ titulo, descripcion, icon, accion, color = 'var(--accent)', esBadge }: Tarjeta): ReactNode {
  return (
    <button
      type="button"
      onClick={accion}
      style={{
        background: 'var(--fill-1)',
        border: '1px solid var(--separator)',
        borderRadius: 14,
        padding: '18px 20px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'box-shadow 0.15s, transform 0.12s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'none';
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--label-1)', marginBottom: 3 }}>
          {titulo}
          {esBadge && (
            <span style={{ marginLeft: 6, fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: 'var(--accent)', color: '#fff', verticalAlign: 'middle' }}>
              {esBadge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', lineHeight: 1.4 }}>{descripcion}</div>
      </div>
    </button>
  );
}

export function AlmacenOtrosPage() {
  const nav = useNavigate();

  const compras: Tarjeta[] = [
    {
      titulo: 'Órdenes de compra',
      descripcion: 'Crea y gestiona requerimientos de compra a proveedores.',
      icon: <FileText size={20} />,
      color: 'var(--accent)',
      accion: () => abrirClasico('almacen/ordenes-compra'),
    },
    {
      titulo: 'Aprobación de O/C',
      descripcion: 'Aprueba o rechaza las órdenes de compra pendientes.',
      icon: <ClipboardCheck size={20} />,
      color: 'var(--green-ink)',
      accion: () => abrirClasico('gerencia/aprobaciones-oc'),
    },
    {
      titulo: 'Recepción de compras',
      descripcion: 'Registra la entrada de mercadería recibida de proveedores.',
      icon: <PackagePlus size={20} />,
      color: 'var(--amber-ink)',
      accion: () => nav('/almacen/recepcion-compras'),
      esBadge: 'Nuevo',
    },
  ];

  const catalogos: Tarjeta[] = [
    {
      titulo: 'Familias de productos',
      descripcion: 'Categorías para clasificar el inventario.',
      icon: <Layers size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/familias'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Marcas',
      descripcion: 'Marcas registradas en el catálogo de almacén.',
      icon: <Tag size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/marcas'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Unidades de medida',
      descripcion: 'Unidades para el manejo de stock (kg, und, lt, etc.).',
      icon: <Ruler size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/unidades'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Sistemas del vehículo',
      descripcion: 'Clasificación de sistemas para repuestos y mantenimiento.',
      icon: <Cog size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/sistemas'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Almacenes',
      descripcion: 'Configuración de bodegas y ubicaciones físicas.',
      icon: <Warehouse size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/almacenes'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Inventario completo',
      descripcion: 'Vista general con todos los artículos y stock actual.',
      icon: <Boxes size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/almacen/inventario'),
      esBadge: 'Nuevo',
    },
    {
      titulo: 'Kardex de movimientos',
      descripcion: 'Historial completo de entradas y salidas por artículo.',
      icon: <History size={20} />,
      color: 'var(--label-2)',
      accion: () => nav('/almacen/kardex'),
      esBadge: 'Nuevo',
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Otros módulos"
        subtitle="Compras, aprobaciones y configuración del almacén"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/otros') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Sección compras */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Compras y aprobaciones
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {compras.map(c => <CardModulo key={c.titulo} {...c} />)}
          </div>
        </div>

        {/* Sección catálogos */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Catálogos y configuración
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {catalogos.map(c => <CardModulo key={c.titulo} {...c} />)}
          </div>
        </div>
      </div>
    </Page>
  );
}
