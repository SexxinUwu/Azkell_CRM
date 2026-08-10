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
            else console.log(`✅ Base de datos Maestra SaaS [${MASTER_DB_NAME}] lista.`);
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

/**
 * Middleware para resolver el Tenant según Subdominio o Header.
 */
async function resolveTenantMiddleware(req, res, next) {
    let tenantSlug = req.headers['x-tenant-id'] || req.headers['x-tenant-slug'] || req.query.tenant_slug;

    if (!tenantSlug && req.headers.host) {
        const host = req.headers.host.toLowerCase().split(':')[0];
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
