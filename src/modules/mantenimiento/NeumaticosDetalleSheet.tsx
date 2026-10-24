import './NeumaticosDetalleSheet.css';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Camera, Disc3, Gauge, UserRound } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Sheet } from '../../core/ui/Sheet';
import { VisorFotos, type FotoVisor } from '../../core/ui/VisorFotos';
import { MM_CRITICO, MM_PREVENTIVO, tonoMm, type Tono } from './neumaticosSemaforo';

// Detalle de una inspección de neumáticos (GET /neumaticos/inspecciones/:id).
// Se usa desde Análisis de neumáticos y desde la ficha de la inspección mecánica.

interface DetalleLlanta {
  id?: number; posicion?: string; marca?: string; modelo?: string; medida?: string; estado?: string;
  r1?: number | null; r2?: number | null; r3?: number | null; r4?: number | null; remanente_promedio?: number | string | null;
  presion_actual?: number | null; presion_ant?: number | null; observaciones?: string | null;
  foto1?: string | null; foto2?: string | null; foto3?: string | null;
}
interface RespDetalle {
  ok?: boolean; error?: string;
  data: { id_inspeccion: string; placa: string; fecha_inspeccion: string; km_vehiculo: number | null; inspector?: string | null; detalles: DetalleLlanta[] };
}

const dia = (v: unknown) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const km = (v: number | null | undefined) => (v ? `${Number(v).toLocaleString('es-PE')} km` : '—');
const mm = (v: number | null | undefined) => (v === null || v === undefined || Number(v) === 0 ? '—' : `${Number(v)}`);

const ETIQUETA: Record<Tono, string> = { green: 'Óptima', amber: 'Alerta', red: 'Crítica', gray: 'Sin medir' };

function Dato({ icono, etiqueta, valor }: { icono: ReactNode; etiqueta: string; valor: string }) {
  return (
    <div className="neu-det__dato">
      <span className="neu-det__dato-etiqueta">{icono}{etiqueta}</span>
      <strong className="neu-det__dato-valor">{valor}</strong>
    </div>
  );
}

function LlantaTarjeta({ d, onFoto }: { d: DetalleLlanta; onFoto: (lista: FotoVisor[], i: number) => void }) {
  const prom = Number(d.remanente_promedio ?? 0) || 0;
  const tono = tonoMm(prom);
  const pos = String(d.posicion ?? '-').toUpperCase();
  const fotos = [d.foto1, d.foto2, d.foto3].filter((f): f is string => typeof f === 'string' && f.trim() !== '')
    .map((url, n) => ({ url, titulo: `Posición ${pos} · foto ${n + 1}` }));
  const medidas: [string, number | null | undefined][] = [['R1', d.r1], ['R2', d.r2], ['R3', d.r3]];
  return (
    <article className="neu-det__llanta">
      <header className="neu-det__llanta-cab">
        <span className="neu-det__pos">{pos}</span>
        <div className="neu-det__llanta-id">
          <strong>{(d.marca || 'Sin marca').toUpperCase()}</strong>
          <span>{[d.modelo, d.medida].filter(Boolean).join(' · ') || '—'}</span>
        </div>
        <span className={`neu-det__pill neu-det__pill--${tono}`}>{ETIQUETA[tono]}</span>
      </header>

      <div className="neu-det__medidas">
        {medidas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className={`neu-det__medida neu-det__medida--${tonoMm(Number(valor) || null)}`}>
            <span>{etiqueta}</span>
            <strong>{mm(valor)}</strong>
          </div>
        ))}
        <div className={`neu-det__medida neu-det__medida--prom neu-det__medida--${tono}`}>
          <span>Prom.</span>
          <strong>{prom ? `${prom.toFixed(1)} mm` : '—'}</strong>
        </div>
      </div>

      <div className="neu-det__pie">
        <span className="neu-det__presion">
          {d.presion_actual ? <><strong>{d.presion_actual}</strong> PSI</> : 'Sin presión'}
          {d.presion_ant ? <small> (antes {d.presion_ant})</small> : null}
        </span>
        <span className="neu-det__estado">{(d.estado || 'NUEVA').toUpperCase()}</span>
      </div>

      {d.observaciones && <p className="neu-det__obs">{d.observaciones}</p>}

      <div className="neu-det__fotos">
        {fotos.length === 0
          ? <span className="neu-det__sin-fotos">Sin fotos</span>
          : fotos.map((_f, n) => (
            <button key={n} type="button" className="neu-det__foto" onClick={() => onFoto(fotos, n)}>
              <Camera size={13} /> {fotos.length > 1 ? `Foto ${n + 1}` : 'Ver foto'}
            </button>
          ))}
      </div>
    </article>
  );
}

/** Detalle de una inspección de neumáticos: datos generales y una tarjeta por llanta con sus medidas y observación */
export function InspeccionDetalleSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [fotos, setFotos] = useState<{ lista: FotoVisor[]; i: number } | null>(null);
  const { data, isLoading, error } = useQuery<RespDetalle>({
    queryKey: ['mant', 'neumaticos-detalle', id],
    enabled: id !== null,
    queryFn: async () => {
      const r = await api<RespDetalle>(`/neumaticos/inspecciones/${encodeURIComponent(id ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'Error cargando detalle');
      return r;
    },
  });
  const insp = data?.data;
  const llantas = insp?.detalles ?? [];

  return (
    <>
      <Sheet open={id !== null} onClose={onClose} title="Detalle de neumáticos" ancho
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {isLoading ? <PageLoader /> : insp && (
          <div className="neu-det">
            <div className="neu-det__cab">
              <LicensePlate plate={insp.placa} size="sm" />
              <div className="neu-det__id">
                <span>Inspección</span>
                <strong>{insp.id_inspeccion}</strong>
              </div>
            </div>

            <div className="neu-det__datos">
              <Dato icono={<CalendarDays size={14} />} etiqueta="Fecha" valor={dia(insp.fecha_inspeccion)} />
              <Dato icono={<Gauge size={14} />} etiqueta="Odómetro" valor={km(insp.km_vehiculo)} />
              <Dato icono={<UserRound size={14} />} etiqueta="Inspector" valor={insp.inspector ?? '—'} />
              <Dato icono={<Disc3 size={14} />} etiqueta="Llantas" valor={String(llantas.length)} />
            </div>

            <p className="neu-det__leyenda">Remanente en mm: óptima más de {MM_PREVENTIVO} · alerta de {MM_CRITICO} a {MM_PREVENTIVO} · crítica menos de {MM_CRITICO}</p>

            {llantas.length === 0 ? (
              <EmptyState icon={<Disc3 size={22} />} title="Sin llantas">No se encontraron llantas registradas para esta inspección.</EmptyState>
            ) : (
              <div className="neu-det__grid">
                {llantas.map((d, k) => (
                  <LlantaTarjeta key={(d.id ?? '') + String(d.posicion) + k} d={d} onFoto={(lista, i) => setFotos({ lista, i })} />
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
      <VisorFotos open={!!fotos} onClose={() => setFotos(null)} fotos={fotos?.lista ?? []} indiceInicial={fotos?.i ?? 0} titulo="Fotografía de neumático" />
    </>
  );
}
