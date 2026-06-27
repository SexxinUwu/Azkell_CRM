const fs = require('fs');
let text = fs.readFileSync('routes/taller.js', 'utf8');

if (!text.includes('function _calcularTotalPen')) {
    const fn = `
function _calcularTotalPen(items, tc) {
    return items.reduce((sum, item) => {
        const cant = parseFloat(item.cantidad) || 0;
        const costo = parseFloat(item.costo_unitario) || 0;
        let importe = cant * costo;
        if (item.moneda === 'USD' && tc) importe *= parseFloat(tc);
        return sum + importe;
    }, 0);
}
`;
    text = text.replace('module.exports = (db, logAudit, _generarCodigoAlmacen) => {', 'module.exports = (db, logAudit, _generarCodigoAlmacen) => {' + fn);
    fs.writeFileSync('routes/taller.js', text);
    console.log('Fixed _calcularTotalPen in taller.js');
} else {
    console.log('_calcularTotalPen already exists');
}
