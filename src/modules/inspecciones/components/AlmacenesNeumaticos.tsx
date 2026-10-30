import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Recycle, Trash2, Warehouse } from 'lucide-react';
import { Sheet } from '../../../core/ui/Sheet';
import { Button } from '../../../core/ui/Button';
import { Field, TextInput } from '../../../core/ui/Field';
import { useToast } from '../../../core/ui/Toast';
import { api, errorMessage } from '../../../core/api/client';
import { useAuth } from '../../../core/auth/AuthProvider';
import type { PosicionBajo } from './ChasisEsquemaVisual';
import '../inspecciones.css';

// Almacenes de llantas junto al modelo 3D de la inspección de neumáticos:
//   Papelera (desecho) y almacén de reencauche: se suelta aquí una llanta arrastrada desde el modelo.
//   Repisa de disponibles (nuevas y reparadas): se arrastra una llanta a una posición vacía del modelo para montarla.
//   POST /neumaticos/retirar    { codigo, placa, posicion, destino: 'desecho'|'reencauche', km, observacion }
//   POST /neumaticos/instalar   { codigo, placa, posicion, km }
//   GET  /neumaticos/llantas    → { ok, data }: la repisa para montar usa las de almacén 100 (nuevas) y 1144 (reparadas)
//   GET  /neumaticos/almacenes  → { ok, grupos, conteos }: los 4 grupos de almacén, con su conteo (solo lectura)

export type Destino = 'desecho' | 'reencauche';

/** Almacenes de la repisa (ver routes/neumaticos-ciclo.js) */
const ALMACEN_NUEVAS = 100;
const ALMACEN_REPARADAS = 1144;
const condicionDe = (almacen: number | null | undefined) => (almacen === ALMACEN_NUEVAS ? 'Nueva' : almacen === ALMACEN_REPARADAS ? 'Reparada' : '');

/** Lo que el almacén necesita de cada llanta del formulario */
export interface LlantaAlmacen {
  posicion: string; codigo: string; codigoBase: boolean; marca: string; medida: string; modelo: string;
  r1: string; r2: string; r3: string; r4: string;
}

/** Llanta nueva o reparada que espera en la repisa (fila de GET /neumaticos/llantas) */
export interface LlantaDisponible {
  codigo: string; marca?: string | null; medida?: string | null; modelo?: string | null; almacen_id?: number | null;
}

/** Zona de retiro sobre la que está el puntero durante un arrastre (o ninguna) */
export type ZonaRetiro = 'papelera' | 'reencauche' | null;

/** Llanta de uno de los cuatro grupos de almacén (fila de GET /neumaticos/almacenes) */
export interface LlantaGrupo {
  codigo: string; marca: string | null; modelo: string | null; medida: string | null;
  estado_ciclo: string; almacen_id: number | null;
}
interface RespGrupos { ok?: boolean; grupos?: { disponibles: LlantaGrupo[]; reencauchadas: LlantaGrupo[]; enviar_reforma: LlantaGrupo[]; desechadas: LlantaGrupo[] } }

export interface AlmacenesHandle {
  /** Una llanta del modelo se soltó en (x, y) de la pantalla: si cayó en la papelera o el reencauche, se abre la confirmación */
  soltarDesdeModelo: (posicion: string, x: number, y: number) => void;
  /** Qué zona de retiro hay bajo un punto de la pantalla (para resaltarla mientras se arrastra) */
  zonaBajo: (x: number, y: number) => ZonaRetiro;
}

interface AlmacenesProps {
  placa: string;
  km: string;
  llantas: LlantaAlmacen[];
  modeloPosRef: { current: PosicionBajo | null };
  /** Tras retirar la llanta con éxito: la posición queda vacía en el formulario */
  onRetirada: (posicion: string) => void;
  /** Tras montar una llanta de la repisa: la posición toma sus datos */
  onMontada: (posicion: string, llanta: LlantaDisponible) => void;
  /** Zona de retiro que el puntero está señalando durante un arrastre: se resalta */
  zonaSobre?: ZonaRetiro;
}

type Dialogo =
  | { tipo: 'retiro'; posicion: string; codigo: string; destino: Destino | null }
  | { tipo: 'montaje'; posicion: string; llanta: LlantaDisponible };

/** Permiso para dar de baja una llanta (desecho definitivo) */
const PERMISO_BAJA = 'neumaticos.baja';
const AVISO_BAJA = 'No tienes permiso para dar de baja llantas (neumaticos.baja).';

const numero = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;

/** Posición sin llanta: sin código, sin marca, medida ni modelo, y sin mediciones */
function posicionVacia(l: LlantaAlmacen): boolean {
  return !l.codigo.trim() && !l.marca.trim() && !l.medida.trim() && !l.modelo.trim()
    && ![l.r1, l.r2, l.r3, l.r4].some(v => numero(v) > 0);
}

/** Si la coordenada de pantalla cae dentro del rectángulo del elemento */
function dentro(el: HTMLElement | null, x: number, y: number): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Caja de solo lectura con las llantas de un grupo de almacén y su conteo */
function GrupoLlantas({ titulo, icono, nota, llantas, cargando, error }: {
  titulo: string; icono: ReactNode; nota: string; llantas: LlantaGrupo[] | undefined; cargando: boolean; error: string | null;
}) {
  const total = llantas?.length ?? 0;
  return (
    <div className="insp-alm__caja insp-alm__caja--grupo">
      <span className="insp-alm__cab">{icono} {titulo} <span className="insp-alm__conteo">{total}</span></span>
      <p className="insp-alm__nota">{nota}</p>
      {error ? <p className="insp-alm__error" role="alert">No se pudo cargar: {error}</p>
        : cargando ? <p className="insp-alm__nota">Cargando…</p>
          : total === 0 ? <p className="insp-alm__nota">Sin llantas en este grupo.</p>
            : (
              <ul className="insp-alm__lista">
                {llantas!.map(l => (
                  <li key={l.codigo} className="insp-alm__item">
                    <strong>{l.codigo}</strong>
                    <span>{[l.marca, l.medida].filter(Boolean).join(' · ') || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
    </div>
  );
}

export const AlmacenesNeumaticos = forwardRef<AlmacenesHandle, AlmacenesProps>(function AlmacenesNeumaticos(props, ref) {
  const { placa, km, onRetirada, onMontada, zonaSobre = null } = props;
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const puedeBaja = can(PERMISO_BAJA);
  const papeleraRef = useRef<HTMLDivElement>(null);
  const reencaucheRef = useRef<HTMLDivElement>(null);
  // Las funciones del handle leen siempre las props actuales (llantas, km) sin volver a crearlo
  const vivo = useRef(props);
  vivo.current = props;

  // Repisa: llantas en almacén de nuevas o reparadas (no montadas, no en reencauche ni en desecho)
  const disponibles = useQuery<{ ok?: boolean; data?: LlantaDisponible[] }>({
    queryKey: ['neumaticos', 'repisa'],
    queryFn: () => api<{ ok?: boolean; data?: LlantaDisponible[] }>('/neumaticos/llantas'),
    staleTime: 0,
  });
  const lista = (disponibles.data?.data ?? []).filter(l => l.almacen_id === ALMACEN_NUEVAS || l.almacen_id === ALMACEN_REPARADAS);
  // Los cuatro grupos de almacén: siempre se muestran, con su conteo (0 si no hay llantas)
  const grupos = useQuery<RespGrupos>({
    queryKey: ['neumaticos', 'almacenes'],
    queryFn: () => api<RespGrupos>('/neumaticos/almacenes'),
    staleTime: 0,
  });
  const gDatos = grupos.data?.grupos;
  const nGrupo = (clave: keyof NonNullable<RespGrupos['grupos']>) => (gDatos ? gDatos[clave].length : 0);

  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Llanta de la repisa que se arrastra (fantasma que sigue al puntero)
  const [fantasma, setFantasma] = useState<{ x: number; y: number; texto: string } | null>(null);
  const arrastre = useRef<{ id: number; x0: number; y0: number; activo: boolean; llanta: LlantaDisponible } | null>(null);

  useImperativeHandle(ref, () => ({
    soltarDesdeModelo(posicion, x, y) {
      const enPapelera = dentro(papeleraRef.current, x, y);
      // Cayó en el aire: la llanta vuelve a su eje y no pasa nada
      if (!enPapelera && !dentro(reencaucheRef.current, x, y)) return;
      const l = vivo.current.llantas.find(item => item.posicion === posicion);
      if (!l || posicionVacia(l)) { toast(`La posición #${posicion} está vacía.`, 'error'); return; }
      if (!l.codigo.trim()) { toast(`La llanta #${posicion} no tiene código. Escríbelo en el editor antes de retirarla.`, 'error'); return; }
      setObservacion(''); setError(null);
      setDialogo({ tipo: 'retiro', posicion, codigo: l.codigo.trim().toUpperCase(), destino: enPapelera ? null : 'reencauche' });
    },
    zonaBajo(x, y) {
      if (dentro(papeleraRef.current, x, y)) return 'papelera';
      if (dentro(reencaucheRef.current, x, y)) return 'reencauche';
      return null;
    },
  }), [toast]);

  function montarEn(posicion: string, llanta: LlantaDisponible) {
    const l = vivo.current.llantas.find(item => item.posicion === posicion);
    if (!l) return;
    if (!posicionVacia(l)) { toast(`La posición #${posicion} ya tiene una llanta. Retírala antes de montar otra.`, 'error'); return; }
    setError(null);
    setDialogo({ tipo: 'montaje', posicion, llanta });
  }

  // Arrastre desde la repisa: se mueve un fantasma y, al soltar, se busca la posición del modelo bajo el puntero
  function iniciarArrastre(e: ReactPointerEvent<HTMLButtonElement>, llanta: LlantaDisponible) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, activo: false, llanta };
  }
  function moverArrastre(e: ReactPointerEvent<HTMLButtonElement>) {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) <= 6) return;
      a.activo = true;
    }
    setFantasma({ x: e.clientX, y: e.clientY, texto: a.llanta.codigo });
  }
  function terminarArrastre(e: ReactPointerEvent<HTMLButtonElement>, cancelado: boolean) {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setFantasma(null);
    if (!a.activo || cancelado) return;
    const modelo = vivo.current.modeloPosRef.current;
    if (!modelo) { toast('No hay modelo 3D para elegir la posición en este equipo.', 'error'); return; }
    const posicion = modelo(e.clientX, e.clientY);
    if (posicion) montarEn(posicion, a.llanta);
  }

  function cerrar() {
    if (!enviando) setDialogo(null);
  }

  async function confirmar() {
    if (!dialogo || enviando) return;
    if (!String(km).trim()) { setError('Indica el kilometraje de la unidad antes de continuar.'); return; }
    if (dialogo.tipo === 'retiro') {
      if (!dialogo.destino) { setError('Elige si la llanta va a desecho o a reencauche.'); return; }
      // Desecho definitivo: solo con permiso de baja. Sin permiso se avisa y no se envía nada.
      if (dialogo.destino === 'desecho' && !puedeBaja) { setError(AVISO_BAJA); toast(AVISO_BAJA, 'error'); return; }
    }
    setEnviando(true); setError(null);
    try {
      if (dialogo.tipo === 'retiro') {
        const r = await api<{ ok?: boolean; error?: string }>('/neumaticos/retirar', {
          method: 'POST',
          body: { codigo: dialogo.codigo, placa, posicion: dialogo.posicion, destino: dialogo.destino, km: numero(km), observacion: observacion.trim() },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo retirar la llanta');
        onRetirada(dialogo.posicion);
        toast(`Llanta ${dialogo.codigo} ${dialogo.destino === 'desecho' ? 'dada de baja' : 'enviada a reencauche'}`);
      } else {
        const r = await api<{ ok?: boolean; error?: string }>('/neumaticos/instalar', {
          method: 'POST',
          body: { codigo: dialogo.llanta.codigo, placa, posicion: dialogo.posicion, km: numero(km) },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo montar la llanta');
        onMontada(dialogo.posicion, dialogo.llanta);
        toast(`Llanta ${dialogo.llanta.codigo} montada en #${dialogo.posicion}`);
      }
      // Solo la repisa y los grupos: no se invalida la última inspección, porque recargarla reemplazaría lo que se está editando
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['neumaticos', 'repisa'] }),
        qc.invalidateQueries({ queryKey: ['neumaticos', 'almacenes'] }),
      ]);
      setDialogo(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = dialogo?.tipo === 'montaje' ? `Montar llanta en #${dialogo.posicion}` : `Retirar llanta de #${dialogo?.posicion ?? ''}`;

  return (
    <>
      <section className="insp-alm" aria-label="Almacenes de llantas">
        <div ref={papeleraRef} className={`insp-alm__caja insp-alm__caja--papelera${zonaSobre === 'papelera' ? ' insp-alm__caja--sobre' : ''}`}>
          <span className="insp-alm__cab"><Trash2 size={16} aria-hidden /> Desechadas · Papelera <span className="insp-alm__conteo">{nGrupo('desechadas')}</span></span>
          <p className="insp-alm__nota">Suelta aquí una llanta del modelo para darla de baja: desecho definitivo o reencauche.</p>
        </div>
        <div ref={reencaucheRef} className={`insp-alm__caja insp-alm__caja--reencauche${zonaSobre === 'reencauche' ? ' insp-alm__caja--sobre' : ''}`}>
          <span className="insp-alm__cab"><Recycle size={16} aria-hidden /> Para reencauche <span className="insp-alm__conteo">{nGrupo('enviar_reforma')}</span></span>
          <p className="insp-alm__nota">Suelta aquí una llanta del modelo para enviarla a reencauchar.</p>
        </div>
        <GrupoLlantas titulo="Reencauchadas" icono={<Recycle size={16} aria-hidden />} nota="Regresaron del reencauche (almacén Reparadas)."
          llantas={gDatos?.reencauchadas} cargando={grupos.isLoading} error={grupos.isError ? errorMessage(grupos.error) : null} />
        <GrupoLlantas titulo="Disponibles" icono={<Warehouse size={16} aria-hidden />} nota="Nuevas o de reencauche, con código de fuego."
          llantas={gDatos?.disponibles} cargando={grupos.isLoading} error={grupos.isError ? errorMessage(grupos.error) : null} />
        <div className="insp-alm__caja insp-alm__caja--repisa">
          <span className="insp-alm__cab"><Warehouse size={16} aria-hidden /> Repisa para montar ({lista.length})</span>
          <p className="insp-alm__nota">Arrastra una llanta a una posición vacía del modelo para montarla.</p>
          <div className="insp-alm__repisa">
            {disponibles.isLoading ? (
              <p className="insp-alm__nota">Cargando llantas…</p>
            ) : disponibles.isError ? (
              <p className="insp-alm__error" role="alert">No se pudo cargar la repisa: {errorMessage(disponibles.error)}</p>
            ) : lista.length === 0 ? (
              <p className="insp-alm__nota">Sin llantas nuevas ni reparadas.</p>
            ) : lista.map(l => (
              <button key={l.codigo} type="button" className="insp-alm__llanta" aria-label={`Llanta ${l.codigo}, arrastrar a una posición vacía del modelo`}
                onPointerDown={e => iniciarArrastre(e, l)} onPointerMove={moverArrastre}
                onPointerUp={e => terminarArrastre(e, false)} onPointerCancel={e => terminarArrastre(e, true)}>
                <strong>{l.codigo}</strong>
                <span>{[condicionDe(l.almacen_id), l.marca, l.medida].filter(Boolean).join(' · ') || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {fantasma && createPortal(
        <div className="insp-alm__fantasma" style={{ left: fantasma.x, top: fantasma.y }}>{fantasma.texto}</div>,
        document.body,
      )}

      <Sheet open={!!dialogo} onClose={cerrar} title={titulo}
        footer={dialogo && (
          <>
            <Button variant="secondary" onClick={cerrar} disabled={enviando}>Cancelar</Button>
            <Button variant={dialogo.tipo === 'retiro' && dialogo.destino === 'desecho' ? 'destructive' : 'primary'} onClick={confirmar} loading={enviando}>
              {dialogo.tipo === 'montaje' ? 'Montar llanta' : 'Confirmar'}
            </Button>
          </>
        )}>
        {dialogo && (
          <div className="insp-alm__dialogo">
            <p className="insp-alm__texto">
              Llanta <strong>{dialogo.tipo === 'retiro' ? dialogo.codigo : dialogo.llanta.codigo}</strong> · Placa {placa} · Km {km || '—'}
            </p>
            {dialogo.tipo === 'retiro' ? (
              <>
                <p className="insp-alm__titulo">¿Desecho definitivo o reencauche?</p>
                <div className="insp-alm__opciones" role="group" aria-label="Destino de la llanta">
                  <button type="button" className="insp-alm__opcion pressable" aria-pressed={dialogo.destino === 'desecho'}
                    onClick={() => setDialogo({ ...dialogo, destino: 'desecho' })}>Desecho definitivo</button>
                  <button type="button" className="insp-alm__opcion pressable" aria-pressed={dialogo.destino === 'reencauche'}
                    onClick={() => setDialogo({ ...dialogo, destino: 'reencauche' })}>Reencauche</button>
                </div>
                {dialogo.destino === 'desecho' && !puedeBaja && <p className="insp-alm__error" role="alert">{AVISO_BAJA}</p>}
                <Field label="Observación">{p => <TextInput {...p} value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Opcional" />}</Field>
              </>
            ) : (
              <p className="insp-alm__texto">Se monta en la posición #{dialogo.posicion} con los datos de la repisa. Después se miden sus remanentes.</p>
            )}
            {error && <p className="insp-alm__error insp-alm__error--bloque" role="alert">{error}</p>}
          </div>
        )}
      </Sheet>
    </>
  );
});
