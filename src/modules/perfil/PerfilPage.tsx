import { KeyRound, LogOut, Monitor, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Avatar, Page, PageHeader } from '../../core/ui/Display';
import { useNavigate } from 'react-router-dom';
import { AccentPicker } from '../../core/ui/AccentPicker';
import { ThemeSelector } from '../../core/ui/ThemeToggle';
import { CambiarPasswordSheet } from './CambiarPasswordSheet';
import { SesionesSheet } from './SesionesSheet';
import { useImagenPerfil, useMiPerfil } from './perfilApi';

// Mi cuenta: datos de la sesión, apariencia, contraseña y sesiones activas. Foto y firma siguen en la versión actual.
export function PerfilPage() {
  const { user, logout } = useAuth();
  const [claveAbierta, setClaveAbierta] = useState(false);
  const [sesionesAbiertas, setSesionesAbiertas] = useState(false);
  const navigate = useNavigate();
  const perfil = useMiPerfil();
  const foto = useImagenPerfil(perfil.data?.avatar_url);
  if (!user) return null;
  return (
    <Page narrow>
      <PageHeader eyebrow="Cuenta" title="Mi cuenta" />
      <div className="list">
        <div className="row">
          <Avatar name={user.name} size="lg" accent src={foto.data ?? null} />
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
        <button type="button" className="row" onClick={() => setClaveAbierta(true)}>
          <KeyRound size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Cambiar contraseña</span>
        </button>
        <button type="button" className="row" onClick={() => setSesionesAbiertas(true)}>
          <Monitor size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Sesiones activas</span>
        </button>
        <button type="button" className="row" onClick={() => navigate('/perfil/editar')}>
          <UserRound size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Editar perfil y foto</span>
        </button>
        <button type="button" className="row" onClick={logout} style={{ color: 'var(--red-ink)' }}>
          <LogOut size={20} strokeWidth={1.8} />
          <span className="row__main row__title">Cerrar sesión</span>
        </button>
      </div>

      <CambiarPasswordSheet open={claveAbierta} onClose={() => setClaveAbierta(false)} />
      <SesionesSheet open={sesionesAbiertas} onClose={() => setSesionesAbiertas(false)} />
    </Page>
  );
}
