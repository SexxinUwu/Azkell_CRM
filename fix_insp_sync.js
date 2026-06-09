const fs = require('fs');
const file = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/mantenimiento/inspecciones/logica.js';
let content = fs.readFileSync(file, 'utf8');

// Fix i_dias null reference in procesarGuardadoInspeccion
content = content.replace(
    /let dias = document\.getElementById\('i_dias'\)\.value \|\| "30";/g,
    "let iDias = document.getElementById('i_dias'); let dias = iDias ? (iDias.value || '30') : '30';"
);

// Add window.ensureInspConfig at the top or anywhere safe
if (!content.includes('window.ensureInspConfig')) {
    const configFn = `
window.ensureInspConfig = function() {
    if (window.DYNAMIC_INSP_SCHEMA && window.DYNAMIC_INSP_SCHEMA.length > 0) return Promise.resolve();
    if (typeof window.rotToast === 'function') window.rotToast("Cargando módulos...", "bg-info");
    return fetch('/api/mantenimiento/inspecciones/config')
        .then(r => r.json())
        .then(res => {
            if (res.ok && res.data) {
                window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                    let parsedItems = [];
                    try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                    return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
        }).catch(e => { console.error("Error al cargar cfg inspecciones", e); window.DYNAMIC_INSP_SCHEMA = []; });
};
`;
    // Insert right after window.DYNAMIC_INSP_SCHEMA = window.DYNAMIC_INSP_SCHEMA || [];
    content = content.replace(
        "window.DYNAMIC_INSP_SCHEMA = window.DYNAMIC_INSP_SCHEMA || [];",
        "window.DYNAMIC_INSP_SCHEMA = window.DYNAMIC_INSP_SCHEMA || [];\n" + configFn
    );
}

// Wrap render logic in abrirModalNuevaInspeccion
let nuevaInspTarget = `    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');`;

let nuevaInspReplacement = `    window.ensureInspConfig().then(() => {
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');`;

let nuevaInspEndTarget = `        new bootstrap.Offcanvas(offEl).show();
    }
};`;

let nuevaInspEndReplacement = `        new bootstrap.Offcanvas(offEl).show();
    }
    }); // end ensureInspConfig
};`;

content = content.replace(nuevaInspTarget, nuevaInspReplacement);
content = content.replace(nuevaInspEndTarget, nuevaInspEndReplacement);


// Wrap render logic in abrirModalEditarInspeccion
let editInspTarget = `    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if(formEl) formEl.reset();`;

let editInspReplacement = `    window.ensureInspConfig().then(() => {
    window.renderModernInspForm();

    let formEl = document.getElementById('formNuevaInspeccion');
    if(formEl) formEl.reset();`;

let editInspEndTarget = `        new bootstrap.Offcanvas(offEl).show();
    }
};`;

let editInspEndReplacement = `        new bootstrap.Offcanvas(offEl).show();
    }
    }); // end ensureInspConfig
};`;

content = content.replace(editInspTarget, editInspReplacement);
content = content.replace(editInspEndTarget, editInspEndReplacement);


// verDetalleInspeccion wrapper
let verInspTarget = `    window.renderModernInspForm();
    let modObj = document.getElementById('modalDetalleInspeccion');`;

let verInspReplacement = `    window.ensureInspConfig().then(() => {
    window.renderModernInspForm();
    let modObj = document.getElementById('modalDetalleInspeccion');`;

let verInspEndTarget = `        m.show();
    }
};`;

let verInspEndReplacement = `        m.show();
    }
    }); // end ensureInspConfig
};`;

content = content.replace(verInspTarget, verInspReplacement);
content = content.replace(verInspEndTarget, verInspEndReplacement);


fs.writeFileSync(file, content);
console.log("Inspecciones logic updated successfully!");
