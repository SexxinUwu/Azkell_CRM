const fs = require('fs');
let js = fs.readFileSync('modulos/mantenimiento/status-rampa/logica.js', 'utf8');

if (!js.includes('window.srFormatID = function')) {
    const helper = `
window.srFormatID = function(id) {
    if (!id || !id.includes('-')) return id;
    var parts = id.split('-');
    if (parts.length >= 3) {
        if (parts[1].startsWith('20')) {
            return parts[1] + '-' + parts[2];
        } else {
            return parts[2] + '-' + parts[1];
        }
    }
    return id;
};
`;
    js = helper + js;
}

js = js.replace(
    /html \+= '<td style="font-weight:700;color:var\(--primary,#5865F2\);">' \+ idOt \+ '<\/td>';/g,
    "html += '<td style=\"font-weight:700;color:var(--primary,#5865F2);\">' + window.srFormatID(idOt) + '</td>';"
);

js = js.replace(
    /lbl\.textContent = 'OT: ' \+ idOt;/g,
    "lbl.textContent = 'OT: ' + window.srFormatID(idOt);"
);

js = js.replace(
    /lbl\.textContent = idOt;/g,
    "lbl.textContent = window.srFormatID(idOt);"
);

js = js.replace(
    /var tit = document\.getElementById\('sr-ot-det-titulo'\);\n    if \(tit\) tit\.textContent = idOt;/g,
    "var tit = document.getElementById('sr-ot-det-titulo');\n    if (tit) tit.textContent = window.srFormatID(idOt);"
);

fs.writeFileSync('modulos/mantenimiento/status-rampa/logica.js', js);
console.log('status-rampa/logica.js formatted IDs successfully.');
