// Requerimiento de llantas para reposición: una llanta entra cuando su remanente es MENOR O IGUAL al umbral elegido
// (por defecto 3 mm, igual que el clásico). El semáforo global (crítica < 3 mm) no cambia: esto es solo el pedido de compra.
import { exportarExcel, exportarExcelHojas } from '../../core/lib/excel';
import { generarPDFBlob } from '../../core/lib/pdf';
import { api } from '../../core/api/client';
import { esRequerimientoMm } from './neumaticosSemaforo';

export const CLAVE_MM_REQUERIMIENTO = 'fleet_neu_mm_requerimiento';
export const MM_REQ_DEFECTO = 3;
export const MM_REQ_MIN = 1;
export const MM_REQ_MAX = 10;

/** Fila por llanta que devuelve GET /neumaticos/ultimas (última inspección de cada placa) */
export interface LlantaUltima {
  placa?: string | null; posicion?: string | number | null; marca?: string | null; medida?: string | null; modelo?: string | null;
  r1?: number | string | null; r2?: number | string | null; r3?: number | string | null; r4?: number | string | null;
  remanente_promedio?: number | string | null;
  dueno?: string | null; tipo_unidad?: string | null; motora?: string | null; fecha_inspeccion?: string | null;
  marca_unidad?: string | null; presion_actual?: number | string | null; presion_ant?: number | string | null;
  estado?: string | null; observaciones?: string | null; alerta_cambio?: number | string | null; km?: number | null;
}

export function normalizarUmbral(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < MM_REQ_MIN || n > MM_REQ_MAX) return null;
  return Math.round(n * 2) / 2; // pasos de 0.5
}

export function leerUmbral(): number {
  try { return normalizarUmbral(localStorage.getItem(CLAVE_MM_REQUERIMIENTO)) ?? MM_REQ_DEFECTO; } catch { return MM_REQ_DEFECTO; }
}
export function guardarUmbral(n: number) {
  try { localStorage.setItem(CLAVE_MM_REQUERIMIENTO, String(n)); } catch { /* sin almacenamiento: no se recuerda */ }
}

/** Excel de "Últimas inspecciones": una fila por llanta, agrupadas por placa en el mismo orden que se ve en pantalla */
export async function exportarUltimasExcel(llantas: LlantaUltima[]) {
  const porPlaca = new Map<string, LlantaUltima[]>();
  for (const l of llantas) {
    const k = String(l.placa ?? 'SIN_PLACA').toUpperCase().trim();
    porPlaca.set(k, [...(porPlaca.get(k) ?? []), l]);
  }
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const txt = (v: unknown) => (v == null ? '' : String(v));
  const filas = [...porPlaca.values()].flat().map(l => [
    txt(l.placa).toUpperCase(), txt(l.dueno), txt(l.tipo_unidad), txt(l.marca_unidad), txt(l.fecha_inspeccion).split('T')[0],
    txt(l.posicion), tipoLlanta(l), txt(l.marca), txt(l.medida), txt(l.modelo),
    num(l.r1), num(l.r2), num(l.r3), num(l.r4), num(l.remanente_promedio),
    num(l.presion_ant), num(l.presion_actual), txt(l.estado), txt(l.observaciones),
  ]);
  const hoy = new Date().toISOString().split('T')[0];
  await exportarExcel('Ultimas-inspecciones-neumaticos-' + hoy, 'Últimas inspecciones',
    ['Placa', 'Empresa', 'Tipo de unidad', 'Marca unidad', 'Fecha inspección', 'Posición', 'Tipo de llanta', 'Marca', 'Medida', 'Modelo',
      'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'R4 (mm)', 'Remanente promedio (mm)', 'Presión ant.', 'Presión actual', 'Estado', 'Observaciones'],
    filas);
}

export const textoUmbral = (n: number) => `≤ ${n.toLocaleString('es-PE')} mm`;

const aNum = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Remanente de la llanta: el promedio guardado por el servidor (remanente_promedio) y, si falta, el mismo promedio
 * que calcula la importación: R1..R3, o R1..R4 cuando hay R4. Sin ninguna medición devuelve null (no entra).
 */
export function remanenteLlanta(l: LlantaUltima): number | null {
  // Sin decimales: 2,9 cuenta como 3 (redondeo al entero más cercano)
  const guardado = aNum(l.remanente_promedio);
  if (guardado !== null) return Math.round(guardado);
  const r = [aNum(l.r1), aNum(l.r2), aNum(l.r3)];
  const r4 = aNum(l.r4);
  if (r4 !== null && r4 > 0) r.push(r4);
  const med = r.filter((x): x is number => x !== null);
  return med.length ? Math.round(med.reduce((a, b) => a + b, 0) / med.length) : null;
}

export const entraEnRequerimiento = (l: LlantaUltima, umbral: number): boolean => {
  const mm = remanenteLlanta(l);
  return mm !== null && esRequerimientoMm(mm, umbral);
};

export function esMotora(l: LlantaUltima): boolean {
  const m = String(l.motora ?? '').toUpperCase().trim();
  const tipo = String(l.tipo_unidad ?? '').toLowerCase();
  return m === 'SI' || m === '1' || m === 'MOTORA' || tipo.includes('tracto') || tipo.includes('camion');
}

export interface FilaResumen { medida: string; del: number; trac: number; arr: number; rep: number; total: number }

/** Consolida por medida igual que el clásico: R = repuesto; motora 1-2 = delantera, resto tracción; no motora = arrastre */
/** Tipo de llanta según su posición: Repuesto (R); en motora, 1-2 delanteras y el resto tracción; en no motora, arrastre */
export type TipoLlanta = 'Delantera' | 'Tracción' | 'Arrastre' | 'Repuesto';
export function tipoLlanta(l: LlantaUltima): TipoLlanta {
  const pos = String(l.posicion ?? '').trim().toUpperCase();
  if (pos === 'R') return 'Repuesto';
  if (!esMotora(l)) return 'Arrastre';
  return pos === '1' || pos === '2' ? 'Delantera' : 'Tracción';
}

export function consolidarPorMedida(llantas: LlantaUltima[]): FilaResumen[] {
  const mapa = new Map<string, FilaResumen>();
  for (const l of llantas) {
    const medida = (l.medida || 'SIN ESPECIFICAR').toUpperCase().trim();
    const f = mapa.get(medida) ?? { medida, del: 0, trac: 0, arr: 0, rep: 0, total: 0 };
    const pos = String(l.posicion ?? '').trim().toUpperCase();
    if (pos === 'R') f.rep++;
    else if (esMotora(l)) { if (pos === '1' || pos === '2') f.del++; else f.trac++; }
    else f.arr++;
    f.total++;
    mapa.set(medida, f);
  }
  return [...mapa.values()];
}

export function totalesResumen(filas: FilaResumen[]): FilaResumen {
  return filas.reduce((t, f) => ({ medida: 'TOTAL GENERAL A COMPRAR', del: t.del + f.del, trac: t.trac + f.trac, arr: t.arr + f.arr, rep: t.rep + f.rep, total: t.total + f.total }),
    { medida: 'TOTAL GENERAL A COMPRAR', del: 0, trac: 0, arr: 0, rep: 0, total: 0 });
}

/** Texto del pedido para pegar en WhatsApp (mismo formato del clásico, con el umbral) */
export function textoPedido(filas: FilaResumen[], umbral: number): string {
  let t = `📋 *REQUERIMIENTO DE NEUMÁTICOS PARA COMPRAS (${textoUmbral(umbral)})* — ERP Azkell Fleet\n📅 *Fecha:* ${new Date().toLocaleDateString('es-PE')}\n\n`;
  for (const f of filas) {
    t += `📌 *MEDIDA: ${f.medida}*\n`;
    if (f.del > 0) t += `  - Delanteras (Motora 1-2): ${f.del}\n`;
    if (f.trac > 0) t += `  - Tracción (Posterior Motora): ${f.trac}\n`;
    if (f.arr > 0) t += `  - Arrastre (Carretas/Remolque): ${f.arr}\n`;
    if (f.rep > 0) t += `  - Repuestos: ${f.rep}\n`;
    t += `  👉 *TOTAL MEDIDA:* ${f.total} llantas\n\n`;
  }
  return `${t}🔴 *TOTAL GENERAL A ADQUIRIR:* ${totalesResumen(filas).total} llantas\n`;
}

const ENCABEZADOS = ['Medida llanta', 'Delanteras', 'Tracción', 'Arrastre', 'Repuestos', 'Total reposición'];

export async function exportarResumenExcel(filas: FilaResumen[], umbral: number, llantas: LlantaUltima[] = []) {
  const t = totalesResumen(filas);
  const u = textoUmbral(umbral);
  const detalle = llantas.map(l => [
    String(l.placa ?? '').toUpperCase(), String(l.dueno ?? ''), String(l.tipo_unidad ?? ''),
    String(l.posicion ?? ''), tipoLlanta(l), String(l.medida ?? ''), String(l.marca ?? ''), String(l.modelo ?? ''),
    aNum(l.r1), aNum(l.r2), aNum(l.r3), aNum(l.r4), remanenteLlanta(l), String(l.estado ?? ''),
  ]);
  await exportarExcelHojas(`Reposicion-neumaticos-${u.replace(/\s/g, '')}`, [
    { hoja: 'Resumen', encabezados: ENCABEZADOS, filas: [
      ...filas.map(f => [f.medida, f.del, f.trac, f.arr, f.rep, f.total]),
      ['TOTAL', t.del, t.trac, t.arr, t.rep, t.total],
    ] },
    { hoja: 'Detalle por placa', encabezados: ['Placa', 'Empresa', 'Tipo de unidad', 'Posición', 'Tipo de llanta', 'Medida', 'Marca', 'Modelo', 'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'R4 (mm)', 'Remanente (mm)', 'Estado'], filas: detalle },
  ]);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function htmlResumenPdf(filas: FilaResumen[], umbral: number, empresa: string): string {
  const t = totalesResumen(filas);
  const th = (txt: string, bg: string, fg: string, izq = false) =>
    `<th style="padding:8px 10px;border:1px solid #e2e8f0;background:${bg};color:${fg};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;text-align:${izq ? 'left' : 'center'}">${txt}</th>`;
  const num = (n: number, color = '#1e293b') => `<td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${n > 0 ? color : '#94a3b8'}">${n}</td>`;
  const cuerpo = filas.map(f => `<tr>
      <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-family:Courier New,monospace;text-align:left">${esc(f.medida)}</td>
      ${num(f.del, '#0284c7')}${num(f.trac)}${num(f.arr)}${num(f.rep)}
      <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:14px;color:#dc2626">${f.total}</td></tr>`).join('');
  const celdaTot = (n: number, rojo = false) => `<td style="padding:9px 10px;border:1px solid #1e293b;text-align:center;font-weight:800;background:${rojo ? '#ff3b30' : '#1e293b'};color:#fff;font-size:${rojo ? 15 : 13}px">${n}</td>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:18px;width:1040px;background:#fff">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e293b;padding-bottom:10px">
      <img src="/api/tenant-logo" alt="" style="height:54px" crossorigin="anonymous" />
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700">${esc(empresa.toUpperCase())}</div>
        <div style="font-size:20px;font-weight:800">Resumen Consolidado para Compras / Reposición</div>
        <div style="font-size:11px;color:#475569">Llantas con remanente ${esc(textoUmbral(umbral))} · ${t.total} llanta${t.total === 1 ? '' : 's'} requerida${t.total === 1 ? '' : 's'}</div>
      </div>
      <div style="font-size:11px;text-align:right">Fecha: <b>${esc(new Date().toLocaleDateString('es-PE'))}</b></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px">
      <thead><tr>${th('Medida llanta', '#1e293b', '#fff', true)}${th('Delanteras', '#e0f2fe', '#0284c7')}${th('Tracción', '#fef3c7', '#b45309')}${th('Arrastre', '#dcfce7', '#15803d')}${th('Repuestos', '#f3e8ff', '#6b21a8')}${th('Total reposición', '#ffe4e6', '#be123c')}</tr></thead>
      <tbody>${cuerpo}
        <tr><td style="padding:9px 12px;border:1px solid #1e293b;background:#1e293b;color:#fff;font-weight:800;text-align:left">TOTAL GENERAL A COMPRAR</td>${celdaTot(t.del)}${celdaTot(t.trac)}${celdaTot(t.arr)}${celdaTot(t.rep)}${celdaTot(t.total, true)}</tr>
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:9px;color:#64748b">Sistema ERP Azkell Fleet · Entran las llantas de la última inspección de cada unidad con remanente ${esc(textoUmbral(umbral))}.</div>
  </div>`;
}

async function nombreEmpresaPdf(): Promise<string> {
  try {
    const r = await api<{ valor: string | null }>('/configuracion-clave/empresa_nombre');
    if (r.valor) return r.valor;
  } catch { /* se usa el subdominio */ }
  return window.location.hostname.split('.')[0] || 'Azkell';
}

/** Genera el PDF A4 horizontal y lo abre en una pestaña nueva (o lo deja listo para descargar si el navegador bloquea la ventana) */
export async function abrirResumenPdf(filas: FilaResumen[], umbral: number) {
  const win = window.open('', '_blank');
  // La pestaña ya muestra un aviso mientras se genera el PDF (no parece colgada)
  try { win?.document.write('<!doctype html><meta charset="utf-8"><title>Generando PDF…</title><body style="margin:0;height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#475569">Generando PDF…</body>'); win?.document.close(); } catch { /* sin acceso a la pestaña */ }
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:-9999px;top:0;background:#fff;width:1040px;';
  try {
    el.innerHTML = htmlResumenPdf(filas, umbral, await nombreEmpresaPdf());
    document.body.appendChild(el);
    // Se captura el documento interior, no el contenedor: html2pdf copia los estilos del elemento y el left:-9999px
    // del contenedor dejaba la hoja en blanco (el clásico hace lo mismo con firstElementChild)
    const hoja = el.firstElementChild as HTMLElement;
    const blob = await generarPDFBlob(hoja, { orientacion: 'landscape', margen: [8, 8, 8, 8], escala: 3 });
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `Reposicion-neumaticos-${textoUmbral(umbral).replace(/\s/g, '')}.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    win?.close();
    throw err;
  } finally {
    el.remove();
  }
}
