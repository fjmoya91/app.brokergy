require('dotenv').config();
const catastroService = require('./services/catastroService');
const googleService = require('./services/googleService');

async function run() {
    try {
        console.log('1. Searching Google for address...');
        const query = "Calle Don Sergio, 12, Tomelloso, España";
        const candidates = await googleService.searchAddress(query);

        if (candidates.length === 0) {
            console.log('❌ Google returned no results');
            return;
        }

        const loc = candidates[0].location;
        console.log('Google Location:', loc);

        console.log('\n2. Calling catastroService.getRCByCoords (with proximity)...');
        const start = Date.now();
        const rcData = await catastroService.getRCByCoords(loc.lat, loc.lng);
        const duration = Date.now() - start;

        if (rcData) {
            console.log(`✅ SUCCESS! Found RC in ${duration}ms`);
            console.log('Result:', rcData);
        } else {
            console.log('❌ FAILED. No RC found even with proximity search.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
