import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { ChoiceChips } from '../../core/ui/Chips';
import { Combobox } from '../../core/ui/Combobox';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { useEntradas, useProveedores } from '../almacen/api';
import { MOTIVOS_SUNAT, montoNc } from './nc-api';

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const dec = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Errores { proveedor?: string; serie?: string; numero?: string; fecha?: string; total?: string; archivo?: string }

/** Registra la nota de crédito que emitió el proveedor. El archivo es obligatorio; queda "Por aprobar" hasta que otra persona la apruebe. */
export interface NcInicial { proveedorId?: string; ocOrigen?: string; referencia?: string; total?: number; moneda?: 'PEN' | 'USD' }

export function NcFormulario({ open, onClose, onCreada, inicial }: { open: boolean; onClose: () => void; onCreada: (id: number) => void; inicial?: NcInicial | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const proveedores = useProveedores();
  const entradas = useEntradas();

  const [proveedorId, setProveedorId] = useState('');
  const [serie, setSerie] = useState('');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [moneda, setMoneda] = useState('PEN');
  const [base, setBase] = useState('');
  const [igv, setIgv] = useState('');
  const [total, setTotal] = useState('');
  const [motivoSunat, setMotivoSunat] = useState('07');
  const [ocOrigen, setOcOrigen] = useState('');
  const [forma, setForma] = useState('APLICAR');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [claveArchivo, setClaveArchivo] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProveedorId(inicial?.proveedorId ?? ''); setSerie(''); setNumero(''); setFecha(hoy()); setMoneda(inicial?.moneda ?? 'PEN'); setBase(''); setIgv(''); setTotal(inicial?.total ? String(inicial.total) : '');
    setMotivoSunat('07'); setOcOrigen(inicial?.ocOrigen ?? ''); setForma('APLICAR'); setReferencia(inicial?.referencia ?? ''); setObservaciones(''); setArchivo(null); setClaveArchivo(c => c + 1);
    setErrores({}); setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const proveedor = (proveedores.data ?? []).find(p => p.id === proveedorId) ?? null;
  const opcionesProveedor = useMemo(() => (proveedores.data ?? []).map(p => ({ value: p.id, label: p.nombre, description: p.ruc ?? undefined })), [proveedores.data]);
  // Órdenes de ese proveedor (la nota normalmente nace de una de ellas)
  const opcionesOrden = useMemo(() => (entradas.data ?? [])
    .filter(e => proveedor && String(e.proveedor_id ?? '') === proveedor.id && !/anul|rechaz/i.test(String(e.estado ?? '')))
    .map(e => ({ value: e.id, label: String(e.id).replace(/^ENT-/, ''), description: `${formatFechaPe(e.fecha)} · ${String(e.estado ?? '')}` })), [entradas.data, proveedor]);

  function calcularIgv() {
    const t = dec(total);
    if (!(t > 0)) return;
    const b = r2(t / 1.18);
    setBase(b.toFixed(2)); setIgv(r2(t - b).toFixed(2));
    haptic('selection');
  }

  async function guardar() {
    const e: Errores = {};
    if (!proveedor) e.proveedor = 'Elige el proveedor.';
    if (!serie.trim()) e.serie = 'Escribe la serie (ej. FC01).';
    if (!numero.trim()) e.numero = 'Escribe el número.';
    if (!fecha) e.fecha = 'Indica la fecha de emisión.';
    else if (fecha > hoy()) e.fecha = 'La fecha no puede ser futura.';
    if (!(dec(total) > 0)) e.total = 'El total debe ser mayor a 0.';
    if (dec(base) > 0 && dec(igv) >= 0 && Math.abs(dec(base) + dec(igv) - dec(total)) > 0.02) e.total = 'La base más el IGV no coinciden con el total.';
    if (!archivo) e.archivo = 'Adjunta la nota de crédito (PDF, XML o foto): es obligatorio.';
    setErrores(e);
    if (Object.keys(e).length || !proveedor || !archivo) { haptic('warning'); return; }

    const fd = new FormData();
    fd.append('proveedor_id', proveedor.id);
    fd.append('proveedor_nombre', proveedor.nombre);
    if (proveedor.ruc) fd.append('proveedor_ruc', proveedor.ruc);
    fd.append('serie', serie.trim().toUpperCase());
    fd.append('numero', numero.trim());
    fd.append('fecha_emision', fecha);
    fd.append('moneda', moneda);
    if (base) fd.append('base', String(dec(base)));
    if (igv) fd.append('igv', String(dec(igv)));
    fd.append('total', String(dec(total)));
    fd.append('motivo_sunat', motivoSunat);
    fd.append('motivo_texto', MOTIVOS_SUNAT.find(m => m.value === motivoSunat)?.label ?? '');
    if (ocOrigen) fd.append('oc_origen', ocOrigen);
    fd.append('forma', forma);
    if (referencia.trim()) fd.append('referencia_devolucion', referencia.trim());
    if (observaciones.trim()) fd.append('observaciones', observaciones.trim());
    fd.append('archivo', archivo);

    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; id: number; codigo: string; error?: string }>('/compras/notas-credito', { method: 'POST', body: fd });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar la nota');
      haptic('success');
      toast(`Nota ${r.codigo} registrada. Falta que otra persona la apruebe.`);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'notas-credito'] });
      onCreada(r.id);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar nota de crédito" ancho
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Registrar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Proveedor" wide error={errores.proveedor}>
          {p => <Combobox {...p} options={opcionesProveedor} value={proveedorId || null} onChange={v => { setProveedorId(v ?? ''); setOcOrigen(''); }}
            enHoja compacta placeholder="Busca el proveedor" tituloHoja="Proveedor" loading={proveedores.isLoading} />}
        </Field>
        <Field label="Serie" error={errores.serie} hint="Como figura en la nota, ej. FC01">
          {p => <TextInput {...p} value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} maxLength={10} className="ce-f__mono" />}
        </Field>
        <Field label="Número" error={errores.numero}>
          {p => <TextInput {...p} value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={20} className="ce-f__mono" />}
        </Field>
        <Field label="Fecha de emisión" error={errores.fecha}>
          {p => <TextInput {...p} type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />}
        </Field>
        <Field label="Moneda">
          {() => <ChoiceChips label="Moneda" value={moneda} onChange={setMoneda} options={[{ value: 'PEN', label: 'Soles (S/)' }, { value: 'USD', label: 'Dólares (US$)' }]} />}
        </Field>
        <Field label="Total de la nota" error={errores.total}>
          {p => <TextInput {...p} inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label="Base imponible" hint="Opcional">
          {p => <TextInput {...p} inputMode="decimal" value={base} onChange={e => setBase(e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label="IGV" hint={<button type="button" className="placas-limpiar" onClick={calcularIgv} disabled={!(dec(total) > 0)}>Calcular desde el total (18 %)</button>}>
          {p => <TextInput {...p} inputMode="decimal" value={igv} onChange={e => setIgv(e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label="Motivo (SUNAT)" wide>
          {() => <ChoiceChips label="Motivo" value={motivoSunat} onChange={setMotivoSunat} options={MOTIVOS_SUNAT} />}
        </Field>
        <Field label="Orden de compra de origen" wide hint={proveedor ? (opcionesOrden.length ? 'La nota no puede superar el importe de esa orden' : 'Este proveedor no tiene órdenes disponibles') : 'Elige primero el proveedor'}>
          {p => <Combobox {...p} options={opcionesOrden} value={ocOrigen || null} onChange={v => setOcOrigen(v ?? '')} enHoja compacta disabled={!proveedor}
            placeholder="Opcional" tituloHoja="Orden de origen" loading={entradas.isLoading} />}
        </Field>
        <Field label="¿Qué se hará con el saldo?" wide hint={forma === 'APLICAR' ? 'Se descuenta en el pago de las próximas órdenes de este proveedor' : 'El proveedor devolverá el dinero: se registra el ingreso en Caja'}>
          {() => <ChoiceChips label="Saldo" value={forma} onChange={setForma} options={[{ value: 'APLICAR', label: 'Aplicar a próximas órdenes' }, { value: 'REEMBOLSO', label: 'Reembolso en dinero' }]} />}
        </Field>
        <Field label="Guía o salida de la devolución" wide hint="Opcional: guía de remisión o N° de salida de almacén de lo que se devolvió">
          {p => <TextInput {...p} value={referencia} onChange={e => setReferencia(e.target.value)} />}
        </Field>
        <Field label="Archivo de la nota (PDF, XML o foto)" wide error={errores.archivo} hint={archivo ? undefined : 'Obligatorio: es la evidencia para la auditoría'}>
          {p => <ArchivoInput {...p} key={claveArchivo} accept="application/pdf,text/xml,application/xml,image/*" onChange={f => { setArchivo(f); setErrores(x => ({ ...x, archivo: undefined })); }} />}
        </Field>
        <Field label="Observaciones" wide>
          {p => <TextInput {...p} value={observaciones} onChange={e => setObservaciones(e.target.value)} />}
        </Field>
        {dec(total) > 0 && <p className="t-footnote c-secondary field--wide" style={{ margin: 0 }}>Saldo a favor al aprobarla: {montoNc(dec(total), moneda)}</p>}
      </div>
    </Sheet>
  );
}
