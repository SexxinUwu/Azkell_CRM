const fs = require('fs');

let code = fs.readFileSync('routes/almacen.js', 'utf8');

const regex = /if \(estadoOT !== 'En Proceso' && estadoOT !== 'Pausada'\) \{[\s\S]*?return res\.status\(400\)\.json\(\{ error: msg \}\);\s*\}/;

code = code.replace(regex, `// Bloqueo removido: Permitir salidas a OT cerradas para regularizaciones de almacén`);

fs.writeFileSync('routes/almacen.js', code);
console.log('routes/almacen.js patched');
