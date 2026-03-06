const axios = require('axios');
const xml2js = require('xml2js');

const BASE_URL = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx';
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
        const url = `${BASE_URL}/Consulta_DNPRC?Provincia=&Municipio=&RC=${RC}`;
        console.log(`Calling: ${url}`);

        const response = await axios.get(url);
        const result = await parseXML(response.data);

        const consulta = result.consulta_dnp || result['consulta_dnp'];
        const bico = consulta?.bico;
        const bi = bico?.bi;

        if (bi) {
            console.log('\n--- INE CODES EXTRACTION ---');
            console.log('Provincia (cp):', bi.dt?.loine?.cp);
            console.log('Municipio (cm):', bi.dt?.loine?.cm);

            console.log('\nFULL DT NODE:');
            console.log(JSON.stringify(bi.dt, null, 2));
        } else {
            console.log('BI Node not found');
        }

    } catch (e) {
        console.error(e);
    }
}

test();
