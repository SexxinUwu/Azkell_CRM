// Almacén de flota: la pantalla se rehízo en la versión nueva (React, /flota/almacen-flota) con su propio stock.
// Esta versión actual ya no tiene contrato con el servidor, así que solo abre la nueva.
// Se usa window.location.assign porque la versión nueva es otra aplicación, no una pantalla de este router.
(function () {
    window.init_flota_almacen_flota = function () {
        window.location.assign('/app/flota/almacen-flota');
    };
})();
