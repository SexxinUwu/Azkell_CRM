// ==========================================
// 📋 MÓDULO: AUDITORÍA Y LOGS (SPA)
// ==========================================

// Variable global expuesta en window para sobrevivir entre recargas del módulo
window.dataGlobalAuditoria = window.dataGlobalAuditoria || [];

function cargarTablaAuditoria(forzarRefresh = false) {
    if (!forzarRefresh && window.dataGlobalAuditoria.length > 0) {
        mostrarAuditoria(window.dataGlobalAuditoria);
        return;
    }
    document.getElementById('cuerpoTablaAuditoria').innerHTML =
        '<tr><td colspan="4" class="text-center py-4"><span class="spinner-border text-warning spinner-border-sm"></span> Cargando bitácora...</td></tr>';
    google.script.run.withSuccessHandler(mostrarAuditoria).obtenerDatosAuditoria();
}

function mostrarAuditoria(datos) {
    if (procesadorErroresCuota(datos, 'cuerpoTablaAuditoria')) return;
    window.dataGlobalAuditoria = datos;
    let html = '';
    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="4" class="text-center py-4" style="color:var(--subtext)!important">Aún no hay registros de actividad.</td></tr>';
    } else {
        datos.forEach(fila => {
            const badge = fila[2] === 'CREÓ'
                ? '<span class="badge bg-success">CREÓ</span>'
                : fila[2] === 'MODIFICÓ'
                    ? '<span class="badge bg-warning text-dark">MODIFICÓ</span>'
                    : '<span class="badge bg-danger">ELIMINÓ</span>';
            html += `<tr>
                <td style="color:var(--subtext)!important"><i class="bi bi-clock"></i> ${fila[0]}</td>
                <td class="fw-bold">${fila[1]}</td>
                <td>${badge}</td>
                <td class="text-wrap">${fila[3]}</td>
            </tr>`;
        });
    }
    document.getElementById('cuerpoTablaAuditoria').innerHTML = html;
}

// ==========================================
// 🚀 INIT — llamado por cargarModuloAislado
// ==========================================
window.init_auditoria = function() {
    if (typeof cargarTablaAuditoria === 'function') cargarTablaAuditoria();
};
