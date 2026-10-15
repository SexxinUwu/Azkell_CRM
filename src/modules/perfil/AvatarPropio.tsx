import { Avatar } from '../../core/ui/Display';
import { useImagenPerfil, useMiPerfil } from './perfilApi';

// Avatar de la persona que usa la app: muestra su foto si la subió, y si no, las iniciales.
// Se usa igual en la barra superior, la barra lateral y Ajustes, para que todo sea coherente.
export function AvatarPropio({ name, size, accent }: { name: string; size?: 'sm' | 'lg'; accent?: boolean }) {
  const perfil = useMiPerfil();
  const foto = useImagenPerfil(perfil.data?.avatar_url);
  return <Avatar name={name} size={size} accent={accent} src={foto.data ?? null} />;
}
