'use strict';
// Hoja de ruta de los conductores (Operaciones Marsisa): corre las horas de una plantilla desde la llegada al cliente y arma el HTML del PDF.
// Las horas son de reloj de Lima (sin cambio de hora en Perú): se calculan sobre una línea de tiempo simple, sin zonas horarias.

const TIPOS = {
    CARGA: 'Carga', CONDUCCION: 'Conducción', COMBUSTIBLE: 'Combustible', COMIDA: 'Comida', DESCANSO: 'Descanso',
    REVISION: 'Revisión de llantas', DESCARGA: 'Descarga', OTRO: 'Otro',
};
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const minutosDe = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const hhmm = min => `${p2(Math.floor(min / 60) % 24)}:${p2(min % 60)}`;
const duracion = min => `${Math.floor(min / 60)}:${p2(min % 60)}:00`;
const horas = min => `${(min / 60).toLocaleString('es-PE', { maximumFractionDigits: 1 })} h`;

/** Duración de una parada en minutos: si la hora de fin es menor o igual a la de inicio, termina al día siguiente */
function duracionMin(inicio, fin) {
    const a = minutosDe(inicio), b = minutosDe(fin);
    if (a == null || b == null) return null;
    return b > a ? b - a : b + 1440 - a;
}

/** Línea de tiempo en minutos desde la medianoche del día 1 de la plantilla: cada parada empieza a su hora del día indicado */
function lineaDePlantilla(paradas) {
    return paradas.map(p => {
        const ini = (p.dia - 1) * 1440 + minutosDe(p.hora_inicio);
        return { ...p, ini, fin: ini + duracionMin(p.hora_inicio, p.hora_fin) };
    });
}

/**
 * Corre la plantilla para una llegada concreta. `salida` = 'AAAA-MM-DDTHH:mm' (hora de Lima de la llegada al cliente / primera parada).
 * Devuelve las filas con fecha y hora reales, los totales y el rango del viaje.
 */
function calcular(paradas, salida) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(salida || ''));
    if (!m) throw Object.assign(new Error('Indica la fecha y hora de llegada al cliente.'), { status: 400 });
    const orden = lineaDePlantilla(paradas).sort((a, b) => a.ini - b.ini || a.orden - b.orden);
    if (!orden.length) throw Object.assign(new Error('La plantilla no tiene paradas.'), { status: 422 });
    const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000; // minutos "ingenuos"
    const delta = base - orden[0].ini;
    const aFecha = min => { const d = new Date(min * 60000); return { fecha: `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`, anio: d.getUTCFullYear(), dia: Math.floor(min / 1440), hora: hhmm(((min % 1440) + 1440) % 1440) }; };
    const primerDia = aFecha(orden[0].ini + delta).dia;
    // Una parada que cruza la medianoche se parte en dos filas: la primera hasta las 24:00 y su continuación en el día siguiente
    // (así cada día sale con su número y su fecha, y la hoja no parece un solo día).
    const filas = [];
    orden.forEach((p, i) => {
        let ini = p.ini + delta; const fin = p.fin + delta; let primera = true;
        while (ini < fin) {
            const medianoche = (Math.floor(ini / 1440) + 1) * 1440;
            const hasta = Math.min(fin, medianoche);
            const a = aFecha(ini);
            filas.push({
                n: i + 1, dia: a.dia - primerDia + 1, fecha: a.fecha, tipo: p.tipo,
                actividad: primera ? p.actividad : `${p.actividad} (continuación)`,
                inicio: a.hora, fin: hasta === medianoche ? '24:00' : aFecha(hasta).hora, minutos: hasta - ini, continuacion: !primera,
            });
            ini = hasta; primera = false;
        }
    });
    const suma = tipos => filas.filter(f => tipos.includes(f.tipo)).reduce((s, f) => s + f.minutos, 0);
    const total = orden[orden.length - 1].fin - orden[0].ini;
    return {
        filas,
        totales: {
            total, manejo: suma(['CONDUCCION']), descanso: suma(['DESCANSO', 'COMIDA']),
            otras: total - suma(['CONDUCCION']) - suma(['DESCANSO', 'COMIDA']),
        },
        inicioTxt: (() => { const a = aFecha(orden[0].ini + delta); return `${a.fecha}/${a.anio} ${a.hora}`; })(),
        finTxt: (() => { const a = aFecha(orden[orden.length - 1].fin + delta); return `${a.fecha}/${a.anio} ${a.hora}`; })(),
    };
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; color: #0f172a; font-size: 9px; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 210mm; min-height: 295mm; padding: 9mm; display: flex; flex-direction: column; gap: 3mm; }
.cab { display: grid; grid-template-columns: 40mm 1fr; align-items: center; gap: 5mm; padding-bottom: 3mm; border-bottom: .5mm solid #0f172a; }
.cab img { max-height: 15mm; max-width: 38mm; object-fit: contain; }
.cab h1 { margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; }
.cab p { margin: .8mm 0 0; font-size: 7.5px; color: #475569; }
.titulo { background: #f59e0b; text-align: center; font-weight: 800; font-size: 11px; padding: 1.6mm; text-transform: uppercase; border: .25mm solid #0f172a; }
.datos { display: grid; grid-template-columns: repeat(3, 1fr); border: .25mm solid #cbd5e1; }
.datos > div { padding: 1.5mm 2.5mm; border-top: .25mm solid #e2e8f0; min-width: 0; }
.datos > div:nth-child(-n+3) { border-top: 0; }
.datos > div + div { border-left: .25mm solid #e2e8f0; }
.datos > div:nth-child(3n+1) { border-left: 0; }
.etq { font-size: 6px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: #64748b; display: block; }
.val { font-size: 9px; font-weight: 600; word-break: break-word; }
table { width: 100%; border-collapse: collapse; }
th { background: #0ea5e9; color: #fff; font-size: 7.5px; padding: 1.4mm 1mm; border: .25mm solid #0f172a; text-transform: uppercase; }
th.real { background: #e2e8f0; color: #0f172a; }
td { border: .25mm solid #94a3b8; padding: 1.3mm 1.5mm; font-size: 8.5px; }
td.c { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.dia { text-align: center; font-weight: 800; background: #e2e8f0; width: 11mm; }
td.n { text-align: center; width: 7mm; background: #bae6fd; font-weight: 700; }
tr.t-DESCANSO td:not(.dia):not(.n) { background: #fde68a; font-weight: 700; }
tr.t-COMIDA td:not(.dia):not(.n) { background: #fef3c7; }
tr.t-COMBUSTIBLE td:not(.dia):not(.n), tr.t-REVISION td:not(.dia):not(.n) { background: #e2e8f0; }
tr.t-CARGA td:not(.dia):not(.n), tr.t-DESCARGA td:not(.dia):not(.n) { background: #dbeafe; }
td.blanco { width: 15mm; }
.pie { display: grid; grid-template-columns: 1fr 52mm; gap: 3mm; align-items: start; break-inside: avoid; }
.caja { border: .25mm solid #cbd5e1; padding: 2mm 3mm; }
.caja h3 { margin: 0 0 1.5mm; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
.tot { width: 100%; }
.tot td { border: .25mm solid #94a3b8; font-size: 8.5px; font-weight: 700; padding: 1.3mm 2mm; }
.tot td:last-child { text-align: right; width: 18mm; }
.int th { background: #e2e8f0; color: #0f172a; font-size: 7px; }
.int td { height: 6mm; font-size: 8px; }
.notas { font-size: 7.5px; color: #334155; text-align: justify; }
.firma { display: flex; gap: 8mm; margin-top: 5mm; }
.firma div { flex: 1; border-top: .25mm solid #0f172a; padding-top: 1mm; text-align: center; font-size: 7.5px; color: #475569; }
`;

/**
 * HTML de la hoja de ruta.
 * empresa: { nombre, ruc, direccion, telefono, correo, logo }, plantilla, calc (de calcular), datos: { salida, viaje, placa, remolque, conductores:[{nombre, telefono}], observaciones }
 */
function htmlHojaRuta({ empresa, plantilla, calc, datos }) {
    const filas = calc.filas;
    // Celda de día combinada: una sola vez por cada día, con su fecha
    const dias = new Map();
    filas.forEach(f => { dias.set(f.dia, (dias.get(f.dia) || 0) + 1); });
    const vistos = new Set();
    const cuerpo = filas.map(f => {
        const celdaDia = vistos.has(f.dia) ? '' : (vistos.add(f.dia), `<td class="dia" rowspan="${dias.get(f.dia)}">DÍA ${f.dia}<br><span style="font-weight:600;font-size:7px">${esc(f.fecha)}</span></td>`);
        return `<tr class="t-${esc(f.tipo)}">${celdaDia}<td class="n">${f.continuacion ? '' : f.n}</td><td>${esc(f.actividad)}</td>`
            + `<td class="c">${esc(f.inicio)}</td><td class="c">${esc(f.fin)}</td><td class="c">${duracion(f.minutos)}</td>`
            + `<td class="blanco"></td><td class="blanco"></td><td class="blanco"></td></tr>`;
    }).join('');
    const filasInt = [1, 2, 3, 4].map(i => {
        const c = (datos.conductores || [])[i - 1];
        const unidad = i === 1 ? [datos.placa, datos.remolque].filter(Boolean).join(' / ') : '';
        return `<tr><td style="text-align:center;width:6mm">${i}</td><td>${esc(unidad)}</td><td>${esc(c ? c.nombre : '')}</td><td>${esc(c ? c.telefono : '')}</td></tr>`;
    }).join('');
    const logo = empresa.logo ? `<img src="${esc(empresa.logo)}" alt="">` : '<div></div>';
    const T = calc.totales;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de ruta</title><style>${CSS}</style></head><body><div class="hoja">
<div class="cab">${logo}<div><h1>${esc(empresa.nombre || '')}</h1><p>${esc([empresa.ruc ? `RUC ${empresa.ruc}` : '', empresa.direccion, empresa.telefono ? `Tel. ${empresa.telefono}` : '', empresa.correo].filter(Boolean).join(' · '))}</p></div></div>
<div class="titulo">Hoja de ruta · Plan de viaje · ${esc(plantilla.cliente)}</div>
<div class="datos">
 <div><span class="etq">Origen</span><span class="val">${esc(plantilla.origen || '—')}</span></div>
 <div><span class="etq">Destino</span><span class="val">${esc(plantilla.destino || '—')}</span></div>
 <div><span class="etq">Material</span><span class="val">${esc(plantilla.material || '—')}</span></div>
 <div><span class="etq">Cliente</span><span class="val">${esc(plantilla.cliente)}</span></div>
 <div><span class="etq">N° de viaje / referencia</span><span class="val">${esc(datos.viaje || '—')}</span></div>
 <div><span class="etq">Unidad</span><span class="val">${esc(plantilla.tipo_unidad === 'CAMION' ? 'Camión' : 'Tracto')}${datos.placa ? ` · ${esc(datos.placa)}` : ''}${datos.remolque ? ` + ${esc(datos.remolque)}` : ''}</span></div>
 <div><span class="etq">Llegada al cliente</span><span class="val">${esc(calc.inicioTxt)}</span></div>
 <div><span class="etq">Llegada a destino (plan)</span><span class="val">${esc(calc.finTxt)}</span></div>
 <div><span class="etq">Choferes</span><span class="val">${plantilla.choferes}</span></div>
</div>
<table><thead><tr><th colspan="2">N°</th><th>Ruta</th><th colspan="3">Tiempo planificado</th><th colspan="3" class="real">Tiempo real</th></tr>
<tr><th>Día</th><th>N°</th><th>Actividad</th><th>Hora inicio</th><th>Hora fin</th><th>Tiempo</th><th class="real">Hora inicio</th><th class="real">Hora fin</th><th class="real">Tiempo</th></tr></thead>
<tbody>${cuerpo}</tbody></table>
<div class="pie">
 <div class="caja"><h3>Integrantes</h3><table class="int"><thead><tr><th>N°</th><th>Vehículo (placas)</th><th>Operador</th><th>Celular</th></tr></thead><tbody>${filasInt}</tbody></table></div>
 <table class="tot"><tr><td>Tiempo de viaje</td><td>${horas(T.total)}</td></tr><tr><td>Manejo</td><td>${horas(T.manejo)}</td></tr><tr><td>Descanso y comidas</td><td>${horas(T.descanso)}</td></tr><tr><td>Otras paradas</td><td>${horas(T.otras)}</td></tr></table>
</div>
${datos.observaciones ? `<div class="caja"><h3>Observaciones</h3><div class="notas">${esc(datos.observaciones)}</div></div>` : ''}
${plantilla.notas ? `<div class="notas">${esc(plantilla.notas)}</div>` : ''}
<div class="firma"><div>Conductor</div><div>Operaciones</div></div>
</div></body></html>`;
}

module.exports = { TIPOS, calcular, htmlHojaRuta, duracionMin, minutosDe };
