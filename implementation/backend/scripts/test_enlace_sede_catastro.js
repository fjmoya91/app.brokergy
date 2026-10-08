// El enlace a la ficha del inmueble en la Sede del Catastro (regla 122).
//
//   node scripts/test_enlace_sede_catastro.js            → lo puro, sin red
//   node scripts/test_enlace_sede_catastro.js --en-vivo  → además, contra el Catastro,
//                                                          EN SERIE y con pausa (regla 17)
//
// Lo puro: a qué página va cada caso (`urlSedeCatastro`), y que los dos sitios que pintan
// el enlace —los iconos del frontend y la página del encargo— pasan por la ruta.
process.env.WHATSAPP_ENABLED = 'false';
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const svc = require('../services/catastroService');
const enc = require('../services/encargoTecnico');

const FICHA = 'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx';
const LISTA = 'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx';
let fallos = 0;
async function prueba(nombre, fn) {
    try { await fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}

(async () => {
    console.log('enlace a la Sede');
    const u = svc.urlSedeCatastro;
    const tomelloso = { del: '13', mun: '82', rc20: '7847709VJ9374N0001DD', varios: false, urbRus: 'U' };

    await prueba('con la referencia de 20 → su ficha, con delegación, municipio y U/R', () => {
        assert.equal(u('7847709VJ9374N0001DD', tomelloso), `${FICHA}?del=13&mun=82&UrbRus=U&RefC=7847709VJ9374N0001DD`);
        assert.equal(u('13019A011000790000QZ', { del: '13', mun: '19', rc20: null, varios: false, urbRus: 'R' }),
            `${FICHA}?del=13&mun=19&UrbRus=R&RefC=13019A011000790000QZ`);
    });
    await prueba('con la de 14 de UN inmueble → la ficha con la de 20 (con 14 la Sede da «Error de Datos»)', () => {
        assert.equal(u('7847709VJ9374N', tomelloso), `${FICHA}?del=13&mun=82&UrbRus=U&RefC=7847709VJ9374N0001DD`);
        assert.equal(u('7847709VJ9374N', { ...tomelloso, rc20: null }), `${LISTA}?del=13&mun=82&rc1=7847709&rc2=VJ9374N`,
            'sin la de 20, la lista: nunca la ficha con 14');
    });
    await prueba('con la de 14 de un BLOQUE → la lista de la parcela, con del/mun', () => {
        assert.equal(u('3121402WN4032S', { del: '26', mun: '900', rc20: null, varios: true, urbRus: '' }),
            `${LISTA}?del=26&mun=900&rc1=3121402&rc2=WN4032S`);
        // La de 20 de una vivienda del bloque sí va a su ficha.
        assert.equal(u('3121402WN4032S0010OZ', { del: '26', mun: '900', rc20: '3121402WN4032S0010OZ', varios: false, urbRus: 'U' }),
            `${FICHA}?del=26&mun=900&UrbRus=U&RefC=3121402WN4032S0010OZ`);
    });
    await prueba('sin códigos (no contesta, no existe) → el atajo de siempre', () => {
        assert.equal(u('7847709VJ9374N0001DD', null), `${LISTA}?rc1=7847709&rc2=VJ9374N&RCCompleta=7847709VJ9374N0001DD`);
        assert.equal(u('7847709VJ9374N', { noExiste: true }), `${LISTA}?rc1=7847709&rc2=VJ9374N`);
    });
    await prueba('se limpia la referencia, y un UrbRus que no es U ni R va vacío', () => {
        assert.equal(u('7847709 vj9374n 0001 dd', { ...tomelloso, urbRus: 'X' }), `${FICHA}?del=13&mun=82&UrbRus=&RefC=7847709VJ9374N0001DD`);
    });
    await prueba('el «Ver en Catastro» del encargo pasa por la ruta (nunca la Sede a pelo)', () => {
        assert.equal(enc.comoLlegar({ rc: '7847709VJ9374N0001DD' }).catastro, '/api/catastro/sede/7847709VJ9374N0001DD');
        assert.equal(enc.comoLlegar({ rc: '7847709 VJ9374N' }).catastro, '/api/catastro/sede/7847709VJ9374N');
        assert.equal(enc.comoLlegar({ rc: '7847709' }).catastro, null);
    });
    await prueba('los iconos del frontend pasan por la MISMA ruta, y sin referencia no hay botón', async () => {
        const f = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/enlacesInmueble.js')).href);
        assert.equal(f.enlaceSedeCatastro('7847709VJ9374N0001DD'), '/api/catastro/sede/7847709VJ9374N0001DD');
        assert.equal(f.enlaceSedeCatastro('7847709 vj9374n'), '/api/catastro/sede/7847709VJ9374N');
        assert.equal(f.enlaceSedeCatastro('7847709VJ9374N0001DD (casa)'), null, 'más de 20: no es una referencia');
        assert.equal(f.enlaceSedeCatastro('1234'), null);
        assert.equal(f.enlaceSedeCatastro(null), null);
    });

    if (process.argv.includes('--en-vivo')) {
        console.log('contra el Catastro (en serie)');
        const dormir = (ms) => new Promise(r => setTimeout(r, ms));
        const CASOS = [
            ['7847709VJ9374N0001DD', { del: '13', mun: '82', rc20: '7847709VJ9374N0001DD', varios: false, urbRus: 'U' }],
            ['7847709VJ9374N', { del: '13', mun: '82', rc20: '7847709VJ9374N0001DD', varios: false, urbRus: 'U' }],
            ['13019A01100079', { del: '13', mun: '19', rc20: '13019A011000790000QZ', varios: false, urbRus: 'R' }],
            ['3121402WN4032S', { del: '26', mun: '900', rc20: null, varios: true, urbRus: '' }],
            ['ZZZZZZZZZZZZZZ', { noExiste: true }],
        ];
        for (const [rc, esperado] of CASOS) {
            await prueba(`${rc} → ${JSON.stringify(esperado)}`, async () => {
                assert.deepEqual(await svc.codigosSede(rc), esperado);
            });
            await dormir(1500);
        }
    }

    console.log(fallos ? `\n${fallos} con fallo.` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})();
