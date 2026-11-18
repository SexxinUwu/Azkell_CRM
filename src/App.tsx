// Rutas de la app nueva (publicada en /app/). Cada módulo aporta sus páginas desde src/modules/<modulo>/.
// Las pantallas que aún no se migran se abren en la versión actual (ver core/layout/navigation.ts).
import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequirePermission, RequireSession } from './core/auth/guards';
import { AppShell } from './core/layout/AppShell';
import { ES_PANEL_SAAS } from './core/layout/navigation';
import { LoginPage } from './modules/auth/LoginPage';
import { LegalPage } from './modules/legal/LegalPage';
import { WelcomeTransition } from './modules/auth/WelcomeTransition';
import { FarewellTransition } from './modules/auth/FarewellTransition';
import { InicioPage } from './modules/inicio/InicioPage';
import { PerfilPage } from './modules/perfil/PerfilPage';
import { EditarPerfilPage } from './modules/perfil/EditarPerfilPage';
import { Inactividad } from './core/auth/Inactividad';
import { RUTAS_MODULOS } from './core/layout/navigation';
import { PantallaError } from './core/ui/PantallaError';
// Pantallas de módulos: se descargan aparte, al abrirlas (el marco de la app ya está en pantalla)
const PlacasPage = lazy(() => import('./modules/placas/PlacasPage').then(m => ({ default: m.PlacasPage })));
const InspeccionesPage = lazy(() => import('./modules/inspecciones/InspeccionesPage').then(m => ({ default: m.InspeccionesPage })));
const RegistrarInspeccionPage = lazy(() => import('./modules/inspecciones/RegistrarInspeccionPage').then(m => ({ default: m.RegistrarInspeccionPage })));
const EditarInspeccionPage = lazy(() => import('./modules/inspecciones/RegistrarInspeccionPage').then(m => ({ default: m.EditarInspeccionPage })));
const CatalogoRuta = lazy(() => import('./modules/catalogos/CatalogoRuta').then(m => ({ default: m.CatalogoRuta })));
const RRHHAdministrativos = lazy(() => import('./modules/personal/PersonalPaginas').then(m => ({ default: m.RRHHAdministrativos })));
const DirectorioAdministrativos = lazy(() => import('./modules/personal/PersonalPaginas').then(m => ({ default: m.DirectorioAdministrativos })));

/** En admin.azkell.com solo se entra al panel de empresas; cualquier otra pantalla vuelve ahí */
function SoloPanelSaas({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (ES_PANEL_SAAS && !pathname.startsWith('/sistema/superadmin')) return <Navigate to="/sistema/superadmin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename="/app">
      {/* Bienvenida al ingresar y despedida al salir: por encima de todo, mientras la pantalla cambia debajo */}
      <WelcomeTransition />
      <FarewellTransition />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/legal/:pagina" element={<LegalPage />} />
        <Route element={<RequireSession><SoloPanelSaas><AppShell /><Inactividad /></SoloPanelSaas></RequireSession>}>
          <Route index element={<InicioPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="perfil/editar" element={<EditarPerfilPage />} />
          <Route path="placas" element={<RequirePermission any={['placas.ver']}><PlacasPage /></RequirePermission>} />
          <Route path="inspecciones" element={<RequirePermission any={['insp.ver']}><InspeccionesPage /></RequirePermission>} />
          <Route path="inspecciones/nueva" element={<RequirePermission any={['insp.crear']}><RegistrarInspeccionPage /></RequirePermission>} />
          <Route path="inspecciones/:id/editar" element={<RequirePermission any={['insp.editar', 'insp.crear']}><EditarInspeccionPage /></RequirePermission>} />
          <Route path="almacen/familias" element={<CatalogoRuta clave="familias" />} />
          <Route path="almacen/marcas" element={<CatalogoRuta clave="marcas" />} />
          <Route path="almacen/unidades" element={<CatalogoRuta clave="unidades" />} />
          <Route path="almacen/sistemas" element={<CatalogoRuta clave="sistemas" />} />
          <Route path="almacen/almacenes" element={<CatalogoRuta clave="almacenes" />} />
          <Route path="mantenimiento/tipos-mp" element={<CatalogoRuta clave="tipos-mp" />} />
          <Route path="mantenimiento/personal" element={<CatalogoRuta clave="personal-taller" />} />
          <Route path="preferencias/situaciones" element={<CatalogoRuta clave="situaciones" />} />
          {/* Conductores pasó a Personal: los enlaces anteriores siguen funcionando */}
          <Route path="conductores" element={<Navigate to="/directorio/personal" replace />} />
          <Route path="directorio/personal/:id?" element={<RequirePermission any={['rrhh_personal.ver', 'cond.ver']}><DirectorioAdministrativos /></RequirePermission>} />
          <Route path="rrhh/personal/:id?" element={<RequirePermission any={['rrhh_personal.ver']}><RRHHAdministrativos /></RequirePermission>} />
          <Route path="rrhh/conductores" element={<Navigate to="/rrhh/personal" replace />} />
          {RUTAS_MODULOS.map(({ path, permisos, Page }) => (
            <Route key={path} path={path} element={<RequirePermission any={permisos}><Page /></RequirePermission>} />
          ))}
          <Route path="*" element={<PantallaError tipo="no-encontrado" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
