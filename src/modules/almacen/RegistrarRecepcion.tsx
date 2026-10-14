import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { registrarRecepcion, useAlmacenesLista, type RecepcionOC } from './api';

const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

// Registrar la entrega física (parcial o total) de una orden de compra: suma stock y deja el kardex.
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
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCant({}); setAlm({}); setFecha(ahoraLocal()); setObs(''); setArchivo(null); setError(null);
  }, [open, oc?.id]);

  const items = oc?.items ?? [];
  const pendientes = items.map((it, i) => ({ it, i })).filter(x => x.it.pendiente > 0);
  const nombresAlm = useMemo(() => {
    const n = new Set((almacenes ?? []).map(a => a.nombre));
    if (oc?.almacen) n.add(oc.almacen);
    return [...n];
  }, [almacenes, oc?.almacen]);

  const total = pendientes.reduce((s, { i }) => s + num(cant[i] ?? ''), 0);

  async function enviar() {
    if (!oc) return;
    const envio = [];
    for (const { it, i } of pendientes) {
      const c = num(cant[i] ?? '');
      if (c <= 0) continue;
      if (c > it.pendiente + 1e-9) { setError(`"${it.descripcion}": no puedes recibir más del saldo pendiente (${fmt(it.pendiente)}).`); return; }
      envio.push({
        inventario_id: it.inventario_id, descripcion: it.descripcion, cantidad_recibida: c,
        costo_unitario: it.costo_unitario, moneda: it.moneda, almacen: alm[i] || oc.almacen || 'ALM CENTRAL',
      });
    }
    if (!envio.length) { setError('Escribe una cantidad mayor a 0 en al menos un ítem.'); return; }
    const pendienteTotal = items.reduce((s, it) => s + it.pendiente, 0);
    setEnviando(true); setError(null);
    try {
      await registrarRecepcion({
        oc_id: oc.id, fecha_recepcion: fecha, usuario, observacion: obs.trim(), almacen: envio[0].almacen,
        tipo_recepcion: total >= pendienteTotal - 1e-9 ? 'TOTAL' : 'PARCIAL', items: envio, sustento: archivo,
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

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={oc ? `Recepcionar ${oc.id}` : 'Recepcionar'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={enviar} loading={enviando} disabled={total <= 0}>
            Registrar {total > 0 ? fmt(total) : ''} unidades
          </Button>
        </>
      }>
      {oc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          <div className="tarjeta__lista">
            {pendientes.map(({ it, i }) => (
              <div key={i} className="dato" style={{ gap: 'var(--s-2)' }}>
                <span className="dato__label" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{it.descripcion}</span>
                <span className="dato__valor" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                  Pedido {fmt(it.pedido)} · recibido {fmt(it.recepcionado)} · pendiente <strong>{fmt(it.pendiente)}</strong> {it.unidad}
                </span>
                <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextInput inputMode="decimal" placeholder="0" aria-label={`Cantidad recibida de ${it.descripcion}`}
                    value={cant[i] ?? ''} onChange={e => setCant(c => ({ ...c, [i]: e.target.value }))}
                    style={{ width: '6rem', textAlign: 'right' }} />
                  <button type="button" className="placas-limpiar" onClick={() => setCant(c => ({ ...c, [i]: String(it.pendiente) }))}>
                    Todo ({fmt(it.pendiente)})
                  </button>
                  {nombresAlm.length > 1 && (
                    <SelectInput value={alm[i] ?? oc.almacen} onChange={e => setAlm(a => ({ ...a, [i]: e.target.value }))}
                      aria-label="Almacén de destino" style={{ flex: 1, minWidth: '8rem' }}>
                      {nombresAlm.map(n => <option key={n} value={n}>{n}</option>)}
                    </SelectInput>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pendientes.length > 1 && (
            <button type="button" className="placas-limpiar" style={{ alignSelf: 'flex-start' }}
              onClick={() => setCant(Object.fromEntries(pendientes.map(({ it, i }) => [i, String(it.pendiente)])))}>
              Completar todo el saldo
            </button>
          )}

          <div className="form-grid">
            <Field label="Fecha y hora de recepción">
              {p => <TextInput {...p} type="datetime-local" value={fecha} max={ahoraLocal()} onChange={e => setFecha(e.target.value)} />}
            </Field>
            <Field label="Foto o documento de sustento" hint={archivo ? archivo.name : 'Guía, factura o foto (opcional)'}>
              {p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />}
            </Field>
            <Field label="Observaciones" wide>
              {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}
            </Field>
          </div>
        </div>
      )}
    </Sheet>
  );
}
