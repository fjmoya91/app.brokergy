/**
 * probar_pared_ocr — Lee la foto de una fachada REAL de un expediente, sin
 * escribir NADA: ni en el expediente, ni en Drive, ni en el plano.
 *
 *   node implementation/backend/scripts/probar_pared_ocr.js 26RES060_186
 *   node implementation/backend/scripts/probar_pared_ocr.js 26RES060_186 --pared=FBS3 --largo=10.94
 *
 * Sin `--pared` solo LISTA las fotos de la envolvente que tiene el expediente,
 * que es lo primero que hay que mirar: si no hay ninguna, no hay nada que leer.
 *
 * Es el gemelo de `probar_placa_ocr.js`, y sirve para lo mismo: ver el dossier
 * antes de discutir la respuesta. Casi siempre el problema no es cómo lee el
 * modelo, sino qué foto se le ha dado.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fotos = require('../services/paredFotoService');
const paredOcr = require('../services/paredOcrService');
const cex = require('../services/ceeEnvolventeCex');

const arg = (n, d = null) => {
    const a = process.argv.find((x) => x.startsWith(`--${n}=`));
    return a ? a.split('=').slice(1).join('=') : d;
};

(async () => {
    const clave = process.argv[2];
    if (!clave) {
        console.error('Uso: node scripts/probar_pared_ocr.js <nº expediente> [--pared=FBS3] [--largo=10.94] [--alto=2.80]');
        process.exit(1);
    }

    const ctx = await cex.cargarExpediente(clave);
    if (!ctx) { console.error(`No encuentro el expediente «${clave}».`); process.exit(1); }
    console.log(`\n📁 ${ctx.expediente.numero_expediente}\n`);

    const { fotos: cands, aviso } = await fotos.candidatas(ctx.expediente);
    if (aviso) console.log(`⚠  ${aviso}`);
    if (!cands.length) { console.log('Sin fotos de la envolvente. Nada que leer.\n'); process.exit(0); }

    console.log(`FOTOS DE LA ENVOLVENTE QUE YA TIENE (${cands.length}):`);
    for (const [i, f] of cands.entries()) {
        console.log(`  [${i}] ${f.rotulo.padEnd(28)} ${f.nombre}`);
    }

    const pared = arg('pared');
    if (!pared) {
        console.log('\nPara leer una: --pared=FBS3 --largo=10.94 [--alto=2.80] [--foto=0]\n');
        process.exit(0);
    }

    const cual = Number(arg('foto', '0'));
    const elegida = cands[cual];
    if (!elegida) { console.error(`No hay foto [${cual}].`); process.exit(1); }

    const bytes = await fotos.bytesDe(ctx.expediente, elegida.drive_id, { cands });
    const geom = {
        nombre: pared,
        orientacion: arg('orientacion', '—'),
        largo: Number(arg('largo', '0')) || null,
        alto: Number(arg('alto', '2.80')) || null,
    };

    console.log(`\n✨ Leyendo «${elegida.nombre}» como la pared ${pared}`
        + `${geom.largo ? ` (${geom.largo} m de ancho)` : ' (SIN largo: no habrá medidas)'}…\n`);

    // En la app el aspecto lo mide el navegador, que ya tiene el blob. Aquí se
    // lee del propio JPEG: pasarlo a ojo falsea el contraste de escalas, que es
    // justo lo que se está probando.
    const aspecto = Number(arg('aspecto', '0')) || aspectoJpeg(bytes.buffer);
    console.log(aspecto
        ? `Aspecto de la foto: ${aspecto.toFixed(3)}`
        : 'No se ha podido medir el aspecto de la foto.');
    const t0 = Date.now();
    const r = await paredOcr.leerFachada(
        [{ name: elegida.nombre, buffer: bytes.buffer, mimeType: bytes.mimeType }],
        geom, { aspecto });

    console.log(`Encuadre: ${r.encuadre}${r.plantas_visibles ? ` · ${r.plantas_visibles} plantas` : ''}`);
    console.log(`Leídas: ${r.ventanas} ventanas y ${r.puertas} puertas\n`);
    for (const h of r.huecos) {
        const med = h.ancho && h.alto
            ? `${String(h.ancho).replace('.', ',')} × ${String(h.alto).replace('.', ',')} m`
            : '— sin medida —';
        console.log(`  · ${h.tipo.padEnd(8)} ${med.padEnd(18)} `
            + `${[h.material_marco, h.acristalamiento, h.persiana === true ? 'persiana' : null]
                .filter(Boolean).join(' · ')}`);
        if (h.descripcion) console.log(`      ${h.descripcion}`);
    }
    if (r.escala?.length) console.log(`\nEscala: ${r.escala.join(' · ')}`);
    for (const a of r.avisos || []) console.log(`⚠  ${a}`);
    if (r.observaciones) console.log(`\nObservaciones: ${r.observaciones}`);
    console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s · nada se ha escrito)\n`);
    process.exit(0);
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });

/**
 * El ancho/alto de un JPEG, recorriendo sus marcadores.
 *
 * NUNCA buscando bytes a ojo dentro de los datos comprimidos: ahí un `FF` va
 * escapado o es un marcador de reinicio, y a ojo se lee cualquier cosa. Es el
 * mismo cuidado que `miniaturaExif` con la foto de fachada del Catastro.
 */
function aspectoJpeg(buf) {
    try {
        if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
        let i = 2;
        while (i < buf.length - 9) {
            if (buf[i] !== 0xFF) { i++; continue; }
            const m = buf[i + 1];
            // Relleno, y los marcadores sin carga (RSTn, SOI, EOI).
            if (m === 0xFF) { i++; continue; }
            if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
            const len = buf.readUInt16BE(i + 2);
            // Los SOFn traen alto y ancho; SOF4/8/12 no son de imagen.
            const esSof = (m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC;
            if (esSof) {
                const alto = buf.readUInt16BE(i + 5);
                const ancho = buf.readUInt16BE(i + 7);
                return alto > 0 ? ancho / alto : null;
            }
            i += 2 + len;
        }
    } catch { /* un JPEG roto no puede tumbar la prueba */ }
    return null;
}
