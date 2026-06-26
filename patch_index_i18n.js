const fs = require('fs');
let html = fs.readFileSync('Index.html', 'utf8');

// Missing data-i18n in bnav-card-title
html = html.replace('<p class="bnav-card-title">Reportes OT</p>', '<p class="bnav-card-title" data-i18n="nav.reportes_ot">Reportes OT</p>');
html = html.replace('<p class="bnav-card-title">Historial de Trabajos</p>', '<p class="bnav-card-title" data-i18n="nav.trabajos_ot">Historial de Trabajos</p>');
html = html.replace('<p class="bnav-card-title">Otros</p>', '<p class="bnav-card-title" data-i18n="nav.otros">Otros</p>');
html = html.replace('<p class="bnav-card-title">Inventario</p>', '<p class="bnav-card-title" data-i18n="nav.inventario">Inventario</p>');
html = html.replace('<p class="bnav-card-title">Entradas</p>', '<p class="bnav-card-title" data-i18n="nav.entradas">Entradas</p>');
html = html.replace('<p class="bnav-card-title">Salidas</p>', '<p class="bnav-card-title" data-i18n="nav.salidas">Salidas</p>');
html = html.replace('<p class="bnav-card-title">Kardex</p>', '<p class="bnav-card-title" data-i18n="nav.kardex">Kardex</p>');
html = html.replace('<p class="bnav-card-title">Personal</p>', '<p class="bnav-card-title" data-i18n="nav.conductores">Personal</p>');
html = html.replace('<p class="bnav-card-title">CheckList de Ingreso/Salidas de Unidades</p>', '<p class="bnav-card-title" data-i18n="nav.unidades">CheckList de Ingreso/Salidas de Unidades</p>');
html = html.replace('<p class="bnav-card-title">Tareo</p>', '<p class="bnav-card-title" data-i18n="nav.tareo">Tareo</p>');
html = html.replace('<p class="bnav-card-title">Administración</p>', '<p class="bnav-card-title" data-i18n="nav.administracion">Administración</p>');

// also missing in the desktop sidebar
html = html.replace('<span class="link-text">Reportes OT</span>', '<span class="link-text" data-i18n="nav.reportes_ot">Reportes OT</span>');
html = html.replace('<span class="link-text">Historial de Trabajos</span>', '<span class="link-text" data-i18n="nav.trabajos_ot">Historial de Trabajos</span>');
html = html.replace('<span class="link-text">Otros</span>', '<span class="link-text" data-i18n="nav.otros">Otros</span>');
html = html.replace('<span class="link-text">Inventario</span>', '<span class="link-text" data-i18n="nav.inventario">Inventario</span>');
html = html.replace('<span class="link-text">Entradas</span>', '<span class="link-text" data-i18n="nav.entradas">Entradas</span>');
html = html.replace('<span class="link-text">Salidas</span>', '<span class="link-text" data-i18n="nav.salidas">Salidas</span>');
html = html.replace('<span class="link-text">Kardex</span>', '<span class="link-text" data-i18n="nav.kardex">Kardex</span>');
html = html.replace('<span class="link-text">Personal</span>', '<span class="link-text" data-i18n="nav.conductores">Personal</span>');
html = html.replace('<span class="link-text">CheckList de Ingreso/Salidas</span>', '<span class="link-text" data-i18n="nav.unidades">CheckList de Ingreso/Salidas</span>');
html = html.replace('<span class="link-text">Tareo</span>', '<span class="link-text" data-i18n=\"nav.tareo\">Tareo</span>');
html = html.replace('<span class="link-text">Administración</span>', '<span class="link-text" data-i18n="nav.administracion">Administración</span>');

fs.writeFileSync('Index.html', html);
console.log('Index.html updated');
