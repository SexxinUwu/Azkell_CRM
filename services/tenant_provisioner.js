/**
 * services/tenant_provisioner.js — Azkell ERP Multi-Tenant SaaS
 * Servicio de autoprovisionamiento instantáneo de bases de datos y usuarios iniciales por empresa.
 */

const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const { initDB } = require('../init_db');
const { getMasterPool, getTenantPool } = require('./tenant_master');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_SSL = process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined;

/**
 * Autoprovisiona una nueva empresa cliente (Tenant) en el SaaS.
 */
async function provisionNewTenant({ slug, nombre_empresa, ruc, admin_email, admin_password, plan = 'Profesional', max_unidades = 100 }) {
    if (!slug || !nombre_empresa || !admin_email || !admin_password) {
        throw new Error('Parametros incompletos para provisionar empresa (slug, nombre_empresa, admin_email, admin_password)');
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) throw new Error('Subdominio (slug) no valido');

    const dbName = `azkell_tenant_${cleanSlug}`;

    // 1. Crear base de datos física para la nueva empresa
    await new Promise((resolve, reject) => {
        const rootConn = mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            port: DB_PORT,
            ssl: DB_SSL
        });

        rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, (err) => {
            rootConn.end();
            if (err) return reject(new Error(`Error creando la base de datos ${dbName}: ` + err.message));
            resolve();
        });
    });

    console.log(`✨ [Multi-Tenant] Base de datos creada: ${dbName}`);

    // 2. Obtener pool de la nueva base de datos e inicializar todas las tablas del ERP
    const tenantPool = getTenantPool(dbName);
    await initDB(tenantPool);

    // 3. Crear el rol Administrador y el Usuario Admin Inicial en la nueva base de datos
    const hashPassword = await bcrypt.hash(admin_password, 10);
    const userId = 'USR-' + Math.floor(1000 + Math.random() * 9000);

    await new Promise((resolve, reject) => {
        const sqlUser = `
        INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado)
        VALUES (?, ?, ?, ?, ?, ?, 'Administrador', 'Activo')
        ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password = VALUES(password);
        `;
        tenantPool.query(sqlUser, [userId, 'Administrador ' + nombre_empresa, 'Gerente General', admin_email.trim().toLowerCase(), hashPassword, admin_password], (err) => {
            if (err) console.warn('[Multi-Tenant] Advertencia creando admin inicial:', err.message);
            resolve();
        });
    });

    // 4. Registrar el tenant en la base de datos Maestra azkell_master
    const masterPool = getMasterPool();
    await new Promise((resolve, reject) => {
        const sqlMaster = `
        INSERT INTO empresas (slug, nombre_empresa, ruc, db_name, estado, plan, max_unidades, admin_email)
        VALUES (?, ?, ?, ?, 'activo', ?, ?, ?)
        ON DUPLICATE KEY UPDATE nombre_empresa = VALUES(nombre_empresa), ruc = VALUES(ruc), plan = VALUES(plan);
        `;
        masterPool.query(sqlMaster, [cleanSlug, nombre_empresa.trim(), (ruc || '').trim(), dbName, plan, max_unidades, admin_email.trim().toLowerCase()], (err) => {
            if (err) return reject(new Error('Error registrando empresa en azkell_master: ' + err.message));
            resolve();
        });
    });

    console.log(`🚀 [Multi-Tenant] Empresa [${nombre_empresa}] (subdominio: ${cleanSlug}.azkell.com) provisionada con exito.`);

    return {
        ok: true,
        slug: cleanSlug,
        subdomain: `${cleanSlug}.azkell.com`,
        db_name: dbName,
        admin_email: admin_email
    };
}

module.exports = {
    provisionNewTenant
};
