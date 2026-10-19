/**
 * services/tenant_seeds.js — Datos iniciales de una empresa (solo datos, sin DDL).
 * La estructura la crean las migraciones de Prisma (prisma/schema/migrations). Este módulo
 * carga los catálogos base con INSERT IGNORE: es idempotente y no cambia datos existentes.
 * Lo usa services/tenant_provisioner.js al dar de alta una empresa nueva.
 */

const { DEFAULT_MARCAS, DEFAULT_MEDIDAS, DEFAULT_MODELOS, DEFAULT_ACCIONES } = require('./catalogos_neumaticos');

/** Carga las semillas en la base de una empresa. `pool` debe estar conectado a esa base. */
async function sembrarEmpresa(pool) {
    const promisePool = pool.promise ? pool.promise() : pool;
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_nombre', 'Azkell Fleet')");
        await promisePool.query("INSERT IGNORE INTO configuracion_erp (clave, valor) VALUES ('empresa_logo', '')");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (1, 'Administrador', '#5865F2', '{\"admin\":true}', 1, 1)");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (2, 'Tesorería', '#10b981', '{\"dashboard\":{\"l\":1},\"tesoreria_caja\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_liquidaciones\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_cuentas\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_bancos\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0},\"tesoreria_centros_costos\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0}}', 0, 2)");
        await promisePool.query("INSERT IGNORE INTO roles (id, nombre, color, permisos_json, es_admin, orden) VALUES (3, 'Conductor', '#22c55e', '{\"dashboard\":{\"l\":0},\"conductor_portal\":{\"l\":1,\"c\":1,\"e\":1,\"d\":0}}', 0, 3)");
        
        // Catálogos semillas predeterminados (INSERT IGNORE garantiza no alterar Marsisa ni datos existentes)
        await promisePool.query("INSERT IGNORE INTO cat_situaciones (id, codigo, descripcion) VALUES (1, 'S01', 'En Espera'), (2, 'S02', 'En Diagnóstico'), (3, 'S03', 'En Reparación'), (4, 'S04', 'Finalizada')");
        await promisePool.query("INSERT IGNORE INTO tipos_mantenimiento (id, tipo_mp, marca, descripcion) VALUES (1, 'MP1', 'TODOS', 'Mantenimiento Preventivo 1'), (2, 'MP2', 'TODOS', 'Mantenimiento Preventivo 2'), (3, 'MP3', 'TODOS', 'Mantenimiento Preventivo 3')");

        // Almacén principal del sistema (antes lo creaba routes/almacen.js en cada petición)
    await promisePool.query("INSERT IGNORE INTO almacen_almacenes (nombre, descripcion, es_sistema, activo, orden) VALUES ('Principal', 'Almacén Principal Central del ERP', 1, 1, 1)");

    // Catálogos Neumáticos - Semillas
        for (const m of DEFAULT_MARCAS) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_marcas (nombre) VALUES (?)", [m]);
        }

        for (const med of DEFAULT_MEDIDAS) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_medidas (nombre) VALUES (?)", [med]);
        }

        for (const ac of DEFAULT_ACCIONES) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_acciones (nombre) VALUES (?)", [ac]);
        }

        for (const mod of DEFAULT_MODELOS) {
            await promisePool.query("INSERT IGNORE INTO cat_neumaticos_modelos (nombre) VALUES (?)", [mod]);
        }

}

module.exports = { sembrarEmpresa };
