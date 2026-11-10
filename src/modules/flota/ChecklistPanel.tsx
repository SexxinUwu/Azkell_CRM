import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { EmptyState } from '../../core/ui/Display';
import { haptic } from '../../core/lib/haptics';
import type { ReporteFalla } from './api';
import { leerOts } from './ChecklistDetalle';

type Persona = 'creador' | 'conductor';

/** Nombre sin la etiqueta "(Conductor)" que algunos reportes antiguos traen pegada */
const limpiar = (s: unknown) => String(s ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim().toUpperCase();
const tieneOt = (f: ReporteFalla) => leerOts(f.ots_generadas_json).length > 0;
const dias = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface Fila { nombre: string; total: number; con: number; sin: number }

function agrupar(items: ReporteFalla[], clave: (f: ReporteFalla) => string): Fila[] {
  const m = new Map<string, Fila>();
  for (const f of items) {
    const n = clave(f) || 'SIN DATO';
    const x = m.get(n) ?? { nombre: n, total: 0, con: 0, sin: 0 };
    x.total++; if (tieneOt(f)) x.con++; else x.sin++;
    m.set(n, x);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** Barra partida: con OT (verde) y sin OT (ámbar), proporcional al mayor del ranking */
function Barra({ fila, max }: { fila: Fila; max: number }) {
  return (
    <span className="ckp-barra" aria-hidden>
      <span className="ckp-barra__con" style={{ width: `${(fila.con / max) * 100}%` }} />
      <span className="ckp-barra__sin" style={{ width: `${(fila.sin / max) * 100}%` }} />
    </span>
  );
}

/** Panel de fallas: quién reporta más, cuáles tienen OT y cuáles no, unidades reincidentes y tendencia. */
export function ChecklistPanel({ items, onPersona, onSinOt }: {
  items: ReporteFalla[];
  /** Abre la lista filtrada por esa persona (quién la creó o el conductor) */
  onPersona: (nombre: string, tipo: Persona) => void;
  onSinOt: () => void;
}) {
  const [persona, setPersona] = useState<Persona>('creador');
  const [verTodos, setVerTodos] = useState(false);

  const total = items.length;
  const conOt = useMemo(() => items.filter(tieneOt).length, [items]);
  const sinOt = total - conOt;

  const ranking = useMemo(() => agrupar(items, f => limpiar(persona === 'creador' ? f.creado_por : f.conductor)), [items, persona]);
  const unidades = useMemo(() => agrupar(items, f => String(f.placa_tracto ?? '').toUpperCase().trim()).slice(0, 8), [items]);
  const antiguos = useMemo(
    () => items.filter(f => !tieneOt(f) && /pendiente/i.test(f.estado || 'Pendiente'))
      .map(f => ({ f, d: dias(f.fecha_reporte) })).sort((a, b) => b.d - a.d).slice(0, 5),
    [items],
  );
  // Reportes por día (rango cargado)
  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of items) { const d = String(f.fecha_reporte ?? '').slice(0, 10); if (d) m.set(d, (m.get(d) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (!total) return <EmptyState icon={<ClipboardCheck size={22} />} title="Sin reportes">No hay reportes de fallas con estos filtros.</EmptyState>;

  const lista = verTodos ? ranking : ranking.slice(0, 8);
  const maxR = Math.max(1, ranking[0]?.total ?? 1);
  const maxU = Math.max(1, unidades[0]?.total ?? 1);
  const maxD = Math.max(1, ...porDia.map(x => x[1]));

  return (
    <div className="ckp">
      <section className="ckp-card ckp-card--cobertura">
        <h3 className="ckp-card__titulo">Cobertura de OT</h3>
        <div className="ckp-cob">
          <span className="ckp-cob__num">{pct(conOt, total)}%</span>
          <span className="ckp-cob__txt">de los reportes ya tiene OT</span>
        </div>
        <span className="ckp-barra ckp-barra--grande" aria-hidden>
          <span className="ckp-barra__con" style={{ width: `${pct(conOt, total)}%` }} />
          <span className="ckp-barra__sin" style={{ width: `${100 - pct(conOt, total)}%` }} />
        </span>
        <div className="ckp-leyenda">
          <span><i className="ckp-pto ckp-pto--con" />Con OT <b>{conOt}</b></span>
          <button type="button" className="ckp-link" onClick={() => { haptic('selection'); onSinOt(); }}><i className="ckp-pto ckp-pto--sin" />Sin OT <b>{sinOt}</b></button>
        </div>
      </section>

      <section className="ckp-card ckp-card--ancha">
        <div className="ckp-card__cab">
          <h3 className="ckp-card__titulo">{persona === 'creador' ? 'Quién reporta más' : 'Conductores con más fallas'}</h3>
          <SegmentedControl label="Agrupar por" value={persona} onChange={setPersona}
            options={[{ value: 'creador', label: 'Quién creó' }, { value: 'conductor', label: 'Conductor' }]} />
        </div>
        <ul className="ckp-lista">
          {lista.map((r, i) => (
            <li key={r.nombre}>
              <button type="button" className="ckp-fila" onClick={() => { haptic('selection'); onPersona(r.nombre, persona); }}>
                <span className="ckp-fila__pos">{i + 1}</span>
                <span className="ckp-fila__cuerpo">
                  <span className="ckp-fila__nombre">{r.nombre}</span>
                  <Barra fila={r} max={maxR} />
                </span>
                <span className="ckp-fila__nums">
                  <b>{r.total}</b>
                  <small>{r.con} con OT · {r.sin} sin</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {ranking.length > 8 && (
          <button type="button" className="ckp-mas" onClick={() => setVerTodos(v => !v)}>{verTodos ? 'Ver menos' : `Ver los ${ranking.length}`}</button>
        )}
      </section>

      <section className="ckp-card">
        <h3 className="ckp-card__titulo">Unidades que más fallan</h3>
        <ul className="ckp-lista">
          {unidades.map(u => (
            <li key={u.nombre} className="ckp-fila ckp-fila--plana">
              <span className="ckp-fila__cuerpo">
                <span className="ckp-fila__nombre ckp-mono">{u.nombre}</span>
                <Barra fila={u} max={maxU} />
              </span>
              <span className="ckp-fila__nums"><b>{u.total}</b><small>{u.sin} sin OT</small></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ckp-card">
        <h3 className="ckp-card__titulo">Sin OT más antiguos</h3>
        {antiguos.length === 0 ? <p className="ckp-vacio">Todos los pendientes ya tienen OT.</p> : (
          <ul className="ckp-lista">
            {antiguos.map(({ f, d }) => (
              <li key={String(f.id)} className="ckp-fila ckp-fila--plana">
                <span className="ckp-fila__cuerpo">
                  <span className="ckp-fila__nombre">{f.folio} · <span className="ckp-mono">{f.placa_tracto || '—'}</span></span>
                  <small className="ckp-sub">{f.conductor || 'Sin conductor'}</small>
                </span>
                <span className={`ckp-edad${d >= 7 ? ' ckp-edad--alta' : ''}`}>{d} {d === 1 ? 'día' : 'días'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ckp-card ckp-card--ancha">
        <h3 className="ckp-card__titulo">Reportes por día</h3>
        <div className="ckp-dias" role="img" aria-label="Reportes por día">
          {porDia.map(([d, n]) => (
            <span key={d} className="ckp-dia" title={`${d.slice(8)}/${d.slice(5, 7)}: ${n}`}>
              <span className="ckp-dia__barra" style={{ height: `${Math.max(8, (n / maxD) * 100)}%` }} />
              <small>{d.slice(8)}</small>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
