// ============================================================
// 🏢 MÓDULO: STATUS "UNIDADES EN BASE" (SEGURIDAD)
// Cargado dinámicamente por cargarModuloAislado('seguridad/unidades-base')
// ============================================================

(function() {
    window.init_unidades_base = function() {
        console.log('🏢 Módulo Status Unidades en Base inicializado');
        window.subActualizarKPIs();
    };

    window.subRecargarVista = function() {
        window.mostrarToast('Vista actualizada', 'info', 2000);
        window.subActualizarKPIs();
    };

    window.subActualizarKPIs = function() {
        // Inicialización de contadores preliminares
        const elBase = document.getElementById('sub-kpi-en-base');
        const elRuta = document.getElementById('sub-kpi-en-ruta');
        const elTaller = document.getElementById('sub-kpi-en-taller');
        const elCap = document.getElementById('sub-kpi-capacidad');

        if (elBase) elBase.textContent = '0';
        if (elRuta) elRuta.textContent = '0';
        if (elTaller) elTaller.textContent = '0';
        if (elCap) elCap.textContent = '100%';
    };

    // Auto-ejecución inmediata si la vista ya está en el DOM
    if (document.getElementById('moduloSegUnidadesBase')) {
        window.init_unidades_base();
    }
})();
