const fs = require('fs');

const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/inspecciones/logica.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /window\.abrirModalNuevaInspeccion\s*=\s*function\s*\(\s*placaPreselect\s*\)\s*\{[\s\S]*?document\.getElementById\('i_kmtablero'\)\.value\s*=\s*insp\.km_tablero\s*\|\|\s*"";/m;

const replacement = `window.abrirModalNuevaInspeccion = function (placaPreselect) {
    renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if (formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if (idInput) idInput.value = "";

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('i_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'text-white');
        btn.classList.add('btn-outline-primary');
    });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    if (placaPreselect) {
        let iPlaca = document.getElementById('i_placa');
        if (iPlaca) {
            iPlaca.value = placaPreselect;
            if (window.SS) window.SS.setValue('insp-placa', placaPreselect);
            autocompletarInfoInsp();
        }
    }

    new bootstrap.Offcanvas(document.getElementById('drawerInspeccion')).show();
};

window.abrirModalEditarInspeccion = function (idBusqueda) {
    let insp = dataGlobalInspecciones.find(i => i.id === idBusqueda);
    if (!insp) return;

    renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if(formEl) formEl.reset();
    
    let idInput = document.getElementById('i_id_inspeccion');
    if(idInput) idInput.value = insp.id;

    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'text-white');
        btn.classList.add('btn-outline-primary');
    });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    let fIngreso;
    if (insp.fecha_ingreso && insp.fecha_ingreso.includes('/')) {
        let p = insp.fecha_ingreso.split('/'); fIngreso = \`\${p[2]}-\${p[1].padStart(2, '0')}-\${p[0].padStart(2, '0')}\`;
    } else if (insp.fecha_ingreso) {
        fIngreso = insp.fecha_ingreso.split('T')[0];
    } else { fIngreso = ""; }

    document.getElementById('i_fecha').value = fIngreso;
    document.getElementById('i_placa').value = insp.placa || "";
    if (window.SS) window.SS.setValue('insp-placa', insp.placa || '');
    document.getElementById('i_kmtablero').value = insp.km_tablero || "";`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log("Functions fixed successfully!");
