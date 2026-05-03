const axios = require('axios');

async function test() {
    try {
        const res = await axios.post('http://localhost:3000/api/pdf/save-to-drive', {
            html: '<h1>test</h1>',
            folderId: 'test-folder'
        });
        console.log('Success:', res.status);
    } catch (err) {
        if (err.response) {
            console.log('Error status:', err.response.status);
            console.log('Error data:', err.response.data);
        } else {
            console.log('Error:', err.message);
        }
    }
}

test();
