#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Registra el CONVENIO CAE vigente de un Sujeto Obligado en su ficha.
 *
 * Los convenios firmados hace meses solo existen DENTRO de las carpetas "E{n}"
 * de los expedientes, que es justo donde no pueden vivir: quien ordene esa
 * carpeta se lleva por delante la pieza E{n}-1 de todos los demás paquetes. Esto
 * los COPIA a la carpeta de convenios y los apunta en la ficha del S.O.
 *
 *   node scripts/registrar_convenio_cae.js <acrónimo|CIF> <driveFileId> [--execute]
 *   node scripts/registrar_convenio_cae.js INTERALCO 1O1Kf46… --execute
 *
 * Sin `--execute` solo dice qué haría. Antes de copiar LEE las firmas del PDF:
 * un convenio sin firma electrónica no es el convenio, y registrarlo dejaría
 * todos los paquetes citando un papel sin firmar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerFirmasPdf } = require('../utils/firmasPdf');
const { registrarConvenio, carpetaConvenios, nombreConvenio, CARPETA } = require('../services/convenioCae');

(async () => {
    const [clave, fileId] = process.argv.slice(2);
    const ejecutar = process.argv.includes('--execute');
    if (!clave || !fileId) {
        console.error('Uso: node scripts/registrar_convenio_cae.js <acrónimo|CIF> <driveFileId> [--execute]');
        process.exit(1);
    }

    // El S.O., por acrónimo o por CIF. Se exige que sea SUJETO_OBLIGADO: un
    // convenio CAE no se firma con un instalador ni con un certificador.
    const { data: candidatos } = await supabase.from('prescriptores')
        .select('id_empresa, razon_social, acronimo, cif, tipo_empresa, convenio_cae_link, convenio_cae_nombre')
        .eq('tipo_empresa', 'SUJETO_OBLIGADO');
    const k = String(clave).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const so = (candidatos || []).find(x => String(x.acronimo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === k
        || String(x.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === k);
    if (!so) {
        console.error(`No hay ningún SUJETO OBLIGADO que sea "${clave}". Los que hay: `
            + (candidatos || []).map(x => x.acronimo || x.razon_social).join(', '));
        process.exit(1);
    }

    console.log(`\n🏢 ${so.razon_social}${so.acronimo ? ` (${so.acronimo})` : ''} · ${so.cif}`);
    console.log(`   convenio actual: ${so.convenio_cae_link ? so.convenio_cae_nombre : '— ninguno —'}`);

    const meta = await driveService.getFileMetadata(fileId, 'id, name, size, md5Checksum, modifiedTime');
    if (!meta) { console.error('No se pudo leer ese fichero de Drive.'); process.exit(1); }
    console.log(`\n📄 ${meta.name}`);
    console.log(`   ${Math.round(meta.size / 1024)} KB · modificado ${String(meta.modifiedTime).slice(0, 10)}`);

    const buf = await driveService.getFileContent(fileId);
    const firmas = leerFirmasPdf(buf);
    if (!firmas.firmada) {
        console.error('\n⛔ Este PDF NO lleva firma electrónica: no es el convenio firmado.');
        console.error('   Registrarlo dejaría todos los paquetes citando un papel sin firmar.');
        process.exit(1);
    }
    console.log(`   ${firmas.n} firma(s):`);
    for (const f of firmas.firmantes) {
        console.log(`     · ${f.nombre || f.cn}${f.nif ? ` · ${f.nif}` : ''}${f.fecha ? ` · ${f.fecha}` : ''}`
            + `${f.organizacion ? ` · ${f.organizacion}` : ''}`);
    }

    const destino = ejecutar ? await carpetaConvenios() : null;
    console.log(`\n➜ se copiará a "${CARPETA}" como "${nombreConvenio(so)}"`);
    console.log(`  y se apuntará en la ficha de ${so.acronimo || so.razon_social}`);
    if (!ejecutar) { console.log('\n(en seco — repite con --execute)\n'); process.exit(0); }

    // NO se hereda el nombre de origen ("E4-1 - CONVENIO … _fdo_fdo.pdf"): en la
    // ficha se lee el nombre CANÓNICO, que es el que tiene el fichero en Drive.
    const r = await registrarConvenio(so.id_empresa, { fileId });
    console.log(`\n✅ registrado: ${r.convenio_cae_nombre}`);
    console.log(`   ${r.convenio_cae_link}`);
    console.log(`   carpeta: ${destino}\n`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
