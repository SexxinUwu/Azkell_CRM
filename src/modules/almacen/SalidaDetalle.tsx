import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Check, Clock, FileText, Layers, MapPin, PackageCheck, ScanLine, Trash2 } from 'lucide-react';
import { FilePdf, Pencil } from '../../core/ui/IconosArchivo';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Badge } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { api } from '../../core/api/client';
import { formatFechaHoraPe, formatSoles } from '../../core/lib/format';
import { ETIQUETA_DESTINO, estadoSalida, type ArticuloInv, type ItemSalida, type LoteInv, type SalidaInv } from './api';
import { duracion, tonoEspera } from './ControlSalidasSheet';
import './salidaDetalle.css';

// Detalle de una salida. Pendiente: lista vertical de artículos con su ubicación, stock y el lote del que saldrían (con su costo);
// el botón principal abre el picking de esta salida. También se puede despachar directo, sin escanear. El stock lo descuenta el servidor.

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

/** De qué lotes saldría una cantidad por PEPS (el más antiguo primero) y cuánto costaría */
function pepsEstimado(lotes: LoteInv[], cant: number) {
  let resto = cant;
  const partes: Array<{ numero: number; cantidad: number; costo: number }> = [];
  for (const l of [...lotes].sort((a, b) => a.numero - b.numero)) {
    if (resto <= 1e-9) break;
    if (l.saldo <= 1e-9) continue;
    const toma = Math.min(l.saldo, resto);
    partes.push({ numero: l.numero, cantidad: toma, costo: l.costo_unitario });
    resto -= toma;
  }
  return { partes, faltante: resto > 1e-9 ? resto : 0, importe: partes.reduce((s, p) => s + p.cantidad * p.costo, 0) };
}

export function SalidaDetalle({ open, onClose, salida, inventario, puedeEditar, puedeEliminar, onDespachar, onPicking, onPdf, onVistaPrevia, onEditar, onAnular, onEliminar }: {
  open: boolean;
  onClose: () => void;
  salida: SalidaInv;
  inventario: ArticuloInv[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** Recibe los ítems marcados y el texto de confirmación; la página abre el diálogo */
  onDespachar: (sel: { id: number; itemIds: number[]; mensaje: ReactNode }) => void;
  /** Abre el picking de esta salida (escanear artículo y lote, y despachar) */
  onPicking: (salida: SalidaInv) => void;
  onPdf: () => void;
  onVistaPrevia: () => void;
  onEditar: () => void;
  onAnular: () => void;
  onEliminar: () => void;
}) {
  const estado = estadoSalida(salida);
  const pendiente = estado === 'Pendiente';
  const items = salida.items ?? [];

  // Lotes de cada artículo (misma consulta que usa la ficha del artículo)
  const idsArt = useMemo(() => [...new Set(items.map(i => i.inventario_id).filter((x): x is string => !!x && !/^SERV/i.test(x)))], [items]);
  const consultas = useQueries({
    queries: idsArt.map(id => ({
      queryKey: ['almacen', 'lotes', id, false],
      enabled: open && pendiente,
      staleTime: 15_000,
      queryFn: () => api<{ lotes: LoteInv[]; agotados: number }>(`/almacen/inventario/${encodeURIComponent(id)}/lotes`),
    })),
  });
  const lotesDe = useMemo(() => { const m = new Map<string, LoteInv[]>(); idsArt.forEach((id, i) => { const d = consultas[i]?.data; if (d) m.set(id, d.lotes); }); return m; }, [idsArt, consultas]);

  // Stock de cada ítem, y de qué lotes saldría con su costo
  const filas = useMemo(() => items.map((it, idx) => {
    const art = articuloDeItem(it, inventario);
    const cant = Number(it.cantidad) || 0;
    const cu = Number(it.costo_unitario) || 0;
    const stock = art ? Number(art.stock_actual) : null;
    const lotes = it.inventario_id ? lotesDe.get(it.inventario_id) : undefined;
    const peps = pendiente && lotes && lotes.length ? pepsEstimado(lotes, cant) : null;
    const imp = Number(it.importe) || cant * cu;
    return { it, idx, art, cant, cu, imp, stock, alcanza: stock === null || stock >= cant, peps, ubic: [art?.ubicacion, art?.anaquel].filter(Boolean).join(' · ') };
  }), [items, inventario, lotesDe, pendiente]);

  const totalCant = filas.reduce((a, f) => a + f.cant, 0);
  const totalImp = filas.reduce((a, f) => a + f.imp, 0);
  const montoFinal = Number(salida.total_pen) > 0 ? Number(salida.total_pen) : totalImp;
  // Costo estimado por lotes (si ya llegaron los lotes de todos los artículos con inventario)
  const conLotes = filas.filter(f => f.it.inventario_id && !/^SERV/i.test(f.it.inventario_id));
  const costoLotes = pendiente && conLotes.length > 0 && conLotes.every(f => f.peps) ? filas.reduce((s, f) => s + (f.peps ? f.peps.importe + f.peps.faltante * f.cu : f.imp), 0) : null;

  // Selección para el despacho directo: al abrir, los ítems con stock quedan marcados
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!open) return;
    setMarcados(new Set(filas.filter(f => f.it.id != null && f.alcanza).map(f => f.idx)));
    // Se reinicia al abrir o al cambiar de salida; los demás cambios de stock no deben borrar la selección
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, salida.id]);

  const seleccionadas = filas.filter(f => marcados.has(f.idx));
  const selImp = seleccionadas.reduce((a, f) => a + f.imp, 0);
  const parcial = pendiente && items.length > 1 && seleccionadas.length > 0 && seleccionadas.length < items.length;

  function alternar(idx: number) {
    setMarcados(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  }

  function despacharDirecto() {
    const elegidas = seleccionadas.filter(f => f.it.id != null);
    if (!elegidas.length) return;
    // El stock lo valida el servidor al despachar: si falta, avisa qué artículos y qué compras faltan recepcionar
    const mensaje = parcial
      ? <>¿Despachar <strong>{elegidas.length} de {items.length}</strong> repuestos seleccionados de la salida <strong>{salida.id}</strong>?<br /><span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>El resto de repuestos quedará como pendiente en una nueva salida.</span></>
      : <>¿Despachar los repuestos de la salida <strong>{salida.id}</strong>?<br />El stock del inventario de almacén será descontado inmediatamente. Sin escanear lotes, sale del lote más antiguo.</>;
    onDespachar({ id: salida.id, itemIds: elegidas.map(f => f.it.id as number), mensaje });
  }

  const puedeDespachar = pendiente && puedeEditar;
  const tono = estado === 'Despachado' ? 'green' : estado === 'Anulado' ? 'red' : 'amber';
  const espera = pendiente ? Math.max(0, Math.round((Date.now() - (Date.parse(salida.created_at) || Date.now())) / 60000)) : null;

  const acciones = (
    <div className="sdt-pie">
      {puedeDespachar ? (
        <Button variant="primary" size="lg" block icon={<ScanLine size={18} />} disabled={items.length === 0} onClick={() => onPicking(salida)}>
          Despachar con picking
        </Button>
      ) : (
        <Button variant="primary" size="lg" block icon={<FileText size={18} />} onClick={onPdf}>Descargar documento PDF</Button>
      )}
      <div className="sdt-pie__fila">
        {puedeDespachar && (
          <Button variant="secondary" icon={<PackageCheck size={16} />} disabled={seleccionadas.length === 0} onClick={despacharDirecto}>
            {parcial ? `Despachar ${seleccionadas.length} de ${items.length} sin escanear` : 'Despachar sin escanear'}
          </Button>
        )}
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
      <div className="sdt">
        {/* Encabezado: quién, para qué unidad y cuánto lleva esperando */}
        <header className="sdt-hero">
          <div className="sdt-hero__fila">
            <span className="sdt-hero__folio">{salida.id}</span>
            <Badge tone={tono}>{estado}</Badge>
            {espera != null && <span className={`sdt-espera sdt-espera--${tonoEspera(espera)}`}><Clock size={12} /> Hace {duracion(espera)}</span>}
            <div className="sdt-hero__acciones oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Descargar PDF" aria-label="Descargar PDF" onClick={onPdf}><FilePdf size={17} /></button>
              {puedeEditar && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--azul" data-tip="Editar" aria-label="Editar" onClick={onEditar}><Pencil size={17} /></button>}
              {puedeEliminar && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--rojo" data-tip="Eliminar" aria-label="Eliminar" onClick={onEliminar}><Trash2 size={17} /></button>}
            </div>
          </div>
          <div className="sdt-hero__meta">
            {salida.placa ? <LicensePlate plate={salida.placa} size="sm" /> : <span className="sdt-chip">{ETIQUETA_DESTINO[salida.tipo_destino ?? ''] || salida.tipo_destino || 'Sin destino'}</span>}
            {salida.ticket_ot && <span className="sdt-chip sdt-chip--mono">{salida.ticket_ot}</span>}
            {salida.responsable && <span className="sdt-chip">Responsable: <b>{salida.responsable}</b></span>}
            <span className="sdt-chip">Solicita: <b>{nombreSolicitante(salida.creado_por)}</b></span>
          </div>
          {salida.observaciones && <p className="sdt-nota">{salida.observaciones}</p>}
          <small className="sdt-hero__pie">{salida.tipo_orden || 'Orden de salida'} · registrada el {formatFechaHoraPe(salida.created_at || salida.fecha)}</small>
          {estado === 'Anulado' && salida.motivo_anulacion && <p className="sdt-nota sdt-nota--rojo">Motivo de anulación: {salida.motivo_anulacion}</p>}
        </header>

        {/* Artículos, uno debajo del otro */}
        <section>
          <div className="sdt-titulo">
            <span>Artículos ({items.length})</span>
            <span className="sdt-titulo__n">{cantidad(totalCant)} unidades</span>
          </div>
          {items.length === 0 && <p className="sdt-vacio">No hay ítems registrados en esta salida.</p>}
          <ul className="sdt-items">
            {filas.map(f => {
              const marcado = marcados.has(f.idx);
              return (
                <li key={f.it.id ?? f.idx} className={`sdt-item${f.alcanza ? '' : ' sdt-item--sin-stock'}`}>
                  {pendiente && (
                    <button type="button" className={`sdt-check${marcado ? ' sdt-check--on' : ''}`} disabled={f.it.id == null} aria-pressed={marcado}
                      aria-label={`Incluir ${f.it.descripcion || f.it.inventario_id} en el despacho sin escanear`} title="Incluir en el despacho sin escanear" onClick={() => alternar(f.idx)}>
                      {marcado && <Check size={15} strokeWidth={3} />}
                    </button>
                  )}
                  <div className="sdt-item__cuerpo">
                    <b className="sdt-item__nombre" title={f.it.descripcion || undefined}>{f.it.descripcion || f.it.inventario_id || '—'}</b>
                    <div className="sdt-item__chips">
                      {f.it.inventario_id && <span className="sdt-chip sdt-chip--mono">{f.it.inventario_id}</span>}
                      {pendiente && (f.ubic ? <span className="sdt-chip sdt-chip--ubi"><MapPin size={11} /> {f.ubic}</span> : <span className="sdt-chip sdt-chip--sin">Sin ubicación</span>)}
                      {f.stock !== null && <span className={`sdt-chip ${f.alcanza ? 'sdt-chip--ok' : 'sdt-chip--mal'}`}>{f.alcanza ? `Stock ${cantidad(f.stock)}` : `Stock insuficiente (${cantidad(f.stock)})`}</span>}
                    </div>
                    {f.peps && f.peps.partes.length > 0 && (
                      <div className="sdt-item__lotes">
                        <Layers size={12} />
                        {f.peps.partes.map(p => <span key={p.numero} className="sdt-lote">Lote {p.numero} · {cantidad(p.cantidad)} u. a {formatSoles(p.costo)}</span>)}
                        {f.peps.faltante > 0 && <span className="sdt-chip sdt-chip--mal">Faltan {cantidad(f.peps.faltante)} en lotes</span>}
                      </div>
                    )}
                  </div>
                  <div className="sdt-item__cant">
                    <b>{cantidad(f.cant)}</b><small>unid.</small>
                    <span className="sdt-item__imp">{formatSoles(f.peps ? f.peps.importe + f.peps.faltante * f.cu : f.imp)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sdt-total">
            <div>
              <span>{costoLotes != null ? 'Costo por lotes (PEPS)' : 'Monto de la solicitud'}</span>
              {costoLotes != null && Math.abs(costoLotes - totalImp) > 0.005 && <small>Antes se estimaba en {formatSoles(totalImp)}; se costea con el lote real al despachar.</small>}
              {parcial && <small>Sin escanear se despachan {seleccionadas.length} de {items.length} ítems ({formatSoles(selImp)}).</small>}
            </div>
            <b>{formatSoles(pendiente ? (costoLotes ?? totalImp) : montoFinal)}</b>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
