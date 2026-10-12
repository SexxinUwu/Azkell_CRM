// Rutas de la app nueva (publicada en /app/). Cada módulo aporta sus páginas desde src/modules/<modulo>/.
// Las pantallas que aún no se migran se abren en la versión actual (ver core/layout/navigation.ts).
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireSession } from './core/auth/guards';
import { AppShell } from './core/layout/AppShell';
import { LoginPage } from './modules/auth/LoginPage';
import { WelcomeTransition } from './modules/auth/WelcomeTransition';
import { FarewellTransition } from './modules/auth/FarewellTransition';
import { InicioPage } from './modules/inicio/InicioPage';
import { PerfilPage } from './modules/perfil/PerfilPage';

export default function App() {
  return (
    <BrowserRouter basename="/app">
      {/* Bienvenida al ingresar y despedida al salir: por encima de todo, mientras la pantalla cambia debajo */}
      <WelcomeTransition />
      <FarewellTransition />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireSession><AppShell /></RequireSession>}>
          <Route index element={<InicioPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
