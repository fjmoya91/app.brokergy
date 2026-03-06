const axios = require('axios');
const xml2js = require('xml2js');
require('dotenv').config();

const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;
const CATASTRO_COORD_URL = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx';

async function parseXML(xml) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    return await parser.parseStringPromise(xml);
}

async function run() {
    try {
        console.log('1. Getting coords for address...');
        const address = "Calle Don Sergio, 12, Tomelloso, España";
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;

        const gRes = await axios.get(googleUrl);
        if (gRes.data.status !== 'OK') {
            console.error('Google Error:', gRes.data);
            return;
        }

        const loc = gRes.data.results[0].geometry.location;
        console.log('Coordinates:', loc);

        console.log('\n2. Querying Catastro...');
        // Correct order for Catastro: X=Longitude, Y=Latitude
        // SRS=EPSG:4326 (WGS84)
        const catastroUrl = `${CATASTRO_COORD_URL}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${loc.lng}&Coordenada_Y=${loc.lat}`;
        console.log('URL:', catastroUrl);

        const cRes = await axios.get(catastroUrl);
        console.log('Catastro Response Status:', cRes.status);
        // console.log('Raw XML:', cRes.data);

        const parsed = await parseXML(cRes.data);
        console.log('\nParsed JSON:', JSON.stringify(parsed, null, 2));

        const coord = parsed.consulta_coordenadas?.coordenadas?.coord || parsed.consulta_coordenadas?.coord;
        if (!coord) {
            console.log('❌ No coordinate info found in XML');
        } else {
            const pc = coord.pc;
            if (pc && pc.pc1 && pc.pc2) {
                console.log(`✅ RC Found: ${pc.pc1}${pc.pc2}`);
            } else {
                console.log('❌ No RC in response (Coordinate might be on street/unmapped)');
            }
        }

    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) console.error('Response data:', err.response.data);
    }
}

run();
