const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
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

req.end();
