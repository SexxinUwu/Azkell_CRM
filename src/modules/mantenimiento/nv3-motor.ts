// Motor de la vista 3D de neumáticos (Three.js, sin React). Dos modos: "plano" (cenital, como siempre) e "isometria"
// (cámara en perspectiva que se mueve con OrbitControls). En isometría, elegir una llanta lleva la cámara a un plano
// lateral de esa llanta. La llanta seleccionada parpadea con un neón. Fuera de las animaciones, del parpadeo y de la
// inercia de la cámara no se dibuja nada: cuando todo está quieto, el bucle se detiene.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { LlantaDato } from './NeumaticosEsquema';
import type { SondaPosicion } from './ntb-arrastre';
import {
  ALTURA_EJE, ANCHO_LLANTA, CAMPO_VISION, COLOR_NEON, RADIO_LLANTA, Recursos, anilloLlanta, construirCamion, giroLetreroIsometria,
  liberarCamion, limitesCamion, marcoLlanta, poseCenital, poseIsometrica, poseLateral, type Camion3D, type Llanta3D,
} from './nv3-escena';

export type ModoVista = 'plano' | 'isometria';

/**
 * Arrastre de una llanta desde la hoja de inspección: se levanta, sigue el puntero y, al soltar, vuelve a su eje
 * o se acomoda en la posición de destino. Solo funciona en Plano (en Isometría la cámara gira con el dedo).
 */
export interface ArrastreLlanta {
  /** Levanta la llanta de esa posición; false si no se puede */
  levantar: (posicion: string) => boolean;
  /** Lleva la llanta levantada bajo el puntero (coordenadas de pantalla) */
  mover: (x: number, y: number) => void;
  /** Suelta: con destino (otra posición) se acomoda en su eje y luego llama a alTerminar; sin destino vuelve a su eje */
  soltar: (destino: string | null, alTerminar?: () => void) => void;
}

export interface OpcionesMotor {
  contenedor: HTMLElement;
  /** Toque o clic sobre una llanta: recibe su posición */
  onSelect: (posicion: string) => void;
  /** El contexto WebGL se perdió */
  onPerdida: () => void;
  /** Recibe la sonda que dice qué posición hay bajo un punto de la pantalla (para soltar llantas) */
  sondaRef?: { current: SondaPosicion | null };
  /** Recibe el control de arrastre (levantar, mover, soltar) para la hoja que lo pida */
  arrastreRef?: { current: ArrastreLlanta | null };
}

interface Pose { pos: THREE.Vector3; objetivo: THREE.Vector3; fov: number }
interface Animacion { t0: number; dur: number; desde: Pose; hasta: Pose }

const DURACION_ANIM_MS = 800;
/** Movimiento del dedo o del ratón a partir del cual un gesto ya no cuenta como toque */
const UMBRAL_CLIC_PX = 6;
/** Pulsos por segundo del neón de la llanta seleccionada */
const PULSOS_POR_SEG = 1.6;
/** Arrastre: escala y altura de la llanta levantada, y duración de la subida y de la vuelta (ms) */
const ESCALA_LEVANTADA = 1.15;
const ELEVACION_LEVANTADA = 0.5;
const DURACION_LEVANTAR_MS = 160;
const DURACION_SOLTAR_MS = 200;

const normal = (p: string) => String(p).trim().toUpperCase();

/** Curva de la animación: arranca y frena suave */
function suavizar(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export class MotorNeumaticos {
  private readonly opciones: OpcionesMotor;
  private readonly contenedor: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camara: THREE.PerspectiveCamera;
  private readonly recursos = new Recursos();
  private readonly entorno: THREE.WebGLRenderTarget;
  private readonly sol: THREE.DirectionalLight;
  private readonly suelo: THREE.Mesh;
  private readonly controles: OrbitControls;
  private readonly geometriaMarco: THREE.BufferGeometry;
  private readonly geometriaAnillo: THREE.BufferGeometry;
  /** Neón de la llanta seleccionada: marco en plano, anillo de lado en isometría */
  private readonly matNeon: THREE.MeshStandardMaterial;
  private readonly matAnillo: THREE.MeshStandardMaterial;
  private readonly marcoActivo: THREE.Mesh;
  private readonly anillo: THREE.Mesh;
  private readonly marcoSobre: THREE.Mesh;
  private readonly observador: ResizeObserver;
  private readonly rayo = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private camion: Camion3D | null = null;
  private configActual = '';
  private rango: { zMin: number; zMax: number } | null = null;
  private modo: ModoVista = 'plano';
  private activa: string | null = null;
  private sobre: string | null = null;
  private anim: Animacion | null = null;
  private parpadeo = false;
  private inicioClic: { x: number; y: number } | null = null;
  private raf = 0;
  private destruido = false;
  /** Llanta que se arrastra (levantada) y su posición de origen */
  private levantada: { llanta: Llanta3D; origen: THREE.Vector3; t0: number } | null = null;
  /** Llantas que vuelven a su eje o van al destino tras soltarlas */
  private vueltas: Array<{ llanta: Llanta3D; desde: THREE.Vector3; hasta: THREE.Vector3; escala: number; t0: number; alTerminar?: () => void }> = [];
  /** Plano del piso de la llanta levantada: por ahí se sigue el puntero */
  private readonly planoArrastre = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ALTURA_EJE);
  private readonly punto = new THREE.Vector3();
  /** Control del arrastre que se entrega a la hoja (si la pidió) */
  private readonly arrastre: ArrastreLlanta;

  /** Qué posición hay bajo un punto de la pantalla (o null) */
  readonly sonda: SondaPosicion = (x, y) => this.posicionBajo(x, y);

  /** Lanza una excepción si el equipo no puede dibujar en WebGL (el componente muestra el respaldo) */
  constructor(opciones: OpcionesMotor) {
    this.opciones = opciones;
    this.contenedor = opciones.contenedor;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    // PCF con radio: en Three r186 PCFSoftShadowMap está retirado; el radio suaviza el borde de la sombra
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.canvas = this.renderer.domElement;
    this.canvas.style.touchAction = 'pan-y';
    this.contenedor.appendChild(this.canvas);

    // Entorno: reflejos de una sala para el acero, la pintura y los rines
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const sala = new RoomEnvironment();
    this.entorno = pmrem.fromScene(sala, 0.04);
    pmrem.dispose();
    sala.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.scene.environment = this.entorno.texture;
    this.scene.environmentIntensity = 0.6;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 0.7));
    this.sol = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(2048, 2048);
    this.sol.shadow.bias = -0.0005;
    this.sol.shadow.normalBias = 0.02;
    this.sol.shadow.radius = 4;
    this.scene.add(this.sol, this.sol.target);

    // Piso: solo recibe la sombra (el fondo lo pone la tarjeta)
    this.suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.suelo.receiveShadow = true;
    this.scene.add(this.suelo);

    // Neón: pulsa con la emisión (no con el color), y no se apaga con el tone mapping
    this.matNeon = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: COLOR_NEON, emissiveIntensity: 1, roughness: 1, metalness: 0,
      transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false,
    });
    // En isometría el anillo se ve aunque lo tape la llanta de afuera (llantas dobles), y de los dos lados
    // (la cámara puede estar del lado opuesto al que mira el anillo)
    this.matAnillo = this.matNeon.clone();
    this.matAnillo.depthTest = false;
    this.matAnillo.side = THREE.DoubleSide;
    this.geometriaMarco = marcoLlanta(ANCHO_LLANTA + 0.24, 2 * RADIO_LLANTA + 0.24, 0.16, 0.05);
    this.geometriaAnillo = anilloLlanta();
    this.marcoActivo = new THREE.Mesh(this.geometriaMarco, this.matNeon);
    this.marcoActivo.renderOrder = 5;
    this.anillo = new THREE.Mesh(this.geometriaAnillo, this.matAnillo);
    this.anillo.renderOrder = 6;
    this.marcoSobre = new THREE.Mesh(this.geometriaMarco, new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.95, depthWrite: false }));
    this.marcoSobre.renderOrder = 5;
    for (const m of [this.marcoActivo, this.anillo, this.marcoSobre]) {
      m.visible = false;
      this.scene.add(m);
    }

    this.camara = new THREE.PerspectiveCamera(CAMPO_VISION, 1, 0.5, 200);

    // Los oyentes de puntero van antes que los de OrbitControls: así una llanta bajo el dedo bloquea la rotación
    this.canvas.addEventListener('pointerdown', this.alBajar);
    this.canvas.addEventListener('pointermove', this.alMover);
    this.canvas.addEventListener('click', this.alClic);
    this.canvas.addEventListener('webglcontextlost', this.alPerder);
    this.controles = new OrbitControls(this.camara, this.canvas);
    this.controles.enabled = false;
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.screenSpacePanning = true;
    this.controles.minPolarAngle = 0.12;
    this.controles.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controles.minDistance = 3;
    this.controles.maxDistance = 40;
    this.controles.addEventListener('change', this.arrancar);

    if (opciones.sondaRef) opciones.sondaRef.current = this.sonda;
    this.arrastre = {
      levantar: posicion => this.levantar(posicion),
      mover: (x, y) => this.moverLevantada(x, y),
      soltar: (destino, alTerminar) => this.soltarLevantada(destino, alTerminar),
    };
    if (opciones.arrastreRef) opciones.arrastreRef.current = this.arrastre;

    this.observador = new ResizeObserver(this.ajustar);
    this.observador.observe(this.contenedor);
    this.ajustar();
  }

  /** Reconstruye el camión (configuración, llantas, marca). La cámara solo se encuadra al cambiar la configuración. */
  setDatos(configuracion: string, llantas: LlantaDato[], marca: string | null, _esCamion = false) {
    if (this.destruido) return;
    // Si se reconstruye el camión, las llantas en movimiento dejan de existir: se acomodan antes
    this.terminarVueltas();
    this.levantada = null;
    if (this.camion) {
      liberarCamion(this.camion);
      this.camion = null;
    }
    const montadas = new Map(llantas.map(l => [normal(l.posicion), l] as const));
    const camion = construirCamion(configuracion, montadas, this.recursos, marca);
    if (camion) {
      this.camion = camion;
      this.scene.add(camion.grupo);
      this.rango = { zMin: camion.zMin, zMax: camion.zMax };
      this.orientarLetrero();
      if (this.configActual !== configuracion) {
        this.configActual = configuracion;
        this.encuadrarAhora();
      }
    }
    this.aplicarMarcas();
    this.arrancar();
  }

  /** El letrero del capó se lee de frente en isometría y queda como en el plano en la vista cenital */
  private orientarLetrero() {
    const letrero = this.camion?.letrero;
    if (letrero) letrero.rotation.y = this.modo === 'isometria' ? giroLetreroIsometria() : 0;
  }

  /** Llanta seleccionada y destino del arrastre. En isometría, si cambia la selección, la cámara va a su plano lateral. */
  setSeleccion(activa: string | null, sobre: string | null) {
    if (this.destruido) return;
    const nueva = activa ? normal(activa) : null;
    const cambio = nueva !== this.activa;
    this.activa = nueva;
    this.sobre = sobre ? normal(sobre) : null;
    this.aplicarMarcas();
    if (cambio && nueva && this.modo === 'isometria' && this.camion) {
      const llanta = this.llantaDe(nueva);
      if (llanta && this.rango) {
        const iso = poseIsometrica(this.rango.zMin, this.rango.zMax, this.camara.aspect);
        this.irA(poseLateral(llanta.grupo.position.x, (this.rango.zMin + this.rango.zMax) / 2, iso.distancia));
      }
    }
    this.arrancar();
  }

  /** Cambia entre cenital e isometría con una animación suave */
  setModo(modo: ModoVista) {
    if (this.destruido || modo === this.modo) return;
    this.modo = modo;
    this.orientarLetrero();
    this.controles.enabled = modo === 'isometria';
    this.canvas.style.touchAction = modo === 'isometria' ? 'none' : 'pan-y';
    if (this.rango) this.irA(modo === 'plano' ? this.poseDePlano() : this.poseDeIsometria());
    this.aplicarMarcas();
    this.arrancar();
  }

  dispose() {
    if (this.destruido) return;
    this.destruido = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observador.disconnect();
    this.canvas.removeEventListener('pointerdown', this.alBajar);
    this.canvas.removeEventListener('pointermove', this.alMover);
    this.canvas.removeEventListener('click', this.alClic);
    this.canvas.removeEventListener('webglcontextlost', this.alPerder);
    this.controles.removeEventListener('change', this.arrancar);
    this.controles.dispose();
    if (this.opciones.sondaRef && this.opciones.sondaRef.current === this.sonda) this.opciones.sondaRef.current = null;
    if (this.opciones.arrastreRef && this.opciones.arrastreRef.current === this.arrastre) this.opciones.arrastreRef.current = null;
    this.levantada = null;
    this.vueltas = [];
    if (this.camion) liberarCamion(this.camion);
    this.recursos.dispose();
    this.geometriaMarco.dispose();
    this.geometriaAnillo.dispose();
    this.matNeon.dispose();
    this.matAnillo.dispose();
    (this.marcoSobre.material as THREE.Material).dispose();
    this.suelo.geometry.dispose();
    (this.suelo.material as THREE.Material).dispose();
    this.sol.shadow.map?.dispose();
    this.entorno.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ── Cámara ──────────────────────────────────────────────────────────────

  private poseDePlano(): Pose {
    const r = this.rango ?? { zMin: 0, zMax: 0 };
    const p = poseCenital(r.zMin, r.zMax, this.camara.aspect);
    return { pos: p.pos, objetivo: p.objetivo, fov: CAMPO_VISION };
  }

  private poseDeIsometria(): Pose {
    const r = this.rango ?? { zMin: 0, zMax: 0 };
    const p = poseIsometrica(r.zMin, r.zMax, this.camara.aspect);
    this.controles.maxDistance = p.distancia * 1.8;
    return { pos: p.pos, objetivo: p.objetivo, fov: p.fov };
  }

  /** Pone la cámara en la pose de inmediato (sin animar) */
  private aplicarPose(p: Pose) {
    this.camara.position.copy(p.pos);
    this.controles.target.copy(p.objetivo);
    this.camara.fov = p.fov;
    this.camara.updateProjectionMatrix();
    this.camara.lookAt(p.objetivo);
  }

  /** Pose inmediata según el modo actual (cambio de configuración o de tamaño) */
  private encuadrarAhora() {
    if (!this.rango) return;
    this.anim = null;
    if (this.modo === 'plano') {
      this.aplicarPose(this.poseDePlano());
      this.ajustarSol();
    } else {
      this.aplicarPose(this.poseDeIsometria());
      this.controles.update();
    }
  }

  /** Lleva la cámara a una pose con animación suave */
  private irA(hasta: Pose) {
    this.anim = {
      t0: performance.now(),
      dur: DURACION_ANIM_MS,
      desde: { pos: this.camara.position.clone(), objetivo: this.controles.target.clone(), fov: this.camara.fov },
      hasta,
    };
    this.arrancar();
  }

  /** Luz diagonal desde arriba a la izquierda; el área de sombra cubre el camión */
  private ajustarSol() {
    if (!this.rango) return;
    const p = poseCenital(this.rango.zMin, this.rango.zMax, this.camara.aspect);
    this.sol.position.set(p.objetivo.x - 7, 16, p.objetivo.z - 7);
    this.sol.target.position.copy(p.objetivo);
    this.sol.target.updateMatrixWorld();
    const s = this.sol.shadow.camera;
    s.left = -(p.mitad + 2);
    s.right = p.mitad + 2;
    s.top = p.mitad + 2;
    s.bottom = -(p.mitad + 2);
    s.near = 1;
    s.far = 60;
    s.updateProjectionMatrix();
  }

  /** El objetivo de la isometría no sale del camión: si el usuario lo arrastra lejos, vuelve al borde */
  private limitarObjetivo() {
    if (!this.rango) return;
    const { min, max } = limitesCamion(this.rango.zMin, this.rango.zMax);
    const t = this.controles.target;
    const antes = t.clone();
    t.clamp(min, max);
    if (!t.equals(antes)) {
      this.camara.position.add(t.clone().sub(antes));
      this.controles.update();
    }
  }

  // ── Bucle de dibujo ─────────────────────────────────────────────────────

  /** Pide un cuadro; si ya hay uno pendiente, no hace nada */
  private arrancar = () => {
    if (this.raf || this.destruido) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private tick = () => {
    this.raf = 0;
    if (this.destruido) return;
    let seguir = false;
    if (this.anim) {
      const a = this.anim;
      const k = Math.min(1, (performance.now() - a.t0) / a.dur);
      const s = suavizar(k);
      this.camara.position.lerpVectors(a.desde.pos, a.hasta.pos, s);
      this.controles.target.lerpVectors(a.desde.objetivo, a.hasta.objetivo, s);
      this.camara.fov = a.desde.fov + (a.hasta.fov - a.desde.fov) * s;
      this.camara.updateProjectionMatrix();
      this.camara.lookAt(this.controles.target);
      if (k < 1) {
        seguir = true;
      } else {
        this.anim = null;
        if (this.modo === 'isometria') this.controles.update();
      }
    } else if (this.modo === 'isometria' && this.controles.enabled) {
      // Con inercia (damping) el control sigue moviéndose varios cuadros tras soltar; update() dice si hubo cambio
      if (this.controles.update()) seguir = true;
      this.limitarObjetivo();
    }
    // Arrastre: la llanta levantada crece y sube; las que vuelven a su eje o van al destino se acomodan
    if (this.levantada) {
      const l = this.levantada;
      const k = Math.min(1, (performance.now() - l.t0) / DURACION_LEVANTAR_MS);
      const e = 1 - Math.pow(1 - k, 3);
      l.llanta.grupo.scale.setScalar(1 + (ESCALA_LEVANTADA - 1) * e);
      l.llanta.grupo.position.y = ALTURA_EJE + ELEVACION_LEVANTADA * e;
      if (k < 1) seguir = true;
    }
    if (this.vueltas.length) {
      const ahora = performance.now();
      this.vueltas = this.vueltas.filter(v => {
        const k = Math.min(1, (ahora - v.t0) / DURACION_SOLTAR_MS);
        const e = suavizar(k);
        v.llanta.grupo.position.lerpVectors(v.desde, v.hasta, e);
        v.llanta.grupo.scale.setScalar(v.escala + (1 - v.escala) * e);
        if (k < 1) {
          seguir = true;
          return true;
        }
        v.llanta.grupo.scale.setScalar(1);
        v.alTerminar?.();
        return false;
      });
    }
    if (this.parpadeo) {
      this.pulsar(performance.now());
      seguir = true;
    }
    this.renderer.render(this.scene, this.camara);
    if (seguir) this.arrancar();
  };

  /** Neón de la llanta seleccionada: la emisión sube y baja */
  private pulsar(ahora: number) {
    const k = 0.5 + 0.5 * Math.sin((ahora / 1000) * Math.PI * 2 * PULSOS_POR_SEG);
    const intensidad = 0.5 + 2.2 * k;
    this.matNeon.emissiveIntensity = intensidad;
    this.matAnillo.emissiveIntensity = intensidad;
  }

  private ajustar = () => {
    if (this.destruido) return;
    const w = this.contenedor.clientWidth;
    const h = this.contenedor.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    if (this.rango && !this.anim) {
      if (this.modo === 'plano') {
        this.aplicarPose(this.poseDePlano());
        this.ajustarSol();
      } else {
        // En isometría se conserva el giro y el zoom del usuario; solo cambia el aspecto
        this.controles.update();
      }
    }
    this.arrancar();
  };

  // ── Marcas y selección ──────────────────────────────────────────────────

  private llantaDe(posicion: string | null): Llanta3D | undefined {
    return posicion && this.camion ? this.camion.llantas.get(normal(posicion)) : undefined;
  }

  private aplicarMarcas() {
    const activa = this.llantaDe(this.activa);
    const enIsometria = this.modo === 'isometria';
    this.marcoActivo.visible = !!activa && !enIsometria;
    this.anillo.visible = !!activa && enIsometria;
    this.parpadeo = !!activa;
    if (activa) {
      const g = activa.grupo.position;
      this.marcoActivo.position.set(g.x, g.y + RADIO_LLANTA + 0.03, g.z);
      const lado = g.x < -0.05 ? -1 : 1;
      this.anillo.position.set(g.x + lado * (ANCHO_LLANTA / 2 + 0.03), g.y, g.z);
    }
    const sobre = this.llantaDe(this.sobre);
    this.marcoSobre.visible = !!sobre;
    if (sobre) {
      const g = sobre.grupo.position;
      this.marcoSobre.position.set(g.x, g.y + RADIO_LLANTA + 0.05, g.z);
    }
    if (!activa) this.matNeon.emissiveIntensity = 1;
  }

  /** Qué posición hay bajo un punto de la pantalla (o null) */
  private posicionBajo(x: number, y: number): string | null {
    if (!this.camion || this.destruido) return null;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(this.ndc, this.camara);
    // La llanta levantada no cuenta: si no, tapa la posición que hay debajo del puntero
    const alzada = this.levantada?.llanta.posicion;
    const cauchos = alzada ? this.camion.cauchos.filter(c => c.userData.posicion !== alzada) : this.camion.cauchos;
    const golpe = this.rayo.intersectObjects(cauchos, false)[0];
    return golpe ? String(golpe.object.userData.posicion) : null;
  }

  // ── Arrastre de una llanta (hoja de inspección) ─────────────────────────

  /** Termina de golpe las vueltas en curso (acomoda las llantas y avisa a quien esperaba) */
  private terminarVueltas() {
    const pendientes = this.vueltas;
    this.vueltas = [];
    for (const v of pendientes) {
      v.llanta.grupo.position.copy(v.hasta);
      v.llanta.grupo.scale.setScalar(1);
      v.alTerminar?.();
    }
  }

  private levantar(posicion: string): boolean {
    if (this.destruido || this.modo !== 'plano' || !this.camion) return false;
    const llanta = this.llantaDe(posicion);
    if (!llanta) return false;
    // Si otra llanta seguía levantada o volviendo, se termina antes de levantar esta
    if (this.levantada) this.soltarLevantada(null);
    this.terminarVueltas();
    this.levantada = { llanta, origen: llanta.grupo.position.clone(), t0: performance.now() };
    this.aplicarMarcas();
    this.arrancar();
    return true;
  }

  /** La llanta levantada sigue el puntero sobre el plano del piso */
  private moverLevantada(x: number, y: number) {
    const l = this.levantada;
    if (!l || this.destruido) return;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(this.ndc, this.camara);
    if (this.rayo.ray.intersectPlane(this.planoArrastre, this.punto)) {
      l.llanta.grupo.position.x = this.punto.x;
      l.llanta.grupo.position.z = this.punto.z;
    }
    this.aplicarMarcas();
    this.arrancar();
  }

  /** Suelta la llanta: con destino se acomoda en su eje; sin destino (o igual al origen) vuelve al suyo */
  private soltarLevantada(destino: string | null, alTerminar?: () => void) {
    const l = this.levantada;
    this.levantada = null;
    if (!l || this.destruido) {
      alTerminar?.();
      return;
    }
    const otra = destino && normal(destino) !== normal(l.llanta.posicion) ? this.llantaDe(destino) : undefined;
    const eje = otra ? otra.grupo.position : l.origen;
    this.vueltas.push({
      llanta: l.llanta,
      desde: l.llanta.grupo.position.clone(),
      hasta: new THREE.Vector3(eje.x, ALTURA_EJE, eje.z),
      escala: l.llanta.grupo.scale.x,
      t0: performance.now(),
      alTerminar,
    });
    this.arrancar();
  }

  // ── Puntero ─────────────────────────────────────────────────────────────

  private alBajar = (ev: PointerEvent) => {
    this.inicioClic = { x: ev.clientX, y: ev.clientY };
  };

  /** En plano el cursor avisa que la llanta se puede tocar. En isometría las llantas no se tocan: solo cambian con las flechas */
  private alMover = (ev: PointerEvent) => {
    this.canvas.style.cursor = this.modo === 'plano' && this.posicionBajo(ev.clientX, ev.clientY) ? 'pointer' : 'default';
  };

  private alClic = (ev: MouseEvent) => {
    const inicio = this.inicioClic;
    this.inicioClic = null;
    if (this.modo === 'isometria') return;
    // Un giro de la cámara que termina sobre una llanta no cuenta como toque
    if (inicio && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > UMBRAL_CLIC_PX) return;
    const pos = this.posicionBajo(ev.clientX, ev.clientY);
    if (pos) this.opciones.onSelect(pos);
  };

  private alPerder = (ev: Event) => {
    ev.preventDefault();
    this.opciones.onPerdida();
  };
}
