// Ficha de la unidad: velocímetro, brújula, velocidad de los últimos 2 minutos y solo los datos que existen.
import { useEffect, useRef, useState } from 'react';
import { MapPin, MessageCircle, Navigation, Route, X } from 'lucide-react';
import { Button } from '../../../core/ui/Button';
import { LicensePlate } from '../../../core/ui/LicensePlate';
import { AsaHoja, ZonaArrastre } from './HojaGesto';
import { ST } from './camiones';
import type { Lectura, MotorTelemetria } from './motor';
import { factorCombustible } from './unidadCombustible';
import { EXCESO_KMH } from './mapaConfig';
import { useCombustible, type UnidadMapa } from '../api';

const CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Lectura en vivo de la unidad (velocidad, rumbo interpolado e historial corto), cada medio segundo */
export function useLectura(motor: MotorTelemetria | null, placa: string): Lectura | null {
  const [l, setL] = useState<Lectura | null>(() => motor?.leer(placa) ?? null);
  useEffect(() => {
    if (!motor) return;
    const leer = () => setL(motor.leer(placa));
    leer();
    const t = setInterval(leer, 500);
    return () => clearInterval(t);
  }, [motor, placa]);
  return l;
}

function Velocimetro({ kmh }: { kmh: number }) {
  const max = 120, frac = Math.min(1, kmh / max), R = 58, len = Math.PI * R * 1.5;
  const col = kmh > EXCESO_KMH ? ST.off.c : kmh > 2 ? ST.mov.c : ST.det.c;
  return (
    <svg viewBox="0 0 150 110" role="img" aria-label={`${Math.round(kmh)} kilómetros por hora`}>
      <path d="M22 96 A58 58 0 1 1 128 96" fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
      <path d="M22 96 A58 58 0 1 1 128 96" fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(len * frac).toFixed(1)} 999`} style={{ filter: `drop-shadow(0 0 6px ${col})`, transition: 'stroke-dasharray .3s' }} />
      <text x="75" y="70" textAnchor="middle" className="num">{Math.round(kmh)}</text>
      <text x="75" y="88" textAnchor="middle" className="unitlbl">KM/H</text>
    </svg>
  );
}

function Grafico({ hist }: { hist: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = c.clientWidth, hh = c.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (!w || !hh) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    if (hist.length < 2) return;
    const max = 110, x = (i: number) => i / 119 * w, y = (v: number) => hh - 4 - Math.min(1, v / max) * (hh - 10);
    const acento = getComputedStyle(c).getPropertyValue('--accent').trim() || '#f56300';
    const grad = g.createLinearGradient(0, 0, 0, hh); grad.addColorStop(0, acento); grad.addColorStop(1, 'transparent');
    const off = 120 - hist.length;
    g.beginPath(); g.moveTo(x(off), hh); hist.forEach((v, i) => g.lineTo(x(off + i), y(v))); g.lineTo(x(off + hist.length - 1), hh); g.globalAlpha = 0.28; g.fillStyle = grad; g.fill(); g.globalAlpha = 1;
    g.beginPath(); hist.forEach((v, i) => (i ? g.lineTo(x(off + i), y(v)) : g.moveTo(x(off + i), y(v)))); g.strokeStyle = acento; g.lineWidth = 2; g.stroke();
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,84,112,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y(EXCESO_KMH)); g.lineTo(w, y(EXCESO_KMH)); g.stroke(); g.setLineDash([]);
  }, [hist, hist.length]);
  return <canvas ref={ref} className="tg-spark" aria-hidden />;
}

const hace = (ms: number) => {
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
};
const placaPeru = (p: string) => (/^[A-Z0-9]{6}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p);

interface Props {
  u: UnidadMapa;
  motor: MotorTelemetria | null;
  conductor: string | null;
  piloto: boolean;
  /** Capacidad del tanque de la placa (galones), si está registrada */
  capacidad: number | null;
  onCerrar: () => void;
  onHistorial: () => void;
}

export function FichaTelemetria({ u, motor, conductor, piloto, capacidad, onCerrar, onHistorial }: Props) {
  const l = useLectura(motor, u.placa);
  const combustible = useCombustible(u.id).data;
  // En % directo, o en galones/litros convertidos con la capacidad del tanque; sin capacidad se muestra en galones
  const nivelComb = (() => {
    if (!combustible || combustible.nivel == null) return null;
    const f = factorCombustible(combustible.unidad, capacidad);
    const nombre = combustible.nombre;
    if (f.unidad === '%') {
      const pct = combustible.unidad === '%' ? combustible.nivel : combustible.nivel * f.factor;
      // Si la cuenta pasa de 100 %, la capacidad registrada no coincide con el sensor: se muestra la lectura sin inventar un porcentaje
      if (pct > 105) return { pct: null, nombre, texto: `${Math.round(combustible.nivel * 10) / 10} ${combustible.unidad}` };
      return { pct, nombre, texto: `${Math.round(pct)} %` };
    }
    return { pct: null, nombre, texto: `${Math.round(combustible.nivel * f.factor * 10) / 10} gal` };
  })();
  const st = l?.st ?? 'det';
  const s = ST[st];
  const kmh = l?.kmh ?? u.velocidad;
  const rumbo = l?.rumbo ?? u.rumbo;
  const tienePos = u.lat != null && u.lng != null;
  const estadoTxt = st === 'off'
    ? `Sin señal${u.tPos ? ` · hace ${hace(Date.now() - u.tPos)}` : ''}`
    : s.l + (st === 'ral' ? ' · motor encendido' : '');
  const maps = tienePos ? `https://maps.google.com/maps?q=${u.lat},${u.lng}` : '';
  const waze = tienePos ? `https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes` : '';
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Unidad ${u.placa}: ${estadoTxt}. ${u.ubicacion} ${maps}`.trim())}`;

  // Solo se muestran los datos que Wialon o el ERP tienen
  const celdas: Array<{ t: string; v: string; ancho?: boolean }> = [];
  if (u.km > 0) celdas.push({ t: 'Odómetro', v: `${u.km.toLocaleString('es-PE')} km` });
  if (u.horas > 0) celdas.push({ t: 'Horómetro', v: `${u.horas.toLocaleString('es-PE')} hrs` });
  celdas.push({ t: u.voltaje ? 'Batería / ignición' : 'Ignición', v: `${u.voltaje ? `${u.voltaje} V · ` : ''}Motor ${u.ignicion ? 'ON' : 'OFF'}` });
  const gps = [u.satelites ? `${u.satelites} sat` : '', u.altitud ? `${Math.round(u.altitud)} msnm` : ''].filter(Boolean).join(' · ');
  if (gps) celdas.push({ t: u.satelites && u.altitud ? 'Satélites / altitud' : u.satelites ? 'Satélites' : 'Altitud', v: gps });
  if (conductor) celdas.push({ t: 'Conductor', v: conductor, ancho: true });
  if (l?.geocerca) celdas.push({ t: 'Geocerca', v: l.geocerca, ancho: true });

  return (
    <>
      <AsaHoja />
      <ZonaArrastre className="tg-d-head">
        <LicensePlate plate={placaPeru(u.placa)} />
        <div className="t">
          <strong>{u.marcaModelo || u.nombre || u.placa}</strong>
          <span>{[u.tipo, u.empresa].filter(Boolean).join(' · ')}</span>
        </div>
        <Button variant="plain" iconOnly icon={<X size={18} />} aria-label="Cerrar ficha" onClick={onCerrar} />
      </ZonaArrastre>
      <span className="tg-state" style={{ background: s.c + '22', color: s.c }}>● {estadoTxt}</span>
      {l?.edadS != null && st !== 'off' && <span className="tg-edad" title="El equipo GPS manda un mensaje cada cierto tiempo; la posición no se actualiza entre uno y otro">Último mensaje del GPS hace {l.edadS < 90 ? `${l.edadS} s` : `${Math.round(l.edadS / 60)} min`}</span>}

      <div className="tg-gauge">
        <div><Velocimetro kmh={kmh} /></div>
        <div className="tg-compass">
          <div className="tg-dial"><span>N</span><i style={{ transform: `rotate(${rumbo.toFixed(0)}deg)` }} /></div>
          <b>{Math.round(rumbo)}° {CARDINALES[Math.round(rumbo / 45) % 8]}</b>
        </div>
      </div>
      <div className="tg-lbl" style={{ marginTop: 6 }}>Velocidad · últimos 2 min</div>
      <Grafico hist={l?.hist ?? []} />

      <div className="tg-grid">
        {nivelComb && (
          <div className="tg-cell tg-cell--ancho">
            <span className="tg-lbl">Nivel de combustible</span>
            <b className="mono">{nivelComb.texto}</b>
            {nivelComb.nombre && <small className="tg-cell__nota">Sensor: {nivelComb.nombre}</small>}
            {nivelComb.pct != null && <span className="tg-barra" aria-hidden><i style={{ width: `${nivelComb.pct}%`, background: nivelComb.pct < 20 ? ST.off.c : nivelComb.pct < 40 ? ST.ral.c : ST.mov.c }} /></span>}
          </div>
        )}
        {celdas.map(c => (
          <div key={c.t} className={`tg-cell${c.ancho ? ' tg-cell--ancho' : ''}`}>
            <span className="tg-lbl">{c.t}</span>
            <b className={c.ancho ? undefined : 'mono'}>{c.v}</b>
          </div>
        ))}
        {u.ubicacion && (
          <div className="tg-cell tg-cell--ancho">
            <span className="tg-lbl">Dirección geocodificada</span>
            <b>{u.ubicacion}</b>
            {tienePos && <span style={{ fontSize: 11, color: 'var(--label-2)' }}>{u.lat!.toFixed(4)}, {u.lng!.toFixed(4)}</span>}
          </div>
        )}
      </div>

      <div className="tg-actions">
        {tienePos && <Button variant="primary" block aria-pressed={piloto} onClick={() => motor?.setFollow(!piloto)}>{piloto ? 'Salir de cámara piloto' : 'Cámara piloto'}</Button>}
        <Button variant="secondary" icon={<Route size={16} />} onClick={onHistorial}>Historial</Button>
        {tienePos && <Button variant="secondary" onClick={() => motor?.centrarSeleccion()}>Centrar</Button>}
        {tienePos && <a className="btn btn--secondary" href={waze} target="_blank" rel="noopener noreferrer"><Navigation size={16} />Waze</a>}
        {tienePos && <a className="btn btn--secondary" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Maps</a>}
        <a className="btn btn--secondary" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />WhatsApp</a>
      </div>
    </>
  );
}
