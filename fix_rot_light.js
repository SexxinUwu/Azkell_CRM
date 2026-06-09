const fs = require('fs');
const path = require('path');

const vistaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/vista.html');
const logicaPath = path.join(__dirname, 'modulos/mantenimiento/reportes-ot/logica.js');

let vistaContent = fs.readFileSync(vistaPath, 'utf8');
let logicaContent = fs.readFileSync(logicaPath, 'utf8');

// Function to convert dark mode Tailwind classes to light mode
function toLightMode(html) {
    return html
        .replace(/bg-slate-950/g, 'bg-slate-50')
        .replace(/bg-slate-900/g, 'bg-white')
        .replace(/bg-slate-800/g, 'bg-slate-100')
        .replace(/bg-slate-700/g, 'bg-slate-200')
        .replace(/border-slate-800/g, 'border-slate-100')
        .replace(/border-slate-700/g, 'border-slate-200')
        .replace(/text-slate-100/g, 'text-slate-800')
        .replace(/text-slate-200/g, 'text-slate-700')
        .replace(/text-slate-300/g, 'text-slate-600')
        .replace(/text-white/g, 'text-slate-900')
        // Special case: we still want some white text in brand buttons, so we undo that:
        .replace(/text-slate-900 block leading-none mb-1/g, 'text-slate-800 block leading-none mb-1') // KPIs
        .replace(/text-slate-900 m-0/g, 'text-slate-800 m-0') // Action drawer title
        .replace(/text-slate-900 flex items-center/g, 'text-slate-800 flex items-center') // OT Title
        .replace(/text-slate-900 text-xs font-semibold rounded-xl flex items-center/g, 'text-white text-xs font-semibold rounded-xl flex items-center') // Filters btn
}

// 1. Process vista.html
// Replace dark mode colors
vistaContent = toLightMode(vistaContent);

// Fix fullscreen issue (change position: fixed; 100vw; 100vh to position: absolute; inset: 0; or just negative margins)
vistaContent = vistaContent.replace(
    /style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1045; overflow: hidden;"/,
    'style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1040; overflow: hidden;"'
);

// Remove FAB
vistaContent = vistaContent.replace(
    /<!-- Botón de Creación Flotante Inteligente \(FAB\) -->[\s\S]*?<\/button>/,
    ''
);

// Remove Bottom Bar
vistaContent = vistaContent.replace(
    /<!-- Barra de Navegación Inferior \(Sticky Navigation Bar\) -->[\s\S]*?<\/nav>/,
    ''
);

// Fix white text on brand buttons
vistaContent = vistaContent.replace(/text-slate-900 text-xs font-semibold rounded-xl flex items-center gap-1.5/g, 'text-white text-xs font-semibold rounded-xl flex items-center gap-1.5');
vistaContent = vistaContent.replace(/bg-brand-500 text-slate-900 rounded-full/g, 'bg-brand-500 text-white rounded-full');
vistaContent = vistaContent.replace(/bg-brand-500 text-slate-900 font-semibold rounded-xl/g, 'bg-brand-500 text-white font-semibold rounded-xl');

fs.writeFileSync(vistaPath, vistaContent, 'utf8');


// 2. Process logica.js
logicaContent = toLightMode(logicaContent);

// Fix specific overwrites in logica.js
logicaContent = logicaContent.replace(/bg-brand-500 text-slate-900 rounded-full/g, 'bg-brand-500 text-white rounded-full');

fs.writeFileSync(logicaPath, logicaContent, 'utf8');

console.log("Successfully converted to light mode, removed FAB and bottom bar, and adjusted layout.");
