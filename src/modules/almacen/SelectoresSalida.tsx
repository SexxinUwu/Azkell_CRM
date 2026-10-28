import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, QrCode } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { formatSoles } from '../../core/lib/format';
import { costoSolesArticulo, type ArticuloInv } from './api';
import { EscanerCodigo } from './EscanerCodigo';

// Selectores buscables de la Solicitud de Salida: calcados de los del clásico (solicitante con buscador,
// artículo con código, marca, sistema, costo en soles y stock) y con la foto de cada artículo.
// Las fotos vienen de S3 con una URL firmada; el service worker las guarda por su ruta sin la firma.

const MAX_FILAS = 80;

function usePopover(abierto: boolean, cerrar: () => void) {
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [caja, setCaja] = useState<{ left: number; top: number; width: number } | null>(null);
  // La lista se pinta fuera del formulario (portal) para que no la recorte el contenedor con scroll de la tabla
  useLayoutEffect(() => {
    if (!abierto) return;
    const medir = () => { const r = raiz.current?.getBoundingClientRect(); if (r) setCaja({ left: r.left, top: r.bottom + 4, width: r.width }); };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!raiz.current?.contains(t) && !lista.current?.contains(t)) cerrar();
    };
    // Escape en captura: cierra solo la lista y no llega a la hoja que la contiene
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('pointerdown', fuera);
    window.addEventListener('keydown', tecla, true);
    return () => { document.removeEventListener('pointerdown', fuera); window.removeEventListener('keydown', tecla, true); };
  }, [abierto, cerrar]);
  return { raiz, lista, caja };
}

/** Lista desplegable anclada al campo, en un portal por encima de la hoja */
function ListaFlotante({ caja, lista, id, ancho, children, maxAlto }: {
  caja: { left: number; top: number; width: number } | null; lista: React.RefObject<HTMLDivElement | null>; id: string; ancho?: number; children: React.ReactNode; maxAlto: number;
}) {
  if (!caja) return null;
  const w = Math.max(caja.width, ancho ?? 0);
  const left = Math.max(8, Math.min(caja.left, window.innerWidth - w - 8));
  return createPortal(
    <div ref={lista} id={id} role="listbox" style={{ ...estiloLista, position: 'fixed', left, top: caja.top, width: w, right: 'auto', zIndex: 10000, maxHeight: maxAlto, overflowY: 'auto' }}>{children}</div>,
    document.body,
  );
}

const estiloLista: React.CSSProperties = {
  position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 60, background: 'var(--surface)',
  border: '1px solid var(--separator)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden',
};

/** Técnicos del taller y conductores, sin repetir (misma fuente que el clásico: /taller-personal y /conductores) */
export function usePersonalSolicitante() {
  return useQuery({
    queryKey: ['mant', 'personal-ot'],
    queryFn: async () => {
      const lista = (r: unknown) => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
      const [taller, conductores] = await Promise.all([
        api<unknown>('/taller-personal').catch(() => []),
        api<unknown>('/conductores').catch(() => []),
      ]);
      const nombres = new Map<string, string>();
      for (const p of lista(taller)) { const n = String(p.nombre ?? '').trim(); if (n) nombres.set(n.toUpperCase(), n); }
      for (const p of lista(conductores)) { const n = String(p.nombre_completo ?? p.nombre ?? '').trim(); if (n && !nombres.has(n.toUpperCase())) nombres.set(n.toUpperCase(), n); }
      return [...nombres.values()].sort((a, b) => a.localeCompare(b, 'es'));
    },
    staleTime: 5 * 60_000,
  });
}

/** Solicitante / responsable: escribe para filtrar la lista del personal y toca un nombre para elegirlo */
export function SolicitanteSelector({ id, value, onChange, opciones, invalido }: {
  id?: string; value: string; onChange: (v: string) => void; opciones: string[]; invalido?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const { raiz, lista, caja } = usePopover(abierto, () => setAbierto(false));
  const listId = useId();
  const visibles = useMemo(() => {
    const q = value.trim().toUpperCase();
    return (q ? opciones.filter(o => o.toUpperCase().includes(q)) : opciones).slice(0, MAX_FILAS);
  }, [opciones, value]);

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <input id={id} className="input" value={value} autoComplete="off" placeholder="Buscar personal / solicitante..."
        aria-invalid={invalido || undefined} aria-expanded={abierto} aria-controls={listId} role="combobox"
        onFocus={() => setAbierto(true)} onChange={e => { onChange(e.target.value); setAbierto(true); }} />
      {abierto && visibles.length > 0 && (
        <ListaFlotante caja={caja} lista={lista} id={listId} maxAlto={260}>
          {visibles.map(n => (
            <button key={n} type="button" role="option" aria-selected={n === value}
              onClick={() => { onChange(n); setAbierto(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '0 14px', border: 0, background: n === value ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer', fontWeight: 600, color: 'var(--label)' }}>
              {n}
            </button>
          ))}
        </ListaFlotante>
      )}
    </div>
  );
}

function Miniatura({ url, nombre }: { url: string | null; nombre: string }) {
  const [falla, setFalla] = useState(false);
  const caja: React.CSSProperties = { width: 44, height: 44, borderRadius: 8, flex: '0 0 44px', background: 'var(--fill, #f1f5f9)', display: 'grid', placeItems: 'center', overflow: 'hidden', color: 'var(--label-3)' };
  if (!url || falla) return <span style={caja} aria-hidden><ImageOff size={18} /></span>;
  return (
    <span style={caja}>
      <img src={url} alt={nombre} loading="lazy" decoding="async" onError={() => setFalla(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </span>
  );
}

/** Texto de búsqueda de un artículo: código, código de barras, nombre, familia, marca y sistema */
function textoBusqueda(a: ArticuloInv) {
  return `${a.id} ${a.codigo_articulo ?? ''} ${a.codigo_barras ?? ''} ${a.articulo} ${a.descripcion} ${a.familia ?? ''} ${a.marca ?? ''} ${a.sistema ?? ''}`.toUpperCase();
}

/** Artículo del almacén: el campo muestra el elegido; al tocarlo se abre una hoja con buscador y la lista
 *  (foto, código, marca, sistema, costo en soles y stock). El botón QR lee el código con la cámara. */
export function ArticuloSelector({ value, articulos, onSelect, invalido, id }: {
  value: string; articulos: ArticuloInv[]; onSelect: (a: ArticuloInv) => void; invalido?: boolean; id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [q, setQ] = useState('');
  const toast = useToast();
  const { visibles, total } = useMemo(() => {
    const n = q.trim().toUpperCase();
    const lista = n ? articulos.filter(a => textoBusqueda(a).includes(n)) : articulos;
    return { visibles: lista.slice(0, MAX_FILAS), total: lista.length };
  }, [articulos, q]);

  function elegir(a: ArticuloInv) {
    onSelect(a);
    setAbierto(false);
  }

  function alEscanear(codigo: string) {
    setEscaneando(false);
    const c = codigo.trim().toUpperCase();
    const hallado = articulos.find(a => a.id.toUpperCase() === c || (a.codigo_barras ?? '').trim().toUpperCase() === c);
    if (!hallado) { toast(`Artículo no encontrado: ${codigo}`, 'error'); return; }
    onSelect(hallado);
    toast(`Artículo: ${hallado.articulo || hallado.id}`);
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', minWidth: 0 }}>
      <button id={id} type="button" className="input" aria-invalid={invalido || undefined} onClick={() => { setQ(''); setAbierto(true); }}
        style={{ textAlign: 'left', fontSize: '0.875rem', minHeight: '2.5rem', width: '100%', minWidth: 0, cursor: 'pointer', color: value ? 'var(--label)' : 'var(--label-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || 'Elegir artículo…'}
      </button>
      <button type="button" className="sal-escanear" onClick={() => setEscaneando(true)} aria-label="Escanear código de barras o QR" title="Escanear código de barras o QR">
        <QrCode size={18} />
      </button>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="Buscar artículo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Código, código de barras, nombre, marca…" style={{ fontSize: '1rem', minHeight: 44, flex: 1 }} />
            <button type="button" className="sal-escanear" style={{ width: 44, height: 44 }} onClick={() => { setAbierto(false); setEscaneando(true); }} aria-label="Escanear código">
              <QrCode size={18} />
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
            {total} artículo(s){total > visibles.length ? ` · mostrando ${visibles.length}, escribe para afinar` : ''}
          </div>
          <div role="listbox" className="sal-art-lista">
            {visibles.length === 0 && <div style={{ padding: 16, color: 'var(--label-2)', fontSize: '0.875rem' }}>Sin resultados para “{q}”.</div>}
            {visibles.map(a => {
              const costo = costoSolesArticulo(a);
              const stock = Number(a.stock_actual) || 0;
              return (
                <button key={a.id} type="button" role="option" aria-selected={a.articulo === value}
                  onClick={() => elegir(a)} className="sal-art-opcion" data-seleccionado={a.articulo === value || undefined}>
                  <Miniatura url={a.imagen_url} nombre={a.articulo} />
                  <span className="sal-art-opcion__texto">
                    <span className="sal-art-opcion__nombre">{a.articulo || a.descripcion}</span>
                    <span className="sal-art-opcion__meta">
                      {a.codigo_articulo || a.id}{a.marca ? ` · ${a.marca}` : ''}{a.sistema ? ` · ${a.sistema}` : ''}
                    </span>
                    <span className="sal-art-opcion__meta">
                      <span className={stock > 0 ? 'sal-stock sal-stock--ok' : 'sal-stock sal-stock--no'}>
                        {stock > 0 ? `Stock: ${Number(stock).toLocaleString('es-PE', { maximumFractionDigits: 2 })}${a.unidad ? ` ${a.unidad}` : ''}` : 'Sin stock'}
                      </span>
                      <span className="sal-art-opcion__costo">{formatSoles(costo)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>
      <EscanerCodigo open={escaneando} onClose={() => setEscaneando(false)} onLeido={alEscanear} titulo="Escanear artículo" />
    </div>
  );
}
