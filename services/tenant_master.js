/**
 * services/tenant_master.js — Azkell ERP Multi-Tenant SaaS
 * Gestiona la base de datos maestra y la caché de pools de conexión por empresa.
 */

const mysql = require('mysql2');

const tenantPoolsMap = new Map();

// Configuración base de MySQL desde variables de entorno
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_SSL = process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : undefined;

// Pool Maestro
const MASTER_DB_NAME = process.env.MASTER_DB_NAME || 'azkell_master';

let masterPool = null;

function getMasterPool() {
    if (!masterPool) {
        masterPool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: MASTER_DB_NAME,
            port: DB_PORT,
            ssl: DB_SSL,
            charset: 'utf8mb4',
            waitForConnections: true,
            connectionLimit: 10,
            enableKeepAlive: true
        });

        // Crear la base de datos maestra y tabla empresas si no existen
        initMasterDatabase();
    }
    return masterPool;
}

function initMasterDatabase() {
    const rootConn = mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        port: DB_PORT,
        ssl: DB_SSL
    });

    rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${MASTER_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, (err) => {
        if (err) console.warn('[MasterDB] Advertencia al verificar BD maestra:', err.message);
        rootConn.end();

        // Inicializar tabla de empresas en azkell_master
        const sqlEmpresas = `
        CREATE TABLE IF NOT EXISTS empresas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            slug VARCHAR(50) NOT NULL UNIQUE,
            nombre_empresa VARCHAR(150) NOT NULL,
            ruc VARCHAR(20) DEFAULT NULL,
            db_name VARCHAR(100) NOT NULL UNIQUE,
            db_host VARCHAR(150) DEFAULT NULL,
            estado ENUM('activo', 'suspendido', 'demo') DEFAULT 'activo',
            plan VARCHAR(50) DEFAULT 'Profesional',
            max_unidades INT DEFAULT 100,
            admin_email VARCHAR(150) DEFAULT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        masterPool.query(sqlEmpresas, (err2) => {
            if (err2) console.warn('[MasterDB] Error al verificar tabla empresas:', err2.message);
            else {
                console.log(`✅ Base de datos Maestra SaaS [${MASTER_DB_NAME}] lista.`);
                sincronizarEsquemasGlobalesTenants();
            }
        });
    });
}

/**
 * Sincroniza automáticamente las estructuras y columnas faltantes de todas las BDs tenant
 * con la BD de referencia (azkell_tenant_marsisa) al iniciar el servidor.
 */
function sincronizarEsquemasGlobalesTenants() {
    const rootConn = mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        port: DB_PORT,
        ssl: DB_SSL
    });

    const refDb = process.env.DB_NAME || 'azkell_tenant_marsisa';

    rootConn.query("SHOW DATABASES LIKE 'azkell_tenant_%'", (err, dbs) => {
        if (err || !dbs || !dbs.length) {
            rootConn.end();
            return;
        }

        const tenantDbs = dbs.map(d => Object.values(d)[0]);

        rootConn.query(`SHOW TABLES FROM \`${refDb}\``, (errTab, refTables) => {
            if (errTab || !refTables || !refTables.length) {
                rootConn.end();
                return;
            }

            const tableList = refTables.map(t => Object.values(t)[0]);

            let pendingTasks = 0;
            tenantDbs.forEach(tDb => {
                if (tDb === refDb) return;

                tableList.forEach(table => {
                    pendingTasks++;
                    rootConn.query(`SHOW TABLES FROM \`${tDb}\` LIKE ?`, [table], (errChk, checkTab) => {
                        if (errChk) { pendingTasks--; return; }

                        if (!checkTab.length) {
                            rootConn.query(`SHOW CREATE TABLE \`${refDb}\`.\`${table}\``, (errC, createRes) => {
                                if (!errC && createRes && createRes.length) {
                                    let createSql = createRes[0]['Create Table'];
                                    rootConn.query(`USE \`${tDb}\``, () => {
                                        rootConn.query(createSql, (errCr) => {
                                            if (!errCr) console.log(`✅ Auto-sync: Tabla [${table}] creada en [${tDb}]`);
                                            pendingTasks--;
                                        });
                                    });
                                } else {
                                    // Si no está en refDb, revisar si está en TABLAS de init_db
                                    try {
                                        const { TABLAS } = require('../init_db');
                                        const found = TABLAS.find(t => t.nombre === table);
                                        if (found) {
                                            rootConn.query(`USE \`${tDb}\``, () => {
                                                rootConn.query(found.sql, () => { pendingTasks--; });
                                            });
                                        } else { pendingTasks--; }
                                    } catch(e) { pendingTasks--; }
                                }
                            });
                        } else {
                            rootConn.query(`SHOW COLUMNS FROM \`${refDb}\`.\`${table}\``, (errC1, colsRef) => {
                                if (errC1 || !colsRef) { pendingTasks--; return; }
                                rootConn.query(`SHOW COLUMNS FROM \`${tDb}\`.\`${table}\``, (errC2, colsTar) => {
                                    if (errC2 || !colsTar) { pendingTasks--; return; }
                                    const tarColNames = colsTar.map(x => x.Field);
                                    colsRef.forEach(col => {
                                        if (!tarColNames.includes(col.Field)) {
                                            let colDef = col.Type;
                                            if (col.Null === 'NO') colDef += ' NOT NULL';
                                            else colDef += ' NULL';
                                            if (col.Default !== null) {
                                                if (col.Default === 'CURRENT_TIMESTAMP') colDef += ' DEFAULT CURRENT_TIMESTAMP';
                                                else colDef += ` DEFAULT '${col.Default}'`;
                                            }
                                            const alterSql = `ALTER TABLE \`${tDb}\`.\`${table}\` ADD COLUMN \`${col.Field}\` ${colDef}`;
                                            rootConn.query(alterSql, (errAlt) => {
                                                if (!errAlt) console.log(`✅ Auto-sync: Columna [${table}.${col.Field}] agregada a [${tDb}]`);
                                            });
                                        }
                                    });
                                    pendingTasks--;
                                });
                            });
                        }
                    });
                });
            });

            setTimeout(() => { try { rootConn.end(); } catch(e){} }, 5000);
        });
    });
}

/**
 * Obtiene o crea el pool de conexiones MySQL para una empresa/tenant específico.
 */
function getTenantPool(dbName) {
    if (!dbName) return null;
    if (tenantPoolsMap.has(dbName)) {
        return tenantPoolsMap.get(dbName);
    }

    const pool = mysql.createPool({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: dbName,
        port: DB_PORT,
        ssl: DB_SSL,
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: 15,
        enableKeepAlive: true
    });

    tenantPoolsMap.set(dbName, pool);
    console.log(`🔌 [Multi-Tenant] Pool de conexión abierto para la BD: ${dbName}`);
    return pool;
}

async function resolveTenantMiddleware(req, res, next) {
    let tenantSlug = req.headers['x-tenant-id'] || req.headers['x-tenant-slug'] || req.query.tenant_slug;

    const host = (req.headers.host || '').toLowerCase().split(':')[0];
    const isRootDomain = host === 'azkell.com' || host === 'www.azkell.com';

    if (isRootDomain && !tenantSlug && !req.path.startsWith('/api') && !req.path.startsWith('/libs')) {
        if ((req.headers.accept && req.headers.accept.includes('text/html')) || req.path === '/' || req.path === '/Index.html') {
            return res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azkell ERP — Portal Corporativo</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            background: #090d16;
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            overflow-x: hidden;
            position: relative;
        }
        .bg-glow {
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(15,23,42,0) 70%);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 0;
            pointer-events: none;
        }
        .portal-card {
            position: relative;
            z-index: 1;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border-radius: 28px;
            padding: 48px 36px;
            max-width: 540px;
            width: 100%;
            text-align: center;
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
        }
        .logo-box {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            border-radius: 20px;
            font-size: 2rem;
            color: #fff;
            margin-bottom: 24px;
            box-shadow: 0 10px 25px rgba(37,99,235,0.35);
        }
        h1 {
            font-size: 1.75rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            margin-bottom: 12px;
            color: #fff;
        }
        p {
            font-size: 0.95rem;
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 28px;
        }
        .domain-box {
            background: rgba(255, 255, 255, 0.03);
            border: 1px dashed rgba(255, 255, 255, 0.15);
            border-radius: 16px;
            padding: 16px 20px;
            margin-bottom: 28px;
            text-align: left;
        }
        .domain-title {
            font-size: 0.75rem;
            font-weight: 700;
            color: #38bdf8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
        }
        .domain-url {
            font-family: monospace;
            font-size: 0.95rem;
            color: #e2e8f0;
            font-weight: 600;
        }
        .footer-text {
            font-size: 0.75rem;
            color: #64748b;
            margin-top: 24px;
        }
    </style>
</head>
<body>
    <div class="bg-glow"></div>
    <div class="portal-card">
        <div class="logo-box">
            <i class="bi bi-shield-lock-fill"></i>
        </div>
        <h1>Portal de Acceso Corporativo</h1>
        <p>Para ingresar al sistema ERP, debe hacerlo a través del subdominio exclusivo asignado a su empresa.</p>
        
        <div class="domain-box">
            <div class="domain-title"><i class="bi bi-link-45deg me-1"></i>Formato de acceso:</div>
            <div class="domain-url">https://tu-empresa.azkell.com</div>
        </div>

        <div class="footer-text">
            &copy; 2026 Azkell ERP — Plataforma de Gestión de Flota y Mantenimiento.
        </div>
    </div>
</body>
</html>
            `);
        }
    }

    if (!tenantSlug && req.headers.host) {
        const parts = host.split('.');

        if (parts.length >= 3 || (host.includes('localhost') && parts.length >= 2)) {
            const sub = parts[0];
            if (sub !== 'www' && sub !== 'app' && sub !== 'azkell') {
                tenantSlug = sub;
            }
        }
    }

    // Si se accede desde admin.azkell.com o no se especifica tenant, usar la Base de Datos por defecto para autenticación/configuración y masterPool para gestión de empresas
    if (!tenantSlug || tenantSlug === 'admin' || tenantSlug === 'master') {
        req.tenantSlug = 'master';
        req.db = getTenantPool(process.env.DB_NAME || 'azkell_tenant_marsisa');
        return next();
    }

    const master = getMasterPool();
    master.query('SELECT * FROM empresas WHERE slug = ? OR db_name = ? LIMIT 1', [tenantSlug, tenantSlug], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            req.tenantSlug = tenantSlug;
            req.db = getTenantPool(process.env.DB_NAME || 'azkell_tenant_marsisa');
            return next();
        }

        const tenant = rows[0];
        if (tenant.estado === 'suspendido') {
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.status(403).send(`
                    <!DOCTYPE html>
                    <html lang="es">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Acceso Suspendido — Azkell ERP</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
                        <style>
                            body { background: #0f172a; color: #fff; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                            .susp-card { background: #1e293b; border: 1px solid #334155; border-radius: 24px; padding: 40px 32px; max-width: 500px; width: 100%; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
                            .icon-box { width: 80px; height: 80px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 2.5rem; margin-bottom: 24px; }
                            .contact-btn { background: #0284c7; color: #fff; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 12px; display: inline-block; transition: background 0.2s; }
                            .contact-btn:hover { background: #0369a1; color: #fff; }
                        </style>
                    </head>
                    <body>
                        <div class="susp-card">
                            <div class="icon-box"><i class="bi bi-shield-lock-fill"></i></div>
                            <h3 class="fw-bold mb-2">Servicio Suspendido Temporalmente</h3>
                            <p class="text-white-50 small mb-4">El acceso para <strong>${tenant.nombre_empresa}</strong> ha sido pausado. Por favor, comuníquese con administración para regularizar su suscripción.</p>
                            <div class="p-3 rounded-3 mb-4" style="background:#0f172a; border:1px solid #334155;">
                                <div class="text-white-50 small">Soporte y Atención al Cliente:</div>
                                <div class="fw-bold fs-6 text-warning mt-1"><i class="bi bi-envelope-fill me-1"></i> azkellfleet@gmail.com</div>
                            </div>
                            <a href="mailto:azkellfleet@gmail.com?subject=Soporte%20Suscripcion%20-${encodeURIComponent(tenant.nombre_empresa)}" class="contact-btn w-100">
                                <i class="bi bi-headset me-2"></i> Contactar a Soporte
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
            return res.status(403).json({ error: 'La cuenta de su empresa se encuentra suspendida temporalmente. Contacte a soporte: azkellfleet@gmail.com' });
        }

        req.tenantInfo = tenant;
        req.tenantSlug = tenant.slug;
        req.db = getTenantPool(tenant.db_name);
        next();
    });
}

module.exports = {
    getMasterPool,
    getTenantPool,
    resolveTenantMiddleware
};
