const fs = require('fs');
const path = require('path');

const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

const startIdx = logicaContent.indexOf('// Inject Tailwind for mobile view dynamically');
if (startIdx > -1) {
    const endStr = '})();';
    let endIdx = logicaContent.indexOf(endStr, startIdx);
    if (endIdx > -1) {
        logicaContent = logicaContent.substring(0, startIdx) + logicaContent.substring(endIdx + endStr.length);
        fs.writeFileSync(logicaPath, logicaContent, 'utf8');
        console.log("Tailwind block removed successfully.");
    } else {
        console.log("End block not found.");
    }
} else {
    console.log("Tailwind block not found.");
}
