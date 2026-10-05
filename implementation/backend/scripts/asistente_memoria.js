// La MEMORIA del asistente de WhatsApp, sincronizada con la de Claude Code en el PC de Fran.
//
//   node scripts/asistente_memoria.js sincronizar        PC ⇄ VPS (lo normal)
//   node scripts/asistente_memoria.js estado             qué hay a cada lado, sin tocar nada
//
// La memoria vive FUERA del repo a propósito: tiene datos de clientes y el repo es público. Por eso
// viaja por ssh, nunca por git.
//
// - En el VPS está donde Claude Code la carga sola para el asistente:
//   /root/.claude/projects/-tmp-asistente-trabajo/memory (volumen `asistente_claude`).
// - Lo que aprende el asistente por WhatsApp lo guarda como `asistente_<tema>.md` (+ su línea en su
//   MEMORY.md). Al sincronizar: (1) esos ficheros BAJAN al PC y sus líneas se añaden al MEMORY.md del
//   PC si faltan; (2) la memoria del PC SUBE entera al VPS, sustituyendo lo que no sea `asistente_*`
//   (así lo borrado en el PC también desaparece allí). El PC es la fuente de verdad de todo lo demás.
// - Pesa ~1,4 MB y son ficheros de texto: un tar por ssh, en segundos. No toca la BD ni a Claude.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const VPS = process.env.ASISTENTE_VPS || 'root@187.77.93.213';
const CONTENEDOR = 'brokergy-asistente';
const DIR_VPS = '/root/.claude/projects/-tmp-asistente-trabajo/memory';
const DIR_PC = process.env.ASISTENTE_MEMORIA_PC
    || path.join(os.homedir(), '.claude', 'projects', 'C--Proyectos-app-brokergy', 'memory');
const TITULO = '## Aprendido por WhatsApp (asistente)';

const ssh = (cmd, opts = {}) => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', VPS, cmd], { maxBuffer: 64 * 1024 * 1024, ...opts });
// Entre comillas SIMPLES: con dobles, el shell del VPS expandía `$(ls …)` y `$F` FUERA del contenedor
// (en el home de root) y no encontraba nada que bajar.
const enContenedor = cmd => `docker exec -i ${CONTENEDOR} sh -c '${cmd.replace(/'/g, `'\\''`)}'`;

function estado() {
    const pc = fs.readdirSync(DIR_PC).filter(f => f.endsWith('.md'));
    const vps = String(ssh(enContenedor(`mkdir -p ${DIR_VPS} && ls ${DIR_VPS}`))).split('\n').filter(f => f.endsWith('.md'));
    const suyas = vps.filter(f => f.startsWith('asistente_'));
    console.log(`PC:  ${pc.length} ficheros en ${DIR_PC}`);
    console.log(`VPS: ${vps.length} ficheros (${suyas.length} aprendidos por WhatsApp${suyas.length ? `: ${suyas.join(', ')}` : ''})`);
    return { pc, vps, suyas };
}

function sincronizar() {
    if (!fs.existsSync(path.join(DIR_PC, 'MEMORY.md'))) throw new Error(`No encuentro ${DIR_PC}\\MEMORY.md`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-'));
    try {
        // 1. Bajar lo que ha aprendido el asistente.
        // Sin nada que bajar (la primera vez) no hay tar: un archivo vacío daría error.
        const tarVps = ssh(enContenedor(`mkdir -p ${DIR_VPS} && cd ${DIR_VPS} && F=$(ls asistente_*.md MEMORY.md 2>/dev/null); [ -z "$F" ] || tar cf - $F`));
        let bajadas = 0;
        let lineasNuevas = [];
        if (tarVps.length) {
            fs.mkdirSync(path.join(tmp, 'vps'));
            // Por la entrada estándar y con cwd: el tar de Git Bash toma «C:» de una ruta por un servidor remoto.
            execFileSync('tar', ['-xf', '-'], { cwd: path.join(tmp, 'vps'), input: tarVps });
            for (const f of fs.readdirSync(path.join(tmp, 'vps')).filter(x => x.startsWith('asistente_') && x.endsWith('.md'))) {
                fs.copyFileSync(path.join(tmp, 'vps', f), path.join(DIR_PC, f));
                bajadas += 1;
            }
            const indiceVps = fs.existsSync(path.join(tmp, 'vps', 'MEMORY.md')) ? fs.readFileSync(path.join(tmp, 'vps', 'MEMORY.md'), 'utf8') : '';
            const indicePc = fs.readFileSync(path.join(DIR_PC, 'MEMORY.md'), 'utf8');
            // Solo las líneas cuyo fichero existe: una línea huérfana en el índice apunta a nada.
            const existe = f => fs.existsSync(path.join(tmp, 'vps', f));
            lineasNuevas = indiceVps.split(/\r?\n/).filter(l => /\(asistente_[^)]+\.md\)/.test(l))
                .filter(l => { const f = l.match(/\((asistente_[^)]+\.md)\)/)[1]; return existe(f) && !indicePc.includes(f); });
            if (lineasNuevas.length) {
                const sep = indicePc.includes(TITULO) ? '' : `\n${TITULO}\n`;
                fs.writeFileSync(path.join(DIR_PC, 'MEMORY.md'), `${indicePc.replace(/\s*$/, '\n')}${sep}${lineasNuevas.join('\n')}\n`);
            }
        }
        // 2. Subir la memoria del PC entera (lo que no es del asistente se sustituye).
        const ficheros = fs.readdirSync(DIR_PC).filter(f => f.endsWith('.md'));
        const tarPc = execFileSync('tar', ['-cf', '-', ...ficheros], { cwd: DIR_PC, maxBuffer: 64 * 1024 * 1024 });
        ssh(enContenedor(`mkdir -p ${DIR_VPS} && cd ${DIR_VPS} && find . -maxdepth 1 -name '*.md' ! -name 'asistente_*' -delete && tar xf -`), { input: tarPc });
        console.log(`✓ Bajados ${bajadas} ficheros del asistente${lineasNuevas.length ? ` (${lineasNuevas.length} líneas nuevas en el MEMORY.md del PC)` : ''}.`);
        console.log(`✓ Subidos ${ficheros.length} ficheros de memoria al VPS.`);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

const ORDENES = { sincronizar, estado };
const orden = ORDENES[process.argv[2]];
if (!orden) console.log('Órdenes: sincronizar · estado');
else try { orden(); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
