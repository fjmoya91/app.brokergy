#!/usr/bin/env node
// El conocimiento del proyecto, en tres niveles (ver docs/conocimiento/README.md):
//   1 · CLAUDE.md                       siempre cargado, corto
//   2 · .claude/rules/<área>.md         se carga solo al leer/editar código del área (`paths:`)
//   3 · docs/conocimiento/<área>/*.md   el detalle íntegro, se lee bajo demanda
//
//   node scripts/conocimiento.mjs comprobar     tamaños, rutas de las reglas, números de regla, índice
//   node scripts/conocimiento.mjs regenerar     rehace las partes GENERADAS (listas e índice)
//   node scripts/conocimiento.mjs siguiente     siguiente número libre de regla
//   node scripts/conocimiento.mjs migrar <CLAUDE.md antiguo> [--seco] [--forzar]
//                                               reparte el fichero antiguo (solo para la migración)
//
// Sin dependencias: corre igual en el PC, en el VPS y desde un hook.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(RAIZ, 'docs', 'conocimiento');
const REGLAS_DIR = path.join(RAIZ, '.claude', 'rules');
const INDICE = path.join(DOCS, 'INDICE.md');

// Presupuestos. El de la raíz es el que importa: se paga en CADA sesión y en CADA subagente.
export const LIMITES = {
    raiz: 20 * 1024,          // CLAUDE.md: por encima, se para
    raizAviso: 16 * 1024,
    regla: 128 * 1024,        // una regla de área: se paga solo al trabajar en esa área (envolvente-ce3x ≈ 104 KB)
    reglaAviso: 40 * 1024,
};

const INICIO_GEN = '<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->';
const FIN_GEN = '<!-- generado:fin -->';
const CABECERA_DOC = '<!-- conocimiento ·';

// ── utilidades ────────────────────────────────────────────────────────────────────────────────
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/');
const kb = (n) => `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
// Siempre con saltos LF: en un checkout de Windows (core.autocrlf) llegarían con CRLF, y ni la
// cabecera `paths:` se reconocería ni los tamaños del índice saldrían iguales en el PC y en el VPS.
const leer = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const escribir = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };

export function slug(t) {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/\(\d{4}-\d{2}-\d{2}[^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 64).replace(/-+$/, '') || 'sin-titulo';
}

function expandirLlaves(g) {
    const m = g.match(/\{([^{}]*)\}/);
    if (!m) return [g];
    return m[1].split(',').flatMap((alt) => expandirLlaves(g.slice(0, m.index) + alt + g.slice(m.index + m[0].length)));
}

export function globARegex(g) {
    return expandirLlaves(g).map((p) => {
        let r = '';
        for (let i = 0; i < p.length; i++) {
            const c = p[i];
            if (c === '*' && p[i + 1] === '*') {
                if (p[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i += 1; }
            } else if (c === '*') r += '[^/]*';
            else if (c === '?') r += '[^/]';
            else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
        return new RegExp(`^${r}$`);
    });
}

function ficherosDelRepo() {
    try {
        return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
            { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
    } catch { return []; }
}

function listarMd(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listarMd(p));
        else if (e.name.endsWith('.md')) out.push(p);
    }
    return out.sort();
}

// ── reglas de nivel 2: frontmatter + entradas numeradas ──────────────────────────────────────
export const RE_REGLA = /^(\d{1,3})(\.[a-z])?\.?\s+\S/;

function leerFrontmatter(texto) {
    const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) return { paths: null, cuerpo: texto };
    const paths = [];
    for (const l of m[1].split('\n')) {
        const p = l.match(/^\s*-\s*"?([^"]+?)"?\s*$/);
        if (p) paths.push(p[1]);
    }
    return { paths, cuerpo: texto.slice(m[0].length) };
}

export function entradasDeRegla(texto) {
    // Solo las del bloque «Reglas críticas», hasta la parte generada.
    const cuerpo = texto.split(INICIO_GEN)[0];
    const out = [];
    for (const l of cuerpo.split('\n')) {
        const m = l.match(RE_REGLA);
        if (!m) continue;
        const lead = (l.match(/\*\*(.+?)\*\*/) || [, ''])[1];
        out.push({ n: m[1] + (m[2] || ''), lead });
    }
    return out;
}

function areas() {
    const desdeReglas = fs.existsSync(REGLAS_DIR)
        ? fs.readdirSync(REGLAS_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
    const desdeDocs = fs.existsSync(DOCS)
        ? fs.readdirSync(DOCS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
    return [...new Set([...desdeReglas, ...desdeDocs])].sort();
}

function tituloDoc(p) {
    const t = leer(p).split('\n').find((l) => /^#{1,4} /.test(l));
    return t ? t.replace(/^#{1,4} /, '').trim() : path.basename(p, '.md');
}

const RE_CABECERA_REGLA = /\*\*REGLA[^*]*\*\*/g;

// ── regenerar: listas de cada regla de área + índice ────────────────────────────────────────
export function regenerar({ silencioso = false } = {}) {
    const cambios = [];
    const filas = [];
    const numeros = [];
    for (const area of areas()) {
        const docs = listarMd(path.join(DOCS, area));
        const ficheroRegla = path.join(REGLAS_DIR, `${area}.md`);
        const lista = docs.map((d) => `- \`${rel(d)}\` — ${tituloDoc(d)} · ${kb(Buffer.byteLength(leer(d)))}`);
        const cabeceras = [];
        for (const d of docs) {
            const hs = [...new Set(leer(d).match(RE_CABECERA_REGLA) || [])];
            if (hs.length) cabeceras.push(`- \`${rel(d)}\`\n${hs.map((h) => `  - ${h}`).join('\n')}`);
        }
        if (fs.existsSync(ficheroRegla)) {
            const texto = leer(ficheroRegla);
            const gen = [INICIO_GEN, '', '## Documentos del área (nivel 3)', '',
                lista.length ? lista.join('\n') : '_(ninguno todavía)_', '',
                '## Las «REGLA —» que contienen esos documentos', '',
                '> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.', '',
                cabeceras.length ? cabeceras.join('\n') : '_(ninguna)_', '', FIN_GEN, ''].join('\n');
            const antes = texto.includes(INICIO_GEN) ? texto.slice(0, texto.indexOf(INICIO_GEN)) : `${texto.trimEnd()}\n\n`;
            const nuevo = antes + gen;
            if (nuevo !== texto) { escribir(ficheroRegla, nuevo); cambios.push(rel(ficheroRegla)); }
            for (const e of entradasDeRegla(nuevo)) numeros.push({ ...e, donde: rel(ficheroRegla) });
            const { cuerpo } = leerFrontmatter(nuevo);
            const titulo = (cuerpo.match(/^# (.+)$/m) || [, area])[1].replace(/\s*\(nivel 2\)\s*$/, '');
            filas.push(`| \`${area}\` | ${titulo} | \`${rel(ficheroRegla)}\` · ${kb(Buffer.byteLength(nuevo))} | ${docs.length} |`);
        } else {
            filas.push(`| \`${area}\` | _(sin regla de nivel 2: lo que vale siempre está en CLAUDE.md)_ | — | ${docs.length} |`);
        }
    }
    numeros.sort((a, b) => parseInt(a.n, 10) - parseInt(b.n, 10) || a.n.localeCompare(b.n));
    const porArea = areas().map((a) => {
        const docs = listarMd(path.join(DOCS, a));
        return docs.length ? `### ${a}\n\n${docs.map((d) => `- \`${rel(d)}\` — ${tituloDoc(d)}`).join('\n')}\n` : '';
    }).filter(Boolean);
    const indice = ['# Índice del conocimiento', '',
        '> GENERADO — no se edita a mano: `node scripts/conocimiento.mjs regenerar`.',
        '> Cómo está organizado y por qué: [README.md](README.md). Cómo se trabaja: [COMO-TRABAJAMOS.md](COMO-TRABAJAMOS.md).', '',
        '## Áreas', '', '| Área | Qué cubre | Regla de nivel 2 | Documentos |', '|---|---|---|---|', ...filas, '',
        '## Reglas numeradas → dónde están', '',
        '> Los comentarios del código citan «regla N». Para leerla: `grep -rnE "^N(\\.[a-z])?\\.? " .claude/rules`.', '',
        ...numeros.map((e) => `- **${e.n}** → \`${e.donde}\` — ${e.lead.length > 110 ? `${e.lead.slice(0, 108)}…` : e.lead}`), '',
        '## Documentos por área', '', ...porArea].join('\n');
    if (!fs.existsSync(INDICE) || leer(INDICE) !== indice) { escribir(INDICE, indice); cambios.push(rel(INDICE)); }
    if (!silencioso) console.log(cambios.length ? `Regenerado: ${cambios.join(', ')}` : 'Nada que regenerar.');
    return cambios;
}

// ── comprobar ────────────────────────────────────────────────────────────────────────────────
export function comprobar({ silencioso = false } = {}) {
    const errores = [];
    const avisos = [];
    const raiz = path.join(RAIZ, 'CLAUDE.md');
    const tamRaiz = fs.existsSync(raiz) ? Buffer.byteLength(leer(raiz)) : 0;
    if (tamRaiz > LIMITES.raiz) errores.push(`CLAUDE.md pesa ${kb(tamRaiz)} (límite ${kb(LIMITES.raiz)}). Lo nuevo va a docs/conocimiento/<área>/ y, si es una regla, a .claude/rules/<área>.md.`);
    else if (tamRaiz > LIMITES.raizAviso) avisos.push(`CLAUDE.md pesa ${kb(tamRaiz)}: cerca del límite (${kb(LIMITES.raiz)}).`);

    const ficheros = ficherosDelRepo();
    const vistos = new Map();
    for (const area of areas()) {
        const f = path.join(REGLAS_DIR, `${area}.md`);
        const tieneDocs = fs.existsSync(path.join(DOCS, area));
        if (!fs.existsSync(f)) { if (area !== 'general') avisos.push(`El área «${area}» tiene documentos pero no regla de nivel 2.`); continue; }
        if (!tieneDocs && !area.startsWith("transversal-")) avisos.push(`La regla ${rel(f)} no tiene carpeta docs/conocimiento/${area}/.`);
        const texto = leer(f);
        const tam = Buffer.byteLength(texto);
        if (tam > LIMITES.regla) errores.push(`${rel(f)} pesa ${kb(tam)} (límite ${kb(LIMITES.regla)}): pártela.`);
        else if (tam > LIMITES.reglaAviso) avisos.push(`${rel(f)} pesa ${kb(tam)}: se carga entera al trabajar en el área.`);
        const { paths } = leerFrontmatter(texto);
        if (!paths || !paths.length) errores.push(`${rel(f)} no tiene \`paths:\`: se cargaría SIEMPRE, como el CLAUDE.md.`);
        for (const g of paths || []) {
            const res = globARegex(g);
            if (!ficheros.some((x) => res.some((r) => r.test(x)))) avisos.push(`${rel(f)}: el patrón «${g}» no casa con ningún fichero del repo.`);
        }
        for (const e of entradasDeRegla(texto)) {
            const k = `${e.n}|${e.lead}`;
            if (vistos.has(k)) errores.push(`La regla ${e.n} («${e.lead.slice(0, 40)}») está dos veces: ${vistos.get(k)} y ${rel(f)}.`);
            vistos.set(k, rel(f));
        }
    }

    // Lo que cita el código («regla 22», «reglas 21 y 22») tiene que existir.
    const existentes = new Set([...vistos.keys()].map((k) => k.split('|')[0]));
    const base = new Set([...existentes].map((n) => n.split('.')[0]));
    const huerfanas = new Map();
    for (const x of ficheros) {
        if (!/^(implementation|scripts|skills)\//.test(x) || !/\.(m?js|jsx|py|sql)$/.test(x)) continue;
        let t; try { t = leer(path.join(RAIZ, x)); } catch { continue; }
        for (const m of t.matchAll(/reglas?\s+(\d{1,3}(?:\.[a-z])?)\b/gi)) {
            const n = m[1];
            if (!existentes.has(n) && !base.has(n.split('.')[0])) huerfanas.set(n, x);
        }
    }
    for (const [n, x] of huerfanas) avisos.push(`El código cita la «regla ${n}» (p. ej. en ${x}) y no está en ninguna regla de nivel 2.`);

    // El índice tiene que estar al día (se regenera en memoria y se compara).
    if (fs.existsSync(INDICE)) {
        const antes = leer(INDICE);
        const copia = new Map(areas().map((a) => [a, fs.existsSync(path.join(REGLAS_DIR, `${a}.md`)) ? leer(path.join(REGLAS_DIR, `${a}.md`)) : null]));
        const cambios = regenerar({ silencioso: true });
        if (cambios.length) {
            avisos.push(`Las partes generadas estaban desfasadas y se han rehecho: ${cambios.join(', ')}.`);
            void antes; void copia;
        }
    } else avisos.push('Falta docs/conocimiento/INDICE.md: `node scripts/conocimiento.mjs regenerar`.');

    if (!silencioso) {
        console.log(`CLAUDE.md: ${kb(tamRaiz)} · reglas numeradas: ${existentes.size} · áreas: ${areas().length}`);
        for (const e of errores) console.log(`✗ ${e}`);
        for (const a of avisos) console.log(`⚠ ${a}`);
        if (!errores.length && !avisos.length) console.log('✓ Todo en orden.');
    }
    return { errores, avisos, tamRaiz };
}

function siguiente() {
    let max = 0;
    for (const a of areas()) {
        const f = path.join(REGLAS_DIR, `${a}.md`);
        if (!fs.existsSync(f)) continue;
        for (const e of entradasDeRegla(leer(f))) max = Math.max(max, parseInt(e.n, 10));
    }
    console.log(String(max + 1));
}

// ── migrar: reparte el CLAUDE.md antiguo ─────────────────────────────────────────────────────
async function migrar(origen, { seco = false, forzar = false } = {}) {
    const { AREAS, SECCIONES, SUBSECCIONES, REGLAS, PARTIR_DESDE_BYTES } = await import('./conocimiento/reparto.mjs');
    const texto = leer(path.resolve(origen));
    const L = texto.split('\n');
    const problemas = [];

    const areaDeSeccion = (titulo) => {
        const c = SECCIONES.filter(([p]) => titulo.startsWith(p)).sort((a, b) => b[0].length - a[0].length);
        if (!c.length) problemas.push(`Sección sin área en el reparto: «${titulo}»`);
        return c.length ? c[0][1] : null;
    };
    const usoSub = new Map(SUBSECCIONES.map(([p]) => [p, 0]));
    const areaDeSub = (titulo) => {
        const c = SUBSECCIONES.filter(([p]) => titulo.startsWith(p));
        for (const [p] of c) usoSub.set(p, usoSub.get(p) + 1);
        return c.length ? c[0][1] : null;
    };

    const heads = [];
    L.forEach((l, i) => { if (/^## /.test(l)) heads.push(i); });
    heads.push(L.length);

    const piezas = []; // { area, tipo, titulo, padre, desde, hasta }
    const estructura = []; // líneas que no son contenido (vacías, separadores, cabeceras de agrupación)
    const recortar = (desde, hasta) => {
        let a = desde; let b = hasta;
        while (a < b && /^\s*(---)?\s*$/.test(L[a])) { estructura.push(a); a++; }
        while (b > a && /^\s*(---)?\s*$/.test(L[b - 1])) { b--; estructura.push(b); }
        return [a, b];
    };

    // Preámbulo (antes del primer «## »)
    {
        const [a, b] = recortar(0, heads[0]);
        if (b > a) piezas.push({ area: 'general', tipo: 'seccion', titulo: 'Cabecera del CLAUDE.md original', desde: a, hasta: b });
    }

    const SECCIONES_CON_REGLAS = ['Reglas Críticas', 'Variables de Entorno Requeridas', 'Documentación Adicional'];
    for (let h = 0; h < heads.length - 1; h++) {
        const ini = heads[h]; const fin = heads[h + 1];
        const titulo = L[ini].slice(3).trim();
        const area = areaDeSeccion(titulo);
        if (!area) continue;
        let finContenido = fin;
        if (SECCIONES_CON_REGLAS.some((p) => titulo.startsWith(p))) {
            let r0 = -1;
            for (let i = ini + 1; i < fin; i++) if (RE_REGLA.test(L[i])) { r0 = i; break; }
            if (r0 >= 0) {
                finContenido = r0;
                // entradas de regla
                const starts = [];
                for (let i = r0; i < fin; i++) if (RE_REGLA.test(L[i])) starts.push(i);
                starts.push(fin);
                for (let s = 0; s < starts.length - 1; s++) {
                    const [a, b] = recortar(starts[s], starts[s + 1]);
                    const m = L[a].match(RE_REGLA);
                    const n = m[1] + (m[2] || '');
                    const lead = (L[a].match(/\*\*(.+?)\*\*/) || [, ''])[1];
                    piezas.push({ area: null, tipo: 'regla', n, lead, titulo: lead, desde: a, hasta: b });
                }
            }
        }
        // Contenido de la sección (si queda algo más que la cabecera)
        if (titulo.startsWith('Reglas Críticas')) {
            for (let i = ini; i < finContenido; i++) estructura.push(i);
            continue;
        }
        const subs = [];
        for (let i = ini + 1; i < finContenido; i++) if (/^### /.test(L[i])) subs.push(i);
        const cortes = [ini, ...subs, finContenido];
        const trozos = [];
        for (let c = 0; c < cortes.length - 1; c++) {
            const esSub = c > 0;
            const tituloT = esSub ? L[cortes[c]].slice(4).trim() : titulo;
            const otra = esSub ? areaDeSub(tituloT) : null;
            const [a, b] = recortar(cortes[c], cortes[c + 1]);
            if (b > a) trozos.push({ area: otra || area, propia: !otra, tipo: esSub ? 'sub' : 'seccion', titulo: tituloT, padre: titulo, desde: a, hasta: b });
        }
        const propios = trozos.filter((t) => t.propia);
        const tamPropio = propios.reduce((s, t) => s + L.slice(t.desde, t.hasta).join('\n').length, 0);
        const partir = tamPropio > PARTIR_DESDE_BYTES && propios.length > 1;
        for (const t of trozos) {
            if (!t.propia) { piezas.push({ ...t, grupo: `sub:${t.titulo}`, ajena: true }); continue; }
            piezas.push({ ...t, grupo: partir ? `partida:${titulo}:${t.titulo}` : `seccion:${titulo}`, partida: partir });
        }
    }

    // Reglas → área
    const usoRegla = new Map();
    for (const p of piezas.filter((x) => x.tipo === 'regla')) {
        const c = REGLAS.filter(([n, , lead]) => n === p.n && (!lead || p.lead.startsWith(lead)));
        if (c.length !== 1) { problemas.push(`Regla ${p.n} («${p.lead.slice(0, 50)}»): ${c.length ? 'casa con varias entradas' : 'no está en el reparto'}`); continue; }
        p.area = c[0][1];
        usoRegla.set(c[0], (usoRegla.get(c[0]) || 0) + 1);
    }
    for (const r of REGLAS) if (!usoRegla.has(r)) console.log(`· Aviso: la regla ${r[0]}${r[2] ? ` («${r[2]}»)` : ''} del reparto no está en este CLAUDE.md.`);
    for (const [p, n] of usoSub) if (n !== 1) problemas.push(`La subsección «${p}» casa con ${n} subsecciones (tiene que ser exactamente una).`);
    for (const a of new Set(piezas.map((p) => p.area).filter(Boolean))) if (!AREAS[a]) problemas.push(`Área desconocida: ${a}`);

    // Cobertura: cada línea en una sola pieza o en la estructura
    const dueño = new Array(L.length).fill(null);
    const marcar = (i, quien) => { if (dueño[i] !== null) problemas.push(`Línea ${i + 1} asignada dos veces`); dueño[i] = quien; };
    piezas.forEach((p, k) => { for (let i = p.desde; i < p.hasta; i++) marcar(i, k); });
    for (const i of estructura) marcar(i, 'estructura');
    const sueltas = dueño.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0 && !(i === L.length - 1 && L[i] === ''));
    if (sueltas.length) problemas.push(`${sueltas.length} líneas sin destino (p. ej. ${sueltas.slice(0, 5).map((i) => i + 1).join(', ')})`);
    const estructuraConTexto = estructura.filter((i) => !/^\s*(---)?\s*$/.test(L[i]) && !/^## Reglas Críticas/.test(L[i]));
    if (estructuraConTexto.length) problemas.push(`Se iban a descartar líneas con texto: ${estructuraConTexto.map((i) => i + 1).join(', ')}`);

    if (problemas.length) {
        console.log('✗ La migración se para:');
        for (const p of problemas) console.log(`  - ${p}`);
        process.exitCode = 1;
        return;
    }

    // ── Composición de ficheros ─────────────────────────────────────────────────────────────
    const ficheros = new Map(); // ruta → { area, titulo, cuerpo[], piezas[] }
    const usados = new Set();
    const rutaUnica = (base) => { let r = base; let k = 2; while (usados.has(r)) r = base.replace(/\.md$/, `-${k++}.md`); usados.add(r); return r; };
    const texto_ = (p) => L.slice(p.desde, p.hasta).join('\n');
    const grupos = new Map();
    for (const p of piezas.filter((x) => x.tipo !== 'regla')) {
        if (!grupos.has(p.grupo)) grupos.set(p.grupo, []);
        grupos.get(p.grupo).push(p);
    }
    for (const [, ps] of grupos) {
        const p0 = ps[0];
        let ruta; let cab;
        if (p0.ajena) {
            ruta = rutaUnica(path.join(DOCS, p0.area, `${slug(p0.titulo)}.md`));
            cab = `> Estaba escrito dentro de «${p0.padre}», en el CLAUDE.md antiguo.`;
        } else if (p0.partida) {
            const carpeta = path.join(DOCS, p0.area, slug(p0.padre));
            ruta = rutaUnica(path.join(carpeta, p0.tipo === 'seccion' ? `00-${slug(p0.padre)}.md` : `${slug(p0.titulo)}.md`));
            cab = p0.tipo === 'seccion' ? `> Introducción de «${p0.padre}»; cada subsección está en su propio fichero de esta carpeta.`
                : `> Forma parte de «${p0.padre}»; la introducción y el resto, en esta misma carpeta.`;
        } else {
            ruta = rutaUnica(path.join(DOCS, p0.area, `${slug(p0.tipo === 'seccion' ? p0.titulo : p0.padre)}.md`));
            cab = null;
        }
        const comentario = `${CABECERA_DOC} área: ${p0.area} · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->`;
        ficheros.set(ruta, { area: p0.area, contenido: [comentario, ...(cab ? [cab] : []), '', ps.map(texto_).join('\n\n'), ''].join('\n'), piezas: ps });
    }

    // Reglas de nivel 2
    const porArea = new Map();
    for (const p of piezas.filter((x) => x.tipo === 'regla')) {
        if (!porArea.has(p.area)) porArea.set(p.area, []);
        porArea.get(p.area).push(p);
    }
    const reglasFicheros = new Map();
    for (const [nombre, def] of Object.entries(AREAS)) {
        if (!def.paths) continue;
        const entradas = porArea.get(nombre) || [];
        const fm = ['---', 'paths:', ...def.paths.map((g) => `  - "${g}"`), '---'].join('\n');
        const cuerpo = [fm, `# ${def.titulo} (nivel 2)`, '',
            '> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede',
            `> romper; el detalle (el porqué, lo medido, los casos) está en \`docs/conocimiento/${nombre}/\`.`,
            '> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).',
            '> Las rutas de los enlaces son relativas a la raíz del repo.',
            ...(def.resumen ? ['', def.resumen] : []), '',
            '## Reglas críticas (texto íntegro)', '',
            entradas.length ? entradas.map(texto_).join('\n\n')
                : '_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._',
            '', ''].join('\n');
        reglasFicheros.set(path.join(REGLAS_DIR, `${nombre}.md`), { contenido: cuerpo, piezas: entradas });
    }
    for (const a of porArea.keys()) if (!AREAS[a]?.paths) { console.log(`✗ Hay reglas para «${a}», que no tiene fichero de nivel 2.`); process.exitCode = 1; return; }

    // ── Verificación: cada pieza aparece ÍNTEGRA, y en orden, en su destino ─────────────────
    let lineasVerificadas = 0;
    for (const [, f] of [...ficheros, ...reglasFicheros]) {
        let desde = 0;
        for (const p of f.piezas) {
            const t = texto_(p);
            const k = f.contenido.indexOf(t, desde);
            if (k < 0) { console.log(`✗ La pieza «${p.titulo}» (L${p.desde + 1}) no aparece íntegra en su destino.`); process.exitCode = 1; return; }
            desde = k + t.length;
            lineasVerificadas += p.hasta - p.desde;
        }
    }
    // split('\n') deja un elemento vacío detrás del salto final: no es una línea del fichero.
    const fantasma = L[L.length - 1] === '' ? L.length - 1 : -1;
    const resumen = {
        lineasOriginal: L.length - (fantasma >= 0 ? 1 : 0),
        lineasEnDestino: lineasVerificadas,
        lineasEstructura: estructura.filter((i) => i !== fantasma).length,
        documentos: ficheros.size,
        reglas: piezas.filter((x) => x.tipo === 'regla').length,
        bytesOriginal: Buffer.byteLength(texto),
    };
    console.log(`Original: ${resumen.lineasOriginal} líneas (${kb(resumen.bytesOriginal)}).`);
    console.log(`  · ${resumen.lineasEnDestino} líneas copiadas TAL CUAL a ${resumen.documentos} documentos y ${reglasFicheros.size} reglas de área (${resumen.reglas} reglas numeradas).`);
    console.log(`  · ${resumen.lineasEstructura} líneas de estructura (vacías, «---» y la cabecera «## Reglas Críticas»), sin texto.`);
    if (resumen.lineasEnDestino + resumen.lineasEstructura !== resumen.lineasOriginal) {
        console.log('✗ Las cuentas no cuadran.'); process.exitCode = 1; return;
    }
    console.log('✓ Ninguna línea con texto se pierde ni se altera.');

    if (seco) return resumen;
    if (!forzar && (fs.existsSync(DOCS) && listarMd(DOCS).some((p) => leer(p).startsWith(CABECERA_DOC)))) {
        console.log('✗ docs/conocimiento ya tiene documentos migrados. Usa --forzar para rehacerlos (se borran los migrados).');
        process.exitCode = 1; return;
    }
    if (forzar) {
        for (const p of listarMd(DOCS)) if (leer(p).startsWith(CABECERA_DOC)) fs.unlinkSync(p);
        const vaciar = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) { vaciar(path.join(d, e.name)); if (!fs.readdirSync(path.join(d, e.name)).length) fs.rmdirSync(path.join(d, e.name)); } };
        vaciar(DOCS);
    }
    for (const [ruta, f] of ficheros) escribir(ruta, f.contenido);
    for (const [ruta, f] of reglasFicheros) escribir(ruta, f.contenido);
    regenerar({ silencioso: true });
    console.log(`Escritos ${ficheros.size} documentos y ${reglasFicheros.size} reglas de área. Índice regenerado.`);
    return resumen;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const esCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCli) {
    const [orden, ...resto] = process.argv.slice(2);
    if (orden === 'comprobar') { const r = comprobar(); if (r.errores.length) process.exitCode = 1; }
    else if (orden === 'regenerar') regenerar();
    else if (orden === 'siguiente') siguiente();
    else if (orden === 'migrar') {
        const origen = resto.find((a) => !a.startsWith('--'));
        if (!origen) { console.log('Uso: node scripts/conocimiento.mjs migrar <CLAUDE.md antiguo> [--seco] [--forzar]'); process.exitCode = 1; }
        else await migrar(origen, { seco: resto.includes('--seco'), forzar: resto.includes('--forzar') });
    } else {
        console.log('Uso: node scripts/conocimiento.mjs comprobar | regenerar | siguiente | migrar <CLAUDE.md> [--seco] [--forzar]');
    }
}
