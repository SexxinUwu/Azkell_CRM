/**
 * services/tenant_provisioner.js — Azkell ERP Multi-Tenant SaaS
 * Servicio de autoprovisionamiento instantáneo de bases de datos y usuarios iniciales por empresa.
 */

const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('child_process');
const path = require('path');
const { sembrarEmpresa } = require('./tenant_seeds');
const { getMasterPool, getTenantPool, exigirDBUser } = require('./tenant_master');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_SSL = process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined;

/** URL de una base de empresa para Prisma (la contraseña va en la URL y nunca se imprime) */
function urlDeBase(dbName) {
    exigirDBUser();
    const ssl = process.env.DB_SSL === 'true' ? '?sslaccept=accept_invalid_certs' : '';
    return `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${dbName}${ssl}`;
}

/**
 * Crea la estructura de la base nueva con las migraciones de Prisma (mismo comando que npm run db:deploy).
 * El esquema depende solo de prisma/schema/migrations: ya no se crean tablas al vuelo.
 */
function migrarEmpresa(dbName) {
    const raiz = path.join(__dirname, '..');
    const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: raiz,
        env: { ...process.env, DATABASE_URL: urlDeBase(dbName) },
        encoding: 'utf8',
        shell: true,
    });
    if (r.status !== 0) {
        const lineas = `${r.stdout || ''}${r.stderr || ''}`.split(/\r?\n/);
        const detalle = lineas.filter(l => l.trim() && !/mysql:\/\//.test(l)).slice(-4).join(' | ');
        throw new Error(`Migraciones de Prisma fallidas en ${dbName}: ${detalle}`);
    }
}

/**
 * Autoprovisiona una nueva empresa cliente (Tenant) en el SaaS.
 */
async function provisionNewTenant({ slug, nombre_empresa, ruc, admin_email, admin_password, plan = 'Profesional', max_unidades = 100 }) {
    exigirDBUser();
    if (!slug || !nombre_empresa || !admin_email || !admin_password) {
        throw new Error('Parametros incompletos para provisionar empresa (slug, nombre_empresa, admin_email, admin_password)');
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) throw new Error('Subdominio (slug) no valido');
    // Nombres que usan los sitios y servicios de Azkell: ninguna empresa puede tomarlos
    if (['www', 'app', 'azkell', 'fleet', 'admin', 'master', 'seguridad', 'api'].includes(cleanSlug)) {
        throw new Error(`El subdominio "${cleanSlug}" está reservado.`);
    }

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

    // 2. Estructura desde las migraciones de Prisma; datos iniciales con semillas idempotentes
    migrarEmpresa(dbName);
    const tenantPool = getTenantPool(dbName);
    await sembrarEmpresa(tenantPool);
    try {
        await tenantPool.promise().query(`USE \`${dbName}\``);
        await tenantPool.promise().query("INSERT INTO configuracion_erp (clave, valor) VALUES ('empresa_nombre', ?) ON DUPLICATE KEY UPDATE valor = ?", [nombre_empresa.trim(), nombre_empresa.trim()]);
    } catch(e) {}

    // 3. Crear el rol Administrador y el Usuario Admin Inicial en la nueva base de datos
    const hashPassword = await bcrypt.hash(admin_password, 10);
    const userId = 'USR-' + Math.floor(1000 + Math.random() * 9000);

    await new Promise((resolve, reject) => {
        const sqlUser = `
        INSERT INTO \`${dbName}\`.usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, rol_id, permisos_json)
        VALUES (?, ?, ?, ?, ?, ?, 'Administrador', 'Activo', 1, '{"admin":true}')
        ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password = VALUES(password), password_visible = VALUES(password_visible), rol_id = 1, permisos_json = '{"admin":true}';
        `;
        tenantPool.query(sqlUser, [userId, 'Administrador ' + nombre_empresa, 'Gerente General', admin_email.trim().toLowerCase(), hashPassword, admin_password], (err) => {
            if (err) {
                console.error('[Multi-Tenant] Error creando admin inicial:', err.message);
                return reject(new Error('Error creando usuario Administrador inicial: ' + err.message));
            }
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
    migrarEmpresa,
    provisionNewTenant
};
