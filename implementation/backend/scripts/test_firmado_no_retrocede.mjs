#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Un autoguardado no puede devolver un FIRMADO a la versión anterior.
 *
 *   node scripts/test_firmado_no_retrocede.mjs
 *
 * Las rutas dedicadas (cesion-manuscrita, firmar-subir, la subida pública del
 * cliente y la del instalador) escriben `*_signed_link` directamente en BD. El
 * módulo de Documentación reenvía `documentacion` ENTERA desde su copia, que solo
 * se hidrata al abrir el expediente. 26RES080_59, 30/10/2026:
 *   17:37  cesion-manuscrita → Convenio v1
 *   17:39  cesion-manuscrita → Convenio v2 (la v1 va a OLD)
 *   17:41  la subida del Anexo Fotográfico reenvía la copia con la v1; el merge
 *          lo toma por una firma nueva y le sella `anexo_cesion_signed_at`
 *   17:43  «validar» copia la v1 a "10. EXPEDIENTE CAE"
 * Pura: no toca la BD ni Drive.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { mergeDocumentacion } = require('../utils/mergeDocumentacion.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

const V1 = 'https://drive.google.com/file/d/1WvmtDkIkQ0a79tIcJb5zMkd--FNu4aZ-/view';
const V2 = 'https://drive.google.com/file/d/15qeqj9merbhn0J5pyI4922Fk2hnsqpOh/view';
const FOTO = 'https://drive.google.com/file/d/FOTO/view';
const SELLO_VIEJO = '2026-10-30T16:12:21.000Z';

console.log('\n── 26RES080_59: la copia vieja NO devuelve el Convenio a la v1 ──');
{
    // En BD: la v2, que escribió cesion-manuscrita sin tocar el sello.
    const enBd = { anexo_cesion_signed_link: V2, anexo_cesion_signed_at: SELLO_VIEJO, cesion_firmado_brokergy: true };
    // Del navegador: la copia con la v1 y el mismo sello, más lo que de verdad se
    // guarda (el Anexo Fotográfico, con su sello de ahora).
    const delNavegador = {
        anexo_cesion_signed_link: V1, anexo_cesion_signed_at: SELLO_VIEJO, cesion_firmado_brokergy: true,
        anexo_fotografico_signed_link: FOTO, anexo_fotografico_signed_at: '2026-10-30T17:41:55.000Z',
    };
    const r = mergeDocumentacion(enBd, delNavegador);
    ok(r.anexo_cesion_signed_link === V2, 'el Convenio sigue en la v2');
    ok(r.anexo_cesion_signed_at === SELLO_VIEJO, 'y no se le sella una firma que no ha llegado');
    ok(r.anexo_fotografico_signed_link === FOTO, 'el Anexo Fotográfico sí se guarda');
    ok(!(r.historial || []).some(h => h.tipo === 'doc_nueva_version' && /Cesi/i.test(h.texto || '')),
        'y no se apunta una «versión nueva» del Convenio');
}

console.log('\n── Tampoco con un sello ANTERIOR al de BD ──');
{
    const enBd = { anexo_i_signed_link: V2, anexo_i_signed_at: '2026-10-30T17:39:00.000Z' };
    const r = mergeDocumentacion(enBd, { anexo_i_signed_link: V1, anexo_i_signed_at: '2026-10-30T17:37:00.000Z' });
    ok(r.anexo_i_signed_link === V2, 'el firmado sigue siendo el de BD');
    ok(r.anexo_i_signed_at === '2026-10-30T17:39:00.000Z', 'y el sello no retrocede');
}

console.log('\n── Una copia hidratada ANTES de la firma no la BORRA ──');
{
    // El cliente firmó por su enlace con la vista abierta: la copia trae null.
    const enBd = { anexo_i_signed_link: V2, anexo_i_signed_at: '2026-10-30T17:39:00.000Z' };
    const r = mergeDocumentacion(enBd, { anexo_i_signed_link: null, anexo_i_signed_at: null, fecha_fin_cifo: '2026-10-20' });
    ok(r.anexo_i_signed_link === V2, 'el firmado del cliente sigue ahí');
    ok(r.anexo_i_signed_at === '2026-10-30T17:39:00.000Z', 'con su sello');
    ok(r.fecha_fin_cifo === '2026-10-20', 'y lo demás se guarda');
}

console.log('\n── Vale para TODOS los firmados, no solo los tres anexos ──');
for (const campo of ['cert_cifo_signed_link', 'ficha_res060_signed_link', 'anexo_fotografico_signed_link', 'cert_rite_signed_link']) {
    const r = mergeDocumentacion({ [campo]: V2 }, { [campo]: V1 });
    ok(r[campo] === V2, `${campo}: no retrocede`);
}

console.log('\n── La subida desde la app (sello POSTERIOR) sí cambia el firmado ──');
{
    const enBd = {
        anexo_cesion_signed_link: V1, anexo_cesion_signed_at: SELLO_VIEJO,
        docs_validados: { anexo_cesion_signed_link: '2026-10-30T17:00:00.000Z' },
    };
    const r = mergeDocumentacion(enBd, {
        anexo_cesion_signed_link: V2, anexo_cesion_signed_at: '2026-10-30T17:39:00.000Z',
        docs_validados: { anexo_cesion_signed_link: '2026-10-30T17:00:00.000Z' },
    });
    ok(r.anexo_cesion_signed_link === V2, 'entra el fichero nuevo');
    ok(Date.parse(r.anexo_cesion_signed_at) >= Date.parse('2026-10-30T17:39:00.000Z'), 'con su sello');
    ok(!r.docs_validados?.anexo_cesion_signed_link, 'y vuelve a PENDIENTE DE REVISAR');
}
{
    // Un firmado sin sello propio (Anexo Fotográfico) también, si trae el suyo.
    const r = mergeDocumentacion({ anexo_fotografico_signed_link: V1 },
        { anexo_fotografico_signed_link: V2, anexo_fotografico_signed_at: '2026-10-30T17:41:55.000Z' });
    ok(r.anexo_fotografico_signed_link === V2, 'el Anexo Fotográfico se sustituye con su sello');
}

console.log('\n── Llenar un hueco vacío no necesita sello ──');
{
    const r = mergeDocumentacion({ anexo_i_signed_link: null }, { anexo_i_signed_link: V1 });
    ok(r.anexo_i_signed_link === V1, 'el primer firmado entra');
    ok(!!r.anexo_i_signed_at, 'y se le sella la llegada');
}

console.log('\n── BORRAR exige la orden del botón, y la orden no se guarda ──');
{
    const enBd = { cert_cifo_signed_link: V2, cert_cifo_signed_at: SELLO_VIEJO };
    const r = mergeDocumentacion(enBd, { cert_cifo_signed_link: null, _firmado_borrado: 'CERT_CIFO_SIGNED_LINK' });
    ok(!r.cert_cifo_signed_link, 'con la orden (en MAYÚSCULAS, como llega tras normalizeData) se borra');
    ok(!('_firmado_borrado' in r), 'la orden no queda en documentacion');
    const r2 = mergeDocumentacion(enBd, { cert_cifo_signed_link: null, _firmado_borrado: 'anexo_i_signed_link' });
    ok(r2.cert_cifo_signed_link === V2, 'la orden de OTRO firmado no borra este');
}

console.log('\n── El sello de BD queda >= el de la copia aunque el navegador vaya adelantado ──');
{
    const futuro = new Date(Date.now() + 60_000).toISOString();
    const r = mergeDocumentacion({ anexo_i_signed_link: V1, anexo_i_signed_at: SELLO_VIEJO },
        { anexo_i_signed_link: V2, anexo_i_signed_at: futuro });
    ok(r.anexo_i_signed_at === futuro, 'se queda el del navegador, no el «ahora» del servidor');
    // Y esa misma copia, ya vieja, no puede volver a la v1 después.
    const r2 = mergeDocumentacion(r, { anexo_i_signed_link: V1, anexo_i_signed_at: futuro });
    ok(r2.anexo_i_signed_link === V2, 'con el mismo sello no se cambia');
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
