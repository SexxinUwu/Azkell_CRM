const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/routes/taller.js';
let code = fs.readFileSync(path, 'utf8');

const queryMatch = `COALESCE((
                SELECT SUM(s.total_pen)
                FROM salidas_inv s WHERE s.ticket_ot = o.ticket_entrada AND s.estado = 'Despachado'
            ), 0) AS costo_total`;

const newQuery = `COALESCE((
                SELECT SUM(s.total_pen)
                FROM salidas_inv s WHERE s.ticket_ot = o.ticket_entrada AND s.estado = 'Despachado'
            ), 0) + COALESCE((
                SELECT SUM(e.total_pen)
                FROM entradas_inv e WHERE e.ot_id = o.ticket_entrada AND e.tipo_orden = 'Orden de Servicio'
            ), 0) AS costo_total`;

code = code.replace(queryMatch, newQuery);

fs.writeFileSync(path, code);
console.log('update_costo_ot.js applied!');
