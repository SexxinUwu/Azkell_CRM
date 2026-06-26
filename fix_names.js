const fs = require('fs');
let c = fs.readFileSync('Index.html', 'utf8');

c = c.replace(/Sistema Fleetrun/g, 'Mantenimiento Preventivo');
c = c.replace(/Trabajos Anexos/g, 'Historial de Trabajos');

// Replace link-text specifically for Unidades and Asistencia to not mess up other parts
c = c.replace(/<span class="link-text">Unidades<\/span>/g, '<span class="link-text">CheckList de Ingreso/Salidas de Unidades</span>');
c = c.replace(/<p class="bnav-card-title">Unidades<\/p>/g, '<p class="bnav-card-title">CheckList de Ingreso/Salidas de Unidades</p>');

c = c.replace(/<span class="link-text">Asistencia<\/span>/g, '<span class="link-text">Tareo</span>');
c = c.replace(/<p class="bnav-card-title">Asistencia<\/p>/g, '<p class="bnav-card-title">Tareo</p>');

fs.writeFileSync('Index.html', c);
console.log("Index.html updated.");
