// Prueba de utils/pdfDelExpediente.js — sin BD ni Drive: PDF sintéticos (pdf-lib) y
// una tabla de expedientes FALSA en lugar de Supabase.
//   node implementation/backend/scripts/test_pdf_del_expediente.js
//
// Casos que tiene que cubrir (08/11/2026, el CIFO del 26RES060_182 subido al 242):
//   · lleva el nº de OTRO expediente que existe            → rechazo (por nº)
//   · lleva nuestro nº                                      → pasa
//   · nuestro nº y además otro                              → pasa (manda el nuestro)
//   · un nº que no es de ningún expediente (renumerado)     → pasa, con aviso
//   · sin nº, con la RC de OTRA obra nuestra                → rechazo (por RC)
//   · sin nº, la RC en un CAMPO de formulario (Anexo I)     → rechazo (por RC)
//   · sin nº, con nuestra RC (14 primeros caracteres)       → pasa
//   · sin nº, RC que no es de ninguna obra (errata)         → pasa, con aviso
//   · sin texto (escaneado), imagen                         → pasa, con aviso
//   · la BD falla                                           → pasa, con aviso
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const B = path.join(__dirname, '..');
const supabase = require(path.join(B, 'services/supabaseClient'));

// ── BD falsa ──────────────────────────────────────────────────────────────
const EXPEDIENTES = [
    { id: 'id-242', numero_expediente: '26RES060_242', rc: '4057329VK8245N0001XH' },
    { id: 'id-182', numero_expediente: '26RES060_182', rc: '2111707VJ8621S0001SX' },
];
let bdRota = false;
supabase.from = (tabla) => {
    const f = { eq: {}, neq: {}, ilike: {} };
    const q = {
        select: () => q,
        eq: (k, v) => { f.eq[k] = v; return q; },
        neq: (k, v) => { f.neq[k] = v; return q; },
        ilike: (k, v) => { f.ilike[k] = v; return q; },
        limit: () => q,
        then: (ok) => {
            if (bdRota) return ok({ data: null, error: new Error('BD caída') });
            if (tabla !== 'expedientes') return ok({ data: [], error: null });
            let filas = EXPEDIENTES;
            if (f.eq.numero_expediente) filas = filas.filter(e => e.numero_expediente === f.eq.numero_expediente);
            if (f.neq.id) filas = filas.filter(e => e.id !== f.neq.id);
            const pref = f.ilike['instalacion->>ref_catastral'];
            if (pref) filas = filas.filter(e => e.rc.startsWith(pref.replace(/%$/, '')));
            return ok({ data: filas.map(({ id, numero_expediente }) => ({ id, numero_expediente })), error: null });
        },
    };
    return q;
};

const { comprobarPdfDelExpediente, identificadoresEnTexto } = require(path.join(B, 'utils/pdfDelExpediente'));

const RELLENO = 'CERTIFICADO DE INSTALACION Y FIN DE OBRA. Actuacion de ahorro de energia segun la ficha RES060. ';
async function pdf({ texto = '', campo = null } = {}) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    String(texto).split('\n').forEach((l, i) => page.drawText(l, { x: 40, y: 800 - i * 14, size: 9, font }));
    if (campo) {
        const tf = doc.getForm().createTextField('rc');
        tf.setText(campo);
        tf.addToPage(page, { x: 40, y: 400, width: 300, height: 20 });
    }
    return Buffer.from(await doc.save());
}

const exp242 = { id: 'id-242', numero_expediente: '26RES060_242', instalacion: { ref_catastral: '4057329VK8245N0001XH' }, oportunidades: { ref_catastral: null, datos_calculo: {} } };

let fallos = 0;
function caso(nombre, r, esperado) {
    const bien = Object.entries(esperado).every(([k, v]) => {
        const real = k === 'por' ? r.ajeno?.por : k === 'otro' ? r.ajeno?.numero_expediente : k === 'aviso' ? !!r.aviso : r[k];
        return real === v;
    });
    if (!bien) fallos++;
    console.log(`${bien ? 'OK ' : 'MAL'} ${nombre}${bien ? '' : `\n     esperado ${JSON.stringify(esperado)}\n     obtenido ${JSON.stringify(r)}`}`);
}

(async () => {
    // Las expresiones regulares, sueltas.
    const ids = identificadoresEnTexto('Expediente: 26RES060_182 · oportunidad 26RES060_OP117 · RC 2111707 VJ8621S 0001 SX · rústica 13045A00800123000 0YZ · 26RES060FM_3');
    const okIds = ids.numeros.join() === '26RES060_182,26RES060FM_3' && ids.rcs.includes('2111707VJ8621S0001SX');
    if (!okIds) fallos++;
    console.log(`${okIds ? 'OK ' : 'MAL'} identificadores: ${JSON.stringify(ids)}`);

    const C = (texto, campo) => pdf({ texto: RELLENO + '\n' + texto, campo });
    const comprobar = async (buffer, extra = {}) => comprobarPdfDelExpediente({ buffer, mimetype: 'application/pdf', exp: exp242, documento: 'CIFO', ...extra });

    caso('nº de otro expediente', await comprobar(await C('Expediente 26RES060_182\nRef. catastral 2111707VJ8621S0001SX')), { ok: false, por: 'numero', otro: '26RES060_182' });
    caso('nuestro nº', await comprobar(await C('Expediente 26RES060_242\nRef. catastral 4057329VK8245N0001XH')), { ok: true, coincide: 'numero', aviso: false });
    caso('nuestro nº y otro', await comprobar(await C('Expediente 26RES060_242\nSustituye al 26RES060_182')), { ok: true, coincide: 'numero' });
    caso('nº que no existe (renumerado) y nuestra RC', await comprobar(await C('Expediente 26RES060_999\nRef. catastral 4057329VK8245N0001XH')), { ok: true, coincide: 'rc', aviso: true });
    caso('RC de otra obra, sin nº', await comprobar(await C('Ref. catastral 2111707VJ8621S0001SX')), { ok: false, por: 'rc', otro: '26RES060_182' });
    caso('RC de otra obra en un campo (Anexo I)', await comprobar(await C('ANEXO I DECLARACION RESPONSABLE'.repeat(3), '2111707VJ8621S0001SX'), { documento: 'Anexo I' }), { ok: false, por: 'rc', otro: '26RES060_182' });
    caso('nuestra RC con otro cargo (14 primeros)', await comprobar(await C('Ref. catastral 4057329VK8245N0002ZJ')), { ok: true, coincide: 'rc' });
    caso('RC que no es de ninguna obra (errata)', await comprobar(await C('Ref. catastral 4057329VK8245S0001XH')), { ok: true, coincide: null, aviso: true });
    caso('legible sin nº ni RC', await comprobar(await C('Memoria tecnica de la instalacion termica')), { ok: true, coincide: null, aviso: true });
    caso('legible sin nº ni RC, sin aviso pedido', await comprobar(await C('Memoria tecnica'), { avisarSinIdentificador: false }), { ok: true, coincide: null, aviso: false });
    caso('sin texto (escaneado)', await comprobar(await pdf()), { ok: true, legible: false, aviso: true });
    caso('imagen', await comprobarPdfDelExpediente({ buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg', exp: exp242, documento: 'CIFO' }), { ok: true, legible: false, aviso: true });
    caso('no es un PDF', await comprobar(Buffer.from('hola, esto no es un pdf')), { ok: true, legible: false, aviso: true });
    bdRota = true;
    caso('BD caída: no bloquea', await comprobar(await C('Expediente 26RES060_182')), { ok: true, aviso: true });
    bdRota = false;

    const rechazo = await comprobar(await C('Expediente 26RES060_182'));
    const msgOk = rechazo.error === 'Este CIFO es del expediente 26RES060_182, no de este (26RES060_242). No se ha guardado: sube el CIFO de esta obra.';
    if (!msgOk) fallos++;
    console.log(`${msgOk ? 'OK ' : 'MAL'} mensaje al instalador: ${rechazo.error}`);

    console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO BIEN');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
