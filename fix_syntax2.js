const fs = require('fs');
const path = require('path');

const fileRoutes = path.join(__dirname, 'routes', 'almacen.js');
let lines = fs.readFileSync(fileRoutes, 'utf8').split('\n');

// Find the lines 414-417 exactly and remove them.
// Let's just look for the line with `if(typeof logAudit === 'function' && (req.body && req.body.usuario))`
// right after a `});`
const out = [];
let skip = 0;
for (let i = 0; i < lines.length; i++) {
    if (skip > 0) {
        skip--;
        continue;
    }
    if (lines[i].includes(`if(typeof logAudit === 'function' && (req.body && req.body.usuario))`) && 
        lines[i].includes(`req.method === 'POST' ? 'CREÓ'`) && 
        lines[i].includes(`res.json({ ok: true });`)) {
        
        // Ensure it's immediately after router.delete
        // This is definitely the dangling block
        skip = 3; // skip this line and the next 3 lines (`        });`, `    });`, `});`)
        console.log('Removed bad lines starting at ' + i);
        continue;
    }
    out.push(lines[i]);
}

fs.writeFileSync(fileRoutes, out.join('\n'), 'utf8');
console.log('Fixed syntax error in almacen.js by line deletion.');
