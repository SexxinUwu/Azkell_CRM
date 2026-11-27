import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { hoyLima } from '../../core/lib/format';
import { Button } from '../../core/ui/Button';
import { Lock } from 'lucide-react';
import { formatFechaPe } from '../../core/lib/format';
import { useToast } from '../../core/ui/Toast';
import type { LlantaTablero } from './neumaticos-tablero-tipos';
import { RemanenteChip } from './ntb-llanta';
import type { Propuesta } from './ntb-movimiento-sheet';
import { InspeccionPosicionSheet, type MedidaPosicion } from './insp-neumatico-modal';
import './insp-neumatico.css';

// Modo «inspección» del tablero de movimientos: cabecera (fecha, técnico, kilometraje, días), medición por posición con fotos,
// tabla de resumen con los dos Psi (como se encontró y como se deja) y la acción que se anota sola según los movimientos hechos.

export interface Fila { codigo: string; r1: string; r2: string; r3: string; fotos: string[]; psiEncontrado: string; psiDejado: string; estado: string; obs: string }
type Montada = { posicion: string; llanta: LlantaTablero };

const aTexto = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '' : String(Math.round(Number(n))));
export const minimoDe = (f: { r1: string; r2: string; r3: string }) => {
  const v = [f.r1, f.r2, f.r3].map(Number).filter(x => Number.isFinite(x) && x > 0);
  return v.length ? Math.min(...v) : null;
};

/** La acción de cada posición se anota sola según lo que se hizo ahí durante la inspección */
export type AccionPosicion = 'Inspección' | 'Instalación' | 'Cambio' | 'Rotación';
interface Movimiento { posicion: string | null; accion: AccionPosicion | null; texto: string; /** Observación automática de la fila (ej. «De Posición #2 a Posición #1») */ nota?: string }

export function useInspeccion({ activa, placa, montadas, conGps = true, psiDefecto = 100 }: { activa: boolean; placa: string; montadas: Montada[]; conGps?: boolean; psiDefecto?: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  // Fecha y técnico no se editan; el kilometraje es la lectura de GPS de hoy
  const fecha = hoyLima();
  const tecnico = user?.name ?? '';
  const [dias, setDias] = useState('30');
  const [hechas, setHechas] = useState<Record<string, Fila>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [guardando, setGuardando] = useState(false);

  const catalogos = useQuery<{ estados?: string[] }>({ queryKey: ['mant', 'neu-catalogos'], enabled: activa, staleTime: 600_000, queryFn: () => api('/neumaticos/catalogos') });
  const estados = catalogos.data?.estados?.length ? catalogos.data.estados : ['NUEVA', 'RENCAUCHADA'];
  const kmGps = useQuery<{ ok?: boolean; km: number | null; fecha: string | null }>({
    queryKey: ['mant', 'neu-km-gps', placa, fecha], enabled: activa && !!placa && conGps, staleTime: 60_000,
    queryFn: () => api(`/neumaticos/km-gps/${encodeURIComponent(placa)}`, { query: { fecha } }),
  });
  const km = kmGps.data?.km != null ? String(kmGps.data.km) : '';

  useEffect(() => { setHechas({}); setAbierta(null); setMovimientos([]); }, [placa]);

  const estadoDe = (l: LlantaTablero) => (l.vida != null && l.vida > 0 ? 'RENCAUCHADA' : 'NUEVA');
  // Una medición solo vale para la llanta que estaba medida: si la posición cambió de llanta durante la inspección, hay que medir la nueva
  const vigentes = useMemo(() => {
    const out: Record<string, Fila> = {};
    for (const m of montadas) { const h = hechas[m.posicion]; if (h && h.codigo === m.llanta.codigo) out[m.posicion] = h; }
    return out;
  }, [hechas, montadas]);

  const accionDe = (pos: string): AccionPosicion => {
    const ult = [...movimientos].reverse().find(m => m.posicion === pos && m.accion);
    return ult?.accion ?? 'Inspección';
  };

  /** Observación automática de la posición (la rotación dice de dónde a dónde se movió) */
  const notaDe = (pos: string): string => {
    const ult = [...movimientos].reverse().find(m => m.posicion === pos && m.nota);
    return ult?.nota ?? '';
  };

  /** Lo que se guarda de cada posición: lo confirmado en la ventana o, si no se tocó, cómo está ahora la llanta */
  const filaDe = (m: Montada): Fila => vigentes[m.posicion] ?? {
    codigo: m.llanta.codigo, r1: aTexto(m.llanta.r1), r2: aTexto(m.llanta.r2), r3: aTexto(m.llanta.r3), fotos: [],
    // Encontrado: vacío para llenarlo; dejado: el valor habitual de la unidad (editable)
    psiEncontrado: '', psiDejado: String(psiDefecto),
    estado: estadoDe(m.llanta), obs: '',
  };

  const llantaAbierta = abierta ? montadas.find(m => m.posicion === abierta)?.llanta ?? null : null;
  const montadaAbierta = abierta ? montadas.find(m => m.posicion === abierta) ?? null : null;
  const inicialModal: MedidaPosicion = montadaAbierta
    ? (({ r1, r2, r3, fotos, psiEncontrado, psiDejado, estado, obs }) => ({ r1, r2, r3, fotos, psiEncontrado, psiDejado, estado, obs }))(filaDe(montadaAbierta))
    : { r1: '', r2: '', r3: '', fotos: [], psiEncontrado: '', psiDejado: '', estado: 'NUEVA', obs: '' };

  function confirmar(m: MedidaPosicion) {
    if (!abierta || !llantaAbierta) return;
    const pos = abierta;
    setHechas(h => ({ ...h, [pos]: { codigo: llantaAbierta.codigo, ...m } }));
    setAbierta(null);
  }

  /** Anota solo lo que se hizo en la unidad (instalar, cambiar, enviar) para la acción de cada posición y las observaciones de la inspección */
  function registrar(p: Propuesta, mensaje: string) {
    if (p.clase === 'rotacion') {
      // Las dos posiciones cambian de llanta (o la de origen queda libre): ambas se marcan como rotación
      setMovimientos(m => [
        ...m,
        { posicion: p.posicion, accion: 'Rotación', texto: `Pos ${p.posicion}: ${mensaje}`, nota: `De Posición #${p.desde} a Posición #${p.posicion}` },
        ...(p.ocupante ? [{ posicion: p.desde, accion: 'Rotación' as const, texto: `Pos ${p.desde}: ${p.ocupante.codigo} rotada desde ${p.posicion}`, nota: `De Posición #${p.posicion} a Posición #${p.desde}` }] : []),
      ]);
      return;
    }
    const pos = 'posicion' in p ? p.posicion : null;
    const accion: AccionPosicion | null = p.clase === 'instalar' || p.clase === 'regreso' ? 'Instalación' : p.clase === 'intercambio' ? 'Cambio' : null;
    setMovimientos(m => [...m, { posicion: pos, accion, texto: pos ? `Pos ${pos}: ${mensaje}` : mensaje }]);
  }

  async function guardar() {
    if (!montadas.length) { toast('La unidad no tiene neumáticos montados', 'error'); return; }
    if (conGps && !(Number(km) > 0)) { toast('No hay lectura de GPS del kilometraje de esta unidad: no se puede guardar la inspección', 'error'); return; }
    // Se guardan todas las llantas como estén en este momento: las que no se tocaron conservan su última medición
    const incompletas = montadas.filter(m => {
      const f = filaDe(m);
      return [f.r1, f.r2, f.r3].some(v => !(Number(v) >= 1)) || !(Number(f.psiEncontrado) > 0) || !(Number(f.psiDejado) > 0);
    }).map(m => m.posicion);
    if (incompletas.length) { toast(`Completa las medidas y el Psi de la posición ${incompletas.join(', ')} (toca la fila para abrirla)`, 'error'); return; }
    const items = montadas.map(m => {
      const { posicion, llanta } = m;
      const h = filaDe(m);
      return {
        posicion, marca: llanta.marca ?? '', medida: llanta.medida ?? '', modelo: llanta.modelo ?? '',
        r1: Number(h.r1), r2: Number(h.r2), r3: Number(h.r3),
        // presion_ant = como se encontró al ingresar; presion_actual = como se deja
        presion_ant: Number(h.psiEncontrado), presion_actual: Number(h.psiDejado),
        estado: h.estado, accion: accionDe(posicion), rot: accionDe(posicion) === 'Rotación' ? 'SI' : 'NO',
        observaciones: [notaDe(posicion), h.obs.trim()].filter(Boolean).join(' · '),
        foto1: h.fotos[0] ?? null, foto2: h.fotos[1] ?? null, foto3: h.fotos[2] ?? null,
      };
    });
    const resumenMov = movimientos.length ? `Movimientos durante la inspección: ${movimientos.map(m => m.texto).join('; ')}.` : '';
    setGuardando(true);
    try {
      const r = await api<{ ok: boolean; id_inspeccion?: string; error?: string }>('/neumaticos/inspecciones', {
        method: 'POST',
        body: { placa, fecha_inspeccion: fecha, km_vehiculo: Number(km) || 0, odometro_km: String(Number(km) || 0), inspector: tecnico.trim(), dias_propuestos: Number(dias) || 30, observaciones: resumenMov, items, llantas_inspeccionadas: items },
      });
      if (!r.ok) throw new Error(r.error ?? 'No se pudo guardar la inspección');
      toast(`Inspección ${r.id_inspeccion ?? ''} registrada`);
      for (const k of [['mant', 'neumaticos'], ['mant', 'neumaticos-analisis'], ['mant', 'neumaticos-estado-actual'], ['mant', 'neumaticos-tablero', placa], ['mant', 'neumatico-ficha']]) void qc.invalidateQueries({ queryKey: k });
      navigate(-1);
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setGuardando(false); }
  }

  return {
    conGps, fecha, tecnico, km, kmFecha: kmGps.data?.fecha ?? null, kmCargando: kmGps.isLoading, dias, setDias, estados,
    vigentes, filaDe, abierta, abrir: (pos: string) => setAbierta(pos), cerrar: () => setAbierta(null), llantaAbierta, inicialModal, confirmar,
    accionDe, notaDe, registrar, guardar, guardando, movimientos,
    /** El plano muestra lo medido en esta inspección (cambia el color al confirmar) */
    medido: (pos: string) => vigentes[pos] ?? null,
  };
}
export type EstadoInspeccion = ReturnType<typeof useInspeccion>;

/** Dato de la cabecera que no se edita (fecha, técnico, kilometraje de GPS) */
function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho: string }) {
  return (
    <div className="ninsp-dato" style={{ width: ancho }}>
      <span className="ninsp-dato__etiqueta">{etiqueta}</span>
      <div className="ninsp-dato__valor" aria-label={etiqueta}><span>{valor}</span><Lock size={12} aria-hidden /></div>
    </div>
  );
}

export function InspeccionCabecera({ e }: { e: EstadoInspeccion; placa: string }) {
  const navigate = useNavigate();
  const kmTexto = e.km ? `${Number(e.km).toLocaleString('es-PE')} km` : e.kmCargando ? 'Leyendo GPS…' : 'Sin lectura GPS';
  return (
    <div className="ninsp-barra">
      <Button variant="plain" className="ninsp-atras" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Atrás</Button>
      <Dato etiqueta="Fecha" valor={formatFechaPe(e.fecha)} ancho="9rem" />
      <Dato etiqueta="Técnico" valor={e.tecnico || '—'} ancho="14rem" />
      {e.conGps && <Dato etiqueta={e.kmFecha ? `Kilometraje · GPS del ${formatFechaPe(e.kmFecha)}` : 'Kilometraje · GPS'} valor={kmTexto} ancho="14rem" />}
      <div className="ninsp-cab__dias">
        <label htmlFor="ninsp-dias">Próxima en</label>
        <input id="ninsp-dias" inputMode="numeric" value={e.dias} onChange={ev => e.setDias(ev.target.value.replace(/\D/g, '').slice(0, 3))} />
        <span>días</span>
      </div>
    </div>
  );
}

export function InspeccionResumen({ e, montadas }: { e: EstadoInspeccion; montadas: Montada[] }) {
  const modificadas = montadas.filter(m => e.vigentes[m.posicion]).length;
  return (
    <>
      <section className="ninsp-resumen" aria-label="Resumen de la inspección">
        <h2 className="ninsp-resumen__titulo">Resumen <span className="ninsp-resumen__cuenta">{modificadas} de {montadas.length} con cambios</span></h2>
        <div className="ninsp-resumen__scroll">
          <table className="ninsp-tabla">
            <thead>
              <tr><th>#</th><th>Cód. fuego</th><th>Marca</th><th>Medida</th><th>Modelo</th><th>R1</th><th>R2</th><th>R3</th><th>Mín.</th><th>Psi encontrado</th><th>Psi dejado</th><th>Acción</th><th>Estado</th><th>Observación</th></tr>
            </thead>
            <tbody>
              {montadas.map(m => {
                const { posicion, llanta } = m;
                const h = e.vigentes[posicion];
                const r = e.filaDe(m);
                const accion = e.accionDe(posicion);
                const obs = [e.notaDe(posicion), r.obs].filter(Boolean).join(' · ');
                return (
                  <tr key={posicion} className={`ninsp-tabla__fila${h ? ' ninsp-tabla__fila--hecha' : ''}`} onClick={() => e.abrir(posicion)}>
                    <td className="ninsp-tabla__pos">{h ? <Check size={14} aria-label="Con cambios" /> : null}{posicion}</td>
                    <td className="ninsp-tabla__codigo">{llanta.codigo}</td>
                    <td>{llanta.marca ?? '—'}</td><td>{llanta.medida ?? '—'}</td><td>{llanta.modelo ?? '—'}</td>
                    <td className="ninsp-tabla__num">{r.r1 || '—'}</td><td className="ninsp-tabla__num">{r.r2 || '—'}</td><td className="ninsp-tabla__num">{r.r3 || '—'}</td>
                    <td><RemanenteChip mm={minimoDe(r)} /></td>
                    <td className="ninsp-tabla__num">{r.psiEncontrado || '—'}</td>
                    <td className="ninsp-tabla__num">{r.psiDejado || '—'}</td>
                    <td><span className={`ninsp-accion${accion !== 'Inspección' ? ' ninsp-accion--mov' : ''}`}>{accion}</span></td>
                    <td>{r.estado || '—'}</td>
                    <td className="ninsp-tabla__obs">{obs || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {e.movimientos.length > 0 && (
          <p className="ninsp-movs"><strong>Movimientos de esta inspección:</strong> {e.movimientos.map(m => m.texto).join(' · ')}</p>
        )}
      </section>
      <div className="ninsp-pie">
        <span className="t-footnote c-secondary">Toca una llanta (en el plano o en la tabla) para cambiar sus medidas, Psi, estado, observación o fotos. Al guardar se registran todas las llantas como estén en ese momento.</span>
        <Button variant="primary" size="lg" onClick={() => { void e.guardar(); }} loading={e.guardando} disabled={montadas.length === 0 || (e.conGps && !e.km)}>Guardar</Button>
      </div>
    </>
  );
}

export function InspeccionModal({ e }: { e: EstadoInspeccion }) {
  return <InspeccionPosicionSheet abierta={!!e.abierta} posicion={e.abierta ?? ''} llanta={e.llantaAbierta} inicial={e.inicialModal} estados={e.estados} onConfirmar={e.confirmar} onClose={e.cerrar} />;
}
