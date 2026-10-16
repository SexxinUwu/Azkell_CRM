// Rutas de la app nueva (publicada en /app/). Cada módulo aporta sus páginas desde src/modules/<modulo>/.
// Las pantallas que aún no se migran se abren en la versión actual (ver core/layout/navigation.ts).
import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission, RequireSession } from './core/auth/guards';
import { AppShell } from './core/layout/AppShell';
import { LoginPage } from './modules/auth/LoginPage';
import { LegalPage } from './modules/legal/LegalPage';
import { WelcomeTransition } from './modules/auth/WelcomeTransition';
import { FarewellTransition } from './modules/auth/FarewellTransition';
import { InicioPage } from './modules/inicio/InicioPage';
import { PerfilPage } from './modules/perfil/PerfilPage';
import { EditarPerfilPage } from './modules/perfil/EditarPerfilPage';
import { Inactividad } from './core/auth/Inactividad';
import { RUTAS_MODULOS } from './core/layout/navigation';
// Pantallas de módulos: se descargan aparte, al abrirlas (el marco de la app ya está en pantalla)
const PlacasPage = lazy(() => import('./modules/placas/PlacasPage').then(m => ({ default: m.PlacasPage })));
const InspeccionesPage = lazy(() => import('./modules/inspecciones/InspeccionesPage').then(m => ({ default: m.InspeccionesPage })));
const RegistrarInspeccionPage = lazy(() => import('./modules/inspecciones/RegistrarInspeccionPage').then(m => ({ default: m.RegistrarInspeccionPage })));
const EditarInspeccionPage = lazy(() => import('./modules/inspecciones/RegistrarInspeccionPage').then(m => ({ default: m.EditarInspeccionPage })));
const CatalogoRuta = lazy(() => import('./modules/catalogos/CatalogoRuta').then(m => ({ default: m.CatalogoRuta })));
const ConductoresPage = lazy(() => import('./modules/conductores/ConductoresPage').then(m => ({ default: m.ConductoresPage })));
const PersonalPage = lazy(() => import('./modules/personal/PersonalPage').then(m => ({ default: m.PersonalPage })));

export default function App() {
  return (
    <BrowserRouter basename="/app">
      {/* Bienvenida al ingresar y despedida al salir: por encima de todo, mientras la pantalla cambia debajo */}
      <WelcomeTransition />
      <FarewellTransition />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/legal/:pagina" element={<LegalPage />} />
        <Route element={<RequireSession><AppShell /><Inactividad /></RequireSession>}>
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
          <Route path="conductores" element={<RequirePermission any={['cond.ver']}><ConductoresPage /></RequirePermission>} />
          <Route path="directorio/personal/:id?" element={<RequirePermission any={['rrhh_personal.ver']}><PersonalPage /></RequirePermission>} />
          {RUTAS_MODULOS.map(({ path, permisos, Page }) => (
            <Route key={path} path={path} element={<RequirePermission any={permisos}><Page /></RequirePermission>} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
