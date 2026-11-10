import type { ReactNode } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { ToggleChips } from '../../core/ui/Chips';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { Field, TextInput } from '../../core/ui/Field';

export interface Rango { min: string; max: string }
export type ListaFiltro = 'auditoria' | 'motivos' | 'estados' | 'placas' | 'carretas' | 'motores' | 'rutas' | 'conductores';
export type ClaveRango = 'peso' | 'galones' | 'rendimiento' | 'gasto' | 'diferencia';
export type FiltrosAnalisis = Record<ListaFiltro, string[]> & Record<ClaveRango, Rango> & { viaje: string };
export type OpcionesFiltro = Record<ListaFiltro, string[]>;

const RANGO_VACIO: Rango = { min: '', max: '' };
export const FILTROS_ANALISIS_VACIOS: FiltrosAnalisis = {
  auditoria: [], motivos: [], estados: [], placas: [], carretas: [], motores: [], rutas: [], conductores: [], viaje: '',
  peso: RANGO_VACIO, galones: RANGO_VACIO, rendimiento: RANGO_VACIO, gasto: RANGO_VACIO, diferencia: RANGO_VACIO,
};
const LISTAS: ListaFiltro[] = ['auditoria', 'motivos', 'estados', 'placas', 'carretas', 'motores', 'rutas', 'conductores'];
const RANGOS: ClaveRango[] = ['peso', 'galones', 'rendimiento', 'gasto', 'diferencia'];

const hayRango = (r: Rango) => r.min !== '' || r.max !== '';
export function cuentaFiltrosAnalisis(f: FiltrosAnalisis): number {
  return LISTAS.filter(k => f[k].length > 0).length + (f.viaje.trim() ? 1 : 0) + RANGOS.filter(k => hayRango(f[k])).length;
}
// Igual que el buscador: ignora mayúsculas, espacios, guiones y puntos
export const normalizarBusqueda = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_.]/g, '');
// Un rango vacío no filtra; con rango activo, un valor que no existe (null) queda fuera
export function dentroDeRango(valor: number | null, r: Rango): boolean {
  if (!hayRango(r)) return true;
  if (valor === null) return false;
  return (r.min === '' || valor >= Number(r.min)) && (r.max === '' || valor <= Number(r.max));
}

// Mínimo y máximo de una cifra; el rango vacío no filtra
const Rango = ({ titulo, valor, onChange }: { titulo: string; valor: Rango; onChange: (lado: keyof Rango, v: string) => void }) => (
  <Field label={titulo}>
    {p => (
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <TextInput {...p} inputMode="decimal" placeholder="Mínimo" value={valor.min} onChange={e => onChange('min', e.target.value)} />
        <TextInput inputMode="decimal" placeholder="Máximo" aria-label={`${titulo}, máximo`} value={valor.max} onChange={e => onChange('max', e.target.value)} />
      </div>
    )}
  </Field>
);

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s-3)' } as const;

const Grupo = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
    <h3 className="t-footnote" style={{ margin: 0, color: 'var(--muted)' }}>{titulo}</h3>
    {children}
  </section>
);

// Filtros del análisis. Se aplican al instante; "Ver N viajes" solo cierra la hoja.
export function FiltrosAnalisisSheet({ open, onClose, filtros, onChange, opciones, resultado, urea }: {
  open: boolean;
  onClose: () => void;
  filtros: FiltrosAnalisis;
  onChange: (f: FiltrosAnalisis) => void;
  opciones: OpcionesFiltro;
  resultado: number;
  urea: boolean;
}) {
  const set = <K extends keyof FiltrosAnalisis>(clave: K, valor: FiltrosAnalisis[K]) => onChange({ ...filtros, [clave]: valor });
  const setRango = (clave: ClaveRango, lado: keyof Rango, valor: string) => onChange({ ...filtros, [clave]: { ...filtros[clave], [lado]: valor } });
  const activos = cuentaFiltrosAnalisis(filtros) > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      footer={
        <>
          <Button variant="secondary" disabled={!activos} onClick={() => onChange(FILTROS_ANALISIS_VACIOS)}>Quitar filtros</Button>
          <Button variant="primary" onClick={onClose}>Ver {resultado} {resultado === 1 ? 'viaje' : 'viajes'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <Grupo titulo="Auditoría y estado">
          <ToggleChips label="Auditoría" options={opciones.auditoria.map(v => ({ value: v, label: v }))} value={filtros.auditoria} onChange={v => set('auditoria', v)} />
          <ToggleChips label="Estado" options={opciones.estados.map(v => ({ value: v, label: v }))} value={filtros.estados} onChange={v => set('estados', v)} />
          <MultiSelect label="Motivo de la observación" placeholder="Todos los motivos" options={opciones.motivos} value={filtros.motivos} onChange={v => set('motivos', v)} />
        </Grupo>
        <Grupo titulo="Unidad">
          <div style={grid}>
            <MultiSelect label="Placa" placeholder="Todas las placas" options={opciones.placas} value={filtros.placas} onChange={v => set('placas', v)} />
            <MultiSelect label="Carreta" placeholder="Todas las carretas" options={opciones.carretas} value={filtros.carretas} onChange={v => set('carretas', v)} />
            <MultiSelect label="Motor" placeholder="Todos los motores" options={opciones.motores} value={filtros.motores} onChange={v => set('motores', v)} />
          </div>
        </Grupo>
        <Grupo titulo="Viaje">
          <div style={grid}>
            <Field label="N° de viaje">
              {p => <TextInput {...p} value={filtros.viaje} placeholder="Parte del número" onChange={e => set('viaje', e.target.value)} />}
            </Field>
            <MultiSelect label="Ruta" placeholder="Todas las rutas" options={opciones.rutas} value={filtros.rutas} onChange={v => set('rutas', v)} />
            <MultiSelect label="Conductor" placeholder="Todos los conductores" options={opciones.conductores} value={filtros.conductores} onChange={v => set('conductores', v)} />
          </div>
        </Grupo>
        <Grupo titulo="Cifras">
          <div style={grid}>
            <Rango titulo="Peso (Tn)" valor={filtros.peso} onChange={(lado, v) => setRango('peso', lado, v)} />
            <Rango titulo={urea ? 'Urea (gl)' : 'Total gal.'} valor={filtros.galones} onChange={(lado, v) => setRango('galones', lado, v)} />
            <Rango titulo="Km/gal (real)" valor={filtros.rendimiento} onChange={(lado, v) => setRango('rendimiento', lado, v)} />
            <Rango titulo="Total (S/)" valor={filtros.gasto} onChange={(lado, v) => setRango('gasto', lado, v)} />
            {!urea && <Rango titulo="Diferencia (gal)" valor={filtros.diferencia} onChange={(lado, v) => setRango('diferencia', lado, v)} />}
          </div>
        </Grupo>
      </div>
    </Sheet>
  );
}
