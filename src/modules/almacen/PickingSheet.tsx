import { useMemo, useRef, useState } from 'react';
import { Camera, Check, CircleAlert, Minus, PackageCheck, Plus, ScanLine } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { ApiError, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { despacharSalida, estadoSalida, type ArticuloInv, type SalidaInv } from './api';
import { sinStockDe } from './SinStockDialogo';
import { EscanerContinuo } from './EscanerContinuo';
import { pitido } from './pitido';
import { duracion, tonoEspera } from './ControlSalidasSheet';
import './picking.css';

interface Linea {
  key: string;
  salidaId: SalidaInv['id'];
  folio: string;
  destino: string;
  itemId: number;
  inventarioId: string;
  descripcion: string;
  cantidad: number;
  ubicacion: string;
  recogido: number;
}
type Paso = 'elegir' | 'picking' | 'resultado';
interface Resultado { folio: string; ok: boolean; texto: string }

const cant = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 3 });
const clave = (s: string) => s.trim().toUpperCase();

/**
 * Picking de salidas pendientes: se eligen varias, sale una hoja ordenada por ubicación y se va escaneando cada artículo
 * (cámara del celular o escribiendo el código). Al terminar se despachan todas de una vez; lo que no se recogió queda pendiente.
 */
export function PickingSheet({ open, onClose, salidas, inventario, usuario, onTerminado }: {
  open: boolean;
  onClose: () => void;
  salidas: SalidaInv[];
  inventario: ArticuloInv[];
  usuario: string;
  onTerminado: () => void;
}) {
  // Las que más llevan esperando, primero (el tiempo corre desde que se pidió)
  const pendientes = useMemo(() => salidas.filter(s => estadoSalida(s) === 'Pendiente' && (s.items ?? []).some(i => i.id != null))
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)), [salidas]);
  const esperaMin = (s: SalidaInv) => { const t = Date.parse(s.created_at); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null; };
  const porId = useMemo(() => new Map(inventario.map(a => [a.id.toUpperCase(), a])), [inventario]);
  const porCodigo = useMemo(() => {
    const m = new Map<string, ArticuloInv>();
    for (const a of inventario) {
      for (const c of [a.id, a.codigo_barras, a.codigo_articulo]) { const k = clave(String(c ?? '')); if (k && !m.has(k)) m.set(k, a); }
    }
    return m;
  }, [inventario]);

  const [paso, setPaso] = useState<Paso>('elegir');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [camara, setCamara] = useState(true);
  const [manual, setManual] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [despachando, setDespachando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const reiniciar = () => { setPaso('elegir'); setElegidas(new Set()); setLineas([]); setAviso(null); setResultados([]); setManual(''); setCamara(true); };
  const cerrar = () => { reiniciar(); onClose(); };

  const alternar = (id: string) => setElegidas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcadas = pendientes.filter(s => elegidas.has(String(s.id)));
  const totalItems = marcadas.reduce((a, s) => a + (s.items ?? []).filter(i => i.id != null).length, 0);

  function empezar() {
    const ls: Linea[] = [];
    for (const s of marcadas) {
      for (const it of s.items ?? []) {
        if (it.id == null) continue;
        const art = it.inventario_id ? porId.get(it.inventario_id.toUpperCase()) : undefined;
        ls.push({
          key: `${s.id}-${it.id}`, salidaId: s.id, folio: String(s.id), destino: [s.placa, s.ticket_ot].filter(Boolean).join(' · '),
          itemId: it.id, inventarioId: it.inventario_id ?? '', descripcion: it.descripcion || art?.descripcion || art?.articulo || '(sin descripción)',
          cantidad: Number(it.cantidad) || 0, ubicacion: [art?.ubicacion, art?.anaquel].filter(Boolean).join(' ').trim(), recogido: 0,
        });
      }
    }
    // Recorrido: por ubicación (lo que no tiene ubicación, al final)
    ls.sort((a, b) => (a.ubicacion ? 0 : 1) - (b.ubicacion ? 0 : 1) || a.ubicacion.localeCompare(b.ubicacion, 'es', { numeric: true }) || a.descripcion.localeCompare(b.descripcion, 'es'));
    setLineas(ls); setAviso(null); setPaso('picking'); setCamara(true);
  }

  const completa = (l: Linea) => l.recogido >= l.cantidad - 1e-9;
  const unidadesTotal = lineas.reduce((a, l) => a + l.cantidad, 0);
  const unidadesHechas = lineas.reduce((a, l) => a + Math.min(l.recogido, l.cantidad), 0);
  const lineasHechas = lineas.filter(completa).length;

  function sumar(key: string, delta: number) {
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, recogido: Math.max(0, Math.min(l.cantidad, l.recogido + delta)) } : l)));
  }
  const completar = (key: string) => setLineas(prev => prev.map(l => (l.key === key ? { ...l, recogido: completa(l) ? 0 : l.cantidad } : l)));

  /** Un código leído (cámara, pistola o escrito): suma 1 a la primera línea de ese artículo que aún no esté completa */
  function leer(entrada: string) {
    // «5*INV-0212» (o «5x INV-0212»): suma 5 unidades de una vez; sin cantidad, suma 1
    const m = /^s*(d+(?:[.,]d+)?)s*[*xX]s*(S.*)$/.exec(entrada);
    const cuantas = m ? Math.max(1, parseFloat(m[1].replace(',', '.')) || 1) : 1;
    const codigoCrudo = (m ? m[2] : entrada).trim();
    const codigo = clave(codigoCrudo);
    if (!codigo) return;
    const art = porCodigo.get(codigo);
    const idArt = art?.id.toUpperCase() ?? codigo;
    const candidatas = lineas.filter(l => l.inventarioId.toUpperCase() === idArt);
    if (!candidatas.length) {
      pitido(false); haptic('warning');
      setAviso({ ok: false, texto: art ? `${art.descripcion || art.articulo} no está en esta hoja de picking.` : `El código ${codigoCrudo} no es de ningún artículo.` });
      return;
    }
    const falta = candidatas.find(l => !completa(l));
    if (!falta) {
      pitido(false); haptic('warning');
      setAviso({ ok: false, texto: `Ya tienes todo lo pedido de ${candidatas[0].descripcion}.` });
      return;
    }
    pitido(true); haptic('success');
    // Con varias unidades, se reparte entre las líneas de ese artículo (de las salidas que lo piden) hasta completar cada una
    let resto = cuantas;
    const nuevos = new Map<string, number>();
    for (const l of candidatas) {
      if (resto <= 0) break;
      const cabe = Math.max(0, l.cantidad - l.recogido);
      const toma = Math.min(cabe, resto);
      if (toma > 0) { nuevos.set(l.key, l.recogido + toma); resto -= toma; }
    }
    setLineas(prev => prev.map(l => (nuevos.has(l.key) ? { ...l, recogido: nuevos.get(l.key) as number } : l)));
    const total = cuantas - Math.max(0, resto);
    setAviso({ ok: true, texto: `${falta.descripcion} · +${cant(total)}${resto > 0 ? ` (sobraron ${cant(resto)}: ya estaba completo)` : ''}` });
  }

  // Lo que se despachará: de cada salida, las líneas completas
  const porSalida = useMemo(() => {
    const m = new Map<string, { id: SalidaInv['id']; folio: string; completas: number[]; total: number }>();
    for (const l of lineas) {
      const k = String(l.salidaId);
      const x = m.get(k) ?? { id: l.salidaId, folio: l.folio, completas: [], total: 0 };
      x.total++;
      if (completa(l)) x.completas.push(l.itemId);
      m.set(k, x);
    }
    return [...m.values()];
  }, [lineas]);
  const aDespachar = porSalida.filter(s => s.completas.length > 0);
  const incompletas = aDespachar.filter(s => s.completas.length < s.total).length;

  async function despachar() {
    setDespachando(true);
    const res: Resultado[] = [];
    for (const s of aDespachar) {
      try {
        const r = await despacharSalida(s.id, s.completas, usuario);
        res.push({ folio: s.folio, ok: true, texto: r.parcial && r.nuevo_pendiente_id ? `Despachada. Lo no recogido quedó en la salida ${r.nuevo_pendiente_id}.` : 'Despachada, stock descontado.' });
      } catch (err) {
        const faltantes = err instanceof ApiError ? sinStockDe(err.data) : null;
        res.push({ folio: s.folio, ok: false, texto: faltantes ? `Sin stock suficiente: ${faltantes.map(f => f.descripcion || f.id).join(', ')}.` : errorMessage(err) });
      }
    }
    setDespachando(false); setConfirmando(false); setResultados(res); setPaso('resultado');
    haptic(res.every(r => r.ok) ? 'success' : 'warning');
    onTerminado();
  }

  const titulo = paso === 'elegir' ? 'Picking de salidas' : paso === 'picking' ? 'Hoja de picking' : 'Resultado del despacho';
  const pie = paso === 'elegir' ? (
    <>
      <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
      <Button variant="primary" icon={<ScanLine size={16} />} disabled={!marcadas.length} onClick={empezar}>
        Empezar picking{marcadas.length ? ` · ${marcadas.length} ${marcadas.length === 1 ? 'salida' : 'salidas'} · ${totalItems} ítems` : ''}
      </Button>
    </>
  ) : paso === 'picking' ? (
    <>
      <Button variant="secondary" onClick={() => (unidadesHechas > 0 ? setSaliendo(true) : reiniciar())}>Atrás</Button>
      <Button variant="primary" icon={<PackageCheck size={16} />} disabled={!aDespachar.length} onClick={() => setConfirmando(true)}>
        Despachar {aDespachar.length ? `${aDespachar.length} ${aDespachar.length === 1 ? 'salida' : 'salidas'}` : ''}
      </Button>
    </>
  ) : <Button variant="primary" onClick={cerrar} style={{ width: '100%' }}>Listo</Button>;

  return (
    <>
      <Sheet open={open} onClose={() => (paso === 'picking' && unidadesHechas > 0 ? setSaliendo(true) : cerrar())} title={titulo} ancho footer={pie}>
        {paso === 'elegir' && (
          <div className="pk-cuerpo">
            {!pendientes.length ? <Notice>No hay salidas pendientes por despachar.</Notice> : (
              <>
                <div className="pk-cab">
                  <p className="pk-ayuda">Marca las salidas que vas a preparar juntas. Te armo una hoja ordenada por ubicación para recogerlo todo en un solo recorrido.</p>
                  <Button variant="plain" size="sm" onClick={() => setElegidas(elegidas.size === pendientes.length ? new Set() : new Set(pendientes.map(s => String(s.id))))}>
                    {elegidas.size === pendientes.length ? 'Quitar todas' : `Marcar todas (${pendientes.length})`}
                  </Button>
                </div>
                <ul className="pk-lista">
                  {pendientes.map(s => {
                    const on = elegidas.has(String(s.id));
                    const its = (s.items ?? []).filter(i => i.id != null);
                    return (
                      <li key={String(s.id)}>
                        <label className={`pk-salida${on ? ' pk-salida--on' : ''}`}>
                          <input type="checkbox" checked={on} onChange={() => alternar(String(s.id))} />
                          <span className="pk-salida__cuerpo">
                            <b>{String(s.id)}</b>
                            <small>{[s.placa, s.ticket_ot, s.responsable].filter(Boolean).join(' · ') || 'Sin destino'}</small>
                            <small className="pk-salida__items">{its.slice(0, 3).map(i => i.descripcion).join(' · ')}{its.length > 3 ? ` · +${its.length - 3} más` : ''}</small>
                          </span>
                          <span className="pk-salida__n">{its.length} {its.length === 1 ? 'ítem' : 'ítems'}
                            {esperaMin(s) != null && <em className={`pk-espera pk-espera--${tonoEspera(esperaMin(s) as number)}`}>Hace {duracion(esperaMin(s))}</em>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {paso === 'picking' && (
          <div className="pk-cuerpo">
            <div className="pk-fijo">
              <div className="pk-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={unidadesTotal} aria-valuenow={unidadesHechas}>
                <div className="pk-progreso__barra" style={{ width: `${unidadesTotal ? Math.round((unidadesHechas / unidadesTotal) * 100) : 0}%` }} />
              </div>
              <p className="pk-progreso__texto"><b>{cant(unidadesHechas)}</b> de {cant(unidadesTotal)} unidades · <b>{lineasHechas}</b> de {lineas.length} líneas</p>
              <EscanerContinuo activo={camara} onLeido={leer} />
              <form className="pk-entrada" onSubmit={e => { e.preventDefault(); leer(manual); setManual(''); entrada.current?.focus(); }}>
                <input ref={entrada} className="input" value={manual} onChange={e => setManual(e.target.value)} placeholder="Código (o 5*código para 5 unidades)" autoCapitalize="characters" autoCorrect="off" inputMode="text" />
                <Button type="submit" variant="secondary" disabled={!manual.trim()}>Usar</Button>
                <Button type="button" variant={camara ? 'primary' : 'secondary'} iconOnly icon={<Camera size={18} />} aria-label={camara ? 'Apagar la cámara' : 'Encender la cámara'} onClick={() => setCamara(v => !v)} />
              </form>
              {aviso && <p className={`pk-aviso ${aviso.ok ? 'pk-aviso--ok' : 'pk-aviso--error'}`} role="status">{aviso.ok ? <Check size={15} /> : <CircleAlert size={15} />} {aviso.texto}</p>}
            </div>

            <ul className="pk-lineas">
              {lineas.map(l => (
                <li key={l.key} className={`pk-linea${completa(l) ? ' pk-linea--lista' : ''}`}>
                  <button type="button" className="pk-linea__check" aria-label={completa(l) ? 'Deshacer' : 'Marcar completo'} title={completa(l) ? 'Deshacer' : 'Marcar completo'} onClick={() => completar(l.key)}>
                    {completa(l) ? <Check size={18} strokeWidth={3} /> : null}
                  </button>
                  <span className="pk-linea__cuerpo">
                    <b>{l.descripcion}</b>
                    <small>
                      {l.ubicacion ? <span className="pk-ubi">{l.ubicacion}</span> : <span className="pk-ubi pk-ubi--sin">Sin ubicación</span>}
                      {l.inventarioId} · {l.folio}{l.destino ? ` · ${l.destino}` : ''}
                    </small>
                  </span>
                  <span className="pk-linea__cant">
                    <button type="button" aria-label="Quitar uno" onClick={() => sumar(l.key, -1)} disabled={l.recogido <= 0}><Minus size={15} /></button>
                    <span className="t-numeric"><b>{cant(l.recogido)}</b> / {cant(l.cantidad)}</span>
                    <button type="button" aria-label="Agregar uno" onClick={() => sumar(l.key, 1)} disabled={completa(l)}><Plus size={15} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {paso === 'resultado' && (
          <div className="pk-cuerpo">
            <ul className="pk-resultados">
              {resultados.map(r => (
                <li key={r.folio} className={r.ok ? 'pk-res pk-res--ok' : 'pk-res pk-res--error'}>
                  {r.ok ? <Check size={18} /> : <CircleAlert size={18} />}
                  <span><b>{r.folio}</b><small>{r.texto}</small></span>
                </li>
              ))}
            </ul>
            {resultados.some(r => !r.ok) && <Notice tone="error">Las salidas con error quedaron pendientes. Revisa el stock o recepciona lo que falte y vuelve a hacer su picking.</Notice>}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={confirmando} onClose={() => !despachando && setConfirmando(false)} loading={despachando} onConfirm={despachar}
        title="¿Despachar lo recogido?" confirmLabel="Despachar"
        message={<>Se despacharán <b>{aDespachar.length}</b> {aDespachar.length === 1 ? 'salida' : 'salidas'} y se descontará el stock.{incompletas > 0 ? <><br />En <b>{incompletas}</b> {incompletas === 1 ? 'salida' : 'salidas'} faltan líneas por recoger: lo no recogido quedará pendiente en una salida nueva.</> : null}</>} />
      <ConfirmSheet open={saliendo} onClose={() => setSaliendo(false)} onConfirm={() => { setSaliendo(false); cerrar(); }}
        title="¿Salir del picking?" confirmLabel="Salir" message="Se perderá lo que ya escaneaste. Las salidas siguen pendientes." />
    </>
  );
}
