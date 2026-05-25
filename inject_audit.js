const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    "const almacenRoutes = require('./routes/almacen')(db, _multerInv);",
    "const almacenRoutes = require('./routes/almacen')(db, _multerInv, logAudit);"
);

code = code.replace(
    "const tallerRoutes = require('./routes/taller')(db);",
    "const tallerRoutes = require('./routes/taller')(db, logAudit);"
);

fs.writeFileSync('server.js', code);
console.log('server.js updated successfully with logAudit dependencies');
