/**
 * routes/superadmin.js — Azkell ERP Multi-Tenant SaaS
 * Módulo de Administración de Empresas (Tenants) para Azkell SaaS.
 */

const express = require('express');
const { getMasterPool } = require('../services/tenant_master');
const { provisionNewTenant } = require('../services/tenant_provisioner');

module.exports = function () {
    const router = express.Router();

    // ── Middleware de Seguridad SuperAdmin (Requiere Clave de Acceso Master) ──
    router.use((req, res, next) => {
        // Solo con sesión de Fundador/SuperAdmin (ya verificada por verifyToken, montado antes).
        // El dominio o "localhost" no dan acceso: la cabecera Host la escribe quien hace la petición.
        // La antigua clave maestra (X-Master-Key) se eliminó: su valor estaba publicado en el frontend.
        const esFundador = req.user && (
            (req.user.correo || '').toLowerCase() === 'admin@azkell.com' ||
            req.user.rol === 'Fundador' || req.user.rol === 'SuperAdmin');

        if (esFundador) return next();

        // Si se llama desde la API local o para crear empresa durante onboarding inicial
        if (req.method === 'POST' && req.path === '/empresas' && process.env.ALLOW_PUBLIC_REGISTRATION === 'true') {
            return next();
        }

        return res.status(401).json({ error: 'Acceso no autorizado al panel SuperAdmin de Azkell SaaS' });
    });

    // ── GET /api/superadmin/empresas (Listar todas las empresas del SaaS) ────
    router.get('/empresas', (req, res) => {
        const masterPool = getMasterPool();
        masterPool.query('SELECT * FROM empresas ORDER BY id DESC', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // ── POST /api/superadmin/empresas (Crear y autoprovisionar una nueva empresa) ─
    router.post('/empresas', async (req, res) => {
        try {
            const { slug, nombre_empresa, ruc, admin_email, admin_password, plan, max_unidades } = req.body;
            const result = await provisionNewTenant({
                slug,
                nombre_empresa,
                ruc,
                admin_email,
                admin_password,
                plan,
                max_unidades
            });
            res.json(result);
        } catch (err) {
            console.error('Error al provisionar nueva empresa:', err);
            res.status(400).json({ error: err.message });
        }
    });

    // ── PUT /api/superadmin/empresas/:id (Editar plan, límite de unidades, datos y estado) ─
    router.put('/empresas/:id', (req, res) => {
        const id = req.params.id;
        const { nombre_empresa, ruc, plan, max_unidades, estado, admin_email } = req.body;

        const masterPool = getMasterPool();
        const sql = `
        UPDATE empresas 
        SET nombre_empresa = COALESCE(?, nombre_empresa),
            ruc = COALESCE(?, ruc),
            plan = COALESCE(?, plan),
            max_unidades = COALESCE(?, max_unidades),
            estado = COALESCE(?, estado),
            admin_email = COALESCE(?, admin_email)
        WHERE id = ?;
        `;
        masterPool.query(sql, [nombre_empresa, ruc, plan, max_unidades, estado, admin_email, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id });
        });
    });

    // ── PUT /api/superadmin/empresas/:id/estado (Activar / Suspender empresa) ─
    router.put('/empresas/:id/estado', (req, res) => {
        const id = req.params.id;
        const { estado } = req.body;
        if (!['activo', 'suspendido', 'demo'].includes(estado)) {
            return res.status(400).json({ error: 'Estado no valido' });
        }

        const masterPool = getMasterPool();
        masterPool.query('UPDATE empresas SET estado = ? WHERE id = ?', [estado, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id, estado });
        });
    });

    return router;
};
