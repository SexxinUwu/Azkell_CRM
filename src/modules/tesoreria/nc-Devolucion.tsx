import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';
import { guardarSalida, useEntradas, useProveedores, type ItemSalida } from '../almacen/api';
import { montoNc } from './nc-api';

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DevolucionHecha { proveedorId: string; ocOrigen: string; referencia: string; total: number; moneda: 'PEN' | 'USD' }

/**
 * Devolver mercadería a un proveedor: se elige la orden de compra, las cantidades que vuelven y el motivo.
 * El sistema genera la salida de almacén (baja el stock y queda en el kardex) y deja listos los datos para registrar la nota de crédito.
 */
export function NcDevolucion({ open, onClose, onHecha }: { open: boolean; onClose: () => void; onHecha: (d: DevolucionHecha) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const proveedores = useProveedores();
  const entradas = useEntradas();

  const [proveedorId, setProveedorId] = useState('');
  const [ordenId, setOrdenId] = useState('');
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (open) { setProveedorId(''); setOrdenId(''); setCantidades({}); setMotivo(''); setError(null); } }, [open]);

  const proveedor = (proveedores.data ?? []).find(p => p.id === proveedorId) ?? null;
  const opcionesProveedor = useMemo(() => (proveedores.data ?? []).map(p => ({ value: p.id, label: p.nombre, description: p.ruc ?? undefined })), [proveedores.data]);
  const ordenes = useMemo(() => (entradas.data ?? []).filter(e => proveedor && String(e.proveedor_id ?? '') === proveedor.id
    && !/anul|rechaz|regist/i.test(String(e.estado ?? '')) && (e.items ?? []).some(i => i.inventario_id && !/^SERV/i.test(i.inventario_id))), [entradas.data, proveedor]);
  const orden = ordenes.find(e => e.id === ordenId) ?? null;
  const items = useMemo(() => (orden?.items ?? []).map((it, k) => ({ it, k })).filter(({ it }) => it.inventario_id && !/^SERV/i.test(it.inventario_id)), [orden]);
  const moneda: 'PEN' | 'USD' = orden && /USD|D[ÓO]LAR/i.test(orden.moneda) ? 'USD' : 'PEN';

  const lineas = items.map(({ it, k }) => {
    const max = Number(it.cantidad_recibida ?? it.cantidad) || 0;
    const cant = Math.min(max, Math.max(0, Number(cantidades[k]) || 0));
    return { it, k, max, cant, importe: r2(cant * (Number(it.costo_unitario) || 0)) };
  });
  const elegidas = lineas.filter(l => l.cant > 0);
  const total = r2(elegidas.reduce((s, l) => s + l.importe, 0));

  async function devolver() {
    if (!orden || !proveedor) { setError('Elige el proveedor y la orden.'); return; }
    if (!elegidas.length) { setError('Indica la cantidad que se devuelve de al menos un artículo.'); haptic('warning'); return; }
    if (motivo.trim().length < 4) { setError('Escribe el motivo de la devolución.'); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const salidaItems: ItemSalida[] = elegidas.map(l => ({ inventario_id: l.it.inventario_id, descripcion: l.it.descripcion, cantidad: l.cant, costo_unitario: Number(l.it.costo_unitario) || 0, moneda: l.it.moneda || 'PEN', importe: l.importe }));
      const r = await guardarSalida({
        fecha: hoy(), tipo_destino: 'Devolucion a proveedor', responsable: proveedor.nombre, moneda: orden.moneda,
        observaciones: `DEVOLUCIÓN A PROVEEDOR · orden ${String(orden.id).replace(/^ENT-/, '')} · ${motivo.trim()}`, creado_por: user?.name ?? '', items: salidaItems,
      } as Parameters<typeof guardarSalida>[0]) as { ok?: boolean; id?: string | number; error?: string };
      if (r.ok === false || r.error) throw new Error(r.error || 'No se pudo registrar la salida');
      haptic('success');
      toast(`Devolución registrada${r.id ? ` (${r.id})` : ''}: el stock ya bajó. Falta la nota de crédito del proveedor.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['almacen'] }), qc.invalidateQueries({ queryKey: ['tesoreria', 'notas-credito'] })]);
      onHecha({ proveedorId: proveedor.id, ocOrigen: orden.id, referencia: String(r.id ?? ''), total, moneda });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Devolver mercadería a un proveedor" ancho
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={devolver} loading={enviando} disabled={!orden}>Registrar devolución{total > 0 ? ` · ${montoNc(total, moneda)}` : ''}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <div className="field field--wide"><Notice>Se genera la salida de almacén (baja el stock y queda en el kardex). Luego registras la nota de crédito que te dé el proveedor.</Notice></div>
        <Field label="Proveedor" wide>
          {p => <Combobox {...p} options={opcionesProveedor} value={proveedorId || null} onChange={v => { setProveedorId(v ?? ''); setOrdenId(''); setCantidades({}); }}
            enHoja compacta placeholder="Busca el proveedor" tituloHoja="Proveedor" loading={proveedores.isLoading} />}
        </Field>
        <Field label="Orden de compra" wide hint={proveedor && ordenes.length === 0 ? 'Este proveedor no tiene órdenes con artículos de almacén' : undefined}>
          {p => <Combobox {...p} options={ordenes.map(e => ({ value: e.id, label: String(e.id).replace(/^ENT-/, ''), description: `${formatFechaPe(e.fecha)} · ${String(e.estado ?? '')}` }))}
            value={ordenId || null} onChange={v => { setOrdenId(v ?? ''); setCantidades({}); }} enHoja compacta disabled={!proveedor} placeholder="Elige la orden" tituloHoja="Orden de compra" loading={entradas.isLoading} />}
        </Field>
        {orden && (
          <div className="field field--wide">
            <ul className="nc-lineas" style={{ gap: 'var(--s-3)' }}>
              {lineas.map(l => (
                <li key={l.k} style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{l.it.descripcion}<small>Recibido {l.max} · {montoNc(Number(l.it.costo_unitario) || 0, moneda)} c/u</small></span>
                  <TextInput aria-label={`Cantidad a devolver de ${l.it.descripcion}`} inputMode="decimal" value={cantidades[l.k] ?? ''} placeholder="0" style={{ width: '5.5rem', textAlign: 'right' }}
                    onChange={e => setCantidades(c => ({ ...c, [l.k]: e.target.value }))} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Motivo de la devolución" wide>
          {p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Llegó con defecto de fábrica" />}
        </Field>
      </div>
    </Sheet>
  );
}
