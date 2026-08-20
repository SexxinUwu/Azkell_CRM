// Módulo: Gestión de Personal
window.init_rrhh_personal = function() {
    console.log('Inicializado módulo Gestión de Personal');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_rrhh_personal();
} else {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_personal);
}
