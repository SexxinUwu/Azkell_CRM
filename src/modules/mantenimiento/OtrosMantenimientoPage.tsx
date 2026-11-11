import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { OtrosHub, type SeccionHub } from '../../core/ui/OtrosHub';
import { OTROS_MANTENIMIENTO } from '../../core/layout/navigation';

// Otros de Mantenimiento: las herramientas avanzadas del taller en casillas grandes agrupadas.

const DESCRIPCION: Record<string, string> = {
  planificacion: 'Programa los mantenimientos preventivos de cada unidad.',
  backlog: 'Trabajos y reportes pendientes de atender en el taller.',
  kpis: 'Indicadores de productividad, tiempos y cumplimiento del taller.',
  productividad: 'Horas y trabajos realizados por cada técnico.',
  'finanzas-taller': 'Costos de repuestos y mano de obra del taller.',
  'frecuencias-mp': 'Cada cuántos kilómetros o días toca cada preventivo.',
  'kits-mp': 'Kits de materiales y repuestos por tipo de servicio.',
  'tipos-mp': 'Tipos de mantenimiento preventivo y sus alertas.',
  'fleetrun-config': 'Umbrales de alerta preventiva por unidad.',
  'config-metrica': 'Metas y métricas que usa el tablero del taller.',
  'personal-taller': 'Técnicos y personal que trabajan en el taller.',
  situaciones: 'Estados de las unidades y de la rampa.',
};

const SECCIONES: Array<{ titulo: string; tono: SeccionHub['tono']; claves: string[] }> = [
  { titulo: 'Programación operativa', tono: 'blue', claves: ['planificacion', 'backlog'] },
  { titulo: 'Rendimiento e indicadores', tono: 'green', claves: ['kpis', 'productividad', 'finanzas-taller'] },
  { titulo: 'Configuración y parámetros', tono: 'violet', claves: ['frecuencias-mp', 'kits-mp', 'tipos-mp', 'fleetrun-config', 'config-metrica', 'personal-taller', 'situaciones'] },
];

export function OtrosMantenimientoPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const visibles = OTROS_MANTENIMIENTO.filter(i => can(...i.permissions));
  const secciones: SeccionHub[] = SECCIONES.map(s => ({
    titulo: s.titulo, tono: s.tono,
    casillas: visibles.filter(i => s.claves.includes(i.key)).map(i => {
      const Icono = i.icon;
      return { key: i.key, titulo: i.label, descripcion: DESCRIPCION[i.key] ?? '', icono: <Icono size={24} />, onAbrir: () => { if (i.to) navigate(i.to); } };
    }),
  }));
  return <OtrosHub eyebrow="Mantenimiento" subtitle="Planificación, indicadores y configuración avanzada del taller" secciones={secciones} />;
}
