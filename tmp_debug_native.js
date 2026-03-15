const http = require('http');

const data = JSON.stringify({
    comentario: 'Test from pure node script'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/oportunidades/26RES060_OP11/comentarios',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log(`BODY: ${body}`);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM WITH REQUEST: ${e.message}`);
});

req.write(data);
req.end();
