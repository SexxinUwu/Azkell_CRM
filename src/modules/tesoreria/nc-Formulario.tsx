import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CircleAlert, FileText, PackageMinus, Receipt, Wallet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Combobox } from '../../core/ui/Combobox';
import { AdjuntoEvidencia } from '../../core/ui/AdjuntoEvidencia';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { useAuth } from '../../core/auth/AuthProvider';
import { guardarSalida, useEntradas, useProveedores, type EntradaInv } from '../almacen/api';
import { NcMercaderia, useMercaderia } from './nc-Mercaderia';
import { MOTIVOS_SUNAT, montoNc } from './nc-api';

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const dec = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const MOTIVO_POR_DEFECTO = '07'; // Devolución por ítem: el caso más común

/** Importe de una orden en su propia moneda y su equivalente en soles */
function importeOc(e: EntradaInv): { moneda: 'PEN' | 'USD'; monto: number; soles: number } {
  const moneda: 'PEN' | 'USD' = /USD|D[ÓO]LAR/i.test(String(e.moneda ?? '')) ? 'USD' : 'PEN';
  const soles = Number(e.total_pen) || 0;
  const monto = moneda === 'PEN' ? soles : (Number(e.total_oc) || (e.tipo_cambio ? soles / Number(e.tipo_cambio) : 0));
  return { moneda, monto: r2(monto), soles: r2(soles) };
}

interface Errores { proveedor?: string; serie?: string; numero?: string; fecha?: string; total?: string; archivo?: string }

/** Registra la nota de crédito que emitió el proveedor. El archivo es obligatorio; queda "Por aprobar" hasta que otra persona la apruebe. */
export interface NcInicial { proveedorId?: string; ocOrigen?: string; referencia?: string; total?: number; moneda?: 'PEN' | 'USD' }

function Seccion({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section className="ncf-seccion">
      <h3 className="ncf-seccion__titulo"><span aria-hidden>{icono}</span>{titulo}</h3>
      <div className="ncf-seccion__cuerpo">{children}</div>
    </section>
  );
}

export function NcFormulario({ open, onClose, onCreada, inicial }: { open: boolean; onClose: () => void; onCreada: (id: number) => void; inicial?: NcInicial | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const proveedores = useProveedores();
  const entradas = useEntradas();
  const { user } = useAuth();

  const [proveedorId, setProveedorId] = useState('');
  const [ocOrigen, setOcOrigen] = useState('');
  const [serie, setSerie] = useState('');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [total, setTotal] = useState('');
  const [motivoSunat, setMotivoSunat] = useState(MOTIVO_POR_DEFECTO);
  const [forma, setForma] = useState<'APLICAR' | 'REEMBOLSO'>('APLICAR');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaArchivo, setVistaArchivo] = useState<string | undefined>();
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Si la salida ya se generó y la nota falló, al reintentar no se vuelve a generar
  const [salidaCreada, setSalidaCreada] = useState('');

  useEffect(() => {
    if (!open) return;
    setSalidaCreada('');
    setProveedorId(inicial?.proveedorId ?? ''); setOcOrigen(inicial?.ocOrigen ?? ''); setSerie(''); setNumero(''); setFecha(hoy());
    setMoneda(inicial?.moneda ?? 'PEN'); setTotal(inicial?.total ? String(inicial.total) : '');
    setMotivoSunat(MOTIVO_POR_DEFECTO); setForma('APLICAR'); setReferencia(inicial?.referencia ?? ''); setObservaciones(''); setArchivo(null);
    setErrores({}); setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vista previa de la foto elegida (se libera al cambiar o cerrar)
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/')) { setVistaArchivo(undefined); return; }
    const url = URL.createObjectURL(archivo);
    setVistaArchivo(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const ordenesValidas = useMemo(() => (entradas.data ?? []).filter(e => !/anul|rechaz/i.test(String(e.estado ?? '')) && e.proveedor_id), [entradas.data]);
  const orden = ordenesValidas.find(e => e.id === ocOrigen) ?? null;
  const importe = orden ? importeOc(orden) : null;
  const proveedor = (proveedores.data ?? []).find(p => p.id === proveedorId) ?? null;
  const merc = useMercaderia(orden);
  const nombreProveedor = proveedor ? (proveedor.razon_social?.trim() || proveedor.nombre) : null;
  // Devolviendo ahora, el valor de lo devuelto se propone como total (se puede bajar)
  useEffect(() => { if (merc.modo === 'ahora' && merc.totalDevuelto > 0) setTotal(merc.totalDevuelto.toFixed(2)); }, [merc.modo, merc.totalDevuelto]);
  const opcionesProveedor = useMemo(() => (proveedores.data ?? []).map(p => ({ value: p.id, label: p.razon_social?.trim() || p.nombre, description: p.ruc ?? undefined })), [proveedores.data]);
  // Todas las órdenes (o las del proveedor elegido), con su importe a la vista
  const opcionesOrden = useMemo(() => ordenesValidas
    .filter(e => !proveedorId || String(e.proveedor_id) === proveedorId)
    .map(e => {
      const im = importeOc(e);
      const monto = im.moneda === 'USD' ? `${montoNc(im.monto, 'USD')} (≈ ${montoNc(im.soles, 'PEN')})` : montoNc(im.monto, 'PEN');
      return { value: e.id, label: `${String(e.id).replace(/^ENT-/, '')} · ${monto}`, description: `${formatFechaPe(e.fecha)} · ${String(e.estado ?? '')}${proveedorId ? '' : ` · ${e.proveedor_nombre ?? ''}`}` };
    }), [ordenesValidas, proveedorId]);

  function elegirOrden(id: string | null) {
    setOcOrigen(id ?? '');
    const e = ordenesValidas.find(x => x.id === id);
    if (!e) return;
    const im = importeOc(e);
    setProveedorId(String(e.proveedor_id)); // la orden ya dice de quién es
    setMoneda(im.moneda);
    if (im.monto > 0) setTotal(im.monto.toFixed(2)); // arranca con el importe de la orden; se puede bajar
    setErrores(x => ({ ...x, proveedor: undefined, total: undefined }));
    haptic('selection');
  }

  const t = dec(total);
  const base = t > 0 ? r2(t / 1.18) : 0;
  const igv = t > 0 ? r2(t - base) : 0;
  const excede = !!importe && t > importe.monto + 0.02 && importe.monto > 0;

  async function guardar() {
    const e: Errores = {};
    if (!proveedor) e.proveedor = 'Elige el proveedor.';
    if (!serie.trim()) e.serie = 'Falta la serie (ej. FC01).';
    if (!numero.trim()) e.numero = 'Falta el número.';
    if (!fecha) e.fecha = 'Indica la fecha.';
    else if (fecha > hoy()) e.fecha = 'No puede ser futura.';
    if (!(t > 0)) e.total = 'El total debe ser mayor a 0.';
    else if (excede && importe) e.total = `No puede superar la orden (${montoNc(importe.monto, importe.moneda)}).`;
    if (!archivo) e.archivo = 'Adjunta la nota de crédito (PDF, XML o foto): es obligatorio.';
    setErrores(e);
    if (Object.keys(e).length || !proveedor || !archivo) { haptic('warning'); return; }
    if (orden && merc.modo === 'ahora' && !merc.elegidas.length && !salidaCreada) { setError('Indica la cantidad que se devuelve de al menos un artículo, o elige «Aún no / no aplica».'); haptic('warning'); return; }
    if (orden && merc.modo === 'ya' && !merc.salidaYa) { setError('Elige la salida de la devolución, o elige otra opción.'); haptic('warning'); return; }
    setError(null);

    setEnviando(true);
    let refSalida = orden && merc.modo === 'ya' ? merc.salidaYa : salidaCreada;
    try {
      if (orden && merc.modo === 'ahora' && !refSalida) {
        const motivoTxt = MOTIVOS_SUNAT.find(m => m.value === motivoSunat)?.label ?? '';
        const r = await guardarSalida({
          fecha: hoy(), tipo_destino: 'Devolucion a proveedor', responsable: nombreProveedor ?? proveedor.nombre, moneda: orden.moneda,
          observaciones: `DEVOLUCIÓN A PROVEEDOR · orden ${String(orden.id).replace(/^ENT-/, '')} · ${motivoTxt}`, creado_por: user?.name ?? '', items: merc.itemsSalida,
        } as Parameters<typeof guardarSalida>[0]) as { ok?: boolean; id?: string | number; error?: string };
        if (r.ok === false || r.error || r.id == null) throw new Error(r.error || 'No se pudo registrar la salida de almacén');
        refSalida = String(r.id); setSalidaCreada(refSalida);
        toast(`Salida ${refSalida} registrada: el stock ya bajó.`);
      }
    } catch (err) { setError(errorMessage(err)); haptic('warning'); setEnviando(false); return; }

    const fd = new FormData();
    fd.append('proveedor_id', proveedor.id);
    fd.append('proveedor_nombre', nombreProveedor ?? proveedor.nombre);
    if (proveedor.ruc) fd.append('proveedor_ruc', proveedor.ruc);
    fd.append('serie', serie.trim().toUpperCase());
    fd.append('numero', numero.trim());
    fd.append('fecha_emision', fecha);
    fd.append('moneda', moneda);
    fd.append('base', String(base));
    fd.append('igv', String(igv));
    fd.append('total', String(t));
    fd.append('motivo_sunat', motivoSunat);
    fd.append('motivo_texto', MOTIVOS_SUNAT.find(m => m.value === motivoSunat)?.label ?? '');
    if (ocOrigen) fd.append('oc_origen', ocOrigen);
    fd.append('forma', forma);
    const refFinal = refSalida || referencia.trim();
    if (refFinal) fd.append('referencia_devolucion', refFinal);
    if (observaciones.trim()) fd.append('observaciones', observaciones.trim());
    fd.append('archivo', archivo);

    try {
      const r = await api<{ ok?: boolean; id: number; codigo: string; error?: string }>('/compras/notas-credito', { method: 'POST', body: fd });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar la nota');
      haptic('success');
      toast(`Nota ${r.codigo} registrada. Falta que otra persona la apruebe.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['tesoreria', 'notas-credito'] }), qc.invalidateQueries({ queryKey: ['almacen'] })]);
      onCreada(r.id);
    } catch (err) { setError(errorMessage(err) + (refSalida && merc.modo === 'ahora' ? ` La salida ${refSalida} ya se generó: al reintentar no se duplica.` : '')); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar nota de crédito" ancho
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Registrar{t > 0 ? ` · ${montoNc(t, moneda)}` : ''}</Button></>}>
      <div className="ncf">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        <Seccion icono={<Building2 size={16} />} titulo="Proveedor y orden">
          <Field label="Orden de compra de origen" hint={orden && importe ? undefined : 'Elígela y el sistema completa proveedor, moneda e importe'}>
            {p => <Combobox {...p} options={opcionesOrden} value={ocOrigen || null} onChange={elegirOrden} enHoja compacta
              placeholder="Opcional: busca la orden" tituloHoja="Orden de origen" loading={entradas.isLoading} />}
          </Field>
          {orden && importe && (
            <div className="ncf-orden" role="status">
              <span>Importe de la orden</span>
              <strong>{montoNc(importe.monto, importe.moneda)}</strong>
              {importe.moneda === 'USD' && <small>≈ {montoNc(importe.soles, 'PEN')}</small>}
            </div>
          )}
          <Field label="Proveedor" error={errores.proveedor}>
            {p => <Combobox {...p} options={opcionesProveedor} value={proveedorId || null} onChange={v => { setProveedorId(v ?? ''); if (v !== proveedorId) setOcOrigen(''); }}
              enHoja compacta placeholder="Busca el proveedor" tituloHoja="Proveedor" loading={proveedores.isLoading} disabled={!!orden} />}
          </Field>
        </Seccion>

        {orden && (
          <Seccion icono={<PackageMinus size={16} />} titulo="Mercadería devuelta">
            <NcMercaderia h={merc} moneda={moneda} proveedorNombre={nombreProveedor} sugerirDevolucion={['06', '07'].includes(motivoSunat) && !referencia.trim()} />
          </Seccion>
        )}

        <Seccion icono={<Receipt size={16} />} titulo="Documento del proveedor">
          <div className="ncf-fila">
            <Field label="Serie" error={errores.serie}>
              {p => <TextInput {...p} value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} maxLength={10} placeholder="FC01" className="ce-f__mono" />}
            </Field>
            <Field label="Número" error={errores.numero}>
              {p => <TextInput {...p} value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={20} placeholder="00000123" className="ce-f__mono" />}
            </Field>
            <Field label="Fecha de emisión" error={errores.fecha}>
              {p => <TextInput {...p} type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />}
            </Field>
          </div>
          <Field label="Motivo (SUNAT)">
            {p => <Combobox {...p} options={MOTIVOS_SUNAT.map(m => ({ value: m.value, label: m.label, description: `Código ${m.value}` }))} value={motivoSunat}
              onChange={v => setMotivoSunat(v ?? MOTIVO_POR_DEFECTO)} enHoja compacta tituloHoja="Motivo de la nota" placeholder="Elige el motivo" />}
          </Field>
        </Seccion>

        <Seccion icono={<Wallet size={16} />} titulo="Importe y saldo">
          <div className="ncf-importe">
            <Field label={`Total de la nota (${moneda === 'USD' ? 'US$' : 'S/'})`} error={errores.total}>
              {p => <TextInput {...p} inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" className="ncf-total" />}
            </Field>
            {importe ? (
              <div className="ncf-moneda" aria-label="Moneda de la orden"><span>Moneda</span><strong>{moneda === 'USD' ? 'US$ Dólares' : 'S/ Soles'}</strong></div>
            ) : (
              <div className="field">
                <span className="field__label">Moneda</span>
                <SegmentedControl block label="Moneda" value={moneda} onChange={setMoneda} options={[{ value: 'PEN', label: 'S/ Soles' }, { value: 'USD', label: 'US$ Dólares' }]} />
              </div>
            )}
          </div>
          {t > 0 && (
            <p className="ncf-desglose">Base {montoNc(base, moneda)} · IGV {montoNc(igv, moneda)}{importe && t < importe.monto - 0.02 ? ` · parcial: ${montoNc(r2(importe.monto - t), moneda)} de la orden sigue vigente` : ''}</p>
          )}
          <div className="field">
            <span className="field__label">¿Qué se hará con el saldo?</span>
            <SegmentedControl block label="Saldo" value={forma} onChange={setForma} options={[{ value: 'APLICAR', label: 'Aplicar a próximas órdenes' }, { value: 'REEMBOLSO', label: 'Reembolso en dinero' }]} />
            <span className="field__hint">{forma === 'APLICAR' ? 'Se descuenta en el pago de las próximas órdenes de este proveedor.' : 'El proveedor devolverá el dinero: se registra el ingreso en Caja.'}</span>
          </div>
        </Seccion>

        <Seccion icono={<FileText size={16} />} titulo="Documento adjunto">
          <AdjuntoEvidencia titulo="Nota de crédito" aceptar="image/*,application/pdf,text/xml,application/xml,.xml"
            valor={archivo ? archivo.name : ''} src={vistaArchivo} documento={!!archivo && !archivo.type.startsWith('image/')} nombre={archivo?.name}
            onArchivo={f => { setArchivo(f); setErrores(x => ({ ...x, archivo: undefined })); }} onQuitar={() => setArchivo(null)} />
          <span className={errores.archivo ? 'field__error' : 'field__hint'}>{errores.archivo ?? 'Obligatorio: es la evidencia para la auditoría. Acepta PDF, XML, foto o imagen de la galería.'}</span>
        </Seccion>

        <details className="ncf-mas" open={!!inicial?.referencia}>
          <summary>Más datos (opcional)</summary>
          <div className="ncf-seccion__cuerpo" style={{ marginTop: 'var(--s-3)' }}>
            <Field label="Guía o salida de la devolución" hint="Guía de remisión u otra referencia. Si elegiste una salida arriba, esa tiene prioridad.">
              {p => <TextInput {...p} value={referencia} onChange={e => setReferencia(e.target.value)} />}
            </Field>
            <Field label="Observaciones">
              {p => <TextInput {...p} value={observaciones} onChange={e => setObservaciones(e.target.value)} />}
            </Field>
          </div>
        </details>
      </div>
    </Sheet>
  );
}
