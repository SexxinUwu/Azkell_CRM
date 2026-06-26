const fs = require('fs');

let vistaHtml = fs.readFileSync('modulos/sistema/configuracion/vista.html', 'utf8');
// Use indexOf instead of regex to be safe with emojis
const ayStr = '<div class="lang-card d-flex align-items-center gap-4 p-3" data-lang="ay" onclick="window.setLanguage(\'ay\')">\n                    <div class="lang-flag-circle">⛰️</div>';
const quStr = '<div class="lang-card d-flex align-items-center gap-4 p-3" data-lang="qu" onclick="window.setLanguage(\'qu\')">\n                    <div class="lang-flag-circle">🏔️</div>';

let lines = vistaHtml.split('\n');

function removeBlock(str) {
    let start = lines.findIndex(l => l.includes('⛰️') || l.includes('🏔️')); // wait this might only find one at a time.
}
// Just remove those specific blocks exactly using regex but without emojis in regex literal (use unicode escapes)
vistaHtml = vistaHtml.replace(/<div class="lang-card[^>]+data-lang="ay"[^>]+>\s*<div class="lang-flag-circle">\u26F0\uFE0F<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '');
vistaHtml = vistaHtml.replace(/<div class="lang-card[^>]+data-lang="qu"[^>]+>\s*<div class="lang-flag-circle">\uD83C\uDFD4\uFE0F<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '');

fs.writeFileSync('modulos/sistema/configuracion/vista.html', vistaHtml);

let indexHtml = fs.readFileSync('Index.html', 'utf8');
indexHtml = indexHtml.replace(/<span class="link-text">Status Rampa<\/span>/g, '<span class="link-text" data-i18n="nav.status_rampa">Status Rampa</span>');
indexHtml = indexHtml.replace(/<p class="bnav-card-title">Status Rampa<\/p>/g, '<p class="bnav-card-title" data-i18n="nav.status_rampa">Status Rampa</p>');
indexHtml = indexHtml.replace(/<div class="nav-sub-label"><i class="bi bi-arrow-left-right me-1"><\/i>Movimientos<\/div>/g, '<div class="nav-sub-label"><i class="bi bi-arrow-left-right me-1"></i><span data-i18n="nav.movimientos">Movimientos</span></div>');
indexHtml = indexHtml.replace(/<span class="link-text">Seguridad<\/span>/g, '<span class="link-text" data-i18n="nav.seguridad">Seguridad</span>');
indexHtml = indexHtml.replace(/<i class="bi bi-shield-lock-fill"><\/i><span>Seguridad<\/span>/g, '<i class="bi bi-shield-lock-fill"></i><span data-i18n="nav.seguridad">Seguridad</span>');
indexHtml = indexHtml.replace(/<div class="bnav-sheet-title"><i class="bi bi-shield-lock-fill text-danger"><\/i> Seguridad<\/div>/g, '<div class="bnav-sheet-title"><i class="bi bi-shield-lock-fill text-danger"></i> <span data-i18n="nav.seguridad">Seguridad</span></div>');
indexHtml = indexHtml.replace(/<span class="link-text">CheckList de Ingreso\/Salidas de Unidades<\/span>/g, '<span class="link-text" data-i18n="nav.unidades">CheckList de Ingreso/Salidas de Unidades</span>');

fs.writeFileSync('Index.html', indexHtml);
