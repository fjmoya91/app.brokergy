const axios = require('axios');

async function debug() {
    const id = '26RES060_OP11';
    const url = `http://localhost:3000/api/oportunidades/${id}/comentarios`;
    console.log('Testing POST to:', url);

    try {
        const res = await axios.post(url, { comentario: 'Test from debug script' });
        console.log('SUCCESS:', res.status, res.data);
    } catch (err) {
        console.log('ERROR STATUS:', err.response?.status);
        console.log('ERROR DATA:', err.response?.data);
        console.log('ERROR MESSAGE:', err.message);
    }
}

debug();
