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
import { compartirPDF } from '../../core/lib/pdf';
import { construirPdfRampas } from './rampaPdfVector';
import { LOGO_RAMPA } from './rampaPdf';
import type { CatalogosTaller } from './api';
import { type CatRampa, enReporte } from './rampasReporte';

/** Una fila del reporte F-MAN-005 ya calculada por la pantalla (tiempos, semáforo de inspección) */
export interface FilaPdfRampa {
  rampa: string; fIn: string; hIn: string; placa: string; situacion: string; situacionColor: string; obs: string;
  fOut: string; hOut: string; horas: string; horasColor: string; tecnicos: string; insp: string; inspColor: string; libre: boolean;
}
export interface DatosPdfRampa { fecha: string; emisor: string; total: number; ocupadas: number; espera: number; libres: number }

export { textoReporteRampas } from './rampasReporte';
export type { CatRampa } from './rampasReporte';

const nombreDe = (c: CatRampa) => c.nombre_rampa ?? c.nombre ?? String(c.id);
const ordenadas = (lista: CatRampa[]) => [...lista].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || Number(a.id) - Number(b.id));

async function nombreEmpresa(): Promise<string> {
  try {
    const r = await api<{ valor: string | null }>('/configuracion-clave/empresa_nombre');
    if (r.valor) return r.valor;
  } catch { /* sin configuración: se usa el subdominio */ }
  return (window.location.hostname.split('.')[0] || 'Azkell').toUpperCase();
}

/** PDF vectorial F-MAN-005 (jsPDF): texto seleccionable, sin imágenes de la página */
export async function generarPdfRampas(filas: FilaPdfRampa[], d: DatosPdfRampa): Promise<Blob> {
  return construirPdfRampas(filas, await nombreEmpresa(), d, LOGO_RAMPA);
}

/** Abre el PDF en una pestaña nueva (enlace blob:), igual que el clásico */
export async function abrirPdfRampas(filas: FilaPdfRampa[], d: DatosPdfRampa) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Permite las ventanas emergentes para ver el PDF.');
  try {
    const blob = await generarPdfRampas(filas, d);
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    win.close();
    throw err;
  }
}

/** Mismo PDF por WhatsApp: hoja de compartir en el celular; en escritorio, descarga y chat */
export async function compartirRampasPdf(filas: FilaPdfRampa[], d: DatosPdfRampa, texto: string) {
  const blob = await generarPdfRampas(filas, d);
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  return compartirPDF(blob, `Status_Rampa_${dd}${mm}${ahora.getFullYear()}.pdf`, texto);
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
