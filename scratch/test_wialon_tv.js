const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/script/obtenerDatosWialon',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Host': 'marsisa.azkell.com'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status:', res.statusCode);
      console.log('Data count:', json.data ? json.data.length : (Array.isArray(json) ? json.length : 0));
      console.log('Grupos count:', json.grupos ? json.grupos.length : 0);
      if (json.data && json.data.length > 0) {
        console.log('Sample unit:', json.data[0]);
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
