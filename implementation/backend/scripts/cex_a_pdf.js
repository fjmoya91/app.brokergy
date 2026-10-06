#!/usr/bin/env node
// ============================================================================
// cex_a_pdf.js — califica un .cex con CE3X 3.1 (sin abrir su ventana) y deja al
// lado su XML y su PDF oficial, con el MISMO nombre que el .cex.
//
//   node scripts/cex_a_pdf.js "C:/…/1. CEE INICIAL/26RES060_186 - CEE INICIAL_REVISAR.cex"
//   node scripts/cex_a_pdf.js "C:/…/1. CEE INICIAL"          (todos los .cex de la carpeta)
//
// Opciones:
//   --sin-medidas   no calcula las medidas de mejora (el XML sale sin sus resultados)
//   --solo-xml      no genera el PDF
//   --en-seco       califica y enseña el resultado, sin escribir nada
//
// Lo que ya hubiera con ese nombre se mueve a OLD/ (nunca se borra).
// Funciona con tildes, eñes y puntos en la ruta (CE3X 3.1 no: ver cexAPdf.js).
// Solo en un PC con CE3X 3.1 instalado. Fuente única: services/cee/cexAPdf.js.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { calificarCex, disponible, textoCalificacion } = require('../services/cee/cexAPdf');

const argv = process.argv.slice(2);
const OPC = new Set(argv.filter((a) => a.startsWith('--')));
const rutas = argv.filter((a) => !a.startsWith('--'));

function aOld(ruta) {
    if (!fs.existsSync(ruta)) return null;
    const old = path.join(path.dirname(ruta), 'OLD');
    fs.mkdirSync(old, { recursive: true });
    const n = new Date();
    const dos = (x) => String(x).padStart(2, '0');
    const sello = `${n.getFullYear()}${dos(n.getMonth() + 1)}${dos(n.getDate())}_${dos(n.getHours())}${dos(n.getMinutes())}${dos(n.getSeconds())}`;
    const ext = path.extname(ruta);
    const destino = path.join(old, `${path.basename(ruta, ext)}_${sello}${ext}`);
    fs.renameSync(ruta, destino);
    return destino;
}

function cexDe(r) {
    const st = fs.statSync(r);
    if (st.isFile()) return [r];
    return fs.readdirSync(r).filter((f) => /\.cex$/i.test(f)).map((f) => path.join(r, f));
}

async function main() {
    if (!rutas.length) throw new Error('Dime el .cex o la carpeta: node scripts/cex_a_pdf.js "C:/…/x.cex"');
    const d = disponible();
    if (!d.ok) throw new Error(`No se puede: ${d.motivo}`);

    const ficheros = rutas.flatMap(cexDe);
    if (!ficheros.length) throw new Error('No hay ningún .cex ahí');
    let fallos = 0;
    for (const f of ficheros) {
        console.log(`\n${path.basename(f)}`);
        const t0 = Date.now();
        const r = await calificarCex(f, { medidas: !OPC.has('--sin-medidas'), pdf: !OPC.has('--solo-xml') });
        const seg = Math.round((Date.now() - t0) / 1000);
        if (!r.ok && !r.xml) { fallos++; console.log(`  ✗ ${r.error}`); continue; }
        console.log(`  CE3X ${r.version || '?'} · ${seg} s · ${textoCalificacion(r.calificacion)}`);
        for (const m of r.medidas || []) console.log(`  medida «${m.nombre}» · ahorro ${(m.ahorro || []).join(' / ')}`);
        for (const a of r.avisos || []) console.log(`  ⚠ ${String(a).split('\n')[0]}`);
        if (!r.ok) { fallos++; console.log(`  ✗ ${r.error}`); }
        if (OPC.has('--en-seco')) { console.log('  EN SECO: no se escribe nada.'); continue; }

        const base = f.replace(/\.cex$/i, '');
        for (const [ext, bytes] of [['.xml', r.xml], ['.pdf', r.pdf]]) {
            if (!bytes) continue;
            const destino = base + ext;
            const viejo = aOld(destino);
            fs.writeFileSync(destino, bytes);
            console.log(`  ✓ ${path.basename(destino)}${viejo ? ` (el anterior, a OLD/${path.basename(viejo)})` : ''}`);
        }
    }
    if (fallos) process.exit(1);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
