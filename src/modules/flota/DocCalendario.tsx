import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { COLOR_PERSONALIZADO, DOCS, colorDoc, estadoDeFecha, type EstadoDoc } from './docsEstado';
import type { FilaExpediente } from './DocExpediente';
import { formatFechaPe } from '../../core/lib/format';

const OTROS = 'otros';
interface Evento { placa: string; clave: string; corto: string; titulo: string; color: string; fecha: string; estado: EstadoDoc }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const TONO: Array<{ value: 'todos' | 'vencido' | 'alerta' | 'vigente'; label: string }> = [
  { value: 'todos', label: 'Todos' }, { value: 'vencido', label: 'Vencidos' }, { value: 'alerta', label: 'Por vencer' }, { value: 'vigente', label: 'Vigentes' },
];

/** Cada vencimiento de la flota como un evento del calendario (los permanentes no tienen fecha que mostrar) */
function eventosDe(filas: FilaExpediente[]): Evento[] {
  const out: Evento[] = [];
  for (const { v, m } of filas) {
    for (const doc of DOCS) {
      const f = String(v[doc.vencimiento] ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) continue;
      out.push({ placa: v.placa, clave: doc.clave, corto: doc.corto, titulo: doc.titulo, color: colorDoc(doc.num), fecha: f, estado: estadoDeFecha(f) });
    }
    for (const { doc } of m.personalizados) {
      const f = String(doc.vencimiento ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || /TIVE/i.test(doc.tipo)) continue;
      out.push({ placa: v.placa, clave: OTROS, corto: doc.tipo, titulo: doc.tipo, color: COLOR_PERSONALIZADO, fecha: f, estado: estadoDeFecha(f) });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
}

const grupoEstado = (e: EstadoDoc) => (e.score === 0 ? 'vencido' : e.score === 1 || e.score === 2 ? 'alerta' : 'vigente');

// Calendario de vencimientos del mes, con el estado del mes y la agenda al lado
export function DocCalendario({ filas, onElegir }: { filas: FilaExpediente[]; onElegir: (placa: string) => void }) {
  const hoy = new Date();
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [tipo, setTipo] = useState<string>('todos');
  const [tono, setTono] = useState<'todos' | 'vencido' | 'alerta' | 'vigente'>('todos');
  const [buscar, setBuscar] = useState('');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const todos = useMemo(() => eventosDe(filas), [filas]);
  const delMes = useMemo(() => {
    const prefijo = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;
    const q = buscar.trim().toUpperCase();
    return todos.filter(e =>
      e.fecha.startsWith(prefijo)
      && (tipo === 'todos' || e.clave === tipo)
      && (tono === 'todos' || grupoEstado(e.estado) === tono)
      && (!q || e.placa.includes(q)));
  }, [todos, mes, tipo, tono, buscar]);

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of delMes) m.set(e.fecha, [...(m.get(e.fecha) ?? []), e]);
    return m;
  }, [delMes]);

  // Seis semanas que empiezan en lunes
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const inicio = new Date(primero);
    inicio.setDate(1 - ((primero.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return { fecha: d, dentro: d.getMonth() === mes.getMonth() };
    });
  }, [mes]);

  const resumen = useMemo(() => {
    const r = { vencido: 0, alerta: 0, vigente: 0 };
    for (const e of delMes) r[grupoEstado(e.estado)]++;
    return r;
  }, [delMes]);

  const titulo = mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const mover = (n: number) => { setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1)); setDiaAbierto(null); };
  const irHoy = () => { setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setDiaAbierto(null); };
  const esHoy = (d: Date) => iso(d) === iso(hoy);

  return (
    <div className="doc-cal">
      <div className="doc-cal__barra">
        <div className="doc-cal__nav">
          <button type="button" className="doc-cal__flecha" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
          <Button variant="secondary" size="sm" onClick={irHoy}>Hoy</Button>
          <button type="button" className="doc-cal__flecha" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          <span className="doc-cal__mes">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</span>
        </div>
        <div className="doc-cal__filtros">
          <select className="doc-cal__select" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de documento">
            <option value="todos">Todos los documentos</option>
            {DOCS.map(d => <option key={d.clave} value={d.clave}>{d.corto}</option>)}
            <option value={OTROS}>Otros (personalizados)</option>
          </select>
          <input className="doc-cal__buscar" type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Filtrar placa…" aria-label="Filtrar por placa" />
          <span className="doc-cal__contador">{delMes.length} vencimientos</span>
        </div>
      </div>

      <div className="doc-cal__cuerpo">
        <div className="doc-cal__grilla-caja">
          <div className="doc-cal__dias-sem">{DIAS.map(d => <span key={d}>{d}</span>)}</div>
          <div className="doc-cal__grilla">
            {celdas.map(({ fecha, dentro }) => {
              const clave = iso(fecha);
              const eventos = porDia.get(clave) ?? [];
              const expandido = diaAbierto === clave;
              const visibles = expandido ? eventos : eventos.slice(0, 2);
              return (
                <div key={clave} className={`doc-cal__dia${dentro ? '' : ' doc-cal__dia--fuera'}${esHoy(fecha) ? ' doc-cal__dia--hoy' : ''}${expandido ? ' doc-cal__dia--expandido' : ''}`}>
                  <div className="doc-cal__cab">
                    {eventos.length > 2 && (
                      <button type="button" className="doc-cal__mas" aria-expanded={expandido}
                        onClick={() => setDiaAbierto(expandido ? null : clave)}>
                        {expandido ? 'Ver menos' : `+${eventos.length - 2} más`}
                      </button>
                    )}
                    <span className="doc-cal__numero">{fecha.getDate()}</span>
                  </div>
                  {visibles.map(e => (
                    <button key={`${e.placa}-${e.clave}-${e.titulo}`} type="button" className="doc-cal__evento" title={`${e.placa} · ${e.titulo} · ${e.estado.texto}`}
                      style={{ background: `${e.color}1f`, color: e.color, borderColor: e.estado.color }}
                      onClick={() => onElegir(e.placa)}>
                      {e.placa} · {e.corto}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="doc-cal__lateral">
          <section className="doc-cal__bloque">
            <h3 className="doc-cal__titulo">Estado del mes</h3>
            <div className="doc-cal__resumen">
              <div className="doc-cal__fila doc-cal__fila--vencido"><span>Vencidos este mes</span><strong>{resumen.vencido}</strong></div>
              <div className="doc-cal__fila doc-cal__fila--alerta"><span>Por vencer</span><strong>{resumen.alerta}</strong></div>
              <div className="doc-cal__fila doc-cal__fila--vigente"><span>Vigentes en el mes</span><strong>{resumen.vigente}</strong></div>
            </div>
            <select className="doc-cal__select doc-cal__select--ancho" value={tono} onChange={e => setTono(e.target.value as typeof tono)} aria-label="Estado del vencimiento">
              {TONO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </section>

          <section className="doc-cal__bloque doc-cal__bloque--agenda">
            <h3 className="doc-cal__titulo">Vencimientos en agenda</h3>
            {delMes.length === 0 && <p className="doc-cal__vacio">No hay vencimientos en este mes.</p>}
            <ul className="doc-cal__agenda">
              {delMes.map(e => (
                <li key={`${e.placa}-${e.clave}-${e.titulo}-${e.fecha}`}>
                  <button type="button" onClick={() => onElegir(e.placa)}>
                    <span className="doc-cal__agenda-icono" style={{ color: e.color }}>●</span>
                    <span className="doc-cal__agenda-texto">
                      <strong>{e.placa} · {e.corto}</strong>
                      <span>Vence: {formatFechaPe(e.fecha)}</span>
                    </span>
                    <span className="doc-cal__chip" style={{ color: e.estado.color, borderColor: e.estado.color }}>{e.estado.texto}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
