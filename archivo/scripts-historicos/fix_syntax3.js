const fs = require('fs');
const path = require('path');

const fileRoutes = path.join(__dirname, 'routes', 'almacen.js');
let lines = fs.readFileSync(fileRoutes, 'utf8').split('\n');

const out = [];
let foundDangling = false;

for (let i = 0; i < lines.length; i++) {
    // Only remove the specific lines at 413, 414, 415, 416
    if (i >= 413 && i <= 416) {
        if (lines[i].includes('if(typeof logAudit') || lines[i].includes('});')) {
            console.log('Removing line ' + i + ': ' + lines[i].trim());
            continue;
        }
    }
    out.push(lines[i]);
}

fs.writeFileSync(fileRoutes, out.join('\n'), 'utf8');
console.log('Fixed syntax error cleanly.');
