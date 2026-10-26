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
import { formatFechaPe } from '../../core/lib/format';
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { LeyendaSemaforo, configReconocida } from './NeumaticosEsquema';
import { NeumaticosCenital } from './nv3-cenital';
import type { ModoVista } from './nv3-motor';
import {
  PERMISO_BAJA, PERMISO_MOVER_NEUMATICOS, PERMISO_REENCAUCHE, PERMISO_VER_NEUMATICOS,
  type LlantaTablero, type PosicionTablero,
} from './neumaticos-tablero-tipos';
import { useArrastre, posicionDeEvento, type Destino, type ItemArrastre, type SondaPosicion } from './ntb-arrastre';
import { tituloLlanta, useTablero, usePlacasLista, vidaTexto } from './ntb-api';
import { LlantaItem, RemanenteChip, VidaChip, aLlantaDato } from './ntb-llanta';
import { LineaTiempo } from './ntb-linea-tiempo';
import { MovimientoSheet, type Propuesta } from './ntb-movimiento-sheet';
import './ntb.css';

type Grupo = 'bodega' | 'unidad' | 'reforma' | 'descarte';
type Aviso = { tono: 'error' | 'accent'; texto: string };

/** Posiciones con llanta montada, en el orden de la configuración */
function montadasDe(posiciones: PosicionTablero[]): Array<{ posicion: string; llanta: LlantaTablero }> {
  return posiciones.flatMap(p => (p.llanta ? [{ posicion: p.posicion, llanta: p.llanta }] : []));
}

function textoSobre(d: Destino, ocupante: LlantaTablero | null): string {
  if (d.tipo === 'zona') return d.zona === 'reforma' ? 'Suelta para enviar a reforma' : 'Suelta para dar de baja';
  return ocupante ? `Suelta para cambiar la llanta de ${d.posicion}` : `Suelta para instalar en ${d.posicion}`;
}

function ZonaDrop({ zona, titulo, nota, llantas, resaltada, permitido, bloqueo, onActivar }: {
  zona: 'reforma' | 'descarte'; titulo: string; nota: string; llantas: LlantaTablero[];
  resaltada: boolean; permitido: boolean; bloqueo: string; onActivar: (codigo: string) => void;
}) {
  return (
    <div role="group" aria-label={titulo} data-ntb-zona={zona}
      className={`ntb-zona ntb-zona--${zona}${resaltada ? ' ntb-zona--sobre' : ''}${permitido ? '' : ' ntb-zona--bloqueada'}`}>
      <div className="ntb-col__cab">
        <span className="ntb-zona__titulo">{titulo}</span>
        <span className="ntb-count">{llantas.length}</span>
      </div>
      <p className="ntb-zona__nota">
        {permitido ? nota : <><Lock size={13} aria-hidden /> {bloqueo}</>}
      </p>
      {llantas.length > 0 ? (
        <div className="ntb-lista">
          {llantas.map(l => (
            <LlantaItem key={l.codigo} llanta={l} onActivar={() => onActivar(l.codigo)} />
          ))}
        </div>
      ) : (
        <p className="ntb-zona__vacia">Arrastra aquí una llanta montada en la unidad.</p>
      )}
    </div>
  );
}

export function NeumaticosTablero() {
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
  // Lo rellena el lienzo 3D de la unidad con la posición que hay bajo un punto (si la vista es 3D)
  const sondaRef = useRef<SondaPosicion | null>(null);

  // Al cambiar de unidad no se arrastra ni se selecciona nada de la anterior
  useEffect(() => {
    setSeleccion(null);
    setPosLibre(null);
    setEnMano(null);
    setAviso(null);
  }, [placa]);

  const posiciones = useMemo(() => datos?.posiciones ?? [], [datos]);
  const bodega = useMemo(() => datos?.disponibles ?? [], [datos]);
  const reforma = useMemo(() => datos?.reforma ?? [], [datos]);
  const descarte = useMemo(() => datos?.descarte ?? [], [datos]);
  const montadas = useMemo(() => montadasDe(posiciones), [posiciones]);
  const libres = useMemo(() => posiciones.filter(p => !p.llanta), [posiciones]);
  const llantasDato = useMemo(() => montadas.map(m => aLlantaDato(m.llanta, m.posicion)), [montadas]);
  const configCodigo = configReconocida(datos?.configuracion);
  const cfg = configCodigo ? CONFIGURACIONES[configCodigo] : null;
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
    if (destino.zona === 'reforma') {
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
    const pos = posicionDeEvento(e, sondaRef.current);
    if (pos) tocarPosicion(pos);
  }

  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-tablero'] }),
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos-linea'] }),
    qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] }),
  ]);

  const sobre = arrastre.sobre;
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

  const opcionesPlaca = (placas.data ?? []).map(p => ({ placa: p.placa, detalle: p.cliente }));

  return (
    <Page wide>
      <PageHeader
        eyebrow="Mantenimiento · Neumáticos"
        title="Tablero de movimientos"
        subtitle={placa ? `${placa}${cfg && configCodigo ? ` · ${configCodigo} · ${cfg.nombre}` : ''}` : 'Elige una unidad para ver y mover sus neumáticos'}
        actions={
          <PlacaPicker
            id="ntb-placa"
            value={placa}
            opciones={opcionesPlaca}
            placeholder="Elige una unidad…"
            onChange={p => navigate(`/mantenimiento/neumaticos-tablero/${encodeURIComponent(p)}`)}
          />
        }
      />

      {!puedeMover && <Notice>Solo lectura: no tienes permiso para mover neumáticos.</Notice>}
      {bannerTexto && (
        <div className="ntb-banner" role="status">
          <span>{bannerTexto}</span>
          {enMano && !arrastre.fantasma && <Button variant="plain" size="sm" onClick={() => setEnMano(null)}>Cancelar</Button>}
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
        <div className="ntb-tablero">
          {/* Bodega */}
          <section className="card ntb-col ntb-bodega" aria-label="Disponible para uso">
            <div className="ntb-col__cab">
              <h2 className="ntb-col__titulo">Disponible para uso ({bodega.length})</h2>
            </div>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar código, marca o medida" />
            <div className="ntb-lista">
              {bodegaFiltrada.map(l => (
                <LlantaItem
                  key={l.codigo}
                  llanta={l}
                  activa={seleccion === l.codigo}
                  arrastrable={puedeMoverAqui}
                  onPointerDown={puedeMoverAqui ? e => arrastre.iniciar(e, { codigo: l.codigo, origen: 'bodega' }) : undefined}
                  onActivar={() => tocarBodega(l.codigo)}
                />
              ))}
              {bodegaFiltrada.length === 0 && (
                <p className="ntb-vacio">{bodega.length ? 'Ninguna llanta coincide con la búsqueda.' : 'No hay llantas disponibles en bodega.'}</p>
              )}
            </div>
          </section>

          {/* Centro: la unidad y sus zonas */}
          <div className="ntb-centro">
            <section className="card ntb-col" aria-label="Vehículo">
              <div className="ntb-col__cab">
                <LicensePlate plate={placa} size="lg" />
                {montadas.length > 0 && (
                  <div className="ntb-chips" role="group" aria-label="Posiciones de la unidad">
                    {montadas.map(m => (
                      <button key={m.posicion} type="button" data-ntb-chip={m.posicion}
                        className={`ntb-pos${posicionActiva === m.posicion ? ' ntb-pos--activa' : ''}`}
                        aria-pressed={posicionActiva === m.posicion}
                        aria-label={`Posición ${m.posicion}`}
                        onClick={() => tocarPosicion(m.posicion)}>
                        {m.posicion}
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
                  ? `${configCodigo} · ${cfg.nombre} · ${montadas.length} llantas montadas`
                  : datos?.configuracion ? `Configuración ${datos.configuracion} no reconocida` : 'Sin configuración de ejes registrada'}
              </p>
              <div className="ntb-chasis" onPointerDown={alChasisPresionar} onClick={alChasisClic}>
                <NeumaticosCenital
                  llantas={llantasDato} configuracion={configCodigo} activa={posicionActiva}
                  sobre={sobre?.tipo === 'posicion' ? sobre.posicion : null} sondaRef={sondaRef}
                  onSelect={l => { const m = montadas.find(x => x.posicion === l.posicion); if (m) elegirLlanta(m.llanta.codigo); }}
                  marca={(placas.data ?? []).find(p => p.placa === placa)?.marca ?? null}
                  modo={modo} onModo={setModo}
                />
              </div>
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

            <div className="ntb-zonas">
              <ZonaDrop
                zona="reforma" titulo="Enviar para reforma" nota="Arrastra aquí una llanta montada para enviarla a reencauche."
                llantas={reforma} resaltada={sobre?.tipo === 'zona' && sobre.zona === 'reforma'}
                permitido={puedeReforma && enPlano} bloqueo={bloqueoVista} onActivar={elegirLlanta}
              />
              <ZonaDrop
                zona="descarte" titulo="Enviar para descarte" nota="Arrastra aquí una llanta montada para darla de baja."
                llantas={descarte} resaltada={sobre?.tipo === 'zona' && sobre.zona === 'descarte'}
                permitido={puedeBaja && enPlano} bloqueo={bloqueoVista} onActivar={elegirLlanta}
              />
            </div>
          </div>

          {/* Detalle y línea de tiempo */}
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
                <dl className="ntb-det__datos">
                  <div><dt>Vida</dt><dd><VidaChip vida={detalle.llanta.vida} /></dd></div>
                  <div><dt>Remanente promedio</dt><dd><RemanenteChip mm={detalle.llanta.remanente_mm} /></dd></div>
                  <div><dt>Ubicación</dt><dd>{
                    detalle.grupo === 'unidad' ? `${placa} · ${detalle.posicion}`
                      : detalle.grupo === 'bodega' ? (detalle.llanta.almacen ?? 'Bodega')
                        : detalle.grupo === 'reforma' ? 'Reforma (reencauche)' : 'Descarte'
                  }</dd></div>
                  <div><dt>Marca</dt><dd>{detalle.llanta.marca ?? '—'}</dd></div>
                  <div><dt>Modelo</dt><dd>{detalle.llanta.modelo ?? '—'}</dd></div>
                  <div><dt>Medida</dt><dd>{detalle.llanta.medida ?? '—'}</dd></div>
                  {detalle.grupo === 'unidad' && (
                    <>
                      <div><dt>Montada desde</dt><dd>{formatFechaPe(detalle.llanta.fecha_montaje)}</dd></div>
                      <div><dt>Km al montar</dt><dd>{detalle.llanta.km_montaje?.toLocaleString('es-PE') ?? '—'}</dd></div>
                    </>
                  )}
                  <div><dt>Km recorridos</dt><dd>{detalle.llanta.km_recorridos?.toLocaleString('es-PE') ?? '—'}</dd></div>
                </dl>

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
                <LineaTiempo codigo={detalle.llanta.codigo} />
              </>
            )}
          </aside>
        </div>
      )}

      {arrastre.fantasma && (
        <div className="ntb-fantasma" style={{ left: arrastre.fantasma.x, top: arrastre.fantasma.y }} aria-hidden>
          {arrastre.fantasma.codigo}
        </div>
      )}

      {hoja.propuesta && (
        <MovimientoSheet
          key={hoja.id}
          open={hoja.abierta}
          propuesta={hoja.propuesta}
          placa={placa}
          puedeReencauche={puedeReforma}
          puedeBaja={puedeBaja}
          onClose={cerrarHoja}
          onHecho={mensaje => { toast(mensaje, 'success'); void refrescar(); }}
        />
      )}
    </Page>
  );
}
