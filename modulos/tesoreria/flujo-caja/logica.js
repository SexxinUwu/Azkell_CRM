// Módulo: Flujo de Caja
window.init_tesoreria_flujo_caja = function() {
    console.log('Inicializado módulo Flujo de Caja');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_flujo_caja();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_flujo_caja);
}
