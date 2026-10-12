import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { EmptyState, Page } from '../ui/Display';
import { PageLoader } from '../ui/Button';

// Requiere sesión iniciada; si no, va al login y vuelve luego a donde estaba.
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

// Requiere al menos uno de los permisos indicados.
export function RequirePermission({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...any)) {
    return (
      <Page>
        <EmptyState icon={<Lock size={22} />} title="No tienes acceso a esta sección">
          Si lo necesitas, pide a Sistemas que ajuste los permisos de tu rol.
        </EmptyState>
      </Page>
    );
  }
  return <>{children}</>;
}
