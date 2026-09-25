// ─── vincular_cee_directos_clientes.js ───────────────────────────────────────
// Vincula a su CLIENTE los CEE directos del histórico importado.
//
// 54 de los 59 CEE directos entraron desde el Drive antiguo SIN `cliente_id`
// (su carpeta se llamaba "JUAN TIRADO", "C GERONA 25", "ANTONIO RUIZ (INERSOS)"…,
// no había ficha de cliente detrás). Consecuencia: no aparecen en la ficha de
// ningún cliente, ni en el listado de Clientes con su etiqueta CEE.
//
// De dónde sale la propuesta, de más a menos fiable:
//   1. VIVIENDA — el `.xml` del certificado (en su carpeta de Drive) trae la
//      referencia catastral. Si esa RC (sus 14 primeros caracteres) es la de una
//      oportunidad o expediente CAE, el cliente es ese.
//   2. NOMBRE — el nombre de la carpeta contra `clientes` (nombre + apellidos):
//      al menos DOS palabras en común, UNA de ellas un APELLIDO, y un solo
//      candidato. Dos nombres de pila ("ANA BELEN") no identifican a nadie.
//      Es confianza MEDIA: solo se escribe con --incluir-media.
// Lo que no casa NO se inventa: se queda sin cliente y se vincula a mano desde
// la ficha del CEE (ClientePicker). No se crean clientes: el nombre de la
// carpeta muchas veces es una dirección, no una persona.
//
// De paso, si el CEE no tiene dirección/RC/municipio y el `.xml` sí, se
// rellenan esos HUECOS (nunca se pisa lo escrito).
//
// Simulación:  node scripts/vincular_cee_directos_clientes.js
// De verdad:   node scripts/vincular_cee_directos_clientes.js --execute [--incluir-media]
//              (sin --incluir-media, solo las de confianza ALTA)
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const drive = require('../services/driveService');
const folders = require('../services/ceeDirectoFolders');
const { matchSlot } = require('../services/ceeUploadService');

const EXEC = process.argv.includes('--execute');
const MEDIA = process.argv.includes('--incluir-media');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Palabras de la carpeta que NO son el nombre de nadie: partners, técnicos,
// tipos de vía y ruido de la época manual.
const RUIDO = new Set([
    'INERSOS', 'LANUZA', 'RAQUEL', 'AIMET', 'SANEHOGAR', 'EASYHOUSE', 'EASYHOYSE', 'EASY', 'HOUSE',
    'INGEALBA', 'BIOENERGIA', 'ATERSOL', 'CEE', 'OK', 'INICIAL', 'FINAL', 'Y', 'DE', 'DEL', 'LA',
    'LAS', 'LOS', 'EL', 'C', 'CL', 'CALLE', 'PS', 'AV', 'PL', 'PT', 'ES', 'COMPRAVENTA', 'FV',
    'PRIMA', 'M', 'J', 'FE', 'VALENCIA', 'MADRID', 'PUERTOLLANO', 'CIUDAD', 'REAL',
]);
const palabras = (s) => norm(s).split(' ').filter(w => w.length > 1 && !RUIDO.has(w) && !/^\d+$/.test(w));

const rc14 = (rc) => String(rc || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);

/** Campo de `<IdentificacionEdificio>` del XML, sin distinguir mayúsculas. */
function campoXml(xml, tag) {
    const m = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml);
    return m ? m[1].trim() : null;
}

async function leerXml(cee) {
    if (!cee.drive_folder_id) return null;
    for (const fase of ['inicial', 'final']) {
        const nombre = folders.subcarpetaFase(cee.alcance, fase);
        const folderId = await drive.findSubfolderByName(cee.drive_folder_id, nombre);
        if (!folderId) continue;
        const files = await drive.listFiles(folderId);
        const f = files.find(x => matchSlot(x.name) === 'xml');
        if (!f) continue;
        const buf = await drive.getFileContent(f.id);
        if (!buf) continue;
        // Unos van en UTF-8 y otros declaran UTF-8 y van en ISO-8859-1: si como
        // UTF-8 sale algún carácter de reemplazo, era latin1.
        const utf = buf.toString('utf8');
        const todo = utf.includes('�') ? buf.toString('latin1') : utf;
        // SOLO el bloque del EDIFICIO: el XML trae antes la dirección del
        // CERTIFICADOR (<DatosDelCertificador>), y un regex a pelo cogía esa —
        // todos salían "Tomelloso".
        const bloque = /<IdentificacionEdificio>([\s\S]*?)<\/IdentificacionEdificio>/i.exec(todo);
        if (!bloque) continue;
        const xml = bloque[1];
        return {
            fichero: f.name,
            rc: campoXml(xml, 'ReferenciaCatastral'),
            direccion: campoXml(xml, 'Direccion'),
            municipio: campoXml(xml, 'Municipio'),
            provincia: campoXml(xml, 'Provincia'),
            cp: campoXml(xml, 'CodigoPostal'),
        };
    }
    return null;
}

(async () => {
    const { data: cees, error } = await supabase.from('cee_directos')
        .select('id, numero_expediente, nombre, alcance, drive_folder_id, ref_catastral, direccion, municipio, provincia, codigo_postal')
        .is('cliente_id', null).order('correlativo');
    if (error) throw error;

    const { data: clientes } = await supabase.from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, dni, municipio');
    const { data: ops } = await supabase.from('oportunidades').select('cliente_id, ref_catastral').not('cliente_id', 'is', null);
    // También los CEE directos YA vinculados: la misma vivienda certificada dos veces.
    const { data: ceesCli } = await supabase.from('cee_directos').select('cliente_id, ref_catastral').not('cliente_id', 'is', null);
    for (const x of ceesCli || []) ops.push(x);

    // RC (14) → clientes que la tienen en alguna oportunidad CAE.
    const porRc = new Map();
    for (const o of ops || []) {
        const k = rc14(o.ref_catastral);
        if (!k) continue;
        const s = porRc.get(k) || new Set();
        s.add(o.cliente_id);
        porRc.set(k, s);
    }
    const cliPorId = new Map((clientes || []).map(c => [c.id_cliente, c]));
    const nombreCli = (c) => `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim();

    const filas = [];
    for (const cee of cees) {
        let x = null;
        try { x = await leerXml(cee); } catch (e) { x = { error: e.message }; }
        await new Promise(r => setTimeout(r, 150));

        let propuesta = null;
        // 1. Por la vivienda.
        // Un XML puede declarar varias RC separadas por comas (varios inmuebles).
        const k = rc14(String(x?.rc || cee.ref_catastral || '').split(/[,;]/)[0]);
        const idsRc = k ? [...(porRc.get(k) || [])] : [];
        if (idsRc.length === 1) {
            propuesta = { cliente: cliPorId.get(idsRc[0]), confianza: 'ALTA', motivo: `misma referencia catastral (${k}) que una oportunidad CAE` };
        } else if (idsRc.length > 1) {
            propuesta = { cliente: null, confianza: 'DUDA', motivo: `RC ${k} en ${idsRc.length} clientes distintos` };
        }
        // 2. Por el nombre.
        if (!propuesta) {
            const ps = palabras(cee.nombre);
            const cands = [];
            for (const c of clientes || []) {
                const pc = new Set(palabras(nombreCli(c)));
                const ap = new Set(palabras(c.apellidos));
                const comunes = ps.filter(w => pc.has(w));
                if (comunes.length >= 2 && comunes.some(w => ap.has(w))) cands.push({ c, comunes });
            }
            if (cands.length === 1) {
                propuesta = { cliente: cands[0].c, confianza: 'MEDIA', motivo: `nombre: ${cands[0].comunes.join(' + ')}` };
            } else if (cands.length > 1) {
                propuesta = { cliente: null, confianza: 'DUDA', motivo: `nombre ambiguo: ${cands.map(z => nombreCli(z.c)).join(' | ')}` };
            }
        }

        // Huecos de dirección que el XML puede rellenar.
        const huecos = {};
        if (x && !x.error) {
            // Un certificado de varios inmuebles declara varias RC ("a, b"): el campo
            // admite una (25 caracteres) y se guarda la primera.
            if (!cee.ref_catastral && x.rc) huecos.ref_catastral = x.rc.split(/[,;]/)[0].trim();
            if (!cee.direccion && x.direccion) huecos.direccion = x.direccion;
            if (!cee.municipio && x.municipio) huecos.municipio = x.municipio.toUpperCase();
            if (!cee.provincia && x.provincia) huecos.provincia = x.provincia.toUpperCase();
            if (!cee.codigo_postal && x.cp) huecos.codigo_postal = x.cp;
        }
        filas.push({ cee, x, propuesta, huecos });
    }

    let vinculados = 0, rellenos = 0;
    for (const { cee, x, propuesta, huecos } of filas) {
        const cli = propuesta?.cliente;
        const txt = cli
            ? `→ ${nombreCli(cli)}${cli.dni ? ` (${cli.dni})` : ''}${cli.municipio ? ` · vive en ${cli.municipio}` : ''} [${propuesta.confianza}: ${propuesta.motivo}]`
            : propuesta ? `✗ ${propuesta.motivo}` : '✗ sin coincidencia';
        const xtxt = x?.error ? `xml: ERROR ${x.error}` : x ? `xml: ${x.rc || 'sin RC'} · ${x.municipio || ''}` : 'sin .xml';
        console.log(`${cee.numero_expediente.padEnd(11)} ${String(cee.nombre).padEnd(38).slice(0, 38)} ${txt}`);
        console.log(`${' '.repeat(12)}${xtxt}${Object.keys(huecos).length ? ` · rellena: ${Object.keys(huecos).join(', ')}` : ''}`);

        const patch = { ...huecos };
        if (cli && (propuesta.confianza === 'ALTA' || (MEDIA && propuesta.confianza === 'MEDIA'))) patch.cliente_id = cli.id_cliente;
        if (!Object.keys(patch).length) continue;
        if (patch.cliente_id) vinculados++;
        if (Object.keys(huecos).length) rellenos++;
        if (EXEC) {
            const { error: e } = await supabase.from('cee_directos')
                .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', cee.id);
            if (e) console.log(`${' '.repeat(12)}!! no se pudo escribir: ${e.message}`);
        }
    }
    console.log(`\n${filas.length} sin cliente · ${vinculados} se vincularían (${MEDIA ? 'ALTA+MEDIA' : 'solo ALTA'}) · ${rellenos} con dirección rellenada desde el .xml`);
    console.log(EXEC ? 'ESCRITO.' : 'SIMULACIÓN: nada escrito. --execute aplica las ALTA; --incluir-media, también las MEDIA.');
})().catch(e => { console.error(e); process.exit(1); });
