import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, CheckCheck, FileText, Layers, MapPin, PackageCheck, ScanLine, Trash2, X } from 'lucide-react';
import { FilePdf, Pencil } from '../../core/ui/IconosArchivo';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Badge } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { api } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaHoraPe, formatSoles } from '../../core/lib/format';
import { ETIQUETA_DESTINO, asociarCodigoBarras, estadoSalida, type ArticuloInv, type ItemSalida, type LoteInv, type SalidaInv } from './api';
import { duracion, tonoEspera } from './ControlSalidasSheet';
import { EscanerContinuo } from './EscanerContinuo';
import { separarLote } from './codigosLote';
import { pitido } from './pitido';
import './salidaDetalle.css';

// Hoja de despacho de una salida. Arriba los datos de la orden; abajo los artículos numerados, cada uno con su CONFORMIDAD:
// se confirma escaneando el QR del artículo (o de su lote) o marcándolo a mano. Se despacha lo que tiene conformidad,
// y cada línea sale del lote que se escaneó (o del más antiguo) con el costo real de ese lote.

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
const EPS = 1e-9;

/** De qué lotes saldría una cantidad por PEPS (el más antiguo primero) y cuánto costaría */
function pepsEstimado(lotes: LoteInv[], cant: number, usado: Record<number, number> = {}) {
  let resto = cant;
  const partes: Array<{ numero: number; cantidad: number; costo: number }> = [];
  for (const l of [...lotes].sort((a, b) => a.numero - b.numero)) {
    if (resto <= EPS) break;
    const saldo = l.saldo - (usado[l.numero] || 0);
    if (saldo <= EPS) continue;
    const toma = Math.min(saldo, resto);
    partes.push({ numero: l.numero, cantidad: toma, costo: l.costo_unitario });
    resto -= toma;
  }
  return { partes, faltante: resto > EPS ? resto : 0 };
}

/** Lo confirmado en una línea: unidades y, si se escaneó etiqueta de lote, de qué lote */
interface Conf { recogido: number; lotes: Record<number, number> }

export function SalidaDetalle({ open, onClose, salida, inventario, puedeEditar, puedeEliminar, onDespachar, onPdf, onVistaPrevia, onEditar, onAnular }: {
  open: boolean;
  onClose: () => void;
  salida: SalidaInv;
  inventario: ArticuloInv[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** Ítems conformes (y los lotes escaneados) más el texto de confirmación; la página abre el diálogo y despacha */
  onDespachar: (sel: { id: number; itemIds: number[]; mensaje: ReactNode; lotes?: Record<string, Array<{ numero: number; cantidad: number }>>; cantidades?: Record<string, number> }) => void;
  onPdf: () => void;
  onVistaPrevia: () => void;
  onEditar: () => void;
  onAnular: () => void;
  onEliminar?: () => void;
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

  // Conformidad de cada línea
  const [conf, setConf] = useState<Record<number, Conf>>({});
  const [camara, setCamara] = useState(false);
  const [lineaActiva, setLineaActiva] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; warn?: boolean } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** Artículo recién escaneado esperando que se escriba la cantidad (como en caja: se escanea una vez y se teclea cuántos) */
  const [pregunta, setPregunta] = useState<{ idx: number; lote: number | null; valor: string } | null>(null);
  /** Código leído que no es de ningún artículo: se pregunta a cuál de la salida pertenece para guardarlo */
  const [desconocido, setDesconocido] = useState<{ codigo: string; texto: string } | null>(null);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [reintentar, setReintentar] = useState<string | null>(null);
  const qc = useQueryClient();
  // Lo que identifica el contenido de la salida: si cambia (la editaron) mientras se escanea, la conformidad ya no sirve
  const firma = items.map(i => `${i.id}:${i.cantidad}`).join('|');
  const claveGuardado = `fleet_despacho_${salida.id}`;
  useEffect(() => {
    if (!open) return;
    let previo: Record<number, Conf> = {};
    // La conformidad se guarda en el teléfono: si se cierra la pantalla o se cae el internet, se retoma donde quedó
    try {
      const raw = localStorage.getItem(claveGuardado);
      if (raw) { const d = JSON.parse(raw); if (d && d.firma === firma) previo = d.conf ?? {}; else localStorage.removeItem(claveGuardado); }
    } catch { /* sin almacenamiento: se empieza de cero */ }
    setConf(previo); setCamara(false); setLineaActiva(null); setAviso(null); setManual(''); setPregunta(null); setDesconocido(null);
  }, [open, salida.id]);
  useEffect(() => {
    if (!open) return;
    try {
      if (!pendiente || Object.keys(conf).length === 0) localStorage.removeItem(claveGuardado);
      else localStorage.setItem(claveGuardado, JSON.stringify({ firma, conf }));
    } catch { /* nada */ }
  }, [conf, open, pendiente]);
  const firmaPrevia = useRef({ id: salida.id, firma });
  useEffect(() => {
    const p = firmaPrevia.current;
    if (open && p.id === salida.id && p.firma !== firma) { setConf({}); setPregunta(null); setAviso({ ok: false, texto: 'La salida cambió mientras se escaneaba: se reinició la conformidad.' }); }
    firmaPrevia.current = { id: salida.id, firma };
  }, [firma, salida.id]);
  // Al cerrar el cuadro de cantidad o de código nuevo, el cursor vuelve al campo para seguir con la pistola
  const bloqueado = !!pregunta || !!desconocido;
  const bloqueadoAntes = useRef(false);
  useEffect(() => {
    if (bloqueadoAntes.current && !bloqueado && !camara) entrada.current?.focus();
    bloqueadoAntes.current = bloqueado;
  }, [bloqueado, camara]);
  // La pistola de teclado escribe donde esté el foco: si no hay un campo activo, lo que se teclea va al campo de código
  useEffect(() => {
    if (!open || !pendiente || !puedeEditar) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      entrada.current?.focus();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [open, pendiente, puedeEditar]);

  const filas = useMemo(() => items.map((it, idx) => {
    const art = articuloDeItem(it, inventario);
    const cant = Number(it.cantidad) || 0;
    const cu = Number(it.costo_unitario) || 0;
    const stock = art ? Number(art.stock_actual) : null;
    const lotes = it.inventario_id ? lotesDe.get(it.inventario_id) : undefined;
    const imp = Number(it.importe) || cant * cu;
    const c = conf[idx] ?? { recogido: 0, lotes: {} };
    const completa = cant > 0 && c.recogido >= cant - EPS;
    return { it, idx, art, cant, cu, imp, stock, alcanza: stock === null || stock >= cant, lotes, ubic: [art?.ubicacion, art?.anaquel].filter(Boolean).join(' · '), c, completa };
  }), [items, inventario, lotesDe, conf]);

  const totalCant = filas.reduce((a, f) => a + f.cant, 0);
  const totalImp = filas.reduce((a, f) => a + f.imp, 0);
  const montoFinal = Number(salida.total_pen) > 0 ? Number(salida.total_pen) : totalImp;
  // Con entrega = lo que se despacha: líneas completas y líneas parciales (se entrega lo confirmado; el resto queda pendiente)
  const conformes = filas.filter(f => f.c.recogido > EPS && f.it.id != null);
  const todoCompleto = conformes.length === items.length && conformes.every(f => f.completa);
  const hechasUnid = filas.reduce((a, f) => a + Math.min(f.c.recogido, f.cant), 0);

  /** Costo estimado de una línea: lo escaneado sale de su lote; el resto, del más antiguo con saldo */
  const costoLinea = (f: (typeof filas)[number]) => {
    if (!f.lotes || !f.lotes.length) return null;
    const partes: Array<{ numero: number; cantidad: number; costo: number }> = [];
    let tomado = 0;
    for (const [n, cant] of Object.entries(f.c.lotes)) {
      const l = f.lotes.find(x => x.numero === Number(n));
      if (l && cant > 0) { partes.push({ numero: l.numero, cantidad: cant, costo: l.costo_unitario }); tomado += cant; }
    }
    const resto = Math.max(0, (f.c.recogido > EPS ? Math.min(f.c.recogido, f.cant) : f.cant) - tomado);
    const extra = pepsEstimado(f.lotes, resto, Object.fromEntries(partes.map(p => [p.numero, p.cantidad])));
    const todas = [...partes, ...extra.partes];
    return { partes: todas, faltante: extra.faltante, importe: todas.reduce((s, p) => s + p.cantidad * p.costo, 0) + extra.faltante * f.cu };
  };
  const estimados = filas.map(costoLinea);
  const conLotes = filas.filter(f => f.it.inventario_id && !/^SERV/i.test(f.it.inventario_id));
  const costoLotes = pendiente && conLotes.length > 0 && conLotes.every(f => f.lotes) ? filas.reduce((s, f, i) => s + (estimados[i]?.importe ?? f.imp), 0) : null;

  // ── Conformidad ───────────────────────────────────────────────────────────
  const marcar = (idx: number) => setConf(prev => {
    const f = filas[idx];
    const ya = (prev[idx]?.recogido ?? 0) >= f.cant - EPS;
    return { ...prev, [idx]: ya ? { recogido: 0, lotes: {} } : { recogido: f.cant, lotes: prev[idx]?.lotes ?? {} } };
  });
  const todoConforme = () => {
    haptic('selection');
    setConf(Object.fromEntries(filas.filter(f => f.it.id != null && f.alcanza).map(f => [f.idx, { recogido: f.cant, lotes: conf[f.idx]?.lotes ?? {} }])));
  };

  /** Un código leído (cámara, pistola o escrito): «INV-0212» confirma 1 unidad, «INV-0212-L2» la toma del lote 2, «5*INV-0212» confirma 5 */
  function leer(texto: string) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*[*xX]\s*(\S.*)$/.exec(texto);
    const cuantas = m ? Math.max(1, parseFloat(m[1].replace(',', '.')) || 1) : 1;
    const { codigo: cod, lote } = separarLote((m ? m[2] : texto).trim());
    const codigo = cod.trim().toUpperCase();
    if (!codigo) return;
    if (pregunta || desconocido) return; // hay algo por confirmar: se ignora la lectura
    const idExtra = extras[codigo];
    const art = inventario.find(a => [a.id, a.codigo_barras, a.codigo_articulo].some(c => String(c ?? '').trim().toUpperCase() === codigo)) ?? (idExtra ? inventario.find(a => a.id === idExtra) : undefined);
    const idArt = (art?.id ?? idExtra ?? codigo).toUpperCase();
    const delArticulo = filas.filter(f => String(f.it.inventario_id ?? '').toUpperCase() === idArt);
    const error = (t: string) => { pitido(false); haptic('warning'); setAviso({ ok: false, texto: t }); };
    if (!delArticulo.length && !art && !idExtra) { pitido(false); haptic('warning'); setAviso(null); setDesconocido({ codigo, texto }); return; }
    if (!delArticulo.length) return error(art ? `${art.descripcion || art.articulo} no está en esta salida.` : `El código ${cod} no es de ningún artículo.`);
    // Si se escaneó desde la línea de un artículo, el código tiene que ser de ese artículo
    if (lineaActiva != null && !delArticulo.some(f => f.idx === lineaActiva)) return error(`Ese código no es de «${filas[lineaActiva].it.descripcion || filas[lineaActiva].it.inventario_id}».`);
    const destino = lineaActiva != null ? filas[lineaActiva] : delArticulo.find(f => !f.completa);
    if (!destino) return error(`${delArticulo[0].it.descripcion || idArt} ya tiene conformidad.`);
    if (destino.completa) return error('Esa línea ya tiene conformidad.');
    // Lo máximo que se puede confirmar en la línea: lo pedido, o lo que hay en el sistema si es menos
    const falta = Math.min(destino.cant, destino.stock ?? Infinity) - destino.c.recogido;
    if (falta <= EPS) return error(`${destino.it.descripcion || idArt}: no hay más unidades disponibles en el sistema (stock ${cantidad(destino.stock ?? 0)}).`);
    if (!m && falta > 1 + EPS) {
      pitido(true); haptic('selection');
      setPregunta({ idx: destino.idx, lote, valor: String(falta) });
      setAviso(null);
      return;
    }
    aplicar(destino.idx, lote, Math.min(cuantas, falta));
  }

  /** Suma unidades confirmadas a una línea (y a su lote si se escaneó etiqueta de lote) */
  function aplicar(idx: number, lote: number | null, toma: number): boolean {
    const destino = filas[idx];
    const error = (t: string) => { pitido(false); haptic('warning'); setAviso({ ok: false, texto: t }); return false; };
    if (!(toma > 0)) return error('Escribe una cantidad mayor que cero.');
    const falta = Math.min(destino.cant, destino.stock ?? Infinity) - destino.c.recogido;
    if (toma > falta + EPS) return error(falta < destino.cant - destino.c.recogido - EPS ? `Solo hay ${cantidad(Math.max(0, falta))} más en el sistema.` : `Solo faltan ${cantidad(falta)} de este artículo.`);
    if (lote != null) {
      const l = destino.lotes?.find(x => x.numero === lote);
      const usado = filas.filter(f => f.it.inventario_id === destino.it.inventario_id).reduce((s, f) => s + (f.c.lotes[lote] || 0), 0);
      if (!l || l.saldo <= EPS) return error(`El lote ${lote} está agotado: no se puede usar.`);
      if (usado + toma > l.saldo + EPS) return error(`El lote ${lote} solo tiene ${cantidad(Math.max(0, l.saldo - usado))} unidades disponibles.`);
    }
    pitido(true); haptic('success');
    setConf(prev => {
      const c = prev[idx] ?? { recogido: 0, lotes: {} };
      return { ...prev, [idx]: { recogido: c.recogido + toma, lotes: lote != null ? { ...c.lotes, [lote]: (c.lotes[lote] || 0) + toma } : c.lotes } };
    });
    // PEPS: si se toma un lote más nuevo habiendo uno más antiguo con saldo, se acepta pero se avisa
    const masAntiguo = lote != null ? [...(destino.lotes ?? [])].filter(l => l.saldo > EPS).sort((a, b) => a.numero - b.numero)[0] : undefined;
    const noPeps = lote != null && !!masAntiguo && masAntiguo.numero < lote;
    setAviso({ ok: true, warn: noPeps, texto: `${destino.it.descripcion || destino.it.inventario_id}${lote != null ? ` · Lote ${lote}` : ''} · ${cantidad(destino.c.recogido + toma)} de ${cantidad(destino.cant)}${noPeps && masAntiguo ? ` · Ojo: el lote ${masAntiguo.numero} es más antiguo y aún tiene saldo (sale primero lo más antiguo)` : ''}` });
    return true;
  }

  async function asociar(f: (typeof filas)[number]) {
    if (!desconocido || !f.it.inventario_id) return;
    try {
      await asociarCodigoBarras(f.it.inventario_id, desconocido.codigo);
      setExtras(p => ({ ...p, [desconocido.codigo]: f.it.inventario_id as string }));
      void qc.invalidateQueries({ queryKey: ['almacen'] });
      const t = desconocido.texto;
      setDesconocido(null);
      setReintentar(t);
    } catch (err) { setAviso({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo guardar el código.' }); setDesconocido(null); }
  }
  useEffect(() => {
    if (reintentar && !desconocido) { const t = reintentar; setReintentar(null); leer(t); }
  }, [reintentar, extras]);

  function despachar() {
    if (!conformes.length) return;
    const lotes: Record<string, Array<{ numero: number; cantidad: number }>> = {};
    for (const f of conformes) {
      const ls = Object.entries(f.c.lotes).map(([n, c]) => ({ numero: Number(n), cantidad: c })).filter(z => z.cantidad > 0);
      if (ls.length) lotes[String(f.it.id)] = ls;
    }
    const parciales = conformes.filter(f => !f.completa);
    const cantidades: Record<string, number> = {};
    for (const f of parciales) cantidades[String(f.it.id)] = f.c.recogido;
    const sinEntrega = items.length - conformes.length;
    const mensaje = !todoCompleto
      ? <>¿Despachar <strong>{conformes.length} de {items.length}</strong> artículos de la salida <strong>{salida.id}</strong>?<br />
        {parciales.length > 0 && <span>{parciales.map(f => `${f.it.descripcion || f.it.inventario_id}: ${cantidad(f.c.recogido)} de ${cantidad(f.cant)}`).join(' · ')}<br /></span>}
        <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{sinEntrega > 0 ? `${sinEntrega} sin entrega` : ''}{sinEntrega > 0 && parciales.length > 0 ? ' y ' : ''}{parciales.length > 0 ? `${parciales.length} entregados a medias` : ''}: lo que falta quedará pendiente en una nueva salida.</span></>
      : <>¿Despachar todos los artículos de la salida <strong>{salida.id}</strong>?<br />El stock se descuenta ahora y el costo sale de los lotes.</>;
    onDespachar({ id: salida.id, itemIds: conformes.map(f => f.it.id as number), mensaje, lotes, cantidades });
  }

  const puedeDespachar = pendiente && puedeEditar;
  const tono = estado === 'Despachado' ? 'green' : estado === 'Anulado' ? 'red' : 'amber';
  const espera = pendiente ? Math.max(0, Math.round((Date.now() - (Date.parse(salida.created_at) || Date.now())) / 60000)) : null;

  const pie = (
    <div className="sdt-pie">
      <div className="sdt-pie__fila">
        {puedeEliminar && (estado !== 'Anulado'
          ? <button type="button" className="sdt-pie__icono sdt-pie__icono--rojo" data-tip="Anular la salida" aria-label="Anular la salida" onClick={onAnular}><Trash2 size={18} /></button>
          : <Badge tone="red">Salida anulada</Badge>)}
        <Button variant="secondary" icon={<FileText size={16} />} onClick={onVistaPrevia}>Vista previa</Button>
        {puedeDespachar && (
          <button type="button" className="sdt-pie__icono sdt-pie__icono--verde" data-tip="Marcar todo conforme" aria-label="Marcar todo conforme" onClick={todoConforme}><CheckCheck size={18} /></button>
        )}
        {puedeDespachar ? (
          <Button variant="primary" size="lg" icon={<PackageCheck size={18} />} disabled={conformes.length === 0} onClick={despachar}>
            {conformes.length === 0 || todoCompleto ? 'Despachar' : `Despachar ${conformes.length} de ${items.length}`}
          </Button>
        ) : (
          <Button variant="primary" size="lg" icon={<FileText size={18} />} onClick={onPdf}>Descargar PDF</Button>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Orden de salida N° ${salida.id}`} ancho footer={pie}>
      <div className="sdt">
        {/* Datos de la orden */}
        <header className="sdt-hoja">
          <div className="sdt-hoja__estado">
            <Badge tone={tono}>{estado}</Badge>
            {espera != null && <span className={`sdt-espera sdt-espera--${tonoEspera(espera)}`}>Hace {duracion(espera)}</span>}
            <div className="sdt-hoja__acciones oc-acciones oc-acciones--sinfondo">
              <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton" data-tip="Descargar PDF" aria-label="Descargar PDF" onClick={onPdf}><FilePdf size={17} /></button>
              {puedeEditar && <button type="button" className="btn btn--secondary btn--icon oc-acciones__boton oc-acciones__boton--azul" data-tip="Editar" aria-label="Editar" onClick={onEditar}><Pencil size={17} /></button>}
            </div>
          </div>
          <dl className="sdt-datos">
            <div><dt>Tipo de orden</dt><dd>{salida.tipo_orden || 'Orden de salida'}</dd></div>
            <div><dt>N° OT</dt><dd className="sdt-mono">{salida.ticket_ot || '—'}</dd></div>
            <div><dt>Placa</dt><dd>{salida.placa ? <LicensePlate plate={salida.placa} size="sm" /> : (ETIQUETA_DESTINO[salida.tipo_destino ?? ''] || salida.tipo_destino || '—')}</dd></div>
            <div><dt>Fecha</dt><dd>{formatFechaHoraPe(salida.created_at || salida.fecha)}</dd></div>
            <div><dt>Responsable</dt><dd>{salida.responsable || '—'}</dd></div>
            <div><dt>Solicitante</dt><dd>{nombreSolicitante(salida.creado_por)}</dd></div>
          </dl>
          {(salida.observaciones || (estado === 'Anulado' && salida.motivo_anulacion)) && (
            <div className="sdt-obs">
              <span>Observación</span>
              <p>{salida.observaciones}{estado === 'Anulado' && salida.motivo_anulacion ? ` — Anulada: ${salida.motivo_anulacion}` : ''}</p>
            </div>
          )}
        </header>

        {/* Artículos con su conformidad */}
        <section>
          <div className="sdt-titulo">
            <span>Artículos ({items.length}) · {cantidad(totalCant)} unidades</span>
            {puedeDespachar && (
              <span className="sdt-titulo__prog">Conformidad: <b>{cantidad(hechasUnid)}</b> de {cantidad(totalCant)}</span>
            )}
          </div>

          {puedeDespachar && (
            <div className="sdt-scan">
              <div className="sdt-scan__barra">
                <Button variant={camara ? 'primary' : 'secondary'} size="sm" icon={camara ? <X size={15} /> : <Camera size={15} />} onClick={() => { setCamara(v => !v); if (camara) setLineaActiva(null); }}>
                  {camara ? 'Cerrar cámara' : 'Escanear QR'}
                </Button>
                <form className="sdt-scan__manual" onSubmit={e => { e.preventDefault(); leer(manual); setManual(''); entrada.current?.focus(); }}>
                  <input ref={entrada} className="input" value={manual} onChange={e => setManual(e.target.value)} placeholder="Código del artículo o lote (o 5*código)" autoCapitalize="characters" autoCorrect="off" />
                </form>
              </div>
              {camara && (
                <>
                  {lineaActiva != null && <p className="sdt-scan__linea">Confirmando solo la línea {lineaActiva + 1}: <b>{filas[lineaActiva].it.descripcion || filas[lineaActiva].it.inventario_id}</b> <button type="button" onClick={() => setLineaActiva(null)}>Cualquier línea</button></p>}
                  <EscanerContinuo activo={camara} onLeido={leer} />
                </>
              )}
              {aviso && <p className={`sdt-aviso ${aviso.warn ? 'sdt-aviso--warn' : aviso.ok ? 'sdt-aviso--ok' : 'sdt-aviso--error'}`} role="status">{aviso.texto}</p>}
            </div>
          )}

          {pregunta && (() => {
            const f = filas[pregunta.idx];
            const falta = Math.min(f.cant, f.stock ?? Infinity) - f.c.recogido;
            const valorNum = parseFloat(pregunta.valor.replace(',', '.'));
            const hermanas = filas.filter(x => x.it.inventario_id === f.it.inventario_id && !x.completa);
            const confirmar = () => { if (aplicar(pregunta.idx, pregunta.lote, parseFloat(pregunta.valor.replace(',', '.')))) setPregunta(null); };
            return (
              <div className="sdt-cant" role="dialog" aria-label="Cantidad">
                <p><b>{f.it.descripcion || f.it.inventario_id}</b>{pregunta.lote != null ? ` · Lote ${pregunta.lote}` : ''}<br /><small>Solicitado: {cantidad(f.cant)}{f.c.recogido > 0 ? ` · ya confirmado ${cantidad(f.c.recogido)}` : ''}{falta < f.cant - f.c.recogido - EPS ? ` · en el sistema solo hay ${cantidad(Math.max(0, f.stock ?? 0))}` : ''}. ¿Confirmas la cantidad?</small></p>
                {hermanas.length > 1 && <div className="sdt-cant__lineas">{hermanas.map(x => <button key={x.idx} type="button" className={`sdt-cant__linea${x.idx === pregunta.idx ? ' sdt-cant__linea--on' : ''}`} onClick={() => setPregunta({ ...pregunta, idx: x.idx, valor: String(Math.max(0, Math.min(x.cant, x.stock ?? Infinity) - x.c.recogido)) })}>Línea {x.idx + 1} · faltan {cantidad(x.cant - x.c.recogido)}</button>)}</div>}
                {Number.isFinite(valorNum) && valorNum > 0 && valorNum < f.cant - f.c.recogido - EPS && <p className="sdt-cant__resto">Quedarán {cantidad(f.cant - f.c.recogido - valorNum)} pendientes de esta línea.</p>}
                <form onSubmit={e => { e.preventDefault(); confirmar(); }}>
                  <input className="input sdt-cant__input" autoFocus inputMode="decimal" value={pregunta.valor} onFocus={e => e.currentTarget.select()}
                    onChange={e => setPregunta({ ...pregunta, valor: e.target.value })} aria-label="Cantidad" />
                                    <Button type="submit" variant="primary" size="sm" icon={<Check size={15} />}>Guardar</Button>
                  <Button type="button" variant="plain" size="sm" onClick={() => setPregunta(null)}>Cancelar</Button>
                </form>
              </div>
            );
          })()}

          {desconocido && (
            <div className="sdt-cant" role="dialog" aria-label="Código nuevo">
              <p><b>El código {desconocido.codigo} no está registrado.</b><br /><small>¿A qué artículo de esta salida pertenece? Se guarda para reconocerlo la próxima vez.</small></p>
              <div className="sdt-cant__lineas">
                {filas.filter(f => f.it.inventario_id && f.it.id != null && !/^SERV/i.test(f.it.inventario_id)).map(f => <button key={f.idx} type="button" className="sdt-cant__linea" onClick={() => { void asociar(f); }}>{f.idx + 1}. {f.it.descripcion || f.it.inventario_id}</button>)}
                <Button type="button" variant="plain" size="sm" onClick={() => setDesconocido(null)}>Cancelar</Button>
              </div>
            </div>
          )}

          {items.length === 0 && <p className="sdt-vacio">No hay ítems registrados en esta salida.</p>}
          <ol className="sdt-items">
            {filas.map((f, i) => {
              const est = estimados[i];
              return (
                <li key={f.it.id ?? f.idx} className={`sdt-item${f.completa ? ' sdt-item--ok' : f.c.recogido > 0 ? ' sdt-item--parcial' : ''}${f.alcanza || !pendiente ? '' : ' sdt-item--sin-stock'}`}>
                  <span className="sdt-item__n">{i + 1}.</span>
                  <div className="sdt-item__cuerpo">
                    <b className="sdt-item__nombre" title={f.it.descripcion || undefined}>{f.it.descripcion || f.it.inventario_id || '—'}</b>
                    <div className="sdt-item__chips">
                      {f.it.inventario_id && <span className="sdt-chip sdt-chip--mono">{f.it.inventario_id}</span>}
                      {pendiente && (f.ubic ? <span className="sdt-chip sdt-chip--ubi"><MapPin size={11} /> {f.ubic}</span> : <span className="sdt-chip sdt-chip--sin">Sin ubicación</span>)}
                      {pendiente && f.stock !== null && <span className={`sdt-chip ${f.alcanza ? 'sdt-chip--ok' : 'sdt-chip--mal'}`}>{f.alcanza ? `Stock ${cantidad(f.stock)}` : `Stock insuficiente (${cantidad(f.stock)})`}</span>}
                    </div>
                    {pendiente && est && est.partes.length > 0 && (
                      <div className="sdt-item__lotes">
                        <Layers size={12} />
                        {est.partes.map(p => {
                          const escaneado = (f.c.lotes[p.numero] || 0) > 0;
                          return <span key={p.numero} className={`sdt-lote${escaneado ? ' sdt-lote--leido' : ''}`}>Lote {p.numero} · {cantidad(p.cantidad)} u. a {formatSoles(p.costo)}{escaneado ? ' ✓' : ''}</span>;
                        })}
                        {est.faltante > 0 && <span className="sdt-chip sdt-chip--mal">Faltan {cantidad(est.faltante)} en lotes</span>}
                      </div>
                    )}
                    {!pendiente && <small className="sdt-item__costo">{formatSoles(f.cu)} c/u</small>}
                  </div>
                  <div className="sdt-item__cant">
                    <b>{cantidad(f.cant)}</b><small>unid.</small>
                    <span className="sdt-item__imp">{formatSoles(est ? est.importe : f.imp)}</span>
                  </div>
                  {puedeDespachar && (
                    <div className="sdt-conf">
                      <span className="sdt-conf__txt">{f.c.recogido > 0 && !f.completa ? `${cantidad(f.c.recogido)}/${cantidad(f.cant)}` : ''}</span>
                      <button type="button" className="sdt-conf__scan" aria-label={`Escanear el QR de la línea ${i + 1}`} title="Escanear el QR de esta línea" disabled={f.it.id == null}
                        onClick={() => { setCamara(true); setLineaActiva(f.idx); setAviso(null); }}><ScanLine size={16} /></button>
                      <button type="button" className={`sdt-conf__check${f.completa ? ' sdt-conf__check--on' : f.c.recogido > 0 ? ' sdt-conf__check--parcial' : ''}`} aria-pressed={f.completa}
                        aria-label={f.completa ? `Quitar la conformidad de la línea ${i + 1}` : `Dar conformidad a la línea ${i + 1}`} title={f.completa ? 'Quitar conformidad' : 'Conformidad sin escanear'} disabled={f.it.id == null} onClick={() => marcar(f.idx)}>
                        {f.completa && <Check size={16} strokeWidth={3} />}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="sdt-total">
            <div>
              <span>{costoLotes != null ? 'Costo por lotes' : 'Monto de la solicitud'}</span>
              {costoLotes != null && Math.abs(costoLotes - totalImp) > 0.005 && <small>Estimado antes: {formatSoles(totalImp)}. Se costea con el lote real al despachar.</small>}
            </div>
            <b>{formatSoles(pendiente ? (costoLotes ?? totalImp) : montoFinal)}</b>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
