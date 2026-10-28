import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileText, PackageCheck, Pencil, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Badge } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { formatFechaHoraPe, formatSoles } from '../../core/lib/format';
import { ETIQUETA_DESTINO, estadoSalida, type ArticuloInv, type ItemSalida, type SalidaInv } from './api';
import { AvisoSheet } from './SalidaDialogos';

// Ficha de una salida (clásico: panel de detalle). Pendiente: se marcan los repuestos a despachar
// (los que no tienen stock aparecen sin marcar) y se despacha la selección. El stock lo descuenta el servidor.

/** Artículo del inventario de un ítem de la salida (por código, o por descripción como el clásico) */
function articuloDeItem(it: ItemSalida, inventario: ArticuloInv[]): ArticuloInv | undefined {
  return inventario.find(x =>
    (!!it.inventario_id && x.id === it.inventario_id)
    || (!!it.descripcion && x.descripcion === it.descripcion)
    || (!!it.descripcion && !!x.id && it.descripcion.startsWith(x.id)));
}

/** "juan.perez@azkell.com" → "Juan perez" (como el clásico) */
export function nombreSolicitante(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  if (!s) return '—';
  if (!s.includes('@')) return s;
  const u = s.split('@')[0].replace(/[._-]/g, ' ');
  return u.charAt(0).toUpperCase() + u.slice(1);
}

const cantidad = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 3 });

export function SalidaDetalle({ open, onClose, salida, inventario, puedeEditar, puedeEliminar, onDespachar, onPdf, onVistaPrevia, onEditar, onAnular, onEliminar }: {
  open: boolean;
  onClose: () => void;
  salida: SalidaInv;
  inventario: ArticuloInv[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** Recibe los ítems marcados y el texto de confirmación; la página abre el diálogo */
  onDespachar: (sel: { id: number; itemIds: number[]; mensaje: ReactNode }) => void;
  onPdf: () => void;
  onVistaPrevia: () => void;
  onEditar: () => void;
  onAnular: () => void;
  onEliminar: () => void;
}) {
  const estado = estadoSalida(salida);
  const pendiente = estado === 'Pendiente';
  const items = salida.items ?? [];

  // Stock de cada ítem y si alcanza para lo pedido
  const filas = useMemo(() => items.map((it, idx) => {
    const art = articuloDeItem(it, inventario);
    const cant = Number(it.cantidad) || 0;
    const cu = Number(it.costo_unitario) || 0;
    const imp = Number(it.importe) || cant * cu;
    const stock = art ? Number(art.stock_actual) : null;
    return { it, idx, art, cant, cu, imp, stock, alcanza: stock === null || stock >= cant };
  }), [items, inventario]);

  const totalCant = filas.reduce((a, f) => a + f.cant, 0);
  const totalImp = filas.reduce((a, f) => a + f.imp, 0);
  const montoFinal = Number(salida.total_pen) > 0 ? Number(salida.total_pen) : totalImp;

  // Selección de despacho: al abrir, los ítems con stock quedan marcados (como el clásico)
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [avisoStock, setAvisoStock] = useState<string[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setMarcados(new Set(filas.filter(f => f.it.id != null && f.alcanza).map(f => f.idx)));
    // Se reinicia al abrir o al cambiar de salida; los demás cambios de stock no deben borrar la selección
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, salida.id]);

  const seleccionadas = filas.filter(f => marcados.has(f.idx));
  const selImp = seleccionadas.reduce((a, f) => a + f.imp, 0);
  const selCant = seleccionadas.reduce((a, f) => a + f.cant, 0);
  const parcial = pendiente && items.length > 1 && seleccionadas.length > 0 && seleccionadas.length < items.length;
  const todas = items.length > 0 && seleccionadas.length === items.length;

  function alternar(idx: number, on: boolean) {
    setMarcados(prev => { const n = new Set(prev); if (on) n.add(idx); else n.delete(idx); return n; });
  }

  function despachar() {
    const elegidas = seleccionadas.filter(f => f.it.id != null);
    if (!elegidas.length) return;
    const sinStock = elegidas.filter(f => f.stock !== null && f.stock < f.cant);
    if (sinStock.length) {
      setAvisoStock(sinStock.map(f => `${f.it.descripcion || f.it.inventario_id || '—'} (Req: ${cantidad(f.cant)}, Disp: ${Math.max(0, f.stock ?? 0)})`));
      return;
    }
    const mensaje = parcial
      ? <>¿Despachar <strong>{elegidas.length} de {items.length}</strong> repuestos seleccionados de la salida <strong>{salida.id}</strong>?<br /><span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>El resto de repuestos quedará como pendiente en una nueva salida.</span></>
      : <>¿Despachar los repuestos de la salida <strong>{salida.id}</strong>?<br />El stock del inventario de almacén será descontado inmediatamente.</>;
    onDespachar({ id: salida.id, itemIds: elegidas.map(f => f.it.id as number), mensaje });
  }

  const etiquetaDespacho = seleccionadas.length === 0
    ? 'Selecciona repuestos para despachar'
    : parcial
      ? `Despachar selección (${seleccionadas.length} de ${items.length} ítems · ${formatSoles(selImp)})`
      : 'Despachar salida';

  const puedeDespachar = pendiente && puedeEditar;
  const tono = estado === 'Despachado' ? 'green' : estado === 'Anulado' ? 'red' : 'amber';

  const acciones = (
    <div className="sal-acciones">
      {puedeDespachar ? (
        <Button variant="primary" size="lg" block icon={<PackageCheck size={18} />} disabled={seleccionadas.length === 0} onClick={despachar}>
          {etiquetaDespacho}
        </Button>
      ) : (
        <Button variant="primary" size="lg" block icon={<FileText size={18} />} onClick={onPdf}>
          Descargar documento PDF
        </Button>
      )}
      <div className="sal-acciones__fila">
        <Button variant="secondary" icon={<FileText size={16} />} onClick={onVistaPrevia}>Vista previa</Button>
        {puedeEditar && <Button variant="secondary" icon={<Pencil size={15} />} onClick={onEditar}>Editar</Button>}
        {puedeEliminar && (estado !== 'Anulado'
          ? <Button variant="danger" icon={<Trash2 size={15} />} onClick={onAnular}>Anular</Button>
          : <Badge tone="red">Salida anulada</Badge>)}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Salida ${salida.id}`} ancho footer={acciones}>
      <div className="sal-detalle">
        <div className="sal-detalle__cabecera">
          <div>
            <span className="sal-detalle__folio-k">Folio de salida</span>
            <span className="sal-detalle__folio">{salida.id}</span>
          </div>
          <Badge tone={tono}>{estado}</Badge>
          <div className="sal-detalle__menu">
            <MenuOtros opciones={[
              { label: 'Descargar PDF', onSelect: onPdf },
              puedeEditar && { label: 'Editar', onSelect: onEditar },
              puedeEliminar && { label: 'Eliminar', destructiva: true, separado: true, onSelect: onEliminar },
            ]} />
          </div>
        </div>

        <div className="tarjeta__lista">
          {salida.tipo_orden && <Dato k="Tipo de orden" v={salida.tipo_orden} />}
          <Dato k="N° OT" v={salida.ticket_ot || '—'} mono />
          <Dato k="Placa / destino" v={salida.placa || ETIQUETA_DESTINO[salida.tipo_destino ?? ''] || salida.tipo_destino || '—'} mono={!!salida.placa} />
          <Dato k="Fecha de registro" v={formatFechaHoraPe(salida.created_at || salida.fecha)} />
          <Dato k="Responsable" v={salida.responsable || '—'} />
          <Dato k="Solicitante" v={nombreSolicitante(salida.creado_por)} />
          {salida.observaciones && <Dato k="Observaciones / motivo" v={salida.observaciones} />}
          {estado === 'Anulado' && salida.motivo_anulacion && <Dato k="Motivo de anulación" v={salida.motivo_anulacion} />}
        </div>

        <div className="sal-detalle__articulos">
          <div className="sal-detalle__cabeza">
            <span className="sal-detalle__titulo">Artículos ({items.length})</span>
            <div className="sal-detalle__cabeza-acc">
              {pendiente && items.length > 1 && (
                <label className="sal-todos">
                  <input type="checkbox" checked={todas} onChange={e => setMarcados(e.target.checked ? new Set(filas.map(f => f.idx)) : new Set())} />
                  Todos
                </label>
              )}
              <span className="badge">
                {parcial
                  ? <><b style={{ color: 'var(--accent-ink)' }}>{cantidad(selCant)}</b> / {cantidad(totalCant)} unidades</>
                  : `${cantidad(totalCant)} unidades`}
              </span>
            </div>
          </div>

          {items.length === 0 && <p className="t-footnote" style={{ margin: 0, padding: 'var(--s-3) 0' }}>No hay ítems registrados en esta salida.</p>}

          <div className="sal-items">
            {filas.map(f => {
              const marcado = marcados.has(f.idx);
              const stockTxt = f.stock === null ? null : `Stock: ${cantidad(f.stock)} u. (${f.alcanza ? 'Disponible' : 'Insuficiente'})`;
              return (
                <div key={f.it.id ?? f.idx} className={`sal-item${f.alcanza ? '' : ' sal-item--sin-stock'}`}>
                  {pendiente && (
                    <input type="checkbox" className="sal-item__check" checked={marcado} disabled={f.it.id == null}
                      onChange={e => alternar(f.idx, e.target.checked)} aria-label={`Despachar ${f.it.descripcion || f.it.inventario_id}`} />
                  )}
                  <div className="sal-item__cuerpo">
                    <span className="sal-item__nombre" title={f.it.descripcion || undefined}>{f.it.descripcion || f.it.inventario_id || '—'}</span>
                    <span className="sal-item__meta">
                      {f.it.inventario_id && <span className="badge sal-item__codigo">{f.it.inventario_id}</span>}
                      <b>{cantidad(f.cant)} u.</b> · {formatSoles(f.cu)} c/u
                      {stockTxt && <span className={`badge ${f.alcanza ? 'badge--green' : 'badge--red'}`}>{stockTxt}</span>}
                    </span>
                  </div>
                  <div className="sal-item__importe">
                    <span className="sal-item__importe-k">Subtotal</span>
                    <span className="sal-item__importe-v">{formatSoles(f.imp)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sal-total">
            <div>
              <span className="sal-total__label">{parcial ? 'Monto a despachar' : 'Monto total solicitud'}</span>
              {parcial && (
                <div><span className="badge badge--amber">Pendiente restante: {formatSoles(Math.max(0, totalImp - selImp))} ({cantidad(Math.max(0, totalCant - selCant))} u.)</span></div>
              )}
            </div>
            <span className="sal-total__valor">{formatSoles(pendiente ? (parcial ? selImp : totalImp) : montoFinal)}</span>
          </div>
        </div>
      </div>

      <AvisoSheet open={avisoStock !== null} onClose={() => setAvisoStock(null)} titulo="Stock insuficiente">
        <p style={{ margin: 0 }}>No se puede despachar porque los siguientes repuestos seleccionados no cuentan con stock disponible en almacén:</p>
        <ul className="sal-aviso-lista">
          {(avisoStock ?? []).map(l => <li key={l}>{l}</li>)}
        </ul>
        <p style={{ margin: 0, color: 'var(--label-2)' }}>Desmárcalos para despachar solo los que tienen stock disponible.</p>
      </AvisoSheet>
    </Sheet>
  );
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="dato">
      <span className="dato__label">{k}</span>
      <span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{v}</span>
    </div>
  );
}
