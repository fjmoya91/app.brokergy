const catastroService = require('./backend/services/catastroService');

async function testValencia() {
    console.log("Searching Valencia...");
    const res = await catastroService.getRCByCoords(39.469, -0.376); // Valencia coords
    if (res?.rc) {
        const data = await catastroService.getByRC(res.rc);
        console.log("Valencia Climate Info:", data.climateInfo);
    }
}
testValencia();
