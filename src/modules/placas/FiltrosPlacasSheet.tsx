import type { ReactNode } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { ChoiceChips, ToggleChips } from '../../core/ui/Chips';
import { MultiSelect } from '../../core/ui/MultiSelect';
import type { Placa } from './api';
import { COMBUSTIBLES, UTS_OPCIONES } from './valoresPlaca';
import { FILTROS_VACIOS, cuentaFiltros, valoresDe, type Clase, type FiltrosPlacas, type SiNo } from './filtros';

const CLASES: Array<{ value: Clase; label: string }> = [
  { value: 'todas', label: 'Todas' }, { value: 'motoras', label: 'Motoras' }, { value: 'no-motoras', label: 'No motoras' },
];
const EN_USO: Array<{ value: SiNo; label: string }> = [
  { value: 'todas', label: 'Todas' }, { value: 'si', label: 'En uso' }, { value: 'no', label: 'Fuera de uso' },
];
const opciones = (valores: string[]) => valores.map(v => ({ value: v, label: v }));

const Grupo = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="placas-filtros__grupo">
    <h3 className="placas-filtros__titulo t-footnote">{titulo}</h3>
    {children}
  </section>
);

// Criterios de la lista de placas. Se aplican al instante; "Ver N unidades" solo cierra la hoja.
export function FiltrosPlacasSheet({ open, onClose, placas, filtros, onChange, resultado }: {
  open: boolean;
  onClose: () => void;
  placas: Placa[];
  filtros: FiltrosPlacas;
  onChange: (f: FiltrosPlacas) => void;
  resultado: number;
}) {
  const set = <K extends keyof FiltrosPlacas>(clave: K, valor: FiltrosPlacas[K]) => onChange({ ...filtros, [clave]: valor });
  // Combustible y UTS muestran siempre las opciones fijas, más lo que ya exista en la base
  const combustibles = [...new Set([...COMBUSTIBLES, ...valoresDe(placas, 'combustible')])];
  const utss = [...new Set([...UTS_OPCIONES, ...valoresDe(placas, 'uts')])];
  const activos = cuentaFiltros(filtros) > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      footer={
        <>
          <Button variant="secondary" disabled={!activos} onClick={() => onChange(FILTROS_VACIOS)}>Quitar filtros</Button>
          <Button variant="primary" onClick={onClose}>Ver {resultado} {resultado === 1 ? 'unidad' : 'unidades'}</Button>
        </>
      }
    >
      <div className="placas-filtros">
        <Grupo titulo="Clase">
          <ChoiceChips label="Clase de unidad" options={CLASES} value={filtros.clase} onChange={v => set('clase', v)} />
        </Grupo>
        <Grupo titulo="Estado">
          <ToggleChips label="Estado" options={opciones(valoresDe(placas, 'estado'))} value={filtros.estados} onChange={v => set('estados', v)} />
        </Grupo>
        <Grupo titulo="Tipo de unidad">
          <ToggleChips label="Tipo de unidad" options={opciones(valoresDe(placas, 'tipo'))} value={filtros.tipos} onChange={v => set('tipos', v)} />
        </Grupo>
        <Grupo titulo="En uso">
          <ChoiceChips label="En uso" options={EN_USO} value={filtros.enUso} onChange={v => set('enUso', v)} />
        </Grupo>
        <Grupo titulo="Combustible">
          <ToggleChips label="Combustible" options={opciones(combustibles)} value={filtros.combustibles} onChange={v => set('combustibles', v)} />
        </Grupo>
        <Grupo titulo="UTS">
          <ToggleChips label="UTS" options={opciones(utss)} value={filtros.utss} onChange={v => set('utss', v)} />
        </Grupo>
        <section className="placas-filtros__grupo">
          <MultiSelect label="Cliente" placeholder="Todos los clientes" options={valoresDe(placas, 'cliente')} value={filtros.clientes} onChange={v => set('clientes', v)} />
        </section>
        <section className="placas-filtros__grupo">
          <MultiSelect label="Marca" placeholder="Todas las marcas" options={valoresDe(placas, 'marca')} value={filtros.marcas} onChange={v => set('marcas', v)} />
        </section>
        <section className="placas-filtros__grupo">
          <MultiSelect label="Configuración" placeholder="Todas" options={valoresDe(placas, 'configuracion')} value={filtros.configuraciones} onChange={v => set('configuraciones', v)} />
        </section>
      </div>
    </Sheet>
  );
}
