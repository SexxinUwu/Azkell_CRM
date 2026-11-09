import { Avatar } from '../../core/ui/Display';
import { initials } from '../../core/lib/format';
import { useImagenPerfil, useMiPerfil } from './perfilApi';

// Avatar de la persona que usa la app: muestra su foto si la subió, y si no, las iniciales.
// Se usa igual en la barra superior, la barra lateral y Ajustes, para que todo sea coherente.
/** Avatar del saludo de un módulo: la foto de la persona con la clase de su tarjeta, o las iniciales si no subió foto */
export function AvatarSaludo({ name, className }: { name: string; className: string }) {
  const perfil = useMiPerfil();
  const foto = useImagenPerfil(perfil.data?.avatar_url);
  if (foto.data) return <img className={className} src={foto.data} alt="" aria-hidden style={{ objectFit: 'cover' }} />;
  return <span className={className} aria-hidden>{initials(name)}</span>;
}

export function AvatarPropio({ name, size, accent }: { name: string; size?: 'sm' | 'lg'; accent?: boolean }) {
  const perfil = useMiPerfil();
  const foto = useImagenPerfil(perfil.data?.avatar_url);
  return <Avatar name={name} size={size} accent={accent} src={foto.data ?? null} />;
}
