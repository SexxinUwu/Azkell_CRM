// Falla si alguien vuelve a registrar fechas u horas con la hora UTC (5 horas adelantada respecto a Lima).
// Usar hoyLima(), ahoraLima(), ahoraLimaMin() o ahoraLimaLocal() (services/horaLima.js en el servidor, src/core/lib/format.ts en la pantalla).
const { execSync } = require('child_process');
const EXCLUIDOS = /services\/(auditoria|auditoria_vista|notificaciones|notificaciones_eventos|webhooks|horaLima|sunatGrService|gre_pdf|comprobante_pdf)\.js|routes\/(audit|audit_vista|notificaciones|api-gateway|asistente[^/]*)\.js|scripts\//;
const MALO = /new Date\(\)\.toISOString\(\)\.(slice|substring)\(|new Date\(\)\.toISOString\(\)\.split\('T'\)/;
const archivos = execSync('git ls-files src routes services server.js', { encoding: 'utf8' }).split('\n').filter(f => /\.(tsx?|js)$/.test(f) && !EXCLUIDOS.test(f));
const fs = require('fs'); const fallos = [];
for (const f of archivos) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (MALO.test(l)) fallos.push(`${f}:${i + 1}`); });
if (fallos.length) { console.error('Hora UTC detectada (usa la hora de Lima):\n' + fallos.join('\n')); process.exit(1); }
console.log('Horas de Lima: OK');
