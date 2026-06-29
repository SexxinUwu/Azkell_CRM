const fs = require('fs');
let logica = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

const regexEnviar = /for \(let i = 0; i < formObj\.elements\.length; i\+\+\) \{\s*const el = formObj\.elements\[i\];\s*if \(el\.name\) data\[el\.name\] = el\.value;\s*\}/g;
const replacement = `for (let i = 0; i < formObj.elements.length; i++) {
        const el = formObj.elements[i];
        if (el.name) {
            let val = el.value;
            if (!val && document.getElementById(el.id + '-txt')) val = document.getElementById(el.id + '-txt').value;
            data[el.name] = val;
        }
    }`;

logica = logica.replace(regexEnviar, replacement);
fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', logica);
