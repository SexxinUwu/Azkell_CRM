import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { api } from '../../core/api/client';
import { Firma, type FirmaHandle } from '../inspecciones/Firma';

// Checklist de la garita: misma plantilla global y mismos valores que el clásico (ok, mal, na).
export interface ItemChk { id: string; label: string; tiene_cantidad?: boolean; default_cantidad?: number }
export interface CatChk { id: string; titulo: string; items: ItemChk[] }
export type ValoresChk = Record<string, string | number>; // itemId → 'ok' | 'mal' | 'na'; itemId + '_cant' → cantidad

export function useTemplateGarita() {
  return useQuery<CatChk[]>({
    queryKey: ['personas', 'garita-template'],
    queryFn: () => api<CatChk[]>('/seguridad/template').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 300_000,
  });
}

export const hayObservado = (v: ValoresChk) => Object.entries(v).some(([k, x]) => !k.endsWith('_cant') && x === 'mal');

export function ChecklistGarita({ plantilla, valores, onCambio }: {
  plantilla: CatChk[]; valores: ValoresChk; onCambio: (v: ValoresChk) => void;
}) {
  const marcar = (id: string, val: string) => {
    const nx = { ...valores };
    if (nx[id] === val) delete nx[id]; else nx[id] = val;
    onCambio(nx);
  };
  const todoOk = (cat: CatChk) => {
    const nx = { ...valores };
    cat.items.forEach(i => { nx[i.id] = 'ok'; });
    onCambio(nx);
  };
  if (!plantilla.length) return <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>No hay plantilla de checklist configurada.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {plantilla.map(cat => (
        <div key={cat.id} className="tarjeta__lista" style={{ padding: 'var(--s-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s-2)' }}>
            <strong style={{ fontSize: '0.875rem' }}>{cat.titulo}</strong>
            <button type="button" className="chip" onClick={() => todoOk(cat)}>Todo OK</button>
          </div>
          {cat.items.map(it => {
            const val = valores[it.id];
            return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)', padding: '6px 0', borderTop: '1px solid var(--separator)' }}>
                <span style={{ fontSize: '0.8125rem', flex: 1, minWidth: 0 }}>{it.label}</span>
                {it.tiene_cantidad && (
                  <input type="number" min={0} max={999} aria-label={`Cantidad de ${it.label}`}
                    value={Number(valores[`${it.id}_cant`] ?? it.default_cantidad ?? 1)}
                    onChange={e => onCambio({ ...valores, [`${it.id}_cant`]: Number(e.target.value) || 0 })}
                    style={{ width: 52, height: 30, textAlign: 'center', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)' }} />
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  {([['mal', '✕', 'Observado'], ['na', 'N/A', 'No aplica'], ['ok', '✓', 'Conforme']] as const).map(([k, txt, titulo]) => (
                    <button key={k} type="button" title={titulo} aria-pressed={val === k} onClick={() => marcar(it.id, k)}
                      style={{
                        minWidth: 34, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem',
                        background: val === k ? (k === 'ok' ? 'var(--green-ink)' : k === 'mal' ? 'var(--red-ink)' : 'var(--gray-ink)') : 'var(--fill-2)',
                        color: val === k ? '#fff' : 'var(--label-2)',
                      }}>{txt}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Firma del conductor y de vigilancia (canvas). Devuelve PNG en base64 o cadena vacía.
export function FirmaPar({ etiquetaConductor, etiquetaVigilancia, refConductor, refVigilancia }: {
  etiquetaConductor: string; etiquetaVigilancia: string;
  refConductor: RefObject<FirmaHandle | null>; refVigilancia: RefObject<FirmaHandle | null>;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--s-3)' }}>
      <div><div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', marginBottom: 4 }}>{etiquetaConductor}</div><Firma ref={refConductor} /></div>
      <div><div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', marginBottom: 4 }}>{etiquetaVigilancia}</div><Firma ref={refVigilancia} /></div>
    </div>
  );
}

// Fotos de evidencia: se eligen en el móvil (cámara o galería) y se suben a S3 después de guardar el registro
export function FotosGarita({ fotos, onCambio }: { fotos: File[]; onCambio: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={e => { const nuevas = Array.from(e.target.files ?? []); onCambio([...fotos, ...nuevas].slice(0, 12)); e.target.value = ''; }} />
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="secondary" icon={<Camera size={16} />} onClick={() => input.current?.click()}>Agregar fotos</Button>
        <span style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>{fotos.length} de 12</span>
      </div>
      {fotos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fotos.map((f, i) => (
            <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" aria-label="Quitar foto" onClick={() => onCambio(fotos.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-2)' }}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Sube las fotos a S3 con URLs prefirmadas y luego las registra en la base (mismo flujo que el clásico)
export async function subirFotosGarita(registroId: string, fase: 'salida' | 'retorno', archivos: File[]) {
  if (!archivos.length) return;
  const meta = archivos.map((_, i) => ({ nombre: `evidencia_${i + 1}.jpg`, tipo: 'image/jpeg', fase }));
  const { urls } = await api<{ urls: { uploadUrl: string; key: string; fase: string }[] }>(
    `/seguridad/unidades/${encodeURIComponent(registroId)}/fotos/presigned`, { method: 'POST', body: { archivos: meta } });
  const exitosos: { key: string; fase: string }[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const u = urls[i];
    if (!u) continue;
    const put = await fetch(u.uploadUrl, { method: 'PUT', body: archivos[i], headers: { 'Content-Type': 'image/jpeg' } });
    if (put.ok) exitosos.push({ key: u.key, fase: u.fase });
  }
  if (!exitosos.length) throw new Error('No se pudieron subir las fotos. El registro quedó guardado; vuelve a intentarlo desde el registro.');
  await api(`/seguridad/unidades/${encodeURIComponent(registroId)}/fotos/confirmar`, { method: 'POST', body: { exitosos } });
}
