import { DirectorioPersonalPage } from '../directorio/DirectorioPersonalPage';
import { PersonalPage } from './PersonalPage';
import { VistaPersonal } from './VistaPersonal';

// RRHH › Personal: único lugar donde se da de alta y se edita al personal (administrativos, conductores y demás; el cargo y la categoría los distinguen)
export function RRHHAdministrativos() {
  return <PersonalPage base="/rrhh/personal" eyebrow="Recursos humanos" titulo="Personal" selector={<VistaPersonal actual="personal" />} />;
}

// Directorio › Personal: libreta de contactos de todo el personal (conductores incluidos), en una sola pantalla y solo de consulta
export function DirectorioAdministrativos() {
  return <DirectorioPersonalPage />;
}
