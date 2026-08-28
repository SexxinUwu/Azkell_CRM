const http = require('http');

async function testApi() {
    const postData = JSON.stringify({
        fechaDesde: '2026-08-01',
        fechaHasta: '2026-08-28',
        placa: 'CLX861'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/combustible/analisis-viajes',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Cookie': 'user_tenant=marsisa' // o header según la autenticación
        }
    };

    // Si requiere sesión o token lo llamamos directamente
    console.log("Probando endpoint...");
}

testApi();
