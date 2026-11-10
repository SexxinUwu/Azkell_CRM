// PDF de la disponibilidad: lo que se ve con los filtros, en A4 horizontal, con el logo y el título de la empresa y la flota
// segmentada por estado (en ruta, en base, en mantenimiento). El HTML se arma aquí y el servidor lo convierte con Chromium (texto real).
// Se abre en otra pestaña con el visor del navegador; el mismo PDF se comparte por WhatsApp.
import { apiFetch } from '../../core/api/client';
import { pestanaConCamion } from '../../core/ui/CargaCamion';
import { compartirPDF } from '../../core/lib/pdf';
import type { VehiculoDisponibilidad } from './api';
import { estadoDeTexto, type Estado } from './disponibilidadCifras';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export interface CifrasDisponibilidad { total: number; base: number; ruta: number; mantenimiento: number }

interface UnidadPdf { placa: string; clase: 'Camión' | 'Carreta'; sub: string; estado: Estado; conductor: string; empresa: string; alquiladaA: string; acoplada: string; marca: string; capacidad: string; obs: string }

/** Una fila por placa (como cuentan las cifras de la pantalla), con la otra placa de la fila como "acoplada" */
function unidadesPdf(filas: VehiculoDisponibilidad[], estadoElegido: string): UnidadPdf[] {
  const out: UnidadPdf[] = [];
  for (const v of filas) {
    if (v.placa_camion) {
      out.push({ placa: v.placa_camion, clase: 'Camión', sub: v.sub_tipo || v.tipo_unidad || '', estado: estadoDeTexto(v.estado), conductor: v.conductor_asignado || '',
        empresa: v.empresa || v.cliente || '', alquiladaA: v.alquilada_a || '', acoplada: v.placa_carreta || '', marca: v.marca || '', capacidad: v.capacidad_tanque && v.capacidad_tanque !== '—' ? v.capacidad_tanque : '', obs: v.observaciones || '' });
    }
    if (v.placa_carreta) {
      out.push({ placa: v.placa_carreta, clase: 'Carreta', sub: v.sub_tipo_carreta || v.sub_tipo || '', estado: estadoDeTexto(v.estado_carreta || v.estado), conductor: v.placa_camion ? '' : v.conductor_asignado || '',
        empresa: v.empresa_carreta || v.empresa || '', alquiladaA: v.alquilada_a_carreta || '', acoplada: v.placa_camion || '', marca: v.marca_carreta || '', capacidad: '', obs: v.placa_camion ? '' : v.observaciones || '' });
    }
  }
  return estadoElegido === 'Todos' ? out : out.filter(u => u.estado === estadoElegido);
}

const SECCIONES: Array<{ estado: Estado; titulo: string; color: string; fondo: string }> = [
  { estado: 'En Ruta', titulo: 'En ruta', color: '#1e40af', fondo: '#dbeafe' },
  { estado: 'En Base', titulo: 'En base', color: '#065f46', fondo: '#d1fae5' },
  { estado: 'En Mantenimiento', titulo: 'En mantenimiento', color: '#92400e', fondo: '#fef3c7' },
];

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; color: #0f172a; font-size: 9px; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 297mm; padding: 9mm; }
.mono { font-family: 'JetBrains Mono', 'Liberation Mono', monospace; }
.cab { display: grid; grid-template-columns: 42mm 1fr auto; align-items: center; gap: 5mm; padding-bottom: 3mm; border-bottom: .5mm solid #0f172a; margin-bottom: 3mm; }
.cab img { max-height: 14mm; max-width: 40mm; object-fit: contain; }
.cab h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.01em; text-transform: uppercase; }
.cab p { margin: 1mm 0 0; font-size: 8px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.cab .fecha { text-align: right; font-size: 8px; color: #475569; }
.filtros { font-size: 8px; color: #475569; margin-bottom: 3mm; }
.resumen { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-bottom: 4mm; }
.resumen div { padding: 2mm 3mm; background: #f1f5f9; border-radius: 2mm; text-align: center; }
.resumen strong { display: block; font-size: 15px; font-weight: 800; }
.resumen span { font-size: 6.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
.seccion { margin-bottom: 4mm; }
.seccion > h2 { display: flex; justify-content: space-between; align-items: center; margin: 0; padding: 1.6mm 3mm; font-size: 8px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; border-radius: 2mm 2mm 0 0; }
.seccion > h2 span { font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 8px; }
th { text-align: left; padding: 1.4mm 2mm; background: #f8fafc; font-size: 6.4px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #475569; border-bottom: .2mm solid #e2e8f0; }
td { padding: 1.3mm 2mm; border-bottom: .2mm solid #e2e8f0; vertical-align: top; }
tr { break-inside: avoid; }
.alq { display: block; font-size: 6.5px; color: #64748b; font-weight: 600; }
.vacio { padding: 3mm; color: #94a3b8; font-style: italic; border: .2mm solid #e2e8f0; border-top: 0; }
.pie { margin-top: 4mm; display: flex; justify-content: space-between; padding-top: 1.6mm; border-top: .2mm solid #e2e8f0; font-size: 6px; color: #94a3b8; letter-spacing: .04em; }
`;

export function htmlDisponibilidad(unidades: UnidadPdf[], criterios: string[], empresa: string, logo: string | null): string {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const por = (e: Estado) => unidades.filter(u => u.estado === e);
  const operativas = por('En Ruta').length + por('En Base').length;
  const pct = unidades.length ? Math.round((operativas / unidades.length) * 100) : 0;
  const resumen: Array<[string, string | number]> = [
    ['Total unidades', unidades.length], ['En ruta', por('En Ruta').length], ['En base', por('En Base').length], ['En mantenimiento', por('En Mantenimiento').length], ['Flota operativa', `${pct}%`],
  ];
  const cabeceras = ['Placa', 'Tipo', 'Acoplada a', 'Conductor', 'Empresa', 'Marca', 'Capacidad', 'Observaciones'];
  const secciones = SECCIONES.map(s => {
    const lista = por(s.estado);
    if (!lista.length) return '';
    return `<section class="seccion">
      <h2 style="background:${s.fondo};color:${s.color}">${s.titulo}<span>${lista.length} ${lista.length === 1 ? 'unidad' : 'unidades'}</span></h2>
      <table><thead><tr>${cabeceras.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${lista.map(u => `<tr>
        <td class="mono"><b>${esc(u.placa)}</b></td><td>${esc(u.clase)}${u.sub && u.sub !== u.clase ? `<span class="alq">${esc(u.sub)}</span>` : ''}</td>
        <td class="mono">${esc(u.acoplada) || '—'}</td><td>${esc(u.conductor) || '—'}</td>
        <td>${esc(u.empresa) || '—'}${u.alquiladaA ? `<span class="alq">Alquilada a ${esc(u.alquiladaA)}</span>` : ''}</td>
        <td>${esc(u.marca) || '—'}</td><td>${esc(u.capacidad) || '—'}</td><td>${esc(u.obs) || '—'}</td></tr>`).join('')}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Disponibilidad de flota</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><style>${CSS}</style></head><body><div class="hoja">
  <header class="cab">
    <div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
    <div><h1>Disponibilidad de flota</h1><p>${esc(empresa || 'Todas las empresas')} · ${unidades.length} ${unidades.length === 1 ? 'unidad' : 'unidades'}</p></div>
    <div class="fecha">${esc(fecha)}<br>${esc(hora)}</div>
  </header>
  <div class="filtros"><b>Filtros:</b> ${criterios.length ? criterios.map(esc).join(' · ') : 'ninguno, toda la flota'}</div>
  <div class="resumen">${resumen.map(([e, v]) => `<div><strong>${v}</strong><span>${e}</span></div>`).join('')}</div>
  ${secciones || '<p class="vacio">No hay unidades con estos filtros.</p>'}
  <footer class="pie"><span>ERP AZKELL FLEET · DISPONIBILIDAD DE FLOTA</span><span class="mono">IMPRESO ${esc(ahora.toLocaleDateString('es-PE'))} ${esc(hora)}</span></footer>
</div></body></html>`;
}

/** Logo de la empresa como data URL (el servidor lo incrusta en el PDF); null si no hay */
async function logoComoDataUrl(): Promise<string | null> {
  try {
    const res = await apiFetch('/tenant-logo');
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((ok, mal) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => mal(l.error); l.readAsDataURL(blob); });
  } catch { return null; }
}

async function pedirPdf(filas: VehiculoDisponibilidad[], estadoElegido: string, criterios: string[], empresa: string): Promise<Blob> {
  const html = htmlDisponibilidad(unidadesPdf(filas, estadoElegido), criterios, empresa, await logoComoDataUrl());
  const res = await apiFetch('/disponibilidad-flota/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, titulo: 'Disponibilidad de flota' }) });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
  return res.blob();
}

/** Abre el PDF de la disponibilidad en otra pestaña (visor del navegador) */
export async function abrirDisponibilidadPDF(filas: VehiculoDisponibilidad[], estadoElegido: string, criterios: string[], empresa: string) {
  const ventana = window.open('', '_blank');
  pestanaConCamion(ventana);
  try {
    const url = URL.createObjectURL(await pedirPdf(filas, estadoElegido, criterios, empresa));
    if (ventana) ventana.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) { ventana?.close(); throw err; }
}

/** Comparte por WhatsApp el mismo PDF */
export async function compartirDisponibilidadPDF(filas: VehiculoDisponibilidad[], estadoElegido: string, criterios: string[], empresa: string) {
  const blob = await pedirPdf(filas, estadoElegido, criterios, empresa);
  const hoy = new Date().toLocaleDateString('sv-SE');
  return compartirPDF(blob, `Disponibilidad de flota ${hoy}.pdf`, `Disponibilidad de flota${empresa ? ` · ${empresa}` : ''} (${hoy})`);
}
