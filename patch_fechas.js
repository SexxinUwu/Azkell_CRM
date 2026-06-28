const fs = require('fs');

// 1. Fix the duplicate button in logica.js
let logica = fs.readFileSync('modulos/mantenimiento/reportes-ot/logica.js', 'utf8');
const dupBtn = `    if (puedeEditar) {
        ftHtml += '<button class="btn btn-sm btn-outline-info" onclick="window.rotAbrirEditarFechas(\\'' + esc(idOT) + '\\')">'
                + '<i class="bi bi-calendar3 me-1"></i>Editar Fechas</button>';
    }\n`;
// Replace first occurrence of duplicate block if it appears twice sequentially
logica = logica.replace(dupBtn + dupBtn, dupBtn);
fs.writeFileSync('modulos/mantenimiento/reportes-ot/logica.js', logica);
console.log('Duplicate button removed');

// 2. Add the PUT /ordenes-trabajo/:id/fechas endpoint to taller.js
let taller = fs.readFileSync('routes/taller.js', 'utf8');

const endpointCode = `
router.put('/ordenes-trabajo/:id/fechas', (req, res) => {
    const ticketId = req.params.id;
    const { fecha_inicio_ot, fecha_hora_salida } = req.body;
    
    // Convert undefined to null for SQL
    const fInicio = fecha_inicio_ot ? fecha_inicio_ot : null;
    const fSalida = fecha_hora_salida ? fecha_hora_salida : null;

    db.query(
        "UPDATE ordenes_trabajo SET fecha_inicio_ot=?, fecha_hora_salida=? WHERE ticket_entrada=?",
        [fInicio, fSalida, ticketId],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if(typeof logAudit === 'function' && req.body && req.body.usuario) {
                logAudit(req.body.usuario, 'ot', 'MODIFICÓ', \`Editó fechas de OT \${ticketId}\`);
            }
            res.json({ ok: true });
        }
    );
});
`;

// Insert it right after router.put('/ordenes-trabajo/:id' block
// We'll just look for a good place to inject it
if (!taller.includes('/ordenes-trabajo/:id/fechas')) {
    taller = taller.replace("router.put('/ordenes-trabajo/:id', (req, res) => {", endpointCode.trim() + "\\n\\nrouter.put('/ordenes-trabajo/:id', (req, res) => {");
    fs.writeFileSync('routes/taller.js', taller);
    console.log('taller.js updated with fechas endpoint');
} else {
    console.log('taller.js already has the endpoint');
}
