// Módulo: Incidencias en Ruta
window.init_mantenimiento_incidencias_ruta = function() {
    console.log('Inicializado módulo Incidencias en Ruta');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_mantenimiento_incidencias_ruta();
} else {
    document.addEventListener('DOMContentLoaded', window.init_mantenimiento_incidencias_ruta);
}
