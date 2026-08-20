// Módulo: Caja Chica y Gastos
window.init_tesoreria_caja_chica = function() {
    console.log('Inicializado módulo Caja Chica y Gastos');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_caja_chica();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_caja_chica);
}
