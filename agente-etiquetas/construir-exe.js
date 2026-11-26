// Genera agente-etiquetas/dist/AzkellEtiquetadora.exe (un solo archivo con Node adentro: la PC del almacén no necesita instalar nada).
// Uso:  node agente-etiquetas/construir-exe.js
// Si existe agente-etiquetas/config.json (servidor + llave), se mete dentro del .exe y al abrirlo no pregunta nada.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const aqui = __dirname;
const raiz = path.join(aqui, '..');
const build = path.join(aqui, 'build');
const dist = path.join(aqui, 'dist');
fs.mkdirSync(build, { recursive: true });
fs.mkdirSync(dist, { recursive: true });

console.log('1/3  Juntando el código…');
// El .exe necesita un solo archivo de código: se mete el núcleo dentro de exe-main.js
const nucleo = fs.readFileSync(path.join(aqui, 'nucleo.js'), 'utf8');
let principal = fs.readFileSync(path.join(aqui, 'exe-main.js'), 'utf8');
const llamada = "const { iniciarAgente } = require('./nucleo');";
if (!principal.includes(llamada)) throw new Error('No se encontró la importación del núcleo en exe-main.js');
principal = principal.replace(llamada, `const { iniciarAgente } = (function () { const module = { exports: {} }; const exports = module.exports;
${nucleo}
return module.exports; })();`);
fs.writeFileSync(path.join(build, 'exe.cjs'), principal);

const assets = { 'imprimir-usb.ps1': path.join(aqui, 'imprimir-usb.ps1') };
const cfg = path.join(aqui, 'config.json');
if (fs.existsSync(cfg)) assets['config.json'] = cfg;
console.log(`2/3  Configuración dentro del .exe: ${assets['config.json'] ? 'sí (no pregunta nada al abrirlo)' : 'no (pedirá la llave la primera vez)'}`);

const salida = path.join(dist, 'AzkellEtiquetadora.exe');
fs.writeFileSync(path.join(build, 'sea-config.json'), JSON.stringify({ main: path.join(build, 'exe.cjs'), output: salida, disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 2));
console.log('3/3  Generando el .exe…');
execFileSync(process.execPath, ['--build-sea', path.join(build, 'sea-config.json')], { stdio: 'inherit' });
console.log(`Listo: ${salida} (${Math.round(fs.statSync(salida).size / 1048576)} MB)`);
