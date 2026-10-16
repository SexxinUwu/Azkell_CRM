// Herramientas de Status de rampa: configurador de bahías, reporte PDF y envío por WhatsApp.
// Las reglas del reporte (qué bahías salen) están en rampasReporte.ts.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { exportarPDF } from '../../core/lib/pdf';
import type { CatalogosTaller, RampaEntrada } from './api';
import { type CatRampa, enReporte, fechaCorta, horaCorta, rampasDelReporte } from './rampasReporte';

export { textoReporteRampas } from './rampasReporte';
export type { CatRampa } from './rampasReporte';

const nombreDe = (c: CatRampa) => c.nombre_rampa ?? c.nombre ?? String(c.id);
const ordenadas = (lista: CatRampa[]) => [...lista].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || Number(a.id) - Number(b.id));
const escHtml = (v: unknown) => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function enviarWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}

/** PDF horizontal con las rampas activas que salen en el reporte */
export async function exportarRampasPDF(activas: RampaEntrada[], catalogo: CatRampa[], ahora: Date = new Date()) {
  const filas = rampasDelReporte(activas, catalogo);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;color:#111;padding:18px;font-family:Arial,sans-serif;width:1000px';
  el.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:18px">Status de rampa · ${fechaCorta(ahora)}</h2>
    <p style="margin:0 0 12px;font-size:11px;color:#555">${filas.length} unidades en rampa</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:#f1f1f1">${['Rampa', 'Placa', 'Conductor', 'Ingreso', 'Hora', 'Situación', 'Observaciones'].map(h => `<th style="text-align:left;padding:6px;border-bottom:1px solid #ccc">${h}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(r => `<tr>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(r.rampa)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace">${escHtml(r.placa)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(r.conductor)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(r.fecha_ingreso?.split('T')[0])}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(horaCorta(r.hora_ingreso))}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(r.situacion)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${escHtml(r.observaciones)}</td>
      </tr>`).join('') || '<tr><td colspan="7" style="padding:10px;color:#555">Sin unidades en rampa.</td></tr>'}</tbody>
    </table>`;
  document.body.appendChild(el);
  try {
    await exportarPDF(el, `Status-rampa-${ahora.toISOString().slice(0, 10)}`, { orientacion: 'landscape' });
  } finally {
    el.remove();
  }
}

/** Configurador de bahías: nombre, color, orden, en reporte, alta y baja (cat_rampas) */
export function ConfigurarRampasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cat = useQuery<CatalogosTaller>({
    queryKey: ['mant', 'catalogos-taller'],
    queryFn: () => api<CatalogosTaller>('/catalogos_taller'),
    enabled: open,
  });
  const lista = ordenadas((cat.data?.rampas ?? []) as CatRampa[]);

  async function accion(fn: () => Promise<unknown>, aviso?: string) {
    setOcupado(true); setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['mant'] });
      if (aviso) toast(aviso);
    } catch (err) { setError(errorMessage(err)); }
    finally { setOcupado(false); }
  }

  const cambiar = (id: CatRampa['id'], cambios: Record<string, unknown>) =>
    accion(() => api(`/cat-rampas/${encodeURIComponent(String(id))}`, { method: 'PUT', body: cambios }));

  async function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const a = lista[i], b = lista[j];
    await accion(() => api('/cat-rampas/reorder', { method: 'PUT', body: [
      { id: a.id, orden: Number(b.orden) || j },
      { id: b.id, orden: Number(a.orden) || i },
    ] }));
  }

  async function agregar() {
    const nombre = nueva.trim();
    if (!nombre) return;
    await accion(() => api('/cat-rampas', { method: 'POST', body: { nombre_rampa: nombre, sede: 'Principal', color: '#ef4444' } }), `Rampa "${nombre}" agregada`);
    setNueva('');
  }

  async function eliminar(c: CatRampa) {
    if (!window.confirm(`¿Eliminar la rampa "${nombreDe(c)}"? Solo se permite si no tiene unidades.`)) return;
    await accion(() => api(`/cat-rampas/${encodeURIComponent(String(c.id))}`, { method: 'DELETE' }), 'Rampa eliminada');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Configurar rampas"
      footer={<Button variant="secondary" onClick={onClose}>Listo</Button>}>
      <p className="t-callout c-secondary" style={{ marginTop: 0 }}>
        Orden en que aparecen, color y si salen en el PDF y en el WhatsApp del reporte diario.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {cat.isLoading ? <PageLoader /> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--s-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((c, i) => (
            <li key={String(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--fill-subtle)' }}>
              <input type="color" aria-label={`Color de ${nombreDe(c)}`} value={c.color ?? '#ef4444'} disabled={ocupado}
                onChange={e => cambiar(c.id, { color: e.target.value })}
                style={{ width: 44, height: 44, border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }} />
              <span style={{ flex: 1, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreDe(c)}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--label-2)', minHeight: 44 }}>
                <input type="checkbox" checked={enReporte(c)} disabled={ocupado}
                  onChange={e => cambiar(c.id, { en_reporte: e.target.checked })}
                  style={{ width: 20, height: 20 }} />
                En reporte
              </label>
              <Button variant="plain" iconOnly aria-label="Subir" title="Subir" icon={<ArrowUp size={18} />} disabled={ocupado || i === 0} onClick={() => mover(i, -1)} />
              <Button variant="plain" iconOnly aria-label="Bajar" title="Bajar" icon={<ArrowDown size={18} />} disabled={ocupado || i === lista.length - 1} onClick={() => mover(i, 1)} />
              <Button variant="plain" iconOnly aria-label={`Eliminar ${nombreDe(c)}`} title="Eliminar" icon={<Trash2 size={18} />} disabled={ocupado} onClick={() => eliminar(c)} />
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <TextInput value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Nombre de la nueva rampa" aria-label="Nombre de la nueva rampa" />
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={agregar} disabled={!nueva.trim() || ocupado}>Agregar</Button>
      </div>
    </Sheet>
  );
}
