// Tablero de movimientos de neumáticos: bodega (izquierda), unidad con sus posiciones (centro) y zonas de
// reforma y descarte (abajo); detalle de la llanta y su línea de tiempo (derecha). Arrastrar, o tocar y luego tocar el destino.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Disc3, Lock } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { LeyendaSemaforo, configParaPosiciones, configReconocida } from './NeumaticosEsquema';
import { NeumaticosCenital } from './nv3-cenital';
import type { ModoVista } from './nv3-motor';
import {
  PERMISO_BAJA, PERMISO_MOVER_NEUMATICOS, PERMISO_REENCAUCHE, PERMISO_VER_NEUMATICOS,
  type LlantaTablero, type PosicionTablero,
} from './neumaticos-tablero-tipos';
import { useArrastre, posicionDeEvento, type Destino, type ItemArrastre, type SondaPosicion } from './ntb-arrastre';
import { ejecutarRegreso, tituloLlanta, useTablero, usePlacasLista, vidaTexto } from './ntb-api';
import { createPortal } from 'react-dom';
import { LlantaPlano, LlantaTile, aLlantaDato } from './ntb-llanta';
import { LineaTiempo } from './ntb-linea-tiempo';
import { Sheet } from '../../core/ui/Sheet';
import { MovimientoSheet, type Propuesta } from './ntb-movimiento-sheet';
import './ntb.css';
import { DetalleSecciones } from './ntb-secciones';
import { HistorialLlanta } from './ntb-historial-llanta';
import { InspeccionCabecera, InspeccionModal, InspeccionResumen, minimoDe, useInspeccion } from './insp-neumatico-estado';

type Grupo = 'bodega' | 'unidad' | 'reforma' | 'descarte';

type Aviso = { tono: 'error' | 'accent'; texto: string };

/** Posiciones con llanta montada, en el orden de la configuración */
function montadasDe(posiciones: PosicionTablero[]): Array<{ posicion: string; llanta: LlantaTablero }> {
  return posiciones.flatMap(p => (p.llanta ? [{ posicion: p.posicion, llanta: p.llanta }] : []));
}

function textoSobre(d: Destino, ocupante: LlantaTablero | null): string {
  if (d.tipo === 'bodega') return 'Suelta para regresarla a disponible';
  if (d.tipo === 'zona') return d.zona === 'reforma' ? 'Suelta para enviar a reforma' : 'Suelta para dar de baja';
  return ocupante ? `Suelta para cambiar la llanta de ${d.posicion}` : `Suelta para instalar en ${d.posicion}`;
}

/** Zona de envío: solo un contenedor donde se suelta la llanta. No lista llantas ni se arrastra de vuelta: lo ya enviado se gestiona desde Neumáticos. */
function ZonaDrop({ zona, titulo, nota, cantidad, resaltada, permitido, bloqueo }: {
  zona: 'reforma' | 'descarte'; titulo: string; nota: string; cantidad: number;
  resaltada: boolean; permitido: boolean; bloqueo: string;
}) {
  return (
    <div role="group" aria-label={titulo} data-ntb-zona={zona}
      title={nota}
      className={`ntb-zona ntb-zona--${zona}${resaltada ? ' ntb-zona--sobre' : ''}${permitido ? '' : ' ntb-zona--bloqueada'}`}>
      <div className="ntb-col__cab">
        <span className="ntb-zona__titulo">{titulo}</span>
        {cantidad > 0 && <span className="ntb-count" title="Llantas enviadas desde esta unidad">{cantidad}</span>}
      </div>
      <p className="ntb-zona__vacia ntb-zona__vacia--area">
        {permitido ? 'Suelta aquí la llanta' : <><Lock size={13} aria-hidden /> {bloqueo}</>}
      </p>
    </div>
  );
}

/** Pantalla de la inspección: el tablero en modo inspección */
export const NeumaticosInspeccion = () => <NeumaticosTablero inspeccion />;

/** `inspeccion`: el mismo tablero (con sus arrastres y movimientos) para inspeccionar la unidad: cabecera, medición por posición, resumen y Guardar */
export function NeumaticosTablero({ inspeccion = false }: { inspeccion?: boolean } = {}) {
  const { placa: placaRuta } = useParams();
  const placa = (placaRuta ?? '').trim().toUpperCase();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();

  const puedeVer = can(PERMISO_VER_NEUMATICOS);
  const puedeMover = can(PERMISO_MOVER_NEUMATICOS);
  const puedeReforma = puedeMover && can(PERMISO_REENCAUCHE);
  const puedeBaja = puedeMover && can(PERMISO_BAJA);
  const puedeRetorno = can(PERMISO_REENCAUCHE);

  // Los movimientos de llantas se hacen solo en Plano; en Isometría la unidad es solo para verla
  const [modo, setModo] = useState<ModoVista>('plano');
  const enPlano = modo === 'plano';
  const puedeMoverAqui = puedeMover && enPlano;
  const bloqueoVista = enPlano ? 'Sin permiso para esta acción' : 'Cambia a Plano para mover';

  const placas = usePlacasLista();
  const tablero = useTablero(placa);
  const datos = tablero.data;

  const [seleccion, setSeleccion] = useState<string | null>(null);
  // Posición vacía elegida al tocarla en la unidad (muestra "Posición libre" en el detalle)
  const [posLibre, setPosLibre] = useState<string | null>(null);
  const [enMano, setEnMano] = useState<ItemArrastre | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [hoja, setHoja] = useState<{ id: number; abierta: boolean; propuesta: Propuesta | null }>({ id: 0, abierta: false, propuesta: null });
  // Lo último que se envió a reforma o descarte: durante unos minutos se puede deshacer desde un aviso
  const [ultimoEnvio, setUltimoEnvio] = useState<{ codigo: string; posicion: string; km: number; destino: 'reforma' | 'descarte'; venceEn: number } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  // Historial completo de una llanta (el panel del tablero solo muestra lo último)
  const [historial, setHistorial] = useState<string | null>(null);
  // Lo rellena el lienzo 3D de la unidad con la posición que hay bajo un punto (si la vista es 3D)
  const sondaRef = useRef<SondaPosicion | null>(null);

  // Al cambiar de unidad no se arrastra ni se selecciona nada de la anterior
  useEffect(() => {
    setSeleccion(null);
    setPosLibre(null);
    setEnMano(null);
    setAviso(null);
    setUltimoEnvio(null);
  }, [placa]);

  // El aviso de deshacer dura 5 minutos
  useEffect(() => {
    if (!ultimoEnvio) return;
    const falta = ultimoEnvio.venceEn - Date.now();
    if (falta <= 0) { setUltimoEnvio(null); return; }
    const t = window.setTimeout(() => setUltimoEnvio(null), falta);
    return () => window.clearTimeout(t);
  }, [ultimoEnvio]);

  const posiciones = useMemo(() => datos?.posiciones ?? [], [datos]);
  const bodega = useMemo(() => datos?.disponibles ?? [], [datos]);
  const reforma = useMemo(() => datos?.reforma ?? [], [datos]);
  const descarte = useMemo(() => datos?.descarte ?? [], [datos]);
  const montadas = useMemo(() => montadasDe(posiciones), [posiciones]);
  const libres = useMemo(() => posiciones.filter(p => !p.llanta), [posiciones]);
  const insp = useInspeccion({ activa: inspeccion, placa, montadas });
  const llantasDato = useMemo(() => montadas.map(m => {
    const d = aLlantaDato(m.llanta, m.posicion);
    const h = inspeccion ? insp.medido(m.posicion) : null;
    return h ? { ...d, r1: Number(h.r1), r2: Number(h.r2), r3: Number(h.r3), remanente_promedio: minimoDe(h) } : d;
  }), [montadas, inspeccion, insp.vigentes]); // eslint-disable-line react-hooks/exhaustive-deps
  // La inspección manda: la configuración se toma de las posiciones con llanta si la ficha no las cubre
  const configCodigo = configParaPosiciones(datos?.configuracion, posiciones.map(p => p.posicion));
  const configFicha = configReconocida(datos?.configuracion);
  const cfg = configCodigo ? CONFIGURACIONES[configCodigo] : null;
  // La disposición 4X2 la comparten un tracto (T2) y un camión (C2): el nombre sale del tipo que dice la ficha de la placa
  const tipoFicha = String(datos?.configuracion ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nombreUnidad = /^T\d/.test(tipoFicha) ? `Tracto ${tipoFicha}` : /^C\d/.test(tipoFicha) ? `Camión ${tipoFicha}` : (cfg?.nombre ?? '');
  const posicionActiva = montadas.find(m => m.llanta.codigo === seleccion)?.posicion ?? posLibre ?? '';

  const buscada = busqueda.trim().toLowerCase();
  const bodegaFiltrada = useMemo(() => (
    buscada
      ? bodega.filter(l => [l.codigo, l.marca, l.modelo, l.medida, l.almacen].filter(Boolean).join(' ').toLowerCase().includes(buscada))
      : bodega
  ), [bodega, buscada]);

  const llantaEnPosicion = (pos: string): LlantaTablero | null => posiciones.find(p => p.posicion === pos)?.llanta ?? null;

  /** Selecciona una llanta (en la unidad, en bodega o en una zona) y deja de mostrar una posición libre */
  function elegirLlanta(codigo: string) {
    setSeleccion(codigo);
    setPosLibre(null);
  }

  // Llanta del detalle y dónde está ahora
  const detalle = useMemo((): { llanta: LlantaTablero; grupo: Grupo; posicion: string | null } | null => {
    if (!seleccion) return null;
    const m = montadas.find(x => x.llanta.codigo === seleccion);
    if (m) return { llanta: m.llanta, grupo: 'unidad', posicion: m.posicion };
    const b = bodega.find(l => l.codigo === seleccion);
    if (b) return { llanta: b, grupo: 'bodega', posicion: null };
    const r = reforma.find(l => l.codigo === seleccion);
    if (r) return { llanta: r, grupo: 'reforma', posicion: null };
    const d = descarte.find(l => l.codigo === seleccion);
    if (d) return { llanta: d, grupo: 'descarte', posicion: null };
    return null;
  }, [seleccion, montadas, bodega, reforma, descarte]);

  function abrirHoja(propuesta: Propuesta) {
    setHoja(h => ({ id: h.id + 1, abierta: true, propuesta }));
  }
  function cerrarHoja() {
    setHoja(h => ({ ...h, abierta: false }));
  }

  /** Decide qué movimiento corresponde a soltar (o tocar) un ítem sobre un destino, y abre su confirmación */
  function proponer(item: ItemArrastre, destino: Destino) {
    setAviso(null);
    if (destino.tipo === 'bodega') { setAviso({ tono: 'accent', texto: 'Esa llanta ya está disponible en bodega.' }); return; }
    if (!enPlano) {
      setAviso({ tono: 'accent', texto: 'En Isometría solo se ve la unidad. Cambia a Plano para mover neumáticos.' });
      return;
    }
    if (destino.tipo === 'posicion') {
      if (item.origen === 'unidad') {
        setAviso({ tono: 'accent', texto: 'Una llanta montada solo se envía a reforma o descarte. Para cambiarla de posición, primero envíala a reforma o descarte.' });
        return;
      }
      if (!puedeMover) { setAviso({ tono: 'error', texto: 'No tienes permiso para mover neumáticos.' }); return; }
      const llanta = bodega.find(l => l.codigo === item.codigo);
      if (!llanta) return;
      const ocupante = llantaEnPosicion(destino.posicion);
      setEnMano(null);
      abrirHoja(ocupante
        ? { clase: 'intercambio', entrante: llanta, saliente: ocupante, posicion: destino.posicion }
        : { clase: 'instalar', llanta, posicion: destino.posicion });
      return;
    }
    if (item.origen === 'bodega') {
      setAviso({ tono: 'accent', texto: 'Solo las llantas montadas en la unidad se envían a reforma o descarte.' });
      return;
    }
    const montada = montadas.find(m => m.llanta.codigo === item.codigo);
    if (!montada) return;
    setEnMano(null);
    if (destino.tipo === 'zona' && destino.zona === 'reforma') {
      if (!puedeReforma) { setAviso({ tono: 'error', texto: 'No tienes permiso para enviar llantas a reforma.' }); return; }
      abrirHoja({ clase: 'reforma', llanta: montada.llanta, posicion: montada.posicion });
    } else {
      if (!puedeBaja) { setAviso({ tono: 'error', texto: 'No tienes permiso para dar de baja llantas.' }); return; }
      abrirHoja({ clase: 'descarte', llanta: montada.llanta, posicion: montada.posicion });
    }
  }

  /** Toque sobre una llanta de bodega: la selecciona y, con permiso, la deja "en mano" para tocar un destino */
  function tocarBodega(codigo: string) {
    setAviso(null);
    elegirLlanta(codigo);
    if (!puedeMoverAqui) return;
    setEnMano(prev => (prev?.codigo === codigo ? null : { codigo, origen: 'bodega' }));
  }

  /** Toque sobre una posición de la unidad (o un chip de posición libre) */
  function tocarPosicion(pos: string) {
    if (!enMano) {
      const l = llantaEnPosicion(pos);
      setAviso(null);
      if (l && inspeccion) { insp.abrir(pos); return; }
      if (l) elegirLlanta(l.codigo);
      else { setSeleccion(null); setPosLibre(pos); }
      return;
    }
    proponer(enMano, { tipo: 'posicion', posicion: pos });
  }

  const arrastre = useArrastre({
    sondaRef,
    onTap: (item) => {
      if (item.origen === 'bodega') tocarBodega(item.codigo);
      else if (inspeccion) { const m = montadas.find(x => x.llanta.codigo === item.codigo); if (m) insp.abrir(m.posicion); }
      else { setAviso(null); elegirLlanta(item.codigo); }
    },
    onSoltar: (item, destino) => proponer(item, destino),
  });

  function alChasisPresionar(e: ReactPointerEvent<HTMLDivElement>) {
    if (!puedeMoverAqui) return;
    const pos = posicionDeEvento(e, sondaRef.current);
    const l = pos ? llantaEnPosicion(pos) : null;
    if (!l) return;
    arrastre.iniciar(e, { codigo: l.codigo, origen: 'unidad' });
  }

  function alChasisClic(e: ReactMouseEvent<HTMLDivElement>) {
    // En isometría la unidad no se toca: las llantas cambian solo con las flechas
    if (!enPlano) return;
    const pos = posicionDeEvento(e, sondaRef.current);
    if (pos) tocarPosicion(pos);
  }

  /** Vuelve a montar la llanta recién enviada en su posición (con el mismo kilometraje): primero queda disponible y luego se instala */
  async function deshacerEnvio() {
    if (!ultimoEnvio) return;
    setDeshaciendo(true);
    try {
      await ejecutarRegreso({ codigo: ultimoEnvio.codigo }, { placa, posicion: ultimoEnvio.posicion, km: ultimoEnvio.km });
      toast(`${ultimoEnvio.codigo} volvió a ${ultimoEnvio.posicion}`, 'success');
      setUltimoEnvio(null);
      void refrescar();
    } catch (err) {
      setAviso({ tono: 'error', texto: errorMessage(err) });
    } finally {
      setDeshaciendo(false);
    }
  }

  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-tablero'] }),
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-linea'] }),
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] }),
  ]);

  const sobre = arrastre.sobre;
  // Una llanta de la unidad que se arrastra en el plano se lleva ella misma con el puntero (no aparece otra encima)
  const fantasmaUnidad = arrastre.fantasma && arrastre.fantasma.origen === 'unidad' && enPlano && configCodigo ? arrastre.fantasma : null;
  const llevada = fantasmaUnidad
    ? (() => { const m = montadas.find(x => x.llanta.codigo === fantasmaUnidad.codigo); return m ? { posicion: m.posicion, x: fantasmaUnidad.x, y: fantasmaUnidad.y } : null; })()
    : null;
  const bannerTexto = arrastre.fantasma
    ? (sobre ? textoSobre(sobre, sobre.tipo === 'posicion' ? llantaEnPosicion(sobre.posicion) : null) : 'Suelta sobre una posición de la unidad o sobre una zona')
    : enMano
      ? `Llanta ${enMano.codigo} elegida. Toca una posición libre, o una ocupada para cambiar la llanta.`
      : null;

  if (!puedeVer) {
    return (
      <Page wide>
        <EmptyState icon={<Lock size={22} />} title="Sin acceso">No tienes permiso para ver los neumáticos.</EmptyState>
      </Page>
    );
  }

  // Solo las unidades con llantas registradas; la que está abierta siempre aparece
  const opcionesPlaca = (placas.data ?? [])
    .filter(p => p.tiene_llantas || p.placa === placa)
    .map(p => ({ placa: p.placa, detalle: p.cliente }));
  // La llanta que se lleva con el puntero
  const llantaArrastrada = arrastre.fantasma
    ? [...montadas.map(m => m.llanta), ...bodega, ...reforma, ...descarte].find(l => l.codigo === arrastre.fantasma?.codigo)
    : undefined;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Mantenimiento · Neumáticos"
        title={inspeccion ? 'Inspección neumática Nº …….' : 'Tablero de movimientos'}
        subtitle={placa ? `${placa}${cfg && configCodigo ? ` · ${configCodigo} · ${nombreUnidad}` : ''}` : 'Elige una unidad para ver y mover sus neumáticos'}
        actions={
          <PlacaPicker
            id="ntb-placa"
            value={placa}
            opciones={opcionesPlaca}
            placeholder="Elige una unidad…"
            onChange={p => navigate(`/mantenimiento/neumaticos-${inspeccion ? 'inspeccion' : 'tablero'}/${encodeURIComponent(p)}`, { replace: inspeccion })}
          />
        }
      />

      {inspeccion && <InspeccionCabecera e={insp} placa={placa} />}
      {!puedeMover && <Notice>Solo lectura: no tienes permiso para mover neumáticos.</Notice>}
      {bannerTexto && (
        <div className="ntb-banner" role="status">
          <span>{bannerTexto}</span>
          {enMano && !arrastre.fantasma && <Button variant="plain" size="sm" onClick={() => setEnMano(null)}>Cancelar</Button>}
        </div>
      )}
      {ultimoEnvio && puedeMover && (
        <div className="ntb-banner" role="status">
          <span>
            {ultimoEnvio.codigo} se envió a {ultimoEnvio.destino === 'reforma' ? 'reforma' : 'descarte'}. ¿Fue un error? Puedes deshacerlo durante unos minutos y volverá a la posición {ultimoEnvio.posicion}.
          </span>
          <span style={{ display: 'inline-flex', gap: 'var(--s-2)' }}>
            <Button variant="secondary" size="sm" loading={deshaciendo} onClick={() => { void deshacerEnvio(); }}>Deshacer</Button>
            <Button variant="plain" size="sm" disabled={deshaciendo} onClick={() => setUltimoEnvio(null)}>Cerrar</Button>
          </span>
        </div>
      )}
      {aviso && <Notice tone={aviso.tono === 'error' ? 'error' : 'accent'} icon={aviso.tono === 'error' ? <CircleAlert size={16} /> : undefined}>{aviso.texto}</Notice>}

      {!placa ? (
        <EmptyState icon={<Disc3 size={22} />} title="Elige una unidad">Selecciona una placa para ver sus posiciones y las llantas disponibles.</EmptyState>
      ) : tablero.isLoading ? (
        <PageLoader />
      ) : tablero.isError ? (
        <Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(tablero.error)}</Notice>
      ) : (
        <div className={`ntb-tablero${inspeccion ? ' ntb-tablero--insp' : ''}`}>
          {/* Columna izquierda: disponibles para uso y, debajo, las zonas de reforma y descarte */}
          <div className="ntb-lateral">
          <section data-ntb-zona="bodega" className={`card ntb-col ntb-bodega${sobre?.tipo === 'bodega' ? ' ntb-bodega--sobre' : ''}`} aria-label="Disponible para uso">
            <div className="ntb-col__cab">
              <h2 className="ntb-col__titulo">Disponible para uso ({bodega.length})</h2>
            </div>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar código, marca o medida" />
            <div className="ntb-grid">
              {bodegaFiltrada.map(l => (
                <LlantaTile
                  key={l.codigo}
                  llanta={l}
                  activa={seleccion === l.codigo}
                  enMano={arrastre.fantasma?.codigo === l.codigo}
                  arrastrable={puedeMoverAqui}
                  onPointerDown={puedeMoverAqui ? e => arrastre.iniciar(e, { codigo: l.codigo, origen: 'bodega' }) : undefined}
                  onActivar={() => tocarBodega(l.codigo)}
                />
              ))}
            </div>
            {bodegaFiltrada.length === 0 && (
              <p className="ntb-vacio">{bodega.length ? 'Ninguna llanta coincide con la búsqueda.' : 'No hay llantas disponibles en bodega.'}</p>
            )}
          </section>

          <div className="ntb-zonas-par">
          <ZonaDrop
            zona="reforma" titulo="Enviar para reforma" nota="Arrastra aquí una llanta montada para enviarla a reencauche."
            cantidad={reforma.length} resaltada={sobre?.tipo === 'zona' && sobre.zona === 'reforma'}
            permitido={puedeReforma && enPlano} bloqueo={bloqueoVista}
          />
          <ZonaDrop
            zona="descarte" titulo="Enviar para descarte" nota="Arrastra aquí una llanta montada para darla de baja (no regresa)."
            cantidad={descarte.length} resaltada={sobre?.tipo === 'zona' && sobre.zona === 'descarte'}
            permitido={puedeBaja && enPlano} bloqueo={bloqueoVista}
          />
          </div>
          </div>

          {/* Centro: la unidad y sus zonas */}
          <div className="ntb-centro">
            <section className="card ntb-col" aria-label="Vehículo">
              <div className="ntb-col__cab">
                <LicensePlate plate={placa} size="lg" />
                {posiciones.length > 0 && (
                  <div className="ntb-chips" role="group" aria-label="Posiciones de la unidad">
                    {posiciones.map(p => (
                      <button key={p.posicion} type="button" data-ntb-chip={p.posicion}
                        className={`ntb-pos${posicionActiva === p.posicion ? ' ntb-pos--activa' : ''}${p.llanta ? '' : ' ntb-pos--libre'}`}
                        aria-pressed={posicionActiva === p.posicion}
                        aria-label={`Posición ${p.posicion}${p.llanta ? '' : ' libre'}`}
                        onClick={() => tocarPosicion(p.posicion)}>
                        {p.posicion}
                      </button>
                    ))}
                  </div>
                )}
                <span className="ntb-conteos">
                  <span>{montadas.length} montadas</span>
                  <span>{libres.length} libres</span>
                </span>
              </div>
              <p className="t-footnote c-secondary">
                {cfg && configCodigo
                  ? `${configCodigo} · ${nombreUnidad} · ${montadas.length} llantas montadas`
                  : datos?.configuracion ? `Configuración ${datos.configuracion} no reconocida` : 'Sin configuración de ejes registrada'}
              </p>
              {configFicha && configCodigo && configFicha !== configCodigo && (
                <p className="t-footnote c-secondary">La ficha dice {configFicha}; se dibuja según las llantas de la inspección.</p>
              )}
              {posiciones.length > 0 ? (
                <div className="ntb-chasis" onPointerDown={alChasisPresionar} onClick={alChasisClic}>
                  <NeumaticosCenital
                    llantas={llantasDato} configuracion={configCodigo} activa={posicionActiva}
                    sobre={sobre?.tipo === 'posicion' ? sobre.posicion : null} sondaRef={sondaRef}
                    onSelect={l => { const m = montadas.find(x => x.posicion === l.posicion); if (!m) return; if (inspeccion) insp.abrir(m.posicion); else elegirLlanta(m.llanta.codigo); }}
                    marca={(placas.data ?? []).find(p => p.placa === placa)?.marca ?? null}
                    camion={/^C/i.test(datos?.configuracion ?? '')}
                    modo={modo} onModo={setModo} plano2d placa={placa} arrastrando={llevada} sinNumeros={inspeccion} soloPlano={inspeccion}
                  />
                </div>
              ) : (
                <p className="ntb-vacio">Esta unidad no tiene llantas registradas: no tiene inspección de neumáticos.</p>
              )}
              <LeyendaSemaforo />

              {libres.length > 0 && (
                <div className="ntb-libres">
                  <span className="t-footnote c-secondary">Posiciones libres</span>
                  <div className="ntb-libres__lista">
                    {libres.map(p => (
                      <button key={p.posicion} type="button" data-ntb-pos={p.posicion} className="ntb-pos ntb-pos--libre"
                        disabled={!puedeMoverAqui} onClick={() => tocarPosicion(p.posicion)}
                        aria-label={`Posición ${p.posicion} libre`}>
                        {p.posicion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Detalle y línea de tiempo (en la inspección se reemplaza por el resumen de abajo) */}
          {!inspeccion && (
          <div className="ntb-detalle-col">
          <aside className="card ntb-col ntb-detalle" aria-label="Detalles de neumático">
            <div className="ntb-col__cab">
              <h2 className="ntb-col__titulo">Detalles de neumático</h2>
            </div>
            {!detalle && posLibre ? (
              <>
                <div className="ntb-det__cab">
                  <span className="ntb-det__codigo">Posición libre</span>
                  <span className="t-footnote c-secondary">{`${posLibre} · ${placa}`}</span>
                </div>
                <p className="ntb-det__ayuda">
                  {puedeMoverAqui
                    ? `Arrastra aquí una llanta de "Disponible para uso" o tócala y luego toca la posición ${posLibre}.`
                    : puedeMover
                      ? 'Cambia a Plano para instalar llantas en esta posición.'
                      : 'No tienes permiso para instalar llantas en esta posición.'}
                </p>
              </>
            ) : !detalle ? (
              <p className="ntb-vacio">Selecciona una llanta para ver sus datos y su línea de tiempo.</p>
            ) : (
              <>
                <div className="ntb-det__cab">
                  <span className="ntb-det__codigo">{detalle.llanta.codigo}</span>
                  <span className="t-footnote c-secondary">{tituloLlanta(detalle.llanta)}</span>
                </div>
                <DetalleSecciones llanta={detalle.llanta} grupo={detalle.grupo} placa={placa} posicion={detalle.posicion ?? null}
                  ubicacion={detalle.grupo === 'unidad' ? `${placa} · ${detalle.posicion}`
                    : detalle.grupo === 'bodega' ? (detalle.llanta.almacen ?? 'Bodega')
                      : detalle.grupo === 'reforma' ? 'Reforma (reencauche)' : 'Descarte'} />

                {detalle.grupo === 'unidad' && (puedeReforma || puedeBaja) && (
                  <div className="ntb-det__acciones">
                    {puedeReforma && (
                      <Button variant="secondary" disabled={!enPlano} onClick={() => proponer({ codigo: detalle.llanta.codigo, origen: 'unidad' }, { tipo: 'zona', zona: 'reforma' })}>
                        Enviar a reforma
                      </Button>
                    )}
                    {puedeBaja && (
                      <Button variant="danger" disabled={!enPlano} onClick={() => proponer({ codigo: detalle.llanta.codigo, origen: 'unidad' }, { tipo: 'zona', zona: 'descarte' })}>
                        Dar de baja
                      </Button>
                    )}
                    {!enPlano && <p className="ntb-det__ayuda">Cambia a Plano para enviar esta llanta a reforma o baja.</p>}
                  </div>
                )}
                {detalle.grupo === 'bodega' && puedeMover && (
                  <p className="ntb-det__ayuda">
                    {enPlano
                      ? 'Arrástrala a una posición de la unidad, o tócala y luego toca la posición.'
                      : 'Cambia a Plano para instalarla en la unidad.'}
                  </p>
                )}
                {detalle.grupo === 'reforma' && puedeRetorno && (
                  <div className="ntb-det__acciones">
                    <Button variant="accent" onClick={() => abrirHoja({ clase: 'retorno', llanta: detalle.llanta })}>
                      Registrar retorno
                    </Button>
                  </div>
                )}

                {detalle.grupo === 'reforma' && <p className="ntb-det__ayuda">Vida {vidaTexto(detalle.llanta.vida)} en reencauche.</p>}

                <h3 className="ntb-det__subtitulo">Línea de tiempo</h3>
                <HistorialLlanta codigo={detalle.llanta.codigo} limite={4} onVerTodo={() => setHistorial(detalle.llanta.codigo)} />
              </>
            )}
          </aside>
          </div>
          )}
        </div>
      )}

      {inspeccion && placa && !tablero.isLoading && !tablero.isError && <InspeccionResumen e={insp} montadas={montadas} />}
      {inspeccion && <InspeccionModal e={insp} />}

      {/* El neumático que se arrastra va en el cuerpo de la página y se ve igual que los del plano de la unidad */}
      {arrastre.fantasma && !llevada && llantaArrastrada && createPortal(
        <div className="ntb-fantasma ntb-fantasma--plano" style={{ left: arrastre.fantasma.x, top: arrastre.fantasma.y }} aria-hidden>
          <LlantaPlano llanta={llantaArrastrada} />
        </div>,
        document.body,
      )}

      <Sheet open={!!historial} onClose={() => setHistorial(null)} title={`Historial de ${historial ?? ''}`}>
        {historial && <LineaTiempo codigo={historial} />}
      </Sheet>

      {hoja.propuesta && (
        <MovimientoSheet
          key={hoja.id}
          open={hoja.abierta}
          propuesta={hoja.propuesta}
          placa={placa}
          puedeReencauche={puedeReforma}
          puedeBaja={puedeBaja}
          onClose={cerrarHoja}
          kmSugerido={inspeccion ? insp.km : undefined}
          onHecho={(mensaje, deshacer) => {
            toast(mensaje, 'success');
            if (inspeccion && hoja.propuesta) insp.registrar(hoja.propuesta, mensaje);
            if (deshacer) setUltimoEnvio({ ...deshacer, venceEn: Date.now() + 5 * 60_000 });
            void refrescar();
          }}
        />
      )}
    </Page>
  );
}
