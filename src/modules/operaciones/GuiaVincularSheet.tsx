import './seguimiento.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Link2, SearchX } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { fmtKg, kgDe, type Guia } from './guiasApi';

interface ServicioOpcion {
  id: number; codigo_orden: string; cliente_nombre: string | null; origen: string | null; destino: string | null; estado_servicio: string | null;
  peso_guias: number | string | null; remitente_generador: string | null; destinatario: string | null; fecha_fmt: string | null;
}
const ETIQUETA: Record<string, string> = { PENDIENTE: 'Pendiente', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ejecución' };
const sin = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const ruidos = new Set(['sac', 'saa', 'srl', 'eirl', 'del', 'las', 'los', 'de', 'la', 'el', 'peru', 'sa', 'cia']);
const palabras = (v: unknown) => sin(v).split(' ').filter(p => p.length > 2 && !ruidos.has(p));

/** Elegir el servicio al que va la guía: su peso pasa al servicio y de ahí al viaje. Primero salen los servicios del mismo cliente. */
export function GuiaVincularSheet({ guia, onClose }: { guia: Guia | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (guia) { setBusqueda(''); setElegido(null); setError(null); } }, [guia]);

  const servicios = useQuery<ServicioOpcion[]>({
    queryKey: ['operaciones', 'servicios-para-guia'], enabled: !!guia, staleTime: 10_000,
    queryFn: () => api<{ data?: ServicioOpcion[] }>('/operaciones/ordenes-servicio').then(r => (r.data ?? []).filter(o => ['PENDIENTE', 'PROGRAMADO', 'EN_EJECUCION'].includes(String(o.estado_servicio ?? 'PENDIENTE').toUpperCase()))),
  });

  const lista = useMemo(() => {
    const nombres = [guia?.remitente_nombre, guia?.destinatario_nombre].map(palabras);
    const coincide = (o: ServicioOpcion) => {
      const del = new Set([...palabras(o.cliente_nombre), ...palabras(o.remitente_generador), ...palabras(o.destinatario)]);
      return nombres.some(ps => ps.filter(p => del.has(p)).length >= Math.min(2, ps.length) && ps.length > 0);
    };
    const t = sin(busqueda);
    return (servicios.data ?? [])
      .filter(o => !t || sin(`${o.codigo_orden} ${o.cliente_nombre} ${o.origen} ${o.destino}`).includes(t))
      .map(o => ({ o, mismo: coincide(o) }))
      .sort((a, b) => Number(b.mismo) - Number(a.mismo));
  }, [servicios.data, guia, busqueda]);

  const sel = lista.find(x => x.o.id === elegido)?.o ?? null;
  const pesoGuia = kgDe(guia?.peso_kg);

  async function vincular() {
    if (!guia || !sel) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${guia.id}/vincular`, { method: 'POST', body: { orden_servicio_id: sel.id } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo vincular la guía');
      haptic('success'); toast(r.message || 'Guía vinculada');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet ancho open={!!guia} onClose={() => !enviando && onClose()} title="Vincular a un servicio"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Link2 size={16} />} onClick={vincular} loading={enviando} disabled={!sel}>Vincular guía</Button></>}>
      <div className="gv">
        <p className="gv__guia"><strong>{guia?.numero_completo}</strong> · {fmtKg(guia?.peso_kg)} · {guia?.destinatario_nombre || guia?.remitente_nombre || 'Sin nombres'}</p>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Busca por código, cliente o ruta" />
        {servicios.isLoading ? <PageLoader /> : servicios.isError ? <Notice tone="error">{errorMessage(servicios.error)}</Notice> : lista.length === 0 ? (
          <EmptyState icon={<SearchX size={22} />} title="Sin servicios abiertos">No hay servicios pendientes, programados o en ejecución que coincidan.</EmptyState>
        ) : (
          <ul className="gv__lista" role="radiogroup" aria-label="Servicios abiertos">
            {lista.map(({ o, mismo }) => (
              <li key={o.id}>
                <button type="button" role="radio" aria-checked={elegido === o.id} className={`gv__fila${elegido === o.id ? ' gv__fila--on' : ''}`} onClick={() => { haptic('selection'); setElegido(o.id); }}>
                  <span className="gv__cod">{o.codigo_orden}</span>
                  <span className="gv__txt"><strong>{o.cliente_nombre || 'Sin cliente'}</strong><span>{[o.origen, o.destino].filter(Boolean).join(' → ') || 'Sin ruta'}</span></span>
                  <span className="gv__der">
                    {mismo && <i className="gv__igual">Mismo cliente</i>}
                    <small>{ETIQUETA[String(o.estado_servicio ?? 'PENDIENTE').toUpperCase()]}{kgDe(o.peso_guias) > 0 ? ` · ${fmtKg(o.peso_guias)}` : ''}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sel && (
          <div className="gv__efecto" role="status">
            El servicio <strong>{sel.codigo_orden}</strong> pasará de <strong>{fmtKg(sel.peso_guias)}</strong> a <strong>{fmtKg(kgDe(sel.peso_guias) + pesoGuia)}</strong>, y el viaje al que pertenece suma lo mismo.
          </div>
        )}
      </div>
    </Sheet>
  );
}
