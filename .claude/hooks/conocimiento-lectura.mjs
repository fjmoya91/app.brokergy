// Hook PostToolUse (Read): al abrir un fichero de código, dice qué documentos de docs/conocimiento
// hablan de él. Es la red de seguridad del nivel 3 (ver docs/conocimiento/README.md): cubre los
// ficheros que el `paths:` de las reglas no cubre y no depende de que Claude se acuerde de buscar.
// Una vez por fichero y sesión. Nunca bloquea: ante cualquier fallo, calla.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CODIGO = /\.(m?js|jsx|ts|tsx|py|sql|sh|css|json|html)$/;
// Nombres que aparecen por todas partes y no dicen de qué fichero se habla.
const GENERICOS = new Set(['index.js', 'index.jsx', 'main.jsx', 'App.jsx', 'package.json', 'server.py', 'utils.js', 'config.js']);
const MAX_LISTA = 8;
// Ficheros que mezclan rutas de muchas áreas: lo que importa es la ruta concreta, no el fichero.
const COMPARTIDOS = /(routes\/(expedientes|public|oportunidades|ceeDirectos|lotes)\.js|App\.jsx)$/;

function listarMd(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listarMd(p));
        else if (e.name.endsWith('.md') && e.name !== 'INDICE.md') out.push(p);
    }
    return out;
}

let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', () => {
    try {
        const datos = JSON.parse(entrada);
        const raiz = process.env.CLAUDE_PROJECT_DIR || datos.cwd || process.cwd();
        const fichero = datos?.tool_input?.file_path || '';
        if (!fichero) return;
        const rel = path.relative(raiz, path.resolve(raiz, fichero)).split(path.sep).join('/');
        if (rel.startsWith('..') || rel.startsWith('docs/') || rel.startsWith('.claude/') || !CODIGO.test(rel)) return;
        const base = path.basename(rel);
        if (GENERICOS.has(base)) return;
        const docs = path.join(raiz, 'docs', 'conocimiento');
        if (!fs.existsSync(docs)) return;

        // Una vez por fichero y sesión.
        const marca = path.join(os.tmpdir(), `brokergy-conocimiento-${String(datos.session_id || 'x').replace(/[^\w-]/g, '')}.json`);
        let vistos = [];
        try { vistos = JSON.parse(fs.readFileSync(marca, 'utf8')); } catch { /* primera vez */ }
        if (vistos.includes(rel)) return;
        vistos.push(rel);
        try { fs.writeFileSync(marca, JSON.stringify(vistos)); } catch { /* sin marca, se repetirá: no pasa nada */ }

        const hits = [];
        for (const d of listarMd(docs)) {
            const t = fs.readFileSync(d, 'utf8');
            let n = 0; let i = t.indexOf(base);
            while (i >= 0) { n++; i = t.indexOf(base, i + base.length); }
            if (n) hits.push({ d: path.relative(raiz, d).split(path.sep).join('/'), n });
        }
        if (!hits.length) return;
        hits.sort((a, b) => b.n - a.n);
        const lista = hits.slice(0, MAX_LISTA).map((h) => `- ${h.d} (${h.n})`).join('\n');
        const texto = (hits.length > MAX_LISTA || COMPARTIDOS.test(rel))
            ? `\`${base}\` aparece en ${hits.length} documentos de docs/conocimiento (fichero compartido por varias áreas). `
              + `No los leas todos: busca la función, la ruta o el campo concreto que vas a tocar con `
              + `\`grep -rn "<nombre>" docs/conocimiento .claude/rules\`. Los que más lo citan:\n${lista}`
            : `Documentos que hablan de \`${base}\` (lo decidido y por qué). Lee el del tema antes de cambiar su comportamiento:\n${lista}`;
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: texto } }));
    } catch { /* un hook informativo nunca rompe la sesión */ }
});
