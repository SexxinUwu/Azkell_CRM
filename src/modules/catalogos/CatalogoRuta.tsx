import { Navigate } from 'react-router-dom';
import { RequirePermission } from '../../core/auth/guards';
import { CATALOGOS } from './configs';
import { CatalogoPage } from './CatalogoPage';

// Una ruta por catálogo (src/App.tsx), con el permiso de lectura de su clave.
export function CatalogoRuta({ clave }: { clave: string }) {
  const config = CATALOGOS.find(c => c.clave === clave);
  if (!config) return <Navigate to="/" replace />;
  return (
    <RequirePermission any={[`${config.permiso}.ver`]}>
      <CatalogoPage key={config.clave} config={config} />
    </RequirePermission>
  );
}
