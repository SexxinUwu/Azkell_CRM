const https = require('https');

const options = {
  hostname: 'marsisa.azkell.com',
  port: 443,
  path: '/api/script/obtenerDatosWialon',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status:', res.statusCode);
      console.log('Data count:', json.data ? json.data.length : (Array.isArray(json) ? json.length : 0));
      console.log('Grupos count:', json.grupos ? json.grupos.length : 0);
      if (json.data && json.data.length > 0) {
        console.log('Sample unit:', { placa: json.data[0].placa, lat: json.data[0].lat, lng: json.data[0].lng, vel: json.data[0].velocidad });
      }
    } catch(e) {
      console.log('Response raw:', data.substring(0, 300));
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(JSON.stringify({ args: [] }));
req.end();
