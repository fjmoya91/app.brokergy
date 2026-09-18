// ============================================================================
// check-hooks.mjs — ningún hook por debajo de un `return` condicional.
//
// POR QUÉ ES UN CANDADO Y NO UN AVISO: `vite build` no pasa el lint, así que una
// violación de `rules-of-hooks` se compila tan campante y llega a producción. Lo
// que hace ahí no es un fallo pequeño: React corta el render con
//
//     Minified React error #310 — rendered more hooks than during the previous
//     render
//
// y la PANTALLA ENTERA se cae, con «algo ha fallado» y un enlace a react.dev. Le
// pasó a la ventana de la envolvente el 18/09/2026, con el plano ya medido y
// 1,34 MB de geometría al otro lado: el `useState` de los cuerpos estaba dos
// líneas por debajo del `return` de «todavía no hay geometría».
//
// El día que se escribió este candado había OCHO en el repo —en la envolvente, en
// la calculadora, en el panel económico y en el cuadro de mando de lotes—, todas
// esperando a que un render cruzara su `return`. Se arreglaron las ocho.
//
// Esto NO sustituye a `npm run lint`: vigila UNA regla, la que tumba la pantalla.
// Las demás (efectos que llaman a setState, fast-refresh) avisan pero no rompen
// nada, y meterlas aquí convertiría el candado en algo que hay que saltarse.
//
// $ npm run check:hooks     (y va enganchado a `npm run build`)
// ============================================================================

import { ESLint } from 'eslint';

const REGLA = 'react-hooks/rules-of-hooks';

const eslint = new ESLint();
const resultados = await eslint.lintFiles(['src']);

const malas = [];
for (const r of resultados) {
    for (const m of r.messages) {
        if (m.ruleId !== REGLA) continue;
        const ruta = r.filePath.split(/src[\\/]/)[1]?.split('\\').join('/') ?? r.filePath;
        const hook = (m.message.match(/"([^"]+)"/) || [, 'un hook'])[1];
        malas.push(`  src/${ruta}:${m.line}  ${hook}`);
    }
}

if (!malas.length) {
    console.log('✓ hooks: ninguno por debajo de un `return` condicional.');
    process.exit(0);
}

console.error(
    `\n✗ ${malas.length} hook(s) por debajo de un \`return\` condicional.\n\n`
    + malas.join('\n')
    + `\n\nEso tumba la pantalla entera en cuanto un render cruce ese \`return\`\n`
    + `(React #310, «rendered more hooks than during the previous render»).\n`
    + `Se arregla subiendo el hook por encima del \`return\`, o quitando el\n`
    + `\`useCallback\`/\`useMemo\` si no aporta nada.\n`
    + `\nEl build se para aquí a propósito: esto no puede desplegarse.\n`);
process.exit(1);
