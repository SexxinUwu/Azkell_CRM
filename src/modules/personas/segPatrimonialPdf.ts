// Status "Unidades en Base" (F-SEG-0010): calca de _subBuildPdfHtml, subDeterminarTipo y _subFormatNombreConductor
// del clásico (modulos/seguridad/unidades-base/logica.js). El HTML y sus estilos en línea son los del clásico.
// La versión actual lo imprime en una ventana; aquí el mismo HTML se convierte en PDF con conElemento (ce-pdf.ts).
import { descargarArchivo, generarPDFBlob } from '../../core/lib/pdf';
import { conElemento } from '../flota/ce-pdf';

/** Forma de cada unidad del panorama en vivo (routes/seguridad.js › panorama-en-vivo) */
export interface UnidadBaseReporte {
  placa_camion?: string | null;
  placa_carreta?: string | null;
  conductor?: string | null;
  zona?: string | null;
  observacion?: string | null;
  corte?: string | null;
  esRuta?: boolean;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** _subFormatNombreConductor: Title Case con partículas en minúscula */
function formatNombreConductor(nombre: string | null | undefined): string {
  if (!nombre || !nombre.trim() || nombre.trim() === '---' || nombre.trim() === '—') return '---';
  const trimmed = nombre.trim();
  if (trimmed.toLowerCase() === 'sin asignar' || trimmed.toLowerCase() === 'sin conductor') return 'Sin asignar';
  const minusculas = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'o', 'u', 'da', 'do', 'dos', 'das']);
  return trimmed.toLowerCase().split(/\s+/).map((palabra, idx) => {
    if (!palabra) return '';
    if (idx > 0 && minusculas.has(palabra)) return palabra;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  }).join(' ');
}

/** subDeterminarTipo: grupo del PDF según ruta, zona y placas */
export function subDeterminarTipo(r: UnidadBaseReporte): string {
  if (r.esRuta === true) return 'EN RUTA (EN OPERACIÓN)';
  const zona = (r.zona || 'Base').trim().toUpperCase();
  if (zona.includes('MANTENIMIENTO') || zona.includes('TALLER')) return 'EN MANTENIMIENTO / TALLER';
  if (zona.includes('LAVADO')) return 'EN LAVADO';
  const valida = (p: string | null | undefined) => Boolean(p && p.trim() && p.trim() !== '—' && p.trim() !== '---');
  const tieneCamion = valida(r.placa_camion);
  const tieneCarreta = valida(r.placa_carreta);
  if (tieneCamion && tieneCarreta) return 'EN BASE (CAMIÓN - CARRETA)';
  if (tieneCamion && !tieneCarreta) return 'EN BASE (SOLO CAMIÓN / TRACTO)';
  return 'EN BASE (SOLO CARRETA / REMOLQUE)';
}

/** _subBuildPdfHtml: documento A4 "STATUS UNIDADES EN BASE" (F-SEG-0010) */
export function htmlStatusUnidadesBase(items: UnidadBaseReporte[], fechaFiltro: string, empresa: string, empLogoUrl: string): string {
  const fParts = fechaFiltro.split('-');
  const fechaFormateada = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaFiltro;

  const grupos: Record<string, UnidadBaseReporte[]> = {
    'EN BASE (CAMIÓN - CARRETA)': [],
    'EN BASE (SOLO CAMIÓN / TRACTO)': [],
    'EN BASE (SOLO CARRETA / REMOLQUE)': [],
    'EN RUTA (EN OPERACIÓN)': [],
    'EN MANTENIMIENTO / TALLER': [],
    'EN LAVADO': [],
  };
  items.forEach(r => {
    const t = subDeterminarTipo(r);
    if (grupos[t]) grupos[t].push(r);
    else grupos['EN BASE (CAMIÓN - CARRETA)'].push(r);
  });

  const ordenGrupos = [
    'EN BASE (CAMIÓN - CARRETA)',
    'EN BASE (SOLO CAMIÓN / TRACTO)',
    'EN BASE (SOLO CARRETA / REMOLQUE)',
    'EN RUTA (EN OPERACIÓN)',
    'EN MANTENIMIENTO / TALLER',
    'EN LAVADO',
  ];

  let filasHtml = '';
  let itemIndex = 1;
  ordenGrupos.forEach(gKey => {
    const list = grupos[gKey];
    if (!list || list.length === 0) return;

    filasHtml += `
                <tr style="background:#e2e8f0; font-weight:bold;">
                    <td colspan="7" style="padding: 4px 6px; font-weight:800; font-size:9.5px; text-transform:uppercase; letter-spacing:0.5px; border: 1.5px solid #000;">
                        ■ ${gKey} (${list.length} ${list.length === 1 ? 'UNIDAD' : 'UNIDADES'})
                    </td>
                </tr>
            `;

    list.forEach(r => {
      const camionStr = (r.placa_camion && r.placa_camion.trim() && r.placa_camion.trim() !== '—' && r.placa_camion.trim() !== '---') ? r.placa_camion : '—';
      const carretaStr = (r.placa_carreta && r.placa_carreta.trim() && r.placa_carreta.trim() !== '—' && r.placa_carreta.trim() !== '---') ? r.placa_carreta : '—';
      const conductorFormateado = formatNombreConductor(r.conductor);
      const zonaStr = r.zona || 'Base';

      filasHtml += `
                <tr>
                    <td style="text-align:center; font-weight:bold; width:28px; padding:3px 2px; border:1px solid #000; font-size:9px;">${itemIndex++}</td>
                    <td style="text-align:center; font-weight:bold; color:#0f172a; width:58px; padding:3px 2px; border:1px solid #000; font-size:9px;">${r.esRuta ? 'En Ruta' : (r.corte || 'Corte 1')}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold; font-size:10px; width:82px; padding:3px 2px; border:1px solid #000;">${esc(camionStr)}</td>
                    <td style="text-align:center; font-family:monospace; font-size:10px; width:80px; padding:3px 2px; border:1px solid #000;">${esc(carretaStr)}</td>
                    <td style="width:175px; font-size:9.5px; padding:3px 6px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(conductorFormateado)}</td>
                    <td style="text-align:center; font-weight:600; width:115px; font-size:9.5px; padding:3px 4px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(zonaStr)}</td>
                    <td style="font-size:9px; word-break:break-word; padding:3px 4px; border:1px solid #000;">${esc(r.observacion || '')}</td>
                </tr>
            `;
    });
  });

  return `
            <div style="width:210mm; min-height:297mm; background:#ffffff; padding:10mm 12mm; margin:0 auto; box-sizing:border-box; font-family:'Inter', sans-serif; color:#000000; display:flex; flex-direction:column;">
                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; table-layout:fixed;">
                    <tr>
                        <td style="width:22%; padding:4px; border:1px solid #000; text-align:center; vertical-align:middle;" rowspan="3">
                            <img src="${esc(empLogoUrl)}" alt="Logo Empresa" style="max-height:46px; max-width:100%; object-fit:contain;">
                        </td>
                        <td style="width:54%; border:1px solid #000; text-align:center; vertical-align:middle; font-size:18px; font-weight:700; line-height:1.1; text-transform:uppercase;" rowspan="3">
                            STATUS "UNIDADES EN BASE"<br>
                            <span style="font-size:10px; font-weight:500; color:#333; letter-spacing:0.5px; display:block; margin-top:3px;">CONTROL Y SEGURIDAD PATRIMONIAL</span>
                        </td>
                        <td style="width:24%; border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>CÓDIGO:</b> F-SEG-0010</td>
                    </tr>
                    <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>VERSIÓN:</b> 0</td></tr>
                    <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>F. EMISIÓN:</b> ${fechaFormateada}</td></tr>
                </table>

                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; font-size:10.5px; font-weight:bold;">
                    <tr>
                        <td style="width:30%; border:1px solid #000; padding:4px 6px;">FECHA: <span style="font-weight:normal; margin-left:4px;">${fechaFormateada}</span></td>
                        <td style="width:35%; border:1px solid #000; padding:4px 6px;">EMPRESA: <span style="font-weight:normal; margin-left:4px;">${esc(empresa)}</span></td>
                        <td style="width:35%; border:1px solid #000; padding:4px 6px;">TOTAL REGISTRADAS: <span style="font-weight:bold; color:#0284c7; margin-left:4px;">${items.length}</span></td>
                    </tr>
                </table>

                <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:8px; font-size:9.5px; table-layout:fixed;">
                    <thead>
                        <tr style="background-color:#333333; color:#ffffff;">
                            <th style="width:28px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">#</th>
                            <th style="width:58px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">CORTE</th>
                            <th style="width:82px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">SOLO CAMIÓN</th>
                            <th style="width:80px; text-align:center; padding:5px 2px; border:1px solid #000; font-size:9px;">CARRETA</th>
                            <th style="width:175px; text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">CONDUCTOR</th>
                            <th style="width:115px; text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">ZONA</th>
                            <th style="text-align:center; padding:5px 4px; border:1px solid #000; font-size:9px;">OBSERVACIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>

                <div style="margin-top:auto; border-top:1px solid #000; padding-top:6px; display:flex; justify-content:space-between; font-size:9px; color:#333;">
                    <div><b>ERP Azkell Fleet</b> — Módulo de Seguridad y Control Patrimonial</div>
                    <div>Generado el: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</div>
                </div>
            </div>
        `;
}

/** Descarga el F-SEG-0010 con el mismo nombre que el clásico al compartirlo: "dd/mm/aaaa - Status Unidades en Base.pdf" */
export async function descargarStatusUnidadesBase(items: UnidadBaseReporte[]): Promise<void> {
  // Igual que el clásico: fecha del filtro (por defecto, hoy en UTC) y logo de la empresa o el de respaldo
  const fechaFiltro = new Date().toISOString().split('T')[0];
  const fParts = fechaFiltro.split('-');
  const fechaFormateada = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaFiltro;
  let logo = '';
  try { logo = localStorage.getItem('fleet_empresa_logo') || ''; } catch { /* sin almacenamiento */ }
  const w = window as unknown as { _LOGO_BASE64?: string };
  const logoUrl = logo || w._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
  const html = htmlStatusUnidadesBase(items, fechaFiltro, 'TODAS', logoUrl);
  const blob = await conElemento(html, el => generarPDFBlob(el, { orientacion: 'portrait', margen: 0, escala: 2.8 }));
  descargarArchivo(blob, `${fechaFormateada.replace(/\//g, '-')} - Status Unidades en Base.pdf`);
}
