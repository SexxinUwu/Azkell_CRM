// Herramientas de Status de rampa: configurador de bahías, reporte PDF y envío por WhatsApp.
// Las reglas del reporte (qué bahías salen) están en rampasReporte.ts.
import { useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { api, apiFetch, errorMessage } from '../../core/api/client';
import { compartirPDF } from '../../core/lib/pdf';
import { pestanaConCamion } from '../../core/ui/CargaCamion';
import { pdfDeHtml } from './otPdf';
import type { CatalogosTaller } from './api';
import { type CatRampa, enReporte } from './rampasReporte';
import './RampasConfig.css';

/** Una fila del reporte F-MAN-005 ya calculada por la pantalla (tiempos, semáforo de inspección) */
export interface FilaPdfRampa {
  rampa: string; fIn: string; hIn: string; placa: string; situacion: string; situacionColor: string; obs: string;
  fOut: string; hOut: string; horas: string; horasColor: string; tecnicos: string; insp: string; inspColor: string; libre: boolean;
}
export interface DatosPdfRampa { fecha: string; emisor: string; total: number; ocupadas: number; espera: number; libres: number; sinRegistrar: number }

export { textoReporteRampas } from './rampasReporte';
export type { CatRampa } from './rampasReporte';

const nombreDe = (c: CatRampa) => c.nombre_rampa ?? c.nombre ?? String(c.id);
const ordenadas = (lista: CatRampa[]) => [...lista].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || Number(a.id) - Number(b.id));
const escHtml = (v: unknown) => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const SEM_HEX = { verde: '#15803d', ambar: '#b45309', rojo: '#b91c1c', gris: '#64748b' };

function htmlPdfRampas(filas: FilaPdfRampa[], empresa: string, d: DatosPdfRampa, logo: string): string {
  const TINTA = { verde: '#15803d', ambar: '#b45309', rojo: '#b91c1c', gris: '#64748b' };
  const TINTA_FONDO = { verde: '#dcfce7', ambar: '#fef3c7', rojo: '#fee2e2', gris: '#f1f5f9' };
  const tonoDe = (color: string): keyof typeof TINTA => (color === SEM_HEX.ambar ? 'ambar' : color === SEM_HEX.verde ? 'verde' : color === SEM_HEX.rojo ? 'rojo' : 'gris');
  const pastilla = (texto: string, tono: keyof typeof TINTA) =>
    `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-weight:600;color:${TINTA[tono]};background:${TINTA_FONDO[tono]};white-space:nowrap">${escHtml(texto)}</span>`;
  const cuerpo = filas.map(f => `<tr style="${f.libre ? 'color:#94a3b8' : ''}">
      <td style="font-weight:600">${escHtml(f.rampa)}</td>
      <td class="c">${escHtml(f.fIn)}</td>
      <td class="c">${escHtml(f.hIn)}</td>
      <td class="c"><span class="placa">${escHtml(f.placa)}</span></td>
      <td class="c">${f.libre ? pastilla('Libre', 'gris') : pastilla(f.situacion, tonoDe(f.situacionColor))}</td>
      <td class="obs">${escHtml(f.obs)}</td>
      <td class="c">${escHtml(f.fOut)}</td>
      <td class="c">${escHtml(f.hOut)}</td>
      <td class="c" style="font-weight:600;color:${f.horasColor}">${escHtml(f.horas)}</td>
      <td class="obs">${escHtml(f.tecnicos)}</td>
      <td class="c" style="font-weight:600;color:${f.inspColor}">${escHtml(f.insp)}</td>
    </tr>`).join('') || '<tr><td colspan="11" style="padding:12px;color:#64748b">Sin unidades en rampa.</td></tr>';
  const marca = logo
    ? `<img src="${logo}" alt="" style="height:40px;max-width:170px;object-fit:contain" />`
    : `<div style="font-size:15px;font-weight:700;letter-spacing:-0.01em">${escHtml(empresa)}</div>`;
  const tarjeta = (num: number | string, etiqueta: string, tono: keyof typeof TINTA) => `
    <div class="kpi" style="background:${TINTA_FONDO[tono]}">
      <div class="kpi-num" style="color:${TINTA[tono]}">${num}</div>
      <div class="kpi-txt">${etiqueta}</div>
    </div>`;
  return `
  <style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    .pdf { font-family: -apple-system, 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #1d1d1f; width: 100%; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid #e5e5ea; }
    .titulo { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
    .sub { font-size: 10px; color: #86868b; margin-top: 2px; }
    .meta { font-size: 10px; color: #6e6e73; text-align: right; line-height: 1.5; }
    .kpis { display: flex; gap: 8px; margin: 10px 0; }
    .kpi { flex: 1; border-radius: 14px; padding: 8px 12px; display: flex; align-items: baseline; justify-content: space-between; }
    .kpi-num { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
    .kpi-txt { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #3a3a3c; }
    .emisor { display: flex; justify-content: space-between; font-size: 10px; color: #6e6e73; margin-bottom: 8px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9.5px; border: 1px solid #e5e5ea; border-radius: 12px; overflow: hidden; }
    thead { display: table-header-group; }
    th { background: #f5f5f7; color: #6e6e73; font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 7px; text-align: left; border-bottom: 1px solid #e5e5ea; }
    td { padding: 5px 7px; border-bottom: 1px solid #f0f0f3; vertical-align: middle; }
    tr { break-inside: avoid; }
    tr:last-child td { border-bottom: 0; }
    .c { text-align: center; }
    .obs { white-space: pre-line; line-height: 1.35; }
    .placa { display: inline-block; border: 1px solid #d2d2d7; border-radius: 6px; padding: 1px 6px; font-weight: 700; font-family: 'SF Mono', Menlo, Consolas, monospace; letter-spacing: 0.03em; }
    .pie { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 8.5px; color: #86868b; }
    .leyenda span { margin-left: 10px; }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  </style>
  <div class="pdf">
    <div class="head">
      <div style="display:flex;align-items:center;gap:14px">
        ${marca}
        <div>
          <div class="titulo">Status de rampa</div>
          <div class="sub">Control de ocupación de rampa y turnos de mantenimiento</div>
        </div>
      </div>
      <div class="meta">
        Código F-MAN-005 · Versión 0<br />
        Emisión ${escHtml(d.fecha)}
      </div>
    </div>
    <div class="emisor">
      <span>Emitido por <b style="color:#1d1d1f">${escHtml(d.emisor || '—')}</b></span>
      ${d.sinRegistrar ? `<span style="color:#b91c1c;font-weight:600">${d.sinRegistrar} unidad${d.sinRegistrar === 1 ? '' : 'es'} sin rampa registrada</span>` : ''}
    </div>
    <div class="kpis">
      ${tarjeta(d.total, 'Rampas en total', 'gris')}
      ${tarjeta(d.ocupadas, 'Ocupadas', 'rojo')}
      ${tarjeta(d.espera, 'En espera / lavado', 'ambar')}
      ${tarjeta(d.libres, 'Libres', 'verde')}
    </div>
    <table>
      <thead><tr>
        <th>Rampa</th><th class="c">Ingreso</th><th class="c">Hora</th><th class="c">Placa</th><th class="c">Situación</th>
        <th>Motivo de ingreso</th><th class="c">Salida est.</th><th class="c">Hora</th><th class="c">H. taller</th><th>Técnicos</th><th class="c">Inspección</th>
      </tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <div class="pie">
      <span>Sistema ERP Azkell Fleet · Control de rampa y mantenimiento</span>
      <span class="leyenda">
        <span><i class="dot" style="background:${SEM_HEX.verde}"></i>&gt;7 días</span>
        <span><i class="dot" style="background:${SEM_HEX.ambar}"></i>0-7 días</span>
        <span><i class="dot" style="background:${SEM_HEX.rojo}"></i>vencida</span>
      </span>
      <span>Documento oficial</span>
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
export async function abrirPdfRampas(filas: FilaPdfRampa[] | Promise<FilaPdfRampa[]>, d: DatosPdfRampa) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Permite las ventanas emergentes para ver el PDF.');
  // Mientras se genera, la pestaña muestra el camión (no una pantalla en blanco)
  pestanaConCamion(win);
  try {
    const blob = await generarPdfRampas(await filas, d);
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

/** Dos rampas no pueden llamarse igual, sin importar mayúsculas ni espacios */
const mismoNombre = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface FilaRampaProps {
  c: CatRampa; ocupado: boolean; reducir: boolean;
  onSoltar: () => void; onRenombrar: (nombre: string) => void; onReporte: (v: boolean) => void; onEliminar: () => void;
}

/** Una rampa de la lista: solo el asa inicia el arrastre; el lápiz permite cambiar el nombre */
function FilaRampa({ c, ocupado, reducir, onSoltar, onRenombrar, onReporte, onEliminar }: FilaRampaProps) {
  const asa = useDragControls();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');

  function empezarEdicion() { setTexto(nombreDe(c)); setEditando(true); }
  function terminarEdicion(guardar: boolean) {
    setEditando(false);
    const nuevo = texto.trim();
    if (guardar && nuevo && nuevo !== nombreDe(c)) onRenombrar(nuevo);
  }

  return (
    <Reorder.Item as="li" value={c} dragListener={false} dragControls={asa} onDragEnd={onSoltar}
      whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgba(0, 0, 0, 0.18)' }}
      transition={reducir ? SIN_MOVIMIENTO : RESORTE} className="rcfg__fila">
      <button type="button" className="rcfg__asa" aria-label={`Mover ${nombreDe(c)}`} title="Arrastra para mover"
        disabled={ocupado} onPointerDown={e => asa.start(e)}>
        <GripVertical size={20} />
      </button>
      {editando ? (
        <div className="rcfg__editor">
          <TextInput autoFocus value={texto} aria-label={`Nombre de ${nombreDe(c)}`}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') terminarEdicion(true); if (e.key === 'Escape') terminarEdicion(false); }}
            onBlur={() => terminarEdicion(true)} />
        </div>
      ) : (
        <span className="rcfg__nombre">{nombreDe(c)}</span>
      )}
      <button type="button" className="rcfg__quitar" aria-label={`Cambiar nombre de ${nombreDe(c)}`} title="Cambiar nombre"
        disabled={ocupado || editando} onClick={empezarEdicion}>
        <Pencil size={18} />
      </button>
      <Switch checked={enReporte(c)} disabled={ocupado} onChange={onReporte} label="En reporte" />
      <button type="button" className="rcfg__quitar" aria-label={`Eliminar ${nombreDe(c)}`} title="Eliminar"
        disabled={ocupado} onClick={onEliminar}>
        <Trash2 size={18} />
      </button>
    </Reorder.Item>
  );
}

/** Configurador de bahías: arrastra cada rampa por su asa para cambiar el orden; nombre, alta, baja y "En reporte" (cat_rampas) */
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

  // Nombre repetido: se avisa antes de llamar al servidor (el servidor también lo rechaza)
  function nombreLibre(nombre: string, salvo?: CatRampa['id']): boolean {
    const repetido = lista.some(x => String(x.id) !== String(salvo ?? '') && mismoNombre(nombreDe(x), nombre));
    if (repetido) setError(`Ya existe una rampa llamada «${nombre.trim()}»`);
    return !repetido;
  }

  function renombrar(c: CatRampa, nombre: string) {
    if (!nombreLibre(nombre, c.id)) return;
    cambiar(c.id, { nombre_rampa: nombre.trim() });
  }

  // Al soltar la rampa se guarda el orden completo, solo si cambió
  async function guardarOrden(nuevo: CatRampa[]) {
    const antes = delServidor.map(c => String(c.id)).join(',');
    if (nuevo.map(c => String(c.id)).join(',') === antes) return;
    await accion(() => api('/cat-rampas/reorder', { method: 'PUT', body: nuevo.map((c, i) => ({ id: c.id, orden: i + 1 })) }));
  }

  async function agregar() {
    const nombre = nueva.trim();
    if (!nombre || !nombreLibre(nombre)) return;
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
        Arrastra una rampa por su asa para cambiar el orden. Cada nombre es único. Lo que apagues en "En reporte" no sale en el PDF ni en el WhatsApp.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {cat.isLoading ? <PageLoader /> : (
        <Reorder.Group as="ul" axis="y" values={lista} onReorder={setLocal} className="rcfg__lista">
          {lista.map(c => (
            <FilaRampa key={String(c.id)} c={c} ocupado={ocupado} reducir={reducir}
              onSoltar={() => guardarOrden(local ?? delServidor)}
              onRenombrar={nombre => renombrar(c, nombre)}
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
