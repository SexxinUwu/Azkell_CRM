// Vista cenital 3D de la unidad para neumáticos (tablero de movimientos y pestaña Neumáticos de la placa).
// Un solo renderer por componente; dibuja solo cuando cambian datos, marcas o tamaño (sin bucle continuo).
// Entorno RoomEnvironment para los reflejos, sombra suave (PCFSoft) sobre un plano ShadowMaterial y fondo transparente
// para que se vea el color de la tarjeta, claro u oscuro. La posición se detecta con raycasting: tocar una llanta llama
// a onSelect, y la sonda sirve al arrastre del tablero para soltar sobre una posición.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { remanenteDe, type LlantaDato } from './NeumaticosEsquema';
import type { SondaPosicion } from './ntb-arrastre';
import {
  ANCHO_LLANTA, CAMPO_VISION, RADIO_LLANTA, Recursos, construirCamion, liberarCamion, marcoLlanta, poseCenital, type Camion3D,
} from './nv3-escena';

export interface Nv3VistaProps {
  configuracion: string;
  llantas: LlantaDato[];
  /** Posición de la llanta seleccionada (marco azul) */
  activa: string;
  /** Posición bajo el arrastre (marco verde) */
  sobre: string | null;
  onSelect: (l: LlantaDato) => void;
  /** Se rellena con la función que dice qué posición hay bajo un punto de la pantalla */
  sondaRef?: { current: SondaPosicion | null };
  /** Se llama si el contexto WebGL no se puede crear o se pierde */
  onPerdida: () => void;
}

interface Escena {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camara: THREE.PerspectiveCamera;
  recursos: Recursos;
  sol: THREE.DirectionalLight;
  suelo: THREE.Mesh;
  marcaActiva: THREE.Mesh;
  marcaSobre: THREE.Mesh;
  geometriaMarco: THREE.BufferGeometry;
  camion: Camion3D | null;
  configActual: string;
  raf: number;
}

const normal = (p: string) => String(p).trim().toUpperCase();

export default function Nv3Vista({ configuracion, llantas, activa, sobre, onSelect, sondaRef, onPerdida }: Nv3VistaProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const esc = useRef<Escena | null>(null);
  // Últimos valores de las props para los oyentes que se montan una sola vez
  const vivo = useRef({ onSelect, onPerdida, llantas });
  vivo.current = { onSelect, onPerdida, llantas };

  // Firma de lo que cambia la geometría: si no cambia (p. ej. solo la selección), no se reconstruye
  const firma = configuracion + '|' + llantas.map(l => `${normal(l.posicion)}:${remanenteDe(l)}:${l.r1}:${l.r2}:${l.r3}`).join(',');

  function pedirRender() {
    const e = esc.current;
    if (!e || e.raf) return;
    e.raf = requestAnimationFrame(() => {
      const actual = esc.current;
      if (!actual) return;
      actual.raf = 0;
      actual.renderer.render(actual.scene, actual.camara);
    });
  }

  function aplicarMarcas() {
    const e = esc.current;
    if (!e) return;
    const poner = (marca: THREE.Mesh, pos: string | null, altura: number) => {
      const llanta = pos && e.camion ? e.camion.llantas.get(pos) : undefined;
      marca.visible = !!llanta;
      if (llanta) {
        marca.position.set(llanta.grupo.position.x, llanta.grupo.position.y + RADIO_LLANTA + altura, llanta.grupo.position.z);
      }
    };
    poner(e.marcaActiva, normal(activa), 0.03);
    poner(e.marcaSobre, sobre ? normal(sobre) : null, 0.05);
  }

  // Montaje: renderer, entorno, luces, plano de sombra, marcos y eventos. Se libera todo al desmontar.
  useEffect(() => {
    const cont = contenedor.current;
    if (!cont) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      vivo.current.onPerdida();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    // PCF con radio: en Three r186 PCFSoftShadowMap está retirado; el radio suaviza el borde de la sombra
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    const canvas = renderer.domElement;
    cont.appendChild(canvas);

    // Entorno: reflejos de una sala para el acero, la pintura y los rines
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sala = new RoomEnvironment();
    const entorno = pmrem.fromScene(sala, 0.04);
    pmrem.dispose();
    sala.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    scene.environment = entorno.texture;
    scene.environmentIntensity = 0.6;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 0.7));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0005;
    sol.shadow.normalBias = 0.02;
    sol.shadow.radius = 4;
    scene.add(sol, sol.target);

    // Piso: solo recibe la sombra (el fondo lo pone la tarjeta)
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
    suelo.receiveShadow = true;
    scene.add(suelo);

    const geometriaMarco = marcoLlanta(ANCHO_LLANTA + 0.24, 2 * RADIO_LLANTA + 0.24, 0.16, 0.05);
    const marco = (color: number) => {
      const m = new THREE.Mesh(geometriaMarco, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      return m;
    };

    const camara = new THREE.PerspectiveCamera(CAMPO_VISION, 1, 0.5, 200);
    const recursos = new Recursos();

    esc.current = {
      renderer, scene, camara, recursos, sol, suelo,
      marcaActiva: marco(0x0a84ff), marcaSobre: marco(0x16a34a), geometriaMarco,
      camion: null, configActual: '', raf: 0,
    };

    // Tamaño según la tarjeta
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

    // Raycasting: la posición de la llanta bajo un punto de la pantalla (o null)
    const rayo = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const sonda: SondaPosicion = (x, y) => {
      const actual = esc.current;
      if (!actual?.camion) return null;
      const r = canvas.getBoundingClientRect();
      if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      rayo.setFromCamera(ndc, actual.camara);
      const golpe = rayo.intersectObjects(actual.camion.cauchos, false)[0];
      return golpe ? String(golpe.object.userData.posicion) : null;
    };
    if (sondaRef) sondaRef.current = sonda;

    const alMover = (ev: PointerEvent) => {
      canvas.style.cursor = sonda(ev.clientX, ev.clientY) ? 'pointer' : 'default';
    };
    const alClic = (ev: MouseEvent) => {
      const pos = sonda(ev.clientX, ev.clientY);
      if (!pos) return;
      const llanta = vivo.current.llantas.find(l => normal(l.posicion) === pos);
      if (llanta) vivo.current.onSelect(llanta);
    };
    const alPerder = (ev: Event) => {
      ev.preventDefault();
      vivo.current.onPerdida();
    };
    canvas.addEventListener('pointermove', alMover);
    canvas.addEventListener('click', alClic);
    canvas.addEventListener('webglcontextlost', alPerder);

    return () => {
      canvas.removeEventListener('pointermove', alMover);
      canvas.removeEventListener('click', alClic);
      canvas.removeEventListener('webglcontextlost', alPerder);
      observador.disconnect();
      if (sondaRef && sondaRef.current === sonda) sondaRef.current = null;
      const actual = esc.current;
      if (actual) {
        if (actual.raf) cancelAnimationFrame(actual.raf);
        if (actual.camion) liberarCamion(actual.camion);
        actual.recursos.dispose();
        actual.geometriaMarco.dispose();
        (actual.marcaActiva.material as THREE.Material).dispose();
        (actual.marcaSobre.material as THREE.Material).dispose();
        actual.suelo.geometry.dispose();
        (actual.suelo.material as THREE.Material).dispose();
        actual.sol.shadow.map?.dispose();
      }
      entorno.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      esc.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconstruye el camión cuando cambian la configuración o las llantas; la cámara se coloca solo al cambiar de configuración
  useEffect(() => {
    const e = esc.current;
    if (!e) return;
    if (e.camion) {
      liberarCamion(e.camion);
      e.camion = null;
    }
    const montadas = new Map(llantas.map(l => [normal(l.posicion), l] as const));
    const camion = construirCamion(configuracion, montadas, e.recursos);
    if (camion) {
      e.camion = camion;
      e.scene.add(camion.grupo);
      if (e.configActual !== configuracion) {
        e.configActual = configuracion;
        const pose = poseCenital(camion.zMin, camion.zMax);
        e.camara.position.copy(pose.pos);
        e.camara.up.set(0, 0, -1);
        e.camara.lookAt(pose.objetivo);
        e.camara.updateProjectionMatrix();
        // Luz diagonal desde arriba a la izquierda; el área de sombra cubre el camión
        e.sol.position.set(pose.objetivo.x - 7, 16, pose.objetivo.z - 7);
        e.sol.target.position.copy(pose.objetivo);
        e.sol.target.updateMatrixWorld();
        const s = e.sol.shadow.camera;
        s.left = -(pose.mitad + 2);
        s.right = pose.mitad + 2;
        s.top = pose.mitad + 2;
        s.bottom = -(pose.mitad + 2);
        s.near = 1;
        s.far = 60;
        s.updateProjectionMatrix();
      }
    }
    aplicarMarcas();
    pedirRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // Selección y destino del arrastre
  useEffect(() => {
    aplicarMarcas();
    pedirRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa, sobre]);

  return <div ref={contenedor} className="nv3-vista" data-nv3 role="img" aria-label={`Vista cenital de la unidad, configuración ${configuracion}`} />;
}
