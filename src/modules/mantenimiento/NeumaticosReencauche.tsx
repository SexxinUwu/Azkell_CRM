// Orden de servicio de reencauche: generar la orden de compra con las llantas "Enviar para reforma" y despacharlas a la reformadora.
//   POST /almacen/entradas/generar-oc-reencauche   { codigos, proveedor_nombre, precios: { medida: precio }, condicion_pago }
//   GET  /neumaticos/ordenes-reencauche            órdenes abiertas
//   POST /neumaticos/despachar-reformadora         { oc_id, guia }
// La orden sigue su aprobación normal; solo una orden aprobada se puede despachar. Las llantas vuelven al recepcionar la orden.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { Button, PageLoader } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { useProveedores } from '../almacen/api';

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

interface LlantaOrden { codigo: string; medida: string | null }

/** Genera la orden de compra de reencauche: una línea de servicio por medida, con el precio por llanta de cada medida */
export function GenerarOrdenReencaucheSheet({ open, onClose, llantas, onHecho }: {
  open: boolean; onClose: () => void; llantas: LlantaOrden[]; onHecho: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const proveedores = useProveedores();
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado');
  const [dias, setDias] = useState('30');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProveedorId(null); setPrecios({}); setCondicion('contado'); setDias('30'); setObs(''); setError(null);
  }, [open]);

  const porMedida = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of llantas) m.set(l.medida?.trim() || 'SIN MEDIDA', (m.get(l.medida?.trim() || 'SIN MEDIDA') ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [llantas]);
  const total = porMedida.reduce((s, [medida, n]) => s + n * (num(precios[medida] ?? '') || 0), 0);
  const proveedor = (proveedores.data ?? []).find(p => String(p.id) === proveedorId) ?? null;

  async function generar() {
    if (!proveedor) { setError('Elige la reformadora (proveedor).'); return; }
    const precioPorMedida: Record<string, number> = {};
    for (const [medida] of porMedida) {
      const v = num(precios[medida] ?? '');
      if (!Number.isFinite(v) || v < 0) { setError(`Escribe el precio por llanta de la medida ${medida}.`); return; }
      precioPorMedida[medida] = v;
    }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>('/almacen/entradas/generar-oc-reencauche', {
        method: 'POST',
        body: {
          codigos: llantas.map(l => l.codigo), proveedor_nombre: proveedor.nombre, proveedor_id: proveedor.id, proveedor_ruc: proveedor.ruc,
          precios: precioPorMedida, condicion_pago: condicion === 'credito' ? 'Crédito' : 'Al contado', dias_credito: condicion === 'credito' ? Number(dias) || 30 : 0,
          observaciones: obs.trim(),
        },
      });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo generar la orden');
      haptic('success');
      toast(`Orden ${r.id ?? ''} generada: queda pendiente de aprobación`);
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
      await qc.invalidateQueries({ queryKey: ['almacen'] });
      onHecho();
    } catch (err) {
      setError(errorMessage(err)); haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Generar orden de reencauche"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={generar} loading={enviando} disabled={!proveedor}>Generar orden</Button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error">{error}</Notice>}
        <p className="t-callout c-secondary" style={{ margin: 0 }}>
          {llantas.length} {llantas.length === 1 ? 'llanta' : 'llantas'} en una orden de compra del servicio de reencauche, con una línea por medida.
          La orden pasa por la aprobación normal de Gerencia; después se despachan a la reformadora.
        </p>
        <Field label="Reformadora (proveedor)">
          {p => (
            <Combobox {...p} loading={proveedores.isLoading} value={proveedorId} onChange={setProveedorId} placeholder="Busca la reformadora"
              options={(proveedores.data ?? []).map(x => ({ value: String(x.id), label: x.nombre, description: x.ruc ?? undefined }))} />
          )}
        </Field>
        {porMedida.map(([medida, n]) => (
          <Field key={medida} label={`Precio por llanta · ${medida} (${n} ${n === 1 ? 'llanta' : 'llantas'})`}>
            {p => <TextInput {...p} inputMode="decimal" placeholder="0.00" value={precios[medida] ?? ''}
              onChange={e => setPrecios(x => ({ ...x, [medida]: e.target.value }))} />}
          </Field>
        ))}
        <Field label="Condición de pago">
          {() => (
            <SegmentedControl<'contado' | 'credito'> label="Condición de pago" value={condicion} onChange={setCondicion} block
              options={[{ value: 'contado', label: 'Al contado' }, { value: 'credito', label: 'A crédito' }]} />
          )}
        </Field>
        {condicion === 'credito' && (
          <Field label="Días de crédito">
            {p => <TextInput {...p} inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, '').slice(0, 3))} />}
          </Field>
        )}
        <Field label="Observaciones">
          {p => <TextInput {...p} value={obs} placeholder="Opcional" onChange={e => setObs(e.target.value)} />}
        </Field>
        <div className="t-numeric" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total de la orden</span><span>{formatSoles(total)}</span>
        </div>
      </div>
    </Sheet>
  );
}

interface OrdenReencauche {
  oc_id: string; proveedor: string; estado_oc: string; aprobada: boolean; pendientes: number; en_reformadora: number;
}

function useOrdenesReencauche(enabled: boolean) {
  return useQuery<OrdenReencauche[]>({
    queryKey: ['mant', 'neumaticos', 'ordenes-reencauche'],
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const r = await api<{ ok?: boolean; error?: string; data?: OrdenReencauche[] }>('/neumaticos/ordenes-reencauche');
      if (r.ok === false) throw new Error(r.error ?? 'No se pudieron cargar las órdenes');
      return r.data ?? [];
    },
  });
}

/** Despacha a la reformadora las llantas pendientes de una orden aprobada, con la guía de remisión */
export function DespacharReformadoraSheet({ open, onClose, onHecho }: { open: boolean; onClose: () => void; onHecho: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const ordenes = useOrdenesReencauche(open);
  const [ocId, setOcId] = useState('');
  const [guia, setGuia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setOcId(''); setGuia(''); setError(null); } }, [open]);

  const lista = ordenes.data ?? [];
  const listas = lista.filter(o => o.aprobada && o.pendientes > 0);
  const esperando = lista.filter(o => !o.aprobada && o.pendientes > 0);
  const elegida = listas.find(o => o.oc_id === ocId) ?? null;

  async function despachar() {
    if (!elegida) { setError('Elige una orden aprobada.'); return; }
    if (!guia.trim()) { setError('Escribe el número de la guía de remisión.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; data?: { despachadas: number } }>('/neumaticos/despachar-reformadora', {
        method: 'POST', body: { oc_id: elegida.oc_id, guia: guia.trim() },
      });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo despachar');
      haptic('success');
      toast(`${r.data?.despachadas ?? elegida.pendientes} llantas despachadas a la reformadora`);
      await qc.invalidateQueries({ queryKey: ['mant', 'neumaticos'] });
      onHecho();
    } catch (err) {
      setError(errorMessage(err)); haptic('warning');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Despachar a la reformadora"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={despachar} loading={enviando} disabled={!elegida}>
            {elegida ? `Despachar ${elegida.pendientes} ${elegida.pendientes === 1 ? 'llanta' : 'llantas'}` : 'Despachar'}
          </Button>
        </>
      }>
      {ordenes.isLoading ? <PageLoader /> : ordenes.isError ? <Notice tone="error">{errorMessage(ordenes.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {error && <Notice tone="error">{error}</Notice>}
          <p className="t-callout c-secondary" style={{ margin: 0 }}>
            Solo se despachan las llantas de una orden de reencauche ya aprobada. Al despacharlas pasan a «En la reformadora»
            y vuelven al recepcionar la orden en Almacén &gt; Recepción de compras.
          </p>
          {listas.length === 0 ? (
            <Notice tone="neutral">No hay órdenes aprobadas con llantas pendientes de despacho.</Notice>
          ) : (
            <Field label="Orden de reencauche">
              {p => (
                <SelectInput {...p} value={ocId} onChange={e => setOcId(e.target.value)}>
                  <option value="">Elige una orden…</option>
                  {listas.map(o => <option key={o.oc_id} value={o.oc_id}>{o.oc_id} · {o.proveedor} · {o.pendientes} {o.pendientes === 1 ? 'llanta' : 'llantas'}</option>)}
                </SelectInput>
              )}
            </Field>
          )}
          <Field label="Guía de remisión">
            {p => <TextInput {...p} value={guia} placeholder="Ej: T001-00045" onChange={e => setGuia(e.target.value)} />}
          </Field>
          {esperando.length > 0 && (
            <p className="t-callout c-secondary" style={{ margin: 0 }}>
              Esperando aprobación: {esperando.map(o => `${o.oc_id} (${o.pendientes})`).join(', ')}.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
