import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Avatar, Page, PageHeader } from '../../core/ui/Display';
import { abrirClasico } from '../../core/layout/navigation';
import { AccentPicker } from '../../core/ui/AccentPicker';
import { ThemeSelector } from '../../core/ui/ThemeToggle';

// Mi cuenta: datos de la sesión. Editar el perfil (foto, firma, contraseña) sigue en la versión actual.
export function PerfilPage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Page narrow>
      <PageHeader eyebrow="Cuenta" title="Mi cuenta" />
      <div className="list">
        <div className="row">
          <Avatar name={user.name} size="lg" accent />
          <div className="row__main">
            <div className="row__title">{user.name}</div>
            <div className="row__subtitle">{user.email}</div>
          </div>
        </div>
        <div className="row">
          <span className="row__main row__title">Rol</span>
          <span className="c-secondary">{user.roleName}</span>
        </div>
        <div className="row">
          <span className="row__main row__title">Empresa</span>
          <span className="c-secondary">{user.companyName}</span>
        </div>
      </div>

      <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Apariencia</div>
      <div className="list"><ThemeSelector /></div>

      <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Color de la app</div>
      <div className="list"><AccentPicker /></div>

      <div className="list" style={{ marginTop: 'var(--s-6)' }}>
        <button type="button" className="row" onClick={() => abrirClasico('sistema/perfil')}>
          <UserRound size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Editar perfil, foto y contraseña</span>
        </button>
        <button type="button" className="row" onClick={logout} style={{ color: 'var(--red-ink)' }}>
          <LogOut size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Cerrar sesión</span>
        </button>
      </div>
    </Page>
  );
}
