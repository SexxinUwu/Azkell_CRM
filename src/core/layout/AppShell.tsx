import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, LogOut, Share, SquarePlus, Smartphone, UserRound } from 'lucide-react';
import { useInstallApp } from '../lib/useInstallApp';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../ui/Display';
import { Button, PageLoader } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { BrandMark, Wordmark } from './BrandMark';
import { TabBar } from './TabBar';
import { ConnectionBanner } from './ConnectionBanner';
import { useLiveUpdates } from '../api/live';
import { abrirClasico, findNavItem, homePath, mobileTabs, visibleSections, type NavItem } from './navigation';
import './layout.css';

export function AppShell() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const app = useInstallApp();
  const live = useLiveUpdates(); // cambios de otros dispositivos, al instante
  const sections = visibleSections(can);
  const tabs = mobileTabs(can);
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
  }, [location.pathname]);

  if (!user) return null;
  const tabIndex = tabs.findIndex(t => isActive(t, location.pathname));
  // La lente se queda en "Más" mientras su hoja está abierta o si la pantalla no tiene pestaña propia
  const activeTab = moreOpen || tabIndex < 0 ? tabs.length : tabIndex;

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
          <button type="button" className="nav-item" style={{ width: '100%', marginTop: 'var(--s-1)' }} onClick={logout}>
            <LogOut size={18} strokeWidth={1.9} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
          <Link to={homePath(can)} className="topbar__brand" aria-label="Inicio"><BrandMark size={28} /></Link>
          <div className="topbar__title" aria-hidden>{pageTitle}</div>
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

      <TabBar
        tabs={tabs.map(t => ({ key: t.key, label: shortLabel(t), icon: t.icon, to: t.to! }))}
        activeIndex={activeTab}
        onMore={() => setMoreOpen(true)}
      />

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Todos los módulos">
        {sections.map(section => (
          <div key={section.title} className="more-section">
            <div className="list__header">{section.title}</div>
            <div className="list">
              {section.items.map(item => (
                item.to ? (
                  <NavLink key={item.key} to={item.to} end={item.to === '/'} className="row" style={{ color: 'var(--label)', textDecoration: 'none' }}>
                    <item.icon size={20} strokeWidth={1.8} />
                    <span className="row__main row__title">{item.label}</span>
                  </NavLink>
                ) : (
                  <a key={item.key} href="/" className="row" style={{ color: 'var(--label)', textDecoration: 'none' }} onClick={e => { e.preventDefault(); abrirClasico(item.clasico!); }}>
                    <item.icon size={20} strokeWidth={1.8} />
                    <span className="row__main row__title">{item.label}</span>
                    <ArrowUpRight size={16} className="c-tertiary" aria-label="Se abre en la versión actual" />
                  </a>
                )
              ))}
            </div>
          </div>
        ))}
        <div className="more-section">
          <div className="list">
            {!app.standalone && (app.canPrompt || app.needsIosSteps) && (
              <button type="button" className="row" onClick={() => (app.canPrompt ? app.install() : setIosHelp(true))}>
                <Smartphone size={20} strokeWidth={1.8} />
                <span className="row__main row__title">Instalar app en este teléfono</span>
              </button>
            )}
            <NavLink to="/perfil" className="row" style={{ color: 'var(--label)', textDecoration: 'none' }}>
              <UserRound size={20} strokeWidth={1.8} />
              <span className="row__main row__title">Mi cuenta</span>
            </NavLink>
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

function shortLabel(item: NavItem) {
  const short: Record<string, string> = { inicio: 'Inicio' };
  return short[item.key] ?? item.label;
}
