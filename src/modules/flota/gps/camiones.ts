// Unidades en 3D (three.js r128 dentro de la escena del mapa). Geometría copiada literal del prototipo
// ("Unidades en 3D"): tracto con semirremolque (furgón, frío o plataforma), camión furgón y frigorífico,
// aura según estado, conos de luz de noche y haz de la unidad seleccionada.
import * as THREE from 'three-r128';
import maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, Map as MapaGL } from 'maplibre-gl';
import { ZOOM_3D } from './mapaConfig';
import { construir as construirModelo, type ConfigConstruccion } from '../../placas/tresd/modelos';
import type { ModeloDef } from '../../placas/tresd/modelosDatos';
import type { LngLat } from './geo';

export type ClaseEstado = 'mov' | 'ral' | 'det' | 'off';
export const ST: Record<ClaseEstado, { c: string; l: string }> = {
  mov: { c: '#22e3a0', l: 'En movimiento' }, ral: { c: '#ffb020', l: 'Ralentí' },
  det: { c: '#5b9dff', l: 'Detenido' }, off: { c: '#ff5470', l: 'Sin señal' },
};

export interface DescCamion {
  /** rig = tracto con semirremolque · box = camión furgón · reefer = camión frigorífico · semi = semirremolque o carreta solo (sin cabina), como en Placas */
  kind: 'rig' | 'box' | 'reefer' | 'semi';
  trailer: 'furgon' | 'frio' | 'plataforma';
  /** Ejes del semirremolque o carreta (de su configuración S1-S3 / R2-R3) */
  ejes?: number;
  /** Modelo 3D de la vista Placas en 3D para esta unidad (no se serializa; `mid` identifica la versión). Sin él se usa el dibujo simple. */
  modelo?: { M: ModeloDef; cfg: ConfigConstruccion };
  mid?: string;
  colors: number[];
  /** Cabina con trompa larga (International, Freightliner) */
  larga: boolean;
}

/** Lo que el motor le pasa a la capa 3D en cada cuadro */
export interface VistaCamion {
  placa: string;
  desc: DescCamion;
  pos: LngLat | null;
  rumbo: number;
  st: ClaseEstado;
  sel: boolean;
  visible: boolean;
}

const ORIGIN = maplibregl.MercatorCoordinate.fromLngLat([-76.98, -12.05], 0);
const MS = ORIGIN.meterInMercatorCoordinateUnits();
const BASE_T = new THREE.Matrix4().makeTranslation(ORIGIN.x, ORIGIN.y, ORIGIN.z)
  .multiply(new THREE.Matrix4().makeScale(MS, -MS, MS)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

type Malla = THREE.Group & { userData: { ring: THREE.Mesh; cone: THREE.Mesh; beam: THREE.Mesh } };
interface Pieza3D { mesh: Malla; clave: string; /** Radio (m) que cubre la unidad con su aura y el cono de luz */ radio: number }

export class Camiones3D {
  readonly capa: CustomLayerInterface;
  /** Lo rellena el motor antes de cada dibujo */
  vistas: VistaCamion[] = [];
  activa = true;
  noche = true;
  relieve = false;

  private scene = new THREE.Scene();
  private cam3 = new THREE.Camera();
  private hemi = new THREE.HemisphereLight(0xdfe9ff, 0x2a2f38, .9);
  private sunL = new THREE.DirectionalLight(0xffffff, .9);
  private renderer: THREE.WebGLRenderer | null = null;
  private mapa: MapaGL | null = null;
  private piezas = new Map<string, Pieza3D>();
  private G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    wheel: new THREE.CylinderGeometry(.52, .52, .36, 18).rotateZ(Math.PI / 2),
    hub: new THREE.CylinderGeometry(.26, .26, .38, 12).rotateZ(Math.PI / 2),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    beam: new THREE.CylinderGeometry(.5, .5, 1, 20, 1, true),
  };
  private matCache: Record<string, THREE.MeshStandardMaterial> = {};
  private glowTex: THREE.CanvasTexture;
  private coneTex: THREE.CanvasTexture;

  constructor() {
    this.scene.add(this.hemi);
    this.sunL.position.set(40, 90, 30);
    this.scene.add(this.sunL);
    this.glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(.45, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    this.coneTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d')!; const r = g.createLinearGradient(0, 256, 0, 0); r.addColorStop(0, 'rgba(255,240,200,.75)'); r.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(26, 256); g.lineTo(38, 256); g.lineTo(64, 0); g.lineTo(0, 0); g.closePath(); g.fill(); return new THREE.CanvasTexture(c); })();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.capa = {
      id: 'trucks3d', type: 'custom', renderingMode: '3d',
      onAdd(m, gl) {
        self.mapa = m;
        if (!self.renderer) {
          self.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGLRenderingContext, antialias: true });
          self.renderer.autoClear = false;
          self.renderer.outputEncoding = THREE.sRGBEncoding;
        }
      },
      render(_gl, args) { self.dibujar(args as unknown as { defaultProjectionData: { mainMatrix: number[] } }); },
    };
  }

  private M(hex: number, o: Record<string, unknown> = {}) {
    const k = hex + JSON.stringify(o);
    return this.matCache[k] || (this.matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: .55, metalness: .15 }, o)));
  }
  private add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
  }
  private wheels(g: THREE.Object3D, zs: number[], x: number) {
    const tire = this.M(0x16181c, { roughness: .9 }), hub = this.M(0xc9ced6, { metalness: .7, roughness: .3 });
    zs.forEach(z => [-x, x].forEach(sx => { this.add(g, this.G.wheel, tire, 1, 1, 1, sx, .52, z); this.add(g, this.G.hub, hub, 1, 1, 1, sx * 1.02, .52, z); }));
  }
  private cab(g: THREE.Object3D, z: number, c1: number, c2: number | undefined, long: boolean) { // cabina mirando hacia -z
    const G = this.G, M = this.M.bind(this);
    const paint = M(c1, { metalness: .35, roughness: .35 }), glass = M(0x0d1520, { metalness: .8, roughness: .12 }), dark = M(0x1c2128);
    this.add(g, G.box, paint, 2.5, 2.3, 2.2, 0, 2.05, z);
    if (long) this.add(g, G.box, paint, 2.3, 1.1, 1.6, 0, 1.4, z - 1.85);
    this.add(g, G.box, glass, 2.3, 1.0, .06, 0, 2.55, z - 1.12);
    this.add(g, G.box, glass, .06, .9, 1.1, 1.26, 2.55, z - .3); this.add(g, G.box, glass, .06, .9, 1.1, -1.26, 2.55, z - .3);
    this.add(g, G.box, M(c2 || 0x333a44), 2.52, .32, 2.22, 0, 1.55, z);
    const fz = z - (long ? 2.66 : 1.12);
    this.add(g, G.box, dark, 2.2, .7, .1, 0, 1.15, fz);
    this.add(g, G.box, M(0xffffff, { emissive: 0xfff3d6, emissiveIntensity: 1.4 }), .45, .22, .08, .85, 1.0, fz - .03);
    this.add(g, G.box, M(0xffffff, { emissive: 0xfff3d6, emissiveIntensity: 1.4 }), .45, .22, .08, -.85, 1.0, fz - .03);
    this.add(g, G.box, M(0xffb020, { emissive: 0xff9a00, emissiveIntensity: 1.2 }), 2.0, .08, .08, 0, 3.24, z - .9);
    return fz;
  }
  private body(g: THREE.Object3D, z: number, len: number, c1: number, c2: number | undefined, c3: number | undefined, type: string) {
    const G = this.G, M = this.M.bind(this);
    if (type === 'plataforma') { this.add(g, G.box, M(c1), 2.5, .25, len, 0, 1.25, z); this.add(g, G.box, M(0x6b4f33, { roughness: .9 }), 2.45, .06, len - .2, 0, 1.4, z); return; }
    this.add(g, G.box, M(c1, { roughness: .45 }), 2.6, 2.9, len, 0, 2.65, z);
    if (c2 !== undefined) [1.315, -1.315].forEach(x => this.add(g, G.box, M(c2), .02, .4, len - .4, x, 1.85, z));
    if (c3 !== undefined) [1.316, -1.316].forEach(x => this.add(g, G.box, M(c3), .02, .14, len - .4, x, 1.52, z));
    if (type === 'frio') this.add(g, G.box, M(0xdfe3e8), 1.9, 1.15, .45, 0, 3.35, z - len / 2 - .22);
    this.add(g, G.box, M(0xff2a2a, { emissive: 0xff0000, emissiveIntensity: 1.3 }), .3, .16, .06, 1.1, .95, z + len / 2 + .04);
    this.add(g, G.box, M(0xff2a2a, { emissive: 0xff0000, emissiveIntensity: 1.3 }), .3, .16, .06, -1.1, .95, z + len / 2 + .04);
  }

  private construir(d: DescCamion): Pieza3D {
    const G = this.G, M = this.M.bind(this);
    const g = new THREE.Group() as Malla, v = new THREE.Group(); g.add(v);
    const [c1, c2, c3] = d.colors;
    let len = 9, front = -4.3, usado = false;
    // Mismo modelo 3D de la vista Placas en 3D (misma marca, carrocería, ejes y colores)
    if (d.modelo) {
      try {
        const m = construirModelo(d.modelo.M, d.modelo.cfg);
        // Como la vista Placas en 3D: el color de la ficha (o el del modelo) pinta la carrocería
        const pintura = new THREE.Color(d.modelo.cfg.livery.length ? d.modelo.cfg.livery[0] : d.modelo.M.paint);
        m.paintMats.forEach(mat => (mat as THREE.MeshStandardMaterial).color.copy(pintura));
        m.root.rotation.y = Math.PI / 2; // en Placas el frente va hacia +x; aquí la unidad mira hacia -z
        v.add(m.root);
        v.updateMatrixWorld(true);
        const caja = new THREE.Box3().setFromObject(m.root);
        const cz = (caja.min.z + caja.max.z) / 2, cx = (caja.min.x + caja.max.x) / 2;
        m.root.position.set(-cx, 0, -cz);
        len = caja.max.z - caja.min.z; front = caja.min.z - cz; usado = true;
      } catch (e) { console.warn('Modelo 3D de Placas no disponible, se usa el dibujo simple:', e); while (v.children.length) v.remove(v.children[0]); }
    }
    if (usado) { /* ya construido */ } else {
    if (d.kind !== 'semi') this.add(v, G.box, M(0x1d2026), 1.1, .35, d.kind === 'rig' ? 6.5 : 8.6, 0, .78, d.kind === 'rig' ? -4.2 : 0);
    if (d.kind === 'semi') {
      // Solo el semirremolque o la carreta: caja (con su equipo de frío si es Thermo King), patas de apoyo y ejes atrás
      this.body(v, 0, 13.2, d.trailer === 'frio' ? 0xf2f4f7 : c1, c2, c3, d.trailer); this.add(v, G.box, M(0x1d2026), 1.0, .3, 13, 0, .95, 0);
      this.add(v, G.box, M(0x2a2f36), .18, 1.0, .18, .9, .5, -4.8); this.add(v, G.box, M(0x2a2f36), .18, 1.0, .18, -.9, .5, -4.8);
      const n = Math.max(1, Math.min(3, d.ejes ?? 3));
      this.wheels(v, Array.from({ length: n }, (_, i) => 5.9 - 1.3 * (n - 1 - i)), 1.12); len = 13.4; front = -6.9;
    } else if (d.kind === 'rig') {
      const fz = this.cab(v, -6.1, c1, c2, d.larga);
      this.wheels(v, [-6.2, -3.4, -2.1], 1.12); this.add(v, G.box, M(0x2a2f36), 1.4, .15, 1.4, 0, 1.05, -2.8);
      this.body(v, 3.2, 13.2, d.trailer === 'frio' ? 0xf2f4f7 : c1, c2, c3, d.trailer); this.add(v, G.box, M(0x1d2026), 1.0, .3, 13, 0, .95, 3.2);
      this.wheels(v, [6.9, 8.2, 9.5], 1.12); len = 17.5; front = fz;
    } else {
      const fz = this.cab(v, -3.2, c1, c2, d.larga);
      this.wheels(v, [-3.3, 2.0, 3.3], 1.1); this.body(v, .95, 6.5, d.kind === 'reefer' ? 0xf2f4f7 : c1, c2, c3, d.kind === 'reefer' ? 'frio' : 'furgon');
      len = 9; front = fz;
    }
    }
    // aura de estado bajo la unidad y conos de luz
    const ring = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: this.glowTex, color: ST.mov.c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }));
    ring.scale.set(9, 1, len + 6); ring.position.y = .06; ring.position.z = !usado && d.kind === 'rig' ? 1.2 : 0; ring.renderOrder = 1; g.add(ring);
    const cone = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: this.coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .8 }));
    cone.scale.set(9, 1, 24); cone.position.set(0, .08, front - 12); g.add(cone);
    const beam = new THREE.Mesh(G.beam, new THREE.MeshBasicMaterial({ color: 0x38d6ff, transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.scale.set(1.2, 90, 1.2); beam.position.y = 45; g.add(beam);
    g.userData = { ring, cone, beam };
    g.visible = false; this.scene.add(g);
    return { mesh: g, clave: JSON.stringify(d), radio: len / 2 + 30 };
  }

  private dibujar(args: { defaultProjectionData: { mainMatrix: number[] } }) {
    const m = this.mapa, r = this.renderer;
    if (!m || !r) return;
    const z = m.getZoom();
    if (!this.activa || z < ZOOM_3D) return;
    const P = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(BASE_T);
    this.cam3.projectionMatrix = P;
    const k = Math.max(1.3, Math.min(6, Math.pow(2, 19.1 - z))), night = this.noche, t = performance.now() / 1000;
    this.hemi.intensity = night ? .55 : .95; this.sunL.intensity = night ? .35 : .95;
    const fade = Math.min(1, (z - ZOOM_3D) / .8);
    const vivas = new Set<string>();
    const activos: Array<{ g: Malla; radio: number }> = [];
    for (const u of this.vistas) {
      vivas.add(u.placa);
      let e = this.piezas.get(u.placa);
      const clave = JSON.stringify(u.desc);
      const p = u.pos;
      // Solo se arma la unidad que se ve (los modelos de Placas son detallados): las demás se arman cuando aparecen
      if ((!e || e.clave !== clave) && p && u.visible) {
        if (e) this.scene.remove(e.mesh);
        e = this.construir(u.desc);
        this.piezas.set(u.placa, e);
      }
      if (!e) continue;
      const g = e.mesh;
      if (!p || !u.visible) { g.visible = false; continue; }
      const mc = maplibregl.MercatorCoordinate.fromLngLat(p, 0);
      const elev = (this.relieve && m.queryTerrainElevation(p)) || 0;
      g.position.set((mc.x - ORIGIN.x) / MS, elev, (mc.y - ORIGIN.y) / MS);
      g.rotation.y = -u.rumbo * Math.PI / 180; g.scale.setScalar(k * fade + .001); g.visible = true;
      const d = g.userData, sel = u.sel;
      (d.ring.material as THREE.MeshBasicMaterial).color.set(ST[u.st].c);
      (d.ring.material as THREE.MeshBasicMaterial).opacity = (sel ? .95 : .6) * (night ? 1 : .7);
      d.cone.visible = night && u.st === 'mov';
      d.beam.visible = sel;
      if (sel) (d.beam.material as THREE.MeshBasicMaterial).opacity = .18 + .1 * Math.sin(t * 3);
      activos.push({ g, radio: e.radio });
    }
    // Unidades que ya no están: se quitan de la escena
    for (const [placa, e] of this.piezas) if (!vivas.has(placa)) { this.scene.remove(e.mesh); this.piezas.delete(placa); }
    // Precisión de profundidad: el mapa usa un rango de distancias enorme y las piezas de un modelo que casi se tocan (franjas, vidrios, paneles)
    // se «pelean» y salen manchas negras al acercarse. Se ajusta el cerca/lejos al rango real de las unidades que se ven, y las que quedan fuera
    // de la pantalla no se dibujan.
    const e = P.elements, gradW = Math.hypot(e[3], e[7], e[11]), gx = Math.hypot(e[0], e[4], e[8]), gy = Math.hypot(e[1], e[5], e[9]);
    const v4 = new THREE.Vector4();
    let lo = Infinity, hi = 0;
    for (const a of activos) {
      const sc = a.g.scale.x, R = a.radio * sc;
      v4.set(a.g.position.x, a.g.position.y + 2 * sc, a.g.position.z, 1).applyMatrix4(P);
      const dw = R * gradW;
      const visible = v4.w + dw > 0 && Math.abs(v4.x) <= v4.w + dw + R * gx && Math.abs(v4.y) <= v4.w + dw + R * gy;
      a.g.visible = visible;
      if (visible) { lo = Math.min(lo, v4.w - dw); hi = Math.max(hi, v4.w + dw); }
    }
    if (!(hi > 0)) return;
    const n = Math.max(lo, hi * 1e-5) * .98, f = hi * 1.02;
    const A = (f + n) / (f - n), B = -2 * f * n / (f - n);
    const pe = this.cam3.projectionMatrix.elements;
    pe[2] = A * e[3]; pe[6] = A * e[7]; pe[10] = A * e[11]; pe[14] = A * e[15] + B;
    r.resetState(); r.clearDepth(); r.render(this.scene, this.cam3);
  }

  /** Libera la escena (solo al cerrar la sesión) */
  liberar() {
    this.piezas.forEach(e => this.scene.remove(e.mesh));
    this.piezas.clear();
    Object.values(this.G).forEach(g => g.dispose());
    Object.values(this.matCache).forEach(m => m.dispose());
    this.glowTex.dispose(); this.coneTex.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
