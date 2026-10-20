import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapaTv, type CapaMapa } from './MapaTv';
import type { BacklogTv, FallaTv, Feed, OtTv, RampaTv, Unidad } from './tipos';

// Centro de Control para TV. Escenario fijo de 1920×1080 que se escala para caber ENTERO en cualquier pantalla
// (1080p, 4K, ultra ancha): nada se corta. Las tablas se paginan solas, así que siempre se ve todo.
const BUILD = 2026102001;
const ANCHO = 1920, ALTO = 1080;
const FILAS = 10;         // filas por página en tablas
const UNIDADES = 6;       // unidades por página en la lista del mapa
const CARRUSEL_MS = 30000, PAGINA_MS = 10000, INACTIVO_MS = 20000;

const VISTAS = [
  { id: 'gps', nombre: 'Flota GPS', tecla: '1' }, { id: 'ot', nombre: 'Órdenes', tecla: '2' },
  { id: 'backlog', nombre: 'Backlog', tecla: '3' }, { id: 'fallas', nombre: 'Fallas', tecla: '4' }, { id: 'rampas', nombre: 'Rampas', tecla: '5' },
] as const;
type VistaId = typeof VISTAS[number]['id'];
const ESCALAS = [{ k: 1, nombre: 'Pantalla completa' }, { k: 0.96, nombre: 'Margen seguro' }, { k: 0.92, nombre: 'Margen amplio' }, { k: 0.88, nombre: 'Margen máximo' }];
const FILTROS = [{ id: 'todas', nombre: 'Todas' }, { id: 'mov', nombre: 'En movimiento' }, { id: 'det', nombre: 'Detenidas' }, { id: 'ral', nombre: 'Ralentí' }] as const;
type FiltroId = typeof FILTROS[number]['id'];

const guardado = (clave: string, defecto: string) => { try { return localStorage.getItem(clave) ?? defecto; } catch { return defecto; } };
const guardar = (clave: string, v: string) => { try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ } };

/** dd/mm/aaaa: las fechas sin hora se leen tal cual; las que traen hora se convierten a Lima */
function fechaPe(v?: string | null): string {
  if (!v) return '—';
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00:00(?:\.000)?Z?)?$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  try { return d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }); } catch { return d.toLocaleDateString('es-PE'); }
}
// Texto legible: lo que viene TODO en mayúsculas pasa a minúsculas con la inicial de cada frase en mayúscula (siglas conocidas se respetan)
const SIGLAS = new Set(['ECM', 'ABS', 'GPS', 'OT', 'DNI', 'RUC', 'KM', 'SAC', 'SA', 'EGR', 'DPF', 'SCR', 'DAP', 'RPM', 'USB', 'LED', 'GLP', 'GNV', 'SOAT', 'TIVE', 'MTC', 'CAN', 'PTO', 'AC', 'ATF', 'BDA', 'GPS']);
export function legible(v: unknown): string {
  const t = String(v ?? '').trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (!letras) return t;
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length;
  if (mayus / letras.length < 0.6) return t; // ya viene en mayúsculas y minúsculas
  return t.toLowerCase()
    .replace(/(^|[.:;•\n]\s*|\d+\.\s*)([a-záéíóúñ])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/[a-záéíóúñ0-9]+/g, w => (SIGLAS.has(w.toUpperCase()) ? w.toUpperCase() : w));
}
// Nombres de personas: "AARON TORRE PALOMINO" → "Aaron Torre Palomino"
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von']);
export function nombre(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t || /^\d+$/.test(t)) return t;
  return t.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}
const listaNombres = (v?: string[]) => (v && v.length ? v.map(nombre).join(', ') : '—');
const txt = (v: unknown, d = '—') => (v == null || String(v).trim() === '' || String(v).trim() === '-' ? d : String(v).trim());
const num = (v?: number) => (v ?? 0).toLocaleString('es-PE');

function useFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [fallo, setFallo] = useState(false);
  const [ultima, setUltima] = useState<Date | null>(null);
  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/tv/feed');
      const j = (await r.json()) as Feed;
      if (j && j.ok) { setFeed(j); setUltima(new Date()); setFallo(false); } else setFallo(true);
    } catch { setFallo(true); }
  }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar(); }, 6000);
    const v = () => { if (!document.hidden) cargar(); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [cargar]);
  return { feed, fallo, ultima };
}

function useReloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t); }, []);
  const f = (o: Intl.DateTimeFormatOptions) => { try { return ahora.toLocaleString('es-PE', { timeZone: 'America/Lima', ...o }); } catch { return ahora.toLocaleString('es-PE', o); } };
  return { hora: f({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), fecha: f({ weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase() };
}

function Etiqueta({ tono, children }: { tono: 'verde' | 'ambar' | 'rojo' | 'azul' | 'morado' | 'gris'; children: ReactNode }) {
  return <span className={`tv-etiqueta tv-etiqueta--${tono}`}>{children}</span>;
}

function Cifras({ items }: { items: Array<{ etiqueta: string; valor: number | string; tono: string }> }) {
  return (
    <div className="tv-cifras">
      {items.map(i => (
        <div key={i.etiqueta} className={`tv-cifra tv-cifra--${i.tono}`}>
          <span className="tv-cifra__valor">{i.valor}</span>
          <span className="tv-cifra__etiqueta">{i.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

interface Columna<T> { titulo: string; ancho: number; celda: (f: T) => ReactNode; clase?: string }
function Tabla<T>({ titulo, icono, columnas, filas, sel, vacio }: { titulo: string; icono: string; columnas: Array<Columna<T>>; filas: T[]; sel: number; vacio: string }) {
  const paginas = Math.max(1, Math.ceil(filas.length / FILAS));
  const pagina = Math.min(paginas - 1, Math.floor(sel / FILAS));
  const visibles = filas.slice(pagina * FILAS, pagina * FILAS + FILAS);
  return (
    <div className="tv-tarjeta tv-tabla">
      <div className="tv-tabla__cab"><span className="tv-tabla__icono">{icono}</span><h2>{titulo}</h2><span className="tv-tabla__pagina">{filas.length} registros · página {pagina + 1} de {paginas}</span></div>
      <div className="tv-fila tv-fila--cab">{columnas.map(c => <span key={c.titulo} style={{ flex: `${c.ancho} 1 0` }}>{c.titulo}</span>)}</div>
      <div className="tv-tabla__cuerpo">
        {visibles.map((f, i) => (
          <div key={pagina * FILAS + i} className={`tv-fila${pagina * FILAS + i === sel ? ' tv-fila--sel' : ''}`}>
            {columnas.map(c => <span key={c.titulo} className={(c.clase ?? '').replace('tv-dos', '').trim() || undefined} style={{ flex: `${c.ancho} 1 0` }}><span className={c.clase && c.clase.includes('tv-dos') ? 'tv-dos' : undefined}>{c.celda(f)}</span></span>)}
          </div>
        ))}
        {!filas.length && <div className="tv-vacio">{vacio}</div>}
      </div>
      <div className="tv-puntos">{Array.from({ length: paginas }, (_, i) => <i key={i} className={i === pagina ? 'tv-punto tv-punto--on' : 'tv-punto'} />)}</div>
    </div>
  );
}

export function TvApp() {
  const { feed, fallo, ultima } = useFeed();
  const { hora, fecha } = useReloj();
  const [vista, setVista] = useState<VistaId>('gps');
  const [sel, setSel] = useState<Record<VistaId, number>>({ gps: 0, ot: 0, backlog: 0, fallas: 0, rampas: 0 });
  const [filtro, setFiltro] = useState<FiltroId>('todas');
  const [enfoque, setEnfoque] = useState<string | null>(null);
  const [capa, setCapa] = useState<CapaMapa>('calle');
  const [carrusel, setCarrusel] = useState(false);
  const [escala, setEscala] = useState(() => Math.max(0, ESCALAS.findIndex(e => String(e.k) === guardado('tv_escala', '0.96'))));
  const [tema, setTema] = useState(guardado('tv_tema', 'claro'));
  const [aviso, setAviso] = useState<{ id: number; texto: string; tecla: string } | null>(null);
  const [ventana, setVentana] = useState({ w: window.innerWidth, h: window.innerHeight });
  const ultimaTecla = useRef(Date.now());

  // Escenario: se escala para caber entero
  useEffect(() => {
    const f = () => setVentana({ w: document.documentElement.clientWidth || window.innerWidth, h: document.documentElement.clientHeight || window.innerHeight });
    f(); window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const k = Math.min(ventana.w / ANCHO, ventana.h / ALTO) * ESCALAS[escala].k;
  const izq = (ventana.w - ANCHO * k) / 2, arr = (ventana.h - ALTO * k) / 2;

  const mostrar = useCallback((texto: string, tecla: string) => {
    const id = Date.now();
    setAviso({ id, texto, tecla });
    setTimeout(() => setAviso(a => (a && a.id === id ? null : a)), 1800);
  }, []);

  // ── Listas ──
  const unidades = useMemo(() => (feed?.gps.unidades ?? []).filter(u => {
    const v = u.velocidad ?? 0;
    return filtro === 'todas' || (filtro === 'mov' && v > 3) || (filtro === 'det' && v <= 3) || (filtro === 'ral' && u.estado_motor === 'ralenti');
  }), [feed, filtro]);
  const ots = useMemo(() => (feed?.ots.list ?? []).filter(o => String(o.estado ?? '').toLowerCase().includes('proceso')), [feed]);
  const backlog = useMemo(() => (feed?.backlog.list ?? []).filter(b => !/realiz|cerrad|finaliz/.test(String(b.estado ?? 'Pendiente').toLowerCase())), [feed]);
  const fallas = feed?.fallas.list ?? [];
  const rampas = feed?.rampas.list ?? [];
  const largo: Record<VistaId, number> = { gps: unidades.length, ot: ots.length, backlog: backlog.length, fallas: fallas.length, rampas: rampas.length };
  const tam: Record<VistaId, number> = { gps: UNIDADES, ot: FILAS, backlog: FILAS, fallas: FILAS, rampas: FILAS };

  const irA = useCallback((v: VistaId) => { setVista(v); }, []);
  const mover = useCallback((delta: number) => {
    setSel(s => {
      const n = largo[vista];
      if (!n) return s;
      const siguiente = Math.max(0, Math.min(n - 1, s[vista] + delta));
      return { ...s, [vista]: siguiente };
    });
  }, [vista, largo]);

  // Cuando cambia la lista, la selección no se sale
  useEffect(() => {
    setSel(s => {
      const nuevo = { ...s };
      (Object.keys(nuevo) as VistaId[]).forEach(v => { nuevo[v] = Math.min(nuevo[v], Math.max(0, largo[v] - 1)); });
      return nuevo;
    });
  }, [largo.gps, largo.ot, largo.backlog, largo.fallas, largo.rampas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pase de páginas automático (sin control remoto, para que todo se vea): cada 10 s si nadie toca nada
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - ultimaTecla.current < INACTIVO_MS) return;
      setSel(s => {
        const n = largo[vista], p = tam[vista];
        if (n <= p) return s;
        const pagina = Math.floor(s[vista] / p);
        const sig = (pagina + 1) * p >= n ? 0 : (pagina + 1) * p;
        return { ...s, [vista]: sig };
      });
    }, PAGINA_MS);
    return () => clearInterval(t);
  }, [vista, largo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrusel entre vistas
  useEffect(() => {
    if (!carrusel) return;
    const t = setInterval(() => setVista(v => VISTAS[(VISTAS.findIndex(x => x.id === v) + 1) % VISTAS.length].id), CARRUSEL_MS);
    return () => clearInterval(t);
  }, [carrusel]);

  // Actualización automática: si el servidor publica una versión mayor, la pantalla se recarga sola
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/tv/version?_t=' + Date.now());
        const j = await r.json();
        if (j && j.versionCode > BUILD) window.location.replace('/tv?_v=' + Date.now());
      } catch { /* sin red: se reintenta */ }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { guardar('tv_tema', tema); }, [tema]);

  // ── Control remoto (teclas 0-9, flechas, OK, Volver) ──
  const irPagina = useCallback((dir: number): boolean => {
    const n = largo[vista], p = tam[vista];
    const paginas = Math.max(1, Math.ceil(n / p));
    const actual = Math.min(paginas - 1, Math.floor(sel[vista] / p));
    const destino = actual + dir;
    if (destino < 0 || destino >= paginas) return false; // no hay más páginas hacia ese lado
    setSel(s => ({ ...s, [vista]: destino * p }));
    mostrar(`Página ${destino + 1} de ${paginas}`, dir > 0 ? '►' : '◄');
    return true;
  }, [vista, largo, sel, mostrar]); // eslint-disable-line react-hooks/exhaustive-deps
  const acciones = useRef({ irA, mover, vista, enfoque, unidades, sel, irPagina });
  acciones.current = { irA, mover, vista, enfoque, unidades, sel, irPagina };
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      ultimaTecla.current = Date.now();
      const a = acciones.current, key = e.key, code = e.keyCode || e.which;
      const es = (...t: string[]) => t.includes(key);
      const dig = (n: number) => key === String(n) || code === 48 + n || code === 96 + n;
      const consumir = () => e.preventDefault();

      for (let i = 1; i <= 5; i++) {
        if (dig(i)) {
          consumir();
          const id = VISTAS[i - 1].id;
          if (id === 'gps' && a.vista === 'gps') { // 1 otra vez: cambia el filtro de unidades
            setFiltro(f => { const n = FILTROS[(FILTROS.findIndex(x => x.id === f) + 1) % FILTROS.length]; mostrar(`Unidades: ${n.nombre}`, '1'); return n.id; });
            setEnfoque(null);
          } else { a.irA(id); mostrar(VISTAS[i - 1].nombre, String(i)); }
          return;
        }
      }
      if (dig(6) || es('c', 'C')) { consumir(); setCarrusel(c => { mostrar(c ? 'Carrusel apagado' : 'Carrusel: cambia cada 30 s', '6'); return !c; }); return; }
      if (dig(7) || es('m', 'M')) { consumir(); setEscala(i => { const n = (i + 1) % ESCALAS.length; guardar('tv_escala', String(ESCALAS[n].k)); mostrar(`Tamaño: ${ESCALAS[n].nombre}`, '7'); return n; }); return; }
      if (dig(8) || es('s', 'S')) { consumir(); setCapa(c => { const n = c === 'calle' ? 'satelite' : 'calle'; mostrar(n === 'satelite' ? 'Mapa satelital' : 'Mapa callejero', '8'); return n; }); return; }
      if (es('t', 'T')) { consumir(); setTema(t => { const n = t === 'claro' ? 'oscuro' : 'claro'; mostrar(`Tema ${n}`, 'T'); return n; }); return; }
      if (dig(9) || es('f', 'F')) {
        consumir();
        const d = document as Document & { webkitFullscreenElement?: Element };
        const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
        if (d.fullscreenElement || d.webkitFullscreenElement) document.exitFullscreen?.();
        else (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
        return;
      }
      if (dig(0) || es('r', 'R')) { consumir(); mostrar('Recargando…', '0'); setTimeout(() => window.location.replace('/tv?_v=' + Date.now()), 300); return; }
      const pos = VISTAS.findIndex(v => v.id === a.vista);
      if (es('ArrowRight') || code === 39) { consumir(); if (a.irPagina(1)) return; const v = VISTAS[(pos + 1) % VISTAS.length]; a.irA(v.id); mostrar(v.nombre, '►'); return; }
      if (es('ArrowLeft') || code === 37) { consumir(); if (a.irPagina(-1)) return; const v = VISTAS[(pos + VISTAS.length - 1) % VISTAS.length]; a.irA(v.id); mostrar(v.nombre, '◄'); return; }
      if (es('ArrowDown') || code === 40) { consumir(); a.mover(1); return; }
      if (es('ArrowUp') || code === 38) { consumir(); a.mover(-1); return; }
      if (es('PageDown') || code === 34) { consumir(); a.mover(5); return; }
      if (es('PageUp') || code === 33) { consumir(); a.mover(-5); return; }
      if (es('Home')) { consumir(); a.mover(-9999); return; }
      if (es('End')) { consumir(); a.mover(9999); return; }
      if (es('Enter') || code === 13) {
        consumir();
        if (a.vista === 'gps') { const u = a.unidades[a.sel.gps]; if (u) { setEnfoque(u.placa); mostrar(`Unidad ${u.placa}`, 'OK'); } }
        return;
      }
      if (es('Escape', 'Backspace') || [27, 8, 10009].includes(code)) setEnfoque(null);
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [mostrar]);

  // Mientras se mueve la selección en GPS con enfoque abierto, el enfoque la sigue
  const unidadSel: Unidad | undefined = unidades[sel.gps];
  useEffect(() => { if (enfoque && unidadSel) setEnfoque(unidadSel.placa); }, [sel.gps]); // eslint-disable-line react-hooks/exhaustive-deps
  const enfocada = enfoque ? unidades.find(u => u.placa === enfoque) : undefined;

  const kp = feed;
  const badges: Record<VistaId, number> = {
    gps: kp?.gps.kpis.total ?? 0, ot: kp?.ots.kpis.proceso ?? 0, backlog: kp?.backlog.kpis.pendiente ?? 0,
    fallas: kp?.fallas.kpis.total_activas ?? 0, rampas: kp?.rampas.kpis.total_activas ?? 0,
  };
  const enMovimiento = (feed?.gps.unidades ?? []).filter(u => (u.velocidad ?? 0) > 3);
  const [pista, setPista] = useState(0);
  useEffect(() => { const t = setInterval(() => setPista(p => p + 1), 8000); return () => clearInterval(t); }, []);
  const ticker = enMovimiento.length
    ? (() => { const u = enMovimiento[pista % enMovimiento.length]; return `Unidad ${u.placa} en ruta a ${Math.round(u.velocidad ?? 0)} km/h${u.empresa ? ` · ${u.empresa}` : ''}`; })()
    : feed ? 'Sin unidades en movimiento en este momento' : 'Conectando con la flota…';

  const pagina = Math.floor(sel.gps / UNIDADES);
  const lista = unidades.slice(pagina * UNIDADES, pagina * UNIDADES + UNIDADES);

  return (
    <div className="tv-raiz" data-tema={tema}>
      <div className="tv-escenario" style={{ left: izq, top: arr, transform: `scale(${k})` }}>
        <header className="tv-cabecera">
          <div className="tv-marca">
            <img className="tv-marca__logo" src="/api/tenant-logo" alt="" />
            <div>
              <div className="tv-marca__nombre">{feed?.empresa ?? 'Azkell Fleet'}<span className={`tv-vivo${fallo ? ' tv-vivo--caido' : ''}`}><i />{fallo ? 'SIN CONEXIÓN' : 'EN VIVO'}</span></div>
              <div className="tv-marca__sub">Centro de control</div>
            </div>
          </div>
          <nav className="tv-pestanas" aria-label="Vistas">
            {VISTAS.map(v => (
              <div key={v.id} className={`tv-pestana${vista === v.id ? ' tv-pestana--on' : ''}`}>
                <b>{v.tecla}</b><span>{v.nombre}</span><em>{badges[v.id]}</em>
              </div>
            ))}
          </nav>
          <div className="tv-reloj"><b>{hora}</b><span>{fecha}</span></div>
        </header>
        {carrusel && <div key={vista} className="tv-carrusel-barra" style={{ animationDuration: `${CARRUSEL_MS}ms` }} />}

        <main className="tv-principal">
          {vista === 'gps' && (
            <>
              <Cifras items={[
                { etiqueta: 'Flota monitoreada', valor: num(feed?.gps.kpis.total), tono: 'azul' }, { etiqueta: 'Con señal', valor: num(feed?.gps.kpis.con_senal), tono: 'verde' },
                { etiqueta: 'En movimiento', valor: num(feed?.gps.kpis.en_movimiento), tono: 'naranja' }, { etiqueta: 'Sin señal', valor: num(feed?.gps.kpis.sin_senal), tono: 'gris' },
              ]} />
              <div className="tv-gps">
                <div className="tv-tarjeta tv-gps__mapa">
                  <MapaTv unidades={unidades} enfoque={enfoque} capa={capa} ajuste={FILTROS.findIndex(f => f.id === filtro)} />
                  {enfocada && (
                    <div className="tv-telemetria">
                      <div className="tv-telemetria__placa">{enfocada.placa}</div>
                      <div className="tv-telemetria__modelo">{txt(enfocada.marca_modelo ?? enfocada.tipo_vehiculo, 'Unidad')}{enfocada.empresa ? ` · ${enfocada.empresa}` : ''}</div>
                      <dl>
                        <div><dt>Velocidad</dt><dd>{Math.round(enfocada.velocidad ?? 0)} km/h</dd></div>
                        <div><dt>Motor</dt><dd>{enfocada.ignicion ? 'Encendido' : 'Apagado'}</dd></div>
                        <div><dt>Kilometraje</dt><dd>{enfocada.km ? `${Number(enfocada.km).toLocaleString('es-PE')} km` : '—'}</dd></div>
                        <div><dt>Voltaje</dt><dd>{enfocada.voltaje ? `${enfocada.voltaje} V` : '—'}</dd></div>
                      </dl>
                    </div>
                  )}
                </div>
                <div className="tv-tarjeta tv-gps__lista">
                  <div className="tv-chips">{FILTROS.map(f => <span key={f.id} className={`tv-chip${filtro === f.id ? ' tv-chip--on' : ''}`}>{f.nombre}</span>)}</div>
                  <div className="tv-gps__titulo">{unidades.length} unidades · página {pagina + 1} de {Math.max(1, Math.ceil(unidades.length / UNIDADES))}</div>
                  {lista.map((u, i) => {
                    const v = Math.round(u.velocidad ?? 0), mov = v > 3, ral = u.estado_motor === 'ralenti';
                    return (
                      <div key={u.placa} className={`tv-unidad${pagina * UNIDADES + i === sel.gps ? ' tv-unidad--sel' : ''}`}>
                        <div className="tv-unidad__fila"><b>{u.placa || u.nombre_wialon}</b><Etiqueta tono={mov ? 'azul' : ral ? 'ambar' : 'verde'}>{mov ? `${v} km/h` : ral ? 'Ralentí' : 'Detenido'}</Etiqueta></div>
                        <div className="tv-unidad__fila tv-unidad__sub"><span>{txt(u.marca_modelo ?? u.tipo_vehiculo, 'Tracto')}</span><span>{u.km ? `${Number(u.km).toLocaleString('es-PE')} km` : ''}</span></div>
                      </div>
                    );
                  })}
                  {!lista.length && <div className="tv-vacio">No hay unidades con este filtro</div>}
                </div>
              </div>
            </>
          )}

          {vista === 'ot' && (
            <>
              <Cifras items={[
                { etiqueta: 'Órdenes totales', valor: num(feed?.ots.kpis.total), tono: 'azul' }, { etiqueta: 'En proceso', valor: num(feed?.ots.kpis.proceso), tono: 'ambar' },
                { etiqueta: 'Abiertas', valor: num(feed?.ots.kpis.abierto), tono: 'gris' }, { etiqueta: 'Finalizadas', valor: num(feed?.ots.kpis.finalizado), tono: 'verde' },
              ]} />
              <Tabla<OtTv> titulo="Órdenes de trabajo en proceso" icono="🛠" sel={sel.ot} filas={ots} vacio="No hay órdenes en proceso" columnas={[
                { titulo: 'OT', ancho: 1.05, clase: 'tv-mono tv-azul', celda: o => txt(o.id_ot) },
                { titulo: 'Placa', ancho: 0.95, clase: 'tv-mono', celda: o => txt(o.placa) },
                { titulo: 'Tipo', ancho: 1.35, clase: 'tv-dos', celda: o => `${legible(txt(o.tipo_ot, 'Correctivo'))}${o.sub_tipo ? ` · ${legible(o.sub_tipo)}` : ''}` },
                { titulo: 'Motivo', ancho: 3.1, clase: 'tv-dos', celda: o => legible(txt(o.motivo, 'Mantenimiento en taller')) },
                { titulo: 'Supervisor', ancho: 1.7, clase: 'tv-dos', celda: o => nombre(txt(o.supervisor, 'Taller central')) },
                { titulo: 'Técnicos', ancho: 1.7, clase: 'tv-dos', celda: o => listaNombres(o.tecnicos) },
                { titulo: 'Rampa', ancho: 1, clase: 'tv-dos', celda: o => legible(txt(o.rampa)) },
                { titulo: 'Ingreso', ancho: 1, celda: o => fechaPe(o.fecha_ingreso) },
              ]} />
            </>
          )}

          {vista === 'backlog' && (
            <>
              <Cifras items={[
                { etiqueta: 'Backlog total', valor: num(feed?.backlog.kpis.total), tono: 'azul' }, { etiqueta: 'Pendientes', valor: num(feed?.backlog.kpis.pendiente), tono: 'rojo' },
                { etiqueta: 'En proceso', valor: num(feed?.backlog.kpis.proceso), tono: 'ambar' }, { etiqueta: 'Realizados', valor: num(feed?.backlog.kpis.realizado), tono: 'verde' },
              ]} />
              <Tabla<BacklogTv> titulo="Backlog pendiente" icono="📋" sel={sel.backlog} filas={backlog} vacio="¡Excelente! No hay pendientes" columnas={[
                { titulo: 'Código', ancho: 1.1, clase: 'tv-mono tv-morado', celda: b => txt(b.backlog_id) },
                { titulo: 'Placa', ancho: 0.95, clase: 'tv-mono', celda: b => txt(b.placa) },
                { titulo: 'Tema', ancho: 1.5, celda: b => <Etiqueta tono="morado">{legible(txt(b.tema, 'Mantenimiento'))}</Etiqueta> },
                { titulo: 'Tarea', ancho: 3.3, clase: 'tv-dos', celda: b => legible(txt(b.tarea)) },
                { titulo: 'Km', ancho: 1, clase: 'tv-mono', celda: b => txt(b.km) },
                { titulo: 'Reportado por', ancho: 1.9, clase: 'tv-dos', celda: b => nombre(txt(b.reportado_por, 'Operaciones')) },
                { titulo: 'Ticket OT', ancho: 1.1, clase: 'tv-mono tv-azul', celda: b => txt(b.ticket_ot) },
                { titulo: 'Fecha', ancho: 1, celda: b => fechaPe(b.fecha_reporte) },
              ]} />
            </>
          )}

          {vista === 'fallas' && (
            <>
              <Cifras items={[
                { etiqueta: 'Fallas activas', valor: num(feed?.fallas.kpis.total_activas), tono: 'rojo' }, { etiqueta: 'Pendientes', valor: num(feed?.fallas.kpis.pendiente), tono: 'ambar' },
                { etiqueta: 'En proceso', valor: num(feed?.fallas.kpis.proceso), tono: 'azul' }, { etiqueta: 'Histórico', valor: num(feed?.fallas.kpis.total_historico), tono: 'gris' },
              ]} />
              <Tabla<FallaTv> titulo="Reporte de fallas" icono="⚠" sel={sel.fallas} filas={fallas} vacio="¡Excelente! No hay fallas pendientes" columnas={[
                { titulo: 'Folio', ancho: 1.3, clase: 'tv-mono tv-rojo', celda: f => txt(f.folio) },
                { titulo: 'Placa', ancho: 1, clase: 'tv-mono', celda: f => txt(f.placa) },
                { titulo: 'Conductor', ancho: 1.9, clase: 'tv-dos', celda: f => nombre(txt(f.conductor, 'No asignado')) },
                { titulo: 'Descripción de la falla', ancho: 5.2, clase: 'tv-dos', celda: f => legible(txt(f.descripcion)) },
                { titulo: 'Fecha', ancho: 1.1, celda: f => fechaPe(f.fecha) },
                { titulo: 'Estado', ancho: 1.1, celda: f => { const e = String(f.estado ?? 'Pendiente'); const l = e.toLowerCase(); return <Etiqueta tono={l.includes('pend') ? 'rojo' : l.includes('proc') ? 'ambar' : 'gris'}>{e}</Etiqueta>; } },
              ]} />
            </>
          )}

          {vista === 'rampas' && (
            <>
              <Cifras items={[
                { etiqueta: 'Unidades en taller', valor: num(feed?.rampas.kpis.total_activas), tono: 'azul' }, { etiqueta: 'Rampas ocupadas', valor: `${num(feed?.rampas.kpis.rampas_ocupadas)} / ${num(feed?.rampas.kpis.total_rampas ?? 8)}`, tono: 'ambar' },
                { etiqueta: 'Lavado y espera', valor: num(feed?.rampas.kpis.en_lavado_espera), tono: 'gris' }, { etiqueta: 'Rampas totales', valor: num(feed?.rampas.kpis.total_rampas ?? 8), tono: 'verde' },
              ]} />
              <Tabla<RampaTv> titulo="Status de rampa y zonas" icono="🔧" sel={sel.rampas} filas={rampas} vacio="No hay unidades en rampa" columnas={[
                { titulo: 'Zona / rampa', ancho: 1.55, celda: r => <Etiqueta tono={r.tipo_zona === 'lavado' ? 'azul' : r.tipo_zona === 'espera' ? 'ambar' : r.tipo_zona === 'taller' ? 'morado' : r.tipo_zona === 'auxilio' ? 'rojo' : 'verde'}>{legible(txt(r.rampa, 'Rampa general'))}</Etiqueta> },
                { titulo: 'Placa', ancho: 0.95, clase: 'tv-mono', celda: r => txt(r.placa) },
                { titulo: 'Ingreso', ancho: 0.9, clase: 'tv-mono', celda: r => (r.hora_ingreso && r.hora_ingreso !== '-' ? `${r.hora_ingreso} h` : '—') },
                { titulo: 'Salida estimada', ancho: 1.1, clase: 'tv-mono tv-azul tv-fuerte', celda: r => (r.hora_salida && r.hora_salida !== '-' ? `${r.hora_salida} h` : 'Por definir') },
                { titulo: 'Trabajos en ejecución', ancho: 3.6, clase: 'tv-dos', celda: r => legible(txt(r.trabajo)) },
                { titulo: 'Técnicos', ancho: 1.7, clase: 'tv-dos', celda: r => listaNombres(r.tecnicos) },
                { titulo: 'Km', ancho: 1, clase: 'tv-mono', celda: r => txt(r.km) },
                { titulo: 'Situación', ancho: 1.5, celda: r => <Etiqueta tono="verde">{legible(txt(r.situacion, 'En atención'))}</Etiqueta> },
              ]} />
            </>
          )}
        </main>

        <footer className="tv-pie">
          <div className="tv-pie__texto">{ticker}{ultima ? <span> · actualizado {ultima.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> : null}</div>
          <div className="tv-teclas">
            <span><b>1-5</b> Vistas</span><span><b>◄ ►</b> Páginas</span><span><b>6</b> {carrusel ? 'Carrusel ON' : 'Carrusel'}</span><span><b>7</b> Tamaño</span>
            <span><b>8</b> Mapa</span><span><b>T</b> Tema</span><span><b>9</b> Pantalla completa</span><span><b>0</b> Recargar</span>
          </div>
        </footer>

        {aviso && <div className="tv-aviso" key={aviso.id}><b>{aviso.tecla}</b><span>{aviso.texto}</span></div>}
      </div>
    </div>
  );
}
