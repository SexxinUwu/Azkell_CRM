// Módulo: Nómina y Pagos
window.init_rrhh_nomina = function() {
    console.log('Inicializado módulo Nómina y Pagos');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_rrhh_nomina();
} else {
    document.addEventListener('DOMContentLoaded', window.init_rrhh_nomina);
}
