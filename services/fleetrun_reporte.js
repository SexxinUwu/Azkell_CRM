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
  @page { size: A4 landscape; margin: 9mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1d1d1f; font-family: -apple-system, 'Inter', 'Helvetica Neue', Arial, sans-serif; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid #e5e5ea; }
  .marca { display: flex; align-items: center; gap: 14px; }
  .logo { height: 40px; max-width: 160px; object-fit: contain; }
  .empresa { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
  .titulo { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .subtitulo { font-size: 9.5px; color: #86868b; margin-top: 2px; }
  .meta { font-size: 9.5px; color: #6e6e73; text-align: right; line-height: 1.5; }
  .emisor { display: flex; justify-content: space-between; font-size: 9.5px; color: #6e6e73; margin: 8px 0; }
  .resumen { display: flex; gap: 8px; margin-bottom: 10px; }
  .tarjeta { flex: 1; border-radius: 14px; padding: 8px 12px; display: flex; align-items: baseline; justify-content: space-between; background: #f5f5f7; }
  .tarjeta-num { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .tarjeta-txt { font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #3a3a3c; }
  table.tabla { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 8px; border: 1px solid #e5e5ea; border-radius: 12px; overflow: hidden; table-layout: fixed; }
  table.tabla thead { display: table-header-group; }
  table.tabla th { background: #f5f5f7; color: #6e6e73; font-size: 7.3px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; padding: 6px 5px; border-bottom: 1px solid #e5e5ea; text-align: center; }
  table.tabla td { padding: 5px 6px; border-bottom: 1px solid #f0f0f3; vertical-align: middle; }
  table.tabla tr:last-child td { border-bottom: 0; }
  tr { page-break-inside: avoid; }
  td.c { text-align: center; } td.r { text-align: right; } td.obs { text-align: left; }
  .placa { display: inline-block; border: 1px solid #d2d2d7; border-radius: 6px; padding: 1px 6px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-weight: 700; font-size: 8.5px; letter-spacing: .03em; }
  .clase, .marca-texto, .uts { font-weight: 600; font-size: 7.6px; text-transform: uppercase; }
  .clase { color: #3a3a3c; } .marca-texto { color: #0a64d6; }
  .fecha { color: #6e6e73; font-size: 7.6px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 7.4px; font-weight: 700; white-space: nowrap; }
  .tipo { margin: 1px 0; line-height: 1.3; font-size: 8px; color: #1d1d1f; }
  .punto { color: #0a84ff; font-weight: 800; }
  .km { font-family: 'SF Mono', Menlo, Consolas, monospace; font-weight: 600; font-size: 8.2px; }
  .ubi { font-size: 7.2px; color: #424245; line-height: 1.25; }
  .pie { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 7.6px; color: #86868b; }
`;

/** Una fila del reporte: los tonos de estado son suaves (fondo claro y texto del mismo color) */
function filaHtml(u, indice) {
  const unidad = u.esHoras ? ' h' : ' km';
  const vencido = u.estadoGlobal === ESTADO.VENCIDO;
  const tinta = vencido ? '#b91c1c' : '#b45309';
  const fondo = vencido ? '#fee2e2' : '#fef3c7';
  const etiqueta = vencido ? 'VENCIDO' : 'PRÓXIMO';
  const falta = u.masCritico.kmRestante;
  const utsColor = rangoUts(u.uts) === 1 ? '#0a64d6' : rangoUts(u.uts) === 2 ? '#0f766e' : '#475569';
  const obs = u.mantenimientos.map(m => `<div class="tipo"><span class="punto">•</span> ${esc(tipoOracion(m.tipo))}</div>`).join('');
  return `
  <tr>
    <td class="c"><span class="placa">${esc(u.placa)}</span></td>
    <td class="c clase">${esc(u.clase)}</td>
    <td class="c marca-texto">${esc(u.marca)}</td>
    <td class="c fecha">${esc(u.ultimoCambio)}</td>
    <td class="c"><span class="pill" style="color:${tinta};background:${fondo};">${etiqueta}</span></td>
    <td class="obs">${obs}</td>
    <td class="r km">${numero(u.kmGps)}${unidad}</td>
    <td class="c"><span class="pill" style="color:${tinta};background:${fondo};">${falta <= 0 ? '' : '+'}${numero(falta)}${unidad}</span></td>
    <td class="r km">${numero(u.masCritico.kmProx)}${unidad}</td>
    <td class="c uts" style="color:${utsColor};">${esc(u.uts)}</td>
    <td class="ubi" title="${esc(u.ubicacion)}">${esc(u.ubicacion)}</td>
  </tr>`;
}

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
<title>Estado de mantenimiento preventivo - F-MAN-006</title>
<style>${ESTILO}</style>
</head>
<body>
<div class="pdf">
  <div class="head">
    <div class="marca">
      ${datos.logo ? `<img src="${esc(datos.logo)}" alt="" class="logo">` : `<span class="empresa">${esc(datos.empresa || '')}</span>`}
      <div>
        <h1 class="titulo">Estado de mantenimiento preventivo</h1>
        <div class="subtitulo">Control de alertas, vencimientos y frecuencias de flota</div>
      </div>
    </div>
    <div class="meta">Código F-MAN-006 · Versión 01<br>Emisión ${emision}</div>
  </div>
  <div class="emisor">
    <span>Emitido por <b style="color:#1d1d1f">${esc(datos.emisor || '—')}</b></span>
  </div>
  <div class="resumen">
    <div class="tarjeta"><span class="tarjeta-num" style="color:#3a3a3c">${unidades.length}</span><span class="tarjeta-txt">Unidades en alerta</span></div>
    <div class="tarjeta" style="background:#fee2e2"><span class="tarjeta-num" style="color:#b91c1c">${vencidas}</span><span class="tarjeta-txt">Vencidas</span></div>
    <div class="tarjeta" style="background:#fef3c7"><span class="tarjeta-num" style="color:#b45309">${proximas}</span><span class="tarjeta-txt">Próximas a vencer</span></div>
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
  <div class="pie">
    <span>Sistema ERP Azkell Fleet · Mantenimiento preventivo</span>
    <span>Documento oficial · ${fechaCorta}</span>
  </div>
</div>
</body>
</html>`;
}

module.exports = { htmlReporteFleetrun, filasDelReporte, tipoOracion };
