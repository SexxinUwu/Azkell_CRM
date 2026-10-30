import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { registrarRecepcion, useAlmacenesLista, useTipoCambioSunat, type RecepcionOC } from './api';

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

/**
 * Registrar la entrega física (parcial o total) de una orden de compra.
 * Suma stock y deja el kardex. El servidor, en una sola transacción, recalcula el costo promedio en soles,
 * cierra o parcializa la O/C y crea las llantas si el artículo es de neumáticos: el cliente no duplica nada.
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
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoKey, setArchivoKey] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errLinea, setErrLinea] = useState<Record<number, string | undefined>>({});
  const [errTc, setErrTc] = useState<string | undefined>();

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
    setArchivo(null); setArchivoKey(k => k + 1); setError(null); setErrLinea({}); setErrTc(undefined);
  }, [open, oc?.id]);

  const items = oc?.items ?? [];
  const pendientes = items.map((it, i) => ({ it, i })).filter(x => x.it.pendiente > 0);
  // Solo los almacenes registrados; por defecto Principal (el de la orden si es uno de ellos)
  const nombresAlm = useMemo(() => {
    const n = (almacenes ?? []).map(a => a.nombre);
    return n.length ? n : ['Principal'];
  }, [almacenes]);
  const almacenDefecto = nombresAlm.includes(oc?.almacen ?? '') ? (oc?.almacen as string) : (nombresAlm.includes('Principal') ? 'Principal' : nombresAlm[0]);

  const total = pendientes.reduce((s, { i }) => s + num(cant[i]), 0);
  // Valor que entra al inventario, siempre en soles (igual que el servidor: costo × TC en líneas USD)
  const valorSoles = pendientes.reduce((s, { it, i }) =>
    s + num(cant[i]) * (Number(it.costo_unitario) || 0) * (esUSD(it.moneda) ? tcNum : 1), 0);
  const valorListo = !usd || tcNum > 0;

  async function enviar() {
    if (!oc) return;
    const lineasMal: Record<number, string | undefined> = {};
    for (const { it, i } of pendientes) {
      if (num(cant[i]) > it.pendiente + 1e-9) lineasMal[i] = `No puedes recibir más del saldo pendiente (${fmt(it.pendiente)}).`;
    }
    setErrLinea(lineasMal);
    if (Object.values(lineasMal).some(Boolean)) { haptic('warning'); return; }

    const envio = pendientes
      .filter(({ i }) => num(cant[i]) > 0)
      .map(({ it, i }) => ({
        inventario_id: it.inventario_id, descripcion: it.descripcion, cantidad_recibida: num(cant[i]),
        costo_unitario: it.costo_unitario, moneda: it.moneda, almacen: alm[i] || almacenDefecto,
      }));
    if (!envio.length) { setError('Escribe una cantidad mayor a 0 en al menos un ítem.'); return; }
    if (usd && !(tcNum > 0)) { setErrTc('Indica el tipo de cambio del día.'); haptic('warning'); return; }

    const pendienteTotal = items.reduce((s, it) => s + it.pendiente, 0);
    setEnviando(true); setError(null); setErrTc(undefined);
    try {
      await registrarRecepcion({
        oc_id: oc.id, fecha_recepcion: fecha || ahoraLocal(), usuario, observacion: obs.trim(), almacen: envio[0].almacen,
        tipo_recepcion: total >= pendienteTotal - 1e-9 ? 'TOTAL' : 'PARCIAL', items: envio, sustento: archivo,
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

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={oc ? `Recepcionar ${oc.id}` : 'Recepcionar'} ancho
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={enviar} loading={enviando} disabled={total <= 0}>
            {total > 0 ? `Registrar ${fmt(total)} unidades` : 'Registrar recepción'}
          </Button>
        </>
      }>
      {oc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          <p className="t-callout c-secondary" style={{ margin: 0 }}>
            Indica lo que llegó físicamente. El saldo que no llegue queda pendiente en la orden.
          </p>

          <div className="tarjeta__lista">
            {items.map((it, i) => it.pendiente > 0 ? (
              <div key={i} className="dato" style={{ gap: 'var(--s-2)' }}>
                <span className="dato__label" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{it.descripcion}</span>
                {it.inventario_id && (
                  <span className="dato__valor dato__valor--mono" style={{ fontSize: '0.75rem', color: 'var(--accent-ink)' }}>{it.inventario_id}</span>
                )}
                <span className="dato__valor" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                  Pedido {fmt(it.pedido)} · recibido {fmt(it.recepcionado)} · pendiente <strong>{fmt(it.pendiente)}</strong> {it.unidad}
                </span>
                <div className="rec-entrada">
                  <TextInput inputMode="decimal" placeholder="0" aria-label={`Cantidad recibida de ${it.descripcion}`}
                    value={cant[i] ?? ''}
                    onChange={e => { setCant(c => ({ ...c, [i]: e.target.value })); setErrLinea(l => ({ ...l, [i]: undefined })); }} />
                  <button type="button" className="placas-limpiar" title={`Llenar con el saldo (${fmt(it.pendiente)})`}
                    onClick={() => { haptic('selection'); setCant(c => ({ ...c, [i]: String(it.pendiente) })); }}>
                    Todo ({fmt(it.pendiente)})
                  </button>
                  <SelectInput value={alm[i] ?? almacenDefecto} aria-label="Almacén de destino"
                    onChange={e => setAlm(a => ({ ...a, [i]: e.target.value }))}>
                    {nombresAlm.map(n => <option key={n} value={n}>{n}</option>)}
                  </SelectInput>
                </div>
                {errLinea[i] && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red-ink)' }}>{errLinea[i]}</p>}
              </div>
            ) : (
              <div key={i} className="dato" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
                <span className="dato__label" style={{ fontWeight: 600 }}>{it.descripcion}</span>
                <Badge tone="green">Completo · {fmt(it.recepcionado)}</Badge>
              </div>
            ))}
          </div>

          {pendientes.length > 0 && (
            <button type="button" className="placas-limpiar" style={{ alignSelf: 'flex-start' }}
              onClick={() => { haptic('selection'); setCant(Object.fromEntries(pendientes.map(({ it, i }) => [i, String(it.pendiente)]))); }}>
              Completar todo el saldo
            </button>
          )}

          <div className="form-grid">
            <Field label="Fecha y hora de recepción">
              {p => <TextInput {...p} type="datetime-local" value={fecha} max={ahoraLocal()} onChange={e => setFecha(e.target.value)} />}
            </Field>
            <Field label="Sustento (guía, factura o foto)" hint={archivo ? archivo.name : 'Opcional'}>
              {p => <ArchivoInput {...p} key={archivoKey} accept="image/*,application/pdf" onChange={setArchivo} />}
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

            <div className="field field--wide rec-resumen" aria-live="polite">
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Valor que ingresa al inventario (en soles)</span>
              <strong className="t-numeric" style={{ fontSize: '1.125rem' }}>{valorListo ? formatSoles(valorSoles) : '—'}</strong>
            </div>

            <Field label="Observaciones" wide>
              {p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej: entrega completa según guía GR-001" />}
            </Field>
          </div>
        </div>
      )}
    </Sheet>
  );
}
