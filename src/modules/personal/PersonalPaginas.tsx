import { SelectorDirectorio } from '../directorio/SelectorDirectorio';
import { PersonalPage } from './PersonalPage';

// RRHH › Personal: único lugar donde se da de alta y se edita al personal (administrativos, conductores y demás; el cargo y la categoría los distinguen)
export function RRHHAdministrativos() {
  return <PersonalPage base="/rrhh/personal" eyebrow="Recursos humanos" titulo="Personal" />;
}

// Directorio › Personal: solo consulta (tarjetas de contacto) de todo el personal, conductores incluidos. No crea, edita ni elimina a nadie
export function DirectorioAdministrativos() {
  return <PersonalPage soloLectura titulo="Personal" selector={<SelectorDirectorio actual="personal" />} />;
}
