// Reporte de mantenimientos preventivos (F-MAN-006): el mismo formato que el clásico, convertido a PDF con Chromium.
// Una sola plantilla para la pantalla nueva y el clásico. Recibe las filas de mantenimiento ya leídas por el cliente
// (una por placa y tipo) y decide aquí qué entra al reporte: vencidos y próximos a vencer, agrupados por placa.

const ESTADO = { VENCIDO: 'VENCIDO', PROXIMO: 'PROXIMO' };

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numero = (v) => Number(v || 0).toLocaleString('es-PE');
const mayus = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/**
 * Tipo de mantenimiento para mostrar: mayúscula al inicio y el resto en minúscula ("Faja de alternador").
 * Las siglas con número, como MP1, se quedan en mayúscula. Los datos se guardan igual que antes (en mayúscula).
 */
function tipoOracion(t) {
  const s = String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s+,/g, ',');
  if (!s) return '';
  return s.split(' ').map(p => (/^[a-z]{1,3}\d+$/.test(p) ? p.toUpperCase() : p)).join(' ').replace(/^(.)/, c => c.toUpperCase());
}

/** Rango de la UTS para ordenar: Nacional primero, Local después, el resto al final (igual que el clásico) */
function rangoUts(uts) {
  const u = mayus(uts);
  return u === 'NACIONAL' ? 1 : u === 'LOCAL' ? 2 : 3;
}

/** Una fila del reporte por cada tipo de mantenimiento vencido o próximo; sin tipo vigente no entra */
function filasDelReporte(filas) {
  const porPlaca = new Map();
  for (const f of filas) {
    const kmGps = Number(f.kmGps) || 0;
    const kmCambio = Number(f.kmCambio) || 0;
    const frecuencia = Number(f.frecuencia) || 0;
    let kmProx = Number(f.kmProx) || 0;
    if (!kmProx && frecuencia > 0 && kmCambio > 0) kmProx = kmCambio + frecuencia;
    if (!kmProx) continue;
    const kmRestante = kmGps > 0 ? kmProx - kmGps : kmProx - kmCambio;
    const umbral = Number(f.umbral) || 1000;
    let estado;
    if (kmRestante <= 0) estado = ESTADO.VENCIDO;
    else if (kmRestante <= umbral) estado = ESTADO.PROXIMO;
    else continue;

    const placa = String(f.placa || '-').trim().toUpperCase();
    if (!porPlaca.has(placa)) {
      porPlaca.set(placa, {
        placa,
        clase: f.clase || 'CAMIÓN',
        marca: f.marca || '-',
        cliente: f.cliente || '-',
        uts: f.uts || '-',
        ultimoCambio: f.ultimoCambio || 'Plan Inicial',
        esHoras: !!f.esHoras,
        ubicacion: f.ubicacion || 'En Ruta',
        kmGps,
        mantenimientos: [],
      });
    }
    porPlaca.get(placa).mantenimientos.push({
      tipo: f.tipo || '-', fecha: f.fecha || 'Plan inicial', kmCambio, kmGps, kmProx, kmRestante, estado, obs: f.obs || '',
    });
  }
  return [...porPlaca.values()];
}

/** Ordena cada placa (vencidos primero) y calcula su estado global y su mantenimiento más crítico */
function unidadesOrdenadas(unidades) {
  for (const u of unidades) {
    u.mantenimientos.sort((a, b) => {
      if (a.estado === ESTADO.VENCIDO && b.estado !== ESTADO.VENCIDO) return -1;
      if (a.estado !== ESTADO.VENCIDO && b.estado === ESTADO.VENCIDO) return 1;
      return a.kmRestante - b.kmRestante;
    });
    u.estadoGlobal = u.mantenimientos.some(m => m.estado === ESTADO.VENCIDO) ? ESTADO.VENCIDO : ESTADO.PROXIMO;
    u.masCritico = u.mantenimientos[0];
  }
  return unidades.sort((a, b) => {
    const r = rangoUts(a.uts) - rangoUts(b.uts);
    if (r) return r;
    const e = (a.estadoGlobal === ESTADO.VENCIDO ? 1 : 2) - (b.estadoGlobal === ESTADO.VENCIDO ? 1 : 2);
    if (e) return e;
    return a.masCritico.kmRestante - b.masCritico.kmRestante;
  });
}

function filaHtml(u, indice) {
  const unidad = u.esHoras ? ' h' : ' km';
  const vencido = u.estadoGlobal === ESTADO.VENCIDO;
  const color = vencido ? '#dc2626' : '#d97706';
  const fondo = vencido ? '#fef2f2' : '#fffbeb';
  const badge = vencido ? 'VENCIDO' : 'PRÓXIMO';
  const falta = u.masCritico.kmRestante;
  const utsColor = rangoUts(u.uts) === 1 ? '#1e40af' : rangoUts(u.uts) === 2 ? '#0f766e' : '#475569';
  const obs = u.mantenimientos.map(m => `<div class="tipo"><span class="punto">•</span> ${esc(tipoOracion(m.tipo))}</div>`).join('');
  return `
  <tr style="background:${indice % 2 === 0 ? '#f8fafc' : '#ffffff'};">
    <td class="c"><span class="placa">${esc(u.placa)}</span></td>
    <td class="c clase">${esc(u.clase)}</td>
    <td class="c marca">${esc(u.marca)}</td>
    <td class="c fecha">${esc(u.ultimoCambio)}</td>
    <td class="c"><span class="badge" style="background:${color};">${badge}</span></td>
    <td class="obs">${obs}</td>
    <td class="r km">${numero(u.kmGps)}${unidad}</td>
    <td class="c"><span class="falta" style="color:${color}; background:${fondo}; border:1px solid ${color}40;">${falta <= 0 ? '' : '+'}${numero(falta)}${unidad}</span></td>
    <td class="r km">${numero(u.masCritico.kmProx)}${unidad}</td>
    <td class="c uts" style="color:${utsColor};">${esc(u.uts)}</td>
    <td class="ubi" title="${esc(u.ubicacion)}">${esc(u.ubicacion)}</td>
  </tr>`;
}

const ESTILO = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: 'Montserrat', 'Inter', sans-serif; color: #0f172a; }
  .page { padding: 9mm 10mm 7mm; border: 1.5px solid #0f172a; border-radius: 4px; min-height: 186mm; display: flex; flex-direction: column; justify-content: space-between; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #0f172a; padding-bottom: 5px; margin-bottom: 6px; }
  .h-izq { display: flex; align-items: center; gap: 10px; width: 27%; }
  .logo { height: 40px; max-width: 130px; object-fit: contain; }
  .empresa { font-size: 10px; font-weight: 900; text-transform: uppercase; line-height: 1.15; }
  .h-centro { text-align: center; flex: 1; }
  .titulo { font-size: 14px; font-weight: 900; letter-spacing: .04em; margin: 0; text-transform: uppercase; }
  .subtitulo { font-size: 8px; font-weight: 800; color: #0284c7; margin-top: 2px; letter-spacing: .03em; text-transform: uppercase; }
  .h-der { border: 1.2px solid #0f172a; padding: 4px 7px; font-size: 8px; font-weight: 900; text-align: right; line-height: 1.35; width: 21%; background: #f8fafc; border-radius: 3px; }
  .kpis { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; background: #f8fafc; border: 1.2px solid #0f172a; border-radius: 3px; padding: 5px 10px; margin-bottom: 7px; font-size: 8px; }
  .kpi { display: flex; align-items: center; gap: 5px; font-weight: 700; }
  .kpi-val { font-weight: 900; font-size: 9.5px; }
  table.tabla { width: 100%; border-collapse: collapse; font-size: 8px; border: 1.2px solid #0f172a; table-layout: fixed; }
  table.tabla th { background: #0f2b5c; color: #fff; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .02em; padding: 5px 4px; border: 1px solid #0f2b5c; text-align: center; }
  table.tabla td { border: 1px solid #cbd5e1; vertical-align: middle; padding: 4px 5px; }
  td.c { text-align: center; } td.r { text-align: right; } td.obs { text-align: left; }
  .placa { background: #0f172a; color: #fff; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-weight: 900; font-size: 8.5px; }
  .clase, .marca, .uts { font-weight: 800; font-size: 7.8px; text-transform: uppercase; }
  .clase { color: #334155; } .marca { color: #0369a1; }
  .fecha { font-weight: 700; color: #475569; font-size: 7.8px; }
  .badge { display: inline-block; color: #fff; font-size: 7.5px; font-weight: 900; padding: 2px 6px; border-radius: 3px; letter-spacing: .3px; }
  .tipo { margin: 1px 0; line-height: 1.25; font-size: 8px; color: #0f172a; font-weight: 700; }
  .punto { color: #0284c7; font-weight: 900; }
  .km { font-weight: 800; font-family: monospace; font-size: 8.5px; }
  .falta { display: inline-block; font-weight: 900; font-size: 8.5px; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  .ubi { font-size: 7.4px; font-weight: 600; color: #334155; line-height: 1.2; }
  .pie { display: flex; align-items: center; justify-content: space-between; border-top: 1.2px solid #0f172a; padding-top: 4px; margin-top: 6px; font-size: 7.5px; color: #475569; font-weight: 700; }
  tr { page-break-inside: avoid; }
`;

/**
 * HTML del reporte F-MAN-006.
 * @param {object} datos  { filas, empresa, logo (data URL o null), emisor, ahora (Date) }
 */
function htmlReporteFleetrun(datos) {
  const unidades = unidadesOrdenadas(filasDelReporte(datos.filas || []));
  const vencidas = unidades.filter(u => u.estadoGlobal === ESTADO.VENCIDO).length;
  const proximas = unidades.length - vencidas;
  const ahora = datos.ahora || new Date();
  const fmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const partes = Object.fromEntries(fmt.formatToParts(ahora).map(p => [p.type, p.value]));
  const emision = `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
  const fechaCorta = `${partes.day}/${partes.month}/${partes.year}`;
  const filas = unidades.map((u, i) => filaHtml(u, i + 1)).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Estatus de Mantenimientos Preventivos - F-MAN-006</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${ESTILO}</style>
</head>
<body>
<div class="page">
  <div>
    <div class="header">
      <div class="h-izq">
        ${datos.logo ? `<img src="${esc(datos.logo)}" alt="" class="logo">` : ''}
        <span class="empresa">${esc(datos.empresa || '')}</span>
      </div>
      <div class="h-centro">
        <h1 class="titulo">Estatus de mantenimientos preventivos</h1>
        <div class="subtitulo">Control de alertas, vencimientos y frecuencias de flota</div>
      </div>
      <div class="h-der">
        <div>CÓDIGO: F-MAN-006</div>
        <div>VERSIÓN: 01</div>
        <div>F. EMISIÓN: ${fechaCorta}</div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>EMISIÓN:</span><strong>${emision}</strong></div>
      <div class="kpi"><span>EMITIDO POR:</span><strong>${esc(datos.emisor || '')}</strong></div>
      <div class="kpi"><span>TOTAL UNIDADES EN ALERTA:</span><span class="kpi-val">${unidades.length}</span></div>
      <div class="kpi"><span>UNIDADES VENCIDAS:</span><span class="kpi-val" style="color:#dc2626; background:#fef2f2; border:1px solid #dc2626; padding:1px 6px; border-radius:3px;">${vencidas}</span></div>
      <div class="kpi"><span>PRÓXIMAS A VENCER:</span><span class="kpi-val" style="color:#d97706; background:#fffbeb; border:1px solid #d97706; padding:1px 6px; border-radius:3px;">${proximas}</span></div>
    </div>
    <table class="tabla">
      <colgroup>
        <col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:7%"><col style="width:7%">
        <col style="width:19%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:5%"><col style="width:18%">
      </colgroup>
      <thead>
        <tr>
          <th>Placa</th><th>Clase</th><th>Marca</th><th>F. últ. cambio</th><th>Estado</th>
          <th style="text-align:left;">Preventivos pendientes</th>
          <th>Km real</th><th>Km faltante</th><th>Km próximo</th><th>UTS</th><th style="text-align:left;">Ubicación</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  </div>
  <div class="pie">
    <div>ERP AZKELL FLEET • Sistema Integrado de Mantenimiento y Gestión de Flota</div>
    <div>Control operativo de mantenimiento preventivo</div>
    <div style="font-weight:800; color:#0f172a;">REPORTE DE MANTENIMIENTO PREVENTIVO • F-MAN-006 • ${fechaCorta}</div>
  </div>
</div>
</body>
</html>`;
}

module.exports = { htmlReporteFleetrun, filasDelReporte, tipoOracion };
