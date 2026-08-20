// Módulo: Asistencia y Turnos
window.init_rrhh_asistencia = function() {
    console.log('Inicializado módulo Asistencia y Turnos');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_rrhh_asistencia();
} else {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_asistencia);
}
