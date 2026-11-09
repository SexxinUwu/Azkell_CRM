// PDF oficial del acta "Inventario físico estado de vehículo" (F-SEG-004) y envío por WhatsApp.
// El documento es HTML + CSS que el servidor convierte con Chromium: sale como PDF de texto real (se puede seleccionar y
// buscar, nítido en cualquier zoom), no como una foto de la pantalla. Está pensado para una hoja A4; si el inventario es
// muy largo pasa a una segunda hoja sin partir ninguna categoría.
import { api, apiFetch } from '../../core/api/client';
import { compartirPDF } from '../../core/lib/pdf';
import { CargaCamion, pestanaConCamion } from '../../core/ui/CargaCamion';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONFIG_CROQUIS, normalizarConfig, svgCroquis } from './croquisEntrega';
import { cargarPlantilla, leerPartes, PLANTILLA_FABRICA, resumenActa, type Calificacion } from './ce-plantilla';
import type { CategoriaPlantilla, EntregaVehiculo } from './ce-tipos';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** dd/mm/aaaa a partir de una fecha aaaa-mm-dd (o aaaa-mm-ddThh:mm…). Vacío si no se puede leer. */
export function fechaDMA(f: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Configuración del croquis según configuracion, modelo y tipo (igual que _evObtenerConfiguracion del clásico) */
export function codigoConfiguracion(r: EntregaVehiculo): string {
  const str = `${String(r.configuracion || '')} ${String(r.modelo || '')} ${String(r.tipo || r.clase || '')}`.toUpperCase();
  if (str.includes('4X2') || str.includes('T2')) return 'T2';
  if (str.includes('T3') || str.includes('6X4') || str.includes('6X2')) return 'T3';
  if (str.includes('C3') || str.includes('VOLQUETE')) return 'C3';
  if (str.includes('C2') || str.includes('RIGIDO')) return 'C2';
  if (str.includes('S3') || str.includes('SE3') || str.includes('3 EJES')) return 'S3';
  if (str.includes('S2') || str.includes('SE2') || str.includes('2 EJES')) return 'S2';
  if (str.includes('R2') || str.includes('REMOLQUE') || str.includes('CARRETA')) return 'R2';
  return 'T3';
}

/** Nombre del archivo, igual que el clásico: "Entrega de Vehiculo - PLACA - dd-mm-aaaa.pdf" */
export function nombrePdfEntrega(r: EntregaVehiculo): string {
  const placa = (r.placa || 'UNIDAD').toUpperCase().trim();
  const p = String(r.fecha || '').slice(0, 10).split('-');
  const fecha = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
  return `Entrega de Vehiculo - ${placa} - ${fecha}.pdf`;
}

/** Estado general del acta: con alguna parte en mal estado ya no es una entrega sin novedades */
export function estadoActa(malos: number): { texto: string; conNovedades: boolean } {
  return malos > 0 ? { texto: 'Con novedades', conNovedades: true } : { texto: 'Conforme', conNovedades: false };
}

const ETIQUETA: Record<Calificacion, string> = { B: 'OK', R: 'REG', M: 'MAL' };

function logoEmpresa(): string {
  try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; }
}

/** Imagen como data URL: el servidor arma el PDF sin red, así que el logo y las firmas viajan dentro del documento */
async function aDataUrl(src: string | null | undefined): Promise<string> {
  const s = String(src || '');
  if (!s || s.startsWith('data:')) return s;
  try {
    const blob = await (await fetch(s, { mode: 'cors' })).blob();
    return await new Promise<string>((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.onerror = () => mal(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch { return s; }
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Inter', 'Liberation Sans', Arial, Helvetica, sans-serif; color: #0f172a; font-size: 8.5px; line-height: 1.25;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 210mm; min-height: 295mm; padding: 7mm 9mm 5mm; display: flex; flex-direction: column; gap: 2.4mm; }
.mono { font-family: 'JetBrains Mono', 'Liberation Mono', 'Courier New', monospace; }
.etq { font-size: 5.8px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: #64748b; }

/* Cabecera */
.cab { display: grid; grid-template-columns: 38mm 1fr 44mm; align-items: center; gap: 5mm; padding-bottom: 2.4mm; border-bottom: .5mm solid #0f172a; position: relative; }
.cab::after { content: ''; position: absolute; left: 0; bottom: -1.3mm; width: 30mm; height: .6mm; background: #10b981; border-radius: 1mm; }
.logo { display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
.logo img { max-height: 13mm; max-width: 36mm; object-fit: contain; object-position: left center; }
.logo b { font-size: 13px; font-weight: 800; letter-spacing: -.01em; }
.logo span { font-size: 5.8px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
.titulo h1 { margin: 0; font-size: 14.5px; font-weight: 800; letter-spacing: -.015em; line-height: 1.1; text-transform: uppercase; }
.titulo p { margin: 1.2mm 0 0; font-size: 7.4px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #475569; }
.meta { border: .25mm solid #cbd5e1; border-radius: 2mm; overflow: hidden; }
.meta div { display: flex; justify-content: space-between; gap: 3mm; padding: .8mm 2.5mm; }
.meta div + div { border-top: .25mm solid #e2e8f0; }
.meta span { font-size: 5.8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; align-self: center; }
.meta b { font-size: 7.6px; font-weight: 700; }

/* Tarjetas */
.tarjeta { border: .25mm solid #e2e8f0; border-radius: 2.4mm; background: #fff; overflow: hidden; }
.tarjeta > .tit { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #0f172a; color: #fff; }
.tarjeta > .tit b { font-size: 7px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.tarjeta > .tit span { font-size: 6.2px; letter-spacing: .08em; color: #7dd3fc; font-weight: 600; }

/* Datos del documento */
.doc { display: grid; grid-template-columns: repeat(6, 1fr); border: .25mm solid #e2e8f0; border-radius: 2.4mm; background: #f8fafc; }
.doc > div { padding: 1.3mm 2.6mm; min-width: 0; }
.doc > div + div { border-left: .25mm solid #e2e8f0; }
.doc .span2 { grid-column: span 2; } .doc .span3 { grid-column: span 3; }
.doc > div:nth-child(n+5) { border-top: .25mm solid #e2e8f0; } .doc > div:nth-child(5) { border-left: 0; }
.doc b { display: block; margin-top: .6mm; font-size: 8.4px; font-weight: 700; min-height: 3.4mm; border-bottom: .2mm dotted #cbd5e1; }
.estado { display: inline-block; margin-top: .7mm; padding: .5mm 2.4mm; border-radius: 99px; font-size: 7.4px; font-weight: 800; background: #d1fae5; color: #065f46; border: .25mm solid #6ee7b7; }
.estado.nov { background: #ffe4e6; color: #9f1239; border-color: #fda4af; }

/* Ficha técnica */
.ficha { display: grid; grid-template-columns: repeat(6, 1fr); }
.ficha > div { padding: 1.2mm 2.4mm; border-top: .25mm solid #e2e8f0; min-width: 0; }
.ficha > div + div { border-left: .25mm solid #e2e8f0; }
.ficha > div:nth-child(7) { border-left: 0; }
.ficha .tit-fila { border-top: 0; }
.ficha .s2 { grid-column: span 2; } .ficha .s3 { grid-column: span 3; } .ficha .s4 { grid-column: span 4; }
.ficha b { display: block; margin-top: .6mm; font-size: 8.6px; font-weight: 700; min-height: 3.4mm; border-bottom: .2mm dotted #cbd5e1; word-break: break-word; }
.ficha .placa b { font-size: 11px; font-weight: 800; color: #0369a1; letter-spacing: .04em; }
.ficha .placa { background: #f0f9ff; }
.ficha .km b { font-size: 10px; font-weight: 800; color: #047857; }
.ficha .km { background: #ecfdf5; }

/* Partes: columnas que se reparten solas sin partir una categoría */
.partes { column-count: 3; column-gap: 2.6mm; column-fill: balance; }
.cat { break-inside: avoid; page-break-inside: avoid; margin: 0 0 1.7mm; border: .25mm solid #e2e8f0; border-radius: 2mm; overflow: hidden; }
.cat h3 { margin: 0; display: flex; justify-content: space-between; align-items: center; padding: .7mm 2mm; background: #f1f5f9; border-bottom: .25mm solid #e2e8f0; font-size: 6.2px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: #1e293b; }
.cat h3 em { font-style: normal; font-weight: 700; color: #94a3b8; }
.fila { display: grid; grid-template-columns: 1fr 5mm 8.4mm; align-items: center; gap: 1mm; padding: 0 2mm; min-height: var(--fila, 3.5mm); font-size: var(--fs, 7.4px); color: #334155; }
.fila + .fila { border-top: .15mm solid #f1f5f9; }
.fila .c { text-align: center; color: #94a3b8; font-weight: 700; }
.fila .e { text-align: center; }
.pill { display: inline-block; min-width: 7mm; padding: 0 1mm; border-radius: 1mm; font-size: .86em; font-weight: 800; text-align: center; border: .2mm solid; }
.pill.B { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
.pill.R { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.pill.M { background: #ffe4e6; color: #9f1239; border-color: #fda4af; }
.vacio { padding: 3mm; text-align: center; color: #94a3b8; font-style: italic; }

/* Diagrama */
.diag { padding: 1mm 3mm 1.4mm; text-align: center; background: #f8fafc; break-inside: avoid; }
.diag svg { display: block; margin: 0 auto; width: auto !important; max-width: 100% !important; max-height: var(--alto-diag, 50mm); height: var(--alto-diag, 50mm); }
.diag-cab { display: flex; justify-content: space-between; align-items: center; padding: 1.4mm 3mm; background: #f1f5f9; border-bottom: .25mm solid #e2e8f0; }
.diag-cab b { font-size: 6.6px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #1e293b; }
.diag-cab span { font-size: 6.2px; font-weight: 800; padding: .5mm 2.4mm; border-radius: 99px; background: #d1fae5; color: #065f46; border: .25mm solid #6ee7b7; }

/* Observaciones y firmas */
.obs { padding: 1.5mm 3mm; border: .25mm solid #e2e8f0; border-radius: 2.4mm; break-inside: avoid; }
.obs p { margin: 1mm 0 0; font-size: 7.4px; font-weight: 500; line-height: 1.4; min-height: 4mm; }
.firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; break-inside: avoid; }
.firma { border: .25mm solid #e2e8f0; border-radius: 2.4mm; padding: 1.2mm 3mm 1.6mm; text-align: center; background: #f8fafc; }
.firma .lienzo { height: 10.5mm; display: flex; align-items: center; justify-content: center; }
.firma img { max-height: 10mm; max-width: 55mm; object-fit: contain; }
.firma .linea { border-top: .25mm solid #94a3b8; padding-top: 1.2mm; }
.firma .linea b { display: block; font-size: 8px; font-weight: 700; text-transform: uppercase; min-height: 3.2mm; }
.firma .linea span { font-size: 5.8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
.pie { margin-top: auto; display: flex; justify-content: space-between; gap: 4mm; padding-top: 1.6mm; border-top: .2mm solid #e2e8f0; font-size: 5.8px; color: #94a3b8; letter-spacing: .04em; }
`;

export interface ImagenesActa { logo: string; firmaEntrega: string; firmaRecibe: string }

/** HTML del acta. `grupos` es la plantilla con la que se calificó (la vigente de la empresa); `img` trae las imágenes ya como data URL. */
export function htmlActaEntrega(r: EntregaVehiculo, grupos: CategoriaPlantilla[], img: ImagenesActa = { logo: '', firmaEntrega: '', firmaRecibe: '' }): string {
  const resumen = resumenActa(leerPartes(r.inventario_partes_json), grupos);
  const config = normalizarConfig(codigoConfiguracion(r));
  const cabina = r.estilo_cabina === 'trompa' ? 'trompa' : 'chata';
  const furgon = r.estilo_carroceria !== 'plataforma';
  const km = Number(r.kilometraje) > 0 ? `${(Number(r.kilometraje) || 0).toLocaleString('es-PE')} km` : '';
  const emision = fechaDMA(r.fecha) || new Date().toLocaleDateString('es-PE');
  const ahora = new Date();
  const impreso = `${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  const estado = estadoActa(resumen.malos);

  // Densidad según el tamaño del inventario: lo ideal es una sola hoja A4; si no entra, la letra se achica hasta un límite
  // y, pasado ese límite, el resto sigue en una segunda hoja.
  const filas = resumen.total + resumen.grupos.length * 1.3;
  const [fila, fs, diag] = filas <= 88 ? ['3.7mm', '7.8px', '46mm'] : filas <= 104 ? ['3.3mm', '7.2px', '40mm'] : filas <= 120 ? ['3mm', '6.8px', '35mm'] : ['3.3mm', '7.2px', '46mm'];

  const dato = (k: string, v: unknown, clase = '', extra = '') =>
    `<div class="${clase}"><span class="etq">${k}</span><b${extra ? ` class="${extra}"` : ''}>${esc(v)}</b></div>`;

  const categoria = (g: (typeof resumen.grupos)[number]) => `
    <section class="cat"><h3><span>${esc(g.titulo)}</span><em>${g.items.length}</em></h3>
      ${g.items.map(it => `<div class="fila"><span>${esc(it.nombre)}</span><span class="c mono">${it.cantidad}</span><span class="e"><span class="pill ${it.estado}">${ETIQUETA[it.estado]}</span></span></div>`).join('')}
    </section>`;

  const firma = (src: string, nombre: string, rol: string) => `
    <div class="firma"><div class="lienzo">${src ? `<img src="${esc(src)}" alt="">` : ''}</div>
      <div class="linea"><b>${esc(nombre)}</b><span>${rol}</span></div></div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Inventario físico estado de vehículo ${esc(r.numero_inventario || r.id)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${CSS}.partes{--fila:${fila};--fs:${fs}}.diag{--alto-diag:${diag}}</style></head>
<body><div class="hoja">

  <header class="cab">
    <div class="logo">${img.logo ? `<img src="${esc(img.logo)}" alt="">` : `<b>${esc(r.empresa || '')}</b>`}<span>Transporte &amp; Logística</span></div>
    <div class="titulo"><h1>Inventario físico estado de vehículo</h1><p>Acta de entrega y recepción técnica de unidades</p></div>
    <div class="meta"><div><span>Código</span><b class="mono">F-SEG-004</b></div><div><span>Versión</span><b class="mono">01</b></div><div><span>Fecha</span><b class="mono">10/11/2025</b></div></div>
  </header>

  <section class="doc">
    ${dato('N° inventario', r.numero_inventario || r.id, 'span2', 'mono')}
    ${dato('Fecha emisión', emision, '', 'mono')}
    ${dato('Motivo', r.motivo || '', 'span2')}
    <div><span class="etq">Estado</span><br><span class="estado${estado.conNovedades ? ' nov' : ''}">${estado.texto}</span></div>
    ${dato('Entregado por', r.quien_entrega, 'span3')}
    ${dato('Recibido por', r.quien_recibe, 'span3')}
  </section>

  <section class="tarjeta">
    <div class="tit"><b>Ficha técnica y datos del vehículo</b><span>REGISTRO FLOTA</span></div>
    <div class="ficha">
      ${dato('Placa', r.placa, 'placa tit-fila', 'mono')}${dato('Clase', r.clase, 'tit-fila')}${dato('Marca', r.marca, 'tit-fila')}
      ${dato('Tipo', r.tipo, 'tit-fila')}${dato('Modelo', r.modelo, 'tit-fila')}${dato('Color', r.color, 'tit-fila')}
      ${dato('Número del motor', r.numero_motor, 's2', 'mono')}${dato('Serie / VIN', r.numero_serie, 's2', 'mono')}
      ${dato('Kilometraje actual', km, 'km', 'mono')}${dato('Cilindros', r.cilindros)}
    </div>
  </section>

  <section class="partes">
    ${resumen.grupos.length ? resumen.grupos.map(categoria).join('') : '<div class="vacio">No se calificó ninguna parte en esta acta.</div>'}
  </section>

  <section class="tarjeta">
    <div class="diag-cab"><b>Diagrama técnico del estado de la unidad</b><span>CONFIGURACIÓN: ${config} · ${esc(CONFIG_CROQUIS[config].nombre)}</span></div>
    <div class="diag">${svgCroquis(config, cabina, furgon)}</div>
  </section>

  <section class="obs"><span class="etq">Observaciones técnicas registradas</span>
    <p>${r.observaciones ? esc(String(r.observaciones).toUpperCase()) : 'LA UNIDAD VEHICULAR SE ENTREGA EN CONDICIONES OPERATIVAS Y CON SU EQUIPAMIENTO COMPLETO SEGÚN DETALLE SUPERIOR.'}</p></section>

  <section class="firmas">
    ${firma(img.firmaEntrega, r.quien_entrega, 'Entregado por · Control de flota')}
    ${firma(img.firmaRecibe, r.quien_recibe, 'Recibido por · Conductor asignado')}
  </section>

  <footer class="pie"><span>ERP AZKELL FLEET · SISTEMA DE GESTIÓN INTEGRAL DE TRANSPORTE</span><span class="mono">F-SEG-004 v01 · IMPRESO ${impreso}</span></footer>
</div></body></html>`;
}

/** Monta el HTML fuera de la vista y lo entrega para convertirlo (lo usan otros reportes de flota, como el F-MAN) */
export async function conElemento<T>(html: string, usar: (el: HTMLElement) => Promise<T>): Promise<T> {
  // html2canvas sale en blanco si el documento está en posición absoluta o fija: va en el flujo normal de la página,
  // tapado por una pantalla blanca con el camión mientras se genera.
  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.cssText = 'width:794px;background:#fff;';
  const tapa = document.createElement('div');
  tapa.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#fff;display:flex;align-items:center;justify-content:center;font:600 14px system-ui,sans-serif;color:#64748b;';
  tapa.innerHTML = renderToStaticMarkup(createElement(CargaCamion, { texto: 'Generando PDF…' }));
  document.body.append(el, tapa);
  try {
    await Promise.all(Array.from(el.querySelectorAll('img')).map(img => img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; })));
    await document.fonts?.ready;
    await new Promise(r => setTimeout(r, 120));
    // Una sola hoja A4 (297 mm = 1122 px a 96 dpi): si es más alto, se reduce en proporción
    const altoA4 = 1122;
    const alto = el.offsetHeight;
    if (alto > altoA4) {
      el.style.transformOrigin = 'top left';
      el.style.transform = `scale(${altoA4 / alto})`;
    }
    return await usar(el);
  } finally {
    el.remove();
    tapa.remove();
  }
}

/** PDF del acta con el servidor (Chromium). Las partes se califican con la plantilla vigente; si no responde, la de fábrica. */
export async function generarPdfEntrega(r: EntregaVehiculo): Promise<Blob> {
  const grupos = (await cargarPlantilla()) ?? PLANTILLA_FABRICA;
  const [logo, firmaEntrega, firmaRecibe] = await Promise.all([aDataUrl(logoEmpresa()), aDataUrl(r.firma_entrega), aDataUrl(r.firma_recibe)]);
  const html = htmlActaEntrega(r, grupos, { logo, firmaEntrega, firmaRecibe });
  const res = await apiFetch('/seguridad/entrega-vehiculos/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, titulo: `Inventario físico estado de vehículo ${r.numero_inventario || r.id} ${r.placa || ''}`.trim() }),
  });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
  return res.blob();
}

/** Abre el PDF del acta en una pestaña nueva (no lo descarga). La pestaña se abre antes de generarlo para que el navegador no la bloquee. */
export async function abrirPdfEntrega(r: EntregaVehiculo): Promise<void> {
  const ventana = window.open('', '_blank');
  pestanaConCamion(ventana);
  try {
    const blob = await generarPdfEntrega(r);
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    ventana?.close();
    throw err;
  }
}

/** Genera el PDF y lo comparte por WhatsApp (hoja de compartir del sistema o app de WhatsApp), como el clásico */
export async function compartirEntregaWhatsApp(r: EntregaVehiculo): Promise<void> {
  const blob = await generarPdfEntrega(r);
  await compartirPDF(blob, nombrePdfEntrega(r), `Entrega de vehículo ${r.placa}`);
}

/** El acta completa por su id (el listado no trae firmas ni todos los campos) */
async function cargarActa(id: string | number): Promise<EntregaVehiculo> {
  const r = await api<{ data?: EntregaVehiculo }>(`/seguridad/entrega-vehiculos/${encodeURIComponent(String(id))}`);
  if (!r.data) throw new Error('No se encontró el acta');
  return r.data;
}

/** Abre el PDF de un acta guardada por su id (lo usa Documentos de flota). La pestaña se abre antes de pedir los datos. */
export async function abrirPdfEntregaPorId(id: string | number): Promise<void> {
  const ventana = window.open('', '_blank');
  pestanaConCamion(ventana);
  try {
    const blob = await generarPdfEntrega(await cargarActa(id));
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    ventana?.close();
    throw err;
  }
}

/** Envía por WhatsApp el PDF de un acta guardada por su id */
export async function compartirEntregaPorId(id: string | number): Promise<void> {
  await compartirEntregaWhatsApp(await cargarActa(id));
}
