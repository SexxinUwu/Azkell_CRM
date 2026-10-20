import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Banknote, Boxes, ChevronDown, ChevronRight, Contact, IdCard, House, LogOut, Palette, PanelLeftClose, PanelLeftOpen, Route, Settings, Share, ShieldCheck, Truck,
  SquarePlus, Smartphone, Users, Wrench, Search, EyeOff, Star, type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { PaletaComandos, type OpcionPaleta } from './PaletaComandos';
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
import './menu-secciones.css';

// Color de cada sección del menú: identifica el módulo de un vistazo
const COLOR_SECCION: Record<string, string> = {
  Operaciones: '#2563eb', 'Operaciones Marsisa': '#d97706', Flota: '#16a34a', Mantenimiento: '#ea580c', 'Almacén': '#7c3aed',
  Gerencia: '#0f766e', RRHH: '#db2777', 'Tesorería': '#059669', Conductor: '#0891b2', Seguridad: '#475569', Directorio: '#4f46e5',
};

// Todas las pantallas de una sección (los submenús se aplanan) para la paleta Ctrl+K
function aplanarOpciones(items: NavItem[], seccion: string): OpcionPaleta[] {
  return items.flatMap(i => (i.children
    ? aplanarOpciones(i.children, seccion)
    : (i.to || i.clasico) ? [{ key: i.key, label: i.label, seccion, to: i.to, clasico: i.clasico, icon: i.icon }] : []));
}

// Pendientes de una sección: los contadores de sus opciones (y de sus submenús)
function contadorDe(item: NavItem, contador: Record<string, number>): number {
  return (item.badge ? contador[item.badge] ?? 0 : 0) + (item.children ?? []).reduce((s, c) => s + contadorDe(c, contador), 0);
}

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
  // Menú en acordeón: solo una sección abierta a la vez. Al entrar a una pantalla, se abre la sección que la contiene.
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);
  useEffect(() => {
    const activa = sections.find(s => s.items.some(i => (i.children ? i.children.some(c => isActive(c, location.pathname)) : isActive(i, location.pathname))));
    if (activa) setSeccionAbierta(activa.title);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+K: paleta de pantallas. Favoritos y modo foco se guardan por usuario en este navegador.
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const claveUsuario = user?.email ?? 'anonimo';
  const [favoritos, setFavoritos] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`fleet_favoritos_${claveUsuario}`) ?? '[]'); } catch { return []; } });
  const [modoFoco, setModoFoco] = useState(() => { try { return localStorage.getItem('fleet_modo_foco') === '1'; } catch { return false; } });
  const indicadores = useQuery<Record<string, string | null>>({
    queryKey: ['nav', 'indicadores'],
    queryFn: () => api<{ indicadores: Record<string, string | null> }>('/nav/indicadores').then(r => r.indicadores),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  useEffect(() => {
    const teclado = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletaAbierta(v => !v); } };
    window.addEventListener('keydown', teclado);
    return () => window.removeEventListener('keydown', teclado);
  }, []);
  // Modo foco: al cambiar de pantalla el menú vuelve a contraerse (se despliega al pasar el cursor)
  useEffect(() => { if (modoFoco) setMenuFijo(false); }, [location.pathname, modoFoco]);
  const opcionesPaleta: OpcionPaleta[] = sections.flatMap(s => aplanarOpciones(s.items, s.title));
  const favoritosItems = favoritos.map(k => opcionesPaleta.find(o => o.key === k)).filter((o): o is OpcionPaleta => !!o && !!o.to);
  function alternarFavorito(key: string) {
    setFavoritos(prev => {
      const nx = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key].slice(-5);
      try { localStorage.setItem(`fleet_favoritos_${claveUsuario}`, JSON.stringify(nx)); } catch { /* sin almacenamiento: no se guarda */ }
      return nx;
    });
  }
  function alternarFoco() {
    setModoFoco(v => {
      const nv = !v;
      try { localStorage.setItem('fleet_modo_foco', nv ? '1' : '0'); } catch { /* sin almacenamiento */ }
      if (nv) setMenuFijo(false);
      return nv;
    });
  }
  function elegirOpcion(o: OpcionPaleta) {
    setPaletaAbierta(false);
    if (o.to) navigate(o.to);
    else if (o.clasico) abrirClasico(o.clasico);
  }
  const current = findNavItem(location.pathname);
  const pageTitle = location.pathname === '/perfil' ? 'Mi cuenta'
    : location.pathname.startsWith('/q/') ? 'Unidad'
    : current?.label ?? user?.companyName ?? 'Azkell Fleet';

  // La barra superior se vuelve material translúcido solo cuando hay contenido debajo.
  // En celular el contenido se desplaza dentro de <main> (como la versión actual); en escritorio, la ventana.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    const onScroll = () => setScrolled(Math.max(window.scrollY, main?.scrollTop ?? 0) > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    main?.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); main?.removeEventListener('scroll', onScroll); };
  }, [!!user]);

  // Barra lateral (escritorio): el foco por teclado la muestra con su estilo de foco (sin :has()).
  const barraRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const barra = barraRef.current;
    if (!barra) return;
    const alEnfocar = () => barra.classList.toggle('sidebar--teclado', !!barra.querySelector(':focus-visible'));
    const alSoltar = () => barra.classList.remove('sidebar--teclado');
    barra.addEventListener('focusin', alEnfocar);
    barra.addEventListener('focusout', alSoltar);
    return () => {
      barra.removeEventListener('focusin', alEnfocar);
      barra.removeEventListener('focusout', alSoltar);
    };
  }, [!!user]);

  // Cada pantalla empieza arriba; cierra "Más" al navegar.
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.scrollTo(0, 0);
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
    <div className={`app${menuFijo ? ' app--barra-fija' : ''}`}>
      <aside ref={barraRef} className={`sidebar${menuFijo ? ' sidebar--fijo' : ''}`} aria-label="Navegación principal">
      <div className="sidebar__panel">
        <Link to={homePath(can)} className="sidebar__brand">
          <BrandMark size={30} />
          <div className="sidebar__texto">
            <Wordmark />
            <div className="t-caption c-secondary">{user.companyName}</div>
          </div>
        </Link>

        <nav className="sidebar__nav">
          {favoritosItems.length > 0 && (
            <div className="nav-seccion nav-seccion--favoritos" style={{ ['--seccion' as string]: '#d97706' }}>
              <div className="nav-seccion__cab">
                <span className="nav-seccion__icono" aria-hidden><Star size={16} strokeWidth={2} fill="currentColor" /></span>
                <span className="nav-seccion__titulo sidebar__texto">Favoritos</span>
              </div>
              {favoritosItems.map(o => {
                const Ico = o.icon ?? Boxes;
                return (
                  <NavLink key={o.key} to={o.to!} className="nav-item" title={o.label}>
                    <Ico size={18} strokeWidth={1.9} />
                    <span className="sidebar__texto">{o.label}</span>
                  </NavLink>
                );
              })}
            </div>
          )}
          {sections.map(section => {
            const abierta = seccionAbierta === section.title;
            const color = COLOR_SECCION[section.title] ?? 'var(--accent)';
            const Icono = iconoModulo(section.title);
            const pendientes = section.items.reduce((s, i) => s + contadorDe(i, contador), 0);
            return (
              <div key={section.title} className={`nav-seccion${abierta ? ' nav-seccion--abierta' : ''}`} style={{ ['--seccion' as string]: color }}>
                <button type="button" className="nav-seccion__cab" aria-expanded={abierta} title={section.title}
                  onClick={() => setSeccionAbierta(abierta ? null : section.title)}>
                  <span className="nav-seccion__icono" aria-hidden>
                    <Icono size={17} strokeWidth={2} />
                    {!abierta && pendientes > 0 && <span className="nav-seccion__aviso" />}
                  </span>
                  <span className="nav-seccion__titulo sidebar__texto">{section.title}</span>
                  {!abierta && pendientes > 0 && <span className="nav-seccion__pendientes sidebar__texto">{pendientes}</span>}
                  <ChevronDown size={14} aria-hidden className="nav-seccion__flecha sidebar__texto" />
                </button>
                {abierta && indicadores.data?.[section.title] && (
                  <div className="nav-seccion__indicador sidebar__texto">{indicadores.data[section.title]}</div>
                )}
                {abierta && section.items.map((item, i) => (
                  <div key={item.key} className="nav-seccion__item" style={{ ['--i' as string]: i }}>
                    <NavEscritorio item={item} pathname={location.pathname} contador={contador} />
                  </div>
                ))}
              </div>
            );
          })}
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
            <button type="button" className="nav-item" onClick={() => setPaletaAbierta(true)}>
              <Search size={18} strokeWidth={1.9} />
              <span className="sidebar__texto">Buscar pantalla (Ctrl+K)</span>
            </button>
            <button type="button" className="nav-item" onClick={alternarFoco} aria-pressed={modoFoco}>
              <EyeOff size={18} strokeWidth={1.9} />
              <span className="sidebar__texto">{modoFoco ? 'Modo foco: activo' : 'Modo foco'}</span>
            </button>
            <button type="button" className="nav-item" onClick={alternarMenuFijo} aria-pressed={menuFijo}>
              {menuFijo ? <PanelLeftClose size={18} strokeWidth={1.9} /> : <PanelLeftOpen size={18} strokeWidth={1.9} />}
              <span className="sidebar__texto">{menuFijo ? 'Contraer menú' : 'Fijar menú abierto'}</span>
            </button>
            <div className="sidebar__salida">
              <button type="button" className="nav-item sidebar__salir" onClick={logout}>
                <LogOut size={18} strokeWidth={1.9} />
                <span className="sidebar__texto">Cerrar sesión</span>
              </button>
              <ThemeButton className="sidebar__tema" />
            </div>
          </div>
        </div>
      </div>
      </aside>

      <div className="app__contenido">
        <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
          <Link to={homePath(can)} className="topbar__brand" aria-label="Inicio"><BrandMark size={28} /></Link>
          <div className="topbar__title" aria-hidden>{pageTitle}</div>
          <ThemeButton className="topbar__tema" />
          <Link to="/perfil" className="topbar__avatar" aria-label="Mi cuenta">
            <AvatarPropio name={user.name} size="sm" accent />
          </Link>
        </header>

        <main className="main" ref={mainRef}>
          {/* Pantallas que se descargan aparte: el marco (barras) no se mueve mientras llegan */}
          <Suspense fallback={<PageLoader />}>
            {/* Cada módulo entra con su propia transición; la clave cambia con la ruta */}
            <div key={location.pathname} className="vista-transicion">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <ConnectionBanner state={live} />
      <AsistenteFab />

      <ModuleDock items={dock} />

      {/* Lista de pantallas del módulo elegido */}
      {paletaAbierta && (
        <PaletaComandos opciones={opcionesPaleta} favoritos={favoritos} onToggleFavorito={alternarFavorito}
          onElegir={elegirOpcion} onCerrar={() => setPaletaAbierta(false)} />
      )}
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
  Gerencia: ShieldCheck, RRHH: Users, 'Tesorería': Banknote, Conductor: IdCard, Seguridad: ShieldCheck, Directorio: Contact, Dashboard: House,
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
