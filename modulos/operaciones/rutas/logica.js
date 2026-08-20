// Módulo: Control de Rutas y Viajes
window.init_operaciones_rutas = function() {
    console.log('Inicializado módulo Control de Rutas y Viajes');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_operaciones_rutas();
} else {
    document.addEventListener('DOMContentLoaded', window.init_operaciones_rutas);
}
