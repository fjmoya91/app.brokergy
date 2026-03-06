const catastroService = require('./backend/services/catastroService');
const climateService = require('./backend/services/climateService');

async function test() {
    // Madrid coords: 40.4168, -3.7038
    console.log("Searching RC by coords...");
    const res = await catastroService.getRCByCoords(40.42, -3.70);
    console.log("Found RC:", res?.rc);
    if (res?.rc) {
        const data = await catastroService.getByRC(res.rc);
        console.log("Climate Info:", data.climateInfo);
    }
}
test();
