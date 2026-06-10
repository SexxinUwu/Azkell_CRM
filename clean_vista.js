const fs = require('fs');
const path = require('path');
const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
let vistaContent = fs.readFileSync(vistaPath, 'utf8');

// Use regex to remove #rot-mobile-view styles
vistaContent = vistaContent.replace(/#rot-mobile-view\s*\{[\s\S]*?\}/g, '');
vistaContent = vistaContent.replace(/@media.*?\{\s*#rot-mobile-view.*?\}\s*\}/g, '');

// Cut the mobile view div chunk!
const divStart = vistaContent.indexOf('<div id="rot-mobile-view"');
if (divStart > -1) {
    const divEnd = vistaContent.indexOf('<!-- ── OFFCANVAS DETALLE PLACA GLOBAL ──────────────────── -->');
    if (divEnd > divStart) {
        vistaContent = vistaContent.substring(0, divStart) + vistaContent.substring(divEnd);
    }
}

fs.writeFileSync(vistaPath, vistaContent, 'utf8');
console.log("Successfully stripped rot-mobile-view from vista.html");
