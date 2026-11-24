import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import '../flota/documentos.css';
import { Button } from '../../core/ui/Button';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe } from '../../core/lib/format';
import { llevarAlCalendario, type EventoVencimiento } from '../flota/calendarioIcs';

// Calendario de vencimientos de los documentos de la API de Marsisa: el mismo diseño del calendario de Documentos de flota
// (mes con sus vencimientos, estado del mes y agenda al lado). Solo cuenta el documento vigente de cada tipo de cada unidad.

export type EstadoCal = 'vigente' | 'por_vencer' | 'vencido' | 'sin_vencimiento';
export interface EventoCal { placa: string; codigo: string; corto: string; titulo: string; color: string; fecha: string; estado: EstadoCal; dias: number | null; texto: string }

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
type Tono = 'todos' | 'vencido' | 'alerta' | 'vigente';
const TONOS: Array<{ value: Tono; label: string }> = [{ value: 'todos', label: 'Todos' }, { value: 'vencido', label: 'Vencidos' }, { value: 'alerta', label: 'Por vencer' }, { value: 'vigente', label: 'Vigentes' }];
const COLOR_ESTADO: Record<EstadoCal, string> = { vigente: 'var(--green-ink)', por_vencer: 'var(--amber-ink)', vencido: 'var(--red-ink)', sin_vencimiento: 'var(--label-3)' };
const grupoDe = (e: EstadoCal): Exclude<Tono, 'todos'> => (e === 'vencido' ? 'vencido' : e === 'por_vencer' ? 'alerta' : 'vigente');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DocsMarsisaCalendario({ eventos, tipos, onElegir }: {
  eventos: EventoCal[]; tipos: Array<{ value: string; label: string }>; onElegir: (placa: string) => void;
}) {
  const hoy = new Date();
  const toast = useToast();
  const { user } = useAuth();
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [tipo, setTipo] = useState('todos');
  const [tono, setTono] = useState<Tono>('todos');
  const [buscar, setBuscar] = useState('');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  // Lo vencido y lo que vence en 30 días o menos se puede llevar al calendario del teléfono (.ics)
  const porVencer = useMemo<EventoVencimiento[]>(() => eventos
    .filter(e => e.estado === 'vencido' || e.estado === 'por_vencer')
    .map(e => ({ placa: e.placa, documento: e.titulo, fecha: e.fecha, dias: e.dias ?? 0, vencido: e.estado === 'vencido' }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa)), [eventos]);
  const alCalendario = async () => {
    try {
      const r = await llevarAlCalendario(porVencer, user?.companyName ?? '');
      if (r === 'descargado') toast('Se descargó vencimientos-flota.ics: ábrelo en tu teléfono o calendario para agregarlos.');
    } catch (err) { toast(errorMessage(err), 'error'); }
  };

  const delMes = useMemo(() => {
    const prefijo = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;
    const q = buscar.trim().toUpperCase();
    return eventos.filter(e => e.fecha.startsWith(prefijo) && (tipo === 'todos' || e.codigo === tipo) && (tono === 'todos' || grupoDe(e.estado) === tono) && (!q || e.placa.includes(q)))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
  }, [eventos, mes, tipo, tono, buscar]);

  const porDia = useMemo(() => {
    const m = new Map<string, EventoCal[]>();
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
    for (const e of delMes) r[grupoDe(e.estado)]++;
    return r;
  }, [delMes]);

  const titulo = mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const mover = (n: number) => { setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1)); setDiaAbierto(null); };
  const irHoy = () => { setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setDiaAbierto(null); };

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
            {tipos.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="doc-cal__buscar" type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Filtrar placa…" aria-label="Filtrar por placa" />
          <span className="doc-cal__contador">{delMes.length} vencimientos</span>
          <Button variant="secondary" size="sm" icon={<CalendarPlus size={15} />} disabled={!porVencer.length} onClick={alCalendario}
            title="Agrega al calendario del teléfono todos los documentos vencidos y por vencer">Agregar al calendario ({porVencer.length})</Button>
        </div>
      </div>

      <div className="doc-cal__cuerpo">
        <div className="doc-cal__grilla-caja">
          <div className="doc-cal__dias-sem">{DIAS.map(d => <span key={d}>{d}</span>)}</div>
          <div className="doc-cal__grilla">
            {celdas.map(({ fecha, dentro }) => {
              const clave = iso(fecha);
              const delDia = porDia.get(clave) ?? [];
              const expandido = diaAbierto === clave;
              const visibles = expandido ? delDia : delDia.slice(0, 2);
              return (
                <div key={clave} className={`doc-cal__dia${dentro ? '' : ' doc-cal__dia--fuera'}${clave === iso(hoy) ? ' doc-cal__dia--hoy' : ''}${expandido ? ' doc-cal__dia--expandido' : ''}`}>
                  <div className="doc-cal__cab">
                    {delDia.length > 2 && (
                      <button type="button" className="doc-cal__mas" aria-expanded={expandido} onClick={() => setDiaAbierto(expandido ? null : clave)}>
                        {expandido ? 'Ver menos' : `+${delDia.length - 2} más`}
                      </button>
                    )}
                    <span className="doc-cal__numero">{fecha.getDate()}</span>
                  </div>
                  {visibles.map(e => (
                    <button key={`${e.placa}-${e.codigo}`} type="button" className="doc-cal__evento" title={`${e.placa} · ${e.titulo} · ${e.texto}`}
                      style={{ background: `${e.color}1f`, color: e.color, borderColor: COLOR_ESTADO[e.estado] }} onClick={() => onElegir(e.placa)}>
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
            <select className="doc-cal__select doc-cal__select--ancho" value={tono} onChange={e => setTono(e.target.value as Tono)} aria-label="Estado del vencimiento">
              {TONOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </section>

          <section className="doc-cal__bloque doc-cal__bloque--agenda">
            <h3 className="doc-cal__titulo">Vencimientos en agenda</h3>
            {delMes.length === 0 && <p className="doc-cal__vacio">No hay vencimientos en este mes.</p>}
            <ul className="doc-cal__agenda">
              {delMes.map(e => (
                <li key={`${e.placa}-${e.codigo}-${e.fecha}`}>
                  <button type="button" onClick={() => onElegir(e.placa)}>
                    <span className="doc-cal__agenda-icono" style={{ color: e.color }}>●</span>
                    <span className="doc-cal__agenda-texto">
                      <strong>{e.placa} · {e.corto}</strong>
                      <span>Vence: {formatFechaPe(e.fecha)}</span>
                    </span>
                    <span className="doc-cal__chip" style={{ color: COLOR_ESTADO[e.estado], borderColor: COLOR_ESTADO[e.estado] }}>{e.texto}</span>
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
