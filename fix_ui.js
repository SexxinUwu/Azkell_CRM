const fs = require('fs');

const pathLogicaEntradas = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logicaEntradas = fs.readFileSync(pathLogicaEntradas, 'utf8');

// 1. Fix tipoOrdBadge
logicaEntradas = logicaEntradas.replace(
    /var tipoOrdBadge =.*?<br>';/s,
    `var tipoOrdBadge = (d.tipo_orden && d.tipo_orden.toLowerCase() === 'orden de servicio') 
        ? '<span class="badge bg-warning text-dark" style="font-size:0.6rem; letter-spacing:0.04em;">ORDEN DE SERVICIO</span>' 
        : '<span class="badge bg-primary" style="font-size:0.6rem; letter-spacing:0.04em;">ORDEN DE COMPRA</span>';`
);

// 2. Fix the tr0 row to inject the TIPO ORDEN cell correctly
logicaEntradas = logicaEntradas.replace(
    /'<td class="text-center">' \+ tipoOrdBadge \+ '<span class="badge bg-secondary fw-normal" style="font-size:0\.72rem;">' \+ _entEsc\(d\.id \|\| ''\) \+ '<\/span><\/td>' \+/,
    `'<td class="text-center"><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td class="text-center" style="vertical-align:middle;">' + tipoOrdBadge + '</td>' +`
);

// 3. Fix the tr row (with items) to inject the TIPO ORDEN cell correctly
logicaEntradas = logicaEntradas.replace(
    /'<td class="text-center" style="vertical-align:middle;">' \+ \(isFirst \? tipoOrdBadge : ''\) \+ '<span class="badge bg-secondary fw-normal" style="font-size:0\.72rem;">' \+ _entEsc\(d\.id \|\| ''\) \+ '<\/span><\/td>' \+/,
    `'<td class="text-center" style="vertical-align:middle;"><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td class="text-center" style="vertical-align:middle;">' + (isFirst ? tipoOrdBadge : '') + '</td>' +`
);

fs.writeFileSync(pathLogicaEntradas, logicaEntradas);
console.log('Patched entradas/logica.js successfully');

// --- Now for inventario/logica.js ---

const pathLogicaInv = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let logicaInv = fs.readFileSync(pathLogicaInv, 'utf8');

// Inside _invRenderCard, check if d.tipo === 'Servicio' (or id starts with SERV) and render a compact card
const newCardLogic = `function _invRenderCard(d) {
    var id = _invEsc(d.id || '');
    
    // Checkbox modo selección
    var chkHtml = window._invModoSeleccion
        ? '<input type="checkbox" class="form-check-input" '
          + 'style="position:absolute;top:12px;left:12px;width:18px;height:18px;z-index:5;cursor:pointer;" '
          + 'onchange="window._invToggleCheck(\\'' + id + '\\',this.checked)" onclick="event.stopPropagation()">'
        : '';

    var clickAttr = window._invModoSeleccion
        ? 'onclick="var cb=this.querySelector(\\'input[type=checkbox]\\');if(cb){cb.checked=!cb.checked;window._invToggleCheck(\\'' + id + '\\',cb.checked);}"'
        : 'onclick="window.abrirDetalleInv(\\'' + id + '\\')"';

    var desc   = _invEsc(d.descripcion || d.articulo || '');

    // Is it a service?
    var isService = d.tipo === 'Servicio' || id.startsWith('SERV');

    if (isService) {
        return '<div data-id="' + id + '" ' + clickAttr + ' style="position:relative; background-color:white; border-radius:0.75rem; padding:0.75rem 1rem; box-shadow:0 1px 2px 0 rgba(0,0,0,0.05); border:1px solid rgba(243,244,246,0.5); display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem; cursor:pointer;">' +
            chkHtml +
            '<div style="width:2.5rem; height:2.5rem; border-radius:0.5rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; background-color:#fef3c7; color:#d97706;">' +
                '<i class="bi bi-briefcase-fill" style="font-size:1.2rem;"></i>' +
            '</div>' +
            '<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center;">' +
                '<div style="font-weight:600; color:#1e293b; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + desc + '</div>' +
                '<div style="color:#64748b; font-size:0.75rem;">' + id + ' <span style="margin:0 4px;">&bull;</span> <span class="badge bg-warning text-dark" style="font-size:0.6rem; letter-spacing:0.04em;">SERVICIO</span></div>' +
            '</div>' +
        '</div>';
    }

    // Semáforo de stock`;

logicaInv = logicaInv.replace(/function _invRenderCard\(d\) \{\s*var id = _invEsc\(d\.id \|\| ''\);\s*\/\/ Semáforo de stock/, newCardLogic);

fs.writeFileSync(pathLogicaInv, logicaInv);
console.log('Patched inventario/logica.js successfully');
