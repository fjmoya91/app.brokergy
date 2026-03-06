const axios = require('axios');
const fs = require('fs');
const catastroService = require('./services/catastroService');

async function testRC(rc) {
    console.log(`Testing RC: ${rc}`);

    // 1. Get Coords
    const coords = await catastroService.getCoordinatesByRC(rc);
    console.log('Coords:', coords);

    if (!coords) {
        console.error('Failed to get coords');
        return;
    }

    const x = parseFloat(coords.x);
    const y = parseFloat(coords.y);
    const radius = 50;
    const bbox = `${x - radius},${y - radius},${x + radius},${y + radius}`;

    console.log(`BBOX: ${bbox}`);

    const wmsUrl = 'http://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
    const params = {
        SERVICE: 'WMS',
        REQUEST: 'GetMap',
        SRS: 'EPSG:25830',
        LAYERS: 'Catastro', // Probar capa 'Catastro' que agrupa todo
        STYLES: '',
        FORMAT: 'image/jpeg',
        WIDTH: '800',
        HEIGHT: '600',
        BBOX: bbox,
        TRANSPARENT: 'false'
    };

    try {
        const response = await axios.get(wmsUrl, {
            params,
            responseType: 'arraybuffer'
        });

        console.log(`Response Status: ${response.status}`);
        console.log(`Response Type: ${response.headers['content-type']}`);

        fs.writeFileSync('test_map_output.jpg', response.data);
        console.log('Image saved to test_map_output.jpg');

    } catch (error) {
        console.error('WMS Error:', error.message);
        if (error.response) {
            console.log('Error Data:', error.response.data.toString());
        }
    }
}

// RC de prueba (una real)
testRC('0377706WH7907N0001JW');
