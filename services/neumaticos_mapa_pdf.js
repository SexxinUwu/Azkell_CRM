// HTML del mapa de posición de neumáticos de una unidad (solo lectura).
// La ruta GET /api/neumaticos/mapa-pdf/:placa carga los datos y convierte este HTML con htmlAPdf (services/ot_pdf.js).
//
// Entrada: { placa, fechaImpresion, posiciones: [{ posicion, codigo, vida, fecha_montaje, km_recorridos, surco_central }] }
//   vida: texto 'R0'..'R3' o null; fecha_montaje: 'AAAA-MM-DD' o null; surco_central: mm o null.

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function miles(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Agrupa las posiciones por eje: el número inicial del código (p. ej. "1LDI" -> eje 1). Sin número -> eje 0 (Otros).
function agruparEjes(posiciones) {
    const ejes = new Map();
    posiciones.forEach((p, idx) => {
        const m = String(p.posicion || '').match(/^(\d+)/);
        const eje = m ? Number(m[1]) : 0;
        if (!ejes.has(eje)) ejes.set(eje, []);
        ejes.get(eje).push({ ...p, numero: idx + 1 });
    });
    return [...ejes.entries()].sort((a, b) => a[0] - b[0]);
}

// Croquis: chasis vertical al centro; cada eje es una fila. Los neumáticos de la primera mitad van a la izquierda
// y la segunda mitad a la derecha. Es un esquema de referencia, no un plano a escala.
function croquisSvg(posiciones) {
    if (!posiciones.length) return '<p class="vacio">La unidad no tiene neumáticos montados.</p>';
    const ejes = agruparEjes(posiciones);
    const maxLado = Math.max(...ejes.map(([, lista]) => Math.ceil(lista.length / 2)));
    const cx = 80 + 44 * maxLado;
    const ancho = cx * 2;
    const alto = 40 + ejes.length * 74 + 20;
    const piezas = [];

    piezas.push(`<rect x="${cx - 4}" y="16" width="8" height="${alto - 32}" rx="4" class="chasis"/>`);

    ejes.forEach(([eje, lista], fila) => {
        const y = 52 + fila * 74;
        const mitad = Math.ceil(lista.length / 2);
        const etiquetaEje = eje === 0 ? 'Otros' : `Eje ${eje}`;
        piezas.push(`<text x="10" y="${y - 22}" class="eje">${esc(etiquetaEje)}</text>`);
        lista.forEach((p, i) => {
            const izquierda = i < mitad;
            const k = izquierda ? i : i - mitad;
            const x = izquierda ? cx - 46 - 44 * k : cx + 46 + 44 * k;
            piezas.push(`<rect x="${x - 13}" y="${y - 22}" width="26" height="40" rx="7" class="llanta"/>`);
            piezas.push(`<circle cx="${x}" cy="${y - 2}" r="10" class="numero"/>`);
            piezas.push(`<text x="${x}" y="${y + 2}" text-anchor="middle" class="num-txt">${p.numero}</text>`);
            piezas.push(`<text x="${x}" y="${y + 34}" text-anchor="middle" class="cod">${esc(p.posicion)}</text>`);
        });
    });

    return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Croquis de posiciones">${piezas.join('')}</svg>`;
}

function filasTabla(posiciones) {
    return posiciones.map((p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="mono">${esc(p.posicion)}</td>
          <td class="mono">${esc(p.codigo || '—')}</td>
          <td>${esc(p.vida || '—')}</td>
          <td>${esc(p.fecha_montaje || '—')}</td>
          <td class="der">${p.km_recorridos == null ? '—' : `${miles(p.km_recorridos)} km`}</td>
          <td class="der">${p.surco_central == null ? '—' : `${esc(p.surco_central)} mm`}</td>
        </tr>`).join('');
}

function htmlMapaPosiciones({ placa, fechaImpresion, posiciones }) {
    const titulo = `Posición de los neumáticos en el vehículo ${placa}`;
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1d1d1f; margin: 0; padding: 14mm 14mm; font-size: 11px; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .meta { color: #6e6e73; margin: 0 0 14px; }
  .croquis { text-align: center; margin: 6px 0 16px; }
  .chasis { fill: #d2d2d7; }
  .llanta { fill: #3a3a3c; }
  .numero { fill: #ffffff; stroke: #0071e3; stroke-width: 2; }
  .num-txt { font-size: 11px; font-weight: 700; fill: #0071e3; }
  .cod { font-size: 9px; fill: #3a3a3c; font-family: monospace; }
  .eje { font-size: 10px; font-weight: 700; fill: #6e6e73; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #d2d2d7; padding: 5px 6px; text-align: left; }
  th { background: #f5f5f7; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td.der { text-align: right; }
  td.mono { font-family: monospace; }
  .vacio { color: #6e6e73; }
</style>
</head>
<body>
  <h1>${esc(titulo)}</h1>
  <p class="meta">Fecha de impresión: ${esc(fechaImpresion)}</p>
  <div class="croquis">${croquisSvg(posiciones)}</div>
  <table>
    <thead>
      <tr>
        <th>Nº</th><th>Posición</th><th>Neumático</th><th>Vida actual</th><th>Aplicado en</th>
        <th class="der">Distancia recorrida</th><th class="der">Surco central</th>
      </tr>
    </thead>
    <tbody>${posiciones.length ? filasTabla(posiciones) : '<tr><td colspan="7" class="vacio">Sin neumáticos montados.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

module.exports = { htmlMapaPosiciones };
