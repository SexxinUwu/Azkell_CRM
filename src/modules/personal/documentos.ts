// Documentos del directorio: fotocheck e impresión de la ficha (ventana aparte, como la versión actual),
// tarjeta de contacto (.vcf) y exportación a Excel.
import { qrSvg } from '../../core/ui/QrCode';
import { LOGO_URL } from '../../core/layout/BrandMark';
import { antiguedad, edad, etiqueta, nombreCompleto, OPCIONES, ASIGNACION_FAMILIAR, type Persona } from './api';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const empresa = () => { try { return (localStorage.getItem('fleet_empresa_nombre') || '').toUpperCase(); } catch { return ''; } };
const fechaPe = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');
const soles = (v: string | number) => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * La ventana se abre en el mismo clic (si no, el navegador la bloquea) y se llena después,
 * cuando el código QR está listo.
 */
function abrirVentana(titulo: string) {
  const w = window.open('', '_blank', 'width=900,height=760');
  if (!w) throw new Error('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.');
  w.document.write(`<!doctype html><title>${esc(titulo)}</title><p style="font:15px system-ui;padding:24px;color:#6e6e73">Preparando…</p>`);
  return w;
}

const ESTILO_BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;color:#1d1d1f;background:#f5f5f7;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .barra{display:flex;justify-content:center;gap:12px;padding:20px}
  .barra button{font:600 15px inherit;font-family:inherit;padding:12px 22px;border-radius:999px;border:0;background:#1d1d1f;color:#fff;cursor:pointer}
  @media print{body{background:#fff}.barra{display:none}}
`;

function escribir(w: Window, titulo: string, estilo: string, cuerpo: string) {
  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <style>${ESTILO_BASE}${estilo}</style></head><body>
    <div class="barra"><button onclick="window.print()">Imprimir</button></div>${cuerpo}</body></html>`);
  w.document.close();
  w.focus();
}

/** Fotocheck tamaño CR80 (54 × 86 mm), con QR que identifica a la persona (mismo contenido que la versión actual) */
export async function imprimirFotocheck(p: Persona) {
  const w = abrirVentana('Fotocheck');
  const qr = await qrSvg(`AZKELL|DNI:${p.numero_documento}|COLABORADOR:${p.nombres} ${p.apellidos}|CARGO:${p.cargo}|VALIDO:${p.estado || 'ACTIVO'}`);
  const logo = new URL(LOGO_URL, window.location.origin).href;
  const foto = p.foto_url
    ? `<img class="foto" src="${esc(p.foto_url)}" alt="">`
    : `<div class="foto foto--vacia">${esc((p.nombres.charAt(0) + p.apellidos.charAt(0)).toUpperCase())}</div>`;
  escribir(w, `Fotocheck ${p.apellidos}`, `
    .hoja{display:flex;justify-content:center;padding:12px}
    .fc{width:54mm;height:86mm;border-radius:3mm;overflow:hidden;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.15);
        display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
    .fc__top{width:100%;height:20mm;background:#1d1d1f;display:flex;align-items:center;gap:2mm;padding:0 3mm}
    .fc__top img{height:9mm;width:9mm;border-radius:2mm;background:#fff;object-fit:contain}
    .fc__emp{color:#fff;font-size:2.5mm;font-weight:700;letter-spacing:.02em;text-align:left;line-height:1.15}
    .fc__acento{position:absolute;top:20mm;left:0;right:0;height:.8mm;background:#f56300}
    .foto{width:24mm;height:24mm;border-radius:50%;object-fit:cover;margin-top:-6mm;border:1mm solid #fff;background:#e5e5ea}
    .foto--vacia{display:grid;place-items:center;font-size:8mm;font-weight:700;color:#fff;background:linear-gradient(#aeaeb2,#8e8e93)}
    .fc__ape{margin-top:2mm;font-size:3.6mm;font-weight:800;letter-spacing:-.01em;padding:0 3mm;line-height:1.1}
    .fc__nom{font-size:3mm;font-weight:500;color:#3a3a3c;padding:0 3mm}
    .fc__cargo{margin-top:1.5mm;font-size:2.6mm;font-weight:700;color:#f56300;text-transform:uppercase;padding:0 3mm}
    .fc__area{font-size:2.3mm;color:#6e6e73;text-transform:uppercase}
    .fc__pie{margin-top:auto;width:100%;display:flex;align-items:center;justify-content:space-between;padding:2mm 3mm 3mm}
    .fc__dni{font:600 2.6mm ui-monospace,Menlo,monospace;text-align:left}
    .fc__dni small{display:block;font:500 2mm -apple-system,sans-serif;color:#6e6e73}
    .fc__qr{width:15mm;height:15mm}.fc__qr svg{width:100%;height:100%}
    @media print{.hoja{padding:0}.fc{box-shadow:none;border:.2mm solid #d2d2d7}@page{margin:10mm}}
  `, `<div class="hoja"><div class="fc">
      <div class="fc__top"><img src="${esc(logo)}" alt=""><div class="fc__emp">${esc(empresa())}</div></div>
      <div class="fc__acento"></div>
      ${foto}
      <div class="fc__ape">${esc(p.apellidos)}</div>
      <div class="fc__nom">${esc(p.nombres)}</div>
      <div class="fc__cargo">${esc(p.cargo)}</div>
      <div class="fc__area">${esc(etiqueta(OPCIONES.area, p.area))}</div>
      <div class="fc__pie"><div class="fc__dni"><small>${esc(p.tipo_documento || 'DNI')}</small>${esc(p.numero_documento)}</div><div class="fc__qr">${qr}</div></div>
    </div></div>`);
}

/** Ficha de registro de personal (A4) */
export function imprimirFicha(p: Persona) {
  const w = abrirVentana('Ficha de personal');
  const logo = new URL(LOGO_URL, window.location.origin).href;
  const fila = (l: string, v: string) => `<tr><th>${esc(l)}</th><td>${v ? esc(v) : '<span class="vacio">—</span>'}</td></tr>`;
  const bloque = (titulo: string, filas: Array<[string, string]>) =>
    `<section><h2>${esc(titulo)}</h2><table>${filas.map(([l, v]) => fila(l, v)).join('')}</table></section>`;
  const e = edad(p.fecha_nacimiento);
  const foto = p.foto_url ? `<img class="foto" src="${esc(p.foto_url)}" alt="">` : '<div class="foto foto--vacia"></div>';
  escribir(w, `Ficha ${p.apellidos}`, `
    .a4{width:210mm;min-height:297mm;margin:0 auto 24px;background:#fff;padding:14mm 14mm 12mm;box-shadow:0 10px 30px rgba(0,0,0,.1)}
    header{display:flex;align-items:center;gap:5mm;border-bottom:.6mm solid #1d1d1f;padding-bottom:4mm}
    header img.logo{width:16mm;height:16mm;object-fit:contain;border-radius:3mm}
    header .t{flex:1}header h1{font-size:5mm;letter-spacing:-.01em}header p{font-size:3mm;color:#6e6e73}
    header .cod{font:600 3mm ui-monospace,Menlo,monospace;text-align:right;color:#3a3a3c}
    .persona{display:flex;gap:6mm;align-items:center;margin:6mm 0 4mm}
    .foto{width:30mm;height:36mm;border-radius:3mm;object-fit:cover;background:#f2f2f7;border:.3mm solid #d2d2d7}
    .persona h2{font-size:6mm;letter-spacing:-.02em}.persona .cargo{font-size:3.6mm;color:#f56300;font-weight:700;text-transform:uppercase;margin-top:1mm}
    .persona .meta{font-size:3.2mm;color:#6e6e73;margin-top:1mm}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm 6mm}
    section h2{font-size:3.2mm;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73;margin:2mm 0 1.5mm}
    table{width:100%;border-collapse:collapse;font-size:3.2mm}
    th{text-align:left;font-weight:500;color:#6e6e73;width:42%;padding:1.4mm 0;border-bottom:.2mm solid #e5e5ea;vertical-align:top}
    td{font-weight:600;padding:1.4mm 0;border-bottom:.2mm solid #e5e5ea}
    .vacio{color:#c7c7cc;font-weight:400}
    .firmas{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:22mm;font-size:3mm;text-align:center;color:#3a3a3c}
    .firmas div{border-top:.3mm solid #1d1d1f;padding-top:2mm}
    @media print{.a4{box-shadow:none;margin:0;width:auto;min-height:0;padding:0}@page{size:A4;margin:12mm}}
  `, `<div class="a4">
      <header><img class="logo" src="${esc(logo)}" alt=""><div class="t"><h1>Ficha de registro de personal</h1><p>${esc(empresa())}</p></div>
        <div class="cod">F-RH-${String(p.id).padStart(4, '0')}<br>${fechaPe(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()))}</div></header>
      <div class="persona">${foto}<div><h2>${esc(p.apellidos)}, ${esc(p.nombres)}</h2><div class="cargo">${esc(p.cargo)}</div>
        <div class="meta">${esc(etiqueta(OPCIONES.area, p.area))} · ${esc(etiqueta(OPCIONES.estado, p.estado))}${p.fecha_ingreso ? ` · Ingreso ${fechaPe(p.fecha_ingreso)} (${esc(antiguedad(p.fecha_ingreso))})` : ''}</div></div></div>
      <div class="grid">
        ${bloque('Datos personales', [
          [p.tipo_documento || 'DNI', p.numero_documento], ['Fecha de nacimiento', p.fecha_nacimiento ? `${fechaPe(p.fecha_nacimiento)}${e != null ? ` (${e} años)` : ''}` : ''],
          ['Sexo', etiqueta(OPCIONES.sexo, p.sexo)], ['Estado civil', etiqueta(OPCIONES.estadoCivil, p.estado_civil)], ['Nacionalidad', p.nacionalidad],
        ])}
        ${bloque('Contacto', [
          ['Celular', p.telefono], ['Correo', p.email], ['Dirección', [p.direccion, p.distrito, p.provincia].filter(Boolean).join(', ')],
          ['Emergencia', [p.contacto_emergencia_nombre, p.contacto_emergencia_parentesco, p.contacto_emergencia_telefono].filter(Boolean).join(' · ')],
        ])}
        ${bloque('Puesto', [
          ['Rol', etiqueta(OPCIONES.rol, p.categoria_rol)], ['Centro de costos', etiqueta(OPCIONES.centroCosto, p.centro_costo_codigo)],
          ['Sede', p.sede], ['Jefe inmediato', p.jefe_inmediato],
        ])}
        ${bloque('Contrato', [
          ['Tipo', etiqueta(OPCIONES.tipoContrato, p.tipo_contrato)], ['Inicio', fechaPe(p.fecha_inicio_contrato)], ['Fin', p.fecha_fin_contrato ? fechaPe(p.fecha_fin_contrato) : ''],
          ['Sueldo básico', soles(p.sueldo_basico)], ['Bono fijo', soles(p.bono_fijo)],
          ['Asignación familiar', p.tiene_asignacion_familiar ? soles(ASIGNACION_FAMILIAR) : 'No aplica'],
        ])}
        ${bloque('Pensión y bancos', [
          ['Régimen', etiqueta(OPCIONES.regimen, p.regimen_pensionario)], ['CUSPP', p.cuspp],
          ['Cuenta sueldo', [p.banco_haberes, p.cuenta_haberes].filter(Boolean).join(' · ')], ['CCI', p.cci_haberes],
          ['Cuenta CTS', [p.banco_cts, p.cuenta_cts].filter(Boolean).join(' · ')],
        ])}
        ${bloque('Salud, seguridad y EPP', [
          ['Grupo sanguíneo', p.grupo_sanguineo], ['Examen médico', `${etiqueta(OPCIONES.emo, p.emo_condicion)}${p.emo_fecha_vencimiento ? ` · vence ${fechaPe(p.emo_fecha_vencimiento)}` : ''}`],
          ['SCTR salud / pensión', `${p.sctr_salud_vigente ? 'Cubierto' : 'Sin cobertura'} / ${p.sctr_pension_vigente ? 'Cubierto' : 'Sin cobertura'}`],
          ['Brevete', [p.licencia_conducir, p.licencia_categoria, p.licencia_vencimiento && `vence ${fechaPe(p.licencia_vencimiento)}`].filter(Boolean).join(' · ')],
          ['Tallas (polo · pantalón · calzado · chaleco)', [p.talla_polo, p.talla_pantalon, p.talla_calzado, p.talla_chaleco].map(t => t || '—').join(' · ')],
        ])}
      </div>
      <div class="firmas"><div>Firma del colaborador</div><div>Recursos Humanos</div></div>
    </div>`);
}

/** Tarjeta de contacto (.vcf): se agrega a Contactos del celular con un toque */
export function descargarVCard(p: Persona) {
  const v = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  const lineas = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${v(p.apellidos)};${v(p.nombres)};;;`,
    `FN:${v(nombreCompleto(p))}`,
    empresa() && `ORG:${v(empresa())};${v(etiqueta(OPCIONES.area, p.area))}`,
    p.cargo && `TITLE:${v(p.cargo)}`,
    p.telefono && `TEL;TYPE=CELL:${p.telefono.replace(/\s/g, '')}`,
    p.email && `EMAIL;TYPE=WORK:${p.email}`,
    p.direccion && `ADR;TYPE=HOME:;;${v(p.direccion)};${v(p.distrito)};${v(p.provincia)};;Perú`,
    p.fecha_nacimiento && `BDAY:${p.fecha_nacimiento}`,
    p.foto_url.startsWith('data:image/jpeg;base64,') && `PHOTO;ENCODING=b;TYPE=JPEG:${p.foto_url.split(',')[1]}`,
    'END:VCARD',
  ].filter(Boolean);
  const blob = new Blob([lineas.join('\r\n')], { type: 'text/vcard' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombreCompleto(p).replace(/[^\p{L}\d ]/gu, '').trim() || 'contacto'}.vcf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Excel con el legajo completo (mismas columnas que la versión actual) */
export async function exportarExcel(lista: Persona[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const cab = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });
  const col: Array<[string, (p: Persona) => string | number, number?]> = [
    ['Tipo doc.', p => p.tipo_documento, 10], ['N° documento', p => p.numero_documento, 14], ['Apellidos', p => p.apellidos, 24], ['Nombres', p => p.nombres, 22],
    ['Sexo', p => p.sexo], ['Nacimiento', p => p.fecha_nacimiento, 12], ['Celular', p => p.telefono, 14], ['Correo', p => p.email, 26], ['Dirección', p => p.direccion, 30],
    ['Distrito', p => p.distrito, 16], ['Área', p => etiqueta(OPCIONES.area, p.area), 22], ['Rol', p => etiqueta(OPCIONES.rol, p.categoria_rol), 20], ['Cargo', p => p.cargo, 24],
    ['Centro de costos', p => p.centro_costo_codigo, 12], ['Sede', p => p.sede, 18], ['Ingreso', p => p.fecha_ingreso, 12],
    ['Tipo de contrato', p => etiqueta(OPCIONES.tipoContrato, p.tipo_contrato), 22], ['Inicio contrato', p => p.fecha_inicio_contrato, 12], ['Fin contrato', p => p.fecha_fin_contrato, 12],
    ['Sueldo básico', p => Number(p.sueldo_basico || 0), 12], ['Asig. familiar', p => (p.tiene_asignacion_familiar ? ASIGNACION_FAMILIAR : 0), 12], ['Bono fijo', p => Number(p.bono_fijo || 0), 10],
    ['Régimen', p => etiqueta(OPCIONES.regimen, p.regimen_pensionario), 16], ['Comisión AFP', p => p.tipo_comision_afp, 12], ['CUSPP', p => p.cuspp, 14],
    ['Banco sueldo', p => p.banco_haberes, 14], ['Cuenta sueldo', p => p.cuenta_haberes, 18], ['CCI', p => p.cci_haberes, 22], ['Banco CTS', p => p.banco_cts, 14], ['Cuenta CTS', p => p.cuenta_cts, 18],
    ['Grupo sanguíneo', p => p.grupo_sanguineo, 10], ['Brevete', p => p.licencia_conducir, 14], ['Categoría', p => p.licencia_categoria, 10], ['Vence brevete', p => p.licencia_vencimiento, 12],
    ['SCTR salud', p => (p.sctr_salud_vigente ? 'Cubierto' : 'Sin cobertura'), 12], ['SCTR pensión', p => (p.sctr_pension_vigente ? 'Cubierto' : 'Sin cobertura'), 12],
    ['Examen médico', p => etiqueta(OPCIONES.emo, p.emo_condicion), 16], ['Vence examen', p => p.emo_fecha_vencimiento, 12],
    ['Polo', p => p.talla_polo], ['Pantalón', p => p.talla_pantalon], ['Calzado', p => p.talla_calzado], ['Chaleco', p => p.talla_chaleco],
    ['Contacto de emergencia', p => p.contacto_emergencia_nombre, 26], ['Estado', p => etiqueta(OPCIONES.estado, p.estado), 12],
  ];
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  await writeExcelFile([{
    sheet: 'Personal',
    data: [col.map(([t]) => cab(t)), ...lista.map(p => col.map(([, f]) => { const v = f(p); return v === '' ? null : v; }))],
    columns: col.map(([, , w]) => ({ width: w ?? 10 })),
    stickyRowsCount: 1,
  }]).toFile(`Personal-${hoy}.xlsx`);
}
