const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

// Mapping CCAA -> códigos de provincia
const CCAA_PROVINCIAS = {
    'Andalucía':            ['04','11','14','18','21','23','29','41'],
    'Aragón':               ['22','44','50'],
    'Asturias':             ['33'],
    'Islas Baleares':       ['07'],
    'Canarias':             ['35','38'],
    'Cantabria':            ['39'],
    'Castilla-La Mancha':   ['02','13','16','19','45'],
    'Castilla y León':      ['05','09','24','34','37','40','42','47','49'],
    'Cataluña':             ['08','17','25','43'],
    'Ceuta':                ['51'],
    'Comunidad Valenciana': ['03','12','46'],
    'Extremadura':          ['06','10'],
    'Galicia':              ['15','27','32','36'],
    'La Rioja':             ['26'],
    'Comunidad de Madrid':  ['28'],
    'Melilla':              ['52'],
    'Región de Murcia':     ['30'],
    'Navarra':              ['31'],
    'País Vasco':           ['01','20','48'],
};

// Mapping código provincia -> nombre
const PROVINCIA_NOMBRES = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
    '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
    '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
    '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
    '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
    '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
    '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
    '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
    '37': 'Salamanca', '38': 'S.C. de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
    '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya',
    '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

// Cache para municipios leídos del CSV
let municipiosCache = null;

function loadMunicipios() {
    if (municipiosCache) return municipiosCache;
    const csvPath = path.join(__dirname, '../data/MUNICIPIOS.csv');
    const raw = fs.readFileSync(csvPath, { encoding: 'latin1' });
    const lines = raw.split('\n').slice(1); // skip header
    const map = {}; // { codProv: [nombre, ...] }
    for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split(';');
        const codProv = cols[3]?.trim().padStart(2, '0');
        const nombre = cols[5]?.trim();
        if (!codProv || !nombre) continue;
        if (!map[codProv]) map[codProv] = new Set();
        map[codProv].add(nombre);
    }
    // Convert sets to sorted arrays
    municipiosCache = {};
    for (const cod in map) {
        municipiosCache[cod] = Array.from(map[cod]).sort((a, b) => a.localeCompare(b, 'es'));
    }
    return municipiosCache;
}

// GET /api/geo/ccaa -> Lista todas las CCAA
router.get('/ccaa', requireAuth, (req, res) => {
    const lista = Object.keys(CCAA_PROVINCIAS).sort((a, b) => a.localeCompare(b, 'es'));
    res.json(lista);
});

// GET /api/geo/provincias?ccaa=Andalucía -> Provincias de una CCAA
router.get('/provincias', requireAuth, (req, res) => {
    const { ccaa } = req.query;
    if (!ccaa) return res.status(400).json({ error: 'Parámetro ccaa requerido' });
    
    // Búsqueda case-insensitive
    const ccaaNormalized = (ccaa || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const realCcaa = Object.keys(CCAA_PROVINCIAS).find(k => 
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === ccaaNormalized
    );

    const codigos = realCcaa ? CCAA_PROVINCIAS[realCcaa] : null;
    if (!codigos) return res.status(404).json({ error: 'CCAA no encontrada' });
    const provincias = codigos.map(cod => ({ 
        cod, 
        nombre: (PROVINCIA_NOMBRES[cod] || '').toUpperCase() 
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    res.json(provincias);
});

// GET /api/geo/municipios?codprov=28 -> Municipios de una provincia
router.get('/municipios', requireAuth, (req, res) => {
    const { codprov } = req.query;
    if (!codprov) return res.status(400).json({ error: 'Parámetro codprov requerido' });
    const cod = codprov.padStart(2, '0');
    try {
        const municipios = loadMunicipios();
        const lista = (municipios[cod] || []).map(m => m.toUpperCase());
        res.json(lista);

    } catch (err) {
        console.error('Error leyendo MUNICIPIOS.csv:', err);
        res.status(500).json({ error: 'Error al cargar municipios' });
    }
});

module.exports = router;
