const { getByRC } = require('./backend/services/catastroService');

async function test() {
    try {
        const data = await getByRC('9872023VK4797S0001WY'); // test RC
        console.log(JSON.stringify(data.climateInfo, null, 2));
        console.log('Prov:', data.provinceCode, 'Mun:', data.municipalityCode);
    } catch (e) {
        console.error(e);
    }
}
test();
