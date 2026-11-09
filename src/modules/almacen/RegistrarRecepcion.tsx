import './recepcion.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, ClipboardCheck, Camera, PackageCheck, Wallet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { EvidenciasArchivos } from '../../core/ui/EvidenciasArchivos';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatDolares, formatSoles } from '../../core/lib/format';
import { registrarRecepcion, useAlmacenesLista, useTipoCambioSunat, type ItemRecepcion, type LlantaReencauche, type RecepcionOC } from './api';

/** Tipo de cambio de referencia si SUNAT no responde (igual que el clásico) */
const TC_REFERENCIA = 3.75;

const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const num = (s: string | undefined) => {
  const n = parseFloat((s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));
const esUSD = (moneda: string | null | undefined) => String(moneda ?? '').toUpperCase() === 'USD';

/** Resultado de cada llanta que vuelve de la reformadora; "pendiente" = todavía no llegó (la recepción queda parcial) */
type ResultadoLlanta = 'aprobada' | 'rechazada' | 'pendiente';
interface DatosLlanta { resultado: ResultadoLlanta; remanente: string; banda: string; motivo: string }
const LLANTA_INICIAL: DatosLlanta = { resultado: 'aprobada', remanente: '', banda: '', motivo: '' };
const esReencauche = (it: ItemRecepcion) => Array.isArray(it.llantas_reencauche) && it.llantas_reencauche.length > 0;
const claveLlanta = (it: ItemRecepcion, l: LlantaReencauche) => `${it.inventario_id}|${l.id_neumatico}`;

function Seccion({ icono, titulo, nota, children }: { icono: ReactNode; titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="rec2-seccion">
      <header className="rec2-seccion__cab">
        <span className="rec2-seccion__icono" aria-hidden>{icono}</span>
        <div><h3 className="rec2-seccion__titulo">{titulo}</h3>{nota && <p className="rec2-seccion__nota">{nota}</p>}</div>
      </header>
      {children}
    </section>
  );
}

/**
 * Registrar la entrega física (parcial o total) de una orden de compra.
 * Suma stock y deja el kardex. El servidor, en una sola transacción, recalcula el costo promedio en soles,
 * cierra o parcializa la O/C y crea las llantas si el artículo es de neumáticos: el cliente no duplica nada.
 * La evidencia (fotos o documentos) es obligatoria: al menos un archivo por recepción.
 */
export function RegistrarRecepcion({ oc, usuario, open, onClose }: {
  oc: RecepcionOC | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: almacenes } = useAlmacenesLista();
  const [cant, setCant] = useState<Record<number, string>>({});
  const [alm, setAlm] = useState<Record<number, string>>({});
  const [fecha, setFecha] = useState(ahoraLocal);
  const [obs, setObs] = useState('');
  // TC que escribe la persona. null = el de SUNAT (o la referencia), sin tocar nada.
  const [tcEditado, setTcEditado] = useState<string | null>(null);
  const [evidencias, setEvidencias] = useState<File[]>([]);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errLinea, setErrLinea] = useState<Record<number, string | undefined>>({});
  const [errTc, setErrTc] = useState<string | undefined>();
  const [reenc, setReenc] = useState<Record<string, DatosLlanta>>({});
  const evidenciasRef = useRef<HTMLDivElement>(null);

  const usd = !!oc && esUSD(oc.moneda);
  // Una O/C en dólares ya tiene su tipo de cambio (el de la compra): la recepción valoriza con ese mismo TC
  const tcCompra = usd && (oc?.tipo_cambio ?? 0) > 0 ? Number(oc?.tipo_cambio) : 0;
  const tcSunat = useTipoCambioSunat(open && usd && !tcCompra);
  const tcDelDia = tcSunat.data ? String(tcSunat.data.venta) : tcSunat.isError ? String(TC_REFERENCIA) : '';
  const tcTexto = tcEditado ?? tcDelDia;
  const tcNum = tcCompra || num(tcTexto);

  useEffect(() => {
    if (!open) return;
    setCant({}); setAlm({}); setFecha(ahoraLocal()); setObs(''); setTcEditado(null);
    setEvidencias([]); setIntento(false); setError(null); setErrLinea({}); setErrTc(undefined); setReenc({});
  }, [open, oc?.id]);

  const items = oc?.items ?? [];
  const pendientes = items.map((it, i) => ({ it, i })).filter(x => x.it.pendiente > 0);
  // Solo los almacenes registrados; por defecto Principal (el de la orden si es uno de ellos)
  const nombresAlm = useMemo(() => {
    const n = (almacenes ?? []).map(a => a.nombre);
    return n.length ? n : ['Principal'];
  }, [almacenes]);
  const almacenDefecto = nombresAlm.includes(oc?.almacen ?? '') ? (oc?.almacen as string) : (nombresAlm.includes('Principal') ? 'Principal' : nombresAlm[0]);

  const datosLlanta = (it: ItemRecepcion, l: LlantaReencauche): DatosLlanta => reenc[claveLlanta(it, l)] ?? LLANTA_INICIAL;
  const cambiarLlanta = (it: ItemRecepcion, l: LlantaReencauche, cambios: Partial<DatosLlanta>) =>
    setReenc(r => ({ ...r, [claveLlanta(it, l)]: { ...(r[claveLlanta(it, l)] ?? LLANTA_INICIAL), ...cambios } }));
  // Una línea de reencauche recibe tantas unidades como llantas llegaron (aprobadas o rechazadas)
  const cantidadDe = (it: ItemRecepcion, i: number) =>
    esReencauche(it) ? (it.llantas_reencauche ?? []).filter(l => datosLlanta(it, l).resultado !== 'pendiente').length : num(cant[i]);

  const total = pendientes.reduce((s, { it, i }) => s + cantidadDe(it, i), 0);
  // Valor que entra al inventario, siempre en soles (igual que el servidor: costo × TC en líneas USD)
  const valorSoles = pendientes.reduce((s, { it, i }) =>
    s + cantidadDe(it, i) * (Number(it.costo_unitario) || 0) * (esUSD(it.moneda) ? tcNum : 1), 0);
  const valorListo = !usd || tcNum > 0;
  const pedidoTotal = items.reduce((s, it) => s + it.pedido, 0);
  const recibidoTotal = items.reduce((s, it) => s + it.recepcionado, 0);
  const pctAntes = pedidoTotal > 0 ? Math.min(100, (recibidoTotal / pedidoTotal) * 100) : 0;
  const pctConEsta = pedidoTotal > 0 ? Math.min(100, ((recibidoTotal + total) / pedidoTotal) * 100) : 0;

  async function enviar() {
    if (!oc) return;
    setIntento(true);
    const lineasMal: Record<number, string | undefined> = {};
    for (const { it, i } of pendientes) {
      if (cantidadDe(it, i) > it.pendiente + 1e-9) lineasMal[i] = `No puedes recibir más del saldo pendiente (${fmt(it.pendiente)}).`;
    }
    setErrLinea(lineasMal);
    if (Object.values(lineasMal).some(Boolean)) { haptic('warning'); return; }

    const envio = pendientes
      .filter(({ it, i }) => cantidadDe(it, i) > 0)
      .map(({ it, i }) => ({
        inventario_id: it.inventario_id, descripcion: it.descripcion, cantidad_recibida: cantidadDe(it, i),
        costo_unitario: it.costo_unitario, moneda: it.moneda, almacen: alm[i] || almacenDefecto,
        llantas_reencauche: esReencauche(it)
          ? (it.llantas_reencauche ?? []).flatMap(l => {
            const d = datosLlanta(it, l);
            if (d.resultado === 'pendiente') return [];
            return [{
              id_neumatico: l.id_neumatico, resultado: d.resultado,
              remanente: d.resultado === 'aprobada' && d.remanente.trim() ? num(d.remanente) : null,
              banda: d.resultado === 'aprobada' ? d.banda.trim() : '', motivo: d.resultado === 'rechazada' ? d.motivo.trim() : '',
            }];
          })
          : undefined,
      }));
    if (!envio.length) { setError('Escribe una cantidad mayor a 0 en al menos un ítem.'); haptic('warning'); return; }
    if (usd && !(tcNum > 0)) { setErrTc('Indica el tipo de cambio del día.'); haptic('warning'); return; }
    // La evidencia es obligatoria: sin al menos una foto o documento no se registra la recepción
    if (evidencias.length === 0) {
      setError('Adjunta al menos una foto o documento de sustento de la recepción.');
      haptic('warning');
      evidenciasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const pendienteTotal = items.reduce((s, it) => s + it.pendiente, 0);
    setEnviando(true); setError(null); setErrTc(undefined);
    try {
      await registrarRecepcion({
        oc_id: oc.id, fecha_recepcion: fecha || ahoraLocal(), usuario, observacion: obs.trim(), almacen: envio[0].almacen,
        tipo_recepcion: total >= pendienteTotal - 1e-9 ? 'TOTAL' : 'PARCIAL', items: envio, sustentos: evidencias,
        // Con TC de la compra el servidor usa ese; sin él, el del día (SUNAT o el que se escribió)
        tipo_cambio: usd && !tcCompra ? tcNum : undefined,
      });
      haptic('success');
      toast('Recepción registrada. Inventario y kardex actualizados.');
      await qc.invalidateQueries({ queryKey: ['almacen'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  const importeOC = oc ? (esUSD(oc.moneda) && (Number(oc.tipo_cambio) || 0) > 0 ? formatDolares(oc.importe / Number(oc.tipo_cambio)) : formatSoles(oc.importe)) : '';

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={oc ? `Recepcionar ${oc.id}` : 'Recepcionar'} ancho
      footer={
        <div className="rec2-pie">
          <span className="rec2-pie__total" aria-live="polite">
            {total > 0 ? <><strong>{fmt(total)}</strong> unid. · {valorListo ? formatSoles(valorSoles) : '—'}</> : 'Indica lo que llegó'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={enviar} loading={enviando} disabled={total <= 0}>Registrar recepción</Button>
        </div>
      }>
      {oc && (
        <div className="rec2">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          <div className="rec2-orden">
            <div className="rec2-orden__fila">
              <strong className="rec2-orden__proveedor">{oc.proveedor}</strong>
              <span className="rec2-orden__importe">{importeOC}</span>
            </div>
            <div className="rec2-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctConEsta)} aria-label="Avance de la recepción">
              <span className="rec2-barra__antes" style={{ width: `${pctAntes}%` }} />
              <span className="rec2-barra__ahora" style={{ width: `${Math.max(0, pctConEsta - pctAntes)}%`, left: `${pctAntes}%` }} />
            </div>
            <span className="rec2-orden__sub">
              Recibido {fmt(recibidoTotal)} de {fmt(pedidoTotal)} · con esta entrega {fmt(Math.min(pedidoTotal, recibidoTotal + total))}
            </span>
          </div>

          <Seccion icono={<PackageCheck size={16} />} titulo="Qué llegó" nota="Indica lo que llegó físicamente. El saldo que no llegue queda pendiente en la orden.">
            <div className="rec2-items">
              {items.map((it, i) => it.pendiente > 0 ? (
                <div key={i} className="rec2-item">
                  <div className="rec2-item__cab">
                    <span className="rec2-item__nombre">{it.descripcion}</span>
                    {it.inventario_id && <span className="rec2-item__codigo">{it.inventario_id}</span>}
                  </div>
                  <span className="rec2-item__sub">
                    Pedido {fmt(it.pedido)} · recibido {fmt(it.recepcionado)} · pendiente <strong>{fmt(it.pendiente)}</strong> {it.unidad}
                  </span>
                  {esReencauche(it) ? (
                    <div className="rec2-llantas">
                      <p className="t-callout c-secondary" style={{ margin: 0 }}>
                        Cada llanta vuelve aprobada (sube una vida y queda en Reencauche, con el costo de esta línea) o rechazada
                        (queda esperando descarte). Las que no llegaron quedan en la reformadora.
                      </p>
                      {(it.llantas_reencauche ?? []).map(l => {
                        const d = datosLlanta(it, l);
                        return (
                          <div key={l.id_neumatico} className="rec2-llanta">
                            <div className="rec2-llanta__cab">
                              <strong className="t-numeric">{l.codigo}</strong>
                              <span>{[l.medida, l.modelo, `Vida ${l.vida}`].filter(Boolean).join(' · ')}</span>
                            </div>
                            <SegmentedControl<ResultadoLlanta> label={`Resultado de ${l.codigo}`} value={d.resultado} block
                              onChange={v => { setErrLinea(x => ({ ...x, [i]: undefined })); cambiarLlanta(it, l, { resultado: v }); }}
                              options={[{ value: 'aprobada', label: 'Aprobada' }, { value: 'rechazada', label: 'Rechazada' }, { value: 'pendiente', label: 'No llegó' }]} />
                            {d.resultado === 'aprobada' && (
                              <div className="form-grid">
                                <TextInput inputMode="decimal" placeholder="Remanente (mm)" aria-label={`Remanente de ${l.codigo}`}
                                  value={d.remanente} onChange={e => cambiarLlanta(it, l, { remanente: e.target.value })} />
                                <TextInput placeholder="Banda (diseño)" aria-label={`Banda de ${l.codigo}`}
                                  value={d.banda} onChange={e => cambiarLlanta(it, l, { banda: e.target.value })} />
                              </div>
                            )}
                            {d.resultado === 'rechazada' && (
                              <TextInput placeholder="Motivo del rechazo (opcional)" aria-label={`Motivo del rechazo de ${l.codigo}`}
                                value={d.motivo} onChange={e => cambiarLlanta(it, l, { motivo: e.target.value })} />
                            )}
                          </div>
                        );
                      })}
                      <span className="t-numeric rec2-item__sub">{cantidadDe(it, i)} de {(it.llantas_reencauche ?? []).length} llantas recibidas</span>
                    </div>
                  ) : (
                    <div className="rec-entrada">
                      <TextInput inputMode="decimal" placeholder="0" aria-label={`Cantidad recibida de ${it.descripcion}`}
                        value={cant[i] ?? ''}
                        onChange={e => { setCant(c => ({ ...c, [i]: e.target.value })); setErrLinea(l => ({ ...l, [i]: undefined })); }} />
                      <button type="button" className="rec2-todo" title={`Llenar con el saldo (${fmt(it.pendiente)})`}
                        onClick={() => { haptic('selection'); setCant(c => ({ ...c, [i]: String(it.pendiente) })); }}>
                        Todo ({fmt(it.pendiente)})
                      </button>
                      <SelectInput value={alm[i] ?? almacenDefecto} aria-label="Almacén de destino"
                        onChange={e => setAlm(a => ({ ...a, [i]: e.target.value }))}>
                        {nombresAlm.map(n => <option key={n} value={n}>{n}</option>)}
                      </SelectInput>
                    </div>
                  )}
                  {errLinea[i] && <p role="alert" className="rec2-error">{errLinea[i]}</p>}
                </div>
              ) : (
                <div key={i} className="rec2-item rec2-item--completo">
                  <span className="rec2-item__nombre">{it.descripcion}</span>
                  <span className="rec2-completo">Completo · {fmt(it.recepcionado)}</span>
                </div>
              ))}
            </div>
            {pendientes.length > 1 && (
              <button type="button" className="rec2-todo rec2-todo--solo"
                onClick={() => { haptic('selection'); setCant(Object.fromEntries(pendientes.map(({ it, i }) => [i, String(it.pendiente)]))); }}>
                Completar todo el saldo
              </button>
            )}
          </Seccion>

          <div ref={evidenciasRef}>
            <Seccion icono={<Camera size={16} />} titulo="Evidencia de la recepción" nota="Obligatoria: al menos una foto o documento.">
              <EvidenciasArchivos archivos={evidencias} onCambio={a => { setEvidencias(a); setError(null); }} obligatorio mostrarError={intento} disabled={enviando}
                titulo="Fotos y documentos" ayuda="Mercadería recibida, guía de remisión, factura o novedades" />
            </Seccion>
          </div>

          <Seccion icono={<ClipboardCheck size={16} />} titulo="Datos de la recepción">
            <div className="form-grid">
              <Field label="Fecha y hora de recepción">
                {p => <TextInput {...p} type="datetime-local" value={fecha} max={ahoraLocal()} onChange={e => setFecha(e.target.value)} />}
              </Field>
              {usd && tcCompra > 0 && (
                <Field label="Tipo de cambio de la compra" hint="La recepción valoriza con este mismo tipo de cambio">
                  {p => <TextInput {...p} value={tcCompra.toFixed(3)} readOnly />}
                </Field>
              )}
              {usd && !tcCompra && (
                <Field label="Tipo de cambio del día (S/ por USD)" error={errTc}
                  hint={tcSunat.data ? `SUNAT ${tcSunat.data.fecha} · puede cambiarlo`
                    : tcSunat.isError ? `SUNAT no disponible: referencia ${TC_REFERENCIA}`
                    : 'Consultando SUNAT…'}>
                  {p => <TextInput {...p} inputMode="decimal" placeholder={String(TC_REFERENCIA)} value={tcTexto}
                    onChange={e => { setTcEditado(e.target.value); setErrTc(undefined); }} />}
                </Field>
              )}
              <Field label="Observaciones" wide>
                {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej: entrega completa según guía GR-001" />}
              </Field>
            </div>
          </Seccion>

          <Seccion icono={<Wallet size={16} />} titulo="Valor que ingresa al inventario">
            <div className="rec2-valor" aria-live="polite">
              <span>En soles</span>
              <strong className="t-numeric">{valorListo ? formatSoles(valorSoles) : '—'}</strong>
            </div>
          </Seccion>
        </div>
      )}
    </Sheet>
  );
}
