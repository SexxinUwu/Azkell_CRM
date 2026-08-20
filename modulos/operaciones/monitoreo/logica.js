// Módulo: Monitoreo de Operaciones
window.init_operaciones_monitoreo = function() {
    console.log('Inicializado módulo Monitoreo de Operaciones');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_operaciones_monitoreo();
} else {
    document.addEventListener('DOMContentLoaded', window.init_operaciones_monitoreo);
}
