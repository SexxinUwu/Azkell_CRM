// Modelo cenital del camión para neumáticos (Three.js), sin React: lo usa nv3-vista.tsx.
// Chasis de acero, cabina pintada con barniz, vidrio, tanques, llantas con banda generada por canvas (desgaste
// según el semáforo), rines de aluminio y repuestos. Las posiciones y ejes salen de CONFIGURACIONES, igual que el
// esquema SVG, para que ambas vistas nombren las mismas llantas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { remanenteDe, type LlantaDato } from './NeumaticosEsquema';
import { tonoMm, type Tono } from './neumaticosSemaforo';
import { COLOR_SEMAFORO_CANVAS, fotoBandaLista, texturaEtiqueta, texturasBanda, texturasMarca } from './nv3-texturas';

export const RADIO_LLANTA = 0.58;
export const ANCHO_LLANTA = 0.36;
export const ALTURA_EJE = 0.6;
const SEP_EJE = 2.1;
const LADO_EXTERIOR = 2.2;
const LADO_INTERIOR = 1.5;
/** Desgaste de referencia (mm): a este valor la banda se deforma al máximo */
const MM_REF = 12;
/** Campo de visión vertical de la cámara cenital (grados): poca perspectiva para que la cabina no tape las llantas */
export const CAMPO_VISION = 22;
/** Campo de visión de la isometría (grados): algo más de perspectiva para que se lea el volumen */
export const CAMPO_ISOMETRIA = 30;
/** Inclinación de la cámara hacia el eje del camión (grados): casi cenital. Solo en Z (de frente a atrás): en X
 * la cabina y los tanques taparían las llantas del costado opuesto. */
const INCLINACION = 6;

/**
 * Colores del camión. Solo cambian la carrocería y el bastidor: el semáforo de las llantas sigue igual.
 * Para cambiar el color de marca se edita `pintura` (hex, p. ej. 0xc8102e para rojo).
 */
export const PALETA = {
  /** Azul acero brillante: cabina, capó y tapas */
  pintura: 0x2b7bd0,
  /** Bastidor y largueros: acero claro pulido */
  bastidor: 0xaeb7c4,
} as const;

/** Neón del marco de la llanta seleccionada (cian) */
export const COLOR_NEON = 0x19f5ff;

/** Materiales compartidos por todo el modelo; las bandas, etiquetas y marcas se guardan en caché */
export class Recursos {
  readonly acero = new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0.9, roughness: 0.3 });
  readonly chasis = new THREE.MeshStandardMaterial({ color: PALETA.bastidor, metalness: 0.8, roughness: 0.28 });
  readonly pintura = new THREE.MeshPhysicalMaterial({ color: PALETA.pintura, metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03 });
  readonly vidrio = new THREE.MeshPhysicalMaterial({ color: 0x163447, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.88 });
  readonly cromo = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.14 });
  readonly rin = new THREE.MeshStandardMaterial({ color: 0xc8ced8, metalness: 1, roughness: 0.2 });
  readonly cubo = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.5, roughness: 0.45 });
  /** Flancos del neumático: caucho con un barniz leve (brillo en los costados) */
  readonly flanco = new THREE.MeshPhysicalMaterial({ color: 0x1d1d22, roughness: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  /** Hueco de una posición sin llanta montada */
  readonly hueco = new THREE.MeshStandardMaterial({ color: 0x9aa1ac, roughness: 0.8, transparent: true, opacity: 0.3, depthWrite: false });

  private bandas = new Map<string, THREE.MeshStandardMaterial>();
  private etiquetas = new Map<string, THREE.SpriteMaterial>();
  private marcas = new Map<string, THREE.MeshPhysicalMaterial>();
  private texturas: THREE.Texture[] = [];

  /** Letrero de la marca sobre el capó (texto en relieve con brillo), en caché por nombre */
  materialMarca(marca: string): THREE.MeshPhysicalMaterial {
    const clave = marca.trim().toUpperCase();
    let material = this.marcas.get(clave);
    if (!material) {
      const t = texturasMarca(clave);
      this.texturas.push(t.color, t.relieve, t.rugosidad);
      material = new THREE.MeshPhysicalMaterial({
        map: t.color, bumpMap: t.relieve, bumpScale: 2.5, roughnessMap: t.rugosidad, roughness: 1,
        clearcoat: 0.8, clearcoatRoughness: 0.05, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      this.marcas.set(clave, material);
    }
    return material;
  }

  /** Banda de rodadura con su color, relieve y rugosidad (caché por combinación de tonos) */
  materialBanda(bandas: (number | null)[]): THREE.MeshStandardMaterial {
    const clave = (fotoBandaLista() ? 'foto|' : 'codigo|') + bandas.map(v => tonoMm(v)).join('|');
    let material = this.bandas.get(clave);
    if (!material) {
      const t = texturasBanda(bandas);
      this.texturas.push(t.color, t.relieve, t.rugosidad);
      material = new THREE.MeshStandardMaterial({
        map: t.color, bumpMap: t.relieve, bumpScale: 2, roughnessMap: t.rugosidad, roughness: 1, metalness: 0,
      });
      this.bandas.set(clave, material);
    }
    return material;
  }

  /** Número de la posición sobre la llanta, con el color del semáforo */
  materialEtiqueta(texto: string, tono: Tono): THREE.SpriteMaterial {
    const clave = `${texto}|${tono}`;
    let material = this.etiquetas.get(clave);
    if (!material) {
      const t = texturaEtiqueta(texto, COLOR_SEMAFORO_CANVAS[tono]);
      this.texturas.push(t);
      material = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
      this.etiquetas.set(clave, material);
    }
    return material;
  }

  dispose() {
    for (const m of [this.acero, this.chasis, this.pintura, this.vidrio, this.cromo, this.rin, this.cubo, this.flanco, this.hueco]) m.dispose();
    for (const m of this.bandas.values()) m.dispose();
    for (const m of this.etiquetas.values()) m.dispose();
    for (const m of this.marcas.values()) m.dispose();
    for (const t of this.texturas) t.dispose();
    this.bandas.clear();
    this.etiquetas.clear();
    this.marcas.clear();
    this.texturas = [];
  }
}

export interface Llanta3D {
  posicion: string;
  grupo: THREE.Group;
  caucho: THREE.Mesh;
  etiqueta: THREE.Sprite;
  montada: boolean;
}

/** Cuerpo de un modelo externo (glTF), ya sin sus ruedas: el visor pone las suyas en las posiciones de la base */
export type CuerpoExterno = THREE.Group;

const RUTA_MODELO_SCANIA = '/assets/3d/scania_s730_final.glb';
let cargaScania: Promise<CuerpoExterno | null> | null = null;

/** Carga el modelo una sola vez. Si no se puede leer, devuelve null y el camión sigue con sus formas básicas. */
export function cargarCuerpoScania(): Promise<CuerpoExterno | null> {
  if (!cargaScania) {
    cargaScania = new Promise(resolver => {
      new GLTFLoader().load(
        RUTA_MODELO_SCANIA,
        gltf => resolver(gltf.scene),
        undefined,
        () => resolver(null),
      );
    });
  }
  return cargaScania;
}

/** true si la parte más alta del modelo (la cabina) está en z positivo */
function cabinaEnPositivoZ(obj: THREE.Object3D): boolean {
  const medio = (new THREE.Box3().setFromObject(obj).min.z + new THREE.Box3().setFromObject(obj).max.z) / 2;
  let alturaPositiva = -Infinity;
  let alturaNegativa = -Infinity;
  const v = new THREE.Vector3();
  obj.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z >= medio) alturaPositiva = Math.max(alturaPositiva, v.y);
      else alturaNegativa = Math.max(alturaNegativa, v.y);
    }
  });
  return alturaPositiva > alturaNegativa;
}

/** Copia del cuerpo sin sus ruedas, escalado para caber en el largo y el alto del camión */
function ajustarCuerpo(cuerpo: CuerpoExterno, largo: number, altoMax: number): THREE.Group {
  const copia = cuerpo.clone(true);
  const ruedas: THREE.Object3D[] = [];
  copia.traverse(o => {
    const nombre = (o.name || '').toLowerCase();
    if (o instanceof THREE.Mesh && (nombre.includes('tire') || nombre.includes('rim'))) ruedas.push(o);
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  ruedas.forEach(o => o.parent?.remove(o));

  // Frente: la cabina (la parte más alta) queda hacia z negativo, como en el visor
  copia.updateMatrixWorld(true);
  if (cabinaEnPositivoZ(copia)) copia.rotation.y = Math.PI;
  copia.updateMatrixWorld(true);
  // Alto ajustado al camión; el largo se estira para cubrir los tres ejes (escala no uniforme en z)
  const tam = new THREE.Box3().setFromObject(copia).getSize(new THREE.Vector3());
  const escalaXY = altoMax / Math.max(tam.y, 1e-6);
  const escalaZ = largo / Math.max(tam.z, 1e-6);
  copia.scale.set(escalaXY, escalaXY, escalaZ);

  // Centro en x y z; la base queda en y = 0 y se coloca después
  copia.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(copia);
  const centro = caja.getCenter(new THREE.Vector3());
  copia.position.set(-centro.x, -caja.min.y, -centro.z);

  const envoltorio = new THREE.Group();
  envoltorio.add(copia);
  return envoltorio;
}

export interface Camion3D {
  grupo: THREE.Group;
  llantas: Map<string, Llanta3D>;
  /** Mallas de caucho: sobre ellas se hace el raycasting */
  cauchos: THREE.Mesh[];
  zMin: number;
  zMax: number;
  /** Geometrías propias de este modelo (se liberan al reconstruirlo) */
  geometrias: THREE.BufferGeometry[];
  /** Pivote del letrero de la marca (null si no hay marca): gira según la vista */
  letrero: THREE.Group | null;
}

/** Remanentes R1, R2, R3 de una llanta; si no hay por banda, el promedio en las tres */
function bandasDe(dato: LlantaDato, mm: number | null): (number | null)[] {
  const medidas = [dato.r1, dato.r2, dato.r3].map(v => {
    const n = Number(v);
    return v !== null && v !== undefined && n > 0 ? n : null;
  });
  return medidas.some(v => v !== null) ? medidas : [mm, mm, mm];
}

/** Neumático: el radio se reduce en los hombros (redondeo) y en la banda según el desgaste de cada franja */
function geometriaLlanta(bandas: (number | null)[]): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(RADIO_LLANTA, RADIO_LLANTA, ANCHO_LLANTA, 72, 14, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / ANCHO_LLANTA + 0.5; // 0 abajo, 1 arriba (R1)
    const c = (t - 0.5) * 2;                     // -1 a 1 a lo ancho
    const hombro = 1 - 0.12 * Math.pow(Math.abs(c), 4);
    const mm = t > 2 / 3 ? bandas[0] : t < 1 / 3 ? bandas[2] : bandas[1];
    const desgaste = mm === null ? 0 : Math.min(1, Math.max(0, (MM_REF - mm) / MM_REF));
    const escala = hombro * (1 - 0.06 * desgaste);
    pos.setX(i, pos.getX(i) * escala);
    pos.setZ(i, pos.getZ(i) * escala);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Rines de aluminio a los dos lados: disco, cinco radios y cubo */
function crearRin(rec: Recursos, geometrias: THREE.BufferGeometry[]): THREE.Group {
  const rin = new THREE.Group();
  const disco = new THREE.CylinderGeometry(0.36, 0.36, 0.03, 28);
  const radio = new THREE.BoxGeometry(0.03, 0.26, 0.06);
  const cubo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
  geometrias.push(disco, radio, cubo);
  for (const lado of [-1, 1]) {
    const plato = new THREE.Mesh(disco, rec.rin);
    plato.rotation.z = Math.PI / 2;
    plato.position.x = lado * 0.195;
    rin.add(plato);
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5;
      const brazo = new THREE.Mesh(radio, rec.rin);
      brazo.rotation.x = a;
      brazo.position.set(lado * 0.205, 0.2 * Math.cos(a), 0.2 * Math.sin(a));
      rin.add(brazo);
    }
    const eje = new THREE.Mesh(cubo, rec.cubo);
    eje.rotation.z = Math.PI / 2;
    eje.position.x = lado * 0.225;
    rin.add(eje);
  }
  return rin;
}

function crearLlanta(pos: string, x: number, z: number, lado: number, dato: LlantaDato | undefined, rec: Recursos, geometrias: THREE.BufferGeometry[]): Llanta3D {
  const grupo = new THREE.Group();
  grupo.position.set(x, ALTURA_EJE, z);
  grupo.userData.posicion = pos;
  const montada = !!dato;
  const mm = dato ? remanenteDe(dato) : null;
  const bandas = dato ? bandasDe(dato, mm) : [null, null, null];

  const geo = geometriaLlanta(bandas);
  geometrias.push(geo);
  // Banda (grupo 0 de la geometría) y flancos (tapas, grupos 1 y 2)
  const caucho = new THREE.Mesh(geo, montada ? [rec.materialBanda(bandas), rec.flanco, rec.flanco] : rec.hueco);
  caucho.rotation.z = lado > 0 ? -Math.PI / 2 : Math.PI / 2;
  caucho.castShadow = montada;
  caucho.userData.posicion = pos;
  grupo.add(caucho);
  if (montada) grupo.add(crearRin(rec, geometrias));

  const etiqueta = new THREE.Sprite(rec.materialEtiqueta(pos, montada ? tonoMm(mm) : 'gray'));
  etiqueta.scale.set(0.56, 0.56, 1);
  etiqueta.position.set(0, RADIO_LLANTA + 0.42, 0);
  etiqueta.renderOrder = 10;
  grupo.add(etiqueta);
  return { posicion: pos, grupo, caucho, etiqueta, montada };
}

/** Camión completo según la configuración: `datos` tiene solo las llantas montadas (clave en mayúsculas).
 * `marca` (opcional) se dibuja sobre el capó del tracto; sin marca no hay letrero. */
export function construirCamion(codigo: string, datos: Map<string, LlantaDato>, rec: Recursos, marca?: string | null, cuerpo?: CuerpoExterno | null): Camion3D | null {
  const config = CONFIGURACIONES[codigo];
  if (!config) return null;
  const grupo = new THREE.Group();
  const geometrias: THREE.BufferGeometry[] = [];
  const llantas = new Map<string, Llanta3D>();
  let letreroPivote: THREE.Group | null = null;

  const malla =(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotX = 0, rotZ = 0) => {
    geometrias.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rotX, 0, rotZ);
    m.castShadow = true;
    grupo.add(m);
    return m;
  };

  // Ejes: el primero es el delantero; los demás van hacia atrás
  const zEjes = config.ejes.map((_, i) => i * SEP_EJE);
  const delantero = zEjes[0] ?? 0;
  const trasero = zEjes[zEjes.length - 1] ?? 0;
  const zRepuestos = trasero + 0.6;
  const esRemolque = !config.cabina;
  const zMin = delantero - (esRemolque ? 2.0 : 2.8);
  // Solo los repuestos que la unidad tiene, igual que el esquema SVG
  const repuestos = config.repuestos.filter(p => datos.has(p));
  const zMax = Math.max(trasero, repuestos.length ? zRepuestos : trasero);
  const zCentro = (zMin + zMax) / 2;

  // Bastidor: largueros, travesaños entre ejes y el del frente
  // Largueros desde bajo la cabina hasta atrás (sin tramo delante de la cabina)
  const zInicioLargueros = delantero - 0.6;
  const largoLargueros = zMax - zInicioLargueros;
  for (const x of [-0.55, 0.55]) malla(new THREE.BoxGeometry(0.2, 0.3, largoLargueros), rec.chasis, x, 0.85, (zMax + zInicioLargueros) / 2);
  for (const z of [...zEjes.slice(0, -1).map(e => e + SEP_EJE / 2), zMin + 0.8]) {
    malla(new THREE.BoxGeometry(1.5, 0.2, 0.14), rec.chasis, 0, 0.9, z);
  }
  // Ejes
  for (const z of zEjes) malla(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 14), rec.acero, 0, ALTURA_EJE, z, 0, Math.PI / 2);

  if (config.cabina && cuerpo) {
    // Modelo externo de la marca: ocupa el lugar de la cabina y la litera, sobre el bastidor
    const externo = ajustarCuerpo(cuerpo, Math.max(3, zMax - zMin - 1), 3.6);
    externo.position.set(0, 0.85, zCentro);
    grupo.add(externo);
  } else if (config.cabina) {
    // Tanques de combustible entre la cabina y los ejes traseros
    for (const x of [-1.05, 1.05]) malla(new THREE.CylinderGeometry(0.32, 0.32, 1.6, 18), rec.acero, x, 0.75, delantero + 2.0, Math.PI / 2);
    // Cabina, capó, parrilla, parabrisas, defensa y espejos, con las posiciones del clásico
    malla(new RoundedBoxGeometry(2.3, 2.4, 2.6, 8, 0.32), rec.pintura, 0, 1.9, delantero - 0.4);
    malla(new RoundedBoxGeometry(2.2, 1.3, 1.5, 8, 0.3), rec.pintura, 0, 1.35, delantero - 1.9);
    malla(new THREE.BoxGeometry(1.8, 1.0, 0.1), rec.cromo, 0, 1.25, delantero - 2.66);
    malla(new THREE.BoxGeometry(2.1, 0.9, 0.1), rec.vidrio, 0, 2.35, delantero - 1.7, -0.2);
    malla(new RoundedBoxGeometry(2.4, 0.45, 0.3, 6, 0.14), rec.cromo, 0, 0.6, delantero - 2.65);
    for (const x of [-1.25, 1.25]) malla(new THREE.BoxGeometry(0.12, 0.5, 0.12), rec.cromo, x, 2.0, delantero - 1.8);
    // Letrero de la marca sobre el capó (su cara superior: la parte delantera queda arriba en la vista cenital).
    // El capó termina en y = 2.0; la parte de atrás del capó queda dentro de la cabina, por eso el letrero va adelante.
    // Va dentro de un pivote para girarlo según la vista (ver giroLetreroIsometria).
    if (marca?.trim()) {
      const geoMarca = new THREE.PlaneGeometry(1.9, 0.8);
      geometrias.push(geoMarca);
      const letrero = new THREE.Mesh(geoMarca, rec.materialMarca(marca));
      letrero.rotation.x = -Math.PI / 2;
      letrero.renderOrder = 4;
      letreroPivote = new THREE.Group();
      letreroPivote.position.set(0, 2.012, delantero - 2.18);
      letreroPivote.add(letrero);
      grupo.add(letreroPivote);
    }
  } else {
    // Carreta: lanza triangular y pivote (kingpin) al frente
    for (const lado of [-0.4, 0.4]) {
      malla(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10), rec.chasis, lado, 0.6, zMin + 0.6, 0, lado > 0 ? -Math.PI / 4 : Math.PI / 4);
    }
    malla(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 14), rec.cromo, 0, 0.6, zMin);
  }

  // Ruedas: un lado con dos llantas es dual (exterior e interior); las sencillas van en el exterior
  config.ejes.forEach((eje, i) => {
    const z = zEjes[i] ?? 0;
    const lados: Array<[number, string[]]> = [[-1, eje.izquierda], [1, eje.derecha]];
    for (const [lado, posiciones] of lados) {
      posiciones.forEach((pos, k) => {
        const x = lado * (posiciones.length > 1 && k > 0 ? LADO_INTERIOR : LADO_EXTERIOR);
        const llanta = crearLlanta(pos, x, z, lado, datos.get(pos), rec, geometrias);
        llantas.set(pos, llanta);
        grupo.add(llanta.grupo);
      });
    }
  });
  // Repuestos montados atrás del bastidor
  repuestos.forEach((pos, i) => {
    const x = repuestos.length === 1 ? 0 : -0.8 + i * 1.6;
    const llanta = crearLlanta(pos, x, zRepuestos, 1, datos.get(pos), rec, geometrias);
    llantas.set(pos, llanta);
    grupo.add(llanta.grupo);
  });

  return {
    grupo, llantas, cauchos: [...llantas.values()].map(l => l.caucho), zMin, zMax, geometrias, letrero: letreroPivote,
  };
}

/** Quita el camión de la escena y libera sus geometrías (los materiales compartidos quedan en Recursos) */
export function liberarCamion(camion: Camion3D) {
  for (const g of camion.geometrias) g.dispose();
  camion.grupo.removeFromParent();
}

/**
 * Cámara casi cenital sobre el centro del camión. El encuadre sale del aspecto del lienzo: el camión entra completo
 * (a lo largo y a lo ancho) y queda centrado. Frente arriba (el up de la cámara es -Z).
 */
export function poseCenital(zMin: number, zMax: number, aspecto: number): { pos: THREE.Vector3; objetivo: THREE.Vector3; mitad: number } {
  const zc = (zMin + zMax) / 2;
  const altoNecesario = zMax - zMin + 2.4;
  const anchoNecesario = 2 * 2.78 + 1.2;
  // Alto visible (unidades de mundo) que cubre el largo y, con el aspecto, también el ancho
  const alto = Math.max(altoNecesario, aspecto > 0 ? anchoNecesario / aspecto : altoNecesario);
  const mitad = alto / 2;
  const distancia = mitad / Math.tan(THREE.MathUtils.degToRad(CAMPO_VISION / 2));
  const objetivo = new THREE.Vector3(0, 0.5, zc);
  const tilt = THREE.MathUtils.degToRad(INCLINACION);
  const pos = new THREE.Vector3(0, objetivo.y + Math.cos(tilt) * distancia, zc + Math.sin(tilt) * distancia);
  return { pos, objetivo, mitad };
}

function contornoRedondeado(ancho: number, alto: number, radio: number): THREE.Vector2[] {
  const x0 = -ancho / 2, y0 = -alto / 2, x1 = ancho / 2, y1 = alto / 2;
  const puntos: THREE.Vector2[] = [];
  const arco = (cx: number, cy: number, inicio: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = inicio + (i / 6) * (Math.PI / 2);
      puntos.push(new THREE.Vector2(cx + radio * Math.cos(a), cy + radio * Math.sin(a)));
    }
  };
  arco(x1 - radio, y1 - radio, 0);
  arco(x0 + radio, y1 - radio, Math.PI / 2);
  arco(x0 + radio, y0 + radio, Math.PI);
  arco(x1 - radio, y0 + radio, (3 * Math.PI) / 2);
  return puntos;
}

/** Marco redondeado plano (en el plano del piso) que marca la llanta activa o el destino del arrastre */
export function marcoLlanta(ancho: number, alto: number, radio: number, grosor: number): THREE.ShapeGeometry {
  const forma = new THREE.Shape(contornoRedondeado(ancho, alto, radio));
  forma.holes.push(new THREE.Path(contornoRedondeado(ancho - 2 * grosor, alto - 2 * grosor, Math.max(0.01, radio - grosor))));
  const geo = new THREE.ShapeGeometry(forma, 6);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Anillo que marca la llanta de lado: va en el plano del neumático (normal en X) */
export function anilloLlanta(): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(RADIO_LLANTA + 0.05, RADIO_LLANTA + 0.14, 72);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Límites de la cámara isométrica: el objetivo no sale del camión (x, y, z) */
export function limitesCamion(zMin: number, zMax: number): { min: THREE.Vector3; max: THREE.Vector3 } {
  return {
    min: new THREE.Vector3(-3, 0, zMin - 1),
    max: new THREE.Vector3(3, 2.5, zMax + 1),
  };
}

/** Desde dónde mira la cámara isométrica: delante (z negativo, arriba en la vista cenital), a la izquierda y arriba */
const DIRECCION_ISOMETRIA = new THREE.Vector3(-0.62, 0.62, -0.5).normalize();

/**
 * Giro (radianes, eje Y) del letrero del capó para que se lea de frente desde la isometría. Con giro 0 (plano) el texto
 * corre hacia +X y su parte superior apunta hacia -Z; con θ queda con la parte superior en (-sen θ, -cos θ).
 */
export function giroLetreroIsometria(): number {
  // Dirección horizontal en la que mira la cámara (desde la cámara hacia el camión)
  const fx = -DIRECCION_ISOMETRIA.x;
  const fz = -DIRECCION_ISOMETRIA.z;
  // La parte superior del texto debe apuntar lejos de la cámara: hacia fx, fz
  return Math.atan2(-fx, -fz);
}

/**
 * Isometría: cámara en perspectiva desde delante y a un costado, con el camión completo encuadrado y algo de margen.
 * El alejamiento sale del largo del camión y del aspecto del lienzo (en un celular el ancho manda).
 */
export function poseIsometrica(zMin: number, zMax: number, aspecto: number): { pos: THREE.Vector3; objetivo: THREE.Vector3; fov: number; distancia: number } {
  const zc = (zMin + zMax) / 2;
  const largo = zMax - zMin + 2.4;
  const objetivo = new THREE.Vector3(0, 0.9, zc);
  const tanV = Math.tan(THREE.MathUtils.degToRad(CAMPO_ISOMETRIA / 2));
  const distanciaAlto = (largo * 0.4 + 0.6) / tanV;
  const distanciaAncho = 3.4 / (tanV * Math.max(aspecto, 0.2));
  // Margen extra (30 %): la unidad entera queda visible, con aire alrededor y sin cortar la cabina
  const distancia = Math.max(distanciaAlto, distanciaAncho, 9) * 1.3;
  const pos = objetivo.clone().addScaledVector(DIRECCION_ISOMETRIA, distancia);
  return { pos, objetivo, fov: CAMPO_ISOMETRIA, distancia };
}

/**
 * Vista de lado para la llanta elegida: la cámara se pone del costado de esa llanta, a la distancia de la isometría
 * para que la unidad entera siga en cuadro (y no un primer plano de la llanta). El centro queda en la mitad del camión.
 */
export function poseLateral(x: number, zc: number, distancia: number): { pos: THREE.Vector3; objetivo: THREE.Vector3; fov: number; distancia: number } {
  const lado = x < -0.05 ? -1 : 1;
  const objetivo = new THREE.Vector3(0, 0.9, zc);
  const pos = new THREE.Vector3(lado * distancia * 0.9, 0.9 + distancia * 0.45, zc);
  return { pos, objetivo, fov: CAMPO_ISOMETRIA, distancia };
}
