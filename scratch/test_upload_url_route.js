const express = require('express');
const http = require('http');
require('dotenv').config();

const almacenFactory = require('../routes/almacen');

async function testUploadUrl() {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.db = {
            query: (sql, params, cb) => {
                if (typeof params === 'function') cb = params;
                cb(null, []);
            }
        };
        next();
    });
    
    const mockDb = { query: (sql, params, cb) => { if (typeof params === 'function') cb = params; cb(null, []); } };
    const mockMulter = { single: () => (req, res, next) => next() };
    const mockLogAudit = () => {};
    const mockGenerarCodigo = (prefix, anio, cb) => cb(null, 'ENT-2026-00001');

    const router = almacenFactory(mockDb, mockMulter, mockLogAudit, mockGenerarCodigo);
    app.use('/api/almacen', router);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    const url = `http://127.0.0.1:${port}/api/almacen/entradas/upload-url?filename=Reporte_OT_2026-09-30.pdf&contentType=application%2Fpdf&tipo=cotizacion`;
    console.log('Consultando:', url);

    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Respuesta:', data);

    server.close();

    if (res.status === 200 && data.uploadUrl) {
        console.log('\n✅ PRUEBA EXITOSA: El endpoint respondió 200 OK y generó la URL de S3 correctamente.');
    } else {
        console.error('\n❌ Prueba fallida.');
    }
}

testUploadUrl();
