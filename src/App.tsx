// Rutas de la app nueva (publicada en /app/). Cada módulo aporta sus páginas desde src/modules/<modulo>/.
// Las pantallas que aún no se migran se abren en la versión actual (ver core/layout/navigation.ts).
import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission, RequireSession } from './core/auth/guards';
import { AppShell } from './core/layout/AppShell';
import { LoginPage } from './modules/auth/LoginPage';
import { WelcomeTransition } from './modules/auth/WelcomeTransition';
import { FarewellTransition } from './modules/auth/FarewellTransition';
import { InicioPage } from './modules/inicio/InicioPage';
import { PerfilPage } from './modules/perfil/PerfilPage';
import { Inactividad } from './core/auth/Inactividad';
// Pantallas de módulos: se descargan aparte, al abrirlas (el marco de la app ya está en pantalla)
const PlacasPage = lazy(() => import('./modules/placas/PlacasPage').then(m => ({ default: m.PlacasPage })));
const ConductoresPage = lazy(() => import('./modules/conductores/ConductoresPage').then(m => ({ default: m.ConductoresPage })));

export default function App() {
  return (
    <BrowserRouter basename="/app">
      {/* Bienvenida al ingresar y despedida al salir: por encima de todo, mientras la pantalla cambia debajo */}
      <WelcomeTransition />
      <FarewellTransition />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireSession><AppShell /><Inactividad /></RequireSession>}>
          <Route index element={<InicioPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="placas" element={<RequirePermission any={['placas.ver']}><PlacasPage /></RequirePermission>} />
          <Route path="conductores" element={<RequirePermission any={['cond.ver']}><ConductoresPage /></RequirePermission>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
