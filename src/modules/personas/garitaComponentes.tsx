import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { Camera, Check, CheckCheck, Images, X } from 'lucide-react';
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
  if (!plantilla.length) return <div className="gar-vacio">No se ha configurado la plantilla de checklist.</div>;
  return (
    <div>
      {plantilla.map(cat => (
        <div key={cat.id} className="gar-chk">
          <div className="gar-chk__cab">
            <h4>{cat.titulo || 'Categoría'}</h4>
            <Button size="sm" variant="secondary" icon={<CheckCheck size={15} />} onClick={() => todoOk(cat)}>Todo OK</Button>
          </div>
          {(cat.items ?? []).map(it => {
            const val = valores[it.id];
            return (
              <div key={it.id} className="gar-chk__fila" data-chk-item={it.id}>
                <span>{it.label}</span>
                <div className="gar-chk__btns">
                  {it.tiene_cantidad && (
                    <label className="gar-cant">Cant:
                      <input type="number" min={0} max={999} aria-label={`Cantidad de ${it.label}`}
                        value={String(valores[`${it.id}_cant`] ?? it.default_cantidad ?? 1)}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => onCambio({ ...valores, [`${it.id}_cant`]: e.target.value })} />
                    </label>
                  )}
                  <button type="button" className="gar-circ gar-circ--mal" title="Observado / dañado" aria-label="Observado" aria-pressed={val === 'mal'} onClick={() => marcar(it.id, 'mal')}><X size={18} /></button>
                  <button type="button" className="gar-circ gar-circ--na" title="No aplica" aria-label="No aplica" aria-pressed={val === 'na'} onClick={() => marcar(it.id, 'na')}>N/A</button>
                  <button type="button" className="gar-circ gar-circ--ok" title="Conforme" aria-label="Conforme" aria-pressed={val === 'ok'} onClick={() => marcar(it.id, 'ok')}><Check size={18} /></button>
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

// Fotos de evidencia: cámara o galería, con miniaturas y contador (se suben a S3 después de guardar el registro)
export function FotosEvidencia({ fotos, onCambio, max = 12 }: { fotos: File[]; onCambio: (f: File[]) => void; max?: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = fotos.map(f => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(x => URL.revokeObjectURL(x));
  }, [fotos]);
  const agregar = (e: ChangeEvent<HTMLInputElement>) => {
    const nuevas = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (nuevas.length) onCambio([...fotos, ...nuevas].slice(0, max));
  };
  return (
    <div>
      <div className="gar-fotos__cab">
        <div><h4>Evidencias Fotográficas</h4><small>Fotos de odómetro, carrocería, comprobantes o novedades</small></div>
        <span className="gar-chip">{fotos.length} foto(s)</span>
      </div>
      <div className="gar-fotos__btns">
        <label className="btn btn--accent"><Camera size={16} /> Tomar Foto (Cámara)
          <input type="file" accept="image/*" capture="environment" hidden onChange={agregar} /></label>
        <label className="btn btn--secondary"><Images size={16} /> Subir Galería
          <input type="file" accept="image/*" multiple hidden onChange={agregar} /></label>
      </div>
      <div className="gar-fotos__grid">
        {fotos.length === 0 && <div className="gar-foto-vacio">Sin fotos adjuntas. Toma una foto con la cámara o selecciona desde tu galería.</div>}
        {urls.map((u, i) => (
          <div key={u} className="gar-foto">
            <img src={u} alt={`Evidencia ${i + 1}`} onClick={() => window.open(u, '_blank', 'noopener')} />
            <button type="button" aria-label="Quitar foto" onClick={() => onCambio(fotos.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reduce la foto antes de subirla (máx. 1600 px, JPEG 85 %), igual que el clásico
function comprimirImagen(file: File, max = 1600, calidad = 0.85): Promise<Blob> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w > max || h > max) { if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { alpha: false });
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b && b.size > 0 ? b : file), 'image/jpeg', calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
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
    const cuerpo = await comprimirImagen(archivos[i]);
    let ok = false;
    for (let intento = 1; intento <= 4 && !ok; intento++) {
      try { ok = (await fetch(u.uploadUrl, { method: 'PUT', body: cuerpo, headers: { 'Content-Type': 'image/jpeg' } })).ok; }
      catch { await new Promise(r => setTimeout(r, 250 * intento)); }
    }
    if (ok) exitosos.push({ key: u.key, fase: u.fase });
  }
  if (!exitosos.length) throw new Error('No se pudieron subir las fotos. El registro quedó guardado; vuelve a intentarlo desde el registro.');
  await api(`/seguridad/unidades/${encodeURIComponent(registroId)}/fotos/confirmar`, { method: 'POST', body: { exitosos } });
}
