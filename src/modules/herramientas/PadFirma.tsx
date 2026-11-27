import { useEffect, useRef, useState } from 'react';
import { Eraser, Upload } from 'lucide-react';
import { Button } from '../../core/ui/Button';

/**
 * Para dibujar la firma con el dedo o el mouse (o subir una imagen). Entrega un PNG con fondo transparente, recortado a la firma,
 * o null si todavía no hay nada.
 */
export function PadFirma({ onChange }: { onChange: (png: Uint8Array | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const dibujando = useRef(false);
  const [hayFirma, setHayFirma] = useState(false);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const k = window.devicePixelRatio || 1;
    c.width = c.clientWidth * k; c.height = c.clientHeight * k;
    const ctx = c.getContext('2d');
    if (ctx) { ctx.scale(k, k); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; }
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const { x, y } = punto(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke();
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = lienzo.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = punto(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    void exportar();
  }

  /** PNG recortado al área que tiene tinta */
  async function exportar() {
    const c = lienzo.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return;
    const { width: w, height: h } = c;
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) { setHayFirma(false); onChange(null); return; }
    const m = 6;
    const sx = Math.max(0, x0 - m), sy = Math.max(0, y0 - m), sw = Math.min(w - sx, x1 - x0 + m * 2), sh = Math.min(h - sy, y1 - y0 + m * 2);
    const rec = document.createElement('canvas');
    rec.width = sw; rec.height = sh;
    rec.getContext('2d')?.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob | null>(r => rec.toBlob(r, 'image/png'));
    if (!blob) return;
    setHayFirma(true);
    onChange(new Uint8Array(await blob.arrayBuffer()));
  }

  function borrar() {
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
    setHayFirma(false); onChange(null);
  }

  /** Imagen de firma ya guardada: se dibuja en el lienzo para recortarla igual */
  async function subir(f: File | undefined) {
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!f || !c || !ctx) return;
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) return;
    borrar();
    const ancho = c.clientWidth, alto = c.clientHeight;
    const k = Math.min(ancho / bmp.width, alto / bmp.height, 1);
    const w = bmp.width * k, h = bmp.height * k;
    ctx.drawImage(bmp, (ancho - w) / 2, (alto - h) / 2, w, h);
    bmp.close();
    await exportar();
  }

  return (
    <div className="hp-firma">
      <canvas ref={lienzo} className="hp-firma__lienzo" aria-label="Dibuja tu firma aquí"
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar} />
      {!hayFirma && <span className="hp-firma__guia" aria-hidden>Dibuja tu firma aquí</span>}
      <div className="hp-firma__acciones">
        <Button variant="secondary" size="sm" icon={<Eraser size={14} />} onClick={borrar} disabled={!hayFirma}>Borrar</Button>
        <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => entrada.current?.click()}>Subir imagen de firma</Button>
        <input ref={entrada} type="file" accept="image/*" hidden onChange={e => { void subir(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}
