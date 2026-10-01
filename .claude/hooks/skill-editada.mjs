// Hook PostToolUse (Write/Edit): si lo tocado está en skills/, recuerda publicarlo.
// Las skills se ejecutan desde la CUENTA de claude.ai (Code y Cowork), no desde el repo:
// un cambio sin publicar es un cambio que Cowork no ve. Ver skills/README.md.
let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', () => {
    let ruta = '';
    try { ruta = JSON.parse(entrada)?.tool_input?.file_path || ''; } catch { /* nada que hacer */ }
    const norm = ruta.split('\\').join('/');
    const m = norm.match(/\/skills\/([^/]+)\//);
    if (!m || m[1] === 'dist' || norm.includes('/.claude/')) return;
    const cual = m[1] === '_comun' ? '' : ` ${m[1]}`;
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `Has cambiado una skill (skills/${m[1]}). Al terminar de editarla: `
                + `\`node scripts/skills.mjs empaquetar${cual}\` y envía el .skill con SendUserFile para `
                + 'que el usuario pulse «Guardar skill»; sin eso Cowork (y Code) siguen con la versión anterior.',
        },
    }));
});
