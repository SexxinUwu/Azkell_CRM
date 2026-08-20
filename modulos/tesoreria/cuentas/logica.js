// Módulo: Cuentas por Cobrar y Pagar
window.init_tesoreria_cuentas = function() {
    console.log('Inicializado módulo Cuentas por Cobrar y Pagar');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_cuentas();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_cuentas);
}
