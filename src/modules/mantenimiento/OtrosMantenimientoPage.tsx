import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { Page, PageHeader } from '../../core/ui/Display';
import { OTROS_MANTENIMIENTO, type NavItem } from '../../core/layout/navigation';
import '../../core/ui/otros-tarjetas.css';

// Otros de Mantenimiento: las herramientas avanzadas del taller en casillas agrupadas (no en una lista).
// Cada casilla abre su pantalla de la app nueva.

const SECCIONES: Array<{ titulo: string; claves: string[] }> = [
  { titulo: 'Programación operativa', claves: ['planificacion', 'backlog'] },
  { titulo: 'Rendimiento e indicadores', claves: ['kpis', 'productividad', 'finanzas-taller'] },
  { titulo: 'Configuración y parámetros', claves: ['frecuencias-mp', 'kits-mp', 'tipos-mp', 'fleetrun-config', 'config-metrica', 'personal-taller', 'situaciones'] },
];

export function OtrosMantenimientoPage() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const visibles = OTROS_MANTENIMIENTO.filter(i => can(...i.permissions));

  function abrir(i: NavItem) {
    if (i.to) navigate(i.to);
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Otros"
        subtitle="Planificación, indicadores y configuración avanzada del taller"
      />
      <div className="otros-panel">
        {SECCIONES.map(s => {
          const items = visibles.filter(i => s.claves.includes(i.key));
          if (!items.length) return null;
          return (
            <section key={s.titulo} className="otros-grupo">
              <h2 className="t-footnote c-secondary" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 var(--s-2)' }}>
                {s.titulo}
              </h2>
              <div className="otros-tarjetas">
                {items.map(i => {
                  const Icono = i.icon;
                  return (
                    <button key={i.key} type="button" className="otros-tile" onClick={() => abrir(i)}>
                      <span className="otros-tile__icono" aria-hidden><Icono size={20} /></span>
                      <span className="otros-tile__texto">
                        <span className="otros-tile__titulo">{i.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Page>
  );
}
