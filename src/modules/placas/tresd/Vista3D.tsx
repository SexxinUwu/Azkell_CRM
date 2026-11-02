// Placas en 3D: tercera vista de Placas (lista, unidad en 3D y especificaciones), dentro del marco del ERP.
// Diseño, textos y comportamiento del archivo docs/referencia/flota-3d.html.
import { Component, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './flota3d.css';
import type { Placa } from '../api';
import { useToast } from '../../../core/ui/Toast';
import {
  colorsOf, estaFueraDeUso, etiquetaCampo, fmt, GRUPOS, hexCss, MONO, norm, num,
  resolverModelo, tanks, textoEstado, tituloUnidad, unidadesDe, UNIDADES,
  type Resuelta, type Unidad,
} from './datos';
import { useOscuro } from './useOscuro';
import type { Escena3D, Toggle, Vista } from './escena3d';
import type { Modelo, Parte } from './modelos';

const CLAVE_ULTIMA = 'fleet_tresd_ultima';

const COLORES: [string, number][] = [
  ['Rojo', 0x9e1b22], ['Naranja', 0xd9731c], ['Amarillo', 0xe0a81a], ['Blanco', 0xe9ecef], ['Plata', 0x9aa3ad],
  ['Gris azulado', 0x5d6f80], ['Azul', 0x1f5aa6], ['Azul marino', 0x24395c], ['Verde', 0x2f5a3c], ['Negro', 0x1c1f24],
];

const VISTAS: [Vista, string][] = [
  ['v34', '3/4'], ['front', 'Frontal'], ['side', 'Lateral'], ['rear', 'Trasera'],
  ['top', 'Planta'], ['under', 'Bajos'], ['engine', 'Motor'], ['inside', 'Cabina'],
];

// Indicadores de la especificación: el máximo se calcula sobre toda la flota
const KPIS = [
  { label: 'Carga útil', unit: 'kg', cls: 'k1', get: (f: Record<string, string>) => num(f['CARGA UTIL']) },
  { label: 'Peso bruto', unit: 'kg', cls: 'k2', get: (f: Record<string, string>) => num(f['PESO BRUTO']) },
  { label: 'Tanque', unit: 'gal', cls: '', get: (f: Record<string, string>) => tanks(f) },
  { label: 'Llantas', unit: '', cls: '', get: (f: Record<string, string>) => num(f.LLANTAS) },
];

function leerUltima(): string | null {
  try { return localStorage.getItem(CLAVE_ULTIMA); } catch { return null; }
}
function guardarUltima(placa: string) {
  try { localStorage.setItem(CLAVE_ULTIMA, placa); } catch { /* sin almacenamiento: no pasa nada */ }
}

function Svg({ size = 16, sw = 2, children }: { size?: number; sw?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONO_CAMION = (
  <>
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </>
);
const ICONO_CAJA = <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />;

/* ---------- Visor: error de renderizado (cae al bloque .fail, con Reintentar) ---------- */
class VisorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    console.error('Visor 3D:', err);
  }
  render() {
    if (this.state.error !== null) {
      return (
        <section className="f3d-card viewer" aria-label="Unidad en 3D">
          <div className="fail" role="alert">
            <b>No se pudo mostrar la flota en 3D</b>
            <p>Detalle: {this.state.error}</p>
            <button type="button" className="pill primary" onClick={() => this.setState({ error: null })}>Reintentar</button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

/* ---------- Visor 3D: escena, herramientas, tarjeta de pieza y vistas ---------- */
interface VisorProps {
  unidad: Unidad;
  res: Resuelta;
  oscuro: boolean;
  parte: Parte | null;
  capa: HTMLElement | null;
  escenaRef: { current: Escena3D | null };
  onSeleccion: (p: Parte | null) => void;
  onModelo: (m: Modelo | null) => void;
  onPaso: (d: number) => void;
}

interface PopEstado { nombre: 'views' | 'paint'; cx: number; bottom: number }

function VisorTresD({ unidad, res, oscuro, parte, capa, escenaRef, onSeleccion, onModelo, onPaso }: VisorProps) {
  const visorRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const popVRef = useRef<HTMLDivElement>(null);
  const popPRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onSeleccion, onModelo, oscuro });
  const ultimo = useRef({ u: unidad, r: res });

  const [intento, setIntento] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [est, setEst] = useState<Record<Toggle, boolean> | null>(null);
  const [frio, setFrio] = useState(false);
  const [pintura, setPintura] = useState<number | null>(null);
  const [modeloVis, setModeloVis] = useState<Modelo | null>(null);
  const [pop, setPop] = useState<PopEstado | null>(null);

  const esCarreta = res.M.kind === 'trailer';
  const colores = useMemo(() => colorsOf(unidad.f.COLOR), [unidad.f.COLOR]);
  const subLinea = [unidad.f.TIPO, res.body, unidad.f.CONFIGURACION || res.cfg, unidad.f.ANO].filter(Boolean).join(' · ');

  // Referencias al último valor (los callbacks de la escena siempre usan lo más nuevo)
  useEffect(() => {
    cbRef.current = { onSeleccion, onModelo, oscuro };
    ultimo.current = { u: unidad, r: res };
  });

  const sincronizar = () => {
    const e = escenaRef.current;
    if (e) setEst(e.estadoToggles());
  };

  // Carga la unidad en la escena. Con conFrio se reconstruye el equipo de frío (no es un toggle de la escena).
  const montar = (e: Escena3D, u: Unidad, r: Resuelta, conFrio: boolean, paint: number | null, instantanea: boolean) => {
    const livery = colorsOf(u.f.COLOR);
    const M = e.cargar(r.M, { plate: u.plate.slice(0, 10), livery, reefer: conFrio, trailerCfg: r.cfg || 'S3' }, instantanea);
    const hex = paint != null ? paint : (livery.length > 0 ? livery[0] : r.M.paint);
    e.pintar(hex);
    setPintura(hex);
    setFrio(conFrio);
    setModeloVis(M);
    cbRef.current.onModelo(M);
    cbRef.current.onSeleccion(null);
    setPop(null);
    e.layout();
    sincronizar();
  };

  // Crear la escena (import diferido). Si falla WebGL o el import, se muestra el bloque .fail
  useEffect(() => {
    const cv = canvasRef.current, vis = visorRef.current, cab = headRef.current, bar = dockRef.current;
    if (!cv || !vis || !cab || !bar) return;
    let vivo = true;
    const local: { e: Escena3D | null } = { e: null };
    setFallo(null);
    import('./escena3d').then(mod => {
      if (!vivo) return;
      const e = new mod.Escena3D(cv, vis, { cabecera: cab, barra: bar }, {
        onHover: (nombre, x, y) => {
          const t = tipRef.current;
          if (!t) return;
          if (!nombre) { t.hidden = true; return; }
          t.textContent = nombre;
          t.style.left = x + 'px';
          t.style.top = y + 'px';
          t.hidden = false;
        },
        onSeleccion: p => {
          cbRef.current.onSeleccion(p);
          sincronizar();
        },
      });
      local.e = e;
      escenaRef.current = e;
      e.aplicarTema(cbRef.current.oscuro);
      montar(e, ultimo.current.u, ultimo.current.r, false, null, true);
    }).catch((err: unknown) => {
      if (!vivo) return;
      setFallo(err instanceof Error ? err.message : String(err));
    });
    return () => {
      vivo = false;
      if (local.e) local.e.destruir();
      if (escenaRef.current && escenaRef.current === local.e) escenaRef.current = null;
      cbRef.current.onModelo(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  // Cambio de unidad: la escena ya existe, se recarga
  useEffect(() => {
    const e = escenaRef.current;
    if (e) montar(e, ultimo.current.u, ultimo.current.r, false, null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidad.plate]);

  // Tema: se pasa a la escena al cambiar
  useEffect(() => {
    const e = escenaRef.current;
    if (e) e.aplicarTema(oscuro);
  }, [oscuro]);

  // Ventanas de vistas y pintura: cerrar al tocar fuera o con Escape
  useEffect(() => {
    if (!pop) return;
    const fuera = (ev: MouseEvent) => {
      // Element (no HTMLElement): los iconos son SVG y también cuentan como "dentro"
      const t = ev.target instanceof Element ? ev.target : null;
      if (t && (t.closest('.pop') || t.closest('[data-pop]'))) return;
      setPop(null);
    };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setPop(null); };
    document.addEventListener('click', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [pop]);

  // Posición de la ventana: centrada sobre su botón y dentro de la pantalla (como el archivo)
  useLayoutEffect(() => {
    if (!pop) return;
    const p = pop.nombre === 'views' ? popVRef.current : popPRef.current;
    if (!p) return;
    const pw = p.offsetWidth;
    p.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, pop.cx - pw / 2)) + 'px';
    p.style.bottom = pop.bottom + 'px';
  }, [pop]);

  const abrirPop = (nombre: 'views' | 'paint', btn: HTMLElement) => {
    if (pop && pop.nombre === nombre) { setPop(null); return; }
    const r = btn.getBoundingClientRect();
    setPop({ nombre, cx: r.left + r.width / 2, bottom: window.innerHeight - r.top + 10 });
  };

  const alternarHerr = (k: Toggle) => {
    const e = escenaRef.current;
    if (!e) return;
    e.alternar(k);
    sincronizar();
  };
  const irVista = (v: Vista) => {
    const e = escenaRef.current;
    if (!e) return;
    e.vista(v);
    sincronizar();
    setPop(null);
  };
  const pintar = (hex: number) => {
    const e = escenaRef.current;
    if (!e) return;
    e.pintar(hex);
    setPintura(hex);
  };
  const colorExcel = () => pintar(colores.length > 0 ? colores[0] : res.M.paint);
  const alternarFrio = () => {
    const e = escenaRef.current;
    if (!e) return;
    montar(e, unidad, res, !frio, pintura, false);
  };
  const restablecer = () => {
    const e = escenaRef.current;
    if (!e) return;
    e.restablecer();
    cbRef.current.onSeleccion(null);
    sincronizar();
  };
  const cerrarParte = () => {
    const e = escenaRef.current;
    if (!e) return;
    e.seleccionar(null);
    cbRef.current.onSeleccion(null);
    sincronizar();
  };

  const tieneVolquete = !!(modeloVis && modeloVis.tip);
  const etiquetaCabina = res.M.conv ? 'Capó' : 'Cabina';

  return (
    <>
      <section className="f3d-card viewer" ref={visorRef} aria-label="Unidad en 3D">
        <canvas ref={canvasRef} className="c3d" tabIndex={0}
          aria-label="Modelo 3D de la unidad. Arrastra para girar, rueda para acercar." />
        <div className="v-head" ref={headRef}>
          <span className="f3d-plate lg"><small>PERÚ</small><b>{unidad.plate}</b></span>
          <div className="txt">
            <h2>{tituloUnidad(unidad)}</h2>
            <p>{subLinea}</p>
            <span className={'f3d-badge' + (estaFueraDeUso(unidad) ? ' off' : '')}>{textoEstado(unidad)}</span>
          </div>
        </div>
        <p className="hint">Arrastra para girar · rueda para zoom<br />clic en una pieza para ver qué es</p>
        <button type="button" className="navb prev" onClick={() => onPaso(-1)} aria-label="Placa anterior">
          <Svg size={18} sw={2.4}><path d="m15 5-7 7 7 7" /></Svg>
        </button>
        <button type="button" className="navb next" onClick={() => onPaso(1)} aria-label="Placa siguiente">
          <Svg size={18} sw={2.4}><path d="m9 5 7 7-7 7" /></Svg>
        </button>
        {parte && (
          <div className="f3d-card part-card" role="status">
            <div><h3>{parte.name}</h3><p>{parte.desc}</p></div>
            <button type="button" onClick={cerrarParte}>Cerrar</button>
          </div>
        )}
        <div className="f3d-dock" ref={dockRef} role="toolbar" aria-label="Herramientas del modelo">
          <button type="button" className="tool" data-pop="views" aria-expanded={!!pop && pop.nombre === 'views'}
            title="Vistas" onClick={ev => abrirPop('views', ev.currentTarget)}>
            <Svg><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
            <span className="lbl">Vistas</span>
          </button>
          <button type="button" className="tool" data-pop="paint" aria-expanded={!!pop && pop.nombre === 'paint'}
            title="Pintura" onClick={ev => abrirPop('paint', ev.currentTarget)}>
            <Svg><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.3" fill="currentColor" /><circle cx="12" cy="7.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="10" r="1.3" fill="currentColor" /></Svg>
            <span className="lbl">Pintura</span>
          </button>
          <span className="sep" />
          <button type="button" className="tool" aria-pressed={!!est && est.explode} title="Despiece"
            onClick={() => alternarHerr('explode')}>
            <Svg><path d="m12 2 8 4.5v9L12 20l-8-4.5v-9z" /><path d="M12 11v9M12 11l8-4.5M12 11 4 6.5" /></Svg>
            <span className="lbl">Despiece</span>
          </button>
          <button type="button" className="tool" aria-pressed={!!est && est.tilt} title={etiquetaCabina} hidden={esCarreta}
            onClick={() => alternarHerr('tilt')}>
            <Svg><path d="M3 20h18M6 20v-6l3-8h7l2 8v6M8 12h10" /></Svg>
            <span className="lbl">{etiquetaCabina}</span>
          </button>
          <button type="button" className="tool" aria-pressed={!!est && est.doors} title="Puertas" hidden={esCarreta}
            onClick={() => alternarHerr('doors')}>
            <Svg><path d="M5 21V3h10v18M15 4l5 2v15l-5-1" /></Svg>
            <span className="lbl">Puertas</span>
          </button>
          <button type="button" className="tool" aria-pressed={!!est && est.xray} title="Rayos X" hidden={esCarreta}
            onClick={() => alternarHerr('xray')}>
            <Svg><rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 2.4" /></Svg>
            <span className="lbl">Rayos X</span>
          </button>
          <button type="button" className="tool" aria-pressed={!!est && est.tip} title="Volquete" hidden={!tieneVolquete}
            onClick={() => alternarHerr('tip')}>
            <Svg><path d="M3 18h18M6 18l2-9 12-4v9z" /></Svg>
            <span className="lbl">Volquete</span>
          </button>
          <button type="button" className="tool" aria-pressed={frio} title="Frío" hidden={res.M.kind !== 'box'}
            onClick={alternarFrio}>
            <Svg><path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" /></Svg>
            <span className="lbl">Frío</span>
          </button>
          <span className="sep" />
          <button type="button" className="tool" aria-pressed={!!est && est.rotate} title="Girar 360°"
            onClick={() => alternarHerr('rotate')}>
            <Svg sw={2.2}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></Svg>
            <span className="lbl">Girar 360°</span>
          </button>
          <button type="button" className="tool" aria-label="Restablecer vista" onClick={restablecer}>
            <Svg sw={2.2}><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" /></Svg>
            <span className="lbl">Restablecer</span>
          </button>
        </div>
        {fallo !== null && (
          <div className="fail" role="alert">
            <b>No se pudo mostrar la flota en 3D</b>
            <p>Detalle: {fallo}</p>
            <button type="button" className="pill primary" onClick={() => setIntento(n => n + 1)}>Reintentar</button>
          </div>
        )}
      </section>
      {capa && createPortal(
        <>
          <div className="pop" ref={popVRef} hidden={!pop || pop.nombre !== 'views'}>
            <h4>Vistas</h4>
            <div className="views">
              {VISTAS.map(([v, nombre]) => (
                <button key={v} type="button" disabled={esCarreta && (v === 'engine' || v === 'inside')}
                  onClick={() => irVista(v)}>{nombre}</button>
              ))}
            </div>
          </div>
          <div className="pop" ref={popPRef} hidden={!pop || pop.nombre !== 'paint'}>
            <h4>Color principal</h4>
            <div className="swatches">
              {COLORES.map(([nombre, hex]) => (
                <button key={hex} type="button" className="swatch" title={nombre} aria-label={'Pintar de ' + nombre.toLowerCase()}
                  aria-pressed={pintura === hex} style={{ background: hexCss(hex) }} onClick={() => pintar(hex)} />
              ))}
            </div>
            <button type="button" className="link" onClick={colorExcel}>Usar los colores del Excel</button>
          </div>
          <div className="tip" ref={tipRef} hidden />
        </>,
        capa,
      )}
    </>
  );
}

/* ---------- Ficha: grupos de datos ---------- */
function Grupo({ titulo, claves, f, extra }: { titulo: string; claves: string[]; f: Record<string, string>; extra?: ReactNode }) {
  const filas = claves.filter(k => !!f[k]);
  if (!filas.length && !extra) return null;
  return (
    <section className="grp">
      <h3>{titulo}</h3>
      <dl>
        {filas.map(k => {
          const n = UNIDADES[k] ? num(f[k]) : null;
          return (
            <Fragment key={k}>
              <dt>{etiquetaCampo(k)}</dt>
              <dd className={MONO.has(k) ? 'mono' : undefined}>
                {k === 'COLOR' && colorsOf(f[k]).map((h, i) => <i key={i} style={{ background: hexCss(h) }} />)}
                {n != null ? fmt(n) + ' ' + UNIDADES[k] : f[k]}
              </dd>
            </Fragment>
          );
        })}
        {extra}
      </dl>
    </section>
  );
}

/* ---------- Vista 3D: tercera vista de Placas (lista | visor | especificaciones) ---------- */
interface Vista3DProps {
  /** Placas filtradas: lo que muestra la lista (el buscador y los filtros son los de la página) */
  placas: Placa[];
  /** Toda la flota: las barras de los indicadores son proporcionales al máximo de la flota */
  todas: Placa[];
  cargando: boolean;
  /** Valor crudo de ?placa= ('' si no hay) */
  placaParam: string;
  /** Elige una placa (o null para volver a la lista en celular). reemplazar = no añade historial */
  onElegir: (placa: string | null, reemplazar: boolean) => void;
  /** Avisa a la página cuando el detalle del celular está abierto (para ocultar su encabezado) */
  onDetalle: (abierto: boolean) => void;
}

// Debajo de este ancho del contenedor (no de la ventana) la vista pasa a dos pantallas, como en celular
const ANCHO_CELULAR = 700;

export function Vista3D({ placas, todas, cargando, placaParam, onElegir, onDetalle }: Vista3DProps) {
  const toast = useToast();
  const { oscuro } = useOscuro();
  const rootRef = useRef<HTMLDivElement>(null);
  const [capa, setCapa] = useState<HTMLDivElement | null>(null);
  const escenaRef = useRef<Escena3D | null>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const pasoRef = useRef<(d: number) => void>(() => undefined);

  const [ancho, setAncho] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const [tab, setTab] = useState<'ficha' | 'piezas'>('ficha');
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [parte, setParte] = useState<Parte | null>(null);

  const placaPedida = norm(placaParam).replace(/ /g, '');
  const estrecho = ancho < ANCHO_CELULAR;
  // Celular: la lista es la pantalla principal; con ?placa= se abre el detalle
  const detalle = estrecho && placaPedida !== '';

  // El ancho del contenedor manda (el menú lateral ocupa espacio), no el de la ventana
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setAncho(el.clientWidth || window.innerWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth || window.innerWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onDetalle(detalle);
  }, [detalle, onDetalle]);
  useEffect(() => () => onDetalle(false), [onDetalle]);

  // Al abrir el detalle (celular) se empieza arriba del todo: sube el contenedor y todo lo que lo envuelve
  useEffect(() => {
    if (!detalle) return;
    let el: HTMLElement | null = rootRef.current;
    while (el) { if (el.scrollTop > 0) el.scrollTop = 0; el = el.parentElement; }
    window.scrollTo(0, 0);
  }, [detalle]);

  const dTodas = useMemo(() => unidadesDe(todas), [todas]);
  const dVista = useMemo(() => unidadesDe(placas), [placas]);
  const filas = dVista.rows;
  const maximos = useMemo(
    () => KPIS.map(k => dTodas.rows.reduce((m, u) => Math.max(m, k.get(u.f) || 0), 0) || 1),
    [dTodas.rows],
  );

  // Unidad elegida: la de ?placa=, si no la última vista, si no la primera de la lista
  const unidad: Unidad | null = useMemo(() => {
    const porParam = placaPedida ? dTodas.rows.find(r => r.plate === placaPedida) : undefined;
    if (porParam) return porParam;
    if (!filas.length) return null;
    const ult = leerUltima();
    const porUlt = ult ? filas.find(r => r.plate === ult) : undefined;
    return porUlt || filas[0];
  }, [dTodas.rows, filas, placaPedida]);
  const res = useMemo(() => (unidad ? resolverModelo(unidad) : null), [unidad]);
  const plateActual = unidad ? unidad.plate : '';

  useEffect(() => { if (unidad) guardarUltima(unidad.plate); }, [unidad]);

  // ?placa= que no existe: aviso (una vez por valor)
  useEffect(() => {
    if (placaPedida && dTodas.rows.length && !dTodas.rows.some(r => r.plate === placaPedida)) {
      toast('La placa ' + placaPedida + ' no está en las placas registradas', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placaPedida, dTodas.rows]);

  const elegir = (u: Unidad) => { if (placaPedida !== u.plate) onElegir(u.plate, !estrecho); };

  const paso = (d: number) => {
    const lista = filas.length ? filas : dTodas.rows;
    const n = lista.length;
    if (!n) return;
    const i = unidad ? lista.findIndex(r => r.plate === unidad.plate) : -1;
    onElegir(lista[i < 0 ? 0 : (i + d + n) % n].plate, true);
  };
  useEffect(() => { pasoRef.current = paso; });

  // Teclado: flechas para cambiar de placa (no mientras se escribe en un campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); pasoRef.current(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); pasoRef.current(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // La placa elegida queda visible en la lista
  useEffect(() => {
    const ul = listaRef.current;
    if (!ul || !plateActual) return;
    const el = ul.querySelector<HTMLElement>('[data-plate="' + plateActual + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [plateActual, detalle, filas]);

  const onPaso = (d: number) => pasoRef.current(d);

  const usados = new Set<string>(['PLACA']);
  GRUPOS.forEach(([, ks]) => ks.forEach(k => usados.add(k)));

  return (
    <div className="flota3d" ref={rootRef}>
      <div className={'f3d-main' + (detalle ? ' f3d-main--detalle' : '')}>
        <div className="f3d-top">
          <button type="button" className="pill back" onClick={() => onElegir(null, true)} aria-label="Volver a la lista de placas">
            <Svg size={16} sw={2.4}><path d="m15 5-7 7 7 7" /></Svg>Placas
          </button>
        </div>

        <aside className="f3d-card f3d-list" aria-label="Placas">
          <p className="count">
            {cargando
              ? 'Cargando unidades…'
              : filas.length + (filas.length === 1 ? ' unidad' : ' unidades') +
                (dVista.omitidas ? ' · ' + dVista.omitidas + ' filas sin tipo ni marca no se muestran' : '')}
          </p>
          <ul className="plates" role="listbox" aria-label="Lista de placas" ref={listaRef}>
            {filas.map(u => {
              const on = u.plate === plateActual;
              return (
                <li key={u.plate}>
                  <button type="button" className="f3d-row" role="option" aria-selected={on} data-plate={u.plate}
                    onClick={() => elegir(u)}>
                    <span className="top">
                      <span className="f3d-plate sm"><small>PERÚ</small><b>{u.plate}</b></span>
                      <span className={'f3d-badge' + (estaFueraDeUso(u) ? ' off' : '')}>{textoEstado(u)}</span>
                    </span>
                    <span className="t">{tituloUnidad(u)}</span>
                    <span className="mt">
                      <Svg size={14}>{u.cat === 'T' || u.cat === 'C' ? ICONO_CAMION : ICONO_CAJA}</Svg>
                      {[u.f.TIPO, u.f.CONFIGURACION, u.f.ANO].filter(Boolean).join(' · ')}
                      <span className="dots" title={u.f.COLOR || undefined}>
                        {colorsOf(u.f.COLOR).slice(0, 4).map((h, i) => <i key={i} style={{ background: hexCss(h) }} />)}
                      </span>
                    </span>
                    <span className="cl">{u.f.CLIENTE || 'Sin cliente'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <VisorBoundary>
          {unidad && res ? (
            <VisorTresD
              unidad={unidad} res={res} oscuro={oscuro} parte={parte} capa={capa}
              escenaRef={escenaRef} onSeleccion={setParte} onModelo={setModelo} onPaso={onPaso}
            />
          ) : (
            <section className="f3d-card viewer" aria-label="Unidad en 3D">
              {!cargando && <p className="hint">Sin unidades para mostrar</p>}
            </section>
          )}
        </VisorBoundary>

        <aside className="f3d-card spec" aria-label="Especificaciones">
          <h2>Especificaciones</h2>
          {unidad && res && (
            <>
              <div className="kpis">
                {KPIS.map((k, j) => {
                  const v = k.get(unidad.f);
                  return (
                    <div key={k.label} className={'kpi ' + k.cls}>
                      <b>{v == null ? '—' : fmt(v)}{v != null && k.unit ? <small>{k.unit}</small> : null}</b>
                      <span>{k.label}</span>
                      <div className="bar"><i style={{ width: (v ? Math.min(100, v / maximos[j] * 100) : 0) + '%' }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="motor">
                <Svg size={16}><path d="M4 10h3l2-3h6v3h3v2h2v4h-2v2h-3l-2 2H8l-2-2H4z" /></Svg>
                <span>Motor</span>
                <b>{unidad.f['MODELO MOTOR'] || (norm(unidad.f.MOTORA) === 'NO MOTORA' ? 'No motora' : '—')}</b>
              </div>
              <div className="seg" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'ficha'} onClick={() => setTab('ficha')}>Ficha</button>
                <button type="button" role="tab" aria-selected={tab === 'piezas'} onClick={() => setTab('piezas')}>Componentes</button>
              </div>
              <div className="tab-body" hidden={tab !== 'ficha'}>
                {GRUPOS.map(([titulo, claves]) => {
                  const nTanques = ['TANQUE 1', 'TANQUE 2', 'TANQUE 3'].filter(k => num(unidad.f[k]) != null).length;
                  const extra = titulo === 'Motor y combustible' && nTanques > 1
                    ? <><dt>Total tanques</dt><dd>{fmt(tanks(unidad.f))} gal</dd></>
                    : null;
                  return <Grupo key={titulo} titulo={titulo} claves={claves} f={unidad.f} extra={extra} />;
                })}
                <Grupo titulo="Otros datos" claves={Object.keys(unidad.f).filter(k => !usados.has(k))} f={unidad.f} />
                <div className="ref">
                  <b>Modelo 3D: </b>{res.ref}. Representación genérica pintada con los colores registrados.
                  {res.notes.length > 0 && <ul>{res.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                </div>
              </div>
              <div className="tab-body" hidden={tab !== 'piezas'}>
                <ul className="parts">
                  {modelo && modelo.parts.map((p, i) => (
                    <li key={p.id}>
                      <button type="button" aria-current={!!parte && parte.id === p.id}
                        onClick={() => { const e = escenaRef.current; if (e) e.seleccionar(p, true); }}>
                        <span>{String(i + 1).padStart(2, '0')}</span>{p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>
      </div>
      <div ref={setCapa} style={{ display: 'contents' }} />
    </div>
  );
}
