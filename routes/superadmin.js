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
        const masterKey = req.headers['x-master-key'] || req.query.master_key;
        const SECRET_MASTER_KEY = process.env.MASTER_KEY || 'azkell_saas_secret_2026';

        // Permitir peticiones si cuenta con la clave master o si es un usuario administrador en sesión
        if (masterKey === SECRET_MASTER_KEY || (req.user && (req.user.rol === 'Fundador' || req.user.rol === 'SuperAdmin'))) {
            return next();
        }

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
