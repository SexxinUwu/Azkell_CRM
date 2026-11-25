import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Gauge, MapPin, Navigation, X } from 'lucide-react';
import { Button } from '../../../core/ui/Button';
import { LicensePlate } from '../../../core/ui/LicensePlate';
import { fechaHora, type Historial } from '../UbicacionHistorial';
import { enlaceCalle, puntoCardinal, useSensoresMensaje, useStreetView, type EstadoCalle } from './recorridoApi';

// Reproductor del recorrido (como el "Track player" de Wialon): hora y velocidad del punto, foto de la calle y sensores de la unidad en ese instante.
// Se abre al dar play en la barra de reproducción. Mientras corre, la foto y los sensores se refrescan cada 2 s para no gastar consultas de más.

const AVISO_CALLE: Record<EstadoCalle, string> = {
  sin_clave: 'Falta configurar la clave de Google Maps en el servidor. Mientras tanto puedes abrir la calle en Google.',
  sin_cobertura: 'Google no tiene fotos de calle en este punto.',
  limite_diario: 'Se llegó al tope diario de fotos de calle. Puedes abrir la calle en Google.',
  error: 'No se pudo cargar la foto de la calle.',
};

function Seccion({ titulo, abierta = true, children }: { titulo: string; abierta?: boolean; children: React.ReactNode }) {
  const [ab, setAb] = useState(abierta);
  return (
    <section className="tg-pp-sec">
      <button type="button" className="tg-pp-sec__cab" aria-expanded={ab} onClick={() => setAb(v => !v)}><span>{titulo}</span><ChevronDown size={16} aria-hidden /></button>
      {ab && <div className="tg-pp-sec__cuerpo">{children}</div>}
    </section>
  );
}

export function TrackPlayer({ placa, unitId, historial, indice, reproduciendo, onCerrar }: {
  placa: string; unitId: number | null; historial: Historial; indice: number; reproduciendo: boolean; onCerrar: () => void;
}) {
  const p = historial.puntos[Math.min(indice, historial.puntos.length - 1)];
  // Mientras reproduce, el punto "visto" por la foto y los sensores se actualiza cada 2 s; al pausar o mover la barra, al instante
  const [visto, setVisto] = useState(p);
  const ultimo = useRef(0);
  useEffect(() => {
    if (!p) return;
    if (!reproduciendo || Date.now() - ultimo.current >= 2000) { setVisto(p); ultimo.current = Date.now(); return; }
    const t = setTimeout(() => { setVisto(p); ultimo.current = Date.now(); }, 2000 - (Date.now() - ultimo.current));
    return () => clearTimeout(t);
  }, [p, reproduciendo]);

  const calle = useStreetView(visto?.lat ?? null, visto?.lng ?? null, visto?.curso ?? 0, !!visto);
  const sensores = useSensoresMensaje(unitId, visto?.tiempo ?? null, !!visto);
  if (!p) return null;
  const errCalle = calle.error?.estado;

  return (
    <aside className="tg-pp tg-glass" aria-label="Reproductor del recorrido">
      <header className="tg-pp-cab">
        <LicensePlate plate={/^[A-Z0-9]{6}$/.test(placa) ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa} size="sm" />
        <span className="tg-pp-cab__t">Reproductor del recorrido</span>
        <Button variant="plain" iconOnly size="sm" icon={<X size={18} />} aria-label="Cerrar reproductor" onClick={onCerrar} />
      </header>

      <div className="tg-pp-dato">
        <span className="tg-pp-hora">{fechaHora(p.tiempo)}</span>
        <span className="tg-pp-vel"><Gauge size={14} aria-hidden /><b className="t-numeric">{Math.round(p.velocidad)}</b> km/h</span>
        <span className="tg-pp-rumbo"><Navigation size={14} aria-hidden style={{ transform: `rotate(${p.curso - 45}deg)` }} />{puntoCardinal(p.curso)} · {Math.round(p.curso)}°</span>
        <span className="tg-pp-estado" data-mov={p.velocidad > 3 ? 'si' : 'no'}>{p.velocidad > 3 ? 'En movimiento' : p.ignicion ? 'Detenido, motor encendido' : 'Detenido'}</span>
      </div>

      <Seccion titulo="Calle (Google Street View)">
        <div className="tg-pp-calle">
          {calle.data
            ? <img src={calle.data} alt="Vista de la calle en este punto del recorrido" width={480} height={300} />
            : <div className="tg-pp-calle__vacio">{calle.isLoading ? 'Cargando foto…' : errCalle ? AVISO_CALLE[errCalle] : '—'}</div>}
          {calle.isFetching && calle.data && <i className="tg-pp-calle__carga" aria-hidden />}
        </div>
        <a className="btn btn--secondary btn--sm tg-pp-ver" href={enlaceCalle(p.lat, p.lng, p.curso)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />Ver calle en Google
        </a>
      </Seccion>

      <Seccion titulo="Sensores">
        {sensores.isLoading ? <p className="tg-pp-nota">Cargando sensores…</p>
          : sensores.isError ? <p className="tg-pp-nota">No se pudieron leer los sensores en este momento.</p>
            : (
              <dl className="tg-pp-sens">
                {(sensores.data?.sensores ?? []).map(s => (
                  <div key={s.id}><dt>{s.nombre}</dt><dd className="t-numeric">{s.texto ?? s.valor.toLocaleString('es-PE')}{s.unidad ? ` ${s.unidad}` : ''}</dd></div>
                ))}
                {!sensores.data?.sensores?.length && <p className="tg-pp-nota">La unidad no tiene sensores configurados.</p>}
              </dl>
            )}
        {sensores.isFetching && sensores.data && <p className="tg-pp-nota">Actualizando…</p>}
      </Seccion>

      <p className="tg-pp-pie"><MapPin size={12} aria-hidden />{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
    </aside>
  );
}
