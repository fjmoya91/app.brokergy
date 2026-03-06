const axios = require('axios');
const xml2js = require('xml2js');

async function test() {
    const rc = '9872023VK4797S'; // using only 14 chars as it's the parcel
    const url = `http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=6442603VK4064S0001YW`;

    try {
        const res = await axios.get(url);
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, mergeAttrs: true, tagNameProcessors: [xml2js.processors.stripPrefix] });
        const result = await parser.parseStringPromise(res.data);
        console.log("Raw Catastro Data:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
