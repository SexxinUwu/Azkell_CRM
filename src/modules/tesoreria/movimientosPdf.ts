import { descargarArchivo, generarPDFBlob } from '../../core/lib/pdf';
import { formatFechaPe } from '../../core/lib/format';
import type { MovimientoTesoreria } from './api';
import { esDolar, limpio, num } from './mov-utilidades';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monto = (n: number, moneda?: string | null) => `${esDolar(moneda) ? 'US$' : 'S/'} ${fmt(n)}`;

export interface FiltrosPdf { periodo: string; estado: string; tipo: string; banco: string; busqueda: string; empresa: string }

// Columnas: [título, ancho en px, alineación]
const COLS: Array<[string, number, 'left' | 'right' | 'center']> = [
  ['N°', 24, 'center'], ['Fecha', 56, 'center'], ['Folio / OC', 62, 'left'], ['Beneficiario', 160, 'left'], ['Motivo', 115, 'left'],
  ['Descripción', 220, 'left'], ['Banco', 44, 'left'], ['N° oper.', 56, 'left'], ['N° factura', 78, 'left'],
  ['Debe (ingreso)', 66, 'right'], ['Haber (egreso)', 66, 'right'], ['Estado', 56, 'center'],
];
const ANCHO = COLS.reduce((a, c) => a + c[1], 0);
const FILAS_PRIMERA = 36;
const FILAS_RESTO = 43;

function celda(txt: string, i: number, extra = '') {
  const [, w, al] = COLS[i];
  return `<td style="width:${w}px;max-width:${w}px;padding:2px 3px;border-bottom:1px solid #e2e8f0;text-align:${al};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${extra}">${esc(txt)}</td>`;
}

// "BCP (BANCO DE CRÉDITO DEL PERÚ) …" → "BCP"; las cajas quedan como "CAJA"
const bancoCorto = (v: unknown) => limpio(v).split(/[\s(]/)[0];

function filaHtml(m: MovimientoTesoreria, n: number): string {
  const ing = m.tipo_movimiento === 'INGRESO';
  const anulado = m.estado === 'ANULADO';
  const imp = monto(num(m.monto), m.moneda);
  return `<tr style="${anulado ? 'color:#94a3b8;text-decoration:line-through' : ''}">
    ${celda(String(n), 0)}${celda(formatFechaPe(m.fecha_valuta || m.fecha), 1)}${celda(limpio(m.codigo_oc || m.caja_folio), 2)}
    ${celda(limpio(m.beneficiario), 3)}${celda(limpio(m.motivo), 4)}${celda(limpio(m.descripcion), 5)}${celda(bancoCorto(m.banco_cuenta), 6)}
    ${celda(limpio(m.numero_operacion), 7)}${celda(limpio(m.numero_factura), 8)}
    ${celda(ing ? imp : '', 9, 'font-weight:700;color:#15803d')}${celda(ing ? '' : imp, 10, 'font-weight:700;color:#b91c1c')}${celda(limpio(m.estado), 11)}
  </tr>`;
}

const cabecera = `<thead><tr>${COLS.map(([t, w, al]) =>
  `<th style="width:${w}px;padding:3px 4px;background:#1e293b;color:#fff;font-size:8px;font-weight:800;text-transform:uppercase;text-align:${al};white-space:nowrap">${t}</th>`).join('')}</tr></thead>`;

function tabla(filas: string): string {
  return `<table style="width:${ANCHO}px;table-layout:fixed;border-collapse:collapse;font-size:8px;line-height:1.25">${cabecera}<tbody>${filas}</tbody></table>`;
}

function html(lista: MovimientoTesoreria[], f: FiltrosPdf): string {
  const t = { ingSol: 0, egSol: 0, ingUsd: 0, egUsd: 0 };
  for (const m of lista) {
    if (m.estado === 'ANULADO') continue;
    const ing = m.tipo_movimiento === 'INGRESO';
    if (esDolar(m.moneda)) { if (ing) t.ingUsd += num(m.monto); else t.egUsd += num(m.monto); }
    else if (ing) t.ingSol += num(m.monto); else t.egSol += num(m.monto);
  }
  const hayUsd = t.ingUsd > 0 || t.egUsd > 0;
  const filtros = [`Período: ${f.periodo}`, `Estado: ${f.estado || 'todos'}`, f.tipo && `Tipo: ${f.tipo}`, f.banco && `Banco: ${f.banco}`, f.busqueda && `Búsqueda: “${f.busqueda}”`]
    .filter(Boolean).join(' · ');
  const kpi = (et: string, sol: number, usd: number, rojo = false) =>
    `<div style="border:1px solid #cbd5e1;border-radius:6px;padding:4px 10px;min-width:100px"><div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase">${et}</div>
     <div style="font-size:11px;font-weight:800;color:${rojo && sol < 0 ? '#b91c1c' : '#0f172a'}">S/ ${fmt(sol)}</div>${hayUsd ? `<div style="font-size:9px;color:#475569">US$ ${fmt(usd)}</div>` : ''}</div>`;

  const trozos: string[] = [];
  let i = 0;
  trozos.push(lista.slice(0, FILAS_PRIMERA).map((m, k) => filaHtml(m, k + 1)).join(''));
  i = FILAS_PRIMERA;
  while (i < lista.length) { const j = i; trozos.push(lista.slice(i, i + FILAS_RESTO).map((m, k) => filaHtml(m, j + k + 1)).join('')); i += FILAS_RESTO; }

  const paginas = trozos.map((filas, p) => (p === 0 ? '' : '<div class="html2pdf__page-break"></div>') + tabla(filas)).join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;width:${ANCHO}px;background:#fff;padding:0">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #1e293b;padding-bottom:6px;margin-bottom:6px">
      <img src="/api/tenant-logo" alt="" style="height:30px" crossorigin="anonymous" />
      <div style="flex:1">
        <div style="font-size:9px;font-weight:700">${esc(f.empresa.toUpperCase())}</div>
        <div style="font-size:14px;font-weight:800">Movimientos de Tesorería</div>
        <div style="font-size:9px;color:#475569">${esc(filtros)} · ${lista.length} registro${lista.length === 1 ? '' : 's'}</div>
      </div>
      <div style="display:flex;gap:6px">${kpi('Ingresos', t.ingSol, t.ingUsd)}${kpi('Egresos', t.egSol, t.egUsd)}${kpi('Balance neto', t.ingSol - t.egSol, t.ingUsd - t.egUsd, true)}</div>
    </div>
    ${paginas}
    <div style="margin-top:6px;font-size:8px;color:#64748b">Generado el ${esc(new Date().toLocaleString('es-PE'))} · Lo anulado no suma en los totales · Azkell Fleet</div>
  </div>`;
}

export async function descargarMovimientosPdf(lista: MovimientoTesoreria[], f: FiltrosPdf): Promise<void> {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:-9999px;top:0;background:#fff;width:${ANCHO}px;`;
  try {
    el.innerHTML = html(lista, f);
    document.body.appendChild(el);
    const hoja = el.firstElementChild as HTMLElement;
    const blob = await generarPDFBlob(hoja, { orientacion: 'landscape', margen: [6, 6, 6, 6], escala: 2.5, paginado: true, titulo: 'Movimientos de tesorería' });
    descargarArchivo(blob, `Movimientos-Tesoreria-${new Date().toLocaleDateString('en-CA')}.pdf`);
  } finally {
    el.remove();
  }
}
