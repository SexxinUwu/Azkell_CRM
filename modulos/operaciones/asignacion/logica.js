// Módulo: Asignación de Unidades
window.init_operaciones_asignacion = function() {
    console.log('Inicializado módulo Asignación de Unidades');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_operaciones_asignacion();
} else {
    document.addEventListener('DOMContentLoaded', window.init_operaciones_asignacion);
}
