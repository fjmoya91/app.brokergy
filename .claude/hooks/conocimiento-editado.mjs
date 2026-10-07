// Hook PostToolUse (Write/Edit): mantiene en orden el conocimiento del proyecto
// (ver docs/conocimiento/README.md).
//   · Si se toca docs/conocimiento o .claude/rules → rehace las partes GENERADAS (listas e índice).
//   · Si el CLAUDE.md raíz pasa de su presupuesto → avisa de dónde va lo nuevo.
//   · Si una regla de área pasa del suyo → avisa.
// Nunca bloquea: ante cualquier fallo, calla.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', async () => {
    try {
        const datos = JSON.parse(entrada);
        const raiz = process.env.CLAUDE_PROJECT_DIR || datos.cwd || process.cwd();
        const fichero = datos?.tool_input?.file_path || '';
        if (!fichero) return;
        const rel = path.relative(raiz, path.resolve(raiz, fichero)).split(path.sep).join('/');
        const esRaiz = rel === 'CLAUDE.md';
        const esRegla = /^\.claude\/rules\/[^/]+\.md$/.test(rel);
        const esDoc = rel.startsWith('docs/conocimiento/') && rel.endsWith('.md') && !rel.endsWith('INDICE.md');
        if (!esRaiz && !esRegla && !esDoc) return;

        const script = path.join(raiz, 'scripts', 'conocimiento.mjs');
        if (!fs.existsSync(script)) return;
        const { regenerar, LIMITES } = await import(pathToFileURL(script).href);
        const avisos = [];
        if (esRegla || esDoc) regenerar({ silencioso: true });
        const tam = (p) => (fs.existsSync(p) ? fs.statSync(p).size : 0);
        const kb = (n) => `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
        const tRaiz = tam(path.join(raiz, 'CLAUDE.md'));
        if (esRaiz && tRaiz > LIMITES.raizAviso) {
            avisos.push(`El CLAUDE.md pesa ${kb(tRaiz)} (límite ${kb(LIMITES.raiz)}) y se carga en CADA sesión y subagente. `
                + 'Lo que acabas de escribir, si es de un área, va en docs/conocimiento/<área>/<tema>.md y, si es una regla que no se '
                + 'puede romper, también como entrada numerada en .claude/rules/<área>.md (`node scripts/conocimiento.mjs siguiente`). '
                + 'Aquí solo van el protocolo, la tabla de áreas y lo que vale para TODO el código.');
        }
        if (esRegla) {
            const t = tam(path.join(raiz, rel));
            if (t > LIMITES.reglaAviso) avisos.push(`${rel} pesa ${kb(t)} y se carga entera al trabajar en su área (límite ${kb(LIMITES.regla)}). La historia y los casos van en docs/conocimiento; aquí, lo que no se puede romper.`);
        }
        if (avisos.length) {
            process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: avisos.join('\n') } }));
        }
    } catch { /* un hook de mantenimiento nunca rompe la sesión */ }
});
