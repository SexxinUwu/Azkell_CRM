import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../../core/ui/Toast';
import { Button } from '../../core/ui/Button';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { formatFechaPe } from '../../core/lib/format';
import { eventosDe, iso, type Evento } from './DocCalendario';
import { llevarAlCalendario, type EventoVencimiento } from './calendarioIcs';
import type { FilaExpediente } from './DocExpediente';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Misma regla de la matriz (estadoDeFecha): vencido, hasta 15 días, hasta 30 días y el resto
const COLOR: Record<string, string> = { vencido: 'var(--red)', critico: 'var(--amber)', alerta: 'var(--blue)', vigente: 'var(--green)', sin: 'var(--label-3)' };
const LEYENDA = [['vencido', 'Vencido'], ['critico', '≤ 15 días'], ['alerta', '≤ 30 días'], ['vigente', 'Más de 30']] as const;
const peor = (es: Evento[]) => es.reduce((a, e) => (e.estado.score < a.estado.score ? e : a)).estado.clave;

/** Mini calendario de la matriz: un círculo por día con vencimientos, del color del documento más urgente */
export function DocMiniCalendario({ filas }: { filas: FilaExpediente[] }) {
  const hoy = new Date();
  const toast = useToast();
  const { user } = useAuth();
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [dia, setDia] = useState<string | null>(null);

  const todos = useMemo(() => eventosDe(filas), [filas]);
  const porDia = useMemo(() => {
    const prefijo = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;
    const m = new Map<string, Evento[]>();
    for (const e of todos) if (e.fecha.startsWith(prefijo)) m.set(e.fecha, [...(m.get(e.fecha) ?? []), e]);
    return m;
  }, [todos, mes]);
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const vacias = (primero.getDay() + 6) % 7;
    const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    return [...Array<null>(vacias).fill(null), ...Array.from({ length: total }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))];
  }, [mes]);

  const titulo = mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const mover = (n: number) => { setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1)); setDia(null); };
  const delDia = dia ? porDia.get(dia) ?? [] : [];
  const totalMes = [...porDia.values()].reduce((s, e) => s + e.length, 0);

  const agregar = async (eventos: Evento[]) => {
    const lista: EventoVencimiento[] = eventos.map(e => ({ placa: e.placa, documento: e.titulo, fecha: e.fecha, dias: e.estado.dias ?? 0, vencido: e.estado.clave === 'vencido' }));
    try {
      const r = await llevarAlCalendario(lista, user?.companyName ?? '');
      if (r === 'descargado') toast('Se descargó vencimientos-flota.ics: ábrelo en tu teléfono o calendario.');
    } catch (err) { toast(errorMessage(err), 'error'); }
  };

  return (
    <aside className="doc-mini" aria-label="Vencimientos del mes">
      <div className="doc-mini__nav">
        <button type="button" className="doc-cal__flecha" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <strong className="doc-mini__mes">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong>
        <button type="button" className="doc-cal__flecha" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      </div>
      <div className="doc-mini__grilla" role="grid">
        {DIAS.map((d, i) => <span key={i} className="doc-mini__sem" aria-hidden>{d}</span>)}
        {celdas.map((f, i) => {
          if (!f) return <span key={`v${i}`} />;
          const clave = iso(f);
          const eventos = porDia.get(clave);
          const color = eventos ? COLOR[peor(eventos)] : undefined;
          return (
            <button key={clave} type="button" disabled={!eventos} aria-pressed={dia === clave}
              aria-label={eventos ? `${f.getDate()}: ${eventos.length} vencimientos` : String(f.getDate())}
              className={`doc-mini__dia${clave === iso(hoy) ? ' doc-mini__dia--hoy' : ''}${dia === clave ? ' doc-mini__dia--sel' : ''}`}
              style={color ? ({ '--mini-color': color } as React.CSSProperties) : undefined}
              onClick={() => setDia(d => (d === clave ? null : clave))}>
              {f.getDate()}
            </button>
          );
        })}
      </div>
      <div className="doc-mini__leyenda">
        {LEYENDA.map(([k, t]) => <span key={k}><i style={{ background: COLOR[k] }} />{t}</span>)}
      </div>

      <div className="doc-mini__lista">
        {!dia && <p className="doc-cal__vacio">{totalMes ? `${totalMes} vencimientos este mes. Toca un día marcado para ver el detalle.` : 'No hay vencimientos en este mes.'}</p>}
        {dia && (
          <>
            <div className="doc-mini__cab">
              <strong>{formatFechaPe(dia)}</strong>
              <Button variant="secondary" size="sm" icon={<CalendarPlus size={15} />} onClick={() => agregar(delDia)}>Agregar al calendario</Button>
            </div>
            <ul className="doc-mini__items">
              {delDia.map(e => (
                <li key={`${e.placa}-${e.clave}-${e.titulo}`}>
                  <i style={{ background: COLOR[e.estado.clave] }} />
                  <span><strong>{e.placa}</strong> · {e.titulo}<small>{e.estado.texto}</small></span>
                  <button type="button" className="doc-mini__ics" aria-label={`Agregar ${e.titulo} de ${e.placa} al calendario`} title="Agregar este vencimiento al calendario" onClick={() => agregar([e])}><CalendarPlus size={15} /></button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
