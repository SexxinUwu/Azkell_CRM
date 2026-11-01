/**
 * Geometría three-r128 de las unidades 3D (camiones, tractos, remolques y carretas).
 * Copia de la lógica de docs/referencia/flota-3d.html sin estado global: lo que el original
 * leía de variables globales (PLATE, LIVERY, reefer, trailerCfg, B) llega por ConfigConstruccion
 * y por el contexto `ctx` que se pasa a los constructores.
 * Cotas, colores, texturas y orden de creación de objetos: idénticos al original.
 * La luz, la escena, la selección y los estados (applyState) no van aquí.
 */
import * as THREE from 'three-r128';
import { TLABEL } from './modelosDatos';
import type { ModeloDef } from './modelosDatos';

type V = THREE.Vector3;
const V = THREE.Vector3;
const PI = Math.PI;

/** Configuración de la unidad: lo que el original leía de globales. */
export interface ConfigConstruccion {
  plate: string;
  livery: number[];
  reefer: boolean;
  trailerCfg: string;
}

export interface Parte {
  id: string;
  name: string;
  desc: string;
  group: THREE.Group;
  reveal?: 'tilt' | 'xray';
  hl?: THREE.Object3D[];
}

export interface Modelo {
  M: ModeloDef;
  root: THREE.Group;
  parts: Parte[];
  byId: Record<string, Parte>;
  explodables: { obj: THREE.Object3D; base: THREE.Vector3; ex: THREE.Vector3 }[];
  paintMats: THREE.Material[];
  xrayMats: THREE.Material[];
  paint: THREE.Color;
  len: number;
  height: number;
  offset: number;
  tilt?: THREE.Object3D;
  doors?: { [s: number]: THREE.Object3D };
  tip?: THREE.Object3D;
  tipMax?: number;
  ram?: any;
  eye?: THREE.Vector3;
  look?: THREE.Vector3;
  engX?: number;
  engY?: number;
  fan?: THREE.Object3D;
  title?: string;
  sub?: string;
  specs?: [string, string][];
  [k: string]: any;
}

/** Contexto de construcción (lo que el original guardaba en la variable global B). */
interface Ctx extends Modelo {
  cfg: ConfigConstruccion;
  hoodLoft?: Loft;
  hoodSec?: FnSeccion;
  hoodBody?: THREE.Group;
}

interface Seccion { y: number; xF: number; xB: number; hw: number; rF: number; rB: number; }
type BaseSeccion = Omit<Seccion, 'y'>;
type FnSeccion = (y: number) => Seccion;
interface Loft { sec: FnSeccion; ys: number[]; us: number[]; }
type KeepFn = (a: number, b: number) => boolean;
type HoleFn = (u: number, y: number, p: V) => boolean;

/** Objetos que NO se liberan al cambiar de unidad (geometría unitCyl y textura TREAD). */
export const compartidos = new Set<object>();

// Anisotropía de las texturas: depende del renderer (no existe aquí). La fija la escena al crearse.
let anisotropiaMax = 1;
export function fijarAnisotropia(valor: number): void { anisotropiaMax = valor; }

// Color hex sRGB a lineal (como en el original)
const C = (h: number): THREE.Color => new THREE.Color(h).convertSRGBToLinear();

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 20);
compartidos.add(unitCyl);

/* ====================== Utilidades de geometría ====================== */
function mat(hex: number, o?: Record<string, any>): THREE.MeshStandardMaterial {
  const p: Record<string, any> = Object.assign({roughness: 0.6, metalness: 0.1}, o || {});
  if (typeof p.emissive === 'number') p.emissive = C(p.emissive);
  p.color = C(hex);
  return new THREE.MeshStandardMaterial(p);
}
const chromeM = () => mat(0xe3e7ea, {metalness: 1, roughness: 0.12});
const blackM = (r?: number) => mat(0x1b1e22, {roughness: r == null ? 0.7 : r, metalness: 0.05});
const glassM = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({color: C(0x1d2a36), roughness: 0.03, metalness: 0.9, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4});

function paintM(ctx: Ctx, double?: boolean): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({color: ctx.paint.clone(), metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, side: double ? THREE.DoubleSide : THREE.FrontSide});
  ctx.paintMats.push(m); return m;
}
function xr<T extends THREE.Material>(ctx: Ctx, m: T): T { ctx.xrayMats.push(m); return m; }
// Librea según los colores de la placa: el principal pinta cabina y caja; el 2.º y 3.º son franjas laterales
function tint<T extends THREE.MeshStandardMaterial>(ctx: Ctx, m: T): T { m.color.copy(ctx.paint); ctx.paintMats.push(m); return m; }
const stripeM = (hex: number) => new THREE.MeshPhysicalMaterial({color: C(hex), metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08});
function boxStripes(ctx: Ctx, parent: THREE.Object3D, x0: number, x1: number, y: number, hw: number): void {
  ctx.cfg.livery.slice(1, 3).forEach((hex, i) => {
    const m = stripeM(hex), h = i ? 0.07 : 0.2, yy = i ? y - 0.2 : y;
    for (const s of [1, -1]) box(parent, x0 - x1, h, 0.012, m, (x0 + x1) / 2, yy, s * (hw + 0.008));
  });
}
function add(p: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x?: number, y?: number, z?: number, noShadow?: boolean): THREE.Mesh {
  const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = !noShadow; o.receiveShadow = true; p.add(o); return o;
}
function box(p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x?: number, y?: number, z?: number): THREE.Mesh {
  return add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
}
function rbox(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const bs = Math.max(0.002, Math.min(r, d / 2 - 0.001, w / 2 - 0.002, h / 2 - 0.002));
  const W = w - 2 * bs, H = h - 2 * bs, rr = Math.max(0.001, Math.min(r - bs, W / 2 - 0.001, H / 2 - 0.001));
  const s = new THREE.Shape(), x = -W / 2, y = -H / 2;
  s.moveTo(x + rr, y); s.lineTo(x + W - rr, y); s.quadraticCurveTo(x + W, y, x + W, y + rr); s.lineTo(x + W, y + H - rr);
  s.quadraticCurveTo(x + W, y + H, x + W - rr, y + H); s.lineTo(x + rr, y + H); s.quadraticCurveTo(x, y + H, x, y + H - rr); s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const dd = Math.max(0.001, d - 2 * bs);
  const g = new THREE.ExtrudeGeometry(s, {depth: dd, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 6});
  g.translate(0, 0, -dd / 2); return g;
}
function rb(p: THREE.Object3D, w: number, h: number, d: number, r: number, m: THREE.Material | THREE.Material[], x?: number, y?: number, z?: number): THREE.Mesh {
  return add(p, rbox(w, h, d, r), m, x, y, z);
}
function cyl(p: THREE.Object3D, r: number, len: number, m: THREE.Material | THREE.Material[], x?: number, y?: number, z?: number, axis?: string, seg?: number): THREE.Mesh {
  const o = add(p, new THREE.CylinderGeometry(r, r, len, seg || 28), m, x, y, z);
  if (axis === 'x') o.rotation.z = PI / 2;
  if (axis === 'z') o.rotation.x = PI / 2;
  return o;
}
function between(p: THREE.Object3D, a: V, b: V, r: number, m: THREE.Material | THREE.Material[], seg?: number): THREE.Mesh {
  const dir = new V().subVectors(b, a), len = dir.length();
  const o = add(p, new THREE.CylinderGeometry(r, r, len, seg || 14), m);
  o.position.copy(a).addScaledVector(dir, 0.5); o.quaternion.setFromUnitVectors(new V(0, 1, 0), dir.normalize()); return o;
}
/** Coloca un cilindro unitario entre dos puntos (lo usa applyState de escena3d para los cilindros del volquete). */
export function orient(o: THREE.Object3D, a: V, b: V, r: number): void {
  const d = new V().subVectors(b, a), l = Math.max(0.001, d.length());
  o.position.copy(a).addScaledVector(d, 0.5); o.scale.set(r, l, r); o.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}
function interp(pts: number[][], y: number): number {
  if (y <= pts[0][0]) return pts[0][1];
  for (let k = 0; k < pts.length - 1; k++){ const a = pts[k], b = pts[k + 1]; if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); }
  return pts[pts.length - 1][1];
}
// Lista de cotas con valores obligatorios (para que huecos y bordes caigan justo en la malla)
function levels(a: number, b: number, step: number, extra: number[] = []): number[] {
  const pts: {v: number; x: boolean}[] = [], n = Math.max(1, Math.ceil((b - a) / step - 1e-6));
  for (let k = 0; k <= n; k++) pts.push({v: a + (b - a) * k / n, x: k === 0 || k === n});
  extra.forEach(e => { if (e > a + 1e-6 && e < b - 1e-6) pts.push({v: e, x: true}); });
  pts.sort((p, q) => p.v - q.v);
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++){ const l = out[out.length - 1]; if (pts[k].v - l.v < 0.006){ if (pts[k].x && !l.x) out[out.length - 1] = pts[k]; } else out.push(pts[k]); }
  out[out.length - 1] = {v: b, x: true};
  return out.map(p => p.v);
}

/* Sección de cabina: un rectángulo redondeado en planta, distinto a cada altura.
   u recorre el perímetro: 0..1 frente, 1..2 esquina delantera, 2..3 lateral, 3..4 esquina trasera, 4..5 trasera (negativo = lado izquierdo). */
function ringPoint(s: Seccion, u: number, out?: V): V {
  const o = out || new V();
  const a = Math.abs(u), sg = u < 0 ? -1 : 1, zf = Math.max(0, s.hw - s.rF), zb = Math.max(0, s.hw - s.rB);
  let x: number, z: number;
  if (a <= 1){ x = s.xF; z = a * zf; }
  else if (a <= 2){ const t = (a - 1) * PI / 2; x = s.xF - s.rF + s.rF * Math.cos(t); z = zf + s.rF * Math.sin(t); }
  else if (a <= 3){ const t = a - 2, xa = s.xF - s.rF, xb = s.xB + s.rB; x = xa + (xb - xa) * t; z = s.hw; }
  else if (a <= 4){ const t = (a - 3) * PI / 2; x = s.xB + s.rB - s.rB * Math.sin(t); z = zb + s.rB * Math.cos(t); }
  else { x = s.xB; z = zb * (1 - (a - 4)); }
  return o.set(x, s.y, sg * z);
}
function ringUs(extra: number[] = []): number[] {
  const half: {v: number; x: boolean}[] = [];
  const seg = (a: number, b: number, n: number) => { for (let k = 0; k < n; k++) half.push({v: a + (b - a) * k / n, x: false}); };
  seg(0, 1, 16); seg(1, 2, 14); seg(2, 3, 46); seg(3, 4, 6); seg(4, 5, 8);
  extra.forEach(e => half.push({v: e, x: true}));
  half.sort((p, q) => p.v - q.v);
  const h = [half[0]];
  for (let k = 1; k < half.length; k++){ const l = h[h.length - 1]; if (half[k].v - l.v < 0.004){ if (half[k].x) h[h.length - 1] = half[k]; } else h.push(half[k]); }
  const hv = h.map(p => p.v);
  return [-5].concat(hv.slice(1).reverse().map(v => -v), hv);
}
function roundedSec(base: (y: number) => BaseSeccion, y0: number, y1: number, rc: number, rBi: number): FnSeccion {
  return (y: number): Seccion => {
    let inset = 0;
    if (y > y1 - rc){ const t = Math.min(1, (y - (y1 - rc)) / rc); inset = rc * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    else if (rBi && y < y0 + rBi){ const t = Math.min(1, ((y0 + rBi) - y) / rBi); inset = rBi * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    const s = base(y);
    return {y, xF: s.xF - inset, xB: s.xB + inset, hw: s.hw - inset, rF: Math.max(0.03, s.rF - inset * 0.85), rB: Math.max(0.025, s.rB - inset * 0.85)};
  };
}
function edgeLevels(y0: number, y1: number, rc: number, rBi: number): number[] {
  const e: number[] = [];
  for (let k = 0; k <= 10; k++) e.push(y1 - rc + rc * Math.sin(k / 10 * PI / 2));
  if (rBi) for (let k = 0; k <= 5; k++) e.push(y0 + rBi - rBi * Math.sin(k / 5 * PI / 2));
  return e;
}
function makeLoft(sec: FnSeccion, ys: number[], us: number[]): Loft { return {sec, ys, us}; }
function loftNrm(L: Loft, y: number, u: number): V {
  const e = 0.002, du = ringPoint(L.sec(y), u + e).sub(ringPoint(L.sec(y), u - e)), dy = ringPoint(L.sec(y + e), u).sub(ringPoint(L.sec(y - e), u));
  const n = new V().crossVectors(dy, du); if (n.lengthSq() < 1e-12) n.set(0, 1, 0); return n.normalize();
}
function toGeo(pos: number[], idx: number[], uv?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Superficie cerrada de la carrocería, con huecos (ventanas, puertas) y tapas arriba y abajo
function loftBody(L: Loft, hole?: HoleFn | null, crown?: number): THREE.BufferGeometry {
  const us = L.us, ys = L.ys, nI = us.length, nJ = ys.length, pos: number[] = [], idx: number[] = [], p = new V();
  for (let j = 0; j < nJ; j++){ const s = L.sec(ys[j]); for (let i = 0; i < nI; i++){ ringPoint(s, us[i], p); pos.push(p.x, p.y, p.z); } }
  for (let j = 0; j < nJ - 1; j++){
    const yc = (ys[j] + ys[j + 1]) / 2, sc = L.sec(yc);
    for (let i = 0; i < nI; i++){
      const i2 = (i + 1) % nI, u1 = i2 ? us[i2] : us[0] + 10, uc = (us[i] + u1) / 2;
      if (hole && hole(uc, yc, ringPoint(sc, uc, p))) continue;
      const a = j * nI + i, b = j * nI + i2, c = (j + 1) * nI + i2, d = (j + 1) * nI + i;
      idx.push(a, c, b, a, d, c);
    }
  }
  const cap = (j: number, dy: number, up: boolean) => {
    let cx = 0, cz = 0; const base = j * nI;
    for (let i = 0; i < nI; i++){ cx += pos[(base + i) * 3]; cz += pos[(base + i) * 3 + 2]; }
    const ci = pos.length / 3; pos.push(cx / nI, ys[j] + dy, cz / nI);
    for (let i = 0; i < nI; i++){ const i2 = (i + 1) % nI; if (up) idx.push(ci, base + i2, base + i); else idx.push(ci, base + i, base + i2); }
  };
  cap(nJ - 1, crown || 0, true); cap(0, 0, false);
  return toGeo(pos, idx);
}
function gridGeo(us: number[], vs: number[], P: (u: number, v: number, o: V) => void, keep?: KeepFn | null, flip?: boolean): THREE.BufferGeometry {
  const nI = us.length, nJ = vs.length, pos: number[] = [], uv: number[] = [], idx: number[] = [], p = new V();
  for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++){ P(us[i], vs[j], p); pos.push(p.x, p.y, p.z); uv.push((us[i] - us[0]) / (us[nI - 1] - us[0]), (vs[j] - vs[0]) / (vs[nJ - 1] - vs[0])); }
  for (let j = 0; j < nJ - 1; j++) for (let i = 0; i < nI - 1; i++){
    if (keep && !keep((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) continue;
    const a = j * nI + i, b = a + 1, d = a + nI, c = d + 1;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  }
  return toGeo(pos, idx, uv);
}
// Parche que sigue la curvatura de la carrocería (parrilla, faros, cristales...)
function loftPatch(L: Loft, u0: number, u1: number, y0: number, y1: number, off: number, keep?: KeepFn | null, du?: number, dy?: number, uEx?: number[], yEx?: number[]): THREE.BufferGeometry {
  return gridGeo(levels(u0, u1, du || 0.035, uEx), levels(y0, y1, dy || 0.03, yEx), (u, y, o) => { ringPoint(L.sec(y), u, o); if (off) o.addScaledVector(loftNrm(L, y, u), off); }, keep);
}
function sideGeo(sec: FnSeccion, side: number, xs: number[], ys: number[], off: number, keep?: KeepFn | null): THREE.BufferGeometry {
  return gridGeo(xs, ys, (x, y, o) => o.set(x, y, side * (sec(y).hw + off)), keep, side > 0);
}

/* ====================== Texturas procedurales ====================== */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb?: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = anisotropiaMax;
  return t;
}
function grilleTex(style: string): THREE.CanvasTexture {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, w, h);
    // malla de fondo
    g.strokeStyle = 'rgba(70,78,88,.35)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 6){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, h); g.stroke(); }
    const slat = (y: number, hh: number, top: string, mid: string, bot: string) => { const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, top); gr.addColorStop(0.45, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, y, w, hh); };
    if (style === 'scania'){
      slat(0, h * 0.1, '#f2f4f6', '#9aa3ab', '#5e666e');
      for (let k = 0; k < 5; k++) slat(h * (0.17 + k * 0.165), h * 0.1, '#59616a', '#23282d', '#0f1215');
    } else if (style === 'volvo'){
      for (let k = 0; k < 9; k++) slat(h * (0.06 + k * 0.105), h * 0.055, '#d6dbe0', '#6d757d', '#2a2f34');
      g.strokeStyle = '#cfd5da'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    } else if (style === 'daf'){
      slat(0, h * 0.13, '#f4f6f8', '#a3abb3', '#5a626a');
      for (let k = 0; k < 6; k++) slat(h * (0.2 + k * 0.135), h * 0.07, '#c9cfd5', '#7a838b', '#30363c');
    } else if (style === 'intl'){
      g.fillStyle = '#15181b'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) slat(h * (0.06 + k * 0.16), h * 0.09, '#ffffff', '#b9c1c8', '#6b737b');
      g.fillStyle = '#d9dee3'; g.fillRect(w * 0.47, 0, w * 0.06, h);
      g.strokeStyle = '#e9edf0'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    } else if (style === 'fl'){
      for (let k = 0; k < 8; k++) slat(h * (0.05 + k * 0.118), h * 0.06, '#f4f6f8', '#a9b1b9', '#4c545c');
      g.strokeStyle = '#eef1f4'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
    } else if (style === 'howo'){
      for (let k = 0; k < 4; k++) slat(h * (0.08 + k * 0.24), h * 0.12, '#e6eaee', '#9aa2aa', '#3f474f');
    } else if (style === 'hino'){
      slat(0, h * 0.14, '#e9edf0', '#9aa2aa', '#4f575f');
      for (let k = 0; k < 5; k++) slat(h * (0.24 + k * 0.15), h * 0.06, '#3a4148', '#1e2328', '#0e1114');
    } else if (style === 'isuzu'){
      for (let k = 0; k < 3; k++) slat(h * (0.12 + k * 0.3), h * 0.14, '#dfe4e8', '#8f979f', '#40484f');
    } else if (style === 'mb'){
      for (let k = 0; k < 4; k++) slat(h * (0.1 + k * 0.22), h * 0.1, '#4a525a', '#22272c', '#101316');
      slat(h * 0.44, h * 0.08, '#f1f3f5', '#a7afb7', '#59616a');
    } else {
      for (let y = 0; y < h; y += 18) for (let x = (y / 18 % 2) * 14; x < w; x += 28){ g.fillStyle = '#20252a'; g.fillRect(x, y, 22, 12); }
      for (let k = 0; k < 4; k++) slat(h * (0.08 + k * 0.25), h * 0.08, '#4b535b', '#262b30', '#121518');
    }
  });
}
function lampTex(style: string, glow: boolean): THREE.CanvasTexture {
  return canvasTex(512, 192, (g, w, h) => {
    if (glow){ g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2c333b'); bg.addColorStop(1, '#090b0d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#3f474f'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
    const proj = (x: number, y: number, r: number) => {
      if (glow){ g.fillStyle = '#7e8ea0'; g.beginPath(); g.arc(x, y, r * 0.55, 0, 2 * PI); g.fill(); return; }
      const rg = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 1, x, y, r); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#a9b6c4'); rg.addColorStop(0.8, '#3b444d'); rg.addColorStop(1, '#c7ced5');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 2 * PI); g.fill();
    };
    const led = (x: number, y: number, ww: number, hh: number) => { g.fillStyle = glow ? '#ffffff' : '#e8eef5'; g.fillRect(x, y, ww, hh); };
    const amber = (x: number, y: number, ww: number, hh: number) => { g.fillStyle = glow ? '#2a1600' : '#d98a2b'; g.fillRect(x, y, ww, hh); };
    if (style === 'scania'){ proj(w * 0.3, h * 0.58, h * 0.24); proj(w * 0.55, h * 0.58, h * 0.24); led(w * 0.07, h * 0.12, w * 0.86, h * 0.07); amber(w * 0.76, h * 0.32, w * 0.18, h * 0.5); }
    else if (style === 'volvo'){ proj(w * 0.45, h * 0.6, h * 0.22); proj(w * 0.66, h * 0.6, h * 0.22); led(w * 0.08, h * 0.12, w * 0.86, h * 0.07); led(w * 0.2, h * 0.12, w * 0.04, h * 0.74); amber(w * 0.82, h * 0.34, w * 0.12, h * 0.46); }
    else if (style === 'daf'){ proj(w * 0.32, h * 0.6, h * 0.17); proj(w * 0.5, h * 0.6, h * 0.17); proj(w * 0.68, h * 0.6, h * 0.17); led(w * 0.06, h * 0.12, w * 0.88, h * 0.07); led(w * 0.89, h * 0.12, w * 0.05, h * 0.7); }
    else if (style === 'conv'){ proj(w * 0.32, h * 0.5, h * 0.25); proj(w * 0.6, h * 0.5, h * 0.25); led(w * 0.08, h * 0.84, w * 0.7, h * 0.06); amber(w * 0.8, h * 0.2, w * 0.14, h * 0.6); }
    else if (style === 'hino'){ proj(w * 0.35, h * 0.55, h * 0.26); g.fillStyle = glow ? '#3a4a5a' : '#9fb0c0'; g.fillRect(w * 0.55, h * 0.25, w * 0.2, h * 0.55); amber(w * 0.8, h * 0.25, w * 0.14, h * 0.55); led(w * 0.08, h * 0.12, w * 0.6, h * 0.05); }
    else { proj(w * 0.28, h * 0.52, h * 0.32); proj(w * 0.58, h * 0.52, h * 0.32); amber(w * 0.8, h * 0.2, w * 0.15, h * 0.62); if (glow){ g.fillStyle = '#5a6a7a'; g.fillRect(w * 0.1, h * 0.1, w * 0.6, h * 0.05); } }
  });
}
function lampMat(style: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({map: lampTex(style, false), emissiveMap: lampTex(style, true), emissive: C(0xffffff), emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.12});
}
function textMat(text: string, w: number, h: number, fg: string, bg: string | null, font: string, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(Object.assign({map: canvasTex(w, h, (g) => { if (bg){ g.fillStyle = bg; g.fillRect(0, 0, w, h); } g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); }), transparent: !bg}, extra || {}));
}
let TREAD: THREE.CanvasTexture | null = null;
function treadTex(): THREE.CanvasTexture {
  if (TREAD) return TREAD;
  TREAD = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    const t0 = h * 0.34, t1 = h * 0.66;
    g.fillStyle = '#c8c8c8'; g.fillRect(0, t0, w, t1 - t0);
    g.fillStyle = '#151515';
    [0.2, 0.4, 0.6, 0.8].forEach(f => g.fillRect(0, t0 + (t1 - t0) * f - 3, w, 6));
    for (let k = 0; k < 90; k++){ const x = k * w / 90; g.fillRect(x, t0, 3, (t1 - t0) * 0.2); g.fillRect(x + 5, t1 - (t1 - t0) * 0.2, 3, (t1 - t0) * 0.2); g.fillRect(x + 2, t0 + (t1 - t0) * 0.4, 2, (t1 - t0) * 0.2); }
    g.fillStyle = '#b4b4b4'; g.font = 'bold 15px Arial'; g.textBaseline = 'middle';
    for (let k = 0; k < 3; k++){ g.fillText('315/70 R22.5   154/150L   M+S', 40 + k * 340, h * 0.16); g.fillText('315/70 R22.5   154/150L   M+S', 40 + k * 340, h * 0.84); }
  }, false);
  compartidos.add(TREAD);
  return TREAD;
}
function woodTex(): THREE.CanvasTexture {
  return canvasTex(1024, 256, (g, w, h) => {
    const n = 12;
    for (let k = 0; k < n; k++){
      const y = k * h / n, sh = 120 + (k * 37) % 40;
      g.fillStyle = 'rgb(' + (sh + 40) + ',' + (sh + 10) + ',' + (sh - 30) + ')'; g.fillRect(0, y, w, h / n);
      g.fillStyle = 'rgba(60,35,15,.55)'; g.fillRect(0, y, w, 2);
      for (let i = 0; i < 30; i++){ g.fillStyle = 'rgba(90,55,25,.18)'; g.fillRect((i * 97 + k * 53) % w, y + ((i * 13) % (h / n)), 40 + (i * 31) % 120, 1.5); }
    }
  });
}
function sideTex(): THREE.CanvasTexture {
  return canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9dee3'; for (let k = 1; k < 16; k++) g.fillRect(k * w / 16 - 1, 0, 3, h); g.fillStyle = '#e8ecef'; g.fillRect(0, h - 10, w, 10); });
}

/* ====================== Registro de piezas ====================== */
interface OpcionesPieza { dy?: number; ex?: number[]; reveal?: 'tilt' | 'xray'; }
function part(ctx: Ctx, id: string, name: string, desc: string, parent?: THREE.Object3D | null, opts?: OpcionesPieza): THREE.Group {
  const o: OpcionesPieza = opts || {};
  const g = new THREE.Group(); (parent || ctx.root).add(g); g.userData.partId = id;
  const p: Parte = {id, name, desc, group: g, reveal: o.reveal};
  ctx.parts.push(p); ctx.byId[id] = p;
  if (o.dy) g.position.y = o.dy;
  if (o.ex) explodable(ctx, g, o.ex);
  return g;
}
function explodable(ctx: Ctx, o: THREE.Object3D, ex: number[]): void {
  ctx.explodables.push({obj: o, base: o.position.clone(), ex: new V(ex[0], ex[1], ex[2])});
}

/* ====================== Constructor de camión ====================== */
interface Eje { x: number; t: string; }

function crearCtx(M: ModeloDef, cfg: ConfigConstruccion): Ctx {
  return {M, cfg, root: new THREE.Group(), parts: [], byId: {}, explodables: [], paintMats: [], xrayMats: [], paint: C(M.paint), len: 0, height: 0, offset: 0};
}

function buildTruck(M: ModeloDef, cfg: ConfigConstruccion): Ctx {
  const ctx = crearCtx(M, cfg);
  const reefer = cfg.reefer;
  const c = M.cab, R = M.R, W = M.wScale || 1, FD = M.frameDy || 0;
  const sec = roundedSec(y => ({xF: interp(c.front, y), xB: c.back, hw: interp(c.hw, y), rF: interp(c.rF, y), rB: c.rB}), c.bottom, c.roof, c.rc, 0.06);
  const L = makeLoft(sec, levels(c.bottom, c.roof, 0.04, [c.ws[0], c.ws[1]].concat(edgeLevels(c.bottom, c.roof, c.rc, 0.06))), ringUs([c.uWs]));
  let dx1 = 9; for (let y = c.door.y0; y <= c.ws[1] + 0.02; y += 0.02){ const s = sec(y); dx1 = Math.min(dx1, s.xF - s.rF); }
  const D = {x0: c.door.x0, x1: dx1 - 0.05, y0: c.door.y0, y1: c.ws[1], wy0: c.door.wy0, wy1: c.ws[1] - 0.07, wx0: 0, wx1: 0};
  D.wx0 = D.x0 + 0.1; D.wx1 = D.x1 - 0.07;
  const peep = M.peep ? {x0: D.x1 - 0.5, x1: D.x1 - 0.12, y0: D.wy0 - 0.52, y1: D.wy0 - 0.14} : null;
  const stepX = M.conv ? (D.x0 + D.x1) / 2 : 0.78;

  /* ---------- CABINA ---------- */
  const cabPart = part(ctx, 'cabina', M.cabName, M.cabDesc, null, {ex: [0, 1.9, 0]});
  const hinge = new V(sec(c.bottom + 0.1).xF - 0.08, c.bottom, 0);
  const tilt = new THREE.Group(); tilt.position.copy(hinge); cabPart.add(tilt);
  const body = new THREE.Group(); body.position.copy(hinge).negate(); tilt.add(body);
  ctx.tilt = tilt;
  const bw = c.bunkWin;
  const hole: HoleFn = (u, y, p) => {
    const a = Math.abs(u);
    if (a < c.uWs && y > c.ws[0] && y < c.ws[1]) return true;
    if (a > 2 && a < 3 && p.x > D.x0 && p.x < D.x1 && y > D.y0 && y < D.y1) return true;
    if (bw && a > 2 && a < 3 && p.x > bw[0] && p.x < bw[1] && y > bw[2] && y < bw[3]) return true;
    return false;
  };
  const shell = loftBody(L, hole, 0.035);
  add(body, shell, xr(ctx, paintM(ctx)));
  const trimM = xr(ctx, mat(0x50565d, {roughness: 0.92, side: THREE.BackSide}));
  add(body, shell, trimM, 0, 0, 0, true);
  const rubber = xr(ctx, blackM(0.55));
  const glass = glassM();
  // parabrisas y su goma
  add(body, loftPatch(L, -c.uWs, c.uWs, c.ws[0], c.ws[1], 0.001, null, 0.05, 0.05), glass, 0, 0, 0, true);
  const wsIn: KeepFn = (u, y) => !(Math.abs(u) < c.uWs - 0.012 && y > c.ws[0] + 0.012 && y < c.ws[1] - 0.012);
  add(body, loftPatch(L, -c.uWs - 0.07, c.uWs + 0.07, c.ws[0] - 0.06, c.ws[1] + 0.05, 0.004, wsIn, 0.02, 0.02, [-c.uWs + 0.012, c.uWs - 0.012], [c.ws[0] + 0.012, c.ws[1] - 0.012]), rubber, 0, 0, 0, true);
  // ventanilla de litera
  if (bw) for (const s of [1, -1]){
    add(body, sideGeo(sec, s, levels(bw[0], bw[1], 0.1), levels(bw[2], bw[3], 0.1), 0.001), glass, 0, 0, 0, true);
    const ex = [bw[0] + 0.012, bw[1] - 0.012], ey = [bw[2] + 0.012, bw[3] - 0.012];
    add(body, sideGeo(sec, s, levels(bw[0] - 0.045, bw[1] + 0.045, 0.06, ex), levels(bw[2] - 0.045, bw[3] + 0.045, 0.06, ey), 0.004, (x, y) => !(x > ex[0] && x < ex[1] && y > ey[0] && y < ey[1])), rubber, 0, 0, 0, true);
  }
  // escobillas
  const wiperM = blackM(0.5);
  for (const u0 of [-0.66, 0.08]){
    const a = ringPoint(sec(c.ws[0] + 0.04), u0).addScaledVector(loftNrm(L, c.ws[0] + 0.04, u0), 0.025);
    const b = ringPoint(sec(c.ws[0] + 0.1), u0 + 0.6).addScaledVector(loftNrm(L, c.ws[0] + 0.1, u0 + 0.6), 0.025);
    between(body, a, b, 0.008, wiperM, 8);
    between(body, a.clone().lerp(b, 0.05), b, 0.013, wiperM, 6).scale.set(0.6, 1, 1.4);
  }
  // prolongaciones laterales (tractoras)
  if (M.kind === 'tractor'){
    for (const s of [1, -1]){
      const y0 = c.bottom + 0.45, y1 = c.roof - 0.25;
      rb(body, 0.32, y1 - y0, 0.04, 0.015, paintM(ctx), c.back - 0.12, (y0 + y1) / 2, s * (sec((y0 + y1) / 2).hw - 0.03));
    }
  }

  /* ---------- CAPÓ (solo camiones de capó largo) ---------- */
  if (M.conv){
    const h = M.conv;
    const hsec = roundedSec(y => ({xF: interp(h.front, y), xB: h.back, hw: interp(h.hw, y), rF: interp(h.rF, y), rB: 0.06}), h.y0, h.y1, h.rc, 0.04);
    const HL = makeLoft(hsec, levels(h.y0, h.y1, 0.035, edgeLevels(h.y0, h.y1, h.rc, 0.04)), ringUs([]));
    const hoodPart = part(ctx, 'capo', 'Capó y aletas', 'Capó de una pieza con las aletas de las ruedas integradas. Se abre hacia delante sobre una bisagra en el frontal para dejar el motor a la vista.', null, {ex: [1.1, 0.4, 0]});
    const hinge2 = new V(hsec(h.y0 + 0.06).xF - 0.06, h.y0, 0);
    const ht = new THREE.Group(); ht.position.copy(hinge2); hoodPart.add(ht);
    const hb = new THREE.Group(); hb.position.copy(hinge2).negate(); ht.add(hb);
    const archR = R + 0.1;
    const hg = loftBody(HL, (u, y, p) => Math.abs(u) > 1.02 && p.x * p.x + (y - R) * (y - R) < archR * archR, 0.02);
    add(hb, hg, paintM(ctx));
    add(hb, hg, mat(0x1b1e22, {roughness: 0.9, side: THREE.BackSide}), 0, 0, 0, true);
    for (const s of [1, -1]) add(hb, new THREE.TorusGeometry(archR, 0.035, 8, 40, PI), blackM(0.6), 0, R, s * (hsec(R + archR * 0.8).hw - 0.01));
    ctx.tilt = ht; ctx.hoodLoft = HL; ctx.hoodSec = hsec; ctx.hoodBody = hb;
  }

  /* ---------- FRONTAL (parrilla y faros de cabina) ---------- */
  const fName = M.lampsOn === 'cab' ? 'Parrilla y faros' : 'Parrilla frontal';
  const fDesc = M.lampsOn === 'cab' ? 'Parrilla de lamas horizontales y faros LED integrados en las esquinas de la cabina, con luz diurna de firma propia. Bascula junto a la cabina.' : 'Parrilla de lamas horizontales que deja pasar el aire al radiador. Va montada en la cabina y bascula con ella.';
  const FL: Loft = ctx.hoodLoft || L, fsec: FnSeccion = ctx.hoodSec || sec;
  const front = part(ctx, 'frontal', fName, M.conv ? 'Parrilla cromada y faros montados en el capó. Se abren junto con él para revisar el motor.' : fDesc, ctx.hoodBody || body);
  const gr = M.conv ? M.conv.grille : c.grille;
  add(front, loftPatch(FL, -gr.u, gr.u, gr.y0, gr.y1, 0.006, null, 0.05, 0.05), new THREE.MeshStandardMaterial({map: grilleTex(M.grille), metalness: 0.7, roughness: 0.3}), 0, 0, 0, true);
  const gIn: KeepFn = (u, y) => !(Math.abs(u) < gr.u - 0.005 && y > gr.y0 + 0.005 && y < gr.y1 - 0.005);
  add(front, loftPatch(FL, -gr.u - 0.04, gr.u + 0.04, gr.y0 - 0.035, gr.y1 + 0.03, 0.008, gIn, 0.02, 0.02, [-gr.u + 0.005, gr.u - 0.005], [gr.y0 + 0.005, gr.y1 - 0.005]), M.grille === 'vm' ? blackM(0.5) : chromeM(), 0, 0, 0, true);
  { // emblema del modelo
    const y = gr.y1 - 0.075, p = ringPoint(fsec(y), 0), n = loftNrm(FL, y, 0);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1), textMat(M.badge as string, 256, 56, '#eef1f4', null, '700 44px "Barlow Condensed", Arial Narrow, sans-serif', {metalness: 0.8, roughness: 0.25}));
    bm.position.copy(p).addScaledVector(n, 0.016); bm.quaternion.setFromUnitVectors(new V(0, 0, 1), n); front.add(bm);
  }
  if (M.lampsOn === 'cab'){
    const lp = M.conv ? M.conv.lamp : c.lamp, lm = lampMat(M.lampStyle), house = blackM(0.15);
    for (const s of [1, -1]){
      const u0 = s > 0 ? lp.u0 : -lp.u1, u1 = s > 0 ? lp.u1 : -lp.u0;
      add(front, loftPatch(FL, u0 - 0.03, u1 + 0.03, lp.y0 - 0.025, lp.y1 + 0.02, 0.006, null, 0.04, 0.04), house, 0, 0, 0, true);
      const geo = loftPatch(FL, u0, u1, lp.y0, lp.y1, 0.01, null, 0.03, 0.03);
      if (s < 0){ const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
      add(front, geo, lm, 0, 0, 0, true);
    }
  }

  /* ---------- FRANJAS DE COLOR ---------- */
  const bands = ctx.cfg.livery.slice(1, 3).map((hex, i) => ({m: stripeM(hex), y0: D.wy0 - (i ? 0.5 : 0.38), y1: D.wy0 - (i ? 0.43 : 0.2)})).filter(b => b.y0 > D.y0 + 0.05);
  bands.forEach(b => {
    const ym = (b.y0 + b.y1) / 2, xF = sec(ym).xF - sec(ym).rF - 0.03;
    for (const s of [1, -1]) for (const [a, e] of [[c.back + 0.05, D.x0 - 0.03], [D.x1 + 0.03, xF]]) if (e - a > 0.06) add(body, sideGeo(sec, s, levels(a, e, 0.05), levels(b.y0, b.y1, 0.03), 0.009), xr(ctx, b.m), 0, 0, 0, true);
  });

  /* ---------- PUERTAS ---------- */
  const doorsPart = part(ctx, 'puertas', 'Puertas', 'Puertas de conductor y acompañante con ventanilla eléctrica y bisagras delanteras.' + (peep ? ' La del acompañante lleva una ventanilla baja para ver el bordillo.' : ''), body);
  const doors: { [s: number]: THREE.Object3D } = {};
  ctx.doors = doors;
  for (const s of [1, -1]){
    const zS = sec((D.y0 + D.y1) / 2).hw;
    const piv = new THREE.Group(); piv.position.set(D.x1 + 0.02, 0, s * zS); doorsPart.add(piv);
    const pp = peep && s > 0 ? peep : null;
    const inWin = (x: number, y: number): boolean => (x > D.wx0 && x < D.wx1 && y > D.wy0 && y < D.wy1) || (pp !== null && x > pp.x0 && x < pp.x1 && y > pp.y0 && y < pp.y1);
    const xs = levels(D.x0 - 0.02, D.x1 + 0.02, 0.05, [D.wx0, D.wx1].concat(pp ? [pp.x0, pp.x1] : []));
    const ys = levels(D.y0 - 0.02, D.y1 + 0.015, 0.04, [D.wy0, D.wy1].concat(pp ? [pp.y0, pp.y1] : []));
    const T = (g: THREE.BufferGeometry): THREE.BufferGeometry => { g.translate(-piv.position.x, 0, -piv.position.z); return g; };
    add(piv, T(sideGeo(sec, s, xs, ys, 0.005, (x, y) => !inWin(x, y))), xr(ctx, paintM(ctx, true)));
    bands.forEach(b => add(piv, T(sideGeo(sec, s, levels(D.x0 + 0.01, D.x1 - 0.01, 0.05), levels(b.y0, b.y1, 0.03), 0.009, (x, y) => !inWin(x, y))), xr(ctx, b.m), 0, 0, 0, true));
    add(piv, T(sideGeo(sec, s, xs, ys, -0.03, (x, y) => !inWin(x, y))), xr(ctx, mat(0x50565d, {roughness: 0.9, side: THREE.DoubleSide})), 0, 0, 0, true);
    const ex = [D.x0 - 0.012, D.x1 + 0.012], ey = [D.y0 - 0.012, D.y1 + 0.007];
    add(piv, T(sideGeo(sec, s, levels(D.x0 - 0.02, D.x1 + 0.02, 0.06, ex), levels(D.y0 - 0.02, D.y1 + 0.015, 0.06, ey), 0.007, (x, y) => !(x > ex[0] && x < ex[1] && y > ey[0] && y < ey[1]))), rubber, 0, 0, 0, true);
    const wins = [[D.wx0, D.wx1, D.wy0, D.wy1]].concat(pp ? [[pp.x0, pp.x1, pp.y0, pp.y1]] : []);
    for (const w of wins){
      add(piv, T(sideGeo(sec, s, levels(w[0], w[1], 0.1), levels(w[2], w[3], 0.1), -0.004)), glass, 0, 0, 0, true);
      const bx = [w[0] + 0.01, w[1] - 0.01], by = [w[2] + 0.01, w[3] - 0.01];
      add(piv, T(sideGeo(sec, s, levels(w[0] - 0.03, w[1] + 0.025, 0.06, bx), levels(w[2] - 0.03, w[3] + 0.02, 0.06, by), 0.008, (x, y) => !(x > bx[0] && x < bx[1] && y > by[0] && y < by[1]))), rubber, 0, 0, 0, true);
    }
    const hy = D.wy0 - 0.13, hz = sec(hy).hw;
    rb(piv, 0.2, 0.045, 0.03, 0.015, chromeM(), D.x0 + 0.32 - piv.position.x, hy, s * (hz + 0.02) - piv.position.z);
    doors[s] = piv;
  }

  /* ---------- INTERIOR ---------- */
  const inter = part(ctx, 'interior', M.sleeper ? 'Interior y litera' : 'Interior', 'Puesto de conducción a la izquierda con volante, salpicadero envolvente con pantallas y asiento del acompañante.' + (M.sleeper ? ' Detrás, litera y armarios.' : ''), body, {reveal: 'xray'});
  {
    const fy = c.bottom + 0.13, xb = sec(c.ws[0]).xF, hw = sec(c.ws[0]).hw;
    const seatM = mat(0x2d3238, {roughness: 0.95}), trim = mat(0x8a929b, {roughness: 0.85}), dash = mat(0x262b31, {roughness: 0.75}), floorM = mat(0x3b4148, {roughness: 1});
    box(inter, xb - c.back - 0.25, 0.03, 2 * hw - 0.2, floorM, (xb - 0.15 + c.back + 0.1) / 2, fy, 0);
    const sx = xb - 1.05;
    for (const z of [-0.55, 0.55]){
      box(inter, 0.36, 0.3, 0.4, trim, sx, fy + 0.17, z);
      rb(inter, 0.56, 0.14, 0.54, 0.05, seatM, sx + 0.02, fy + 0.4, z);
      const bk = rb(inter, 0.14, 0.82, 0.54, 0.05, seatM, sx - 0.24, fy + 0.86, z); bk.rotation.z = 0.14;
      rb(inter, 0.12, 0.2, 0.3, 0.04, seatM, sx - 0.32, fy + 1.36, z);
    }
    const wg = new THREE.Group(); wg.position.set(xb - 0.52, c.ws[0] - 0.02, -0.55); wg.rotation.z = -0.75; inter.add(wg);
    const wm = mat(0x1d2126, {roughness: 0.5});
    const tor = add(wg, new THREE.TorusGeometry(0.22, 0.026, 12, 40), wm); tor.rotation.y = PI / 2;
    box(wg, 0.03, 0.42, 0.05, wm, 0, 0, 0); cyl(wg, 0.07, 0.06, wm, 0, 0, 0, 'x');
    between(inter, new V(xb - 0.5, c.ws[0] - 0.04, -0.55), new V(xb - 0.22, fy + 0.4, -0.55), 0.04, wm);
    rb(inter, 0.42, 0.42, 2 * hw - 0.22, 0.06, dash, xb - 0.2, c.ws[0] - 0.17, 0);
    rb(inter, 0.25, 0.08, 0.62, 0.03, dash, xb - 0.37, c.ws[0] + 0.03, -0.55);
    const scr = box(inter, 0.01, 0.13, 0.24, mat(0x0d1a2a, {emissive: 0x4f8fe0, emissiveIntensity: 0.9}), xb - 0.45, c.ws[0] - 0.04, -0.12); scr.rotation.z = 0.5;
    const cl = box(inter, 0.01, 0.1, 0.34, mat(0x0d1a2a, {emissive: 0x6faaf0, emissiveIntensity: 0.7}), xb - 0.5, c.ws[0] - 0.01, -0.55); cl.rotation.z = 0.7;
    if (M.sleeper){
      const bm = mat(0x59636e, {roughness: 1});
      box(inter, 0.62, 0.38, 2 * hw - 0.25, trim, c.back + 0.38, fy + 0.2, 0);
      rb(inter, 0.6, 0.15, 2 * hw - 0.28, 0.05, bm, c.back + 0.38, fy + 0.46, 0);
      if (c.roof - c.bottom > 2.3) rb(inter, 0.56, 0.1, 2 * hw - 0.3, 0.04, bm, c.back + 0.36, c.ws[0] + 0.62, 0);
      if (c.roof - c.ws[1] > 0.5) rb(inter, 0.48, 0.28, 2 * hw - 0.35, 0.04, trim, sec(c.ws[1]).xF - 0.45, c.ws[1] + 0.22, 0);
    }
    ctx.eye = new V(sx + 0.02, fy + 1.12, -0.55); ctx.look = new V(xb + 2.2, c.ws[0] + 0.15, -0.45);
  }

  /* ---------- RETROVISORES ---------- */
  const mir = part(ctx, 'espejos', 'Retrovisores', 'Espejo principal y gran angular a cada lado, calefactados y regulables eléctricamente.', body);
  {
    const hm = blackM(0.35), mg = mat(0xdfe6ec, {metalness: 1, roughness: 0.02});
    for (const s of [1, -1]){
      const hw = sec(c.ws[1] - 0.1).hw, mx = D.x1 + 0.1, mz = s * (hw + 0.36);
      between(mir, new V(D.x1 - 0.04, c.ws[1] - 0.08, s * (hw - 0.01)), new V(mx, c.ws[1] - 0.2, mz), 0.022, hm);
      between(mir, new V(D.x1 - 0.04, D.wy0 - 0.06, s * (sec(D.wy0).hw - 0.01)), new V(mx, c.ws[0] - 0.12, mz), 0.022, hm);
      rb(mir, 0.13, 0.64, 0.27, 0.05, hm, mx + 0.01, c.ws[0] + 0.3, mz);
      rb(mir, 0.01, 0.58, 0.22, 0.004, mg, mx - 0.057, c.ws[0] + 0.3, mz);
      rb(mir, 0.13, 0.26, 0.25, 0.05, hm, mx + 0.01, c.ws[0] - 0.15, mz);
      rb(mir, 0.01, 0.21, 0.2, 0.004, mg, mx - 0.057, c.ws[0] - 0.15, mz);
    }
  }

  /* ---------- TECHO ---------- */
  const roofNames: Record<string, [string, string]> = {visor: ['Visera y luces de techo', 'Visera parasol sobre el parabrisas con focos LED integrados.'], lights: ['Techo y luces de gálibo', 'Techo alto con luces de gálibo en el borde frontal, obligatorias por la altura del vehículo.'], deflector: ['Deflector de techo', 'Deflector aerodinámico que guía el aire por encima de la cabina hasta la altura de la carga.']};
  const roof = part(ctx, 'techo', roofNames[M.roofKit][0], roofNames[M.roofKit][1], body, {ex: [0, 0.5, 0]});
  const ledM = mat(0xffffff, {emissive: 0xfff3d6, emissiveIntensity: 1.2, roughness: 0.2});
  const amberM = mat(0xffb347, {emissive: 0xff8a00, emissiveIntensity: 0.9, roughness: 0.2});
  if (M.roofKit === 'visor'){
    const vy = c.ws[1] + 0.13, vx = sec(vy).xF + 0.12;
    const v = rb(roof, 0.36, 0.045, 2 * sec(vy).hw - 0.12, 0.02, blackM(0.45), vx, vy, 0); v.rotation.z = -0.16;
    for (const z of [-0.8, -0.4, 0.4, 0.8]) rb(roof, 0.04, 0.05, 0.16, 0.015, ledM, vx + 0.17, vy - 0.04, z);
  }
  if (M.roofKit === 'lights' || M.roofKit === 'deflector'){
    const ly = M.roofKit === 'lights' ? c.roof - c.rc * 0.45 : c.ws[1] + 0.12;
    for (const u of [-0.55, -0.28, 0, 0.28, 0.55]){
      const p = ringPoint(sec(ly), u), n = loftNrm(L, ly, u);
      const o = rb(roof, 0.03, 0.035, 0.09, 0.012, amberM, 0, 0, 0); o.position.copy(p).addScaledVector(n, 0.012);
    }
  }
  if (M.roofKit === 'deflector' && !(M.kind === 'box' && reefer)){
    const y0 = c.roof - 0.06, y1 = M.defTop, xF0 = sec(c.roof).xF + 0.02, xE = (xF0 + c.back) / 2 - 0.1;
    const dsec = roundedSec(y => { const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); return {xF: xF0 - (xF0 - xE) * Math.pow(t, 0.75), xB: c.back + 0.03, hw: sec(c.roof - c.rc).hw - c.rc * 0.6 + 0.05 * t, rF: 0.45 - 0.25 * t, rB: 0.04}; }, y0, y1, 0.08, 0);
    const DL = makeLoft(dsec, levels(y0, y1, 0.03, edgeLevels(y0, y1, 0.08, 0)), ringUs([]));
    add(roof, loftBody(DL, null, 0.01), xr(ctx, paintM(ctx)));
  }

  /* ---------- PARAGOLPES ---------- */
  const bumpName = M.lampsOn === 'bumper' ? 'Paragolpes, faros y peldaños' : 'Paragolpes y peldaños';
  const bump = part(ctx, 'paragolpes', bumpName, (M.lampsOn === 'bumper' ? 'Paragolpes de acero con faros LED, luz diurna e intermitentes en las esquinas, antiniebla abajo.' : 'Paragolpes de acero con toma de aire inferior y faros antiniebla.') + ' A los lados, los peldaños de acceso a la cabina.', null, {ex: [0.9, 0, 0]});
  const by0 = M.conv ? 0.38 : (M.bumperY0 || (c.bottom < 1.2 ? 0.46 : 0.5)), by1 = M.conv ? M.conv.y0 - 0.02 : c.bottom - 0.03;
  const bxF = M.conv ? (ctx.hoodSec || sec)(M.conv.y0 + 0.06).xF + 0.08 : sec(c.bottom + 0.06).xF + 0.07, bxB = M.conv ? bxF - 0.5 : 0.98;
  const bhw = M.conv ? interp(M.conv.hw, M.conv.y0) + 0.01 : interp(c.hw, c.bottom) + 0.005;
  const bsec = roundedSec(y => ({xF: bxF + 0.03 * Math.sin(PI * (y - by0) / (by1 - by0)) - (by1 - y) * 0.05, xB: bxB, hw: bhw, rF: 0.36, rB: 0.03}), by0, by1, 0.06, 0.05);
  const BL = makeLoft(bsec, levels(by0, by1, 0.03, edgeLevels(by0, by1, 0.06, 0.05)), ringUs([]));
  add(bump, loftBody(BL, null, 0), mat(0x24282d, {roughness: 0.75}));
  const lowB = M.conv || M.chromeBumper, bp0 = lowB ? by0 + 0.04 : by0 + 0.3;
  add(bump, loftPatch(BL, -2.6, 2.6, bp0, by1 - 0.02, 0.003, null, 0.05, 0.04), M.chromeBumper ? chromeM() : paintM(ctx), 0, 0, 0, true);
  if (!lowB) add(bump, loftPatch(BL, -0.56, 0.56, by0 + 0.08, by0 + 0.26, 0.005, null, 0.05, 0.05), new THREE.MeshStandardMaterial({map: grilleTex('vm'), metalness: 0.5, roughness: 0.45}), 0, 0, 0, true);
  const py = lowB ? (by0 + by1) / 2 - 0.055 : bp0 + 0.03;
  add(bump, loftPatch(BL, -0.26, 0.26, py, py + 0.11, 0.008, null, 0.05, 0.05), textMat(cfg.plate || (M.badge as string).replace(' ', ''), 512, 108, '#15202b', '#f4f6f8', '600 64px "IBM Plex Mono", monospace'), 0, 0, 0, true);
  const fogM = new THREE.MeshStandardMaterial({map: lampTex('vm', false), emissiveMap: lampTex('vm', true), emissive: C(0xffffff), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.15});
  for (const s of [1, -1]){
    add(bump, loftPatch(BL, s > 0 ? 0.74 : -1.08, s > 0 ? 1.08 : -0.74, by0 + 0.07, by0 + 0.21, 0.006, null, 0.04, 0.04), fogM, 0, 0, 0, true);
    if (M.lampsOn === 'bumper'){
      const u0 = 0.6, u1 = M.lampStyle === 'vm' ? 1.25 : 1.52;
      add(bump, loftPatch(BL, s > 0 ? u0 - 0.03 : -u1 - 0.03, s > 0 ? u1 + 0.03 : -u0 + 0.03, by1 - 0.37, by1 - 0.05, 0.006, null, 0.04, 0.04), blackM(0.15), 0, 0, 0, true);
      const geo = loftPatch(BL, s > 0 ? u0 : -u1, s > 0 ? u1 : -u0, by1 - 0.34, by1 - 0.08, 0.01, null, 0.03, 0.03);
      if (s < 0){ const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
      add(bump, geo, lampMat(M.lampStyle), 0, 0, 0, true);
    }
    // peldaños
    const stepM = mat(0x8a939c, {metalness: 0.8, roughness: 0.35}), hw = interp(c.hw, c.bottom);
    const st = (c.bottom - 0.15 - 0.55) / 2;
    for (let k = 0; k < 2; k++) rb(bump, 0.42, 0.035, 0.3, 0.012, stepM, stepX, 0.55 + k * (st + 0.2), s * (hw - 0.17));
    rb(bump, 0.04, c.bottom - 0.5, 0.32, 0.015, blackM(), stepX - 0.22, (c.bottom + 0.42) / 2, s * (hw - 0.17));
    rb(bump, 0.46, 0.05, 0.05, 0.02, chromeM(), stepX, c.bottom - 0.06, s * (hw - 0.03));
  }

  /* ---------- BASTIDOR ---------- */
  const rearAx: Eje[] = M.axles.filter((a: Eje) => a.t !== 'steer');
  const firstRear = rearAx[0].x, lastRear = rearAx[rearAx.length - 1].x;
  const frame = part(ctx, 'bastidor', 'Bastidor', 'Dos largueros de acero en perfil C unidos por travesaños. Soportan cabina, motor, depósitos y ' + (M.kind === 'tractor' ? 'la quinta rueda.' : 'la carrocería.'), null, {dy: FD});
  const frameM = mat(0x24282d, {roughness: 0.5, metalness: 0.45});
  for (const z of [-0.43, 0.43]) box(frame, 1.0 - M.frameEnd, 0.28, 0.08, frameM, (1.0 + M.frameEnd) / 2, 0.96, z);
  [-1.95, firstRear + 0.55, firstRear - 0.6, M.frameEnd + 0.06].forEach(x => box(frame, 0.1, 0.18, 0.8, frameM, x, 0.96, 0));
  if (M.kind !== 'tractor') for (const z of [-0.43, 0.43]) box(frame, -0.3 - M.frameEnd, 0.14, 0.09, frameM, (-0.6 + M.frameEnd) / 2, 1.17, z);
  // pilotos laterales
  for (const s of [1, -1]) for (let x = -1.0; x > M.frameEnd + 0.5; x -= 1.4) rb(frame, 0.08, 0.05, 0.03, 0.012, amberM, x, 0.78, s * 0.5);

  /* ---------- MOTOR ---------- */
  const E = M.engine, eTop = M.conv ? M.conv.y1 - 0.28 : Math.min(c.bottom - 0.04, 1.32), ex0 = M.conv ? M.conv.engX0 : 0.03, ex1 = ex0 - E.len, ecx = (ex0 + ex1) / 2;
  const eng = part(ctx, 'motor', E.name, E.desc + ' Bascula la cabina para verlo.', null, {ex: [0, 1.05, 0], reveal: 'tilt'});
  {
    const blk = mat(0x4a525c, {roughness: 0.45, metalness: 0.55}), cov = mat(M.engCover, {roughness: 0.35, metalness: 0.35}), dk = mat(0x2c3137, {roughness: 0.55, metalness: 0.45}), steel = mat(0x8d949b, {metalness: 0.85, roughness: 0.3});
    rb(eng, E.len - 0.05, 0.08, 0.32, 0.03, cov, ecx, eTop - 0.04, 0);
    rb(eng, E.len, 0.13, 0.42, 0.02, dk, ecx, eTop - 0.145, 0);
    rb(eng, E.len, E.h, 0.46, 0.03, blk, ecx, eTop - 0.21 - E.h / 2, 0);
    rb(eng, E.len - 0.15, 0.16, 0.38, 0.03, dk, ecx - 0.06, eTop - 0.29 - E.h, 0);
    for (let i = 0; i < (E.cyl || 6); i++) cyl(eng, 0.028, 0.04, chromeM(), ex0 - 0.09 - i * (E.len - 0.18) / ((E.cyl || 6) - 1), eTop + 0.01, 0, 'y', 12);
    rb(eng, E.len - 0.2, 0.12, 0.1, 0.03, blk, ecx, eTop - 0.2, -0.29);
    const tz = 0.36, ty = eTop - 0.3;
    add(eng, new THREE.TorusGeometry(0.09, 0.055, 12, 24), steel, ex1 + 0.38, ty, tz);
    cyl(eng, 0.065, 0.13, steel, ex1 + 0.38, ty, tz, 'z');
    rb(eng, E.len - 0.3, 0.07, 0.07, 0.02, mat(0x7d6a5b, {metalness: 0.6, roughness: 0.45}), ecx, ty + 0.03, 0.27);
    cyl(eng, 0.13, 0.05, dk, ex0 + 0.02, eTop - 0.55, 0, 'x');
    cyl(eng, 0.08, 0.05, dk, ex0 + 0.02, eTop - 0.25, 0.15, 'x');
    cyl(eng, 0.07, 0.05, dk, ex0 + 0.02, eTop - 0.3, -0.17, 'x');
    ctx.engX = ecx; ctx.engY = eTop - 0.3;
  }

  /* ---------- RADIADOR ---------- */
  const rad = part(ctx, 'radiador', 'Radiador y ventilador', 'Radiador de refrigerante con intercooler delante y ventilador viscoso movido por el motor.', null, {ex: [0.9, 0.7, 0], reveal: 'tilt'});
  {
    const rTop = M.conv ? M.conv.y1 - 0.38 : Math.min(c.bottom - 0.03, 1.3), rBot = M.conv ? 0.78 : 0.52, rc = (rTop + rBot) / 2, rx = M.conv ? (ctx.hoodSec || sec)(1.2).xF - 0.32 : 0.84;
    rb(rad, 0.1, rTop - rBot, 0.78, 0.02, mat(0x3a4046, {roughness: 0.6, metalness: 0.5}), rx, rc, 0);
    box(rad, 0.02, rTop - rBot - 0.08, 0.72, mat(0x5b636c, {roughness: 0.85, metalness: 0.3}), rx + 0.06, rc, 0);
    const sh = add(rad, new THREE.TorusGeometry(0.33, 0.03, 10, 40), blackM(), rx - 0.12, rc, 0); sh.rotation.y = PI / 2;
    const fan = new THREE.Group(); fan.position.set(rx - 0.13, rc, 0); rad.add(fan); ctx.fan = fan;
    const bl = mat(0x2f3439, {roughness: 0.55});
    for (let i = 0; i < 9; i++){ const b = box(fan, 0.012, 0.28, 0.09, bl); b.geometry.translate(0, 0.15, 0); b.rotation.x = i * 2 * PI / 9; b.rotation.order = 'XYZ'; }
    cyl(fan, 0.07, 0.08, bl, 0, 0, 0, 'x');
    between(rad, new V(ex0 + 0.05, rc, 0), new V(rx - 0.14, rc, 0), 0.03, mat(0x2c3137, {metalness: 0.5, roughness: 0.5}));
  }

  /* ---------- CAJA Y TRANSMISIÓN ---------- */
  const gbx0 = ex1, gbx1 = ex1 - 0.75, gby = eTop - 0.21 - E.h * (M.conv ? 0.95 : 0.75);
  const gb = part(ctx, 'caja', M.gearbox.name, M.gearbox.desc, null, {ex: [-0.5, 0.6, 0], reveal: 'tilt'});
  const gbg = add(gb, new THREE.CylinderGeometry(0.17, 0.27, 0.75, 32), mat(0x939ba3, {roughness: 0.4, metalness: 0.65}), (gbx0 + gbx1) / 2, gby, 0); gbg.rotation.z = PI / 2;
  rb(gb, 0.3, 0.2, 0.34, 0.04, mat(0x7c848c, {roughness: 0.45, metalness: 0.55}), gbx0 - 0.25, gby - 0.18, 0);
  const tr = part(ctx, 'transmision', 'Árbol de transmisión', 'Eje con crucetas que lleva el par desde la caja de cambios hasta el diferencial' + (rearAx.filter(a => a.t === 'drive').length > 1 ? ', y un segundo tramo entre los dos ejes motrices.' : ' trasero.'), null, {ex: [0, -0.25, 0]});
  {
    const sm = mat(0x6d757e, {metalness: 0.75, roughness: 0.3});
    const drivesT = rearAx.filter(a => a.t === 'drive');
    let a = new V(gbx1 - 0.02, gby - 0.02, 0);
    drivesT.forEach(d => { const b = new V(d.x + 0.32, R + 0.02, 0); between(tr, a, b, 0.055, sm); cyl(tr, 0.085, 0.06, sm, a.x, a.y, 0, 'x'); cyl(tr, 0.085, 0.06, sm, b.x, b.y, 0, 'x'); a = new V(d.x - 0.3, R + 0.06, 0); });
  }

  /* ---------- RUEDAS Y EJES ---------- */
  const kit = wheelKit(R);
  const axM = mat(0x30353b, {roughness: 0.45, metalness: 0.55});
  const fa = part(ctx, 'ejeDel', 'Eje delantero y ruedas', 'Eje rígido con ballestas parabólicas y dirección. Neumáticos 315/70 R22.5 sobre llantas de aluminio pulido.');
  {
    const g = new THREE.Group(); g.position.set(0, R, 0); fa.add(g);
    rb(g, 0.13, 0.13, 2 * M.track - 0.3, 0.02, axM, 0, 0, 0);
    for (const z of [-0.43, 0.43]){ rb(g, 1.3, 0.07, 0.08, 0.03, axM, 0, 0.18, z); box(g, 0.1, 0.24, 0.1, axM, 0, 0.07, z); cyl(g, 0.045, 0.35, mat(0xd0b040, {metalness: 0.4, roughness: 0.4}), 0.3, 0.14, z * 1.05, 'y', 12); }
    between(g, new V(-0.2, 0.05, -M.track + 0.18), new V(-0.2, 0.05, M.track - 0.18), 0.025, axM);
    for (const s of [1, -1]){ const wg = new THREE.Group(); g.add(wg); makeWheel(wg, 0, s * M.track, s, kit, false, true); explodable(ctx, wg, [0, 0, s * 0.7]); }
  }
  const drives = rearAx.filter(a => a.t === 'drive'), tags = rearAx.filter(a => a.t === 'tag');
  const ra = part(ctx, 'ejeTras', drives.length > 1 ? 'Ejes motrices y ruedas gemelas' : 'Eje motriz y ruedas gemelas', (drives.length > 1 ? 'Dos ejes motrices en tándem (6x4) con diferencial entre ejes,' : 'Eje trasero con diferencial de reducción simple,') + (M.kind === 'tractor' ? ' suspensión neumática' : ' suspensión de ballestas') + ' y ruedas gemelas a cada lado.');
  drives.forEach(ax => {
    const g = new THREE.Group(); g.position.set(ax.x, R, 0); ra.add(g);
    cyl(g, 0.1, 1.6 * W, axM, 0, 0, 0, 'z');
    const df = add(g, new THREE.SphereGeometry(0.24, 28, 18), mat(0x3b4148, {roughness: 0.4, metalness: 0.55}), 0.08, 0, 0); df.scale.set(1.2, 1, 1);
    for (const z of [-0.43, 0.43]){
      if (M.kind === 'tractor'){
        rb(g, 1.1, 0.09, 0.1, 0.03, axM, -0.15, 0.1, z);
        cyl(g, 0.13, 0.2, mat(0x141619, {roughness: 0.95}), -0.55, 0.22, z, 'y', 24);
      } else rb(g, 1.2, 0.08, 0.09, 0.03, axM, 0, 0.17, z);
      cyl(g, 0.04, 0.3, mat(0xd0b040, {metalness: 0.4, roughness: 0.4}), 0.35, 0.16, z, 'y', 12);
    }
    for (const s of [1, -1]){ const wg = new THREE.Group(); g.add(wg); makeWheel(wg, 0, s * 0.735 * W, s, kit, false, false); makeWheel(wg, 0, s * 1.075 * W, s, kit, false, true); explodable(ctx, wg, [0, 0, s * 0.8]); }
  });
  if (tags.length){
    const ta = part(ctx, 'ejeTag', 'Eje de arrastre elevable', 'Tercer eje no motriz con neumáticos anchos. Se eleva cuando el camión va vacío para reducir desgaste y consumo.');
    tags.forEach(ax => {
      const g = new THREE.Group(); g.position.set(ax.x, R, 0); ta.add(g);
      cyl(g, 0.08, 1.5 * W, axM, 0, 0, 0, 'z');
      for (const z of [-0.43, 0.43]){ rb(g, 0.9, 0.08, 0.1, 0.03, axM, 0.1, 0.1, z); cyl(g, 0.12, 0.18, mat(0x141619, {roughness: 0.95}), 0.45, 0.22, z, 'y', 24); }
      for (const s of [1, -1]){ const wg = new THREE.Group(); g.add(wg); makeWheel(wg, 0, s * 0.92 * W, s, kit, true, true); explodable(ctx, wg, [0, 0, s * 0.8]); }
    });
  }

  /* ---------- DEPÓSITOS, ESCAPE, AIRE ---------- */
  const gapEnd = firstRear + R + 0.2;
  const tx0 = M.conv ? stepX - 0.42 : -0.85, tl = Math.max(0.9, Math.min(1.8, tx0 - gapEnd));
  const ox = M.conv ? stepX - 0.62 + 0.98 : 0;
  const tank = part(ctx, 'deposito', 'Depósito de combustible', 'Depósito de aluminio en el lado izquierdo. Según versión, entre 400 y 900 litros de gasóleo.', null, {ex: [0, 0, -0.8], dy: FD});
  {
    const alu = mat(0xd3d8dd, {roughness: 0.22, metalness: 0.95}), tx = tx0 - tl / 2, tz = -0.88;
    const tg = rbox(tl, 0.62, 0.62, 0.2); const tm = add(tank, tg, alu, tx, 0.72, tz); tm.rotation.y = 0;
    for (const x of [tx + tl / 2 - 0.22, tx - tl / 2 + 0.22]){ rb(tank, 0.05, 0.66, 0.66, 0.22, frameM, x, 0.72, tz); box(tank, 0.06, 0.08, 0.36, frameM, x, 0.95, -0.62); }
    cyl(tank, 0.065, 0.05, blackM(), tx + tl / 2 - 0.4, 1.05, tz, 'y', 18);
    rb(tank, 0.4, 0.035, 0.32, 0.012, mat(0x8a939c, {metalness: 0.8, roughness: 0.35}), tx + tl / 2 - 0.3, 1.06, tz - 0.12);
  }
  const adb = part(ctx, 'adblue', 'AdBlue y baterías', 'Caja de baterías de 24 V y depósito de AdBlue para el catalizador SCR, en el lado derecho.', null, {ex: [0, 0, 0.8], dy: FD});
  rb(adb, 0.46, 0.44, 0.6, 0.04, mat(0x2b3036, {roughness: 0.7}), -0.98 + ox, 0.74, 0.82);
  rb(adb, 0.48, 0.03, 0.62, 0.01, mat(0x8a939c, {metalness: 0.8, roughness: 0.35}), -0.98 + ox, 0.975, 0.82);
  add(adb, rbox(0.5, 0.44, 0.44, 0.18), mat(0xf2f4f6, {roughness: 0.45}), -1.52 + ox, 0.74, 0.84);
  cyl(adb, 0.05, 0.05, mat(0x2a64c6, {roughness: 0.4}), -1.42 + ox, 0.98, 0.84, 'y', 16);
  const exh = part(ctx, 'escape', 'Silenciador y escape', 'Silenciador con catalizador SCR y filtro de partículas. Recibe los gases del turbo y los expulsa' + (M.stacks ? ' por las chimeneas verticales detrás de la cabina.' : ' hacia abajo.'), null, {ex: [0, 0.2, 0.9], dy: FD});
  {
    const exM = mat(0xa7aeb5, {roughness: 0.3, metalness: 0.9});
    const sx = -2.15 + ox;
    const curve = new THREE.CatmullRomCurve3([new V(ex1 + 0.38, eTop - 0.3 - FD, 0.44), new V(ex1 + 0.2, eTop - 0.5 - FD, 0.52), new V(ex1 - 0.2, 0.55, 0.56), new V(sx + 0.55, 0.55, 0.56), new V(sx + 0.36, 0.62, 0.62)]);
    add(exh, new THREE.TubeGeometry(curve, 48, 0.055, 12, false), exM);
    add(exh, rbox(0.66, 0.6, 0.62, 0.12), mat(0x2f3439, {roughness: 0.5, metalness: 0.45}), sx, 0.78, 0.85);
    rb(exh, 0.6, 0.04, 0.58, 0.015, exM, sx, 1.09, 0.85);
    cyl(exh, 0.06, 0.22, exM, sx - 0.22, 0.38, 1.0, 'y', 16);
    if (M.stacks) for (const s of (M.stacks === 2 ? [1, -1] : [1])){
      const z = s * (sec(2.2).hw - 0.2), x = c.back - 0.4, yT = c.roof + 0.4;
      cyl(exh, 0.075, yT - 1.3, exM, x, (yT + 1.3) / 2 - FD, z, 'y', 20);
      rb(exh, 0.2, 1.0, 0.2, 0.05, blackM(0.5), x, c.roof - 0.9 - FD, z);
    }
  }
  const air = part(ctx, 'aire', 'Calderines de aire', 'Depósitos de aire comprimido para los frenos y la suspensión neumática.', null, {ex: [0, -0.35, 0], dy: FD});
  for (const z of [-0.24, 0.24]) add(air, rbox(0.62, 0.24, 0.24, 0.11), mat(0x3a4047, {roughness: 0.45, metalness: 0.45}), firstRear + 1.15, 0.7, z);

  /* ---------- GUARDABARROS ---------- */
  const fen = part(ctx, 'guardabarros', 'Guardabarros y luces traseras', 'Guardabarros delanteros y traseros, faldillas antiproyección y pilotos traseros con intermitente y luz de freno.');
  const fenM = mat(0x1e2125, {roughness: 0.8, side: THREE.DoubleSide});
  for (const s of [1, -1]){
    const fr = new THREE.Group(); fen.add(fr);
    if (!M.conv){ const af = add(fr, new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.42, 36, 1, true, -0.38 * PI, 0.86 * PI), fenM, 0, R, s * M.track); af.rotation.x = -PI / 2; }
    box(fr, 0.02, 0.42, 0.42, fenM, -R - 0.12, 0.42, s * M.track);
    explodable(ctx, fr, [0, 0.3, s * 0.7]);
    rearAx.forEach((ax, i) => {
      const rr = new THREE.Group(); fen.add(rr);
      const w = (ax.t === 'tag' ? 0.48 : 0.76) * W, z = (ax.t === 'tag' ? 0.92 : 0.905) * W;
      const rf = add(rr, new THREE.CylinderGeometry(R + 0.1, R + 0.1, w, 36, 1, true, -0.32 * PI, 0.64 * PI), fenM, ax.x, R, s * z); rf.rotation.x = -PI / 2;
      if (i === rearAx.length - 1) box(rr, 0.02, 0.5, w - 0.1, fenM, ax.x - R - 0.12, 0.42, s * z);
      explodable(ctx, rr, [0, 0.4, s * 0.8]);
    });
  }
  const red = mat(0xc81e1e, {emissive: 0xb01010, emissiveIntensity: 0.8, roughness: 0.2});
  const rx = M.kind === 'tractor' ? M.frameEnd : M.frameEnd - 0.25;
  rb(fen, 0.1, 0.14, 2.36, 0.03, mat(0x2b3036, {metalness: 0.4, roughness: 0.5}), rx - 0.02, 0.62, 0);
  for (const s of [1, -1]){ rb(fen, 0.03, 0.11, 0.32, 0.02, red, rx - 0.075, 0.62, s * 0.92); rb(fen, 0.03, 0.11, 0.14, 0.02, amberM, rx - 0.075, 0.62, s * 0.62); rb(fen, 0.03, 0.08, 0.12, 0.02, ledM, rx - 0.075, 0.62, s * 0.4); }

  /* ---------- TRACTORA o CARROCERÍA ---------- */
  let rearMost: number = M.frameEnd;
  if (M.kind === 'tractor'){
    const fw = part(ctx, 'quinta', 'Quinta rueda', 'Plato de enganche del semirremolque. El pivote del remolque entra por la ranura en V y queda bloqueado. Detrás de la cabina, la pasarela y las espirales de aire y electricidad.', null, {ex: [0, 0.9, 0], dy: FD});
    const fwM = mat(0x3a3f45, {roughness: 0.45, metalness: 0.55});
    box(fw, 0.9, 0.08, 0.98, fwM, M.fifth, 1.14, 0);
    cyl(fw, 0.46, 0.07, mat(0x26292e, {roughness: 0.3, metalness: 0.6}), M.fifth, 1.215, 0, 'y', 48);
    box(fw, 0.5, 0.02, 0.14, mat(0x0f1113), M.fifth - 0.25, 1.256, 0);
    rb(fw, 0.06, 0.06, 0.4, 0.02, mat(0xd8a21f, {roughness: 0.5}), M.fifth, 1.2, 0.48);
    // pasarela y espirales
    const dx0 = c.back - 0.12, dx1 = M.fifth + 0.6;
    if (dx0 - dx1 > 0.3){
      const chk = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8f979f'; g.fillRect(0, 0, w, h); g.fillStyle = '#c3c9cf'; for (let y = 0; y < h; y += 32) for (let x = (y / 32 % 2) * 16; x < w; x += 32){ g.save(); g.translate(x + 8, y + 8); g.rotate((x + y) % 64 ? 0.8 : -0.8); g.fillRect(-9, -2, 18, 4); g.restore(); } });
      chk.wrapS = chk.wrapT = THREE.RepeatWrapping; chk.repeat.set((dx0 - dx1) * 3, 3);
      box(fw, dx0 - dx1, 0.03, 0.96, mat(0xffffff, {map: chk, metalness: 0.8, roughness: 0.4}), (dx0 + dx1) / 2, 1.13, 0);
      cyl(fw, 0.03, 0.7, chromeM(), dx1 + 0.05, 1.48, -0.3, 'y', 12);
      const top = new V(dx1 + 0.05, 1.78, -0.3);
      [[0xd42020, -0.12], [0xe8b81a, 0], [0x15171a, 0.12]].forEach(([col, oz], i) => {
        const a = new V(c.back - 0.03, c.bottom + 0.95, -0.25 + oz), b = top.clone().add(new V(0, 0, oz * 0.5));
        const pts: V[] = [];
        for (let k = 0; k <= 260; k++){ const t = k / 260, p = a.clone().lerp(b, t); p.y -= 0.32 * 4 * t * (1 - t); const ph = 2 * PI * 16 * t + i; p.y += 0.04 * Math.cos(ph); p.z += 0.04 * Math.sin(ph); pts.push(p); }
        add(fw, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 520, 0.008, 6), mat(col, {roughness: 0.5}));
      });
    }
  } else if (M.kind === 'box'){
    const bx0 = c.back - 0.25, bx1 = M.frameEnd - 0.35, yb = 1.26, yt = M.boxTop || 3.62, bwid = M.boxW || 2.5, len = bx0 - bx1;
    rearMost = bx1;
    if (reefer) reeferUnit(ctx, bx0, Math.max(yt - 0.48, c.roof + 0.48) + FD, 1.7, 0.85, 0.45);
    const car = part(ctx, 'carroceria', reefer ? 'Caja furgón frigorífico' : 'Caja furgón', 'Caja cerrada de paneles sándwich con perfiles de aluminio y doble puerta trasera. Protecciones laterales y trasera antiempotramiento.', null, {ex: [0, 1.4, 0], dy: FD});
    const side = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#f3f5f7'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9dee3'; for (let k = 1; k < 12; k++) g.fillRect(k * w / 12 - 1, 0, 3, h); g.fillStyle = '#e8ecef'; g.fillRect(0, h - 10, w, 10); });
    const sideM = tint(ctx, mat(0xffffff, {map: side, roughness: 0.45, metalness: 0.05})), whiteM = tint(ctx, mat(0xffffff, {roughness: 0.45})), aluM = mat(0xc3c9cf, {metalness: 0.9, roughness: 0.3});
    add(car, new THREE.BoxGeometry(len, yt - yb, bwid), [whiteM, whiteM, whiteM, mat(0x2b3036), sideM, sideM], (bx0 + bx1) / 2, (yb + yt) / 2, 0);
    for (const y of [yb, yt]) for (const z of [-bwid / 2, bwid / 2]) rb(car, len + 0.02, 0.07, 0.07, 0.02, aluM, (bx0 + bx1) / 2, y, z);
    for (const x of [bx0, bx1]) for (const z of [-bwid / 2, bwid / 2]) rb(car, 0.07, yt - yb + 0.06, 0.07, 0.02, aluM, x, (yb + yt) / 2, z);
    for (const x of [bx0, bx1]) rb(car, 0.07, 0.07, bwid, 0.02, aluM, x, yt, 0);
    box(car, 0.012, yt - yb - 0.1, 0.02, mat(0x9aa2aa), bx1 - 0.006, (yb + yt) / 2, 0);
    for (const z of [-0.95, -0.35, 0.35, 0.95]){ cyl(car, 0.018, yt - yb - 0.2, chromeM(), bx1 - 0.03, (yb + yt) / 2, z, 'y', 10); rb(car, 0.04, 0.16, 0.06, 0.01, aluM, bx1 - 0.04, yb + 1.1, z); }
    for (const z of [-1.18, 1.18]) for (const y of [yb + 0.4, yt - 0.4]) rb(car, 0.06, 0.2, 0.08, 0.02, aluM, bx1 - 0.03, y, z);
    rb(car, 0.12, 0.12, 2.3, 0.03, mat(0x2b3036, {metalness: 0.4}), bx1 + 0.1, 0.5, 0);
    boxStripes(ctx, car, bx0 - 0.05, bx1 + 0.05, yb + 0.55, bwid / 2);
    for (const z of [-0.6, 0.6]) box(car, 0.08, 0.7, 0.08, frameM, bx1 + 0.12, 0.85, z);
    for (const s of [1, -1]) for (const y of [0.55, 0.85]) rb(car, -0.75 - (firstRear + R + 0.3), 0.06, 0.035, 0.015, aluM, (-0.75 + firstRear + R + 0.3) / 2, y, s * (bwid / 2 - 0.05));
  } else if (M.kind === 'tipper'){
    const x0 = c.back - 0.3, x1 = M.frameEnd - 0.05, len = x0 - x1, H = new V(x1, 1.3, 0);
    rearMost = x1 - 0.08;
    const car = part(ctx, 'carroceria', 'Caja volquete', 'Caja de acero antidesgaste con portón trasero basculante. Un cilindro hidráulico telescópico delante la levanta para descargar.', null, {ex: [0, 1.3, 0]});
    const piv = new THREE.Group(); piv.position.copy(H); car.add(piv); ctx.tip = piv;
    const tp = paintM(ctx), ribM = paintM(ctx), dk = mat(0x2b3036, {roughness: 0.6, metalness: 0.4});
    box(piv, len, 0.08, 2.3, tp, len / 2, 0.12, 0);
    for (const s of [1, -1]){
      const sd = rb(piv, len, 1.18, 0.06, 0.02, tp, len / 2, 0.71, s * 1.2); sd.rotation.x = s * 0.07;
      for (let k = 0; k < 6; k++){ const rbm = rb(piv, 0.07, 1.12, 0.05, 0.015, ribM, 0.4 + k * (len - 0.8) / 5, 0.71, s * 1.255); rbm.rotation.x = s * 0.07; }
      cyl(piv, 0.04, len, ribM, len / 2, 1.3, s * 1.245, 'x', 12);
      box(piv, len, 0.12, 0.1, dk, len / 2, 0.03, s * 0.43);
    }
    rb(piv, 0.08, 1.4, 2.5, 0.02, tp, len, 0.8, 0);
    const lip = rb(piv, 0.22, 0.05, 2.5, 0.02, tp, len + 0.06, 1.5, 0); lip.rotation.z = 0.15;
    rb(piv, 0.07, 1.15, 2.42, 0.02, tp, -0.03, 0.72, 0);
    cyl(piv, 0.05, 2.5, dk, -0.05, 1.31, 0, 'z', 14);
    const ramM = chromeM(), ramB = mat(0x2b3036, {metalness: 0.5, roughness: 0.4});
    ctx.ram = {base: new V(x0 - 0.15, 1.12, 0), anchor: new V(x0 - 0.06, 2.35, 0), H, parts: [add(car, unitCyl, ramB), add(car, unitCyl, ramM), add(car, unitCyl, ramM)]};
  } else if (M.kind === 'cargo'){
    const bx0 = c.back - 0.2, bx1 = M.frameEnd - 0.3, yb = 1.27, bwid = M.boxW || 2.45, len = bx0 - bx1, bm = (bx0 + bx1) / 2;
    rearMost = bx1;
    const car = part(ctx, 'carroceria', 'Plataforma con barandas', 'Plataforma con piso de madera, barandas de acero abatibles a los lados y atrás, y cabecera que protege la cabina.', null, {ex: [0, 1.3, 0], dy: FD});
    const steel = mat(0x8f979f, {metalness: 0.75, roughness: 0.4}), pm = paintM(ctx), dk = mat(0x2b3036, {metalness: 0.4, roughness: 0.5}), alu = mat(0xc3c9cf, {metalness: 0.9, roughness: 0.3});
    box(car, len, 0.08, bwid, mat(0xffffff, {map: woodTex(), roughness: 0.85}), bm, yb, 0);
    box(car, len, 0.14, bwid + 0.04, dk, bm, yb - 0.1, 0);
    for (const s of [1, -1]){
      for (let k = 0; k < 3; k++) rb(car, len, 0.17, 0.04, 0.012, pm, bm, yb + 0.17 + k * 0.21, s * bwid / 2);
      for (let i = 0; i <= 6; i++) box(car, 0.06, 0.72, 0.06, steel, bx1 + 0.03 + i * (len - 0.06) / 6, yb + 0.38, s * (bwid / 2 + 0.02));
    }
    for (let k = 0; k < 3; k++) rb(car, 0.04, 0.17, bwid, 0.012, pm, bx1, yb + 0.17 + k * 0.21, 0);
    for (let k = 0; k < 6; k++) box(car, 0.05, 0.05, bwid, steel, bx0 - 0.03, yb + 0.12 + k * 0.24, 0);
    for (const z of [-bwid / 2, -bwid / 6, bwid / 6, bwid / 2]) box(car, 0.06, 1.35, 0.06, steel, bx0 - 0.03, yb + 0.68, z);
    rb(car, 0.12, 0.12, 2.3, 0.03, dk, bx1 + 0.1, 0.5, 0);
    for (const z of [-0.6, 0.6]) box(car, 0.08, 0.7, 0.08, frameM, bx1 + 0.12, 0.85, z);
    for (const s of [1, -1]) for (const y of [0.55, 0.85]) rb(car, -0.75 - (firstRear + R + 0.3), 0.06, 0.035, 0.015, alu, (-0.75 + firstRear + R + 0.3) / 2, y, s * (bwid / 2 - 0.05));
  }
  for (const s of [1, -1]){ const lx = (M.kind === 'tractor' ? M.frameEnd : lastRear - R - 0.25); box(fen, 0.02, 0.5, 0.62, fenM, lx - 0.05, 0.42, s * 0.9); }

  // Recentrar el camión en el origen
  const xFront = bxF + 0.06;
  ctx.len = xFront - rearMost;
  ctx.height = M.roofKit === 'deflector' ? M.defTop : c.roof;
  ctx.offset = -(xFront + rearMost) / 2;
  ctx.root.position.x = ctx.offset;
  ctx.title = M.title; ctx.sub = M.sub; ctx.specs = M.specs;
  finalizar(ctx);
  return ctx;
}

// Sombra: los objetos muy transparentes no proyectan sombra; y los materiales de rayos X se marcan para el estado
function finalizar(ctx: Ctx): void {
  ctx.root.traverse(o => {
    const m = o as THREE.Mesh, mt = m.material as THREE.Material;
    if (m.isMesh && mt && mt.transparent && mt.opacity < 0.5) m.castShadow = false;
  });
  ctx.xrayMats.forEach(m => { m.userData.side = m.side; });
}

function wheelKit(R: number) {
  const k = R / 0.52, v2 = (r: number, y: number) => new THREE.Vector2(r * k, y * k);
  const tire = [[0.30,-0.125],[0.34,-0.14],[0.40,-0.152],[0.45,-0.155],[0.485,-0.15],[0.505,-0.135],[0.516,-0.11],[0.52,-0.07],[0.521,-0.025],[0.521,0.025],[0.52,0.07],[0.516,0.11],[0.505,0.135],[0.485,0.15],[0.45,0.155],[0.40,0.152],[0.34,0.14],[0.30,0.125]].map(p => v2(p[0], p[1]));
  const tireGeo = new THREE.LatheGeometry(tire, 72); tireGeo.rotateX(PI / 2);
  const rim = [[0.001,0.118],[0.075,0.118],[0.105,0.108],[0.205,0.1],[0.235,0.085],[0.26,0.055],[0.275,0.05],[0.285,0.08],[0.292,0.125],[0.305,0.138],[0.298,0.145],[0.288,0.13],[0.288,-0.12]].map(p => v2(p[0], p[1]));
  const rimGeo = new THREE.LatheGeometry(rim, 64); rimGeo.rotateX(PI / 2);
  const nutGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.035, 6); nutGeo.rotateX(PI / 2);
  const capGeo = new THREE.SphereGeometry(0.07 * k, 20, 10, 0, 2 * PI, 0, PI / 2); capGeo.rotateX(PI / 2);
  return {k, tireGeo, rimGeo, nutGeo, capGeo, holeGeo: new THREE.CircleGeometry(0.03 * k, 18),
    tireM: mat(0x1c1d1f, {roughness: 0.88, metalness: 0, bumpMap: treadTex(), bumpScale: 2.5, side: THREE.DoubleSide}),
    rimM: mat(0xdfe3e7, {metalness: 1, roughness: 0.16, side: THREE.DoubleSide}),
    nutM: mat(0xe8ebee, {metalness: 1, roughness: 0.2}), holeM: mat(0x101214, {roughness: 0.9, side: THREE.DoubleSide})};
}
type Kit = ReturnType<typeof wheelKit>;
function makeWheel(parent: THREE.Object3D, x: number, z: number, side: number, kit: Kit, wide: boolean, showFace: boolean): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const t = add(g, kit.tireGeo, kit.tireM); if (wide) t.scale.z = 1.25;
  const f = new THREE.Group(); f.rotation.y = side > 0 ? 0 : PI; if (wide) f.position.z = side * 0.035; g.add(f);
  add(f, kit.rimGeo, kit.rimM);
  if (showFace){
    for (let i = 0; i < 10; i++){
      const a = i * 2 * PI / 10;
      add(f, kit.nutGeo, kit.nutM, Math.cos(a) * 0.143 * kit.k, Math.sin(a) * 0.143 * kit.k, 0.128 * kit.k, true);
      add(f, kit.holeGeo, kit.holeM, Math.cos(a + PI / 10) * 0.222 * kit.k, Math.sin(a + PI / 10) * 0.222 * kit.k, 0.096 * kit.k, true);
    }
    add(f, kit.capGeo, kit.nutM, 0, 0, 0.118 * kit.k);
  }
  return g;
}

/* ====================== Equipo de frío (tipo Thermo King) ====================== */
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function reeferTex(glow: boolean): THREE.CanvasTexture {
  return canvasTex(512, 480, (g, w, h) => {
    if (glow){ g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else {
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#f8fafb'); bg.addColorStop(1, '#dde2e6'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1f23'; for (let k = 0; k < 4; k++){ rrect(g, w * 0.14, h * (0.045 + k * 0.032), w * 0.72, h * 0.014, 3); g.fill(); }
      const gx = w * 0.06, gy = h * 0.2, gw = w * 0.88, gh = h * 0.5;
      g.fillStyle = '#15181b'; rrect(g, gx, gy, gw, gh, 18); g.fill();
      g.fillStyle = '#2c3238'; for (let y = gy + 8; y < gy + gh - 6; y += 9) g.fillRect(gx + 10, y, gw - 20, 4);
      for (const cx of [w * 0.3, w * 0.7]){
        const cy = gy + gh / 2, r = gh * 0.42;
        g.strokeStyle = '#6a737c'; g.lineWidth = 3;
        for (const f of [1, 0.72, 0.45]){ g.beginPath(); g.arc(cx, cy, r * f, 0, 2 * PI); g.stroke(); }
        for (let a = 0; a < 4; a++){ g.beginPath(); g.moveTo(cx + Math.cos(a * PI / 4) * r, cy + Math.sin(a * PI / 4) * r); g.lineTo(cx - Math.cos(a * PI / 4) * r, cy - Math.sin(a * PI / 4) * r); g.stroke(); }
        g.fillStyle = '#a3abb3'; g.beginPath(); g.arc(cx, cy, r * 0.13, 0, 2 * PI); g.fill();
      }
      g.fillStyle = '#2a2f35'; rrect(g, w * 0.06, h * 0.74, w * 0.88, h * 0.21, 12); g.fill();
      g.fillStyle = '#c9ced3'; for (let k = 0; k < 4; k++){ g.beginPath(); g.arc(w * (0.44 + k * 0.06), h * 0.825, 7, 0, 2 * PI); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.5, h * 0.15); g.lineTo(w * 0.5, h * 0.2); g.moveTo(w * 0.72, h * 0.76); g.lineTo(w * 0.72, h * 0.93); g.stroke();
      g.fillStyle = '#e8ecef'; g.font = '600 15px "IBM Plex Mono", monospace'; g.fillText('ON / OFF   DEFROST   SETPOINT', w * 0.42, h * 0.9);
    }
    g.fillStyle = glow ? '#2fbf74' : '#0c1a14'; g.fillRect(w * 0.11, h * 0.77, w * 0.24, h * 0.11);
    g.fillStyle = glow ? '#9dffcb' : '#57f2a0'; g.font = 'bold 34px "IBM Plex Mono", monospace'; g.textBaseline = 'middle'; g.fillText('-18.0°', w * 0.125, h * 0.828);
  });
}
// Unidad montada en el frontal de la caja: x = cara frontal de la caja, y = centro, w ancho, h alto, d fondo
function reeferUnit(ctx: Ctx, x: number, y: number, w: number, h: number, d: number): THREE.Group {
  const rf = part(ctx, 'equipoFrio', 'Equipo de frío', 'Unidad de refrigeración tipo Thermo King en el frontal de la caja: condensador con dos ventiladores, motor diésel propio y panel de control con la temperatura de consigna. Mantiene la carga entre unos −25 °C y +25 °C.', null, {ex: [1.0, 0.3, 0]});
  rb(rf, d, h, w, 0.09, mat(0xeef1f3, {roughness: 0.3, metalness: 0.1}), x + d / 2, y, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), new THREE.MeshStandardMaterial({map: reeferTex(false), emissiveMap: reeferTex(true), emissive: C(0xffffff), emissiveIntensity: 0.9, roughness: 0.45, metalness: 0.15}));
  face.rotation.y = PI / 2; face.position.set(x + d + 0.004, y, 0); rf.add(face);
  const ringM = mat(0x8b939b, {metalness: 0.8, roughness: 0.35}), fh = h - 0.08;
  for (const z of [-0.2 * w, 0.2 * w]){ const t = add(rf, new THREE.TorusGeometry(0.5 * fh * 0.42, 0.012, 6, 36), ringM, x + d + 0.012, y + fh * 0.05, z, true); t.rotation.y = PI / 2; }
  const lv = canvasTex(128, 128, (g, cw, ch2) => { g.fillStyle = '#e6eaed'; g.fillRect(0, 0, cw, ch2); g.fillStyle = '#23282d'; for (let yy = 10; yy < ch2 - 6; yy += 14) g.fillRect(12, yy, cw - 24, 6); });
  for (const s of [1, -1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.6, h * 0.35), new THREE.MeshStandardMaterial({map: lv, roughness: 0.5})); p.rotation.y = s > 0 ? 0 : PI; p.position.set(x + d / 2, y + h * 0.15, s * (w / 2 + 0.004)); rf.add(p); }
  return rf;
}

/* ====================== Carretas (semirremolques) ====================== */
interface OpcionesCarreta { type: string; xf: number; Ltr: number; nRear: number; full: boolean; R: number; kit: Kit; parked?: boolean; cfg: string; }
function buildTrailer(ctx: Ctx, o: OpcionesCarreta): { xr: number; top: number } {
  const R = o.R, kit = o.kit, type = o.type, xf = o.xf, Ltr = o.Ltr, xr = xf - Ltr, xm = (xf + xr) / 2, top = o.full ? 1.5 : 1.56;
  const fm = mat(0x23272c, {roughness: 0.5, metalness: 0.45}), alu = mat(0xc3c9cf, {metalness: 0.9, roughness: 0.3}), axM = mat(0x30353b, {roughness: 0.45, metalness: 0.55}), beamM = (type === 'furgon' || type === 'frio') ? fm : paintM(ctx);
  const redM = mat(0xc81e1e, {emissive: 0xb01010, emissiveIntensity: 0.8, roughness: 0.2}), ambM = mat(0xffb347, {emissive: 0xff8a00, emissiveIntensity: 0.9, roughness: 0.2});

  // Chasis, enganche, apoyo y parachoques
  const ch = part(ctx, 'carretaChasis', 'Chasis', o.full ? 'Dos vigas de acero con travesaños, eje delantero sobre corona giratoria, lanza de enganche delante y parachoques trasero antiempotramiento.' : 'Dos vigas de acero con travesaños, pivote de enganche (king pin) delante, patas de apoyo y parachoques trasero antiempotramiento.');
  for (const z of [-0.5, 0.5]) box(ch, Ltr, 0.28, 0.1, beamM, xm, top - 0.14, z);
  for (let x = xf - 0.3; x > xr + 0.2; x -= 1.2) box(ch, 0.08, 0.14, 2.3, fm, x, top - 0.09, 0);
  const rearXs: number[] = Array.from({length: o.nRear}, (_, k) => xr + 1.45 + k * 1.31), fx = xf - 1.5;
  let gStart: number;
  if (!o.full){
    box(ch, 1.7, 0.02, 1.3, fm, xf - 0.85, top - 0.275, 0);
    cyl(ch, 0.045, 0.06, chromeM(), xf - 1.15, top - 0.31, 0, 'y', 16);
    const lx = xf - 2.6;
    for (const z of [-0.55, 0.55]){
      rb(ch, 0.13, 0.55, 0.13, 0.02, fm, lx, top - 0.555, z);
      if (o.parked){ rb(ch, 0.09, 0.9, 0.09, 0.015, alu, lx, 0.48, z); rb(ch, 0.3, 0.04, 0.26, 0.015, fm, lx, 0.02, z); }
      else { rb(ch, 0.09, 0.55, 0.09, 0.015, alu, lx, 0.62, z); rb(ch, 0.3, 0.04, 0.26, 0.015, fm, lx, 0.33, z); }
    }
    between(ch, new V(lx, 0.95, -0.55), new V(lx, 0.95, 0.55), 0.025, fm);
    cyl(ch, 0.02, 0.3, alu, lx, 1.0, 0.75, 'z', 8);
    gStart = lx - 0.3;
  } else {
    cyl(ch, 0.62, 0.07, fm, fx, top - 0.33, 0, 'y', 40);
    box(ch, 1.3, 0.12, 1.1, fm, fx, top - 0.43, 0);
    const eye = new V(xf + 1.6, 0.6, 0);
    for (const z of [-0.45, 0.45]) between(ch, new V(fx + 0.25, R + 0.12, z), eye, 0.045, beamM);
    const ring = add(ch, new THREE.TorusGeometry(0.07, 0.025, 8, 20), fm, eye.x + 0.06, eye.y, 0); ring.rotation.x = PI / 2;
    cyl(ch, 0.025, 0.55, alu, xf + 1.2, 0.3, 0, 'y', 8);
    gStart = fx - R - 0.3;
  }
  const gEnd = rearXs[rearXs.length - 1] + R + 0.23;
  if (gStart - gEnd > 0.3) for (const s of [1, -1]){
    for (const y of [0.62, 0.92]) rb(ch, gStart - gEnd, 0.06, 0.035, 0.015, alu, (gStart + gEnd) / 2, y, s * 1.22);
    for (let x = gStart - 0.2; x > gEnd; x -= 2.4){ box(ch, 0.05, top - 0.28 - 0.6, 0.05, fm, x, (top - 0.28 + 0.6) / 2, s * 1.0); box(ch, 0.05, 0.05, 0.5, fm, x, top - 0.3, s * 0.75); rb(ch, 0.08, 0.05, 0.03, 0.012, ambM, x, 0.92, s * 1.245); }
  }
  rb(ch, 0.12, 0.12, 2.3, 0.03, fm, xr + 0.3, 0.55, 0);
  for (const z of [-0.5, 0.5]) box(ch, 0.08, top - 0.28 - 0.55, 0.08, fm, xr + 0.3, (top - 0.28 + 0.55) / 2, z);
  for (const s of [1, -1]){ rb(ch, 0.03, 0.11, 0.3, 0.02, redM, xr + 0.235, 0.55, s * 0.9); rb(ch, 0.03, 0.11, 0.14, 0.02, ambM, xr + 0.235, 0.55, s * 0.6); }
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), textMat(ctx.cfg.plate || o.cfg, 512, 108, '#15202b', '#f4f6f8', '600 64px "IBM Plex Mono", monospace'));
  pl.rotation.y = -PI / 2; pl.position.set(xr + 0.23, 0.78, 0); ch.add(pl);

  // Ejes
  const nTot = o.nRear + (o.full ? 1 : 0);
  const ax = part(ctx, 'carretaEjes', 'Ejes', (o.full ? 'Eje delantero direccional sobre corona giratoria y ' + (o.nRear > 1 ? o.nRear + ' ejes traseros' : 'un eje trasero') : (o.nRear === 3 ? 'Tres ejes en tándem (tridem)' : o.nRear === 2 ? 'Dos ejes en tándem' : 'Un eje')) + ', con suspensión neumática, frenos de tambor y ruedas gemelas. ' + nTot + (nTot > 1 ? ' ejes' : ' eje') + ' en total.');
  const axle = (x: number, front: boolean) => {
    const g = new THREE.Group(); g.position.set(x, R, 0); ax.add(g);
    const hh = top - (front ? 0.49 : 0.28) - R;
    cyl(g, 0.075, 1.75, axM, 0, 0, 0, 'z');
    for (const z of [-0.5, 0.5]){ rb(g, 0.8, 0.08, 0.1, 0.03, axM, 0.1, 0.05, z); box(g, 0.1, hh, 0.12, axM, 0.45, hh / 2, z); cyl(g, 0.12, Math.max(0.1, hh - 0.05), mat(0x141619, {roughness: 0.95}), -0.25, (hh + 0.05) / 2, z, 'y', 20); }
    for (const s of [1, -1]){ const wg = new THREE.Group(); g.add(wg); makeWheel(wg, 0, s * 0.735, s, kit, false, false); makeWheel(wg, 0, s * 1.075, s, kit, false, true); explodable(ctx, wg, [0, 0, s * 0.8]); }
  };
  rearXs.forEach(x => axle(x, false));
  if (o.full) axle(fx, true);
  const fz = mat(0x1e2125, {roughness: 0.8}), a0 = rearXs[0], a1 = rearXs[rearXs.length - 1];
  for (const s of [1, -1]){
    rb(ax, a1 - a0 + 1.3, 0.03, 0.8, 0.01, fz, (a0 + a1) / 2, R + 0.66, s * 0.905);
    box(ax, 0.02, 0.5, 0.7, fz, a0 - R - 0.12, 0.42, s * 0.9);
    if (o.full){ rb(ax, 1.3, 0.03, 0.8, 0.01, fz, fx, R + 0.6, s * 0.905); box(ax, 0.02, 0.45, 0.7, fz, fx - R - 0.12, 0.45, s * 0.9); }
  }

  // Caja según el tipo
  const N: Record<string, [string, string]> = {
    plataforma: ['Carreta plataforma', 'Semirremolque de plataforma con piso de madera, cantoneras laterales, bolsillos para estacas y cabecera delantera. Lleva carga paletizada, bobinas o maquinaria amarrada.'],
    furgon: ['Carreta furgón', 'Caja cerrada de paneles con perfiles de aluminio y doble puerta trasera. Protege la carga seca de la lluvia y el polvo.'],
    frio: ['Carreta furgón frigorífico', 'Caja isotérmica de paneles aislados con doble puerta trasera de cierre hermético. Mantiene la carga refrigerada o congelada.'],
    cisterna: ['Carreta cisterna', 'Tanque de acero inoxidable de sección elíptica, con bocas de carga arriba, pasarela con barandas, escalera trasera y tubo de descarga lateral.'],
    tolva: ['Carreta tolva (bañera)', 'Caja semicircular de acero antidesgaste para mineral y áridos. Un cilindro hidráulico telescópico delante la levanta para descargar por detrás.']
  };
  const body = part(ctx, 'carreta', N[type][0], N[type][1], null, {ex: [0, 1.6, 0]});
  let tTop = top;
  if (type === 'plataforma'){
    box(body, Ltr, 0.06, 2.5, mat(0xffffff, {map: woodTex(), roughness: 0.85}), xm, top + 0.03, 0);
    const railM = ctx.cfg.livery[1] ? stripeM(ctx.cfg.livery[1]) : beamM;
    for (const s of [1, -1]){ box(body, Ltr, 0.2, 0.06, railM, xm, top - 0.04, s * 1.25); for (let x = xf - 0.6; x > xr + 0.3; x -= 0.9) box(body, 0.08, 0.12, 0.05, fm, x, top - 0.02, s * 1.29); }
    for (let k = 0; k < 5; k++) box(body, 0.05, 0.05, 2.5, alu, xf - 0.05, top + 0.12 + k * 0.22, 0);
    for (const z of [-1.22, -0.4, 0.4, 1.22]) box(body, 0.06, 1.1, 0.06, alu, xf - 0.05, top + 0.55, z);
    tTop = top + 1.1;
  } else if (type === 'frio' || type === 'furgon'){
    const bx0 = xf - 0.05, bx1 = xr + 0.05, yb = top + 0.02, yt = 4.1, bw = 2.6, len = bx0 - bx1, bm = (bx0 + bx1) / 2;
    const whiteM = tint(ctx, mat(0xffffff, {roughness: 0.45})), sideM = tint(ctx, mat(0xffffff, {map: sideTex(), roughness: 0.45, metalness: 0.05}));
    add(body, new THREE.BoxGeometry(len, yt - yb, bw), [whiteM, whiteM, whiteM, mat(0x2b3036), sideM, sideM], bm, (yb + yt) / 2, 0);
    for (const y of [yb, yt]) for (const z of [-bw / 2, bw / 2]) rb(body, len + 0.02, 0.07, 0.07, 0.02, alu, bm, y, z);
    for (const x of [bx0, bx1]) for (const z of [-bw / 2, bw / 2]) rb(body, 0.07, yt - yb + 0.06, 0.07, 0.02, alu, x, (yb + yt) / 2, z);
    box(body, 0.012, yt - yb - 0.1, 0.02, mat(0x9aa2aa), bx1 - 0.006, (yb + yt) / 2, 0);
    for (const z of [-1.0, -0.38, 0.38, 1.0]) cyl(body, 0.018, yt - yb - 0.2, chromeM(), bx1 - 0.03, (yb + yt) / 2, z, 'y', 10);
    for (const z of [-1.28, 1.28]) for (const y of [yb + 0.4, (yb + yt) / 2, yt - 0.4]) rb(body, 0.06, 0.2, 0.08, 0.02, alu, bx1 - 0.03, y, z);
    for (const s of [1, -1]) for (let x = bx0 - 1; x > bx1 + 0.5; x -= 3) rb(body, 0.03, 0.05, 0.08, 0.012, ambM, x, yb + 0.08, s * (bw / 2 + 0.035));
    boxStripes(ctx, body, bx0 - 0.05, bx1 + 0.05, yb + 0.6, bw / 2);
    if (type === 'frio'){
      const rf = reeferUnit(ctx, bx0, yt - 0.98, 2.0, 1.75, 0.5);
      rb(rf, 0.7, 0.36, 0.36, 0.1, alu, xf - 3.6, top - 0.5, -0.95);
      rb(rf, 0.35, 0.3, 0.3, 0.04, mat(0x2b3036, {roughness: 0.6}), xf - 4.2, top - 0.48, -0.95);
    }
    tTop = yt;
  } else if (type === 'cisterna'){
    const st = mat(0xe4e8eb, {metalness: 1, roughness: 0.2}), st2 = mat(0xc9ced3, {metalness: 1, roughness: 0.35}), tl = Ltr - 0.9, cx = xm - 0.1, rr = 1.0, cy = top + 0.06 + rr;
    const sh = add(body, new THREE.CylinderGeometry(rr, rr, tl, 56, 1, true), st, cx, cy, 0); sh.rotation.z = PI / 2; sh.scale.set(1, 1, 1.2);
    for (const s of [1, -1]){ const hd = add(body, new THREE.SphereGeometry(rr, 48, 16, 0, 2 * PI, 0, PI / 2), st, cx + s * tl / 2, cy, 0); hd.rotation.z = -s * PI / 2; hd.scale.set(1, 0.3, 1.2); }
    for (let k = 0; k <= 5; k++){ const b = add(body, new THREE.CylinderGeometry(rr + 0.012, rr + 0.012, 0.07, 56, 1, true), st2, cx - tl / 2 + 0.3 + k * (tl - 0.6) / 5, cy, 0); b.rotation.z = PI / 2; b.scale.set(1, 1, 1.2); }
    const wl = tl * 0.75;
    for (let k = 0; k < 4; k++){ const x = cx - wl / 2 + 0.6 + k * (wl - 1.2) / 3; cyl(body, 0.25, 0.14, st2, x, cy + rr + 0.04, 0, 'y', 32); cyl(body, 0.27, 0.035, st, x, cy + rr + 0.12, 0, 'y', 32); }
    const grate = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#5b636b'; g.fillRect(0, 0, w, h); g.fillStyle = '#aab2b9'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h); });
    box(body, wl, 0.03, 0.42, mat(0xffffff, {map: grate, metalness: 0.7, roughness: 0.4}), cx, cy + rr + 0.2, 0);
    for (const z of [-0.3, 0.3]){ cyl(body, 0.018, wl, st2, cx, cy + rr + 0.75, z, 'x', 8); for (let k = 0; k <= 5; k++) cyl(body, 0.015, 0.55, st2, cx - wl / 2 + k * wl / 5, cy + rr + 0.48, z, 'y', 8); }
    for (let k = 0; k < 4; k++) box(body, 0.22, 0.12, 1.3, fm, cx - tl / 2 + 0.8 + k * (tl - 1.6) / 3, top + 0.04, 0);
    cyl(body, 0.05, tl - 1, st2, cx, top + 0.1, 0.95, 'x', 12);
    const lxr = cx - tl / 2 - 0.36;
    for (const z of [-0.22, 0.22]) cyl(body, 0.02, cy + rr - top + 0.4, st2, lxr, (top + cy + rr + 0.4) / 2, z, 'y', 8);
    for (let y = top + 0.3; y < cy + rr + 0.3; y += 0.3) cyl(body, 0.015, 0.44, st2, lxr, y, 0, 'z', 8);
    tTop = cy + rr + 0.8;
  } else if (type === 'tolva'){
    const r = 1.2, x0 = xf - 0.25, x1 = xr + 0.2, len = x0 - x1, yb = top + 0.04, H = new V(x1, yb, 0);
    const piv = new THREE.Group(); piv.position.copy(H); body.add(piv); ctx.tip = piv; ctx.tipMax = 0.62;
    const pm = paintM(ctx, true), rib = paintM(ctx), dk = mat(0x2b3036, {roughness: 0.6, metalness: 0.4});
    const tub = add(piv, new THREE.CylinderGeometry(r, r, len, 48, 1, true, PI, PI), pm, len / 2, r, 0); tub.rotation.z = PI / 2;
    for (const s of [1, -1]){ rb(piv, len, 0.45, 0.05, 0.015, pm, len / 2, r + 0.225, s * r); cyl(piv, 0.045, len, rib, len / 2, r + 0.46, s * r, 'x', 12); }
    for (const ex of [0, len]){ const e = add(piv, new THREE.CircleGeometry(r, 40, PI, PI), pm, ex, r, 0); e.rotation.y = PI / 2; box(piv, 0.05, 0.45, 2 * r, pm, ex, r + 0.225, 0); }
    const lip = rb(piv, 0.35, 0.05, 2 * r + 0.1, 0.02, pm, len + 0.12, r + 0.5, 0); lip.rotation.z = 0.2;
    for (let k = 1; k < 7; k++){ const t = add(piv, new THREE.TorusGeometry(r + 0.03, 0.045, 8, 32, PI), rib, k * len / 7, r, 0); t.rotation.set(0, PI / 2, PI); }
    for (const z of [-0.5, 0.5]) box(piv, len, 0.1, 0.12, dk, len / 2, -0.03, z);
    const ramM = chromeM(), ramB = mat(0x2b3036, {metalness: 0.5, roughness: 0.4});
    ctx.ram = {base: new V(x0 + 0.1, top - 0.05, 0), anchor: new V(x0 + 0.06, yb + r + 0.3, 0), H, parts: [add(body, unitCyl, ramB), add(body, unitCyl, ramM), add(body, unitCyl, ramM)]};
    tTop = yb + r + 0.5;
  }
  return {xr: xr - 0.05, top: tTop};
}

// Carreta sola, aparcada: semirremolque (S) sobre sus patas o remolque (R) con su eje delantero y lanza
function buildStandalone(M: ModeloDef, cfg: ConfigConstruccion): Ctx {
  const ctx = crearCtx(M, cfg);
  const tcfg = cfg.trailerCfg, full = tcfg[0] === 'R', n = +tcfg[1], nRear = full ? n - 1 : n;
  const Ltr = full ? (nRear === 1 ? 9.4 : 10.4) : (n === 1 ? 9.2 : n === 2 ? 12.2 : 13.4);
  const t = buildTrailer(ctx, {type: M.ttype as string, xf: Ltr / 2, Ltr, nRear, full, R: 0.52, kit: wheelKit(0.52), parked: true, cfg: tcfg});
  const xFront = full ? Ltr / 2 + 1.75 : Ltr / 2;
  ctx.len = xFront - t.xr; ctx.height = t.top; ctx.offset = -(xFront + t.xr) / 2; ctx.root.position.x = ctx.offset;
  const lbl = TLABEL[M.ttype as string];
  ctx.title = lbl + ' ' + tcfg;
  ctx.sub = (full ? 'Remolque' : 'Semirremolque') + ' · ' + n + (n > 1 ? ' ejes' : ' eje');
  ctx.specs = [['Tipo', full ? 'Remolque con lanza' : 'Semirremolque'], ['Configuración', tcfg + ' · ' + n + (n > 1 ? ' ejes' : ' eje')], ['Carrocería', lbl], ['Largo', '≈ ' + Ltr.toFixed(1).replace('.', ',') + ' m'], ['Ancho', (M.ttype === 'frio' || M.ttype === 'furgon') ? '2,6 m' : '2,5 m'], ['Suspensión', 'Neumática'], ['Neumáticos', '315/80 R22.5'], ['Carroceros en tu flota', 'Max Metal, Melga, Maconsac…']];
  finalizar(ctx);
  return ctx;
}

/**
 * Construye la unidad 3D. Carretas (kind 'trailer') se ven solas; el resto, camión o tracto con su carrocería.
 * Equivale a build() del original, sin globales: la placa, la librea, el frío y la configuración vienen en cfg.
 */
export function construir(M: ModeloDef, cfg: ConfigConstruccion): Modelo {
  return M.kind === 'trailer' ? buildStandalone(M, cfg) : buildTruck(M, cfg);
}
