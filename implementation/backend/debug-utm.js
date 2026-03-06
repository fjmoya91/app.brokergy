const axios = require('axios');
const xml2js = require('xml2js');

const COORD_URL = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx';
const RC = '0377706WH7907N0001JW';

async function parseXML(xml) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    return await parser.parseStringPromise(xml);
}

async function test() {
    try {
        // CPMRC requires exactly 14 characters
        const cleanRC = RC.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const parcelRC = cleanRC.substring(0, 14);
        const url = `${COORD_URL}/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:25830&RC=${parcelRC}`;
        console.log(`Calling: ${url}`);

        const response = await axios.get(url);
        const result = await parseXML(response.data);

        console.log('FULL JSON RESULT:');
        console.log(JSON.stringify(result, null, 2));

        // Simular lógica actual
        const consulta = result.consulta_coordenadas || result.coordenadas_RC;
        const coord = consulta?.coordenadas?.coord || consulta?.coord;

        console.log('\n--- EXTRACTION ATTEMPT ---');
        if (coord && coord.geo) {
            console.log('Found in coord.geo:', coord.geo);
        } else if (consulta?.coordenadas?.coord?.geo) {
            console.log('Found in consulta.coordenadas.coord.geo:', consulta.coordenadas.coord.geo);
        } else {
            console.log('NOT FOUND in expected paths');
        }

    } catch (e) {
        console.error(e);
    }
}

test();
