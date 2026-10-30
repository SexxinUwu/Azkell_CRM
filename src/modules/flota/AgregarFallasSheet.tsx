import './checklist.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { ReporteFalla } from './api';
import { leerFallas } from './fman';
import { VisorFotos } from '../../core/ui/VisorFotos';

type Unidad = 'tracto' | 'remolque';

// Agrega fallas a un reporte ya creado. Solo suma filas: no cambia ni borra lo que el reporte ya tiene.
export function AgregarFallasSheet({ falla, open, onClose }: { falla: ReporteFalla; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const yaRegistradas = [
    ...leerFallas(falla.fallas_tracto_json).map(f => ({ ...f, unidad: falla.placa_tracto || 'Camión' })),
    ...leerFallas(falla.fallas_remolque_json).map(f => ({ ...f, unidad: falla.placa_remolque || 'Carreta' })),
  ];
  // Evidencias ya cargadas: se piden con URL firmada y se ven en el mismo visor que seguridad
  const fotosGuardadas = (() => {
    try {
      const v = typeof falla.fotos_json === 'string' ? JSON.parse(falla.fotos_json) : falla.fotos_json;
      return Array.isArray(v) ? v.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http')) : [];
    } catch { return []; }
  })();
  const firmadas = useQuery<Record<string, string>>({
    queryKey: ['flota', 'checklist-fotos-agregar', String(falla.id), fotosGuardadas.join('|')],
    enabled: open && fotosGuardadas.length > 0,
    queryFn: async () => (await api<{ signed?: Record<string, string> }>('/mantenimiento/checklist/presign-read', { method: 'POST', body: { urls: fotosGuardadas } })).signed ?? {},
    staleTime: 10 * 60_000,
  });
  const srcFoto = (u: string) => firmadas.data?.[u] || u;
  const esVideo = (u: string) => /\.(mp4|mov|webm|m4v|ogv)(\?|$)/i.test(u);
  const [visor, setVisor] = useState<number | null>(null);
  const [unidad, setUnidad] = useState<Unidad>(falla.placa_tracto ? 'tracto' : 'remolque');
  const [filas, setFilas] = useState<string[]>(['']);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const textos = filas.map(t => t.trim()).filter(Boolean);
    if (!textos.length) { setError('Escribe al menos una falla.'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; agregadas?: number }>(`/mantenimiento/checklist/${encodeURIComponent(String(falla.id))}/agregar-fallas`, {
        method: 'POST', body: { unidad, fallas: textos },
      });
      haptic('success');
      toast(`${r.agregadas ?? textos.length} falla(s) agregada(s) a ${falla.folio}`);
      await qc.invalidateQueries({ queryKey: ['flota', 'checklist'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Agregar fallas · ${falla.folio}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Agregar al detalle</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <div className="field field--wide">
          <Notice>Las fallas se suman al detalle. Las que ya tiene el reporte no se modifican.</Notice>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <p className="ck-bloque__titulo">Fallas ya registradas ({yaRegistradas.length})</p>
          {yaRegistradas.length === 0 ? <p className="t-footnote c-secondary">Este reporte aún no tiene fallas.</p> : (
            <div className="ckd-tabla">
              <table>
                <thead><tr><th>Unidad</th><th>Sistema</th><th>Ítem</th><th>Descripción de la falla</th></tr></thead>
                <tbody>
                  {yaRegistradas.map((f, i) => (
                    <tr key={i}>
                      <td><span className="ckd-placa">{f.unidad}</span></td>
                      <td><span className="ckd-sistema-tag">{(f.sistema || 'MANUAL').toUpperCase()}</span></td>
                      <td className="ckd-falla">{f.item || '—'}</td>
                      <td>{f.obs || f.observacion || 'Sin descripción'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {fotosGuardadas.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <p className="ck-bloque__titulo">Evidencias ({fotosGuardadas.length})</p>
            <div className="ckd-galeria">
              {fotosGuardadas.map((u, i) => (
                <button key={i} type="button" onClick={() => setVisor(i)} aria-label={`Ver evidencia ${i + 1}`}>
                  {esVideo(u) ? <video src={srcFoto(u)} muted preload="metadata" /> : <img src={srcFoto(u)} alt="" loading="lazy" />}
                  {esVideo(u) && <span className="ckd-galeria__play" aria-hidden>▶</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="¿A qué unidad pertenece la falla?" wide>
          {p => (
            <SelectInput {...p} value={unidad} onChange={e => setUnidad(e.target.value as Unidad)}>
              {falla.placa_tracto && <option value="tracto">Camión ({falla.placa_tracto})</option>}
              {falla.placa_remolque && <option value="remolque">Carreta ({falla.placa_remolque})</option>}
            </SelectInput>
          )}
        </Field>
        {filas.map((t, i) => (
          <div key={i} style={{ gridColumn: '1 / -1', display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Field label={`Falla ${i + 1}`}>
                {p => <TextInput {...p} value={t} placeholder="Describe la falla" onChange={e => setFilas(a => a.map((x, j) => (j === i ? e.target.value : x)))} />}
              </Field>
            </div>
            <Button variant="plain" iconOnly icon={<X size={16} />} aria-label={`Quitar falla ${i + 1}`} title="Quitar"
              onClick={() => setFilas(a => (a.length > 1 ? a.filter((_, j) => j !== i) : [''] ))} />
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setFilas(a => [...a, ''])}>Agregar otra falla</Button>
        </div>
      </div>
      <VisorFotos open={visor !== null} indiceInicial={visor ?? 0} onClose={() => setVisor(null)}
        titulo={`Evidencias · ${falla.folio}`}
        fotos={fotosGuardadas.map((u, i) => ({ url: srcFoto(u), titulo: `Evidencia ${i + 1}`, tipo: esVideo(u) ? 'video' as const : 'foto' as const }))} />
    </Sheet>
  );
}
