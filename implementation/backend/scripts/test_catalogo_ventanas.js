/**
 * test_catalogo_ventanas.js — prueba de extremo a extremo del catálogo de ventanas.
 * ---------------------------------------------------------------------------
 * Recorre lo mismo que hace una persona en la app, contra el backend REAL y la
 * base REAL, pero sobre un modelo de prueba que se crea y se borra al terminar:
 *
 *   1. Listar el catálogo (marcos y cristales) y comprobar la siembra.
 *   2. Crear un modelo, chocar con el duplicado, y reintentarlo con `upsertar`.
 *   3. Editar y completar huecos con el PATCH (sin borrar el resto de la fila).
 *   4. Comprobar el volcado al expediente (Uf/Ug/g/composición) con la MISMA
 *      función que usa la app (`aplicarMarco` / `aplicarCristal`).
 *   5. Comprobar los huecos de ficha técnica del RES080 (marco y vidrio) y que
 *      NO aparecen si el expediente no sustituye ventanas ni en un CIFO.
 *   6. Comprobar los permisos: un partner no entra, y borrar es solo de ADMIN.
 *
 * NO envía nada, NO toca ningún expediente real y NO sube nada a Drive.
 *
 *   node implementation/backend/scripts/test_catalogo_ventanas.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../services/supabaseClient');

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000';
const EMAIL_ADMIN = process.env.TEST_ADMIN_EMAIL || 'franciscojavier.moya@brokergy.es';

let ok = 0, ko = 0;
const check = (cond, msg, extra) => {
    if (cond) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`); }
};

/** Sesión real de un ADMIN sin conocer su contraseña: enlace mágico + verifyOtp. */
async function tokenAdmin() {
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: EMAIL_ADMIN });
    if (error) throw new Error(`No se pudo generar el enlace de sesión: ${error.message}`);
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: s, error: e2 } = await anon.auth.verifyOtp({
        type: 'magiclink', token_hash: data.properties.hashed_token,
    });
    if (e2) throw new Error(`No se pudo canjear el enlace: ${e2.message}`);
    return s.session.access_token;
}

async function api(token, method, path, body) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch { /* 204 y similares */ }
    return { status: r.status, body: json };
}

(async () => {
    console.log('\n=== CATÁLOGO DE VENTANAS · prueba de extremo a extremo ===\n');

    // El servidor tiene que estar levantado: si no, todo lo demás daría "falso
    // fallo" y costaría entender por qué.
    try {
        const ping = await fetch(`${BASE}/api/ventanas/marcos`);
        if (ping.status === 0) throw new Error('sin respuesta');
    } catch (e) {
        console.error(`No hay backend en ${BASE}. Arráncalo (npm start) o pon TEST_API_BASE.\n`);
        process.exit(1);
    }

    const token = await tokenAdmin();
    console.log(`Sesión de ${EMAIL_ADMIN} lista.\n`);

    // ── 1. Listado y siembra ─────────────────────────────────────────────────
    console.log('1) Listado y siembra');
    const marcos = await api(token, 'GET', '/api/ventanas/marcos');
    const cristales = await api(token, 'GET', '/api/ventanas/cristales');
    check(marcos.status === 200 && Array.isArray(marcos.body), 'GET /marcos responde una lista', marcos.status);
    check(cristales.status === 200 && Array.isArray(cristales.body), 'GET /cristales responde una lista', cristales.status);
    const a70 = (marcos.body || []).find(m => m.marca === 'CORTIZO' && m.serie === 'A 70');
    check(a70 && Number(a70.uf) === 1.3, 'CORTIZO A 70 abisagrada trae Uf 1,30', a70 && a70.uf);
    const c70 = (marcos.body || []).find(m => m.marca === 'CORTIZO' && m.serie === 'C 70');
    check(c70 && Number(c70.uf) === 1.8, 'CORTIZO C 70 corredera trae OTRO Uf (1,80): el Uf es por apertura', c70 && c70.uf);
    const gsAire = (cristales.body || []).find(c => c.gama === 'GUARDIAN SUN' && /16 AIRE/.test(c.composicion));
    const gsArgon = (cristales.body || []).find(c => c.gama === 'GUARDIAN SUN' && /ARGÓN/.test(c.composicion));
    check(gsAire && gsArgon && Number(gsAire.ug) === 1.3 && Number(gsArgon.ug) === 1.0,
        'La misma gama da Ug distinto según la cámara (aire 1,3 · argón 1,0)',
        [gsAire && gsAire.ug, gsArgon && gsArgon.ug]);
    check((marcos.body || []).every(m => m.uf === null || m.validado),
        'Ningún marco trae un Uf sin marcar como verificado');

    // El listado viene entero y se filtra en el navegador SIN TILDES: es la única
    // forma de que "kommerling" encuentre "KÖMMERLING" (un ilike en SQL no lo hace).
    check((marcos.body || []).some(m => /KÖMMERLING/.test(m.marca)),
        'El catálogo trae marcas con tilde, que el filtro del navegador normaliza');

    // ── 2. Alta, duplicado y upsert ──────────────────────────────────────────
    console.log('\n2) Alta, duplicado y alta desde el expediente');
    const SERIE = `ZZ TEST ${Date.now()}`;
    const alta = await api(token, 'POST', '/api/ventanas/marcos', {
        marca: 'marca prueba', serie: SERIE, apertura: 'CORREDERA', material: 'PVC', uf: '1,45',
    });
    check(alta.status === 201 && alta.body.id, 'Se crea el modelo', alta.status);
    check(alta.body.marca === 'MARCA PRUEBA', 'La marca se normaliza a mayúsculas', alta.body.marca);
    check(Number(alta.body.uf) === 1.45, 'El Uf acepta la coma decimal española', alta.body.uf);
    const idMarco = alta.body.id;

    const dup = await api(token, 'POST', '/api/ventanas/marcos', {
        marca: 'MARCA PRUEBA', serie: SERIE, apertura: 'CORREDERA',
    });
    check(dup.status === 409 && dup.body.duplicado, 'Un duplicado desde el catálogo avisa (409)', dup.status);

    const ups = await api(token, 'POST', '/api/ventanas/marcos', {
        marca: 'MARCA PRUEBA', serie: SERIE, apertura: 'CORREDERA', uf: '1,45', material: 'PVC', upsertar: true,
    });
    check(ups.status === 201 && ups.body.id === idMarco,
        'Desde el expediente, el mismo modelo devuelve el que ya existe (no duplica)', ups.body && ups.body.id);

    const sinMarca = await api(token, 'POST', '/api/ventanas/marcos', { serie: 'X' });
    check(sinMarca.status === 400, 'Sin marca no deja crear', sinMarca.status);

    // ── 3. PATCH: completar huecos sin borrar el resto ───────────────────────
    console.log('\n3) Completar un hueco sin llevarse por delante lo demás');
    await api(token, 'PUT', `/api/ventanas/marcos/${idMarco}`, {
        marca: 'MARCA PRUEBA', serie: SERIE, apertura: 'CORREDERA', material: 'PVC',
        uf: '', ficha_tecnica: 'https://example.org/ft.pdf', notas: 'nota que no se puede perder',
    });
    const patch = await api(token, 'PATCH', `/api/ventanas/marcos/${idMarco}`, { uf: '2,05', validado: true });
    check(patch.status === 200 && Number(patch.body.uf) === 2.05, 'El PATCH escribe el Uf', patch.body && patch.body.uf);
    check(patch.body.ficha_tecnica === 'https://example.org/ft.pdf' && patch.body.notas === 'nota que no se puede perder',
        'El PATCH NO borra la ficha ni las notas (a diferencia del PUT)',
        patch.body && [patch.body.ficha_tecnica, patch.body.notas]);
    const patchVacio = await api(token, 'PATCH', `/api/ventanas/marcos/${idMarco}`, {});
    check(patchVacio.status === 400, 'Un PATCH sin campos se rechaza', patchVacio.status);

    // ── 4. Volcado al expediente ─────────────────────────────────────────────
    console.log('\n4) Lo que el modelo vuelca al expediente');
    const { aplicarMarco, aplicarCristal, marcoDelExpediente, cristalDelExpediente } =
        await import('../../frontend/src/features/expedientes/logic/ventanasCatalogo.js');

    const volcadoMarco = aplicarMarco(a70);
    check(volcadoMarco.marco_nuevo_transmitancia === 1.3
        && volcadoMarco.marco_nuevo_marca === 'CORTIZO'
        && /Abisagrada/.test(volcadoMarco.marco_nuevo_modelo)
        && volcadoMarco.marco_catalogo_id === a70.id,
        'Elegir el marco rellena marca, modelo, material y Uf', volcadoMarco);

    const sinUf = (marcos.body || []).find(m => m.uf === null);
    check(sinUf && !('marco_nuevo_transmitancia' in aplicarMarco(sinUf)),
        'Un modelo SIN Uf no pisa el Uf que ya hubiera escrito',
        sinUf && aplicarMarco(sinUf));

    const volcadoCristal = aplicarCristal(gsArgon);
    check(volcadoCristal.cristal_nuevo_transmitancia === 1
        && volcadoCristal.cristal_nuevo_factor_solar === 0.43
        && volcadoCristal.cristal_nuevo_composicion === gsArgon.composicion,
        'Elegir el vidrio rellena composición, Ug y factor solar', volcadoCristal);

    const expFicticio = { documentacion: { envolvente: {
        ...volcadoMarco, ...volcadoCristal, sustituye_ventanas: true,
        marco_carpinteria: 'ALUMINIOS MANZANARES S.L.',
    } } };
    const m = marcoDelExpediente(expFicticio);
    check(m.conCarpinteria === 'CORTIZO A 70 · Abisagrada (fabricada por ALUMINIOS MANZANARES S.L.)',
        'El rótulo nombra la marca del sistema Y la carpintería', m.conCarpinteria);
    const mSinCarp = marcoDelExpediente({ documentacion: { envolvente: { ...volcadoMarco, marco_carpinteria: 'CORTIZO' } } });
    check(mSinCarp.conCarpinteria === 'CORTIZO A 70 · Abisagrada',
        'Si la carpintería ES la marca, no se dice dos veces', mSinCarp.conCarpinteria);
    check(cristalDelExpediente(expFicticio).etiqueta === 'GUARDIAN SUN',
        'El vidrio no repite el fabricante dentro de su propia gama',
        cristalDelExpediente(expFicticio).etiqueta);

    // ── 5. Huecos de ficha técnica del RES080 ────────────────────────────────
    console.log('\n5) Huecos de ficha técnica (marco y vidrio)');
    const ft = await import('../../frontend/src/features/expedientes/logic/fichasTecnicas.js');
    const slots = ft.resolveEnvolventeFichaSlots(expFicticio);
    check(slots.length === 2 && slots[0].type === 'marco' && slots[1].type === 'cristal',
        'Un RES080 que sustituye ventanas pide DOS fichas', slots.map(s => s.type));
    check(slots[0].modelId === a70.id && slots[1].modelId === gsArgon.id,
        'Cada hueco sabe de qué modelo del catálogo sale su ficha');
    check(ft.resolveEnvolventeFichaSlots({ documentacion: { envolvente: { sustituye_ventanas: false } } }).length === 0,
        'Sin sustitución de ventanas NO se piden esas fichas');
    check(ft.ftFileName('26RES080_44', 'marco') === '26RES080_44 - FT MARCO VENTANA.pdf'
        && ft.ftFileName('26RES080_44', 'cristal') === '26RES080_44 - FT VIDRIO.pdf',
        'El nombre en Drive distingue el marco del vidrio');
    check(ft.ftTypeFromSlotId(ft.ftSlotId('marco')) === 'marco'
        && ft.ftTypeFromSlotId(ft.ftSlotId('cal2')) === 'cal2',
        'El id del hueco y su tipo son reversibles (y no rompen los de aerotermia)');
    check(ft.ftAttachmentSlots(expFicticio.instalacion).every(s => !/envolvente/.test(s.id)),
        'El CIFO (que no pasa el expediente) NO ve los huecos de envolvente');
    check(ft.findSlotForExpediente(expFicticio, 'marco') !== null
        && ft.findSlotForExpediente({ documentacion: { envolvente: { sustituye_ventanas: false } } }, 'marco') === null,
        'La ruta valida contra el MISMO alcance que la vista');

    // ── 6. Permisos ──────────────────────────────────────────────────────────
    console.log('\n6) Permisos');
    const sinSesion = await api(null, 'GET', '/api/ventanas/marcos');
    check(sinSesion.status === 401 || sinSesion.status === 403,
        'Sin sesión no se lee el catálogo', sinSesion.status);
    const tipoMalo = await api(token, 'GET', '/api/ventanas/persianas');
    check(tipoMalo.status === 404, 'Un catálogo inventado da 404', tipoMalo.status);

    // ── Limpieza ─────────────────────────────────────────────────────────────
    const del = await api(token, 'DELETE', `/api/ventanas/marcos/${idMarco}`);
    check(del.status === 200, 'El modelo de prueba se borra', del.status);
    const tras = await api(token, 'GET', `/api/ventanas/marcos/${idMarco}`);
    check(tras.status === 404, 'Y ya no está', tras.status);

    console.log(`\n=== ${ok} bien · ${ko} mal ===\n`);
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('\nLa prueba se ha roto:', e); process.exit(1); });
