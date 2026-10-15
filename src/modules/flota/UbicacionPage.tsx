import './flota.css';
import '../mantenimiento/mant.css';
import './disponibilidad.css';
import './ubicacion.css';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Briefcase, MapPin, MessageCircle, Navigation, RefreshCw, Truck, Wrench, X } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { agruparEmpresas, claveEmpresa } from '../../core/lib/empresa';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { COLOR_ESTADO, UbicacionMapa, type CapaMapa } from './UbicacionMapa';
import { estadoUnidad, useDisponibilidad, useUnidadesGps, type EstadoUnidad, type UnidadMapa } from './api';

const CAPAS: Array<{ value: CapaMapa; label: string }> = [{ value: 'calle', label: 'Callejero' }, { value: 'satelite', label: 'Satelital' }];
const VISTAS: Array<{ value: 'lista' | 'mapa'; label: string }> = [{ value: 'lista', label: 'Lista' }, { value: 'mapa', label: 'Mapa' }];
const CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

const rumboTexto = (grados: number) => CARDINALES[Math.round(((grados % 360) + 360) % 360 / 45) % 8];
const corta = (empresa: string) => claveEmpresa(empresa).split(' ')[0] || '—';
const placaLimpia = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Texto corto del estado: velocidad si se mueve, "Ralentí", "Detenido" o "Sin señal" */
function etiquetaCorta(u: UnidadMapa, estado: EstadoUnidad) {
  if (estado === 'movimiento') return `${Math.round(u.velocidad)} km/h`;
  if (estado === 'ralenti') return 'Ralentí';
  if (estado === 'detenido') return 'Detenido';
  return 'Sin señal';
}
const COLOR_BADGE: Record<EstadoUnidad, string> = { movimiento: 'blue', ralenti: 'orange', detenido: 'green', sin_senal: 'gray' };

// Ubicación GPS de la flota: lista de unidades, mapa y ficha de cada una. Misma fuente que la versión actual.
export function UbicacionPage() {
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useUnidadesGps();
  const disp = useDisponibilidad();
  const unidades = data ?? [];
  const [empresa, setEmpresa] = useState('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [capa, setCapa] = useState<CapaMapa>('calle');
  const [encuadre, setEncuadre] = useState(0);
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'mapa'>('lista');
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = dataUpdatedAt ? Math.max(0, Math.round((ahora - dataUpdatedAt) / 1000)) : null;

  const empresas = useMemo(() => agruparEmpresas(unidades.map(u => u.empresa)), [unidades]);
  const delEmpresa = useMemo(() => unidades.filter(u => empresa === 'TODAS' || claveEmpresa(u.empresa) === empresa), [unidades, empresa]);
  const lista = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return delEmpresa;
    return delEmpresa.filter(u => [u.placa, u.empresa, u.ubicacion, u.nombre, u.marcaModelo].some(t => t.toUpperCase().includes(q)));
  }, [delEmpresa, busqueda]);

  const cifras = useMemo(() => {
    let conSenal = 0;
    let enMovimiento = 0;
    for (const u of delEmpresa) {
      const e = estadoUnidad(u);
      if (e !== 'sin_senal') conSenal++;
      if (e === 'movimiento') enMovimiento++;
    }
    return { total: delEmpresa.length, conSenal, enMovimiento, sinSenal: delEmpresa.length - conSenal };
  }, [delEmpresa]);

  const enLista = lista.filter(u => u.lat != null).length;
  const visiblesEnMapa = lista.filter(u => u.lat != null && !ocultas.has(u.placa)).length;
  const todasVisibles = lista.length > 0 && lista.every(u => !ocultas.has(u.placa));
  const seleccion = unidades.find(u => u.placa === seleccionada) ?? null;

  const conductorDe = (placa: string) =>
    disp.data?.find(d => placaLimpia(d.placa_camion || '') === placa || placaLimpia(d.placa_carreta || '') === placa)?.conductor_asignado || 'Sin asignar';

  const alternarUnidad = (placa: string) => {
    haptic('selection');
    setOcultas(prev => {
      const n = new Set(prev);
      if (n.has(placa)) n.delete(placa); else n.add(placa);
      return n;
    });
  };
  const alternarTodas = () => {
    haptic('selection');
    setOcultas(prev => {
      const n = new Set(prev);
      for (const u of lista) { if (todasVisibles) n.add(u.placa); else n.delete(u.placa); }
      return n;
    });
  };
  const elegir = (placa: string) => {
    haptic('selection');
    setSeleccionada(placa);
    setVistaMovil('mapa');
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Ubicación GPS"
        subtitle={isLoading ? 'Cargando unidades…' : `${cifras.total} unidades · ${cifras.enMovimiento} en movimiento`}
        actions={
          <>
            <span className="gps-vivo" aria-live="polite">
              <span className="gps-vivo__punto" aria-hidden />
              En vivo{segundos !== null && ` · ${segundos}s`}
            </span>
            <Button variant="secondary" iconOnly icon={<RefreshCw size={16} />} aria-label="Actualizar" title="Actualizar"
              disabled={isFetching} onClick={() => refetch()} />
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', detalle: 'Historial y reproducción de rutas', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/ubicacion') },
            ]} />
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div className="gps-cuerpo">
          <div className="disp-kpis">
            {([
              { label: 'Flota monitoreada', valor: cifras.total, tono: 'blue', icono: <Briefcase size={18} strokeWidth={1.9} /> },
              { label: 'Con señal GPS', valor: cifras.conSenal, tono: 'green', icono: <MapPin size={18} strokeWidth={1.9} /> },
              { label: 'En movimiento', valor: cifras.enMovimiento, tono: 'blue', icono: <Navigation size={18} strokeWidth={1.9} /> },
              { label: 'Sin señal', valor: cifras.sinSenal, tono: 'ink', icono: <Wrench size={18} strokeWidth={1.9} /> },
            ] as const).map(k => (
              <div key={k.label} className={`disp-kpi disp-kpi--${k.tono}`}>
                <span>
                  <span className="disp-kpi__label">{k.label}</span>
                  <AnimatedNumber value={k.valor} className="disp-kpi__valor t-numeric" />
                </span>
                <span className="disp-kpi__icono" aria-hidden>{k.icono}</span>
              </div>
            ))}
          </div>

          <div className="gps-barra">
            <input type="search" className="gps-barra__buscar" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar placa, empresa, ciudad (ej. Arequipa)…" aria-label="Buscar unidades" />
            {empresas.length > 1 && (
              <SegmentedControl label="Empresa" value={empresa} onChange={setEmpresa} options={[
                { value: 'TODAS', label: 'Todas' }, ...empresas.map(e => ({ value: e.clave, label: e.nombre })),
              ]} />
            )}
          </div>

          <div className="gps-vistas">
            <SegmentedControl label="Vista" value={vistaMovil} onChange={setVistaMovil} options={VISTAS} />
          </div>

          <div className="gps-layout" data-vista={vistaMovil}>
            <section className="gps-lista" aria-label="Unidades">
              <div className="gps-lista__cab">
                <label className="gps-check">
                  <input type="checkbox" checked={todasVisibles} onChange={alternarTodas} disabled={!lista.length} />
                  <span>Visibles ({visiblesEnMapa}/{enLista})</span>
                </label>
              </div>
              <ul className="gps-lista__items">
                {lista.map(u => {
                  const estado = estadoUnidad(u);
                  const color = COLOR_ESTADO[estado];
                  const marcada = seleccionada === u.placa;
                  return (
                    <li key={u.placa} className={`gps-tarjeta${marcada ? ' gps-tarjeta--sel' : ''}`}>
                      <input type="checkbox" className="gps-tarjeta__check" checked={!ocultas.has(u.placa)} onChange={() => alternarUnidad(u.placa)}
                        aria-label={`Mostrar ${u.placa} en el mapa`} />
                      <button type="button" className="gps-tarjeta__cuerpo" onClick={() => elegir(u.placa)}>
                        <span className="gps-punto" style={{ background: color, boxShadow: `0 0 6px ${color}` }} aria-hidden />
                        <span className="gps-tarjeta__texto">
                          <span className="gps-tarjeta__linea">
                            <span className="gps-placa">{u.placa}</span>
                            <span className="gps-chip">{corta(u.empresa)}</span>
                            <span className={`gps-estado gps-estado--${COLOR_BADGE[estado]}`}>{etiquetaCorta(u, estado)}</span>
                          </span>
                          <span className="gps-tarjeta__dir">
                            {u.ubicacion ? <><MapPin size={11} aria-hidden />{u.ubicacion}</> : (u.nombre || 'Sin dirección')}
                          </span>
                        </span>
                      </button>
                      <span className="gps-tarjeta__stats">
                        <b>{u.km.toLocaleString('es-PE')} km</b>
                        <span>{u.horas.toLocaleString('es-PE')} hrs</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!lista.length && <p className="gps-vacio">Ninguna unidad coincide con la búsqueda.</p>}
            </section>

            <div className="gps-mapa-wrap">
              <UbicacionMapa unidades={unidades} ocultas={ocultas} seleccionada={seleccionada} capa={capa}
                encuadreVersion={encuadre} onElegir={elegir} />
              <div className="gps-controles">
                <Button variant="secondary" onClick={() => { haptic('selection'); setEncuadre(v => v + 1); }}>Toda la flota</Button>
                <SegmentedControl label="Capa del mapa" value={capa} onChange={setCapa} options={CAPAS} />
              </div>
              <AnimatePresence>
                {seleccion && (
                  <UnidadFicha key={seleccion.placa} u={seleccion} conductor={conductorDe(seleccion.placa)}
                    onCerrar={() => setSeleccionada(null)} />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function UnidadFicha({ u, conductor, onCerrar }: { u: UnidadMapa; conductor: string; onCerrar: () => void }) {
  const estado = estadoUnidad(u);
  const color = COLOR_ESTADO[estado];
  const tienePos = u.lat != null && u.lng != null;
  const etiqueta = estado === 'movimiento' ? `En movimiento · ${Math.round(u.velocidad)} km/h`
    : estado === 'ralenti' ? 'Ralentí (ON)'
    : estado === 'detenido' ? 'Detenido (OFF)' : 'Sin señal GPS';
  const maps = tienePos ? `https://maps.google.com/maps?q=${u.lat},${u.lng}` : '';
  const waze = tienePos ? `https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes` : '';
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Unidad ${u.placa}: ${etiqueta}. ${u.ubicacion} ${maps}`.trim())}`;

  return (
    <motion.article className="gps-ficha" aria-label={`Ficha de ${u.placa}`}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={spring}>
      <header className="gps-ficha__cab">
        <span className="gps-ficha__icono"><Truck size={22} strokeWidth={1.9} /></span>
        <div className="gps-ficha__titulo">
          <div className="gps-ficha__linea">
            <strong className="gps-ficha__placa">{u.placa}</strong>
            {u.tipo && <span className="gps-etiqueta">{u.tipo.toUpperCase()}</span>}
            <span className="gps-etiqueta" style={{ color, borderColor: color }}>{etiqueta}</span>
          </div>
          <span className="gps-ficha__sub">{[u.nombre, u.empresa].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="gps-ficha__cerrar" onClick={onCerrar} aria-label="Cerrar ficha"><X size={16} /></button>
      </header>

      <div className="gps-ficha__acciones">
        {tienePos ? (
          <>
            <a className="gps-accion" href={waze} target="_blank" rel="noopener noreferrer"><Navigation size={14} />Waze</a>
            <a className="gps-accion" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={14} />Maps</a>
          </>
        ) : null}
        <a className="gps-accion" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
      </div>

      <div className="gps-ficha__datos">
        <Dato titulo="Odómetro" valor={`${u.km.toLocaleString('es-PE')} km`} destacado />
        <Dato titulo="Horómetro" valor={`${u.horas.toLocaleString('es-PE')} hrs`} />
        <Dato titulo="Batería / ignición" valor={`${u.voltaje ? `${u.voltaje} V` : '—'} · Motor ${u.ignicion ? 'ON' : 'OFF'}`} />
        <Dato titulo="Satélites / altitud" valor={`${u.satelites ?? '—'} sat · ${u.altitud != null ? `${Math.round(u.altitud)} msnm` : '—'}`} />
        <Dato titulo="Velocidad / rumbo" valor={`${Math.round(u.velocidad)} km/h · ${rumboTexto(u.rumbo)} (${Math.round(u.rumbo)}°)`} />
        <Dato titulo="Conductor / operador" valor={conductor} />
      </div>

      <div className="gps-ficha__direccion">
        <span className="gps-ficha__direccion-titulo"><MapPin size={13} />Dirección satelital geocodificada</span>
        <span>{u.ubicacion || 'Sin dirección disponible'}</span>
        {tienePos && <span className="gps-coords">{u.lat!.toFixed(4)}, {u.lng!.toFixed(4)}</span>}
      </div>
    </motion.article>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="gps-dato">
      <span className="gps-dato__titulo">{titulo}</span>
      <span className={`gps-dato__valor${destacado ? ' gps-dato__valor--acento' : ''}`}>{valor}</span>
    </div>
  );
}

