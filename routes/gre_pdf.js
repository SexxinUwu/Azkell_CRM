// PDF propio de la GRE Transportista y plantilla del documento (por empresa).
// La plantilla vive en integraciones_api (clave gre_pdf_plantilla, JSON): no hay migración ni DDL.
// Montado en /api/operaciones/gre (antes del router de guías); el prefijo /operaciones ya está cubierto por los permisos.
const express = require('express');
const multer = require('multer');
const { uploadToS3, getPresignedUrlEstable, s3KeyFromUrl } = require('../utils/s3');
const Apisunat = require('../services/apisunatService');
const G = require('../services/gre_pdf');

const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const TIPOS_LOGO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

module.exports = (db) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[gre_pdf] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };

    // El logo se guarda en S3 (el bucket es privado): para pintarlo en el PDF se firma su URL
    const leerS3 = async url => (/amazonaws\.com/.test(String(url)) ? getPresignedUrlEstable(s3KeyFromUrl(url)) : url);

    async function plantillaGuardada(req) {
        const [r] = await P(req).query('SELECT valor FROM integraciones_api WHERE clave = ? LIMIT 1', [G.CLAVE_PLANTILLA]).catch(() => [[]]);
        return G.normalizarPlantilla(r && r[0] ? r[0].valor : null);
    }

    const enviarPdf = (res, pdf, nombre, descargar) => {
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${String(nombre).replace(/[^\w.-]/g, '_')}.pdf"`,
            'Cache-Control': 'no-store',
        });
        res.send(pdf);
    };

    // ── PDF de una guía emitida (GRE Transportista) ──
    router.get('/guias/:id/pdf-propio', async (req, res) => {
        try {
            const [r] = await P(req).query(`SELECT * FROM gre_guias WHERE id = ? AND origen = 'EMITIDA' AND tipo = 'TRANSPORTISTA' LIMIT 1`, [Number(req.params.id) || 0]);
            if (!r.length) throw aviso('Guía emitida no encontrada.', 404);
            const fila = r[0];
            // Estado y CDR al día: si APISUNAT ya la aceptó, el sello y el QR de SUNAT salen aunque aún no se haya pulsado «Actualizar estado»
            let estado = fila.apisunat_status;
            let cdr = fila.cdr_url;
            if (fila.apisunat_document_id && (estado !== 'ACEPTADO' || !cdr)) {
                try {
                    const cfg = await Apisunat.getConfigEmpresa(getDb(req));
                    const x = await Apisunat.getById(fila.apisunat_document_id, cfg.base_url);
                    if (x && x.ok) { estado = x.status || estado; cdr = x.cdr || cdr; }
                } catch (e) { /* se imprime con lo guardado */ }
            }
            const modelo = G.modeloDesdeFila(fila, { estado });
            const qrUrl = await G.urlQrDeCdr(cdr);
            const pdf = await G.generarPdf(modelo, await plantillaGuardada(req), { qrUrl, qrPrueba: modelo.prueba, leerS3 });
            enviarPdf(res, pdf, modelo.numero, req.query.descargar === '1');
        } catch (err) { responder(res, err, 'pdf-propio'); }
    });

    // ── Plantilla: valores actuales (ya completados con los por defecto) ──
    router.get('/pdf-plantilla', async (req, res) => {
        try { res.json({ ok: true, plantilla: await plantillaGuardada(req), defecto: G.normalizarPlantilla({}) }); } catch (err) { responder(res, err, 'plantilla'); }
    });

    // ── Vista previa: PDF de ejemplo con la plantilla que viene del formulario (no guarda nada) ──
    router.post('/pdf-plantilla/preview', async (req, res) => {
        try {
            const plantilla = G.normalizarPlantilla((req.body || {}).plantilla);
            const pdf = await G.generarPdf(G.modeloEjemplo(plantilla), plantilla, {
                qrUrl: 'https://e-factura.sunat.gob.pe/v1/contribuyente/gre/comprobantes/descargaqr?hashqr=EJEMPLO', leerS3,
            });
            enviarPdf(res, pdf, 'vista-previa', false);
        } catch (err) { responder(res, err, 'preview'); }
    });

    // ── Logo de la plantilla: se sube a S3 y se devuelve su URL (la pantalla la guarda con la plantilla) ──
    router.post('/pdf-plantilla/logo', subir.single('logo'), async (req, res) => {
        try {
            if (!req.file) throw aviso('Elige una imagen PNG, JPG o WebP.');
            const ext = TIPOS_LOGO[req.file.mimetype];
            if (!ext) throw aviso('El logo debe ser PNG, JPG o WebP.');
            const url = await uploadToS3(req.file.buffer, `operaciones/plantilla-guias/logo_${Date.now()}.${ext}`, req.file.mimetype);
            res.json({ ok: true, url });
        } catch (err) { responder(res, err, 'logo'); }
    });

    return router;
};
