// Herramientas de Status de rampa: configurador de bahías, reporte PDF y envío por WhatsApp.
// Las reglas del reporte (qué bahías salen) están en rampasReporte.ts.
import { useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { api, apiFetch, errorMessage } from '../../core/api/client';
import { compartirPDF } from '../../core/lib/pdf';
import { pdfDeHtml } from './otPdf';
import type { CatalogosTaller } from './api';
import { type CatRampa, enReporte } from './rampasReporte';
import './RampasConfig.css';

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
const escHtml = (v: unknown) => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const SEM_HEX = { verde: '#15803d', ambar: '#b45309', rojo: '#b91c1c', gris: '#64748b' };

function htmlPdfRampas(filas: FilaPdfRampa[], empresa: string, d: DatosPdfRampa, logo: string): string {
  const cuerpo = filas.map(f => `<tr style="${f.libre ? 'color:#64748b' : ''}">
      <td style="font-weight:700">${escHtml(f.rampa)}</td>
      <td style="text-align:center">${escHtml(f.fIn)}</td>
      <td style="text-align:center">${escHtml(f.hIn)}</td>
      <td style="text-align:center"><span style="display:inline-block;border:1.5px solid #000;border-radius:4px;padding:1px 6px;font-weight:700;font-family:Courier New,monospace">${escHtml(f.placa)}</span></td>
      <td style="text-align:center;font-weight:700;color:${f.situacionColor}">${escHtml(f.situacion)}</td>
      <td style="text-align:left;white-space:pre-line">${escHtml(f.obs)}</td>
      <td style="text-align:center">${escHtml(f.fOut)}</td>
      <td style="text-align:center">${escHtml(f.hOut)}</td>
      <td style="text-align:center;font-weight:700;color:${f.horasColor}">${escHtml(f.horas)}</td>
      <td style="text-align:left;white-space:pre-line">${escHtml(f.tecnicos)}</td>
      <td style="text-align:center;font-weight:700;color:${f.inspColor}">${escHtml(f.insp)}</td>
    </tr>`).join('') || '<tr><td colspan="11" style="padding:10px">Sin unidades en rampa.</td></tr>';
  return `
  <style>.rp td,.rp th{border:1px solid #000;padding:3px 4px}</style>
  <div style="font-family:Arial,Helvetica,sans-serif;color:#000;padding:14px;width:1040px;background:#fff">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #000;padding-bottom:8px">
      ${logo ? `<img src="${logo}" alt="" style="height:54px" />` : ''}
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700">${escHtml(empresa.toUpperCase())}</div>
        <div style="font-size:20px;font-weight:800;text-align:center">ESTATUS DE UNIDADES EN TALLER</div>
        <div style="font-size:10px;text-align:center">CONTROL DE OCUPACIÓN DE RAMPA Y TURNOS DE MANTENIMIENTO</div>
      </div>
      <table style="border:1px solid #000;font-size:10px;border-collapse:collapse">
        <tr><td style="padding:3px 8px;text-align:right">CÓDIGO: F-MAN-005</td></tr>
        <tr><td style="padding:3px 8px;text-align:right">VERSIÓN: 0</td></tr>
        <tr><td style="padding:3px 8px;text-align:right">F. EMISIÓN: 10/11/2025</td></tr>
      </table>
    </div>
    <div style="display:flex;gap:26px;flex-wrap:wrap;margin:10px 0;border:1px solid #000;border-radius:6px;padding:6px 10px;font-size:11px">
      <span>EMISIÓN: <b>${escHtml(d.fecha)}</b></span>
      <span>EMITIDO POR: <b>${escHtml(d.emisor)}</b></span>
      <span style="margin-left:auto">TOTAL RAMPAS: <b>${d.total}</b></span>
      <span>OCUPADAS: <b style="color:#dc2626">${d.ocupadas}</b></span>
      <span>EN ESPERA / LAVADO: <b style="color:#b45309">${d.espera}</b></span>
      <span>LIBRES: <b style="color:#15803d">${d.libres}</b></span>
    </div>
    <table class="rp" style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr style="background:#000;color:#fff">
        <th style="padding:5px">RAMPA</th><th>F. INGRESO</th><th>HORA</th><th>PLACA</th><th>SITUACIÓN</th>
        <th>MOTIVO DE INGRESO</th><th>SALIDA (EST.)</th><th>HORA</th><th>H. TALLER</th><th>TÉCNICOS</th><th>INSPECCIÓN?</th>
      </tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;border-top:1px solid #000;margin-top:10px;padding-top:6px;font-size:9px">
      <span>Sistema ERP Azkell Fleet · Módulo de Control de Rampa y Mantenimiento</span>
      <span>Semáforo Inspección: <b style="color:${SEM_HEX.verde}">&gt;7d Vigente</b> <b style="color:${SEM_HEX.ambar}">0-7d Próximo</b> <b style="color:${SEM_HEX.rojo}">&lt;0d Vencido</b></span>
      <span><b>DOCUMENTO OFICIAL · HOJA 1 DE 1</b></span>
    </div>
  </div>`;
}

async function nombreEmpresa(): Promise<string> {
  try {
    const r = await api<{ valor: string | null }>('/configuracion-clave/empresa_nombre');
    if (r.valor) return r.valor;
  } catch { /* sin configuración: se usa el subdominio */ }
  return (window.location.hostname.split('.')[0] || 'Azkell').toUpperCase();
}

/** El logo va incrustado en el documento: el servidor no descarga imágenes del sitio */
async function logoEmbebido(): Promise<string> {
  try {
    const res = await apiFetch('/tenant-logo');
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((ok, no) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.onerror = () => no(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch { return ''; }
}

/** PDF oficial F-MAN-005 (horizontal) generado en el servidor con Chromium: texto real, nítido en cualquier zoom. */
export async function generarPdfRampas(filas: FilaPdfRampa[], d: DatosPdfRampa): Promise<Blob> {
  const html = htmlPdfRampas(filas, await nombreEmpresa(), d, await logoEmbebido());
  return pdfDeHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Status de rampa</title></head><body style="margin:0">${html}</body></html>`, 'Status de rampa', true);
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

/** Muelle de la lista al soltar una rampa: sin rebote (Apple: reposicionar con amortiguación crítica) */
const RESORTE = { type: 'spring' as const, bounce: 0, duration: 0.35 };
const SIN_MOVIMIENTO = { duration: 0 };

interface FilaRampaProps {
  c: CatRampa; ocupado: boolean; reducir: boolean;
  onSoltar: () => void; onReporte: (v: boolean) => void; onEliminar: () => void;
}

/** Una rampa de la lista: solo el asa inicia el arrastre, para no chocar con el resto de la fila */
function FilaRampa({ c, ocupado, reducir, onSoltar, onReporte, onEliminar }: FilaRampaProps) {
  const asa = useDragControls();
  return (
    <Reorder.Item as="li" value={c} dragListener={false} dragControls={asa} onDragEnd={onSoltar}
      whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgba(0, 0, 0, 0.18)' }}
      transition={reducir ? SIN_MOVIMIENTO : RESORTE} className="rcfg__fila">
      <button type="button" className="rcfg__asa" aria-label={`Mover ${nombreDe(c)}`} title="Arrastra para mover"
        disabled={ocupado} onPointerDown={e => asa.start(e)}>
        <GripVertical size={20} />
      </button>
      <span className="rcfg__nombre">{nombreDe(c)}</span>
      <Switch checked={enReporte(c)} disabled={ocupado} onChange={onReporte} label="En reporte" />
      <button type="button" className="rcfg__quitar" aria-label={`Eliminar ${nombreDe(c)}`} title="Eliminar"
        disabled={ocupado} onClick={onEliminar}>
        <Trash2 size={18} />
      </button>
    </Reorder.Item>
  );
}

/** Configurador de bahías: arrastra cada rampa por su asa para cambiar el orden; alta, baja y "En reporte" (cat_rampas) */
export function ConfigurarRampasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const reducir = !!useReducedMotion();
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Orden mientras se arrastra y se guarda; null = el del servidor
  const [local, setLocal] = useState<CatRampa[] | null>(null);
  const cat = useQuery<CatalogosTaller>({
    queryKey: ['mant', 'catalogos-taller'],
    queryFn: () => api<CatalogosTaller>('/catalogos_taller'),
    enabled: open,
  });
  const delServidor = ordenadas((cat.data?.rampas ?? []) as CatRampa[]);
  const lista = local ?? delServidor;

  async function accion(fn: () => Promise<unknown>, aviso?: string) {
    setOcupado(true); setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['mant'] });
      if (aviso) toast(aviso);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLocal(null); setOcupado(false); }
  }

  const cambiar = (id: CatRampa['id'], cambios: Record<string, unknown>) =>
    accion(() => api(`/cat-rampas/${encodeURIComponent(String(id))}`, { method: 'PUT', body: cambios }));

  // Al soltar la rampa se guarda el orden completo, solo si cambió
  async function guardarOrden(nuevo: CatRampa[]) {
    const antes = delServidor.map(c => String(c.id)).join(',');
    if (nuevo.map(c => String(c.id)).join(',') === antes) return;
    await accion(() => api('/cat-rampas/reorder', { method: 'PUT', body: nuevo.map((c, i) => ({ id: c.id, orden: i + 1 })) }));
  }

  async function agregar() {
    const nombre = nueva.trim();
    if (!nombre) return;
    await accion(() => api('/cat-rampas', { method: 'POST', body: { nombre_rampa: nombre, sede: 'Principal' } }), `Rampa "${nombre}" agregada`);
    setNueva('');
  }

  async function eliminar(c: CatRampa) {
    if (!window.confirm(`¿Eliminar la rampa "${nombreDe(c)}"? Solo se permite si no tiene unidades.`)) return;
    await accion(() => api(`/cat-rampas/${encodeURIComponent(String(c.id))}`, { method: 'DELETE' }), 'Rampa eliminada');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Configurar rampas"
      footer={<Button variant="secondary" onClick={onClose}>Listo</Button>}>
      <p className="rcfg__ayuda">
        Arrastra una rampa por su asa para cambiar el orden. Lo que apagues en "En reporte" no sale en el PDF ni en el WhatsApp.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {cat.isLoading ? <PageLoader /> : (
        <Reorder.Group as="ul" axis="y" values={lista} onReorder={setLocal} className="rcfg__lista">
          {lista.map(c => (
            <FilaRampa key={String(c.id)} c={c} ocupado={ocupado} reducir={reducir}
              onSoltar={() => guardarOrden(local ?? delServidor)}
              onReporte={v => cambiar(c.id, { en_reporte: v })}
              onEliminar={() => eliminar(c)} />
          ))}
        </Reorder.Group>
      )}
      <div className="rcfg__agregar">
        <div>
          <TextInput value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Nombre de la nueva rampa" aria-label="Nombre de la nueva rampa" />
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={agregar} disabled={!nueva.trim() || ocupado}>Agregar</Button>
      </div>
    </Sheet>
  );
}
