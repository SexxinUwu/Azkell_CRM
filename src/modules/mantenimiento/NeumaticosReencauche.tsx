// Orden de servicio de reencauche: generar la orden de compra con las llantas "Enviar para reforma" y despacharlas a la reformadora.
//   POST /almacen/entradas/generar-oc-reencauche   { codigos, proveedor_nombre, precios: { medida: precio }, condicion_pago }
//   GET  /neumaticos/ordenes-reencauche            órdenes abiertas
//   POST /neumaticos/despachar-reformadora         { oc_id, guia }
// La orden sigue su aprobación normal; solo una orden aprobada se puede despachar. Las llantas vuelven al recepcionar la orden.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatDolares, formatSoles } from '../../core/lib/format';
import { Button, PageLoader } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { useDetraccionTipos, useProveedores, useTipoCambioSunat } from '../almacen/api';

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
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('credito');
  const [dias, setDias] = useState('30');
  const [obs, setObs] = useState('');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [tc, setTc] = useState('');
  const [igv, setIgv] = useState<'sin_igv' | 'incluido' | 'mas_igv'>('sin_igv');
  const [cotizacion, setCotizacion] = useState('');
  const [detCodigo, setDetCodigo] = useState('');
  const [detPct, setDetPct] = useState('');
  const [detTc, setDetTc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipos = useDetraccionTipos();
  const sunat = useTipoCambioSunat(open && moneda === 'USD');

  useEffect(() => {
    if (!open) return;
    setProveedorId(null); setPrecios({}); setCondicion('credito'); setDias('30'); setObs(''); setError(null);
    setMoneda('PEN'); setTc(''); setIgv('sin_igv'); setCotizacion(''); setDetCodigo(''); setDetPct(''); setDetTc('');
  }, [open]);

  // El reencauche es un servicio de neumáticos: la detracción sugerida es la del tipo 020 (12 %), editable
  function elegirDetraccion(codigo: string) {
    setDetCodigo(codigo);
    const t = (tipos.data ?? []).find(x => x.codigo === codigo);
    setDetPct(t ? String(t.porcentaje) : '');
  }

  const porMedida = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of llantas) m.set(l.medida?.trim() || 'SIN MEDIDA', (m.get(l.medida?.trim() || 'SIN MEDIDA') ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [llantas]);
  const base = porMedida.reduce((s, [medida, n]) => s + n * (num(precios[medida] ?? '') || 0), 0);
  // Los importes de la orden siempre llevan IGV: «+ IGV» suma el 18 %
  const factor = igv === 'mas_igv' ? 1.18 : 1;
  const total = Math.round(base * factor * 100) / 100;
  const igvMonto = igv === 'sin_igv' ? 0 : igv === 'mas_igv' ? Math.round((total - base) * 100) / 100 : Math.round((total - total / 1.18) * 100) / 100;
  const usd = moneda === 'USD';
  const money = (n: number) => (usd ? formatDolares(n) : formatSoles(n));
  const tcNum = num(tc);
  const detTcNum = num(detTc) || sunat.data?.venta || tcNum;
  const detPctNum = num(detPct);
  const detTipo = (tipos.data ?? []).find(x => x.codigo === detCodigo) ?? null;
  const detBaseSoles = usd ? total * (Number.isFinite(detTcNum) ? detTcNum : 0) : total;
  const detAplica = !!detTipo && detPctNum > 0 && detBaseSoles > (detTipo.monto_minimo ?? 0);
  const detMonto = detAplica ? Math.round(detBaseSoles * detPctNum / 100) : 0;
  const proveedor = (proveedores.data ?? []).find(p => String(p.id) === proveedorId) ?? null;

  async function generar() {
    if (!proveedor) { setError('Elige la reformadora (proveedor).'); return; }
    const precioPorMedida: Record<string, number> = {};
    for (const [medida] of porMedida) {
      const v = num(precios[medida] ?? '');
      if (!Number.isFinite(v) || v < 0) { setError(`Escribe el precio por llanta de la medida ${medida}.`); return; }
      precioPorMedida[medida] = v;
    }
    if (usd && !(tcNum > 0)) { setError('Escribe el tipo de cambio de la orden en dólares.'); return; }
    if (detCodigo && !(detPctNum > 0)) { setError('Escribe el porcentaje de la detracción.'); return; }
    if (detCodigo && usd && !(detTcNum > 0)) { setError('Escribe el tipo de cambio de la detracción.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; id?: string; error?: string }>('/almacen/entradas/generar-oc-reencauche', {
        method: 'POST',
        body: {
          codigos: llantas.map(l => l.codigo), proveedor_nombre: proveedor.nombre, proveedor_id: proveedor.id, proveedor_ruc: proveedor.ruc,
          precios: precioPorMedida, condicion_pago: condicion === 'credito' ? 'Crédito' : 'Al contado', dias_credito: condicion === 'credito' ? Number(dias) || 30 : 0,
          observaciones: obs.trim(), moneda, tipo_cambio: usd ? tcNum : undefined, tipo_igv: igv, documento_referencia: cotizacion.trim(),
          ...(detCodigo ? { detraccion_codigo: detCodigo, detraccion_pct: detPctNum, detraccion_tc: usd ? detTcNum : undefined } : {}),
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
        <Field label="Moneda de la cotización">
          {() => (
            <SegmentedControl<'PEN' | 'USD'> label="Moneda" value={moneda} onChange={setMoneda} block
              options={[{ value: 'PEN', label: 'Soles' }, { value: 'USD', label: 'Dólares' }]} />
          )}
        </Field>
        {usd && (
          <Field label="Tipo de cambio de la orden">
            {p => <TextInput {...p} inputMode="decimal" placeholder="Ej. 3.40" value={tc} onChange={e => setTc(e.target.value)} />}
          </Field>
        )}
        <Field label="IGV del precio">
          {() => (
            <SegmentedControl<'sin_igv' | 'incluido' | 'mas_igv'> label="IGV" value={igv} onChange={setIgv} block
              options={[{ value: 'sin_igv', label: 'Sin IGV' }, { value: 'incluido', label: 'IGV incluido' }, { value: 'mas_igv', label: '+ IGV 18 %' }]} />
          )}
        </Field>
        <Field label="N° de cotización (opcional)">
          {p => <TextInput {...p} value={cotizacion} placeholder="Ej. NP/CL-01-540_2026" onChange={e => setCotizacion(e.target.value)} />}
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
        <Field label="Detracción (SPOT)">
          {p => (
            <SelectInput {...p} value={detCodigo} onChange={e => elegirDetraccion(e.target.value)}>
              <option value="">Sin detracción</option>
              {(tipos.data ?? []).map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.descripcion} ({t.porcentaje} %)</option>)}
            </SelectInput>
          )}
        </Field>
        {detCodigo && (
          <div style={{ display: 'grid', gridTemplateColumns: usd ? '1fr 1fr' : '1fr', gap: 'var(--s-3)' }}>
            <Field label="% de detracción">
              {p => <TextInput {...p} inputMode="decimal" value={detPct} onChange={e => setDetPct(e.target.value)} />}
            </Field>
            {usd && (
              <Field label="T.C. de la detracción">
                {p => <TextInput {...p} inputMode="decimal" placeholder={sunat.data?.venta ? String(sunat.data.venta) : (tc || 'Ej. 3.4555')} value={detTc} onChange={e => setDetTc(e.target.value)} />}
              </Field>
            )}
          </div>
        )}
        <div className="t-numeric" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {igv !== 'sin_igv' && <div style={{ display: 'flex', justifyContent: 'space-between' }} className="c-secondary"><span>IGV 18 %</span><span>{money(igvMonto)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Total de la orden</span><span>{money(total)}</span>
          </div>
          {usd && tcNum > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }} className="c-secondary"><span>Equivale en soles</span><span>{formatSoles(Math.round(total * tcNum * 100) / 100)}</span></div>}
          {detCodigo && (detAplica
            ? <div style={{ display: 'flex', justifyContent: 'space-between' }} className="c-secondary"><span>Detracción {detPct} % (se deposita en soles)</span><span>{formatSoles(detMonto)}</span></div>
            : <div className="c-secondary">La detracción no aplica: el total no supera el monto mínimo del tipo.</div>)}
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
