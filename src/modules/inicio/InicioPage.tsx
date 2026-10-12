import { motion } from 'motion/react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { Notice, Page } from '../../core/ui/Display';
import { firstName, formatLongDate, greeting } from '../../core/lib/format';
import { spring } from '../../core/lib/motion';
import { abrirClasico, visibleSections, type NavItem } from '../../core/layout/navigation';
import './inicio.css';

const tile = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...spring, delay: 0.04 * i },
});

// Inicio de la app nueva: saludo y accesos a todos los módulos que la persona puede ver.
// Los indicadores del negocio llegan cuando se migre el Centro de Comando.
export function InicioPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const sections = visibleSections(can)
    .map(s => ({ ...s, items: s.items.filter(i => i.key !== 'inicio') }))
    .filter(s => s.items.length > 0);

  const abrir = (item: NavItem) => (item.to ? navigate(item.to) : abrirClasico(item.clasico!));

  return (
    <Page>
      <motion.header className="inicio-hero" {...tile(0)}>
        <span className="t-eyebrow">{formatLongDate()}</span>
        <h1 className="t-display">{greeting()}, {firstName(user!.name)}.</h1>
        <p className="inicio-hero__subtitle">Así está {user!.companyName} hoy.</p>
      </motion.header>

      <motion.div {...tile(1)} className="inicio-aviso">
        <Notice tone="accent" icon={<Sparkles size={16} />}>
          Estás en la nueva versión de Azkell. Las pantallas marcadas con <ArrowUpRight size={14} style={{ verticalAlign: '-2px' }} /> se
          abren en la versión actual, con tu misma sesión, mientras las migramos.
        </Notice>
      </motion.div>

      <div className="inicio-grid">
        {sections.map((section, i) => (
          <motion.section key={section.title} className="card" {...tile(i + 2)} aria-labelledby={`sec-${i}`}>
            <h2 id={`sec-${i}`} className="card__title">{section.title}</h2>
            <ul className="inicio-accesos">
              {section.items.map(item => (
                <li key={item.key}>
                  <button type="button" className="inicio-acceso pressable" onClick={() => abrir(item)}>
                    <span className="inicio-acceso__icon"><item.icon size={18} strokeWidth={1.9} /></span>
                    <span className="inicio-acceso__label">{item.label}</span>
                    {!item.to && <ArrowUpRight size={14} className="c-tertiary" aria-label="Se abre en la versión actual" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        ))}
      </div>
    </Page>
  );
}
