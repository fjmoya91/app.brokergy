const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/MUNICIPIOS.csv');

let municipalityMap = null;

// CTE Climate Zone Table (Tabla a-Anejo B)
// Each entry maps a Province Code (2 digits) to an array of ranges.
// Ranges must be ordered by altitude. 'max' is the upper limit inclusive.
const CLIMATE_ZONES = {
    // 01: Álava
    '01': [{ max: 1050, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 02: Albacete (0-600: C3, 601-1000: D3, >1000: E1) - CORRECTED based on user example and table
    '02': [{ max: 600, zone: 'C3' }, { max: 1000, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 03: Alicante
    '03': [{ max: 250, zone: 'B4' }, { max: 500, zone: 'C3' }, { max: 900, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 04: Almería
    '04': [{ max: 50, zone: 'A4' }, { max: 200, zone: 'B4' }, { max: 350, zone: 'B3' }, { max: 600, zone: 'C3' }, { max: 950, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 05: Ávila
    '05': [{ max: 450, zone: 'D2' }, { max: 700, zone: 'D1' }, { max: 1000, zone: 'E1' }, { max: 9999, zone: 'E1' }], // Simplified high altitude
    // 06: Badajoz
    '06': [{ max: 400, zone: 'C4' }, { max: 500, zone: 'C3' }, { max: 800, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 07: Baleares
    '07': [{ max: 250, zone: 'B3' }, { max: 700, zone: 'C3' }, { max: 9999, zone: 'D3' }],
    // 08: Barcelona
    '08': [{ max: 250, zone: 'C2' }, { max: 450, zone: 'D2' }, { max: 700, zone: 'D1' }, { max: 1000, zone: 'E1' }, { max: 9999, zone: 'E1' }],
    // 09: Burgos
    '09': [{ max: 550, zone: 'D1' }, { max: 850, zone: 'E1' }, { max: 9999, zone: 'E1' }],
    // 10: Cáceres
    '10': [{ max: 400, zone: 'C4' }, { max: 850, zone: 'D3' }, { max: 1250, zone: 'E1' }],
    // 11: Cádiz
    '11': [{ max: 100, zone: 'A3' }, { max: 350, zone: 'B3' }, { max: 600, zone: 'C3' }, { max: 800, zone: 'C2' }, { max: 1050, zone: 'D2' }],
    // 12: Castellón
    '12': [{ max: 150, zone: 'B3' }, { max: 550, zone: 'C3' }, { max: 650, zone: 'D3' }, { max: 1000, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 13: Ciudad Real
    '13': [{ max: 500, zone: 'C4' }, { max: 550, zone: 'C3' }, { max: 9999, zone: 'D3' }],
    // 14: Córdoba
    '14': [{ max: 150, zone: 'B4' }, { max: 550, zone: 'C4' }, { max: 950, zone: 'D3' }],
    // 15: Coruña
    '15': [{ max: 200, zone: 'C1' }, { max: 700, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 16: Cuenca
    '16': [{ max: 800, zone: 'D3' }, { max: 1000, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 17: Girona
    '17': [{ max: 150, zone: 'C2' }, { max: 600, zone: 'D2' }, { max: 900, zone: 'E1' }],
    // 18: Granada
    '18': [{ max: 100, zone: 'A4' }, { max: 400, zone: 'B4' }, { max: 550, zone: 'C4' }, { max: 800, zone: 'C3' }, { max: 1000, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 19: Guadalajara
    '19': [{ max: 800, zone: 'D3' }, { max: 1000, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 20: Gipuzkoa
    '20': [{ max: 400, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 21: Huelva
    '21': [{ max: 51, zone: 'A4' }, { max: 200, zone: 'B4' }, { max: 400, zone: 'B3' }, { max: 650, zone: 'C3' }, { max: 1000, zone: 'D3' }],
    // 22: Huesca
    '22': [{ max: 250, zone: 'C3' }, { max: 450, zone: 'D3' }, { max: 750, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 23: Jaén
    '23': [{ max: 300, zone: 'B4' }, { max: 700, zone: 'C4' }, { max: 1050, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 24: León
    '24': [{ max: 9999, zone: 'E1' }], // León siempre E1 según tabla simplificada para > 0m? No, tabla tiene rangos, pero León es muy fría. Revisar si hay D1/D2 bajo. Tabla: <=550 -> E1. Todo E1.
    // 25: Lleida
    '25': [{ max: 200, zone: 'C3' }, { max: 550, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 26: La Rioja
    '26': [{ max: 250, zone: 'C2' }, { max: 700, zone: 'D2' }, { max: 950, zone: 'E1' }],
    // 27: Lugo
    '27': [{ max: 400, zone: 'D1' }, { max: 850, zone: 'E1' }],
    // 28: Madrid
    '28': [{ max: 600, zone: 'C3' }, { max: 850, zone: 'D3' }, { max: 1000, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 29: Málaga
    '29': [{ max: 150, zone: 'A3' }, { max: 350, zone: 'B3' }, { max: 750, zone: 'C3' }, { max: 9999, zone: 'D3' }],
    // 30: Murcia
    '30': [{ max: 150, zone: 'B3' }, { max: 550, zone: 'C3' }, { max: 9999, zone: 'D3' }],
    // 31: Navarra
    '31': [{ max: 201, zone: 'C2' }, { max: 401, zone: 'D2' }, { max: 601, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 32: Ourense
    '32': [{ max: 150, zone: 'C3' }, { max: 400, zone: 'C2' }, { max: 750, zone: 'D2' }, { max: 1000, zone: 'E1' }],
    // 33: Asturias
    '33': [{ max: 50, zone: 'C1' }, { max: 550, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 34: Palencia
    '34': [{ max: 750, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 35: Las Palmas (Canarias)
    '35': [{ max: 350, zone: 'A3' }, { max: 650, zone: 'A2' }, { max: 900, zone: 'B2' }, { max: 9999, zone: 'C2' }], // Special alpha
    // 36: Pontevedra
    '36': [{ max: 400, zone: 'C1' }, { max: 750, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 37: Salamanca
    '37': [{ max: 850, zone: 'D2' }, { max: 950, zone: 'E1' }],
    // 38: Santa Cruz de Tenerife
    '38': [{ max: 350, zone: 'A3' }, { max: 650, zone: 'A2' }, { max: 900, zone: 'B2' }, { max: 9999, zone: 'C2' }],
    // 39: Cantabria
    '39': [{ max: 150, zone: 'C1' }, { max: 650, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 40: Segovia
    '40': [{ max: 1000, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 41: Sevilla
    '41': [{ max: 200, zone: 'B4' }, { max: 750, zone: 'C4' }, { max: 9999, zone: 'D3' }],
    // 42: Soria
    '42': [{ max: 700, zone: 'D2' }, { max: 800, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 43: Tarragona
    '43': [{ max: 150, zone: 'B3' }, { max: 550, zone: 'C3' }, { max: 9999, zone: 'D3' }],
    // 44: Teruel
    '44': [{ max: 500, zone: 'C3' }, { max: 600, zone: 'C2' }, { max: 950, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 45: Toledo
    '45': [{ max: 550, zone: 'C4' }, { max: 9999, zone: 'D3' }],
    // 46: Valencia
    '46': [{ max: 200, zone: 'B3' }, { max: 650, zone: 'C3' }, { max: 950, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 47: Valladolid
    '47': [{ max: 750, zone: 'D2' }, { max: 950, zone: 'E1' }],
    // 48: Bizkaia
    '48': [{ max: 200, zone: 'C1' }, { max: 650, zone: 'D1' }, { max: 9999, zone: 'E1' }],
    // 49: Zamora
    '49': [{ max: 750, zone: 'D2' }, { max: 9999, zone: 'E1' }],
    // 50: Zaragoza
    '50': [{ max: 300, zone: 'C3' }, { max: 800, zone: 'D3' }, { max: 9999, zone: 'E1' }],
    // 51: Ceuta
    '51': [{ max: 600, zone: 'B3' }],
    // 52: Melilla
    '52': [{ max: 600, zone: 'A3' }]
};

class ClimateService {
    constructor() {
        this.dataLoaded = false;
        this.municipalityMap = new Map(); // Key: PROV+MUN (e.g., '01001')
        this.loadData();
    }

    async loadData() {
        if (this.dataLoaded) return;

        try {
            console.log(`Loading Climate Data from ${DATA_PATH}`);
            if (!fs.existsSync(DATA_PATH)) {
                console.error('MUNICIPIOS.csv not found');
                return;
            }

            const rawData = fs.readFileSync(DATA_PATH, 'latin1');
            const lines = rawData.split('\n');
            // Headers: COD_INE;ID_REL;COD_GEO;COD_PROV;PROVINCIA;NOMBRE_ACTUAL;...;ALTITUD;...
            // Index map based on first line header check or assumption
            // Line 0: headers
            // Sample: 01001000000;...;01;Araba/Álava;Alegría-Dulantzi;...;568;MDT

            // Finding correct indices
            const headers = lines[0].split(';');
            const provIdx = headers.indexOf('COD_PROV');
            const provNameIdx = headers.indexOf('PROVINCIA');
            const geoIdx = headers.indexOf('COD_GEO'); // 01010 format?
            const altIdx = headers.indexOf('ALTITUD');
            const nameIdx = headers.indexOf('NOMBRE_ACTUAL');

            if (provIdx === -1 || altIdx === -1) {
                console.error('Invalid CSV Headers');
                return;
            }

            let count = 0;
            // Processing lines
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const cols = line.split(';');
                const provCode = cols[provIdx];
                let munCode = '';

                // COD_GEO usually is 5 digits (2 prov + 3 mun). Example: 01010 -> Prov 01, Mun 010
                // COD_INE is 11 digits: 01001000000 -> Prov 01, Mun 001
                // Let's rely on COD_PROV and try to parse the municipality code.
                // Catastro API returns 'cm' (Municipality Code) as 3 digits.
                // In COD_INE (11 chars), positions 2,3,4 (0-indexed) are usually the municipality code.
                // 01 001 000000 -> 001

                // Let's check COD_INE index
                const ineIdx = headers.indexOf('COD_INE');
                if (ineIdx !== -1) {
                    const ine = cols[ineIdx];
                    if (ine && ine.length >= 5) {
                        munCode = ine.substring(2, 5); // Digits 3,4,5
                    }
                }

                const altitude = parseInt(cols[altIdx]) || 0;
                const name = cols[nameIdx] || 'Unknown';
                const provName = provNameIdx !== -1 ? cols[provNameIdx] : 'Unknown';

                if (provCode && munCode) {
                    const key = `${provCode}${munCode}`;
                    this.municipalityMap.set(key, { altitude, name, provCode, munCode, provName });
                    count++;
                }
            }

            console.log(`Climate Service: Loaded ${count} municipalities.`);
            this.dataLoaded = true;
        } catch (error) {
            console.error('Error loading MUNICIPIOS.csv:', error);
        }
    }

    getClimateZone(provinceCode, altitude) {
        const rules = CLIMATE_ZONES[provinceCode];
        if (!rules) return 'C3'; // Default fallback

        for (const rule of rules) {
            if (altitude <= rule.max) {
                return rule.zone;
            }
        }
        return rules[rules.length - 1].zone; // Return last (highest)
    }

    getClimateInfo(provinceCode, municipalityCode) {
        // Ensure data is loaded (sync check roughly) because loading is async but file read is sync in constructor
        // We called loadData() in constructor. It uses readFileSync, so it should be ready.

        // Key format: PPMMM (2 digits prov + 3 digits mun)
        // Ensure padding
        const p = (provinceCode || '').toString().padStart(2, '0');
        const m = (municipalityCode || '').toString().padStart(3, '0');
        const key = `${p}${m}`;

        const muniData = this.municipalityMap.get(key);

        if (!muniData) {
            console.warn(`Municipality not found for key: ${key}`);
            return null;
        }

        const zone = this.getClimateZone(p, muniData.altitude);

        return {
            altitude: muniData.altitude,
            climateZone: zone,
            municipalityName: muniData.name,
            provName: muniData.provName
        };
    }

    getAllMunicipalities() {
        return Array.from(this.municipalityMap.values()).map(m => ({
            provCode: m.provCode,
            munCode: m.munCode,
            name: m.name,
            provName: m.provName
        }));
    }
}

// Singleton instance
const climateService = new ClimateService();
module.exports = climateService;
