const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/script/obtenerDatosFleetrun',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('First row of Fleetrun:');
      console.log(parsed.data[0]);
    } catch (e) {
      console.log('Raw data (first 500 chars):', data.substring(0, 500));
    }
  });
});

req.on('error', e => console.error(e));
req.write(JSON.stringify({args: []}));
req.end();
