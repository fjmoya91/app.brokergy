#!/usr/bin/env node
// test_cee_incompleto.js — un CEE cuyo XML no VALIDA no se da por bueno ni se sube
// (2026-10-19, 26RES060_195: inicial de la 2.3 sin ningún hueco → final en la 3.2
// con la marca «certificado incompleto»).
//   node scripts/test_cee_incompleto.js            sin CE3X: lo que se ve sin xml2cert
//   node scripts/test_cee_incompleto.js <xml>      además, valida ese XML con xml2cert
const fs = require('fs');
const assert = require('assert');
const { incompletoDelXml, validarXml, textoIncompleto } = require('../services/cee/cexAPdf');
const { radiografiaXml } = require('../services/cee/radiografiaCee');

let ok = 0;
const caso = async (nombre, fn) => { await fn(); ok++; console.log(`✓ ${nombre}`); };

//: El hueco de RELLENO tal y como lo escribe CE3X 3.2 en el v3.0 (26RES060_195).
const V30_SIN_HUECOS = `<?xml version="1.0" encoding="UTF-8" ?>
<DatosEnergeticosDelEdificio version="3.0"><Modelo><Huecos>
      <Hueco>
        <Tipo>Hueco</Tipo>
        <Fshobst>99999999.99</Fshobst>
        <Transmitancia>99999999.99</Transmitancia>
        <Nombre>99999999.99</Nombre>
        <Orientacion>N</Orientacion>
        <Superficie>99999999.99</Superficie>
        <Id>a3a7ff7c-44d9-443a-86df-56d2023a0e0b</Id>
      </Hueco>
</Huecos></Modelo></DatosEnergeticosDelEdificio>`;
const V30_CON_HUECOS = V30_SIN_HUECOS.replace(/<Nombre>99999999\.99<\/Nombre>/, '<Nombre>V1</Nombre>')
    .replace(/<Superficie>99999999\.99<\/Superficie>/, '<Superficie>1.50</Superficie>');
//: El de la 2.3 (v2.0), y EN MAYÚSCULAS como lo guarda la BD (regla 32).
const V20_SIN_HUECOS_BD = `<DATOSENERGETICOSDELEDIFICIO VERSION="2.0"><HUECOSYLUCERNARIOS><ELEMENTO>
<TIPO>HUECO</TIPO><SUPERFICIE>99999999.99</SUPERFICIE><TRANSMITANCIA>99999999.99</TRANSMITANCIA>
<NOMBRE>99999999.99</NOMBRE><ORIENTACION>NORTE</ORIENTACION></ELEMENTO></HUECOSYLUCERNARIOS></DATOSENERGETICOSDELEDIFICIO>`;

(async () => {
    await caso('un edificio SIN huecos se ve sin xml2cert (v3.0, v2.0 y en mayúsculas)', () => {
        assert.strictEqual(incompletoDelXml(V30_SIN_HUECOS).length, 1);
        assert.match(incompletoDelXml(Buffer.from(V30_SIN_HUECOS))[0], /NINGÚN hueco/);
        assert.strictEqual(incompletoDelXml(V20_SIN_HUECOS_BD).length, 1);
    });
    await caso('con huecos de verdad no dice nada', () => {
        assert.deepStrictEqual(incompletoDelXml(V30_CON_HUECOS), []);
        assert.deepStrictEqual(incompletoDelXml('<DatosEnergeticosDelEdificio version="3.0"></DatosEnergeticosDelEdificio>'), []);
    });
    await caso('el texto dice que no se sube y por qué', () => {
        const t = textoIncompleto(['x']);
        assert.match(t, /certificado incompleto/);
        assert.match(t, /no se da por bueno ni se sube: x$/);
    });
    await caso('validarXml: un v2.0 solo se mira por dentro (xml2cert no lo sabe validar)', async () => {
        const v = await validarXml(Buffer.from(V20_SIN_HUECOS_BD));
        assert.strictEqual(v.ok, false);
        assert.strictEqual(v.comprobado, false);
    });
    const real = process.argv[2];
    if (real) {
        await caso(`xml2cert: ${real.split(/[\\/]/).pop()}`, async () => {
            const buf = fs.readFileSync(real);
            const v = await validarXml(buf);
            console.log(`    ok=${v.ok} comprobado=${v.comprobado} · ${v.errores.join(' · ') || 'sin errores'}`);
            const rx = radiografiaXml(buf);
            console.log(`    radiografía: ${rx.envolvente?.huecos?.length ?? '?'} huecos`);
            if (incompletoDelXml(buf).length) {
                assert.strictEqual(v.ok, false);
                assert.strictEqual(rx.envolvente.huecos.length, 0, 'el hueco de relleno no cuenta como ventana');
            }
        });
    }
    console.log(`\n${ok} casos OK`);
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
