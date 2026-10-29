// Orden en parabrisas (F-MAN-002): calca de srDescargarPlantillaParabrisas del clásico
// (modulos/mantenimiento/status-rampa/logica.js). La plantilla HTML y su CSS son los del clásico, sin cambios;
// los helpers (srFormatID, srMatchOT, srCalcularDiasInspeccion, srParsearTareasArray) están portados igual.
// Solo cambia de dónde salen los datos: las OT y las inspecciones vienen de React Query.
import type { Inspeccion } from '../inspecciones/api';
import { clavePlaca } from '../inspecciones/api';
import type { OrdenTrabajo, RampaEntrada } from './api';

const DIA = 86_400_000;

// Igual que _srEsc del clásico
const _srEsc = (s: unknown): string => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** srFormatID: "OT-2026-0012-X" → "2026-0012" o "0012-2026" según el segundo bloque */
function srFormatID(id: string): string {
  if (!id || !id.includes('-')) return id;
  const parts = id.split('-');
  if (parts.length >= 3) {
    return parts[1].startsWith('20') ? `${parts[1]}-${parts[2]}` : `${parts[2]}-${parts[1]}`;
  }
  return id;
}

/** detalles_json de una OT (texto o objeto) */
function detalleDe(o: { detalles_json?: unknown }): Record<string, unknown> {
  const d = o.detalles_json;
  if (!d) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d) as Record<string, unknown>; } catch { return {}; }
  }
  return d as Record<string, unknown>;
}

/** srMatchOT: vincula una OT con la rampa (por id de rampa, detalle, ticket o placa si la rampa sigue activa) */
function srMatchOT(o: OrdenTrabajo, e: RampaEntrada): boolean {
  const rId = String(e._id || e.id || '');
  if (o.id_rampa && String(o.id_rampa) === rId) return true;
  const oDet = detalleDe(o);
  if (oDet.id_rampa && String(oDet.id_rampa) === rId) return true;
  if (e.ticket_entrada && (String(o.ticket_entrada) === String(e.ticket_entrada) || String(o.id_ot) === String(e.ticket_entrada))) return true;
  const ePlaca = (e.placa || '').toUpperCase().trim();
  const oPlaca = (o.placa || '').toUpperCase().trim();
  if (ePlaca && oPlaca && ePlaca === oPlaca) {
    const rampaActiva = e.situacion !== 'Finalizado' && e.estado !== 'Liberado';
    const otActiva = o.estado !== 'Finalizado' && o.estado !== 'Anulado' && o.estado !== 'Cerrado';
    if (rampaActiva && otActiva && (!o.id_rampa || String(o.id_rampa) === rId)) return true;
  }
  return false;
}

/** srCalcularDiasInspeccion: días que faltan para la próxima inspección de la placa (con su color) */
function srCalcularDiasInspeccion(placa: string | null | undefined, ultimas: Map<string, Inspeccion>): { dias: number | null; color: string } {
  if (!placa) return { dias: null, color: '#94a3b8' };
  const ult = ultimas.get(clavePlaca(placa));
  if (!ult?.fecha) return { dias: -999, color: '#dc2626' };
  const f = ult.fecha;
  const fProx = new Date(f.getFullYear(), f.getMonth(), f.getDate() + (ult.diasPropuestos || 30));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.ceil((fProx.getTime() - hoy.getTime()) / DIA);
  const color = dias < 0 ? '#dc2626' : dias <= 7 ? '#d97706' : '#16a34a';
  return { dias, color };
}

/** srParsearTareasArray: separa las tareas de las notas ("Nota:" / "Obs:") del texto de observaciones */
function srParsearTareasArray(texto: string): { tareas: string[]; notas: string[] } {
  if (!texto || !String(texto).trim()) return { tareas: [], notas: [] };
  const raw = String(texto)
    .replace(/^\[Reporte\s+[^\]]+\]\s*(OT\s+OT-[^:]+:\s*)?/gim, '')
    .replace(/^OT\s+OT-[^:]+:\s*/gim, '')
    .trim();
  const tareas: string[] = [];
  const notas: string[] = [];
  raw.split('\n').forEach(l => {
    const trimmed = l.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase().startsWith('nota:') || trimmed.toLowerCase().startsWith('obs:')) {
      const nVal = trimmed.replace(/^(nota|obs):\s*/i, '').trim();
      if (nVal) notas.push(nVal);
    } else {
      const tVal = trimmed
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/^[A-Z0-9\s]+—\s*/i, '')
        .replace(/^\d+\s+[^:]+:\s*/i, '')
        .replace(/\s*\((?:Téc|Tec|TÉC|TEC):[^\)]*\)/gi, '')
        .replace(/^(?:FALLA\s*MANUAL|MANUAL)\s*:\s*/i, '')
        .trim();
      if (tVal) tareas.push(tVal);
    }
  });
  return { tareas, notas };
}

/** Preferencias de localStorage del clásico, sin fallar en modo privado */
function leerLS(clave: string): string {
  try { return localStorage.getItem(clave) || ''; } catch { return ''; }
}

/** HTML de la orden en parabrisas (plantilla del clásico, sin cambios en estilos ni marcado) */
export function htmlOrdenParabrisas(e: RampaEntrada, ots: OrdenTrabajo[], ultimas: Map<string, Inspeccion>): string {
  // Inspección: días para la próxima
  const inspInfo = srCalcularDiasInspeccion(e.placa, ultimas);

  // Buscar todas las OTs vinculadas
  const otsPlaca = ots.filter(o => srMatchOT(o, e));
  const linkedOt = otsPlaca.length > 0 ? otsPlaca[0] : null;
  let otCodigos = Array.from(new Set(otsPlaca.map(o => {
    const rawId = o.id_ot || o.ticket_entrada || '';
    return rawId ? srFormatID(rawId) : '';
  }).filter(Boolean)));
  if (!otCodigos.length && e.ticket_entrada) {
    otCodigos.push(srFormatID(e.ticket_entrada));
  }
  otCodigos = Array.from(new Set(otCodigos));
  const otCodigoStr = otCodigos.length ? otCodigos.join('  ·  ') : 'SIN OT';

  // Formatear Fecha y Hora
  let dtStr = '____/____/______';
  if (e.fecha_ingreso) {
    const parts = String(e.fecha_ingreso).split('T')[0].split('-');
    if (parts.length === 3) dtStr = parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  const horaStr = e.hora_ingreso ? String(e.hora_ingreso).slice(0, 5) : '____:____';
  const kmStr = e.km ? Number(e.km).toLocaleString('es-PE') + ' KM' : '________________';

  // Chofer / reportado por: de la rampa o, si no hay, de las OT
  let chofer = (e.conductor || e.chofer || e.reportado_por || '').trim();
  if (!chofer && otsPlaca.length > 0) {
    for (const otItem of otsPlaca) {
      const dObj = detalleDe(otItem);
      const rec = otItem as unknown as Record<string, unknown>;
      const cFound = String(dObj.conductor || dObj.chofer || dObj.reportado_por || rec.conductor || rec.chofer || rec.reportado_por || '').trim();
      if (cFound) { chofer = cFound; break; }
    }
  }

  // Desglosar trabajos
  let obsTexto = (e.observaciones || '').trim();
  if (linkedOt && !obsTexto) {
    const det = detalleDe(linkedOt);
    obsTexto = String(det.motivo || linkedOt.observaciones || '').trim();
  }
  const parsedP = srParsearTareasArray(obsTexto);
  const tareasArr = parsedP.tareas;
  const notasArr = parsedP.notas;

  const w = window as unknown as { _LOGO_BASE64?: string; _EMPRESA_NOMBRE?: string; usuarioActual?: string };
  const empLogoUrl = leerLS('fleet_empresa_logo') || w._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
  const empNombre = leerLS('fleet_empresa_nombre') || w._EMPRESA_NOMBRE || 'AZKELL FLEET';
  const plannerNombre = leerLS('fleet_user') || leerLS('fleet_nombre_usuario') || w.usuarioActual || 'Planner de Mantenimiento';

  // Generar filas de trabajos dinámicas según la cantidad de observaciones ingresadas
  const numRows = tareasArr.length > 0 ? tareasArr.length : 1;
  let trabajosRowsHtml = '';
  for (let i = 0; i < numRows; i++) {
    const num = i + 1;
    const tareaDesc = tareasArr[i] || '';
    trabajosRowsHtml +=
      '<tr>' +
      '  <td class="col-num">' + num + '</td>' +
      '  <td class="col-desc">' +
      '    <div class="job-line">' +
      '      <span class="job-text">' + _srEsc(tareaDesc) + '</span>' +
      '      <span class="dotted-fill"></span>' +
      '    </div>' +
      '  </td>' +
      '  <td class="col-chk">' +
      '    <div class="chk-box"></div>' +
      '  </td>' +
      '</tr>';
  }

  const notasTexto = notasArr.length > 0 ? notasArr.join(' · ') : '';

  // Plantilla del clásico (HTML y CSS literales de srDescargarPlantillaParabrisas)
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orden en Parabrisas - ${_srEsc(e.placa || 'Unidad')}</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Oswald:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            margin: 0;
            padding: 20px;
            background-color: #f1f5f9;
            font-family: 'Montserrat', sans-serif;
            color: #000;
            display: flex;
            justify-content: center;
        }
        .sheet-container {
            width: 210mm;
            min-height: 295mm;
            padding: 12mm 14mm;
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 2.5px solid #000;
        }
        
        /* Franja Industrial de Advertencia */
        .stripe-bar {
            height: 14px;
            background: repeating-linear-gradient(
                -45deg,
                #facc15,
                #facc15 12px,
                #000000 12px,
                #000000 24px
            );
            border: 1px solid #000;
            width: 100%;
        }

        /* Encabezado */
        .header-section {
            margin-top: 10px;
            margin-bottom: 12px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .company-badge {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .company-logo {
            max-height: 38px;
            max-width: 140px;
            object-fit: contain;
        }
        .company-name {
            font-size: 13px;
            font-weight: 800;
            color: #1e293b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .sub-header-left {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-top: 4px;
        }
        .sub-header-right {
            text-align: right;
        }
        .doc-title-right {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #000;
            margin-bottom: 2px;
        }
        .doc-code-right {
            font-size: 14px;
            font-weight: 900;
            color: #000;
            letter-spacing: 0.5px;
        }
        .main-title {
            font-family: 'Oswald', sans-serif;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin-top: 4px;
            margin-bottom: 0;
            text-transform: uppercase;
            color: #000;
        }

        /* Cuadrícula de Datos de Unidad */
        .grid-data-top {
            display: grid;
            grid-template-columns: 2fr 2fr 1fr 1fr;
            border: 2px solid #000;
            margin-bottom: 6px;
        }
        .grid-cell {
            padding: 6px 10px;
            border-right: 2px solid #000;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 52px;
        }
        .grid-cell:last-child {
            border-right: none;
        }
        .cell-label {
            font-size: 9px;
            font-weight: 800;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .cell-value-line {
            display: flex;
            align-items: flex-end;
            min-height: 20px;
            border-bottom: 1.5px dotted #000;
            font-weight: 800;
            font-size: 14px;
            color: #000;
            padding-bottom: 1px;
        }

        /* Conductor / Chofer */
        .driver-box {
            border: 2px solid #000;
            padding: 6px 10px;
            margin-bottom: 6px;
            display: flex;
            flex-direction: column;
        }
        .driver-line {
            display: flex;
            align-items: flex-end;
            min-height: 20px;
            border-bottom: 1.5px dotted #000;
            font-weight: 700;
            font-size: 12px;
            color: #000;
            padding-bottom: 1px;
        }

        /* Tipo de Servicio Checkboxes */
        .service-type-bar {
            border: 2px solid #000;
            padding: 6px 10px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
        }
        .chk-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .chk-square {
            width: 13px;
            height: 13px;
            border: 1.5px solid #000;
            display: inline-block;
            background: #fff;
        }

        /* Tabla de Trabajos */
        .section-label {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            color: #000;
        }
        .jobs-table {
            width: 100%;
            border-collapse: collapse;
            border: 2.5px solid #000;
            margin-bottom: 12px;
        }
        .jobs-table th {
            border: 2px solid #000;
            padding: 5px 8px;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            background: #f8fafc;
            color: #000;
        }
        .jobs-table td {
            border: 1.5px solid #000;
            padding: 8px 10px;
            vertical-align: middle;
        }
        .col-num {
            width: 32px;
            text-align: center;
            font-weight: 900;
            font-size: 13px;
        }
        .col-desc {
            padding: 6px 10px !important;
        }
        .col-chk {
            width: 50px;
            text-align: center;
        }
        .chk-box {
            width: 24px;
            height: 24px;
            border: 2px solid #000;
            margin: 0 auto;
            background: #fff;
        }
        .job-line {
            display: flex;
            align-items: flex-end;
            position: relative;
            min-height: 22px;
            border-bottom: 1.5px dotted #000;
        }
        .job-text {
            font-weight: 700;
            font-size: 12px;
            color: #000;
            padding-right: 6px;
            background: #fff;
            position: relative;
            z-index: 2;
        }

        /* Observaciones / Aviso Clave */
        .obs-container {
            border: 2px solid #000;
            padding: 8px 10px;
            min-height: 75px;
            margin-bottom: 14px;
            position: relative;
        }
        .obs-line-guide {
            border-bottom: 1.5px dotted #000;
            height: 22px;
            width: 100%;
        }
        .obs-content-text {
            font-size: 11px;
            font-weight: 700;
            color: #000;
            line-height: 22px;
        }

        /* Firmas */
        .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 10px;
            margin-bottom: 12px;
            padding: 0 15px;
        }
        .sign-col {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .sign-user-name {
            font-size: 11px;
            font-weight: 800;
            color: #000;
            text-transform: uppercase;
            min-height: 22px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            margin-bottom: 3px;
            letter-spacing: 0.3px;
        }
        .sign-divider {
            width: 100%;
            border-top: 2px solid #000;
            margin-bottom: 4px;
        }
        .sign-main-name {
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            color: #000;
            margin-bottom: 1px;
        }
        .sign-sub-label {
            font-size: 8.5px;
            font-weight: 600;
            color: #334155;
            font-style: italic;
        }

        /* Footer Note */
        .footer-note {
            text-align: center;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #000;
            margin-top: 4px;
        }

        /* Print Controls */
        #btnPrintFloating {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 50px;
            padding: 12px 24px;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(37,99,235,0.4);
            cursor: pointer;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 0;
            }
            body {
                background: none;
                padding: 0;
                margin: 0;
            }
            #btnPrintFloating {
                display: none;
            }
            .sheet-container {
                width: 210mm;
                height: 297mm;
                min-height: 297mm;
                padding: 10mm 12mm;
                box-shadow: none;
                border: 2px solid #000;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <button id="btnPrintFloating" onclick="window.print()">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/></svg>
        Imprimir Ficha A4
    </button>

    <div class="sheet-container">
        <div>
            <!-- Franja Superior de Advertencia -->
            <div class="stripe-bar"></div>

            <!-- Encabezado -->
            <div class="header-section">
                <div class="header-top">
                    <div>
                        <div class="company-badge">
                            <img src="${empLogoUrl}" alt="Logo" class="company-logo">
                            <span class="company-name">${_srEsc(empNombre)}</span>
                        </div>
                        <div class="sub-header-left">ORDEN EN PARABRISAS</div>
                    </div>
                    <div class="sub-header-right">
                        <div class="doc-title-right">FORMATO DE CONTROL DE TALLER</div>
                        <div class="doc-code-right">OT: ${_srEsc(otCodigoStr)}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px; margin-bottom:4px; gap:12px;">
                    <h1 class="main-title" style="margin:0; flex:1; text-align:left;">TRABAJOS A REALIZAR</h1>
                    <div style="border:2.5px solid ${inspInfo.color}; background:${(inspInfo.dias ?? 0) < 0 ? '#fef2f2' : ((inspInfo.dias ?? 0) <= 7 ? '#fefce8' : '#f0fdf4')}; padding:4px 14px; border-radius:8px; text-align:center; min-width:150px; flex-shrink:0; box-shadow:0 2px 5px rgba(0,0,0,0.06);">
                        <div style="font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:${inspInfo.color}; line-height:1;">DÍAS PARA INSPECCIÓN</div>
                        <div style="font-family:'Oswald', sans-serif; font-size:24px; font-weight:900; color:${inspInfo.color}; line-height:1.1; margin-top:1px;">${inspInfo.dias !== null && inspInfo.dias !== -999 ? (inspInfo.dias >= 0 ? '+' + inspInfo.dias : inspInfo.dias) + ' DÍAS' : 'SIN REGISTRO'}</div>
                    </div>
                </div>
            </div>

            <!-- Grid de Datos Principales -->
            <div class="grid-data-top">
                <div class="grid-cell">
                    <span class="cell-label">PLACA UNIDAD</span>
                    <span class="cell-value-line" style="font-size:16px;">${_srEsc(e.placa || '')}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">KILOMETRAJE ACTUAL</span>
                    <span class="cell-value-line">${_srEsc(kmStr)}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">FECHA</span>
                    <span class="cell-value-line">${_srEsc(dtStr)}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">HORA</span>
                    <span class="cell-value-line">${_srEsc(horaStr)}</span>
                </div>
            </div>

            <!-- Chofer / Reportado Por -->
            <div class="driver-box">
                <span class="cell-label">CHOFER / REPORTADO POR:</span>
                <span class="driver-line">${_srEsc(chofer)}</span>
            </div>

            <!-- Checkboxes de Tipo de Servicio -->
            <div class="service-type-bar">
                <div class="chk-item">
                    <span class="chk-square"></span> PREVENTIVO / INSPECCIÓN:
                    &nbsp; <span class="chk-square"></span> Mec.
                    &nbsp; <span class="chk-square"></span> Eléc.
                    &nbsp; <span class="chk-square"></span> Carro.
                    &nbsp; <span class="chk-square"></span> Neum.
                </div>
                <div class="chk-item">
                    <span class="chk-square"></span> CORRECTIVO / FALLA
                </div>
                <div class="chk-item">
                    <span class="chk-square"></span> AUXILIO MECÁNICO
                </div>
            </div>

            <!-- Tabla de Trabajos Asignados -->
            <div class="section-label">TRABAJOS ASIGNADOS A REALIZAR:</div>
            <table class="jobs-table">
                <thead>
                    <tr>
                        <th style="width:34px; text-align:center;">N°</th>
                        <th>DESCRIPCIÓN DEL TRABAJO TÉCNICO</th>
                        <th style="width:50px; text-align:center;">✓ / X</th>
                    </tr>
                </thead>
                <tbody>
                    ${trabajosRowsHtml}
                </tbody>
            </table>

            <!-- Observaciones y Mantenimientos Pendientes -->
            <div class="section-label">OBSERVACIONES Y MANTENIMIENTOS PENDIENTES (AVISO CLAVE):</div>
            <div class="obs-container">
                ${notasTexto ? '<div class="obs-content-text">' + _srEsc(notasTexto) + '</div>' : ''}
                <div class="obs-line-guide"></div>
                <div class="obs-line-guide"></div>
                <div class="obs-line-guide"></div>
            </div>
        </div>

        <!-- Parte Inferior: Firmas y Advertencia -->
        <div>
            <div class="signatures-grid">
                <div class="sign-col">
                    <div class="sign-user-name">${_srEsc(plannerNombre)}</div>
                    <div class="sign-divider"></div>
                    <div class="sign-main-name">FIRMA / NOMBRE DEL PLANNER</div>
                    <div class="sign-sub-label">Autoriza ingreso y trabajos</div>
                </div>
                <div class="sign-col">
                    <div class="sign-user-name" style="visibility:hidden;">TÉCNICO</div>
                    <div class="sign-divider"></div>
                    <div class="sign-main-name">FIRMA DEL TÉCNICO ASIGNADO</div>
                    <div class="sign-sub-label">Conformidad de finalización</div>
                </div>
            </div>

            <!-- Franja Inferior de Advertencia -->
            <div class="stripe-bar"></div>
            <div class="footer-note">MANTENER ESTA FICHA VISIBLE EN EL PARABRISAS HASTA LA ENTREGA FORMAL DE LA UNIDAD.</div>
        </div>
    </div>
</body>
</html>`;

  return html;
}

/** Abre la orden en una ventana y manda imprimir al cargar, igual que el clásico. Devuelve false si el navegador la bloqueó. */
export function abrirOrdenParabrisas(e: RampaEntrada, ots: OrdenTrabajo[], ultimas: Map<string, Inspeccion>): boolean {
  const html = htmlOrdenParabrisas(e, ots, ultimas);
  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Por favor, permite ventanas emergentes para imprimir la orden.');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = function () {
    setTimeout(function () {
      win.print();
    }, 400);
  };
  return true;
}
