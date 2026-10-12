require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testEndpoint() {
    const db = getTenantPool('azkell_tenant_marsisa');
    const route = require('../routes/disponibilidad.js')(db, null);
    
    // Simulate req, res
    const req = { db, query: {}, user: { correo: 'admin@test.com' } };
    const res = {
        status: (code) => { console.log('Status:', code); return res; },
        json: (data) => {
            console.log('✅ Endpoint respondió exitosamente con', data.length, 'unidades.');
            console.log('Primeras 3 unidades:');
            console.log(data.slice(0, 3));
            process.exit(0);
        }
    };

    const getLayer = route.stack.find(s => s.route && s.route.methods.get && s.route.path === '/');
    if (getLayer) {
        getLayer.route.stack[0].handle(req, res, (err) => { if (err) console.error(err); });
    }
}

testEndpoint();
