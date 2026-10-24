import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIGURACIONES, type LlantaChasis, type VistaChasis } from './ChasisEsquemaVisual';
import { tonoMm, type Tono } from '../../mantenimiento/neumaticosSemaforo';

// Vista 3D del chasis (Three.js), con el mismo modelo y encuadre que el clásico (modal_inspeccion.js):
// fondo claro con rejilla, cabina con parrilla y parabrisas, tanques en camiones, llantas con rin y cubo,
// etiqueta azul con el número de cada posición y anillo de color según el remanente.
// Se carga con React.lazy desde ChasisEsquemaVisual: Three.js va en su propio chunk.
// Vistas: 2D cenital (sin giro), isométrica y lateral (con giro y zoom), y rayos X con shader Fresnel.

export interface Chasis3DProps {
  configuracion: string;
  llantas: LlantaChasis[];
  activa: string;
  vista: VistaChasis;
  onSelect: (pos: string) => void;
  /** Arrastrar una llanta sobre otra: intercambia sus datos y las marca como rotadas */
  onRotar: (origen: string, destino: string) => void;
  /** Avisa mientras se arrastra (origen) y sobre qué posición está (destino), para el banner */
  onArrastre: (origen: string | null, destino: string | null) => void;
  /** Se llama si el contexto WebGL se pierde (poca memoria o cambio de app en el celular) */
  onPerdida: () => void;
}

/** Llanta que vuelve a su eje tras soltarla fuera de otra posición */
interface Retorno { grupo: THREE.Group; desde: THREE.Vector3; hasta: THREE.Vector3; inicio: number }

// Colores y medidas tomados del clásico
const COLOR_FONDO = 0xf8fafc;
const COLOR_FONDO_XRAY = 0x1c1c1e;
const COLOR_CABINA = 0xf8fafc;
const COLOR_CHASIS = 0x334155;
const COLOR_CROMO = 0xe2e8f0;
const COLOR_VIDRIO = 0x0284c7;
const COLOR_TANQUE = 0x64748b;
const COLOR_CAUCHO = 0x222328;
const COLOR_RIN = 0xcbd5e1;
const COLOR_CUBO = 0x1e293b;
const COLOR_ETIQUETA = '#2563eb';
const COLOR_XRAY = 0x32d7ff;
const RADIO_LLANTA = 0.58;
const ANCHO_LLANTA = 0.36;
const ALTURA_EJE = 0.6;
const SEP_EJE = 1.35;
const LADO_EXTERIOR = 1.52;
const LADO_INTERIOR = 0.96;
/** Desgaste de referencia (mm): a este valor la banda se deforma al máximo */
const MM_REF = 12;

const mmDe = (v: string | undefined): number => Number(String(v ?? '').replace(',', '.')) || 0;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Color de una banda o del anillo según el remanente, con el semáforo del ERP */
const COLOR_TONO: Record<Tono, number> = { green: 0x10b981, amber: 0xf59e0b, red: 0xef4444, gray: 0xc7c7cc };
function colorDeRemanente(mm: number | null): number {
  return mm === null ? COLOR_TONO.gray : COLOR_TONO[tonoMm(mm)];
}

/** Textura de la banda: surcos de rodadura y tres franjas de color de arriba a abajo = R1 (hombro exterior), R2, R3 */
function texturaBanda(valores: (number | null)[], rotada: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#0a0a0d';
    ctx.lineWidth = 8;
    for (let y = 0; y < 256; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(90, y + 6);
      ctx.lineTo(166, y + 6);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = hex(rotada ? 0x2563eb : colorDeRemanente(valores[i] ?? null));
      ctx.fillRect(0, (i * 256) / 3, 256, 256 / 3 + 1);
    }
    ctx.globalAlpha = 1;
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** Deforma el cilindro según el desgaste: donde hay menos remanente, la banda queda más baja */
function deformarBanda(geo: THREE.CylinderGeometry, valores: (number | null)[]) {
  const pos = geo.attributes.position;
  const alto = geo.parameters.height;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / alto + 0.5; // 0 abajo, 1 arriba
    const mm = t > 2 / 3 ? valores[0] : t < 1 / 3 ? valores[2] : valores[1];
    const desgaste = mm === null ? 0 : Math.min(1, Math.max(0, (MM_REF - mm) / MM_REF));
    const escala = 1 - 0.06 * desgaste;
    pos.setX(i, pos.getX(i) * escala);
    pos.setZ(i, pos.getZ(i) * escala);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Etiqueta azul con el número de la posición, siempre visible encima de la llanta (como en el clásico) */
function crearEtiqueta(texto: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = COLOR_ETIQUETA;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = texto.length > 2 ? 'bold 22px sans-serif' : 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 32, 33);
  }
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.7, 0.7, 1);
  sprite.position.set(0, 0.75, 0);
  sprite.renderOrder = 10;
  return sprite;
}

interface Llanta3D {
  grupo: THREE.Group;
  caucho: THREE.Mesh;
  anillo: THREE.Mesh;
}

/** Llanta: caucho con la banda por franjas, rin, cubo, anillo de estado y etiqueta de posición */
function crearLlanta(pos: string, x: number, z: number, lado: number, llanta: LlantaChasis | undefined): Llanta3D {
  const valores = [mmDe(llanta?.r1), mmDe(llanta?.r2), mmDe(llanta?.r3)].map(v => (v > 0 ? v : null));
  const rotada = llanta?.rot === 'SI';
  const grupo = new THREE.Group();
  grupo.position.set(x, ALTURA_EJE, z);
  grupo.userData.posicion = pos;

  // Caucho: el hombro exterior (R1) queda hacia fuera del camión
  const geo = new THREE.CylinderGeometry(RADIO_LLANTA, RADIO_LLANTA, ANCHO_LLANTA, 28, 1, false);
  deformarBanda(geo, valores);
  geo.rotateZ(lado > 0 ? -Math.PI / 2 : Math.PI / 2);
  const caucho = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ map: texturaBanda(valores, rotada), color: 0xffffff, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: COLOR_CAUCHO, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: COLOR_CAUCHO, roughness: 0.9 }),
  ]);
  caucho.userData.posicion = pos;
  grupo.add(caucho);

  const rin = new THREE.CylinderGeometry(0.36, 0.36, 0.37, 16).rotateZ(Math.PI / 2);
  grupo.add(new THREE.Mesh(rin, new THREE.MeshStandardMaterial({ color: COLOR_RIN, metalness: 0.85, roughness: 0.25 })));
  const cubo = new THREE.CylinderGeometry(0.14, 0.14, 0.39, 12).rotateZ(Math.PI / 2);
  grupo.add(new THREE.Mesh(cubo, new THREE.MeshStandardMaterial({ color: COLOR_CUBO, metalness: 0.7 })));

  // Anillo de estado: rojo, ámbar o verde según el remanente; azul si la llanta está rotada
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 8, 18).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: rotada ? 0x2563eb : colorDeRemanente(valores.find(v => v !== null) ?? null) }));
  anillo.position.x = lado * 0.19;
  grupo.add(anillo);

  grupo.add(crearEtiqueta(pos));
  return { grupo, caucho, anillo };
}

/** Piezas que cambian en rayos X y los parámetros del camión */
interface Camion {
  grupo: THREE.Group;
  ruedas: Llanta3D[];
  carroceria: THREE.Mesh[];
  chasis: THREE.Mesh[];
  tanques: THREE.Mesh[];
  zMin: number;
  zMax: number;
}

/** Construye el camión con la misma geometría relativa del clásico (cabina, bastidor, ejes, tanques o lanza) */
function construirCamion(configuracion: string, llantas: LlantaChasis[]): Camion {
  const grupo = new THREE.Group();
  const ruedas: Llanta3D[] = [];
  const carroceria: THREE.Mesh[] = [];
  const chasis: THREE.Mesh[] = [];
  const tanques: THREE.Mesh[] = [];
  const mapa = new Map(llantas.map(l => [l.posicion, l]));
  const config = CONFIGURACIONES[configuracion];
  if (!config) return { grupo, ruedas, carroceria, chasis, tanques, zMin: -1, zMax: 1 };

  const material = (color: number, rugosidad = 0.6, metalizado = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rugosidad, metalness: metalizado });
  const chasisMat = material(COLOR_CHASIS, 0.4, 0.6);
  const cromoMat = material(COLOR_CROMO, 0.2, 0.9);
  const cabinaMat = material(COLOR_CABINA, 0.3, 0.2);
  const vidrioMat = new THREE.MeshStandardMaterial({ color: COLOR_VIDRIO, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.65 });
  const ubicar = (malla: THREE.Mesh, x: number, y: number, z: number, rotX = 0, rotZ = 0) => {
    malla.position.set(x, y, z);
    malla.rotation.set(rotX, 0, rotZ);
    grupo.add(malla);
    return malla;
  };

  // Ejes: el primero es el delantero; los demás van hacia atrás
  const zEjes = config.ejes.map((_, i) => i * SEP_EJE);
  const delantero = zEjes[0] ?? 0;
  const trasero = zEjes[zEjes.length - 1] ?? 0;
  const zRepuestos = trasero + 0.6;
  const esRemolque = !config.cabina;

  // Límites como en el clásico: la cabina o la lanza definen el frente, los repuestos el fondo
  const zMin = Math.min(delantero - (esRemolque ? 2.0 : 2.8));
  const zMax = Math.max(trasero, config.repuestos.length ? zRepuestos : trasero);
  const largo = Math.max(9, zMax - zMin + 2);
  const zCentro = (zMin + zMax) / 2;

  // Largueros del bastidor
  for (const lado of [-0.55, 0.55]) {
    chasis.push(ubicar(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, largo), chasisMat), lado, 0.85, zCentro));
  }
  // Ejes
  zEjes.forEach(z => {
    chasis.push(ubicar(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.1, 10).rotateZ(Math.PI / 2), chasisMat), 0, ALTURA_EJE, z));
  });

  if (config.cabina) {
    // Tanques de combustible entre la cabina y los ejes traseros
    for (const lado of [-1.05, 1.05]) {
      tanques.push(ubicar(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.6, 14).rotateX(Math.PI / 2), material(COLOR_TANQUE, 0.3, 0.8)), lado, 0.75, delantero + 2.0));
    }
    // Cabina, capó, parrilla, parabrisas y defensa, con las posiciones del clásico
    carroceria.push(ubicar(new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.4, 2.6), cabinaMat), 0, 1.9, delantero - 0.4));
    carroceria.push(ubicar(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.5), cabinaMat), 0, 1.35, delantero - 1.9));
    ubicar(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.1), cromoMat), 0, 1.25, delantero - 2.66);
    ubicar(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.1), vidrioMat), 0, 2.35, delantero - 1.7, -0.2);
    ubicar(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.3), cromoMat), 0, 0.6, delantero - 2.65);
  } else {
    // Carreta: lanza triangular y pivote (kingpin) al frente
    for (const lado of [-0.4, 0.4]) {
      chasis.push(ubicar(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10), chasisMat), lado, 0.6, zMin + 0.6, 0, lado > 0 ? -Math.PI / 4 : Math.PI / 4));
    }
    ubicar(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), cromoMat), 0, 0.6, zMin);
  }

  // Ruedas: un lado con dos llantas es dual (exterior e interior); las sencillas van en el exterior
  config.ejes.forEach((eje, i) => {
    const z = zEjes[i];
    const lados: [number, string[]][] = [[-1, eje.izquierda], [1, eje.derecha]];
    for (const [lado, posiciones] of lados) {
      posiciones.forEach((pos, k) => {
        const x = lado * (posiciones.length > 1 && k > 0 ? LADO_INTERIOR : LADO_EXTERIOR);
        const llanta = crearLlanta(pos, x, z, lado, mapa.get(pos));
        ruedas.push(llanta);
        grupo.add(llanta.grupo);
      });
    }
  });
  // Repuestos montados atrás del bastidor
  config.repuestos.forEach((pos, i) => {
    const x = config.repuestos.length === 1 ? 0 : -0.8 + i * 1.6;
    const llanta = crearLlanta(pos, x, zRepuestos, 1, mapa.get(pos));
    ruedas.push(llanta);
    grupo.add(llanta.grupo);
  });

  return { grupo, ruedas, carroceria, chasis, tanques, zMin, zMax };
}

/** Shader Fresnel: el centro de la carrocería se ve transparente y los bordes brillan en cian */
function crearMaterialXray(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(COLOR_XRAY) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
        gl_FragColor = vec4(uColor * (0.25 + fresnel), fresnel * 0.9 + 0.04);
      }`,
  });
}

/** Encuadre de cada vista, igual que el clásico (campo de visión 40°, alto según la longitud del camión) */
interface Pose { pos: THREE.Vector3; objetivo: THREE.Vector3; arriba: THREE.Vector3; orbitar: boolean }
function poseDeVista(vista: VistaChasis, zMin: number, zMax: number): Pose {
  const zc = (zMin + zMax) / 2;
  // Un poco más cerca que el clásico (1.95): el visor aquí es más ancho y el camión se veía chico
  const alto = Math.max(12, (zMax - zMin + 2) * 1.35);
  const objetivo = new THREE.Vector3(0, 0, zc);
  if (vista === '2d') return { pos: new THREE.Vector3(0, alto, zc), objetivo, arriba: new THREE.Vector3(0, 0, -1), orbitar: false };
  if (vista === 'lat') return { pos: new THREE.Vector3(14, 1.5, zc), objetivo, arriba: new THREE.Vector3(0, 1, 0), orbitar: true };
  return { pos: new THREE.Vector3(10, alto * 0.7, zc + 10), objetivo, arriba: new THREE.Vector3(0, 1, 0), orbitar: true };
}

const FOV = 40;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Chasis3D({ configuracion, llantas, activa, vista, onSelect, onRotar, onArrastre, onPerdida }: Chasis3DProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const esc = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camara: THREE.PerspectiveCamera; controles: OrbitControls;
    camion: Camion | null; xray: THREE.ShaderMaterial; configActual: string; xrayActivo: boolean;
    tween: { inicio: number; desde: THREE.Vector3; hasta: THREE.Vector3; objDesde: THREE.Vector3; objHasta: THREE.Vector3 } | null;
    retornos: Retorno[]; resaltado: THREE.Mesh;
    raf: number;
  } | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPerdidaRef = useRef(onPerdida);
  const onRotarRef = useRef(onRotar);
  const onArrastreRef = useRef(onArrastre);
  onSelectRef.current = onSelect;
  onPerdidaRef.current = onPerdida;
  onRotarRef.current = onRotar;
  onArrastreRef.current = onArrastre;

  // Firma de lo que cambia la geometría: si no cambia (p. ej. solo el foco), no se reconstruye
  const firma = configuracion + '|' + llantas.map(l => `${l.posicion}:${l.r1}:${l.r2}:${l.r3}:${l.rot}`).join(',');

  function pedirRender() {
    const e = esc.current;
    if (!e || e.raf) return;
    e.raf = requestAnimationFrame(cuadro);
  }

  function cuadro(ahora: number) {
    const e = esc.current;
    if (!e) return;
    e.raf = 0;
    if (e.tween) {
      const t = Math.min(1, (ahora - e.tween.inicio) / 900);
      const k = easeInOut(t);
      e.camara.position.lerpVectors(e.tween.desde, e.tween.hasta, k);
      e.controles.target.lerpVectors(e.tween.objDesde, e.tween.objHasta, k);
      if (t >= 1) e.tween = null;
      else pedirRender();
    }
    // Llantas soltadas fuera de otra posición: vuelven a su eje en 140 ms
    e.retornos = e.retornos.filter(r => {
      const t = Math.min(1, (ahora - r.inicio) / 140);
      r.grupo.position.lerpVectors(r.desde, r.hasta, t);
      return t < 1;
    });
    if (e.retornos.length) pedirRender();
    e.controles.update();
    e.renderer.render(e.scene, e.camara);
  }

  // Montaje: renderer, escena, luces, rejilla de referencia y controles de cámara
  useEffect(() => {
    const cont = contenedor.current;
    if (!cont) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      onPerdidaRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const canvas = renderer.domElement;
    // touch-action: none para que el dedo arrastre la llanta y no desplace la página en medio del gesto
    canvas.style.touchAction = 'none';
    cont.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_FONDO);
    const camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const sol = new THREE.DirectionalLight(0xffffff, 1.2);
    sol.position.set(8, 18, 10);
    scene.add(sol);
    const relleno = new THREE.DirectionalLight(0x38bdf8, 0.4);
    relleno.position.set(-8, 10, -10);
    scene.add(relleno);
    scene.add(new THREE.GridHelper(50, 50, 0x94a3b8, 0xe2e8f0));

    // Giro y zoom en isométrica y lateral; la vista 2D queda fija mirando hacia abajo
    const controles = new OrbitControls(camara, canvas);
    controles.enableDamping = false;
    controles.enablePan = false;
    controles.addEventListener('change', pedirRender);

    // Aro verde bajo la llanta destino mientras se arrastra (como el clásico)
    const resaltado = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.08, 8, 24).rotateY(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.95 }),
    );
    resaltado.visible = false;
    scene.add(resaltado);

    esc.current = {
      renderer, scene, camara, controles, camion: null, xray: crearMaterialXray(),
      configActual: '', xrayActivo: false, tween: null, retornos: [], resaltado, raf: 0,
    };

    // Pérdida de contexto WebGL (Android libera la GPU al abrir la cámara o bloquear la pantalla)
    const alPerder = (ev: Event) => { ev.preventDefault(); onPerdidaRef.current(); };
    canvas.addEventListener('webglcontextlost', alPerder);

    // Tamaño según el contenedor
    const ajustar = () => {
      const w = cont.clientWidth, h = cont.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      pedirRender();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(cont);
    ajustar();

    // Arrastre: tocar una llanta y moverla la levanta (x1.15) y la sigue sobre el plano del camión;
    // soltarla sobre otra la intercambia; soltarla en el aire la devuelve a su eje. Un toque sin mover la selecciona.
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ALTURA_EJE);
    const rayo = new THREE.Raycaster();
    const punto = new THREE.Vector3();
    let arrastre: { pos: string; grupo: THREE.Group; origen: THREE.Vector3; inicioX: number; inicioY: number; activo: boolean; destino: string | null } | null = null;

    const apuntar = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      rayo.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camara);
    };
    // Llanta bajo el puntero, sin contar la que se arrastra
    const llantaBajo = (ev: PointerEvent, excluir?: string): { pos: string; grupo: THREE.Group } | null => {
      const e = esc.current;
      if (!e?.camion) return null;
      apuntar(ev);
      for (const hit of rayo.intersectObjects(e.camion.ruedas.map(r => r.grupo), true)) {
        let nodo: THREE.Object3D | null = hit.object;
        while (nodo && !nodo.userData.posicion) nodo = nodo.parent;
        if (nodo && String(nodo.userData.posicion) !== excluir) return { pos: String(nodo.userData.posicion), grupo: nodo as THREE.Group };
      }
      return null;
    };

    const bajar = (ev: PointerEvent) => {
      const llanta = llantaBajo(ev);
      if (!llanta) return;
      // Evita que la órbita de la cámara tome el gesto cuando se toca una llanta
      ev.stopImmediatePropagation();
      canvas.setPointerCapture(ev.pointerId);
      arrastre = { pos: llanta.pos, grupo: llanta.grupo, origen: llanta.grupo.position.clone(), inicioX: ev.clientX, inicioY: ev.clientY, activo: false, destino: null };
    };
    const mover = (ev: PointerEvent) => {
      const e = esc.current;
      if (!e || !arrastre) return;
      if (!arrastre.activo) {
        if (Math.hypot(ev.clientX - arrastre.inicioX, ev.clientY - arrastre.inicioY) <= 6) return;
        arrastre.activo = true;
        arrastre.grupo.scale.setScalar(1.15);
        onArrastreRef.current(arrastre.pos, null);
      }
      apuntar(ev);
      if (rayo.ray.intersectPlane(plano, punto)) arrastre.grupo.position.set(punto.x, ALTURA_EJE + 0.5, punto.z);
      const otra = llantaBajo(ev, arrastre.pos);
      const destino = otra?.pos ?? null;
      if (destino !== arrastre.destino) {
        arrastre.destino = destino;
        e.resaltado.visible = !!otra;
        if (otra) e.resaltado.position.copy(otra.grupo.position);
        onArrastreRef.current(arrastre.pos, destino);
      }
      pedirRender();
    };
    const soltar = (ev: PointerEvent) => {
      const e = esc.current;
      if (!arrastre) return;
      const a = arrastre;
      arrastre = null;
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      if (e) e.resaltado.visible = false;
      if (!a.activo) {
        onSelectRef.current(a.pos);
        return;
      }
      a.grupo.scale.setScalar(1);
      onArrastreRef.current(null, null);
      if (a.destino) {
        onRotarRef.current(a.pos, a.destino);
      } else if (e) {
        e.retornos.push({ grupo: a.grupo, desde: a.grupo.position.clone(), hasta: a.origen, inicio: performance.now() });
      }
      pedirRender();
    };
    canvas.addEventListener('pointerdown', bajar, { capture: true });
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);

    return () => {
      canvas.removeEventListener('webglcontextlost', alPerder);
      canvas.removeEventListener('pointerdown', bajar, { capture: true });
      canvas.removeEventListener('pointermove', mover);
      canvas.removeEventListener('pointerup', soltar);
      canvas.removeEventListener('pointercancel', soltar);
      observador.disconnect();
      const e = esc.current;
      if (e?.raf) cancelAnimationFrame(e.raf);
      if (e) {
        e.controles.dispose();
        desechar(e.camion, e.xray);
        e.xray.dispose();
        e.resaltado.geometry.dispose();
        (e.resaltado.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      esc.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconstruye el camión cuando cambian la configuración o las medidas
  useEffect(() => {
    const e = esc.current;
    if (!e) return;
    if (e.camion) desechar(e.camion, e.xray);
    const camion = construirCamion(configuracion, llantas);
    e.camion = camion;
    e.scene.add(camion.grupo);
    // La cámara se coloca solo al cambiar de configuración; cambiar una medida no la mueve
    if (e.configActual !== configuracion) {
      e.configActual = configuracion;
      const pose = poseDeVista(vista, camion.zMin, camion.zMax);
      e.camara.position.copy(pose.pos);
      e.camara.up.copy(pose.arriba);
      e.camara.fov = FOV;
      e.camara.updateProjectionMatrix();
      e.controles.target.copy(pose.objetivo);
      e.controles.enableRotate = pose.orbitar;
      e.controles.enableZoom = pose.orbitar;
      e.camara.lookAt(pose.objetivo);
      e.tween = null;
    }
    aplicarXray(vista === 'xray');
    resaltar(activa);
    pedirRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // Cambio de vista: transición de cámara y rayos X
  useEffect(() => {
    const e = esc.current;
    if (!e) return;
    aplicarXray(vista === 'xray');
    if (e.camion) {
      const pose = poseDeVista(vista, e.camion.zMin, e.camion.zMax);
      e.camara.up.copy(pose.arriba);
      e.controles.enableRotate = pose.orbitar;
      e.controles.enableZoom = pose.orbitar;
      e.tween = {
        inicio: performance.now(), desde: e.camara.position.clone(), hasta: pose.pos,
        objDesde: e.controles.target.clone(), objHasta: pose.objetivo,
      };
      pedirRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // La llanta activa se resalta
  useEffect(() => { resaltar(activa); pedirRender(); }, [activa]);

  function aplicarXray(on: boolean) {
    const e = esc.current;
    if (!e || !e.camion) return;
    if (e.xrayActivo !== on) {
      e.xrayActivo = on;
      e.scene.background = new THREE.Color(on ? COLOR_FONDO_XRAY : COLOR_FONDO);
    }
    for (const malla of e.camion.carroceria) {
      malla.material = on ? e.xray : (malla.userData.normal as THREE.Material);
    }
    for (const malla of e.camion.chasis) {
      const m = malla.material as THREE.MeshStandardMaterial;
      m.transparent = on;
      m.opacity = on ? 0.2 : 1;
      m.needsUpdate = true;
    }
    for (const tanque of e.camion.tanques) tanque.visible = !on;
    for (const r of e.camion.ruedas) {
      for (const m of r.caucho.material as THREE.Material[]) {
        m.transparent = on;
        m.opacity = on ? 0.5 : 1;
        m.needsUpdate = true;
      }
    }
    pedirRender();
  }

  function resaltar(pos: string) {
    const e = esc.current;
    if (!e || !e.camion) return;
    for (const r of e.camion.ruedas) {
      const activaRueda = r.grupo.userData.posicion === pos;
      r.grupo.scale.setScalar(activaRueda ? 1.08 : 1);
      (r.caucho.material as THREE.MeshStandardMaterial[])[0].emissive.setHex(activaRueda ? 0x1d1d1f : 0x000000);
    }
  }

  return <div ref={contenedor} className="insp-chasis__3d" role="img" aria-label={`Vista 3D del camión ${configuracion}`} />;
}

/** Libera la memoria de la GPU de un camión (geometrías, materiales y texturas); el shader de rayos X se libera aparte */
function desechar(camion: Camion | null, xray: THREE.Material | null) {
  if (!camion) return;
  camion.grupo.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const mats = new Set<THREE.Material>(Array.isArray(obj.material) ? obj.material : [obj.material]);
    if (obj.userData.normal) mats.add(obj.userData.normal as THREE.Material);
    for (const m of mats) {
      if (m === xray) continue;
      if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
      m.dispose();
    }
    if (obj instanceof THREE.Sprite) obj.material.map?.dispose();
  });
  camion.grupo.removeFromParent();
}
