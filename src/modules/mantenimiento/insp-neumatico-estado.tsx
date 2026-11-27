import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { hoyLima } from '../../core/lib/format';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
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
interface UltimaInsp { km_vehiculo?: number | null }

const aTexto = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '' : String(Math.round(Number(n))));
export const minimoDe = (f: { r1: string; r2: string; r3: string }) => {
  const v = [f.r1, f.r2, f.r3].map(Number).filter(x => Number.isFinite(x) && x > 0);
  return v.length ? Math.min(...v) : null;
};

/** La acción de cada posición se anota sola según lo que se hizo ahí durante la inspección */
export type AccionPosicion = 'Inspección' | 'Instalación' | 'Cambio' | 'Rotación';
interface Movimiento { posicion: string | null; accion: AccionPosicion | null; texto: string; /** Observación automática de la fila (ej. «De Posición #2 a Posición #1») */ nota?: string }

export function useInspeccion({ activa, placa, montadas }: { activa: boolean; placa: string; montadas: Montada[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [fecha, setFecha] = useState(() => hoyLima());
  const [tecnico, setTecnico] = useState('');
  const [km, setKm] = useState('');
  const [dias, setDias] = useState('30');
  const [hechas, setHechas] = useState<Record<string, Fila>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [guardando, setGuardando] = useState(false);

  const ultima = useQuery<UltimaInsp>({ queryKey: ['mant', 'neumaticos-placa-ultima', placa], enabled: activa && !!placa, staleTime: 60_000, queryFn: () => api<UltimaInsp>(`/neumaticos/placa-ultima/${encodeURIComponent(placa)}`) });
  const catalogos = useQuery<{ estados?: string[] }>({ queryKey: ['mant', 'neu-catalogos'], enabled: activa, staleTime: 600_000, queryFn: () => api('/neumaticos/catalogos') });
  const estados = catalogos.data?.estados?.length ? catalogos.data.estados : ['NUEVA', 'RENCAUCHADA'];

  useEffect(() => { setHechas({}); setAbierta(null); setMovimientos([]); setKm(''); }, [placa]);
  useEffect(() => { if (activa && !tecnico && user?.name) setTecnico(user.name); }, [activa, user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const llantaAbierta = abierta ? montadas.find(m => m.posicion === abierta)?.llanta ?? null : null;
  const inicialModal: MedidaPosicion = abierta
    ? (vigentes[abierta] ? { r1: vigentes[abierta].r1, r2: vigentes[abierta].r2, r3: vigentes[abierta].r3, fotos: vigentes[abierta].fotos }
      : { r1: aTexto(llantaAbierta?.r1), r2: aTexto(llantaAbierta?.r2), r3: aTexto(llantaAbierta?.r3), fotos: [] })
    : { r1: '', r2: '', r3: '', fotos: [] };

  function confirmar(m: MedidaPosicion) {
    if (!abierta || !llantaAbierta) return;
    const pos = abierta;
    setHechas(h => ({ ...h, [pos]: { codigo: llantaAbierta.codigo, ...m, psiEncontrado: vigentes[pos]?.psiEncontrado ?? '', psiDejado: vigentes[pos]?.psiDejado ?? '', estado: vigentes[pos]?.estado ?? estadoDe(llantaAbierta), obs: vigentes[pos]?.obs ?? '' } }));
    setAbierta(null);
  }
  const cambiar = (pos: string, campo: 'psiEncontrado' | 'psiDejado' | 'estado' | 'obs', v: string) => setHechas(h => {
    const f = h[pos]; if (!f) return h;
    // Lo más común es dejarla como se encontró: al escribir el primer Psi, el segundo se propone igual
    const igualar = campo === 'psiEncontrado' && (f.psiDejado === '' || f.psiDejado === f.psiEncontrado);
    return { ...h, [pos]: { ...f, [campo]: v, ...(igualar ? { psiDejado: v } : {}) } };
  });

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
    const pos = montadas.filter(m => vigentes[m.posicion]);
    if (!pos.length) { toast('Inspecciona al menos un neumático', 'error'); return; }
    if (!fecha) { toast('Ingresa la fecha', 'error'); return; }
    if (!(Number(km) > 0)) { toast('Ingresa el kilometraje de la unidad (mayor a 0)', 'error'); return; }
    const sinPsi = pos.filter(m => !(Number(vigentes[m.posicion].psiEncontrado) > 0) || !(Number(vigentes[m.posicion].psiDejado) > 0)).map(m => m.posicion);
    if (sinPsi.length) { toast(`Falta el Psi (cómo se encontró y cómo se deja) en la posición ${sinPsi.join(', ')}`, 'error'); return; }
    const sinMedir = montadas.filter(m => !vigentes[m.posicion] && accionDe(m.posicion) !== 'Inspección').map(m => m.posicion);
    if (sinMedir.length) { toast(`Mide la posición ${sinMedir.join(', ')}: tuvo movimiento y debe quedar en la inspección`, 'error'); return; }
    const items = pos.map(({ posicion, llanta }) => {
      const h = vigentes[posicion];
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
        body: { placa, fecha_inspeccion: fecha, km_vehiculo: Number(km), odometro_km: String(Number(km)), inspector: tecnico.trim(), dias_propuestos: Number(dias) || 30, observaciones: resumenMov, items, llantas_inspeccionadas: items },
      });
      if (!r.ok) throw new Error(r.error ?? 'No se pudo guardar la inspección');
      toast(`Inspección ${r.id_inspeccion ?? ''} registrada`);
      for (const k of [['mant', 'neumaticos'], ['mant', 'neumaticos-analisis'], ['mant', 'neumaticos-estado-actual'], ['mant', 'neumaticos-tablero', placa], ['mant', 'neumatico-ficha']]) void qc.invalidateQueries({ queryKey: k });
      navigate(-1);
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setGuardando(false); }
  }

  return {
    fecha, setFecha, tecnico, setTecnico, km, setKm, dias, setDias, estados, ultimaKm: ultima.data?.km_vehiculo ?? null,
    vigentes, abierta, abrir: (pos: string) => setAbierta(pos), cerrar: () => setAbierta(null), llantaAbierta, inicialModal, confirmar, cambiar,
    accionDe, notaDe, registrar, guardar, guardando, movimientos,
    /** El plano muestra lo medido en esta inspección (cambia el color al confirmar) */
    medido: (pos: string) => vigentes[pos] ?? null,
  };
}
export type EstadoInspeccion = ReturnType<typeof useInspeccion>;

export function InspeccionCabecera({ e, placa }: { e: EstadoInspeccion; placa: string }) {
  const navigate = useNavigate();
  return (
    <div className="ninsp-barra">
      <Button variant="plain" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Atrás</Button>
      <div className="ninsp-datos">
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={e.fecha} max={hoyLima()} onChange={ev => e.setFecha(ev.target.value)} />}</Field>
        <Field label="Técnico">{p => <TextInput {...p} value={e.tecnico} onChange={ev => e.setTecnico(ev.target.value)} placeholder="Nombre del técnico" />}</Field>
        <Field label="Kilometraje" hint={e.ultimaKm ? `Última inspección: ${Number(e.ultimaKm).toLocaleString('es-PE')} km` : undefined}>
          {p => <TextInput {...p} inputMode="numeric" value={e.km} onChange={ev => e.setKm(ev.target.value.replace(/\D/g, ''))} placeholder="0" disabled={!placa} />}
        </Field>
      </div>
      <div className="ninsp-cab__dias">
        <label htmlFor="ninsp-dias">Próxima en</label>
        <input id="ninsp-dias" inputMode="numeric" value={e.dias} onChange={ev => e.setDias(ev.target.value.replace(/\D/g, '').slice(0, 3))} />
        <span>días</span>
      </div>
    </div>
  );
}

export function InspeccionResumen({ e, montadas }: { e: EstadoInspeccion; montadas: Montada[] }) {
  const hechas = montadas.filter(m => e.vigentes[m.posicion]).length;
  return (
    <>
      <section className="ninsp-resumen" aria-label="Resumen de la inspección">
        <h2 className="ninsp-resumen__titulo">Resumen <span className="ninsp-resumen__cuenta">{hechas} de {montadas.length} inspeccionados</span></h2>
        <div className="ninsp-resumen__scroll">
          <table className="ninsp-tabla">
            <thead>
              <tr><th>#</th><th>Marca</th><th>Medida</th><th>Modelo</th><th>R1</th><th>R2</th><th>R3</th><th>Mín.</th><th>Psi encontrado</th><th>Psi dejado</th><th>Cód. fuego</th><th>Acción</th><th>Estado</th><th>Observación</th></tr>
            </thead>
            <tbody>
              {montadas.map(({ posicion, llanta }) => {
                const h = e.vigentes[posicion];
                const r = h ?? { r1: aTexto(llanta.r1), r2: aTexto(llanta.r2), r3: aTexto(llanta.r3) };
                const accion = e.accionDe(posicion);
                return (
                  <tr key={posicion} className={`ninsp-tabla__fila${h ? ' ninsp-tabla__fila--hecha' : ''}`} onClick={() => e.abrir(posicion)}>
                    <td className="ninsp-tabla__pos">{h ? <Check size={14} aria-label="Inspeccionada" /> : null}{posicion}</td>
                    <td>{llanta.marca ?? '—'}</td><td>{llanta.medida ?? '—'}</td><td>{llanta.modelo ?? '—'}</td>
                    <td className="ninsp-tabla__num">{r.r1 || '—'}</td><td className="ninsp-tabla__num">{r.r2 || '—'}</td><td className="ninsp-tabla__num">{r.r3 || '—'}</td>
                    <td><RemanenteChip mm={minimoDe(r)} /></td>
                    <td onClick={ev => ev.stopPropagation()}>{h ? <input className="ninsp-tabla__input ninsp-tabla__input--corto" inputMode="numeric" value={h.psiEncontrado} onChange={ev => e.cambiar(posicion, 'psiEncontrado', ev.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Psi con que se encontró la posición ${posicion}`} placeholder="Psi" /> : '—'}</td>
                    <td onClick={ev => ev.stopPropagation()}>{h ? <input className="ninsp-tabla__input ninsp-tabla__input--corto" inputMode="numeric" value={h.psiDejado} onChange={ev => e.cambiar(posicion, 'psiDejado', ev.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Psi con que se deja la posición ${posicion}`} placeholder="Psi" /> : '—'}</td>
                    <td className="ninsp-tabla__codigo">{llanta.codigo}</td>
                    <td><span className={`ninsp-accion${accion !== 'Inspección' ? ' ninsp-accion--mov' : ''}`}>{accion}</span></td>
                    <td onClick={ev => ev.stopPropagation()}>{h ? <select className="ninsp-tabla__input" value={h.estado} onChange={ev => e.cambiar(posicion, 'estado', ev.target.value)} aria-label={`Estado de la posición ${posicion}`}>{e.estados.map(s => <option key={s} value={s}>{s}</option>)}</select> : '—'}</td>
                    <td onClick={ev => ev.stopPropagation()}>{e.notaDe(posicion) && <div className="ninsp-nota">{e.notaDe(posicion)}</div>}{h ? <input className="ninsp-tabla__input" value={h.obs} onChange={ev => e.cambiar(posicion, 'obs', ev.target.value)} placeholder="Observación" aria-label={`Observación de la posición ${posicion}`} /> : (e.notaDe(posicion) ? null : '—')}</td>
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
        <span className="t-footnote c-secondary">Solo se guardan los neumáticos medidos y confirmados ({hechas}). Los movimientos (instalar, cambiar, enviar) ya quedan registrados al confirmarlos.</span>
        <Button variant="primary" size="lg" onClick={() => { void e.guardar(); }} loading={e.guardando} disabled={hechas === 0}>Guardar</Button>
      </div>
    </>
  );
}

export function InspeccionModal({ e }: { e: EstadoInspeccion }) {
  return <InspeccionPosicionSheet abierta={!!e.abierta} posicion={e.abierta ?? ''} llanta={e.llantaAbierta} inicial={e.inicialModal} onConfirmar={e.confirmar} onClose={e.cerrar} />;
}
