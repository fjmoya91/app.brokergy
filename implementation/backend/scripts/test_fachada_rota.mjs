/**
 * Una foto de fachada que no se puede PINTAR no se sirve como si se pudiera.
 *
 * Catastro guarda fotos rotas: cabecera y EXIF buenos, datos de imagen cortados
 * y sin fin de JPEG. Medido el 16/09/2026 sobre 20 viviendas reales, **6 llegan
 * así**, idénticas byte a byte en tres descargas y también bajándolas de su
 * servidor sin pasar por la app. El navegador no las delata —`<img>` dispara
 * `load` y declara 1024×768— pero el lienzo sale NEGRO y en la página no se ve
 * nada: por eso la portada de 26RES080_OP62 salió sin su foto.
 *
 * Aquí se comprueba lo determinista de esa decisión, sin red y sin navegador:
 *
 *   1. `fachadaCompleta` distingue una imagen entera de una cortada, mirando que
 *      el fin de JPEG esté DESPUÉS del inicio del scan. El `FFD9` de un fichero
 *      cortado es el de la miniatura del EXIF, que va en la cabecera; y el final
 *      del fichero no vale como referencia, porque Catastro escribe relleno
 *      detrás de imágenes que se ven perfectamente.
 *   2. De una foto cortada se rescata su miniatura EXIF cuando la trae, y esa
 *      miniatura sí está completa.
 *
 * Los casos son sintéticos y se construyen aquí: un JPEG de Catastro no puede
 * vivir en el repo (es la fachada de la casa de un cliente).
 *
 *   node implementation/backend/scripts/test_fachada_rota.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { fachadaCompleta, miniaturaExif } = require('../services/catastroService');

const seg = (marca, cuerpo) => Buffer.concat([
    Buffer.from([0xFF, marca]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(cuerpo.length + 2); return b; })(), cuerpo,
]);
const SOI = Buffer.from([0xFF, 0xD8]);
const EOI = Buffer.from([0xFF, 0xD9]);
const SOF0 = seg(0xC0, Buffer.concat([Buffer.from([0x08]), Buffer.from([0x03, 0x00]), Buffer.from([0x04, 0x00]), Buffer.from([0x01, 0x01, 0x11, 0x00])]));
const SOS = seg(0xDA, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]));
const datos = Buffer.alloc(2000, 0x7E);

/** Un JPEG mínimo pero legítimo, del tamaño que se le pida. */
const jpeg = (relleno = 500) => Buffer.concat([SOI, SOF0, SOS, Buffer.alloc(relleno, 0x5A), EOI]);

/** El APP1 con la miniatura dentro, como lo escribe una cámara. */
const app1ConMiniatura = (mini) => seg(0xE1, Buffer.concat([
    Buffer.from('Exif'), Buffer.from([0x00, 0x00]), Buffer.alloc(40, 0x11), mini,
]));

let fallos = 0;
const comprobar = (titulo, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${titulo}`);
    if (!ok) fallos++;
};

const mini = jpeg(300);

// 1. Una foto entera es una foto entera.
comprobar('una foto completa se da por buena',
    fachadaCompleta(Buffer.concat([SOI, app1ConMiniatura(mini), SOF0, SOS, datos, EOI])));

// 2. Catastro escribe relleno DETRÁS del fin de imagen y esas se ven bien
//    (medido en 4410205WJ0641S0001JH: 330.687 bytes, imagen hasta el 62.354).
comprobar('con relleno detrás del fin de imagen, sigue siendo buena',
    fachadaCompleta(Buffer.concat([SOI, SOF0, SOS, datos, EOI, Buffer.alloc(9000, 0x00)])));

// 3. Cortada a media imagen: no hay fin de JPEG en ninguna parte.
const cortadaSinMini = Buffer.concat([SOI, SOF0, SOS, datos]);
comprobar('una foto cortada NO se da por buena',
    !fachadaCompleta(cortadaSinMini));

// 4. El caso que engaña: cortada, pero con el FFD9 de su miniatura dentro de la
//    cabecera. Mirando el último FFD9 a secas, parecería entera.
const cortadaConMini = Buffer.concat([SOI, app1ConMiniatura(mini), SOF0, SOS, datos]);
comprobar('el fin de JPEG de la MINIATURA no cuela por el de la imagen',
    !fachadaCompleta(cortadaConMini));

// 5. De esa foto cortada se rescata la miniatura, y está completa.
const rescatada = miniaturaExif(cortadaConMini);
comprobar('de una foto cortada se rescata su miniatura EXIF',
    !!rescatada && fachadaCompleta(rescatada));

// 6. Y cuando no hay miniatura no se inventa ninguna: ahí no hay foto que dar.
comprobar('sin miniatura dentro, no se rescata nada',
    miniaturaExif(cortadaSinMini) === null);

// 7. Lo que no es un JPEG no es una foto.
comprobar('lo que no empieza por SOI no es una foto',
    !fachadaCompleta(Buffer.from('<html>no soy una foto</html>')));

console.log(fallos ? '\nRevisa lo de arriba.' : '\nLa foto rota de Catastro se detecta y se rescata su miniatura.');
process.exit(fallos ? 1 : 0);
