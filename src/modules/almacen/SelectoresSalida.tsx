import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { ArticuloInv } from './api';
import { Sheet } from '../../core/ui/Sheet';

// Selectores buscables de la Solicitud de Salida: calcados de los del clásico (solicitante con buscador,
// artículo con código, descripción y stock) y con la foto de cada artículo.
// Las fotos vienen de S3 con una URL firmada que cambia en cada consulta; el service worker (sw.js) las guarda
// por su ruta sin la firma, así que cada foto se descarga una sola vez aunque se recargue la lista.

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

/** Artículo del almacén: el campo muestra el elegido; al tocarlo se abre una hoja con buscador y la lista (foto, código y stock) */
export function ArticuloSelector({ value, articulos, onSelect, invalido }: {
  value: string; articulos: ArticuloInv[]; onSelect: (a: ArticuloInv) => void; invalido?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const { visibles, total } = useMemo(() => {
    const n = q.trim().toUpperCase();
    const lista = n
      ? articulos.filter(a => `${a.id} ${a.codigo_articulo ?? ''} ${a.articulo} ${a.descripcion} ${a.familia ?? ''}`.toUpperCase().includes(n))
      : articulos;
    return { visibles: lista.slice(0, MAX_FILAS), total: lista.length };
  }, [articulos, q]);

  return (
    <>
      <button type="button" className="input" aria-invalid={invalido || undefined} onClick={() => { setQ(''); setAbierto(true); }}
        style={{ textAlign: 'left', fontSize: '0.875rem', minHeight: '2.25rem', width: '100%', cursor: 'pointer', color: value ? 'var(--label)' : 'var(--label-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || 'Elegir artículo…'}
      </button>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="Buscar artículo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Código, nombre o familia..." style={{ fontSize: '1rem', minHeight: 44 }} />
          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
            {total} artículo(s){total > visibles.length ? ` · mostrando ${visibles.length}, escribe para afinar` : ''}
          </div>
          <div role="listbox" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 'min(60dvh, 520px)', border: '1px solid var(--separator)', borderRadius: 12 }}>
            {visibles.length === 0 && <div style={{ padding: 16, color: 'var(--label-2)', fontSize: '0.875rem' }}>Sin resultados para “{q}”.</div>}
            {visibles.map(a => (
              <button key={a.id} type="button" role="option" aria-selected={a.articulo === value}
                onClick={() => { onSelect(a); setAbierto(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', minHeight: 60, padding: '8px 12px', border: 0, borderBottom: '1px solid var(--separator)', background: a.articulo === value ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer', color: 'var(--label)' }}>
                <Miniatura url={a.imagen_url} nombre={a.articulo} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.articulo || a.descripcion}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{a.codigo_articulo || a.id} · Stock: <b>{a.stock_actual}</b>{a.unidad ? ` ${a.unidad}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </>
  );
}
