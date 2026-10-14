import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Banknote, Boxes, ChevronRight, Contact, House, LogOut, MapPin, Palette, Route, Settings, Share, ShieldCheck,
  SquarePlus, Smartphone, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { useInstallApp } from '../lib/useInstallApp';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../ui/Display';
import { Button, PageLoader } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { BrandMark, Wordmark } from './BrandMark';
import { ModuleDock, type DockItem } from './ModuleDock';
import { AccentPicker } from '../ui/AccentPicker';
import { ThemeButton, ThemeSelector } from '../ui/ThemeToggle';
import { ConnectionBanner } from './ConnectionBanner';
import { AsistenteFab } from '../../modules/asistente/components/AsistenteFab';
import { useLiveUpdates } from '../api/live';
import { abrirClasico, findNavItem, homePath, visibleSections, type NavItem, type NavSection } from './navigation';
import './layout.css';

export function AppShell() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false); // hoja de Ajustes
  const [moduloAbierto, setModuloAbierto] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const app = useInstallApp();
  const live = useLiveUpdates(); // cambios de otros dispositivos, al instante
  const sections = visibleSections(can);
  const current = findNavItem(location.pathname);
  const pageTitle = location.pathname === '/perfil' ? 'Mi cuenta'
    : location.pathname.startsWith('/q/') ? 'Unidad'
    : current?.label ?? user?.companyName ?? 'Azkell Fleet';

  // La barra superior se vuelve material translúcido solo cuando hay contenido debajo.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cada pantalla empieza arriba; cierra "Más" al navegar.
  useEffect(() => {
    window.scrollTo(0, 0);
    setMoreOpen(false);
    setModuloAbierto(null);
  }, [location.pathname]);

  if (!user) return null;
  // Barra del celular: Inicio, un botón por módulo (con su nombre) y Ajustes al final.
  // Configuración y Sistema viven en Ajustes.
  const modulos = sections.filter(sec => !SECCIONES_AJUSTES.includes(sec.title))
    .map(sec => ({ ...sec, items: sec.items.filter(i => i.key !== 'inicio') }))
    .filter(sec => sec.items.length > 0);
  const ajustes = sections.filter(sec => SECCIONES_AJUSTES.includes(sec.title));
  const moduloActual = modulos.find(m => m.items.some(i => isActive(i, location.pathname)))?.title;
  const enInicio = location.pathname === '/';
  const dock: DockItem[] = [
    { key: 'inicio', label: 'Inicio', icon: House, active: enInicio && !moreOpen && !moduloAbierto, onSelect: () => navigate(homePath(can)) },
    ...modulos.map(m => ({
      key: m.title, label: etiquetaModulo(m.title), icon: iconoModulo(m.title),
      active: moduloAbierto ? moduloAbierto === m.title : !moreOpen && moduloActual === m.title,
      onSelect: () => { setMoreOpen(false); setModuloAbierto(m.title); },
    })),
    { key: 'ajustes', label: 'Ajustes', icon: Settings, active: moreOpen || location.pathname === '/perfil',
      onSelect: () => { setModuloAbierto(null); setMoreOpen(true); } },
  ];
  const moduloSheet = modulos.find(m => m.title === moduloAbierto);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link to={homePath(can)} className="sidebar__brand">
          <BrandMark size={30} />
          <div>
            <Wordmark />
            <div className="t-caption c-secondary">{user.companyName}</div>
          </div>
        </Link>

        <nav className="sidebar__nav">
          {sections.map(section => (
            <div key={section.title}>
              <div className="nav-section__title">{section.title}</div>
              {section.items.map(item => (
                item.to ? (
                  <NavLink key={item.key} to={item.to} end={item.to === '/'} className="nav-item">
                    <item.icon size={18} strokeWidth={1.9} />
                    {item.label}
                  </NavLink>
                ) : (
                  <a key={item.key} href="/" className="nav-item" onClick={e => { e.preventDefault(); abrirClasico(item.clasico!); }}>
                    <item.icon size={18} strokeWidth={1.9} />
                    {item.label}
                    <ArrowUpRight size={14} className="nav-item__ext" aria-label="Se abre en la versión actual" />
                  </a>
                )
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <NavLink to="/perfil" className="user-chip">
            <Avatar name={user.name} accent />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="user-chip__name">{user.name}</div>
              <div className="user-chip__role">{user.roleName}</div>
            </div>
          </NavLink>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', marginTop: 'var(--s-1)' }}>
            <button type="button" className="nav-item" style={{ flex: 1 }} onClick={logout}>
              <LogOut size={18} strokeWidth={1.9} />
              Cerrar sesión
            </button>
            <ThemeButton />
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
          <Link to={homePath(can)} className="topbar__brand" aria-label="Inicio"><BrandMark size={28} /></Link>
          <div className="topbar__title" aria-hidden>{pageTitle}</div>
          <ThemeButton className="topbar__tema" />
          <Link to="/perfil" className="topbar__avatar" aria-label="Mi cuenta">
            <Avatar name={user.name} size="sm" accent />
          </Link>
        </header>

        <main className="main">
          {/* Pantallas que se descargan aparte: el marco (barras) no se mueve mientras llegan */}
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <ConnectionBanner state={live} />
      <AsistenteFab />

      <ModuleDock items={dock} />

      {/* Lista de pantallas del módulo elegido */}
      <Sheet open={!!moduloSheet} onClose={() => setModuloAbierto(null)} title={moduloSheet?.title ?? ''}>
        {moduloSheet && (
          <div className="modulo-lista">
            {moduloSheet.items.map(item => (
              <FilaModulo key={item.key} item={item} activa={isActive(item, location.pathname)} onNavegar={() => setModuloAbierto(null)} />
            ))}
          </div>
        )}
      </Sheet>

      {/* Ajustes: cuenta, color, instalación y configuración */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Ajustes">
        <NavLink to="/perfil" className="modulo-fila" style={{ marginBottom: 'var(--s-4)' }}>
          <Avatar name={user.name} accent />
          <span className="modulo-fila__texto">
            {user.name}
            <span className="modulo-fila__sub">{user.roleName} · {user.companyName}</span>
          </span>
          <ChevronRight size={18} className="modulo-fila__flecha" />
        </NavLink>

        <div className="more-section">
          <div className="list__header">Apariencia</div>
          <div className="list"><ThemeSelector /></div>
        </div>

        <div className="more-section">
          <div className="list__header"><Palette size={14} style={{ verticalAlign: '-2px' }} /> Color de la app</div>
          <div className="list"><AccentPicker /></div>
        </div>

        {ajustes.map(section => (
          <AjusteSeccion key={section.title} section={section} activa={location.pathname} />
        ))}

        <div className="more-section">
          <div className="list">
            {!app.standalone && (app.canPrompt || app.needsIosSteps) && (
              <button type="button" className="row" onClick={() => (app.canPrompt ? app.install() : setIosHelp(true))}>
                <Smartphone size={20} strokeWidth={1.8} />
                <span className="row__main row__title">Instalar app en este teléfono</span>
              </button>
            )}
            <button type="button" className="row" onClick={logout} style={{ color: 'var(--red-ink)' }}>
              <LogOut size={20} strokeWidth={1.8} />
              <span className="row__main row__title">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Instalar en tu iPhone" footer={<Button variant="primary" onClick={() => setIosHelp(false)}>Entendido</Button>}>
        <ol className="install-steps">
          <li><span className="install-steps__n">1</span><span>Abre Azkell Fleet en <strong>Safari</strong> (no funciona desde otros navegadores).</span></li>
          <li><span className="install-steps__n">2</span><span>Toca el botón <strong>Compartir</strong> <Share size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> de la barra inferior.</span></li>
          <li><span className="install-steps__n">3</span><span>Elige <strong>Añadir a pantalla de inicio</strong> <SquarePlus size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> y toca <strong>Añadir</strong>.</span></li>
        </ol>
      </Sheet>
    </div>
  );
}

function isActive(item: NavItem, pathname: string) {
  if (!item.to) return false;
  return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
}

const SECCIONES_AJUSTES = ['Configuración', 'Sistema'];

const ICONOS_MODULO: Record<string, LucideIcon> = {
  Gerencia: ShieldCheck, Flota: MapPin, Mantenimiento: Wrench, 'Almacén': Boxes, Operaciones: Route,
  Directorio: Contact, 'Tesorería': Banknote, 'Personas y seguridad': Users,
};
const ETIQUETAS_MODULO: Record<string, string> = {
  Mantenimiento: 'Mant.', Operaciones: 'Operac.', 'Personas y seguridad': 'Personas',
};
const iconoModulo = (titulo: string): LucideIcon => ICONOS_MODULO[titulo] ?? Boxes;
const etiquetaModulo = (titulo: string) => ETIQUETAS_MODULO[titulo] ?? titulo;

function FilaModulo({ item, activa, onNavegar }: { item: NavItem; activa: boolean; onNavegar: () => void }) {
  const contenido = (
    <>
      <span className="modulo-fila__icono"><item.icon size={20} strokeWidth={1.9} /></span>
      <span className="modulo-fila__texto">{item.label}</span>
      {item.to
        ? <ChevronRight size={18} className="modulo-fila__flecha" />
        : <ArrowUpRight size={16} className="modulo-fila__flecha" aria-label="Se abre en la versión actual" />}
    </>
  );
  const clase = `modulo-fila${activa ? ' modulo-fila--activa' : ''}`;
  return item.to ? (
    <NavLink to={item.to} end={item.to === '/'} className={clase} onClick={onNavegar}>{contenido}</NavLink>
  ) : (
    <button type="button" className={clase} onClick={() => abrirClasico(item.clasico!)}>{contenido}</button>
  );
}

function AjusteSeccion({ section, activa }: { section: NavSection; activa: string }) {
  return (
    <div className="more-section">
      <div className="list__header">{section.title}</div>
      <div className="list">
        {section.items.map(item => (
          item.to ? (
            <NavLink key={item.key} to={item.to} className="row" style={{ color: 'var(--label)', textDecoration: 'none' }}
              aria-current={isActive(item, activa) ? 'page' : undefined}>
              <item.icon size={20} strokeWidth={1.8} />
              <span className="row__main row__title">{item.label}</span>
            </NavLink>
          ) : (
            <button key={item.key} type="button" className="row" onClick={() => abrirClasico(item.clasico!)}>
              <item.icon size={20} strokeWidth={1.8} />
              <span className="row__main row__title">{item.label}</span>
              <ArrowUpRight size={16} className="c-tertiary" aria-label="Se abre en la versión actual" />
            </button>
          )
        ))}
      </div>
    </div>
  );
}
