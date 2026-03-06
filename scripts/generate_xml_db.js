
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../data/real_cases_xml');
const OUTPUT_FILE = path.join(__dirname, '../implementation/frontend/src/features/calculator/data/real_cases_db.json');

// Regex patterns
const patterns = {
    provincia: /<Provincia>(.*?)<\/Provincia>/,
    zonaClimatica: /<ZonaClimatica>(.*?)<\/ZonaClimatica>/,
    anoConstruccion: /<AnoConstruccion>(.*?)<\/AnoConstruccion>/,
    superficieHabitable: /<SuperficieHabitable>(.*?)<\/SuperficieHabitable>/,
    tipoDeEdificio: /<TipoDeEdificio>(.*?)<\/TipoDeEdificio>/,
    // Capture Demanda Calefaccion specifically from the EdificioObjeto block
    // We search for the pattern: <Demanda>\s*<EdificioObjeto>(.*?)<\/EdificioObjeto>
    // And then inside that, we look for <Calefaccion>
    demandaBlock: /<Demanda>\s*<EdificioObjeto>([\s\S]*?)<\/EdificioObjeto>/,
    calefaccionVal: /<Calefaccion>(.*?)<\/Calefaccion>/
};

function parseFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Extract basic fields
        const getMatch = (regex) => {
            const match = content.match(regex);
            return match ? match[1].trim() : null;
        };

        const provincia = getMatch(patterns.provincia);
        const zonaClimatica = getMatch(patterns.zonaClimatica);
        const anoConstruccion = getMatch(patterns.anoConstruccion);
        const superficie = getMatch(patterns.superficieHabitable);
        const tipo = getMatch(patterns.tipoDeEdificio);

        // Extract Demanda Calefaccion
        let demandaCalefaccion = null;
        const demandBlockMatch = content.match(patterns.demandaBlock);
        if (demandBlockMatch) {
            const blockContent = demandBlockMatch[1];
            const calMatch = blockContent.match(patterns.calefaccionVal);
            if (calMatch) {
                demandaCalefaccion = parseFloat(calMatch[1]);
            }
        }

        const fileName = path.basename(filePath);
        // Determine type based on filename (rough heuristic)
        let certType = 'DESCONOCIDO';
        const lowerName = fileName.toLowerCase();
        if (lowerName.includes('inicial')) certType = 'INICIAL';
        else if (lowerName.includes('final')) certType = 'FINAL';
        else if (lowerName.includes('previsto')) certType = 'PREVISTO';
        else if (lowerName.includes('proyecto')) certType = 'PROYECTO';

        if (demandaCalefaccion !== null && superficie) {
            return {
                id: fileName,
                provincia,
                zonaClimatica,
                anoConstruccion: parseInt(anoConstruccion) || 0,
                superficie: parseFloat(superficie),
                tipo: tipo || 'Desconocido',
                demandaCalefaccion, // This is usually kWh/m2 year or similar? No, in XML it is usually absolute or relative? 
                // In the viewed XML: <Calefaccion>180.83</Calefaccion>.
                // Wait, CE3X XML values. Are they total kwh or kwh/m2?
                // Usually CE3X reports values in the main block often as kwh/m2 or indices.
                // Let's check the XML again later. Assuming raw value for now. 
                // Actually, line 540 <Global>205.73</Global>. 
                // Surface is 164.80. 
                // If it were Total kWh, 205 kWh would be tiny for a house.
                // It is almost certainly kWh/m2.
                certType
            };
        }
        return null;

    } catch (err) {
        console.error(`Error parsing ${filePath}:`, err.message);
        return null;
    }
}

function main() {
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`Source directory not found: ${SOURCE_DIR}`);
        return;
    }

    const files = fs.readdirSync(SOURCE_DIR);
    const results = [];

    console.log(`Processing ${files.length} files...`);

    files.forEach(file => {
        if (path.extname(file).toLowerCase() === '.xml') {
            const data = parseFile(path.join(SOURCE_DIR, file));
            if (data) {
                results.push(data);
            }
        }
    });

    console.log(`Extracted valid data from ${results.length} files.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Database saved to ${OUTPUT_FILE}`);
}

main();
