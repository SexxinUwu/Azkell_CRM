import './ntb.css';
import './insp-neumatico.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { hoyLima } from '../../core/lib/format';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { configParaPosiciones } from './NeumaticosEsquema';
import { NeumaticosCenital } from './nv3-cenital';
import type { ModoVista } from './nv3-motor';
import { PERMISO_VER_NEUMATICOS, type LlantaTablero } from './neumaticos-tablero-tipos';
import { tituloLlanta, usePlacasLista, useTablero } from './ntb-api';
import { RemanenteChip, aLlantaDato } from './ntb-llanta';
import { InspeccionPosicionSheet, type MedidaPosicion } from './insp-neumatico-modal';
import type { SondaPosicion } from './ntb-arrastre';

// Inspección de neumáticos de una unidad. Usa el mismo plano del tablero de movimientos: se toca un neumático (en el plano o en la tabla de
// resumen), se mide R1, R2 y R3 y se adjuntan fotos; al final «Guardar» registra solo las posiciones inspeccionadas (POST /neumaticos/inspecciones).

interface Fila { r1: string; r2: string; r3: string; fotos: string[]; psi: string; estado: string; obs: string }
interface UltimaInsp {
  ok?: boolean; km_vehiculo?: number | null; inspector?: string | null; fecha_inspeccion?: string | null;
  datosPosiciones?: Record<string, { presion_actual?: number | string | null }>;
}

const aTexto = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '' : String(Math.round(Number(n))));
const minimo = (f: { r1: string; r2: string; r3: string }) => {
  const v = [f.r1, f.r2, f.r3].map(Number).filter(x => Number.isFinite(x) && x > 0);
  return v.length ? Math.min(...v) : null;
};

function ListaLlantas({ titulo, llantas, vacio, clase }: { titulo: string; llantas: LlantaTablero[]; vacio: string; clase: string }) {
  return (
    <section className={`ninsp-zona ninsp-zona--${clase}`} aria-label={titulo}>
      <header className="ninsp-zona__cab"><h3>{titulo}</h3>{llantas.length > 0 && <span className="ntb-count">{llantas.length}</span>}</header>
      {llantas.length === 0 ? <p className="ninsp-zona__vacia">{vacio}</p> : (
        <ul className="ninsp-zona__lista">
          {llantas.map(l => (
            <li key={l.codigo}><strong>{l.codigo}</strong><span>{tituloLlanta(l)}</span><RemanenteChip mm={l.remanente_mm} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NeumaticosInspeccionPage() {
  const { placa: placaRuta } = useParams();
  const placa = (placaRuta ?? '').trim().toUpperCase();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can, user } = useAuth();
  const puedeVer = can(PERMISO_VER_NEUMATICOS);

  const placas = usePlacasLista();
  const tablero = useTablero(placa);
  const datos = tablero.data;
  const ultima = useQuery<UltimaInsp>({
    queryKey: ['mant', 'neumaticos-placa-ultima', placa], enabled: !!placa, staleTime: 60_000,
    queryFn: () => api<UltimaInsp>(`/neumaticos/placa-ultima/${encodeURIComponent(placa)}`),
  });
  const catalogos = useQuery<{ estados?: string[] }>({ queryKey: ['mant', 'neu-catalogos'], staleTime: 600_000, queryFn: () => api('/neumaticos/catalogos') });
  const estados = catalogos.data?.estados?.length ? catalogos.data.estados : ['NUEVA', 'RENCAUCHADA'];

  // Cabecera de la inspección
  const [fecha, setFecha] = useState(() => hoyLima());
  const [tecnico, setTecnico] = useState('');
  const [km, setKm] = useState('');
  const [dias, setDias] = useState('30');
  const [guardando, setGuardando] = useState(false);
  const [modo, setModo] = useState<ModoVista>('plano');
  const sondaRef = useRef<SondaPosicion | null>(null);
  // Lo medido en esta inspección, por posición (solo las posiciones confirmadas se guardan)
  const [hechas, setHechas] = useState<Record<string, Fila>>({});
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => { setHechas({}); setAbierta(null); setKm(''); }, [placa]);
  useEffect(() => { if (!tecnico && user?.name) setTecnico(user.name); }, [user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const posiciones = useMemo(() => datos?.posiciones ?? [], [datos]);
  const montadas = useMemo(() => posiciones.flatMap(p => (p.llanta ? [{ posicion: p.posicion, llanta: p.llanta }] : [])), [posiciones]);
  const configCodigo = configParaPosiciones(datos?.configuracion, posiciones.map(p => p.posicion));
  const marcaUnidad = (placas.data ?? []).find(p => p.placa === placa)?.marca ?? null;

  const previoPsi = (pos: string) => aTexto(Number(ultima.data?.datosPosiciones?.[pos]?.presion_actual)) || '100';
  const estadoDe = (l: LlantaTablero) => (l.vida != null && l.vida > 0 ? 'RENCAUCHADA' : 'NUEVA');

  // El plano refleja lo medido en esta inspección (el color cambia al confirmar)
  const llantasDato = useMemo(() => montadas.map(m => {
    const d = aLlantaDato(m.llanta, m.posicion);
    const h = hechas[m.posicion];
    if (!h) return d;
    return { ...d, r1: Number(h.r1), r2: Number(h.r2), r3: Number(h.r3), remanente_promedio: minimo(h) };
  }), [montadas, hechas]);

  const abiertaLlanta = abierta ? montadas.find(m => m.posicion === abierta)?.llanta ?? null : null;
  const inicialModal: MedidaPosicion = abierta
    ? (hechas[abierta] ? { r1: hechas[abierta].r1, r2: hechas[abierta].r2, r3: hechas[abierta].r3, fotos: hechas[abierta].fotos }
      : { r1: aTexto(abiertaLlanta?.r1), r2: aTexto(abiertaLlanta?.r2), r3: aTexto(abiertaLlanta?.r3), fotos: [] })
    : { r1: '', r2: '', r3: '', fotos: [] };

  function confirmarPosicion(m: MedidaPosicion) {
    if (!abierta || !abiertaLlanta) return;
    setHechas(h => ({ ...h, [abierta]: { ...m, psi: h[abierta]?.psi ?? previoPsi(abierta), estado: h[abierta]?.estado ?? estadoDe(abiertaLlanta), obs: h[abierta]?.obs ?? '' } }));
    setAbierta(null);
  }
  const cambiarFila = (pos: string, campo: 'psi' | 'estado' | 'obs', v: string) => setHechas(h => (h[pos] ? { ...h, [pos]: { ...h[pos], [campo]: v } } : h));

  async function guardar() {
    const hechasPos = montadas.filter(m => hechas[m.posicion]);
    if (!hechasPos.length) { toast('Inspecciona al menos un neumático', 'error'); return; }
    if (!fecha) { toast('Ingresa la fecha', 'error'); return; }
    if (!(Number(km) > 0)) { toast('Ingresa el kilometraje de la unidad (mayor a 0)', 'error'); return; }
    const items = hechasPos.map(({ posicion, llanta }) => {
      const h = hechas[posicion];
      return {
        posicion, marca: llanta.marca ?? '', medida: llanta.medida ?? '', modelo: llanta.modelo ?? '',
        r1: Number(h.r1), r2: Number(h.r2), r3: Number(h.r3),
        presion_ant: Number(previoPsi(posicion)) || 0, presion_actual: Number(h.psi) || 0,
        estado: h.estado, accion: 'Inspección', observaciones: h.obs.trim(),
        foto1: h.fotos[0] ?? null, foto2: h.fotos[1] ?? null, foto3: h.fotos[2] ?? null,
      };
    });
    setGuardando(true);
    try {
      const r = await api<{ ok: boolean; id_inspeccion?: string; error?: string }>('/neumaticos/inspecciones', {
        method: 'POST',
        body: { placa, fecha_inspeccion: fecha, km_vehiculo: Number(km), odometro_km: String(Number(km)), inspector: tecnico.trim(), dias_propuestos: Number(dias) || 30, observaciones: '', items, llantas_inspeccionadas: items },
      });
      if (!r.ok) throw new Error(r.error ?? 'No se pudo guardar la inspección');
      toast(`Inspección ${r.id_inspeccion ?? ''} registrada`);
      for (const k of [['mant', 'neumaticos'], ['mant', 'neumaticos-analisis'], ['mant', 'neumaticos-estado-actual'], ['mant', 'neumaticos-tablero', placa], ['mant', 'neumatico-ficha']]) void qc.invalidateQueries({ queryKey: k });
      navigate(-1);
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setGuardando(false); }
  }

  if (!puedeVer) {
    return <Page wide><EmptyState icon={<Lock size={22} />} title="Sin acceso">No tienes permiso para ver los neumáticos.</EmptyState></Page>;
  }

  const opcionesPlaca = (placas.data ?? []).filter(p => p.tiene_llantas || p.placa === placa).map(p => ({ placa: p.placa, detalle: p.cliente }));
  const total = montadas.length;
  const nHechas = montadas.filter(m => hechas[m.posicion]).length;

  return (
    <Page wide>
      <div className="ninsp-cab">
        <Button variant="plain" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Atrás</Button>
        <h1 className="ninsp-cab__titulo">Inspección neumática{placa ? <> · <LicensePlate plate={placa} size="sm" /></> : null}</h1>
        <div className="ninsp-cab__dias">
          <label htmlFor="ninsp-dias">Próxima en</label>
          <input id="ninsp-dias" inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <span>días</span>
        </div>
      </div>

      <div className="ninsp-datos">
        <Field label="Unidad">{p => <PlacaPicker id={p.id} value={placa} opciones={opcionesPlaca} placeholder="Elige una unidad…" onChange={x => navigate(`/mantenimiento/neumaticos-inspeccion/${encodeURIComponent(x)}`, { replace: true })} />}</Field>
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={fecha} max={hoyLima()} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Técnico">{p => <TextInput {...p} value={tecnico} onChange={e => setTecnico(e.target.value)} placeholder="Nombre del técnico" />}</Field>
        <Field label="Kilometraje" hint={ultima.data?.km_vehiculo ? `Última inspección: ${Number(ultima.data.km_vehiculo).toLocaleString('es-PE')} km` : undefined}>
          {p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} placeholder="0" />}
        </Field>
      </div>

      {!placa ? (
        <EmptyState icon={<Lock size={22} />} title="Elige una unidad">Selecciona la placa para ver sus neumáticos e inspeccionarlos.</EmptyState>
      ) : tablero.isLoading ? <PageLoader /> : tablero.error ? <Notice tone="error">{errorMessage(tablero.error)}</Notice> : (
        <>
          <div className="ninsp-cuerpo">
            <div className="ninsp-izq">
              <ListaLlantas titulo="Disponible" clase="bodega" llantas={datos?.disponibles ?? []} vacio="No hay llantas disponibles en bodega." />
              <ListaLlantas titulo="Reforma" clase="reforma" llantas={datos?.reforma ?? []} vacio="Sin llantas en reforma." />
              <ListaLlantas titulo="Descarte" clase="descarte" llantas={datos?.descarte ?? []} vacio="Sin llantas para descarte." />
            </div>
            <section className="card ninsp-plano" aria-label="Unidad">
              <p className="t-footnote c-secondary">{nHechas} de {total} neumáticos inspeccionados. Toca un neumático para medirlo.</p>
              {total > 0 ? (
                <NeumaticosCenital
                  llantas={llantasDato} configuracion={configCodigo} activa={abierta ?? ''} sondaRef={sondaRef}
                  onSelect={l => setAbierta(String(l.posicion))} marca={marcaUnidad} camion={/^C/i.test(datos?.configuracion ?? '')}
                  modo={modo} onModo={setModo} plano2d placa={placa}
                />
              ) : <p className="ntb-vacio">Esta unidad no tiene llantas montadas.</p>}
            </section>
          </div>

          <section className="ninsp-resumen" aria-label="Resumen de la inspección">
            <h2 className="ninsp-resumen__titulo">Resumen</h2>
            <div className="ninsp-resumen__scroll">
              <table className="ninsp-tabla">
                <thead>
                  <tr><th>#</th><th>Marca</th><th>Medida</th><th>Modelo</th><th>R1</th><th>R2</th><th>R3</th><th>Mín.</th><th>Psi</th><th>Cód. fuego</th><th>Estado</th><th>Observación</th></tr>
                </thead>
                <tbody>
                  {montadas.map(({ posicion, llanta }) => {
                    const h = hechas[posicion];
                    const r = h ?? { r1: aTexto(llanta.r1), r2: aTexto(llanta.r2), r3: aTexto(llanta.r3) };
                    return (
                      <tr key={posicion} className={`ninsp-tabla__fila${h ? ' ninsp-tabla__fila--hecha' : ''}`} onClick={() => setAbierta(posicion)}>
                        <td className="ninsp-tabla__pos">{h ? <Check size={14} aria-label="Inspeccionada" /> : null}{posicion}</td>
                        <td>{llanta.marca ?? '—'}</td><td>{llanta.medida ?? '—'}</td><td>{llanta.modelo ?? '—'}</td>
                        <td className="ninsp-tabla__num">{r.r1 || '—'}</td><td className="ninsp-tabla__num">{r.r2 || '—'}</td><td className="ninsp-tabla__num">{r.r3 || '—'}</td>
                        <td><RemanenteChip mm={minimo(r)} /></td>
                        <td onClick={e => e.stopPropagation()}>{h ? <input className="ninsp-tabla__input ninsp-tabla__input--corto" inputMode="numeric" value={h.psi} onChange={e => cambiarFila(posicion, 'psi', e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Psi de la posición ${posicion}`} /> : '—'}</td>
                        <td className="ninsp-tabla__codigo">{llanta.codigo}</td>
                        <td onClick={e => e.stopPropagation()}>{h ? <select className="ninsp-tabla__input" value={h.estado} onChange={e => cambiarFila(posicion, 'estado', e.target.value)} aria-label={`Estado de la posición ${posicion}`}>{estados.map(s => <option key={s} value={s}>{s}</option>)}</select> : '—'}</td>
                        <td onClick={e => e.stopPropagation()}>{h ? <input className="ninsp-tabla__input" value={h.obs} onChange={e => cambiarFila(posicion, 'obs', e.target.value)} placeholder="Observación" aria-label={`Observación de la posición ${posicion}`} /> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="ninsp-pie">
            <span className="t-footnote c-secondary">Solo se guardan los neumáticos que confirmaste ({nHechas}).</span>
            <Button variant="primary" size="lg" onClick={guardar} loading={guardando} disabled={nHechas === 0}>Guardar</Button>
          </div>
        </>
      )}

      <InspeccionPosicionSheet abierta={!!abierta} posicion={abierta ?? ''} llanta={abiertaLlanta} inicial={inicialModal} onConfirmar={confirmarPosicion} onClose={() => setAbierta(null)} />
    </Page>
  );
}
