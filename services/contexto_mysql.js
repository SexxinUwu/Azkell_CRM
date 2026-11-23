'use strict';
// Evita que una consulta anidada caiga en la base equivocada.
//
// El servidor guarda la empresa de cada petición en un AsyncLocalStorage y el proxy `db` de server.js la usa para elegir el pool.
// Con la API de callbacks de mysql2, el callback de una consulta se ejecuta desde el contexto de la conexión y no desde el de
// la petición: ahí el proxy `db` perdía la empresa y usaba la base por defecto (Marsisa). Una consulta anidada de Rosymar
// (por ejemplo, el catálogo de rampas) podía leer o escribir en Marsisa.
//
// Aquí cada callback que se pasa a query/execute/getConnection se ata al contexto de quien lo pidió. Se parchea el prototipo
// que define esos métodos (mysql2 no deja importar sus archivos internos), así que cubre todos los pools (el de cada empresa
// y el de por defecto) y sus conexiones.
const { AsyncResource } = require('async_hooks');
const mysql = require('mysql2');

function protoDe(inicio, nombre) {
    for (let p = inicio; p; p = Object.getPrototypeOf(p)) {
        if (Object.prototype.hasOwnProperty.call(p, nombre)) return p;
    }
    return null;
}

function atarCallbacks(inicio, nombres) {
    for (const nombre of nombres) {
        const proto = protoDe(inicio, nombre);
        const original = proto && proto[nombre];
        if (typeof original !== 'function' || original.__contextoAtado) continue;
        const envuelta = function (...args) {
            for (let i = 0; i < args.length; i++) {
                if (typeof args[i] === 'function') args[i] = AsyncResource.bind(args[i]);
            }
            return original.apply(this, args);
        };
        envuelta.__contextoAtado = true;
        proto[nombre] = envuelta;
    }
}

atarCallbacks(mysql.Pool.prototype, ['query', 'execute', 'getConnection']);
atarCallbacks(mysql.Connection.prototype, ['query', 'execute']);
atarCallbacks(mysql.PoolConnection.prototype, ['query', 'execute']);
