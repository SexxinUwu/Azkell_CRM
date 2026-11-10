/**
 * Escena 3D de "Placas en 3D": renderer, cámara, sala de exposición, luces, bucle de dibujo,
 * selección de piezas y animaciones de los interruptores (despiece, cabina, puertas, rayos X, volquete).
 *
 * Port de la lógica de render de docs/referencia/flota-3d.html (Three.js r128). Sin globales:
 * cada instancia tiene su propio renderer, escena, cámara, bucle y estado.
 */
import * as THREE from 'three-r128';
import { OrbitControls } from 'three-r128/examples/jsm/controls/OrbitControls.js';
import { compartidos, construir, fijarAnisotropia, type ConfigConstruccion, type Modelo, type Parte } from './modelos';
import type { ModeloDef } from './modelosDatos';

export type Toggle = 'explode' | 'tilt' | 'doors' | 'xray' | 'tip' | 'rotate';
export type Vista = 'v34' | 'front' | 'side' | 'rear' | 'top' | 'under' | 'engine' | 'inside';
export interface EventosVisor {
  onHover(nombre: string | null, x: number, y: number): void;
  onSeleccion(parte: Parte | null): void;
}
export interface AnclasVisor { cabecera: HTMLElement; barra: HTMLElement; }

/** Interruptores animados (el giro de la unidad se maneja aparte con controls.autoRotate). */
type Estado = 'explode' | 'tilt' | 'doors' | 'xray' | 'tip';
type Terna = [number, number, number];
interface Vuelo { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number; d: number; t: number; }

const PI = Math.PI;
const V = THREE.Vector3;
const CLAVES: readonly Estado[] = ['explode', 'tilt', 'doors', 'xray', 'tip'];
// Calidad automática: nivel 0 = máxima. Cada nivel baja píxeles y sombras.
const QUALITY = [{pr: 2, sh: 4096}, {pr: 1.5, sh: 2048}, {pr: 1, sh: 1024}, {pr: 0.8, sh: 1024}];
const C = (h: number): THREE.Color => new THREE.Color(h).convertSRGBToLinear();

// Orienta un cilindro unitario (altura 1) entre dos puntos
function orient(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  const d = new V().subVectors(b, a), l = Math.max(0.001, d.length());
  o.position.copy(a).addScaledVector(d, 0.5);
  o.scale.set(r, l, r);
  o.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}

export class Escena3D {
  private readonly canvas: HTMLCanvasElement;
  private readonly anclas: AnclasVisor;
  private readonly eventos: EventosVisor;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly stage = new THREE.Group();
  private readonly stageDeck: THREE.MeshStandardMaterial;
  private readonly ringW1: THREE.MeshBasicMaterial;
  private readonly ringW2: THREE.MeshBasicMaterial;
  private readonly groundMat: THREE.MeshStandardMaterial;
  private readonly contact: THREE.Mesh;
  private readonly hlMat = new THREE.MeshBasicMaterial({color: 0xf97316, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, toneMapped: false});
  private readonly ray = new THREE.Raycaster();
  private readonly ptr = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private readonly maxAniso: number;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private cur: Modelo | null = null;
  private ultimo: {M: ModeloDef; cfg: ConfigConstruccion} | null = null;
  private seleccion: Parte | null = null;
  private readonly actual: Record<Estado, number> = {explode: 0, tilt: 0, doors: 0, xray: 0, tip: 0};
  private readonly objetivo: Record<Estado, number> = {explode: 0, tilt: 0, doors: 0, xray: 0, tip: 0};
  // Se dibuja solo cuando algo cambia: cámara, animación, pintura, tema, tamaño o pieza resaltada
  private sucio = true;
  private fly: Vuelo | null = null;
  private freeAspect = 1.6;
  private freeScale = 1;
  private curPaint: number | null = null;

  private hoverPending: [number, number] | null = null;
  private hoverName: string | null = null;
  private downAt: [number, number] | null = null;
  private lastSize = '';
  private resizeObs: ResizeObserver | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId = 0;
  private readonly reduce: boolean;
  private calidad = 0;
  private lento = 0;
  private encadenado = false;
  private errorReportado = false;
  private destruida = false;
  private _renders = 0;

  private readonly onMove = (e: PointerEvent): void => { this.hoverPending = [e.clientX, e.clientY]; };
  private readonly onLeave = (): void => {
    this.hoverPending = null;
    if (this.hoverName !== null){ this.hoverName = null; this.eventos.onHover(null, 0, 0); }
    this.canvas.style.cursor = '';
  };
  private readonly onDown = (e: PointerEvent): void => { this.downAt = [e.clientX, e.clientY]; };
  private readonly onUp = (e: PointerEvent): void => {
    if (!this.downAt || !this.cur) return;
    const moved = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]);
    this.downAt = null;
    // Más de 5 px de desplazamiento es un arrastre, no un clic
    if (moved > 5 || e.button !== 0) return;
    this.seleccionar(this.pick(e.clientX, e.clientY), false);
  };
  private readonly onCtxLost = (e: Event): void => { e.preventDefault(); };
  private readonly onCtxRestored = (): void => {
    // Tras perder el contexto 3D se reaplica la calidad y se reconstruye la unidad actual
    this.aplicarCalidad();
    if (this.ultimo) this.cargar(this.ultimo.M, this.ultimo.cfg, true);
  };
  private readonly onVis = (): void => {
    if (!document.hidden){ this.clock.getDelta(); this.encadenado = false; this.invalidate(); }
  };
  private readonly onInicioControl = (): void => { this.fly = null; };
  private readonly onCambioControl = (): void => { this.invalidate(); };

  constructor(canvas: HTMLCanvasElement, visor: HTMLElement, anclas: AnclasVisor, eventos: EventosVisor) {
    this.canvas = canvas;
    this.anclas = anclas;
    this.eventos = eventos;
    try {
      this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
    } catch (err) {
      throw new Error('WebGL no está disponible en este navegador. ' + (err instanceof Error ? err.message : ''));
    }
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    fijarAnisotropia(this.maxAniso);
    this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.montarEntorno();

    // Cámara y controles
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.35; this.controls.maxDistance = 75;
    this.controls.maxPolarAngle = PI * 0.49;
    this.controls.autoRotateSpeed = 0.9;

    // Luces
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x15181d, 0.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfffaf2, 1.7);
    this.sun.position.set(8, 16, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.rim = new THREE.DirectionalLight(0x8fbcff, 0.7);
    this.rim.position.set(-12, 7, -9);
    this.scene.add(this.rim);
    const warm = new THREE.DirectionalLight(0xffcf9a, 0.25);
    warm.position.set(6, 2.5, 12);
    this.scene.add(warm);

    // Suelo oscuro y brillante que se funde con el fondo
    this.groundMat = new THREE.MeshStandardMaterial({color: C(0x1a1e25), roughness: 0.42, metalness: 0.25, envMapIntensity: 0.35,
      transparent: true, alphaMap: this.radial([[0, '#fff'], [0.3, '#fff'], [0.72, '#333'], [1, '#000']])});
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 96), this.groundMat);
    ground.rotation.x = -PI / 2; ground.position.y = -0.07; ground.receiveShadow = true;
    this.scene.add(ground);

    // Plataforma giratoria con aro iluminado, como en una sala de exposición
    this.scene.add(this.stage);
    this.stageDeck = new THREE.MeshStandardMaterial({color: C(0x262b33), roughness: 0.34, metalness: 0.55, envMapIntensity: 0.6});
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 128), this.stageDeck);
    deck.position.y = -0.035; deck.receiveShadow = true; this.stage.add(deck);
    const ringM = (hex: number, op: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({color: hex, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: false});
    const ring = (r0: number, r1: number, m: THREE.Material, y: number): THREE.Mesh => {
      const o = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160), m);
      o.rotation.x = -PI / 2; o.position.y = y; o.renderOrder = 1; this.stage.add(o);
      return o;
    };
    ring(0.9, 0.955, ringM(0xffb21e, 1), 0.002);
    this.ringW1 = ringM(0xf2f5f8, 0.85);
    ring(0.97, 0.985, this.ringW1, 0.002);
    this.ringW2 = ringM(0xf2f5f8, 0.35);
    ring(1.06, 1.075, this.ringW2, -0.066);
    ring(1.0, 1.32, new THREE.MeshBasicMaterial({map: this.radial([[0, 'rgba(255,178,30,0)'], [0.74, 'rgba(255,178,30,0)'], [0.78, 'rgba(255,178,30,.22)'], [1, 'rgba(255,178,30,0)']]), transparent: true, depthWrite: false, toneMapped: false}), -0.067).scale.set(1, 1, 1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.002, 1.002, 0.025, 160, 1, true), ringM(0xffb21e, 0.9));
    band.position.y = -0.035; this.stage.add(band);

    // Sombra de contacto: oscurece la plataforma justo bajo la unidad
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.textura(256, 256, (g, w, h) => {
        const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        rg.addColorStop(0, 'rgba(0,0,0,0.7)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.38)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, w, h);
      }),
      transparent: true, depthWrite: false, toneMapped: false}));
    this.contact.rotation.x = -PI / 2; this.contact.position.y = 0.004; this.contact.renderOrder = 2;
    this.scene.add(this.contact);

    this.calidad = this.calidadInicial(touchDeviceActivo());
    this.aplicarCalidad();
    this.layout();

    // Eventos del puntero, de la pestaña y del contexto WebGL
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('webglcontextlost', this.onCtxLost);
    canvas.addEventListener('webglcontextrestored', this.onCtxRestored);
    document.addEventListener('visibilitychange', this.onVis);
    this.controls.addEventListener('start', this.onInicioControl);
    this.controls.addEventListener('change', this.onCambioControl);

    this.resizeObs = new ResizeObserver(() => {
      const k = canvas.clientWidth + 'x' + canvas.clientHeight;
      if (k === this.lastSize) return;
      this.lastSize = k;
      this.resize();
      if (this.cur) this.vista('v34', true);
    });
    this.resizeObs.observe(visor);
    this.resize();

    if (document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        if (this.destruida) return;
        this.layout();
        if (this.cur) this.vista('v34', true);
      });
    }

    this.rafId = requestAnimationFrame(this.bucle);
  }

  /** Modelo montado en la escena (null si todavía no se cargó ninguno). */
  get modelo(): Modelo | null { return this.cur; }

  /** Contador de renderer.render() reales (sirve para comprobar que la escena no redibuja en reposo). */
  get renders(): number { return this._renders; }

  /** Carga una unidad: destruye la anterior, construye la nueva y la coloca en vista 3/4. */
  cargar(M: ModeloDef, cfg: ConfigConstruccion, instantanea?: boolean): Modelo {
    this.seleccionar(null);
    // Se construye primero: si falla, la unidad anterior sigue intacta
    const nuevo = construir(M, cfg);
    if (this.cur){
      this.scene.remove(this.cur.root);
      this.liberarArbol(this.cur.root);
    }
    this.cur = nuevo;
    this.ultimo = {M, cfg};
    for (const k of CLAVES){ this.objetivo[k] = 0; this.actual[k] = 0; }
    this.scene.add(nuevo.root);
    this.applyState();
    if (this.curPaint !== null) this.pintar(this.curPaint);

    this.contact.scale.set(nuevo.len + 1.4, 3.6, 1);
    const s = Math.max(4.4, nuevo.len / 2 + 1.0);
    this.stage.scale.set(s, 1, s);
    const half = Math.max(nuevo.len / 2 + 2.5, s + 0.5);
    Object.assign(this.sun.shadow.camera, {left: -half, right: half, top: half, bottom: -half, near: 1, far: 50});
    this.sun.shadow.camera.updateProjectionMatrix();
    this.vista('v34', !!instantanea);
    this.invalidate();
    return nuevo;
  }

  /** Cambia la vista de cámara. En carretas no aplica "motor" ni "cabina". */
  vista(nombre: Vista, instantanea?: boolean): void {
    this.setView(nombre, !!instantanea);
  }

  /** Pinta la carrocería (cabina, caja, franjas) con el color indicado. */
  pintar(hex: number): void {
    if (!this.cur) return;
    this.curPaint = hex;
    this.invalidate();
    const col = C(hex);
    this.cur.paintMats.forEach(m => { (m as THREE.MeshStandardMaterial).color.copy(col); });
  }

  /** Activa o desactiva un interruptor. Sin valor, invierte el estado actual. */
  alternar(k: Toggle, valor?: boolean): void {
    if (k === 'rotate'){
      this.controls.autoRotate = valor !== undefined ? valor : !this.controls.autoRotate;
    } else {
      this.objetivo[k] = valor !== undefined ? (valor ? 1 : 0) : (this.objetivo[k] ? 0 : 1);
      if (k === 'tip' && this.objetivo.tip) this.objetivo.explode = 0;
    }
    this.invalidate();
  }

  /** Estado de cada interruptor (el destino, no la posición animada). */
  estadoToggles(): Record<Toggle, boolean> {
    return {
      explode: !!this.objetivo.explode,
      tilt: !!this.objetivo.tilt,
      doors: !!this.objetivo.doors,
      xray: !!this.objetivo.xray,
      tip: !!this.objetivo.tip,
      rotate: this.controls.autoRotate,
    };
  }

  /** Resalta una pieza, revela lo que tapa (cabina o rayos X) y, si se pide, enfoca la cámara en ella. */
  seleccionar(parte: Parte | null, enfocar?: boolean): void {
    if (this.seleccion) this.setHighlight(this.seleccion, false);
    this.seleccion = parte;
    if (this.focusTimer !== null){ clearTimeout(this.focusTimer); this.focusTimer = null; }
    if (!parte){ this.eventos.onSeleccion(null); return; }
    this.setHighlight(parte, true);
    if (parte.reveal === 'tilt') this.objetivo.tilt = 1;
    if (parte.reveal === 'xray'){ this.objetivo.xray = 1; this.objetivo.tilt = 0; }
    this.invalidate();
    this.eventos.onSeleccion(parte);
    if (enfocar){
      this.focusTimer = setTimeout(() => {
        this.focusTimer = null;
        if (this.seleccion === parte) this.focusPart(parte);
      }, parte.reveal ? 350 : 0);
    }
  }

  /** Apaga interruptores y giro, quita la selección y vuelve a la vista 3/4. */
  restablecer(): void {
    for (const k of CLAVES) this.objetivo[k] = 0;
    this.controls.autoRotate = false;
    this.seleccionar(null);
    this.vista('v34');
  }

  /** Modo claro u oscuro: colores del suelo, plataforma, aro y luces. */
  aplicarTema(oscuro: boolean): void {
    const d = oscuro;
    this.invalidate();
    this.groundMat.color.copy(C(d ? 0x16171a : 0xdde0e5));
    this.stageDeck.color.copy(C(d ? 0x2a2c31 : 0xf1f2f4)); this.stageDeck.metalness = d ? 0.55 : 0.15;
    this.ringW1.color.set(d ? 0xf2f5f8 : 0x8b919a);
    this.ringW2.color.set(d ? 0xf2f5f8 : 0x8b919a);
    this.hemi.groundColor.set(d ? 0x15181d : 0xd4d9df); this.hemi.intensity = d ? 0.4 : 0.6;
    this.rim.intensity = d ? 0.7 : 0.3;
  }

  /** Recalcula el encuadre entre el encabezado del visor y la barra de herramientas. */
  layout(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.invalidate();
    const cr = this.canvas.getBoundingClientRect();
    let t = this.anclas.cabecera.getBoundingClientRect().bottom - cr.top + 6;
    const b = this.anclas.barra.getBoundingClientRect().top - cr.top - 6;
    if (b - t < h * 0.5) t = Math.max(0, b - h * 0.5);
    this.camera.setViewOffset(w, h, 0, h / 2 - (t + b) / 2, w, h);
    this.freeAspect = w / Math.max(1, b - t);
    this.freeScale = Math.min(2.2, h / Math.max(1, b - t)) * 0.85;
  }

  /** Libera renderer, escena, controles y listeners. La instancia no se puede reutilizar. */
  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    cancelAnimationFrame(this.rafId);
    if (this.focusTimer !== null) clearTimeout(this.focusTimer);
    if (this.resizeObs) this.resizeObs.disconnect();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('webglcontextlost', this.onCtxLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onCtxRestored);
    document.removeEventListener('visibilitychange', this.onVis);
    this.controls.removeEventListener('start', this.onInicioControl);
    this.controls.removeEventListener('change', this.onCambioControl);
    this.controls.dispose();
    if (this.cur){
      this.scene.remove(this.cur.root);
      this.liberarArbol(this.cur.root);
      this.cur = null;
    }
    this.liberarArbol(this.scene);
    this.hlMat.dispose();
    if (this.envRT) this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /* ---------------- Internos ---------------- */

  private invalidate(): void { this.sucio = true; }

  private textura(w: number, h: number, dibujar: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    dibujar(c.getContext('2d') as CanvasRenderingContext2D, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = this.maxAniso;
    return t;
  }

  private radial(paradas: [number, string][]): THREE.CanvasTexture {
    return this.textura(512, 512, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      paradas.forEach(([o, col]) => r.addColorStop(o, col));
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }, false);
  }

  // Mapa de entorno: un estudio con softboxes, filtrado con PMREM para reflejos realistas
  private montarEntorno(): void {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({color: new THREE.Color(0.42, 0.45, 0.5), side: THREE.BackSide})));
    const fl = new THREE.Mesh(new THREE.CircleGeometry(29, 32), new THREE.MeshBasicMaterial({color: new THREE.Color(0.12, 0.13, 0.15)}));
    fl.rotation.x = -PI / 2; fl.position.y = -1.5; es.add(fl);
    const caja = (w: number, h: number, c: number, x: number, y: number, z: number, rx: number, ry: number): void => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(c, c, c * 1.04), side: THREE.DoubleSide}));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); es.add(m);
    };
    caja(24, 9, 6, 0, 18, 0, PI / 2, 0);
    caja(4, 14, 3.5, 22, 7, 0, 0, -PI / 2);
    caja(4, 14, 2.4, -22, 7, 0, 0, PI / 2);
    caja(20, 3, 2.6, 0, 6, 22, 0, PI);
    caja(20, 3, 1.8, 0, 6, -22, 0, 0);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pm.fromScene(es, 0.02);
    this.scene.environment = this.envRT.texture;
    pm.dispose();
    es.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
  }

  private calidadInicial(tactil: boolean): number {
    const gpu = this.nombreGpu();
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return QUALITY.length - 1;
    return tactil ? 1 : 0;
  }

  private nombreGpu(): string {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info') as {UNMASKED_RENDERER_WEBGL: number} | null;
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    } catch (err) {
      return '';
    }
  }

  private aplicarCalidad(): void {
    const q = QUALITY[this.calidad];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    const sh = Math.min(q.sh, this.renderer.capabilities.maxTextureSize || 2048);
    if (this.sun.shadow.mapSize.x !== sh){
      this.sun.shadow.mapSize.set(sh, sh);
      // Los typings de r128 no admiten null en shadow.map; en tiempo de ejecución sí (three lo recrea)
      const sombra = this.sun.shadow as unknown as {map: THREE.WebGLRenderTarget | null};
      if (sombra.map){ sombra.map.dispose(); sombra.map = null; }
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h) this.renderer.setSize(w, h, false);
    this.invalidate();
  }

  private resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  private aspectK(): number {
    const a = this.freeAspect;
    return (a < 0.8 ? 1.9 : Math.max(1, 1.6 / a)) * this.freeScale;
  }

  private flyTo(pos: THREE.Vector3, tgt: THREE.Vector3, dur?: number): void {
    this.fly = {p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), d: dur || 0.9, t: 0};
  }

  private viewDef(nombre: Vista, cur: Modelo): [Terna, Terna] {
    const L = cur.len, H = cur.height, o = cur.offset;
    const ex = cur.engX || 0, ey = cur.engY || 0;
    const eye = cur.eye || new V(), look = cur.look || new V();
    switch (nombre){
      case 'front': return [[L * 1.05, H * 0.6, 0.01], [L * 0.2, H * 0.42, 0]];
      case 'side': return [[0.01, H * 0.55, L * 1.3], [0, H * 0.4, 0]];
      case 'rear': return [[-L * 1.1, H * 0.9, 0.01], [0, H * 0.4, 0]];
      case 'top': return [[0.01, L * 1.6, 0.02], [0, 0, 0]];
      case 'under': return [[L * 0.5, 0.28, L * 0.6], [0, 0.75, 0]];
      case 'engine': return [[ex + o + 3.6, 2.7, 3.9], [ex + o, ey, 0]];
      case 'inside': return [[eye.x + o, eye.y, eye.z], [look.x + o, look.y, look.z]];
      default: return [[L * 1.05, H * 0.95, L * 1.18], [0, H * 0.34, 0]];
    }
  }

  private setView(nombre: Vista, instantanea: boolean): void {
    const cur = this.cur;
    if (!cur) return;
    if (cur.M.kind === 'trailer' && (nombre === 'engine' || nombre === 'inside')) return;
    if (cur.M.kind === 'car' && nombre === 'engine') return;
    const [p, t] = this.viewDef(nombre, cur);
    const tgt = new V(t[0], t[1], t[2]), pos = new V(p[0], p[1], p[2]);
    this.invalidate();
    if (nombre === 'inside'){
      this.objetivo.explode = 0; this.objetivo.tilt = 0; this.objetivo.xray = 0; this.objetivo.doors = 0;
      this.flyTo(pos, tgt, 1.2);
      return;
    }
    if (nombre === 'engine'){ this.objetivo.tilt = 1; this.objetivo.explode = 0; }
    const k = nombre === 'engine' ? Math.min(this.aspectK(), 1.4) : this.aspectK();
    const end = tgt.clone().add(pos.sub(tgt).multiplyScalar(k));
    if (instantanea){
      this.camera.position.copy(end);
      this.controls.target.copy(tgt);
      this.fly = null;
    } else {
      this.flyTo(end, tgt);
    }
  }

  private focusPart(p: Parte): void {
    const b = new THREE.Box3().setFromObject(p.group);
    const c = b.getCenter(new V()), s = b.getSize(new V()).length();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.15){ dir.y = 0.25; dir.normalize(); }
    this.flyTo(c.clone().addScaledVector(dir, Math.max(2.4, s * 1.25) * this.aspectK()), c);
  }

  private partOf(o: THREE.Object3D | null): Parte | null {
    let x: THREE.Object3D | null = o;
    while (x){
      if (x.userData && x.userData.partId) return (this.cur && this.cur.byId[x.userData.partId]) || null;
      x = x.parent;
    }
    return null;
  }

  private setHighlight(p: Parte, on: boolean): void {
    this.invalidate();
    if (on){
      const lista: THREE.Object3D[] = [];
      p.group.traverse(m => {
        if (m instanceof THREE.Mesh && !m.userData.hl && this.partOf(m) === p){
          const o = new THREE.Mesh(m.geometry, this.hlMat);
          o.userData.hl = true;
          o.raycast = () => {};
          m.add(o);
          lista.push(o);
        }
      });
      p.hl = lista;
    } else {
      (p.hl || []).forEach(o => { if (o.parent) o.parent.remove(o); });
      p.hl = [];
    }
  }

  private pick(cx: number, cy: number): Parte | null {
    if (!this.cur) return null;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    this.ptr.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    for (const h of this.ray.intersectObject(this.cur.root, true)){
      const mm = h.object as THREE.Mesh;
      const m = Array.isArray(mm.material) ? mm.material[0] : mm.material;
      if (h.object.userData.hl || (m.transparent && m.opacity < 0.5)) continue;
      const p = this.partOf(h.object);
      if (p) return p;
    }
    return null;
  }

  private applyState(): void {
    const cur = this.cur;
    if (!cur) return;
    if (cur.tilt) cur.tilt.rotation.z = -1.0 * this.actual.tilt;
    if (cur.doors){ cur.doors[1].rotation.y = 1.15 * this.actual.doors; cur.doors[-1].rotation.y = -1.15 * this.actual.doors; }
    for (const e of cur.explodables) e.obj.position.copy(e.base).addScaledVector(e.ex, this.actual.explode);
    const op = 1 - 0.87 * this.actual.xray;
    for (const m of cur.xrayMats){
      const tr = op < 0.995;
      if (m.transparent !== tr){ m.transparent = tr; m.needsUpdate = true; }
      m.opacity = op; m.depthWrite = op > 0.6;
    }
    if (cur.tip){
      const th = (cur.tipMax || 0.85) * this.actual.tip;
      cur.tip.rotation.z = th;
      const r = cur.ram;
      const rel = r.anchor.clone().sub(r.H);
      const A = new V(rel.x * Math.cos(th) - rel.y * Math.sin(th), rel.x * Math.sin(th) + rel.y * Math.cos(th), 0).add(r.H);
      const dir = A.clone().sub(r.base), l = dir.length();
      dir.normalize();
      orient(r.parts[0], r.base, r.base.clone().addScaledVector(dir, Math.min(0.75, l * 0.6)), 0.09);
      orient(r.parts[1], r.base.clone().addScaledVector(dir, 0.3), r.base.clone().addScaledVector(dir, l * 0.82), 0.07);
      orient(r.parts[2], r.base.clone().addScaledVector(dir, l * 0.5), A, 0.05);
    }
  }

  private liberarArbol(raiz: THREE.Object3D): void {
    raiz.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry && !compartidos.has(m.geometry)) m.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(m.material) ? m.material : (m.material ? [m.material] : []);
      mats.forEach(mt => {
        if (mt === this.hlMat) return;
        const sm = mt as THREE.MeshStandardMaterial;
        (['map', 'emissiveMap', 'bumpMap', 'alphaMap'] as const).forEach(k => {
          const t = sm[k];
          if (t && !compartidos.has(t)) t.dispose();
        });
        mt.dispose();
      });
    });
  }

  private actualizarCalidadAutomatica(raw: number, moviendose: boolean): void {
    // Si el equipo no llega a ~30 cuadros por segundo, baja nitidez y sombras un nivel cada vez
    if (this.encadenado && !document.hidden){
      this.lento = raw > 0.034 ? this.lento + 1 : Math.max(0, this.lento - 2);
      if (this.lento > 24 && this.calidad < QUALITY.length - 1){
        this.calidad++;
        this.lento = 0;
        this.aplicarCalidad();
      }
    }
    this.encadenado = moviendose;
  }

  private readonly bucle = (): void => {
    this.rafId = requestAnimationFrame(this.bucle);
    try {
      this.cuadro();
    } catch (err) {
      if (!this.errorReportado){
        this.errorReportado = true;
        console.error('[Escena3D] Error en el bucle de dibujo:', err);
      }
    }
  };

  private cuadro(): void {
    const raw = this.clock.getDelta(), dt = Math.min(raw, 0.05), k = this.reduce ? 1 : Math.min(1, dt * 4.5);
    let moviendose = false;
    for (const key of CLAVES){
      const d = this.objetivo[key] - this.actual[key];
      if (Math.abs(d) > 1e-4){ this.actual[key] += d * k; moviendose = true; }
      else if (d){ this.actual[key] = this.objetivo[key]; moviendose = true; }
    }
    if (moviendose) this.applyState();

    const f = this.fly;
    if (f){
      f.t = this.reduce ? 1 : Math.min(1, (performance.now() - f.start) / 1000 / f.d);
      const e = f.t < 0.5 ? 4 * Math.pow(f.t, 3) : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e);
      this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.t >= 1) this.fly = null;
      moviendose = true;
    }
    if (this.controls.update() || this.controls.autoRotate) moviendose = true;

    if (this.hoverPending && this.cur){
      const [x, y] = this.hoverPending;
      this.hoverPending = null;
      const p = this.pick(x, y);
      const nombre = p ? p.name : null;
      this.canvas.style.cursor = p ? 'pointer' : '';
      if (nombre !== null || this.hoverName !== null) this.eventos.onHover(nombre, x, y);
      this.hoverName = nombre;
    }

    if (!moviendose && !this.sucio){ this.encadenado = false; return; }
    if (this.cur && this.cur.fan) this.cur.fan.rotation.x += dt * 3;
    this.renderer.render(this.scene, this.camera);
    this._renders++;
    this.sucio = false;
    this.actualizarCalidadAutomatica(raw, moviendose);
  }
}

function touchDeviceActivo(): boolean {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}
