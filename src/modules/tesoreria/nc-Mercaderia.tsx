import { useEffect, useMemo, useState } from 'react';
import { PackageMinus } from 'lucide-react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { formatFechaPe } from '../../core/lib/format';
import { useSalidas, type EntradaInv, type ItemSalida } from '../almacen/api';
import { montoNc, useNotasCredito } from './nc-api';

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ModoMercaderia = 'ninguna' | 'ya' | 'ahora';

/** Artículos de almacén de una orden (los servicios no se devuelven) */
const devolvibles = (orden: EntradaInv | null) => (orden?.items ?? []).map((it, k) => ({ it, k })).filter(({ it }) => it.inventario_id && !/^SERV/i.test(it.inventario_id));

/**
 * Estado de la sección "Mercadería devuelta" de la nota de crédito: ya devolví (se enlaza la salida), devolver ahora
 * (se genera la salida de almacén) o aún no. El formulario lo lee al registrar.
 */
export function useMercaderia(orden: EntradaInv | null) {
  const [modo, setModo] = useState<ModoMercaderia>('ninguna');
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [salidaYa, setSalidaYa] = useState('');

  // Al cambiar de orden se empieza de cero
  useEffect(() => { setCantidades({}); setSalidaYa(''); setModo('ninguna'); }, [orden?.id]);

  const lineas = useMemo(() => devolvibles(orden).map(({ it, k }) => {
    const max = Number(it.cantidad_recibida ?? it.cantidad) || 0;
    const cant = Math.min(max, Math.max(0, Number(cantidades[k]) || 0));
    return { it, k, max, cant, importe: r2(cant * (Number(it.costo_unitario) || 0)) };
  }), [orden, cantidades]);
  const elegidas = lineas.filter(l => l.cant > 0);
  const totalDevuelto = r2(elegidas.reduce((s, l) => s + l.importe, 0));
  const itemsSalida: ItemSalida[] = elegidas.map(l => ({
    inventario_id: l.it.inventario_id, descripcion: l.it.descripcion, cantidad: l.cant, costo_unitario: Number(l.it.costo_unitario) || 0, moneda: l.it.moneda || 'PEN', importe: l.importe,
  }));
  return { modo, setModo, cantidades, setCantidades, salidaYa, setSalidaYa, lineas, elegidas, totalDevuelto, itemsSalida, hayArticulos: lineas.length > 0 };
}
export type Mercaderia = ReturnType<typeof useMercaderia>;

/** Salidas de "Devolución a proveedor" que todavía no respaldan ninguna nota; primero las del proveedor */
export function useSalidasLibres(proveedorNombre: string | null) {
  const salidas = useSalidas();
  const notas = useNotasCredito();
  return useMemo(() => {
    const usadas = new Set((notas.data ?? []).filter(n => n.estado !== 'ANULADA' && n.referencia_devolucion).map(n => String(n.referencia_devolucion)));
    const nombre = (proveedorNombre ?? '').trim().toUpperCase();
    return (salidas.data ?? [])
      .filter(s => /devoluci[oó]n a proveedor/i.test(String(s.tipo_destino ?? '')) && !usadas.has(String(s.id)))
      .sort((a, b) => Number((b.responsable ?? '').trim().toUpperCase() === nombre) - Number((a.responsable ?? '').trim().toUpperCase() === nombre) || String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
  }, [salidas.data, notas.data, proveedorNombre]);
}

export function NcMercaderia({ h, moneda, proveedorNombre, sugerirDevolucion }: {
  h: Mercaderia; moneda: 'PEN' | 'USD'; proveedorNombre: string | null; sugerirDevolucion: boolean;
}) {
  const libres = useSalidasLibres(proveedorNombre);
  return (
    <div className="ncf-merc">
      <SegmentedControl<ModoMercaderia> block label="Mercadería devuelta" value={h.modo} onChange={h.setModo}
        options={[{ value: 'ahora', label: 'Devolver ahora' }, { value: 'ya', label: 'Ya la devolví' }, { value: 'ninguna', label: 'Aún no / no aplica' }]} />

      {h.modo === 'ninguna' && (
        <p className="field__hint" style={{ margin: 0 }}>
          {sugerirDevolucion
            ? 'El motivo es una devolución: la nota quedará con el aviso «Falta registrar la salida» hasta que la enlaces.'
            : 'Para descuentos o bonificaciones no hay mercadería que devolver.'}
        </p>
      )}

      {h.modo === 'ya' && (
        <>
          <Combobox options={libres.map(s => ({ value: String(s.id), label: String(s.id), description: `${s.fecha ? formatFechaPe(s.fecha) : ''} · ${s.responsable ?? ''}` }))}
            value={h.salidaYa || null} onChange={v => h.setSalidaYa(v ?? '')} enHoja compacta placeholder="Elige la salida de la devolución" tituloHoja="Salida de almacén" />
          {libres.length === 0 && <p className="field__hint" style={{ margin: 0 }}>No hay salidas de devolución sin nota. Usa «Devolver ahora» para generarla.</p>}
        </>
      )}

      {h.modo === 'ahora' && (
        h.hayArticulos ? (
          <>
            <ul className="nc-lineas ncf-merc__lista">
              {h.lineas.map(l => (
                <li key={l.k} style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{l.it.descripcion}<small>Recibido {l.max} · {montoNc(Number(l.it.costo_unitario) || 0, moneda)} c/u</small></span>
                  <TextInput aria-label={`Cantidad a devolver de ${l.it.descripcion}`} inputMode="decimal" value={h.cantidades[l.k] ?? ''} placeholder="0"
                    style={{ width: '5rem', textAlign: 'right' }} onChange={e => h.setCantidades(c => ({ ...c, [l.k]: e.target.value }))} />
                </li>
              ))}
            </ul>
            <p className="ncf-desglose" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PackageMinus size={14} aria-hidden />
              {h.totalDevuelto > 0 ? `Se genera la salida de almacén (baja el stock) por ${montoNc(h.totalDevuelto, moneda)}; ese valor se propone como total de la nota.` : 'Indica la cantidad que vuelve de cada artículo.'}
            </p>
          </>
        ) : <Notice>Esta orden no tiene artículos de almacén para devolver (solo servicios).</Notice>
      )}
    </div>
  );
}
