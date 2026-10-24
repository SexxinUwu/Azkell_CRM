import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CONFIGURACIONES, type LlantaChasis, type VistaChasis } from './ChasisEsquemaVisual';
import { tonoMm, type Tono } from '../../mantenimiento/neumaticosSemaforo';

// Vista 3D del chasis (Three.js). Se carga con React.lazy desde ChasisEsquemaVisual, así que
// Three.js va en su propio chunk y no pesa en el arranque de /app.
// Fase 1: chasis procedural según la configuración (ejes, duales, cabina, repuestos).
// Fase 2: la cámara se desplaza con una transición entre 2D cenital, isométrica y lateral.
// Fase 3: rayos X con shader Fresnel en la carrocería; banda de rodadura con R1 (hombro exterior), R2 (centro) y R3 (interior).
// Fase 4: tocar una llanta la selecciona en el formulario.

export interface Chasis3DProps {
  configuracion: string;
  llantas: LlantaChasis[];
  activa: string;
  vista: VistaChasis;
  onSelect: (pos: string) => void;
  /** Se llama si el contexto WebGL se pierde (poca memoria o cambio de app en el celular) */
  onPerdida: () => void;
}

const COLOR_TONO: Record<Tono, number> = { green: 0x34c759, amber: 0xff9500, red: 0xff3b30, gray: 0xc7c7cc };
const COLOR_ROTADA = 0x007aff;
const COLOR_CAUCHO = 0x2c2c2e;
const COLOR_XRAY = 0x32d7ff;
const RADIO_LLANTA = 0.5;
const ANCHO_LLANTA = 0.3;
const SEP_EJE = 1.35;
/** Remanente de referencia: a este desgaste (mm) la banda se deforma al máximo */
const MM_REF = 12;
const LADO_FUERA = 1.45, LADO_DENTRO = 1.0, LADO_SENCILLA = 1.2;

const mmDe = (v: string | undefined): number => Number(String(v ?? '').replace(',', '.')) || 0;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Color de una banda según su remanente; sin medir = gris */
function colorBanda(mm: number | null): number {
  return mm === null ? COLOR_TONO.gray : COLOR_TONO[tonoMm(mm)];
}

/** Textura de la banda de rodadura: tres franjas de arriba a abajo = R1, R2, R3 (R1 es el hombro exterior) */
function texturaBandas(valores: (number | null)[], rotada: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = hex(rotada ? COLOR_ROTADA : colorBanda(valores[i] ?? null));
      ctx.fillRect(0, (i * 256) / 3, 4, 256 / 3 + 1);
    }
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

/** Llanta: cilindro con la banda por franjas; el eje queda a lo ancho del camión (X) */
function crearLlanta(pos: string, x: number, y: number, z: number, lado: number, llanta: LlantaChasis | undefined): THREE.Mesh {
  const valores = [mmDe(llanta?.r1), mmDe(llanta?.r2), mmDe(llanta?.r3)].map(v => (v > 0 ? v : null));
  const rotada = llanta?.rot === 'SI';
  const geo = new THREE.CylinderGeometry(RADIO_LLANTA, RADIO_LLANTA, ANCHO_LLANTA, 40, 1, false);
  deformarBanda(geo, valores);
  // Gira para que el hombro exterior (R1, +Y local) quede hacia fuera del camión
  geo.rotateZ(lado > 0 ? -Math.PI / 2 : Math.PI / 2);
  const materiales = [
    new THREE.MeshStandardMaterial({ map: texturaBandas(valores, rotada), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: COLOR_CAUCHO, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: COLOR_CAUCHO, roughness: 0.9 }),
  ];
  const malla = new THREE.Mesh(geo, materiales);
  malla.position.set(x, y, z);
  malla.castShadow = true;
  malla.userData.posicion = pos;
  return malla;
}

/** Construye el camión de la configuración: cabina opcional, bastidor y ejes con sus llantas */
function construirCamion(configuracion: string, llantas: LlantaChasis[]) {
  const grupo = new THREE.Group();
  const ruedas: THREE.Mesh[] = [];
  const mapa = new Map(llantas.map(l => [l.posicion, l]));
  const config = CONFIGURACIONES[configuracion];
  const material = (color: number, rugosidad = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rugosidad, metalness: 0.2 });
  let cabina: THREE.Mesh | null = null;

  if (!config) return { grupo, ruedas, cabina, zMin: -1, zMax: 1 };

  const zEjes = config.ejes.map((_, i) => i * SEP_EJE);
  const ultimoEje = zEjes.length ? zEjes[zEjes.length - 1] : 0;
  const zMin = config.cabina ? -3.8 : -1.0;
  const zMax = ultimoEje + 1.0;

  // Cabina (tracto o camión): caja redondeada al frente
  if (config.cabina) {
    cabina = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.5, 2.4), material(0xf2f2f7, 0.45));
    cabina.position.set(0, 1.35, -2.5);
    cabina.castShadow = true;
    // Material normal guardado: en rayos X la carrocería cambia al shader y vuelve a este
    cabina.userData.normal = cabina.material;
    grupo.add(cabina);
  } else {
    // Carreta: lengüeta del pivote delante
    const lengueta = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), material(COLOR_CAUCHO));
    lengueta.position.set(0, 0.85, -1.4);
    grupo.add(lengueta);
  }

  // Largueros del bastidor y travesaños
  const largo = zMax - Math.max(zMin, -1.2);
  const zCentroChasis = (zMax + Math.max(zMin, -1.2)) / 2;
  for (const lado of [-1, 1]) {
    const larguero = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, largo), material(0x3a3a3c, 0.5));
    larguero.position.set(lado * 0.42, 0.82, zCentroChasis);
    larguero.castShadow = true;
    grupo.add(larguero);
  }
  zEjes.forEach(z => {
    const travesano = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.12), material(0x3a3a3c, 0.5));
    travesano.position.set(0, 0.8, z);
    grupo.add(travesano);
    const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 16), material(0x636366, 0.4));
    eje.rotation.z = Math.PI / 2;
    eje.position.set(0, RADIO_LLANTA, z);
    grupo.add(eje);
  });

  // Ruedas: cada lado del eje; un lado con dos llantas es dual (exterior y interior)
  config.ejes.forEach((eje, i) => {
    const z = zEjes[i];
    const lados: [number, string[]][] = [[-1, eje.izquierda], [1, eje.derecha]];
    for (const [lado, posiciones] of lados) {
      posiciones.forEach((pos, k) => {
        const x = posiciones.length > 1 ? lado * (k === 0 ? LADO_FUERA : LADO_DENTRO) : lado * LADO_SENCILLA;
        const malla = crearLlanta(pos, x, RADIO_LLANTA, z, lado, mapa.get(pos));
        ruedas.push(malla);
        grupo.add(malla);
      });
    }
  });

  // Repuestos montados atrás del bastidor
  config.repuestos.forEach((pos, i) => {
    const x = config.repuestos.length === 1 ? 0 : -0.8 + i * 1.6;
    const malla = crearLlanta(pos, x, RADIO_LLANTA, zMax + 0.6, 1, mapa.get(pos));
    ruedas.push(malla);
    grupo.add(malla);
  });

  return { grupo, ruedas, cabina, zMin, zMax };
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

/** Cámaras de cada vista: posición, punto al que miran y campo de visión (en unidades relativas a la longitud del camión) */
function poseDeVista(vista: VistaChasis, zMin: number, zMax: number): { pos: THREE.Vector3; objetivo: THREE.Vector3; fov: number } {
  const zc = (zMin + zMax) / 2;
  const span = Math.max(4, zMax - zMin);
  const objetivo = new THREE.Vector3(0, 0.6, zc);
  if (vista === 'lat') return { pos: new THREE.Vector3(span * 3.4, 0.7, zc), objetivo, fov: 28 };
  if (vista === '2d') return { pos: new THREE.Vector3(0, span * 3.2, zc + 0.001), objetivo: new THREE.Vector3(0, 0, zc), fov: 22 };
  // Isométrica y rayos X: perspectiva oblicua con luz de estudio
  return { pos: new THREE.Vector3(span * 1.6, span * 1.4, zc + span * 1.8), objetivo, fov: 32 };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Chasis3D({ configuracion, llantas, activa, vista, onSelect, onPerdida }: Chasis3DProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const esc = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camara: THREE.PerspectiveCamera;
    camion: ReturnType<typeof construirCamion> | null; xray: THREE.ShaderMaterial;
    suelo: THREE.Mesh; luz: THREE.DirectionalLight;
    tween: { inicio: number; desde: THREE.Vector3; hasta: THREE.Vector3; objDesde: THREE.Vector3; objHasta: THREE.Vector3; fovDesde: number; fovHasta: number } | null;
    objetivo: THREE.Vector3; raf: number; configActual: string;
  } | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPerdidaRef = useRef(onPerdida);
  onSelectRef.current = onSelect;
  onPerdidaRef.current = onPerdida;

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
      e.objetivo.lerpVectors(e.tween.objDesde, e.tween.objHasta, k);
      e.camara.fov = e.tween.fovDesde + (e.tween.fovHasta - e.tween.fovDesde) * k;
      e.camara.updateProjectionMatrix();
      e.camara.lookAt(e.objetivo);
      if (t >= 1) e.tween = null;
      else pedirRender();
    }
    e.renderer.render(e.scene, e.camara);
  }

  // Montaje: renderer, escena, luces y suelo con sombra de contacto
  useEffect(() => {
    const cont = contenedor.current;
    if (!cont) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      onPerdidaRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    cont.appendChild(canvas);

    const scene = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8e8e93, 1.1));
    const luz = new THREE.DirectionalLight(0xffffff, 1.4);
    luz.position.set(5, 9, 4);
    luz.castShadow = true;
    luz.shadow.mapSize.set(1024, 1024);
    scene.add(luz);
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.18 }));
    suelo.receiveShadow = true;
    scene.add(suelo);

    esc.current = {
      renderer, scene, camara, camion: null, xray: crearMaterialXray(), suelo, luz,
      tween: null, objetivo: new THREE.Vector3(0, 0.6, 0), raf: 0, configActual: '',
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

    // Selección: un toque sin arrastrar sobre una llanta la selecciona
    let inicio: { x: number; y: number } | null = null;
    const bajar = (ev: PointerEvent) => { inicio = { x: ev.clientX, y: ev.clientY }; };
    const subir = (ev: PointerEvent) => {
      const e = esc.current;
      if (!e || !e.camion || !inicio) return;
      if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 8) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      const rayo = new THREE.Raycaster();
      rayo.setFromCamera(ndc, e.camara);
      const hit = rayo.intersectObjects(e.camion.ruedas, false)[0];
      if (hit) onSelectRef.current(String(hit.object.userData.posicion));
    };
    canvas.addEventListener('pointerdown', bajar);
    canvas.addEventListener('pointerup', subir);

    return () => {
      canvas.removeEventListener('webglcontextlost', alPerder);
      canvas.removeEventListener('pointerdown', bajar);
      canvas.removeEventListener('pointerup', subir);
      observador.disconnect();
      const e = esc.current;
      if (e?.raf) cancelAnimationFrame(e.raf);
      if (e) desechar(e.camion, e.xray);
      e?.xray.dispose();
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
      e.camara.fov = pose.fov;
      e.camara.updateProjectionMatrix();
      e.objetivo.copy(pose.objetivo);
      e.camara.lookAt(e.objetivo);
      e.tween = null;
      e.luz.shadow.camera.left = -camion.zMax - 8; e.luz.shadow.camera.right = 8;
      e.luz.shadow.camera.top = 8; e.luz.shadow.camera.bottom = -8;
      e.luz.shadow.camera.updateProjectionMatrix();
    }
    aplicarXray(vista === 'xray');
    resaltar(activa);
    pedirRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // Fase 2: transición de cámara entre vistas; fase 3: rayos X
  useEffect(() => {
    const e = esc.current;
    if (!e) return;
    aplicarXray(vista === 'xray');
    if (e.camion) {
      const pose = poseDeVista(vista, e.camion.zMin, e.camion.zMax);
      e.tween = {
        inicio: performance.now(), desde: e.camara.position.clone(), hasta: pose.pos,
        objDesde: e.objetivo.clone(), objHasta: pose.objetivo, fovDesde: e.camara.fov, fovHasta: pose.fov,
      };
      pedirRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // Fase 4: la llanta activa se resalta
  useEffect(() => { resaltar(activa); pedirRender(); }, [activa]);

  function aplicarXray(on: boolean) {
    const e = esc.current;
    if (!e || !e.camion) return;
    if (e.camion.cabina) e.camion.cabina.material = on ? e.xray : (e.camion.cabina.userData.normal as THREE.Material);
    for (const r of e.camion.ruedas) {
      for (const m of r.material as THREE.Material[]) {
        m.transparent = on;
        m.opacity = on ? 0.5 : 1;
        m.needsUpdate = true;
      }
    }
  }

  function resaltar(pos: string) {
    const e = esc.current;
    if (!e || !e.camion) return;
    for (const r of e.camion.ruedas) {
      const activaRueda = r.userData.posicion === pos;
      r.scale.setScalar(activaRueda ? 1.08 : 1);
      (r.material as THREE.MeshStandardMaterial[])[0].emissive.setHex(activaRueda ? 0x1d1d1f : 0x000000);
    }
  }

  return <div ref={contenedor} className="insp-chasis__3d" role="img" aria-label={`Vista 3D del camión ${configuracion}`} />;
}

/** Libera la memoria de la GPU de un camión (geometrías, materiales y texturas); el shader de rayos X se libera aparte */
function desechar(camion: ReturnType<typeof construirCamion> | null, xray: THREE.Material | null) {
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
  });
  camion.grupo.removeFromParent();
}
