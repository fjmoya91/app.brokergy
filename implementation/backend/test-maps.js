const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GOOGLE_MAPS_KEY;
console.log('Testing API Key:', API_KEY ? 'Present' : 'Missing');

async function test() {
    try {
        // Test Geocoding
        console.log('1. Testing Geocoding API...');
        const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Madrid&key=${API_KEY}`;
        const geoRes = await axios.get(geoUrl);
        if (geoRes.data.status === 'OK') {
            console.log('✅ Geocoding OK');
        } else {
            console.log('❌ Geocoding Failed:', geoRes.data.status, geoRes.data.error_message);
        }

        // Test Places Autocomplete
        console.log('\n2. Testing Places Autocomplete API...');
        const placeUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Gran+Via&key=${API_KEY}`;
        const placeRes = await axios.get(placeUrl);
        if (placeRes.data.status === 'OK') {
            console.log('✅ Places Autocomplete OK');
        } else {
            console.log('❌ Places Autocomplete Failed:', placeRes.data.status, placeRes.data.error_message);
        }

    } catch (err) {
        console.error('Network/System Error:', err.message);
    }
}

test();
