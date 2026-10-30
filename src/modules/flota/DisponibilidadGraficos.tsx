// Vista «Gráficos» de Disponibilidad: tarjetas por subtipo (clic para filtrar el gráfico), barras por estado y matriz resumen.
// Calca la vista del clásico (dispRenderizarGraficosSubTipos): mismos conteos, mismo total general y mismo filtro.
import { Truck } from 'lucide-react';
import { Badge, EmptyState } from '../../core/ui/Display';
import { BarrasAgrupadasGrafico } from '../../core/ui/Graficos';

export interface FilaSubtipo { total: number; base: number; ruta: number; mantenimiento: number }

// Color de cada subtipo (mismos tonos del clásico). Se compara sin acentos y en mayúsculas, como getSubTipoStyle.
const COLOR_SUBTIPO: { clave: string; color: string }[] = [
  { clave: 'THERMO', color: '#0891b2' },
  { clave: 'TRACTO', color: '#ea580c' },
  { clave: 'CAMION', color: '#0284c7' },
  { clave: 'CARRETA', color: '#9333ea' },
  { clave: 'REMOLQUE', color: '#15803d' },
  { clave: 'FURGON', color: '#4f46e5' },
  { clave: 'CONTENEDOR', color: '#0d9488' },
  { clave: 'PLATAFORMA', color: '#d97706' },
];
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const colorDe = (subtipo: string) => COLOR_SUBTIPO.find(c => sinAcentos(subtipo).includes(c.clave))?.color ?? '#64748b';

const SERIES = [
  { clave: 'base', nombre: 'En base', color: 'var(--green)' },
  { clave: 'ruta', nombre: 'En ruta', color: 'var(--blue)' },
  { clave: 'mantenimiento', nombre: 'En mantenimiento', color: 'var(--red)' },
] as const;

export function DisponibilidadGraficos({ filas, titulo, subtipo, onElegirSubtipo }: {
  filas: [string, FilaSubtipo][];
  titulo: string;
  subtipo: string | null;
  onElegirSubtipo: (s: string | null) => void;
}) {
  if (filas.length === 0) {
    return <EmptyState icon={<Truck size={22} />} title="Sin subtipos">No hay subtipos disponibles para los filtros seleccionados.</EmptyState>;
  }
  const total = filas.reduce((acc, [, f]) => ({
    total: acc.total + f.total, base: acc.base + f.base, ruta: acc.ruta + f.ruta, mantenimiento: acc.mantenimiento + f.mantenimiento,
  }), { total: 0, base: 0, ruta: 0, mantenimiento: 0 });
  // El filtro por subtipo solo recorta el gráfico (como en el clásico); las tarjetas y la matriz siguen completas
  const enGrafico = subtipo ? filas.filter(([nombre]) => nombre === subtipo) : filas;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <p className="tarjeta__grupo-titulo" style={{ margin: 0 }}>{titulo}</p>
        <Badge tone={subtipo ? 'accent' : 'gray'}>{subtipo ? `Subtipo: ${subtipo}` : 'Todos los subtipos'}</Badge>
      </div>

      <div className="disp-subtipo-grid">
        {filas.map(([nombre, f]) => {
          const activo = subtipo === nombre;
          return (
            <button key={nombre} type="button" className="disp-subtipo-card pressable" aria-pressed={activo} title={`Filtrar por ${nombre}`}
              style={{ background: colorDe(nombre) }} onClick={() => onElegirSubtipo(activo ? null : nombre)}>
              <span className="disp-subtipo-card__num">{f.total}</span>
              <span className="disp-subtipo-card__lbl">{nombre}</span>
              <Truck size={20} className="disp-subtipo-card__icono" aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="disp-tabla-wrap" style={{ padding: 'var(--s-3)' }}>
        <BarrasAgrupadasGrafico
          categorias={enGrafico.map(([nombre]) => nombre)}
          series={SERIES.map(s => ({ clave: s.clave, nombre: s.nombre, color: s.color, valores: enGrafico.map(([, f]) => f[s.clave]) }))}
          altura={320}
        />
      </div>

      <div className="disp-tabla-wrap">
        <table className="disp-matriz">
          <thead>
            <tr><th>Sub tipo de unidad</th><th>Total</th><th>En base</th><th>En ruta</th><th>En mantenimiento</th></tr>
          </thead>
          <tbody>
            {filas.map(([nombre, f]) => (
              <tr key={nombre}><td>{nombre}</td><td>{f.total}</td><td>{f.base}</td><td>{f.ruta}</td><td>{f.mantenimiento}</td></tr>
            ))}
            <tr className="disp-matriz__total"><td>TOTAL GENERAL</td><td>{total.total}</td><td>{total.base}</td><td>{total.ruta}</td><td>{total.mantenimiento}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
