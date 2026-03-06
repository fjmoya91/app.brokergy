const axios = require('axios');

async function run() {
    const address = "Calle Don Sergio, 12, Tomelloso, España";
    const url = `http://localhost:3000/api/catastro/neighbors?address=${encodeURIComponent(address)}`;

    console.log(`Fetching: ${url}`);
    try {
        const res = await axios.get(url);
        console.log('Status:', res.status);
        console.log('Data Length:', Array.isArray(res.data) ? res.data.length : 'Not Array');
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        }
    }
}

run();
