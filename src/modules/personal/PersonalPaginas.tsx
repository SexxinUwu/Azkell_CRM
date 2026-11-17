import { PersonalPage } from './PersonalPage';
import { ConductoresPage } from '../conductores/ConductoresPage';
import { SelectorPersonal } from './SelectorPersonal';

// RRHH › Personal: único lugar donde se da de alta y se edita al personal (administrativos y conductores)
export function RRHHAdministrativos() {
  return <PersonalPage base="/rrhh/personal" eyebrow="Recursos humanos" titulo="Personal" selector={<SelectorPersonal modo="rrhh" actual="administrativos" />} />;
}
export function RRHHConductores() {
  return <ConductoresPage eyebrow="Recursos humanos" titulo="Personal" selector={<SelectorPersonal modo="rrhh" actual="conductores" />} />;
}

// Directorio: solo consulta (tarjetas de contacto). No crea, edita ni elimina a nadie
export function DirectorioAdministrativos() {
  return <PersonalPage soloLectura selector={<SelectorPersonal modo="directorio" actual="administrativos" />} />;
}
export function DirectorioConductores() {
  return <ConductoresPage soloLectura selector={<SelectorPersonal modo="directorio" actual="conductores" />} />;
}
