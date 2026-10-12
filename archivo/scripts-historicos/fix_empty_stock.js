const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const targetLogic = `    var estadoType = stockActual <= stockMin ? 'critical'
                   : stockMin > 0 && stockActual <= stockMin * 1.5 ? 'warning'
                   : 'ok';
    var badgeTxt = estadoType === 'critical' ? '¡REPONER!' : estadoType === 'warning' ? 'STOCK BAJO' : 'STOCK OK';

    // Badge Classes
    var badgeClass = estadoType === 'ok' ? 'background-color:#dcfce7; color:#15803d;' :
                     estadoType === 'warning' ? 'background-color:#fef3c7; color:#b45309;' :
                     'background-color:#fee2e2; color:#b91c1c;';`;

const replaceLogic = `    var estadoType = 'ok';
    if (stockMin > 0) {
        if (stockActual < stockMin) estadoType = 'critical';
        else if (stockActual >= stockMin && stockActual < stockMin * 1.5) estadoType = 'warning';
    } else {
        if (stockActual === 0) estadoType = 'empty';
    }

    var badgeTxt = estadoType === 'critical' ? '¡REPONER!' : 
                   estadoType === 'warning' ? 'STOCK BAJO' : 
                   estadoType === 'empty' ? 'SIN STOCK' : 'STOCK OK';

    // Badge Classes
    var badgeClass = estadoType === 'ok' ? 'background-color:#dcfce7; color:#15803d;' :
                     estadoType === 'warning' ? 'background-color:#fef3c7; color:#b45309;' :
                     estadoType === 'empty' ? 'background-color:#f1f5f9; color:#64748b;' :
                     'background-color:#fee2e2; color:#b91c1c;';`;

if (js.includes('estadoType = stockActual <= stockMin ? \\\'critical\\\'')) {
    js = js.replace(targetLogic, replaceLogic);
    
    // Also update icon box color if empty
    const targetIconColor = `    var iconBoxClass = estadoType === 'ok' ? 'background-color:#eff6ff; color:#3b82f6;' :
                       estadoType === 'warning' ? 'background-color:#fef9c3; color:#d97706;' :
                       'background-color:#fef2f2; color:#ef4444;';`;
    const replaceIconColor = `    var iconBoxClass = estadoType === 'ok' ? 'background-color:#eff6ff; color:#3b82f6;' :
                       estadoType === 'warning' ? 'background-color:#fef9c3; color:#d97706;' :
                       estadoType === 'empty' ? 'background-color:#f8fafc; color:#94a3b8;' :
                       'background-color:#fef2f2; color:#ef4444;';`;
                       
    js = js.replace(targetIconColor, replaceIconColor);

    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Fixed render logic for stock 0 without minimum.');
} else {
    // maybe formatted differently
    console.log('Target logic not found exactly as requested. Using regex fallback.');
    const regex = /var estadoType = stockActual <= stockMin \? 'critical'[\s\S]*?'background-color:#fee2e2; color:#b91c1c;';/;
    js = js.replace(regex, replaceLogic);
    const regexIcon = /var iconBoxClass = estadoType === 'ok' \? 'background-color:#eff6ff; color:#3b82f6;' :[\s\S]*?'background-color:#fef2f2; color:#ef4444;';/;
    js = js.replace(regexIcon, `    var iconBoxClass = estadoType === 'ok' ? 'background-color:#eff6ff; color:#3b82f6;' :
                       estadoType === 'warning' ? 'background-color:#fef9c3; color:#d97706;' :
                       estadoType === 'empty' ? 'background-color:#f8fafc; color:#94a3b8;' :
                       'background-color:#fef2f2; color:#ef4444;';`);
    fs.writeFileSync(fileJs, js, 'utf8');
    console.log('Fixed using regex.');
}
