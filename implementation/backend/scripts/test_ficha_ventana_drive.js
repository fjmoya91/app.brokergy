/**
 * test_ficha_ventana_drive.js — la ficha técnica del marco y del vidrio, de ida
 * y de vuelta, CONTRA DRIVE DE VERDAD.
 * ---------------------------------------------------------------------------
 * Lo que comprueba el otro test (`test_catalogo_ventanas.js`) es la lógica; esto
 * comprueba los dos caminos que tocan Google Drive, que es donde no vale simular:
 *
 *   IDA    — auto-copiar al expediente la ficha del modelo del catálogo
 *            (POST /:id/fichas-tecnicas/auto-copy con type 'marco' y 'cristal'),
 *            y que la ruta se NIEGA cuando el expediente no lleva esa ficha.
 *   VUELTA — subir una ficha a un expediente con "guardarla también en el
 *            catálogo" (POST /:id/fichas-tecnicas/upload), y que NO pisa una
 *            ficha que ya exista salvo que se pida expresamente.
 *
 * DEJA TODO COMO ESTABA: restaura la envolvente del expediente y borra de Drive
 * cuanto crea. El modelo de catálogo que usa para la vuelta es de pruebas y se
 * borra también. Si algo se rompe a mitad, imprime qué ha quedado suelto.
 *
 *   node implementation/backend/scripts/test_ficha_ventana_drive.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../services/supabaseClient');
const { findSubfolderByName, findFileByName, deleteFile, getFileMetadata } = require('../services/driveService');
const { CARPETAS } = require('../services/catalogoFichas');

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000';
const EMAIL_ADMIN = process.env.TEST_ADMIN_EMAIL || 'franciscojavier.moya@brokergy.es';
// Un RES080 que SÍ sustituye ventanas, aún en curso y sin marca/modelo puestos.
const EXPTE = process.env.TEST_EXPEDIENTE || '26RES080_66';

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`); }
};

async function tokenAdmin() {
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: EMAIL_ADMIN });
    if (error) throw new Error(error.message);
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: s, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
    if (e2) throw new Error(e2.message);
    return s.session.access_token;
}

async function api(token, method, path, body) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, body: json };
}

/** Un PDF de una página, válido y mínimo: no hace falta más para probar el camino. */
function pdfDePrueba(texto) {
    const contenido = `BT /F1 12 Tf 60 700 Td (${texto}) Tj ET`;
    const objs = [
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj',
        `4 0 obj<</Length ${contenido.length}>>stream\n${contenido}\nendstream endobj`,
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (const o of objs) { offsets.push(pdf.length); pdf += o + '\n'; }
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
        + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
        + `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
}

(async () => {
    console.log('\n=== FICHA DE VENTANA · ida y vuelta contra Drive ===\n');
    const token = await tokenAdmin();

    // ── Preparar: expediente real + modelos del catálogo ────────────────────
    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, documentacion, oportunidad_id')
        .eq('numero_expediente', EXPTE).single();
    if (!exp) throw new Error(`No existe el expediente ${EXPTE}`);
    const { data: op } = await supabase.from('oportunidades').select('datos_calculo').eq('id', exp.oportunidad_id).single();
    const carpeta = op?.datos_calculo?.drive_folder_id;
    if (!carpeta) throw new Error(`${EXPTE} no tiene carpeta de Drive`);

    const envOriginal = exp.documentacion?.envolvente || null;
    const docOriginal = exp.documentacion || {};
    console.log(`Expediente de pruebas: ${EXPTE} (se restaura al terminar)\n`);

    const { data: marco } = await supabase.from('ventanas_marcos')
        .select('*').eq('marca', 'CORTIZO').eq('serie', 'A 70').single();
    // Composición EXACTA: hay varias GUARDIAN SUN con cámara de 16 mm de aire
    // (4/16/4 y 6/16/4) y un filtro parcial devolvería dos filas.
    const { data: cristal } = await supabase.from('ventanas_cristales')
        .select('*').eq('gama', 'GUARDIAN SUN').eq('composicion', '4 (16 AIRE) 4').single();
    check(!!marco?.ficha_tecnica && !!cristal?.ficha_tecnica,
        'Los dos modelos del catálogo tienen ficha en Drive');

    const creado = [];   // driveIds que hay que borrar al final
    let modeloPruebaId = null;
    const restaurar = async () => {
        await supabase.from('expedientes')
            .update({ documentacion: { ...docOriginal, envolvente: envOriginal } })
            .eq('id', exp.id);
        for (const id of creado) { try { await deleteFile(id); } catch (e) { console.warn('  ⚠ no se pudo borrar', id, e.message); } }
        if (modeloPruebaId) { try { await supabase.from('ventanas_marcos').delete().eq('id', modeloPruebaId); } catch {} }
    };

    try {
        const { aplicarMarco, aplicarCristal } = await import('../../frontend/src/features/expedientes/logic/ventanasCatalogo.js');

        // ── 1. La ruta se NIEGA si el expediente no lleva esa ficha ──────────
        console.log('1) Alcance: sin sustitución de ventanas no hay ficha que copiar');
        await supabase.from('expedientes')
            .update({ documentacion: { ...docOriginal, envolvente: { ...(envOriginal || {}), sustituye_ventanas: false } } })
            .eq('id', exp.id);
        const negada = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/auto-copy`, { type: 'marco' });
        check(negada.status === 400 && negada.body?.error === 'slot_no_aplica',
            'auto-copy responde "no aplica" (400)', [negada.status, negada.body?.error]);

        // ── 2. Con ventanas pero SIN modelo: dice qué hay que hacer ──────────
        console.log('\n2) Con ventanas pero sin modelo elegido');
        await supabase.from('expedientes')
            .update({ documentacion: { ...docOriginal, envolvente: { ...(envOriginal || {}), sustituye_ventanas: true, marco_catalogo_id: null, cristal_catalogo_id: null } } })
            .eq('id', exp.id);
        const sinModelo = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/auto-copy`, { type: 'marco' });
        check(sinModelo.status === 400 && sinModelo.body?.error === 'no_model'
            && /catálogo de ventanas/i.test(sinModelo.body?.message || ''),
            'Manda al catálogo de ventanas, no al de aerotermia', sinModelo.body?.message);

        // ── 3. IDA: la ficha del modelo aterriza en el expediente ────────────
        console.log('\n3) IDA · auto-copiar la ficha del catálogo al expediente');
        const envConModelos = {
            ...(envOriginal || {}), sustituye_ventanas: true,
            ...aplicarMarco(marco), ...aplicarCristal(cristal),
        };
        await supabase.from('expedientes')
            .update({ documentacion: { ...docOriginal, envolvente: envConModelos } }).eq('id', exp.id);

        for (const [type, etiqueta, nombre] of [
            ['marco',   'del marco',  `${EXPTE} - FT MARCO VENTANA.pdf`],
            ['cristal', 'del vidrio', `${EXPTE} - FT VIDRIO.pdf`],
        ]) {
            const r = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/auto-copy`, { type, force: true });
            check(r.status === 200 && r.body?.driveId, `Se copia la ficha ${etiqueta}`, [r.status, r.body?.error, r.body?.message]);
            if (r.body?.driveId) creado.push(r.body.driveId);

            const ftFolder = await findSubfolderByName(carpeta, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
            const enDrive = ftFolder ? await findFileByName(ftFolder, nombre) : null;
            check(!!enDrive, `Está en Drive con su nombre canónico ("${nombre}")`);

            const info = await api(token, 'GET', `/api/expedientes/${exp.id}/fichas-tecnicas/${type}?info=1`);
            check(info.status === 200 && info.body?.fileName === nombre,
                `El modal la encuentra por nombre (GET ?info=1)`, [info.status, info.body?.fileName]);

            const { data: tras } = await supabase.from('expedientes').select('documentacion').eq('id', exp.id).single();
            const campo = type === 'marco' ? 'ft_marco_link' : 'ft_cristal_link';
            check(!!tras?.documentacion?.[campo], `Queda enlazada en documentacion.${campo}`);
        }

        // ── 4. VUELTA: subir una ficha y guardarla en el catálogo ────────────
        console.log('\n4) VUELTA · la ficha que se sube al expediente entra en el catálogo');
        const { data: nuevo } = await supabase.from('ventanas_marcos').insert([{
            marca: 'ZZ PRUEBA', serie: `AUTO ${Date.now()}`, apertura: 'ABISAGRADA', material: 'PVC', uf: 1.11,
        }]).select().single();
        modeloPruebaId = nuevo.id;
        check(!nuevo.ficha_tecnica, 'El modelo de prueba nace SIN ficha');

        await supabase.from('expedientes').update({
            documentacion: { ...docOriginal, envolvente: { ...envConModelos, ...aplicarMarco(nuevo) } },
        }).eq('id', exp.id);

        const base64 = pdfDePrueba('FICHA DE PRUEBA BROKERGY').toString('base64');
        const sub1 = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/upload`, {
            base64, type: 'marco', numexpte: EXPTE, guardarEnCatalogo: true,
        });
        check(sub1.status === 200 && sub1.body?.catalogo?.ok, 'La subida guarda también en el catálogo',
            [sub1.status, sub1.body?.catalogo]);
        if (sub1.body?.driveId) creado.push(sub1.body.driveId);
        if (sub1.body?.catalogo?.driveId) creado.push(sub1.body.catalogo.driveId);

        const { data: conFicha } = await supabase.from('ventanas_marcos').select('ficha_tecnica').eq('id', nuevo.id).single();
        check(!!conFicha?.ficha_tecnica, 'El modelo del catálogo ya tiene su ficha', conFicha?.ficha_tecnica);

        const meta = sub1.body?.catalogo?.driveId ? await getFileMetadata(sub1.body.catalogo.driveId, 'id,name,parents') : null;
        check(meta && meta.parents?.includes(CARPETAS.marco.id),
            'Y el fichero vive en la carpeta del CATÁLOGO, no dentro del expediente',
            meta && meta.parents);

        // ── 5. No se pisa una ficha existente sin pedirlo ────────────────────
        console.log('\n5) No se pisa una ficha que ya existe');
        const sub2 = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/upload`, {
            base64, type: 'marco', numexpte: EXPTE, guardarEnCatalogo: true,
        });
        check(sub2.status === 200 && sub2.body?.catalogo?.ok === false && sub2.body.catalogo.motivo === 'ya_tiene_ficha',
            'Sin marcar "sustituir", el catálogo se queda como está', sub2.body?.catalogo);
        if (sub2.body?.driveId && !creado.includes(sub2.body.driveId)) creado.push(sub2.body.driveId);

        const sub3 = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/upload`, {
            base64, type: 'marco', numexpte: EXPTE, guardarEnCatalogo: true, sustituirEnCatalogo: true,
        });
        check(sub3.status === 200 && sub3.body?.catalogo?.ok, 'Con "sustituir" sí la reemplaza', sub3.body?.catalogo);
        // OJO: cada subida deja DOS ficheros (el del expediente y el del catálogo)
        // y hay que apuntar los dos. Olvidar el del expediente aquí dejó un PDF de
        // prueba de 551 bytes ocupando el hueco de la ficha buena en 26RES080_66.
        if (sub3.body?.driveId) creado.push(sub3.body.driveId);
        if (sub3.body?.catalogo?.driveId) creado.push(sub3.body.catalogo.driveId);

        // ── 6. Sin marcar la casilla no se toca el catálogo ──────────────────
        console.log('\n6) Sin marcar la casilla, el catálogo no se toca');
        const { data: otro } = await supabase.from('ventanas_marcos').insert([{
            marca: 'ZZ PRUEBA', serie: `AUTO2 ${Date.now()}`, apertura: 'CORREDERA',
        }]).select().single();
        await supabase.from('expedientes').update({
            documentacion: { ...docOriginal, envolvente: { ...envConModelos, ...aplicarMarco(otro) } },
        }).eq('id', exp.id);
        const sub4 = await api(token, 'POST', `/api/expedientes/${exp.id}/fichas-tecnicas/upload`, {
            base64, type: 'marco', numexpte: EXPTE,
        });
        const { data: sigueVacio } = await supabase.from('ventanas_marcos').select('ficha_tecnica').eq('id', otro.id).single();
        check(sub4.status === 200 && !sub4.body?.catalogo && !sigueVacio?.ficha_tecnica,
            'La ficha sube al expediente y el modelo sigue sin ficha', [sub4.body?.catalogo, sigueVacio?.ficha_tecnica]);
        if (sub4.body?.driveId && !creado.includes(sub4.body.driveId)) creado.push(sub4.body.driveId);
        await supabase.from('ventanas_marcos').delete().eq('id', otro.id);

    } finally {
        console.log('\nLimpiando…');
        await restaurar();
        const { data: fin } = await supabase.from('expedientes').select('documentacion').eq('id', exp.id).single();
        const env = fin?.documentacion?.envolvente || null;
        check(JSON.stringify(env) === JSON.stringify(envOriginal),
            'El expediente queda EXACTAMENTE como estaba');
        check(!fin?.documentacion?.ft_marco_link && !fin?.documentacion?.ft_cristal_link,
            'Y sin los enlaces de ficha que creó la prueba');
    }

    console.log(`\n=== ${ok} bien · ${ko} mal ===\n`);
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('\nLa prueba se ha roto:', e); process.exit(1); });
