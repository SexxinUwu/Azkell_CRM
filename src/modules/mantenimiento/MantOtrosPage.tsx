import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, ClipboardList, Disc3, Gauge, History, LayoutDashboard, Route, ScrollText, ShieldCheck, Wrench } from 'lucide-react';
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

export function MantOtrosPage() {
  const nav = useNavigate();

  const operacion: Tarjeta[] = [
    {
      titulo: 'Resumen de taller',
      descripcion: 'Dashboard con KPIs de mantenimiento, OTs activas y alertas.',
      icon: <LayoutDashboard size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/mantenimiento/dashboard'),    },
    {
      titulo: 'Status de rampa',
      descripcion: 'Estado actual de las unidades en taller por bahía y técnico.',
      icon: <Wrench size={20} />,
      color: 'var(--amber-ink)',
      accion: () => nav('/mantenimiento/status-rampa'),    },
    {
      titulo: 'Órdenes de trabajo',
      descripcion: 'Listado de OTs generadas, estado y avance por unidad.',
      icon: <ScrollText size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/mantenimiento/reportes-ot'),    },
    {
      titulo: 'Trabajos de OT',
      descripcion: 'Detalle de trabajos individuales dentro de cada orden.',
      icon: <ClipboardList size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/mantenimiento/trabajos-ot'),    },
  ];

  const preventivo: Tarjeta[] = [
    {
      titulo: 'Mantenimiento preventivo',
      descripcion: 'Calendarización de servicios preventivos por unidad y kilometraje.',
      icon: <History size={20} />,
      color: 'var(--green-ink)',
      accion: () => nav('/mantenimiento/planificacion'),    },
    {
      titulo: 'Fleetrun',
      descripcion: 'Datos de flota: combustible, kilometraje y rendimiento.',
      icon: <Gauge size={20} />,
      color: 'var(--accent)',
      accion: () => nav('/mantenimiento/fleetrun'),    },
    {
      titulo: 'Neumáticos',
      descripcion: 'Control de vida útil, rotaciones y análisis de desgaste.',
      icon: <Disc3 size={20} />,
      color: 'var(--label-2)',
      accion: () => nav('/mantenimiento/neumaticos'),    },
  ];

  const incidencias: Tarjeta[] = [
    {
      titulo: 'Incidencias en ruta',
      descripcion: 'Registro de eventos, accidentes o paradas no planificadas.',
      icon: <Route size={20} />,
      color: 'var(--amber-ink)',
      accion: () => nav('/mantenimiento/incidencias'),    },
    {
      titulo: 'Fallas en ruta',
      descripcion: 'Reportes de fallas mecánicas y eléctricas notificadas por conductores.',
      icon: <AlertTriangle size={20} />,
      color: 'var(--red-ink)',
      accion: () => nav('/mantenimiento/fallas'),    },
    {
      titulo: 'Análisis de inspecciones',
      descripcion: 'Revisión histórica y estadísticas de inspecciones vehiculares.',
      icon: <ShieldCheck size={20} />,
      color: 'var(--accent)',
      accion: () => abrirClasico('mantenimiento/inspecciones'),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Otros módulos"
        subtitle="Herramientas de análisis, prevención e incidentes"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/otros') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Operación de taller
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {operacion.map(c => <CardModulo key={c.titulo} {...c} />)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Preventivo y seguimiento
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {preventivo.map(c => <CardModulo key={c.titulo} {...c} />)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Incidencias y análisis
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {incidencias.map(c => <CardModulo key={c.titulo} {...c} />)}
          </div>
        </div>
      </div>
    </Page>
  );
}
