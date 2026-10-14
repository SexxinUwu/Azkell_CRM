import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays, Truck } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface Viaje {
  viaje: string; fecha_viaje: string | null; conductor: string | null; placa_tracto: string | null; placa_remolque: string | null;
  ruta: string | null; estado: string; ordenes_list: string | null; peso_ida?: number | string; peso_retorno?: number | string;
}

const color = (e: string) => ({ ACTIVO: 'amber', INICIADO: 'accent', FINALIZADO: 'green' }[e] ?? 'gray');
const clave = (s: string | null) => (s ? String(s).slice(0, 10) : 'SIN FECHA');

function etiquetaDia(k: string) {
  if (k === 'SIN FECHA') return 'Sin fecha';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(k + 'T00:00:00');
  const dif = Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  if (dif === -1) return 'Ayer';
  const t = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Operaciones › Programación: agenda de viajes por día (órdenes de viaje activas e iniciadas).
export function ProgramacionPage() {
  const [busqueda, setBusqueda] = useState('');
  const [verFinalizados, setVerFinalizados] = useState(false);

  const q = useQuery<Viaje[]>({
    queryKey: ['operaciones', 'programacion'],
    queryFn: () => api<{ data?: Viaje[] }>('/operaciones/ordenes-viaje?limit=500').then(r => r.data ?? []),
    staleTime: 30_000,
  });

  const dias = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    const m = new Map<string, Viaje[]>();
    for (const v of q.data ?? []) {
      if (v.estado === 'ANULADO' || (!verFinalizados && v.estado === 'FINALIZADO')) continue;
      if (t && ![v.viaje, v.conductor, v.placa_tracto, v.placa_remolque, v.ruta].some(x => String(x ?? '').toUpperCase().includes(t))) continue;
      const k = clave(v.fecha_viaje);
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [q.data, busqueda, verFinalizados]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Programación"
        subtitle="Viajes programados y en curso, por día"
        actions={
          <MenuOtros opciones={[
            { label: verFinalizados ? 'Ocultar finalizados' : 'Mostrar finalizados', icon: <CalendarDays size={17} />, onSelect: () => setVerFinalizados(v => !v) },
            { label: 'Crear o editar viajes', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('operaciones/ordenes-viaje') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Viaje, conductor, placa o ruta…" />

        {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : dias.length === 0 ? (
          <EmptyState icon={<CalendarDays size={22} />} title="Sin viajes programados">Los viajes se crean en Órdenes de viaje.</EmptyState>
        ) : dias.map(([k, viajes]) => (
          <section key={k}>
            <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--label-2)', margin: '0 var(--s-3) var(--s-2)' }}>{etiquetaDia(k)} · {viajes.length}</h2>
            <div className="tarjeta__lista">
              {viajes.map(v => (
                <div key={v.viaje} className="mov-fila">
                  <div className="mov-fila__icon" style={{ background: `var(--${color(v.estado)}-tint)`, color: `var(--${color(v.estado)}-ink)` }}><Truck size={16} /></div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{v.conductor || 'Sin conductor'} · {v.placa_tracto || '—'}{v.placa_remolque ? ` + ${v.placa_remolque}` : ''}</span>
                    <span className="mov-fila__sub">{[v.viaje, v.ruta, v.ordenes_list].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${color(v.estado)}-ink)` }}>{v.estado}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
