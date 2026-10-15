import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Banknote, Boxes, ChevronDown, ChevronRight, Contact, IdCard, House, LogOut, Palette, PanelLeftClose, PanelLeftOpen, Route, Settings, Share, ShieldCheck, Truck,
  SquarePlus, Smartphone, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { useInstallApp } from '../lib/useInstallApp';
import { useAuth } from '../auth/AuthProvider';
import { AvatarPropio } from '../../modules/perfil/AvatarPropio';
import { Button, PageLoader } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { BrandMark, Wordmark } from './BrandMark';
import { ModuleDock, type DockItem } from './ModuleDock';
import { AccentPicker } from '../ui/AccentPicker';
import { ThemeButton, ThemeSelector } from '../ui/ThemeToggle';
import { ConnectionBanner } from './ConnectionBanner';
import { AsistenteFab } from '../../modules/asistente/components/AsistenteFab';
import { useLiveUpdates } from '../api/live';
import { useNavBadges } from './useNavBadges';
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
  // Barra lateral fijada abierta (escritorio). Se recuerda en este navegador.
  const [menuFijo, setMenuFijo] = useState(() => { try { return localStorage.getItem('fleet_nav_fijo') === '1'; } catch { return false; } });
  const alternarMenuFijo = () => setMenuFijo(v => { const nv = !v; try { localStorage.setItem('fleet_nav_fijo', nv ? '1' : '0'); } catch { /* nada */ } return nv; });
  const app = useInstallApp();
  const live = useLiveUpdates(); // cambios de otros dispositivos, al instante
  const sections = visibleSections(can);
  const contador = useNavBadges(can('gerencia.ver'));
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
  const modulos = sections.filter(sec => !SECCIONES_AJUSTES.includes(sec.title) && sec.title !== SECCION_INICIO)
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
      <aside className={`sidebar${menuFijo ? ' sidebar--fijo' : ''}`} aria-label="Navegación principal">
      <div className="sidebar__panel">
        <Link to={homePath(can)} className="sidebar__brand">
          <BrandMark size={30} />
          <div className="sidebar__texto">
            <Wordmark />
            <div className="t-caption c-secondary">{user.companyName}</div>
          </div>
        </Link>

        <nav className="sidebar__nav">
          {sections.map(section => (
            <div key={section.title}>
              <div className="nav-section__title sidebar__texto">{section.title}</div>
              {section.items.map(item => (
                <NavEscritorio key={item.key} item={item} pathname={location.pathname} contador={contador} />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <NavLink to="/perfil" className="user-chip">
            <AvatarPropio name={user.name} accent />
            <div className="sidebar__texto" style={{ minWidth: 0, flex: 1 }}>
              <div className="user-chip__name">{user.name}</div>
              <div className="user-chip__role">{user.roleName}</div>
            </div>
          </NavLink>
          <div className="sidebar__acciones">
            <button type="button" className="nav-item" onClick={alternarMenuFijo} aria-pressed={menuFijo}>
              {menuFijo ? <PanelLeftClose size={18} strokeWidth={1.9} /> : <PanelLeftOpen size={18} strokeWidth={1.9} />}
              <span className="sidebar__texto">{menuFijo ? 'Contraer menú' : 'Fijar menú abierto'}</span>
            </button>
            <button type="button" className="nav-item" onClick={logout}>
              <LogOut size={18} strokeWidth={1.9} />
              <span className="sidebar__texto">Cerrar sesión</span>
            </button>
            <ThemeButton className="nav-item sidebar__tema" />
          </div>
        </div>
      </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
          <Link to={homePath(can)} className="topbar__brand" aria-label="Inicio"><BrandMark size={28} /></Link>
          <div className="topbar__title" aria-hidden>{pageTitle}</div>
          <ThemeButton className="topbar__tema" />
          <Link to="/perfil" className="topbar__avatar" aria-label="Mi cuenta">
            <AvatarPropio name={user.name} size="sm" accent />
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
            <ListaModulo items={moduloSheet.items} pathname={location.pathname} contador={contador} onNavegar={() => setModuloAbierto(null)} />
          </div>
        )}
      </Sheet>

      {/* Ajustes: cuenta, color, instalación y configuración */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Ajustes">
        <NavLink to="/perfil" className="modulo-fila" style={{ marginBottom: 'var(--s-4)' }}>
          <AvatarPropio name={user.name} accent />
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
          <AjusteSeccion key={section.title} section={section} activa={location.pathname} contador={contador} />
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

const SECCIONES_AJUSTES = ['Configuración'];
// El inicio ya está en la barra inferior (Inicio), así que su sección no genera un botón aparte
const SECCION_INICIO = 'Dashboard';

const ICONOS_MODULO: Record<string, LucideIcon> = {
  Operaciones: Route, 'Operaciones Marsisa': Route, Flota: Truck, Mantenimiento: Wrench, 'Almacén': Boxes,
  Gerencia: ShieldCheck, RRHH: Users, 'Tesorería': Banknote, Conductor: IdCard, Seguridad: ShieldCheck, Directorio: Contact,
};
const iconoModulo = (titulo: string): LucideIcon => ICONOS_MODULO[titulo] ?? Boxes;
// El nombre del módulo va completo, tal cual aparece en el menú
const etiquetaModulo = (titulo: string) => titulo;

type Contador = Record<string, number>;

function Insignia({ item, contador, className }: { item: NavItem; contador: Contador; className: string }) {
  const n = item.badge ? (contador[item.badge] ?? 0) : 0;
  return n > 0 ? <span className={className}>{n}</span> : null;
}

// Escritorio: un enlace, una opción con destino en la versión actual, un grupo desplegable o una opción "Pronto"
function NavEscritorio({ item, pathname, contador }: { item: NavItem; pathname: string; contador: Contador }) {
  const hayActivo = !!item.children?.some(c => isActive(c, pathname));
  const [abierto, setAbierto] = useState(hayActivo);
  useEffect(() => { if (hayActivo) setAbierto(true); }, [hayActivo]);

  if (item.children) {
    return (
      <div className="nav-grupo">
        <button type="button" className="nav-item nav-grupo__cab" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
          <item.icon size={18} strokeWidth={1.9} />
          <span className="sidebar__texto">{item.label}</span>
          <ChevronDown size={16} aria-hidden className={`nav-grupo__flecha sidebar__texto${abierto ? ' nav-grupo__flecha--abierta' : ''}`} />
        </button>
        {abierto && (
          <div className="nav-grupo__hijos">
            {item.children.map(c => <NavEscritorio key={c.key} item={c} pathname={pathname} contador={contador} />)}
          </div>
        )}
      </div>
    );
  }

  const contenido = (
    <>
      <item.icon size={18} strokeWidth={1.9} />
      <span className="sidebar__texto">{item.label}</span>
      <Insignia item={item} contador={contador} className="nav-item__contador sidebar__texto" />
      {item.pronto && <span className="nav-item__tag sidebar__texto">Pronto</span>}
      {!item.pronto && !item.to && <ArrowUpRight size={14} className="nav-item__ext sidebar__texto" aria-label="Se abre en la versión actual" />}
    </>
  );
  if (item.pronto) return <span className="nav-item nav-item--soon" aria-disabled="true">{contenido}</span>;
  if (item.to) return <NavLink to={item.to} end={item.to === '/'} className="nav-item">{contenido}</NavLink>;
  return <a href="/" className="nav-item" onClick={e => { e.preventDefault(); abrirClasico(item.clasico!); }}>{contenido}</a>;
}

// Celular: la lista de pantallas de un módulo (los submenús salen como encabezado con sus opciones)
function ListaModulo({ items, pathname, contador, onNavegar }: { items: NavItem[]; pathname: string; contador: Contador; onNavegar: () => void }) {
  return (
    <>
      {items.map(item => item.children ? (
        <div key={item.key} className="more-section">
          <div className="list__header">{item.label}</div>
          <div className="modulo-lista">
            {item.children.map(c => <FilaModulo key={c.key} item={c} activa={isActive(c, pathname)} contador={contador} onNavegar={onNavegar} />)}
          </div>
        </div>
      ) : (
        <FilaModulo key={item.key} item={item} activa={isActive(item, pathname)} contador={contador} onNavegar={onNavegar} />
      ))}
    </>
  );
}

function FilaModulo({ item, activa, contador, onNavegar }: { item: NavItem; activa: boolean; contador: Contador; onNavegar: () => void }) {
  const contenido = (
    <>
      <span className="modulo-fila__icono"><item.icon size={20} strokeWidth={1.9} /></span>
      <span className="modulo-fila__texto">{item.label}</span>
      <Insignia item={item} contador={contador} className="nav-item__contador" />
      {item.pronto
        ? <span className="nav-item__tag">Pronto</span>
        : item.to
          ? <ChevronRight size={18} className="modulo-fila__flecha" />
          : <ArrowUpRight size={16} className="modulo-fila__flecha" aria-label="Se abre en la versión actual" />}
    </>
  );
  if (item.pronto) return <span className="modulo-fila modulo-fila--pronto" aria-disabled="true">{contenido}</span>;
  const clase = `modulo-fila${activa ? ' modulo-fila--activa' : ''}`;
  return item.to ? (
    <NavLink to={item.to} end={item.to === '/'} className={clase} onClick={onNavegar}>{contenido}</NavLink>
  ) : (
    <button type="button" className={clase} onClick={() => abrirClasico(item.clasico!)}>{contenido}</button>
  );
}

function AjusteSeccion({ section, activa, contador }: { section: NavSection; activa: string; contador: Contador }) {
  return (
    <div className="more-section">
      <div className="list__header">{section.title}</div>
      <div className="list">
        {section.items.flatMap(i => i.children ?? [i]).map(item => (
          item.pronto ? (
            <div key={item.key} className="row" aria-disabled="true" style={{ color: 'var(--label-2)' }}>
              <item.icon size={20} strokeWidth={1.8} />
              <span className="row__main row__title">{item.label}</span>
              <span className="nav-item__tag">Pronto</span>
            </div>
          ) : item.to ? (
            <NavLink key={item.key} to={item.to} className="row" style={{ color: 'var(--label)', textDecoration: 'none' }}
              aria-current={isActive(item, activa) ? 'page' : undefined}>
              <item.icon size={20} strokeWidth={1.8} />
              <span className="row__main row__title">{item.label}</span>
              <Insignia item={item} contador={contador} className="nav-item__contador" />
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
