const fs = require('fs');
let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

js = js.replace(
    /onclick="window\.srEliminarStatusRampa\('\\'' \+ id \+ '\\'\)"/g,
    "onclick=\"window.srEliminarRegistroGeneral('\\'' + id + '\\', '\\'' + (row.id_ot||row.ticket_entrada||'') + '\\')\""
);

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('patched delete call');
