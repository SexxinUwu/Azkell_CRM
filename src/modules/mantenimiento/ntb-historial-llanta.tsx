import { CircleAlert } from 'lucide-react';
import { EmptyState, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe } from '../../core/lib/format';
import { useFicha } from './NeumaticoHojaVida';

// Línea de tiempo de una llanta en el tablero: corta y directa. Lo más reciente arriba (inspecciones y cambios) y, al fondo, el montaje.

type Tono = 'green' | 'amber' | 'red' | 'blue' | 'gray';
interface Item { clave: string; fecha: string; titulo: string; detalle?: string; meta: string; tono: Tono }

const miles = (n: number) => Number(n).toLocaleString('es-PE');
const dia = (f: string) => formatFechaPe(f.slice(0, 10));
const mm1 = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)} mm`);
// Eventos del kardex que la línea ya cuenta por otro lado (montajes e inspecciones) o que no aportan aquí
const OMITIR = new Set(['APLICACION', 'COMPRA', 'MEDICION_PRESION', 'APUNTE_SURCO', 'MARCA_FUEGO']);
const bonito = (t: string) => { const s = t.replace(/_/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

export function HistorialLlanta({ codigo, limite = 4, onVerTodo }: { codigo: string; limite?: number; onVerTodo?: () => void }) {
  const { data, isLoading, error } = useFicha(codigo);
  if (isLoading) return <PageLoader />;
  if (error) return <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(error)}</Notice>;

  const c = data?.cocada ?? null;
  const items: Item[] = [];

  // Montajes: el momento en que se montó, con su cocada y km
  (c?.montajes ?? []).forEach((m, i) => {
    if (!m.fechaIn) return;
    items.push({
      clave: `m${i}`, fecha: m.fechaIn, tono: 'green',
      titulo: `Montada en ${m.placa ?? '—'} · pos ${m.posicion ?? '—'}`,
      detalle: m.alMontar?.minimo != null ? `Cocada al montar ${mm1(m.alMontar.minimo)}` : undefined,
      meta: `${dia(m.fechaIn)}${m.kmIn != null ? ` · ${miles(m.kmIn)} km` : ''}`,
    });
  });

  // Inspecciones: lo medido y cuánto se lleva gastado desde el alta
  (c?.mediciones ?? []).filter(m => m.origen !== 'Alta' && m.fecha).forEach((m, i) => {
    const gastado = c?.inicial != null && m.minimo != null ? Math.round((c.inicial - m.minimo) * 10) / 10 : null;
    items.push({
      clave: `i${i}`, fecha: m.fecha as string, tono: 'blue',
      titulo: `Inspección · ${mm1(m.minimo)}`,
      detalle: [`R1 ${mm1(m.interno)} · R2 ${mm1(m.central)} · R3 ${mm1(m.externo)}`, gastado != null && gastado > 0 ? `${gastado.toFixed(1)} mm gastados` : null].filter(Boolean).join(' · '),
      meta: `${dia(m.fecha as string)}${m.km != null ? ` · ${miles(m.km)} km` : ''}`,
    });
  });

  // Cambios: envíos y retornos de reencauche, bajas y demás movimientos
  (data?.timeline ?? []).filter(e => e.fecha && !OMITIR.has(e.tipo)).forEach((e, i) => {
    items.push({
      clave: `e${i}`, fecha: e.fecha as string, tono: e.tipo === 'RETIRO' ? 'amber' : e.tipo === 'REFORMA' ? 'blue' : 'gray',
      titulo: e.titulo ? bonito(e.titulo) : bonito(e.tipo), detalle: e.detalle ?? undefined,
      meta: `${dia(e.fecha as string)}${e.km != null ? ` · ${miles(e.km)} km` : ''}`,
    });
  });

  if (!items.length) return <EmptyState icon={<CircleAlert size={20} />} title="Sin movimientos">Esta llanta todavía no tiene montajes ni inspecciones.</EmptyState>;

  // Lo más nuevo arriba; si dos cosas son del mismo día, el montaje queda debajo
  items.sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.clave.startsWith('m') ? 1 : 0) - (b.clave.startsWith('m') ? 1 : 0));
  const visibles = items.slice(0, limite);
  const montaje = items.find(x => x.clave.startsWith('m'));
  // El montaje siempre se ve (es el punto de partida), aunque haya muchas inspecciones
  if (montaje && !visibles.includes(montaje)) visibles.push(montaje);
  const ocultos = items.length - visibles.length;

  return (
    <>
      <ol className="ntb-linea" aria-label={`Línea de tiempo de ${codigo}`}>
        {visibles.map((x, i) => (
          <li key={x.clave} className="ntb-linea__evento">
            <span className={`ntb-linea__punto ntb-linea__punto--${x.tono}`} aria-hidden />
            <div className="ntb-linea__cuerpo">
              <span className="ntb-linea__titulo">{x.titulo}{i === 0 && items.length > 1 && <em className="ntb-linea__actual">Más reciente</em>}</span>
              {x.detalle && <span className="ntb-linea__detalle">{x.detalle}</span>}
              <span className="ntb-linea__meta">{x.meta}</span>
            </div>
          </li>
        ))}
      </ol>
      {ocultos > 0 && onVerTodo && (
        <button type="button" className="ntb-linea__todo" onClick={onVerTodo}>Ver historial completo ({items.length} registros)</button>
      )}
    </>
  );
}
