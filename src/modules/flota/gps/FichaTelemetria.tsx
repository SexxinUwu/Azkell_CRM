// Ficha de la unidad: velocímetro, brújula, velocidad de los últimos 2 minutos y solo los datos que existen.
import { useEffect, useRef, useState } from 'react';
import { MapPin, MessageCircle, Navigation, Route, X } from 'lucide-react';
import { ST } from './camiones';
import type { Lectura, MotorTelemetria } from './motor';
import { EXCESO_KMH } from './mapaConfig';
import type { UnidadMapa } from '../api';

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
    const grad = g.createLinearGradient(0, 0, 0, hh); grad.addColorStop(0, 'rgba(56,214,255,.35)'); grad.addColorStop(1, 'rgba(56,214,255,0)');
    const off = 120 - hist.length;
    g.beginPath(); g.moveTo(x(off), hh); hist.forEach((v, i) => g.lineTo(x(off + i), y(v))); g.lineTo(x(off + hist.length - 1), hh); g.fillStyle = grad; g.fill();
    g.beginPath(); hist.forEach((v, i) => (i ? g.lineTo(x(off + i), y(v)) : g.moveTo(x(off + i), y(v)))); g.strokeStyle = '#38d6ff'; g.lineWidth = 2; g.stroke();
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,84,112,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y(EXCESO_KMH)); g.lineTo(w, y(EXCESO_KMH)); g.stroke(); g.setLineDash([]);
  }, [hist, hist.length]);
  return <canvas ref={ref} className="tg-spark" aria-hidden />;
}

function Grab({ onToggle }: { onToggle: (abrir?: boolean) => void }) {
  const y0 = useRef<number | null>(null);
  const movio = useRef(false);
  return (
    <button type="button" className="tg-grab" aria-label="Expandir ficha"
      onClick={() => { if (!movio.current) onToggle(); movio.current = false; }}
      onTouchStart={e => { y0.current = e.touches[0].clientY; movio.current = false; }}
      onTouchEnd={e => {
        if (y0.current === null) return;
        const dy = e.changedTouches[0].clientY - y0.current; y0.current = null;
        if (Math.abs(dy) > 25) { movio.current = true; onToggle(dy < 0); }
      }} />
  );
}
export { Grab };

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
  onCerrar: () => void;
  onHistorial: () => void;
  onToggleHoja: (abrir?: boolean) => void;
}

export function FichaTelemetria({ u, motor, conductor, piloto, onCerrar, onHistorial, onToggleHoja }: Props) {
  const l = useLectura(motor, u.placa);
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
      <Grab onToggle={onToggleHoja} />
      <div className="tg-d-head">
        <span className="tg-plate"><small>PERÚ</small><b>{placaPeru(u.placa)}</b></span>
        <div className="t">
          <strong>{u.marcaModelo || u.nombre || u.placa}</strong>
          <span>{[u.tipo, u.empresa].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="tg-x" onClick={onCerrar} aria-label="Cerrar ficha"><X size={16} /></button>
      </div>
      <span className="tg-state" style={{ background: s.c + '22', color: s.c }}>● {estadoTxt}</span>

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
            {tienePos && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: '"JetBrains Mono", monospace' }}>{u.lat!.toFixed(4)}, {u.lng!.toFixed(4)}</span>}
          </div>
        )}
      </div>

      <div className="tg-actions">
        {tienePos && <button type="button" className="tg-btn primary" aria-pressed={piloto} onClick={() => motor?.setFollow(!piloto)}>{piloto ? 'Salir de cámara piloto' : 'Cámara piloto'}</button>}
        <button type="button" className="tg-btn" onClick={onHistorial}><Route size={15} />Historial / Playback</button>
        {tienePos && <button type="button" className="tg-btn" onClick={() => motor?.centrarSeleccion()}>Centrar</button>}
        {tienePos && <a className="tg-btn" href={waze} target="_blank" rel="noopener noreferrer"><Navigation size={14} />Waze</a>}
        {tienePos && <a className="tg-btn" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={14} />Maps</a>}
        <a className="tg-btn" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
      </div>
    </>
  );
}
