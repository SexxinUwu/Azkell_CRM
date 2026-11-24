// Tablero de movimientos: Plano (dibujo de líneas) e Isometría con el modelo 3D de "Placas en 3D" (Volvo, Scania, etc.).
// Al pasar de Plano a Isometría la unidad llega despiezada y se arma; cada llanta lleva un marcador con su posición y el
// aro del semáforo, que sigue a la rueda cuando se gira la cámara. Si el modelo no encaja con la configuración o falla
// WebGL, avisa con onFalla y el tablero usa su vista de respaldo.
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CONFIGURACIONES, posicionesDeConfig } from '../inspecciones/components/ChasisEsquemaVisual';
import { remanenteDe, tonoMm, type LlantaDato } from './NeumaticosEsquema';
import { PlanoTecnico } from './nv3-plano';
import type { ModoVista } from './nv3-motor';
import { usePlacas } from '../placas/api';
import { colorsOf, resolverModelo, unidadesDe, type Cat, type Unidad } from '../placas/tresd/datos';
import { useOscuro } from '../placas/tresd/useOscuro';
import type { Escena3D } from '../placas/tresd/escena3d';
import './nv3.css';

const normal = (p: string) => String(p).trim().toUpperCase();
const detener = (e: SyntheticEvent) => e.stopPropagation();
/** Cuánto se separan las piezas en Plano (1 = el despiece de Placas); al armar vuelve a 0 */
const DESPIECE_PLANO = 2.4;

const OPCIONES: Array<{ valor: ModoVista; etiqueta: string }> = [
  { valor: 'plano', etiqueta: 'Plano' },
  { valor: 'isometria', etiqueta: 'Isometría' },
];

export default function Placa3DVista({ placa, configuracion, llantas, activa, sobre, camion = false, modo, onModo, onSelect, arrastrando = null }: {
  placa: string; configuracion: string; llantas: LlantaDato[]; activa: string; sobre: string | null; camion?: boolean;
  modo: ModoVista; onModo: (m: ModoVista) => void; onSelect: (l: LlantaDato) => void;
  /** Llanta de la unidad que se lleva con el puntero en el plano */
  arrastrando?: { posicion: string; x: number; y: number } | null;
}) {
  const { oscuro } = useOscuro();
  const placas = usePlacas();
  // La unidad del modelo 3D sale de la ficha de la placa, pero con la configuración que el tablero dibuja: así el modelo
  // siempre tiene los mismos ejes que el plano. Si la placa no está en la flota, se usa el modelo genérico de su tipo.
  const unidad = useMemo<Unidad | null>(() => {
    if (!placas.isFetched) return null;
    const p = placas.data?.find(x => normal(x.placa) === normal(placa));
    const base = p ? unidadesDe([p]).rows[0] ?? null : null;
    const remolque = /^[SR]/.test(configuracion);
    const tracto = !camion;
    const cfg = remolque ? configuracion : (configuracion === '4X2' ? (tracto ? 'T2' : 'C2') : (tracto ? 'T3' : 'C3'));
    const cat: Cat = configuracion.startsWith('S') ? 'S' : configuracion.startsWith('R') ? 'R' : tracto ? 'T' : 'C';
    const f: Record<string, string> = { ...(base?.f ?? { PLACA: placa, MARCA: '', MODELO: '', TIPO: '', COLOR: '' }), CONFIGURACION: cfg };
    if (base && base.cat !== 'A') return { ...base, f, cat };
    return { plate: normal(placa), f, cat, search: '', placa: (p ?? {}) as Unidad['placa'] };
  }, [placas.isFetched, placas.data, placa, configuracion, camion]);

  const vista = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const cabecera = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const escenaRef = useRef<Escena3D | null>(null);
  const ruedasRef = useRef<{ pos: string; obj: import('three-r128').Object3D; desvio: number }[] | null>(null);
  const marcadores = useRef<Map<string, HTMLElement>>(new Map());
  const [listo, setListo] = useState(false);
  // Solo si el equipo no puede dibujar en WebGL: queda el plano de líneas, sin isometría
  const [sin3d, setSin3d] = useState(false);
  const vivo = useRef({ modo });
  vivo.current = { modo };

  const config = CONFIGURACIONES[configuracion];
  const posiciones = useMemo(() => posicionesDeConfig(configuracion), [configuracion]);
  const datos = useMemo(() => new Map(llantas.map(l => [normal(l.posicion), l] as const)), [llantas]);

  // Escena: se crea una vez por unidad
  useEffect(() => {
    if (!unidad || !config || !lienzo.current || !vista.current || !cabecera.current || !barra.current) return;
    let activo = true;
    let escena: Escena3D | null = null;
    setListo(false);
    ruedasRef.current = null;
    import('../placas/tresd/escena3d').then(mod => {
      if (!activo || !lienzo.current || !vista.current || !cabecera.current || !barra.current) return;
      escena = new mod.Escena3D(lienzo.current, vista.current, { cabecera: cabecera.current, barra: barra.current }, {
        onHover: () => {}, onSeleccion: () => {},
      });
      escenaRef.current = escena;
      escena.aplicarTema(oscuro);
      const r = resolverModelo(unidad);
      const livery = colorsOf(unidad.f.COLOR);
      escena.cargar(r.M, { plate: unidad.plate.slice(0, 10), livery, reefer: false, trailerCfg: r.cfg || 'S3' }, true);
      escena.pintar(livery.length > 0 ? livery[0] : r.M.paint);
      escena.layout();
      // La asignación de ruedas se hace con la unidad armada
      const mapa = escena.mapearRuedas(config.ejes);
      ruedasRef.current = mapa;
      escena.alDibujar = () => {
        const m = ruedasRef.current;
        if (!m || !escenaRef.current) return;
        m.forEach(({ pos, obj, desvio }) => {
          const el = marcadores.current.get(pos);
          if (!el) return;
          const p = escenaRef.current!.enPantalla(obj);
          el.style.transform = `translate(${p.x - 14 + desvio}px, ${p.y - 14}px)`;
        });
      };
      // Estado inicial según el modo: en Plano la unidad queda despiezada y vista desde arriba
      if (vivo.current.modo === 'plano') { escena.despiece(DESPIECE_PLANO, false); escena.vista('top', true); escena.disolver(1, 1); } else { escena.vista('v34', true); }
      setListo(true);
    }).catch(() => { if (activo) setSin3d(true); });
    return () => {
      activo = false;
      if (escena) escena.destruir();
      if (escenaRef.current === escena) escenaRef.current = null;
      ruedasRef.current = null;
      setListo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidad, configuracion]);

  // Plano ⇄ Isometría: la unidad se arma (o se desarma) mientras la cámara sube o baja
  const modoAnterior = useRef<ModoVista | null>(null);
  useEffect(() => {
    const e = escenaRef.current;
    if (!e || !listo) return;
    const previo = modoAnterior.current;
    modoAnterior.current = modo;
    if (previo === null) return;
    if (modo === 'isometria') {
      // Las piezas aparecen separadas y se materializan mientras se arman y la cámara baja
      e.despiece(DESPIECE_PLANO, false);
      e.vista('top', true);
      e.disolver(1, 1);
      e.despiece(0, true);
      e.vista('v34', false);
      e.disolver(0, 950);
    } else {
      // Se separan y se desintegran mientras la cámara sube; después el plano se dibuja trazo a trazo
      e.despiece(DESPIECE_PLANO, true);
      e.vista('top', false);
      e.disolver(1, 750, 200);
    }
  }, [modo, listo]);
  useEffect(() => { if (listo) modoAnterior.current = modo; }, [listo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { escenaRef.current?.aplicarTema(oscuro); }, [oscuro]);
  // Con los marcadores ya montados, un cuadro para ubicarlos sobre las ruedas
  useEffect(() => { if (listo) escenaRef.current?.layout(); }, [listo]);

  // Flechas (solo en isometría): pasan a la llanta anterior o siguiente
  const enOrden = posiciones.flatMap(p => llantas.filter(l => normal(l.posicion) === p));
  const pasar = (paso: 1 | -1) => {
    const n = enOrden.length;
    if (!n) return;
    const i = enOrden.findIndex(l => normal(l.posicion) === normal(activa));
    onSelect(enOrden[i < 0 ? (paso > 0 ? 0 : n - 1) : (i + paso + n) % n]);
  };

  // Sin WebGL queda solo el plano de líneas
  if (sin3d) {
    return (
      <div className="nv3-vista nv3-vista--2d nv3-vista--placa" data-nv3 data-modo="plano">
        <div className="nv3-plano">
          <PlanoTecnico configuracion={configuracion} llantas={llantas} activa={activa} sobre={sobre} camion={camion} />
        </div>
      </div>
    );
  }

  const conMarcadores = (ruedasRef.current ?? []).map(r => r.pos);

  return (
    <div ref={vista} className="nv3-vista nv3-vista--2d nv3-vista--placa" data-nv3 data-modo={modo}>
      <div className="nv3-lienzo" role="img" aria-label={`Vista de la unidad, configuración ${configuracion}`}>
        <canvas ref={lienzo} />
      </div>
      {/* Anclas que pide la escena de Placas para encuadrar (sin interfaz propia aquí) */}
      <div ref={cabecera} style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <div ref={barra} style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 1, pointerEvents: 'none' }} />

      {/* Marcadores de las llantas sobre el modelo 3D */}
      <div className="nv3-marcas" aria-hidden={modo !== 'isometria'}>
        {conMarcadores.map(pos => {
          const dato = datos.get(pos);
          const tono = dato ? tonoMm(remanenteDe(dato)) : null;
          const aro = tono && tono !== 'gray' ? `var(--${tono}-ink)` : 'var(--label-3)';
          return (
            <div key={pos} ref={el => { if (el) marcadores.current.set(pos, el); else marcadores.current.delete(pos); }}
              data-ntb-pos={pos} className={`nv3-marca${normal(activa) === pos ? ' nv3-marca--activa' : ''}${sobre && normal(sobre) === pos ? ' nv3-marca--destino' : ''}`}
              style={{ borderColor: aro }} aria-label={`Llanta ${pos}`} role="button" tabIndex={-1}>
              {pos}
            </div>
          );
        })}
      </div>

      <div className="nv3-plano">
        <PlanoTecnico key={modo} configuracion={configuracion} llantas={llantas} activa={activa} sobre={sobre} camion={camion} animar arrastrando={arrastrando} />
      </div>

      <div className="nv3-modos" role="group" aria-label="Tipo de vista" onPointerDown={detener} onClick={detener}>
        {OPCIONES.map(o => (
          <button key={o.valor} type="button" className="nv3-modos__op" aria-pressed={modo === o.valor} onClick={() => onModo(o.valor)}>
            {o.etiqueta}
          </button>
        ))}
      </div>
      {modo === 'isometria' && enOrden.length > 1 && (
        <>
          <button type="button" className="nv3-flecha nv3-flecha--ant" aria-label="Neumático anterior" onPointerDown={detener} onClick={() => pasar(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="nv3-flecha nv3-flecha--sig" aria-label="Neumático siguiente" onPointerDown={detener} onClick={() => pasar(1)}>
            <ChevronRight size={22} />
          </button>
        </>
      )}
    </div>
  );
}
