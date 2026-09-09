/**
 * comparar_impresos_oficiales.mjs — el impreso OFICIAL dice lo MISMO que la maqueta.
 * ---------------------------------------------------------------------------
 * Las cuatro fichas (RES060 · RES080 · RES093 · TER100) y el Anexo I han pasado de
 * redibujarse en HTML a rellenar el PDF de formulario del Ministerio. El documento
 * cambia de aspecto —pasa a ser literalmente el oficial— pero NO puede cambiar ni
 * una cifra: el ahorro, la demanda, el SCOP, las fechas y lo declarado sobre ayudas
 * tienen que ser exactamente los de antes.
 *
 * Esto lo comprueba sobre EXPEDIENTES REALES, uno por ficha: genera los DOS
 * documentos, lee lo que el nuevo escribe en cada casilla y verifica que ese mismo
 * valor está en el documento anterior. Además deja los dos PDF en disco para poder
 * mirarlos uno al lado del otro, que es lo que de verdad convence.
 *
 * Solo LEE de la base de datos. No escribe en Drive, ni envía nada, ni toca ningún
 * expediente.
 *
 *   node implementation/backend/scripts/comparar_impresos_oficiales.mjs
 *   node implementation/backend/scripts/comparar_impresos_oficiales.mjs 26RES060_146
 *   SALIDA=C:/tmp/impresos node implementation/backend/scripts/comparar_impresos_oficiales.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const supabase = require('../services/supabaseClient');
const { rellenar } = require('../services/formularioOficialService');
const { htmlToPdf } = require('../services/pdfService');

const F = '../../frontend/src/features/expedientes';
const { buildFichaRes060Html } = await import(`${F}/logic/fichaRes060Html.js`);
const { buildFichaRes080Html } = await import(`${F}/logic/fichaRes080Html.js`);
const { buildFichaRes093Html } = await import(`${F}/logic/fichaRes093Html.js`);
const { buildFichaTer100Html } = await import(`${F}/logic/fichaTer100Html.js`);
const { fichaFormulario } = await import(`${F}/logic/fichasFormulario.js`);
const { anexoIFormulario } = await import(`${F}/logic/anexoIFormulario.js`);
const { buildAnexoIHtml } = await import(`${F}/utils/docGenerators.js`);
const { computeExpedienteFinancials } = await import(`${F}/logic/expedienteFinancials.js`);

const SALIDA = process.env.SALIDA || path.join(process.cwd(), 'impresos-comparados');
const SOLO = process.argv[2] || null;
// Con GENERAR_PDF=0 no se abre Chrome: la comprobación de datos no lo necesita y
// así el script vale también donde no haya Puppeteer.
const GENERAR_PDF = process.env.GENERAR_PDF !== '0';

let ok = 0, ko = 0, avisos = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`    ✓ ${msg}`); }
    else { ko++; console.log(`    ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};

// El texto del documento clásico: se le quitan las etiquetas y se normaliza igual
// que el valor que se compara, para que "12.345" case aunque en el HTML venga
// dentro de un <td> y con espacios raros alrededor.
const textoDe = (html) => String(html)
    .replace(/<sup>.*?<\/sup>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

const norm = (v) => String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Valores que NO tienen por qué aparecer literales en el documento clásico, y por
 * qué. Se comprueban aparte o se dan por buenos a propósito — un "no lo compruebo"
 * sin motivo escrito es un agujero.
 */
const EXCEPCIONES = {
    // La CCAA se ELIGE del desplegable oficial, que la escribe como el Ministerio
    // ("Castilla-La Mancha"); la maqueta la imprimía en mayúsculas y con el nombre
    // que guarda la BD ("Comunidad Valenciana" ≠ "Comunitat Valenciana").
    'CC AA': 'la escribe el desplegable oficial',
    // El impreso parte la fecha de la firma en tres casillas; la maqueta la escribe
    // seguida ("a 8 de septiembre de 2026").
    'día': 'la fecha va partida en el impreso',
    'mes': 'la fecha va partida en el impreso',
    'año': 'el impreso ya lleva impreso el "20"',
    // El impreso lo trae impreso al lado de la casilla.
    'localidad': 'la maqueta la escribe en mayúsculas dentro de la frase',
};

async function comparar(nombre, plantillaHtml, formulario, ficheroBase) {
    console.log(`\n  ${nombre}`);
    const texto = textoDe(plantillaHtml);
    const campos = formulario.campos || {};

    let comparados = 0;
    for (const [campo, valor] of Object.entries(campos)) {
        if (typeof valor === 'boolean') continue;               // las casillas se ven en el PDF
        if (!String(valor || '').trim()) continue;               // un hueco no se compara
        if (EXCEPCIONES[campo]) { avisos++; console.log(`    · ${campo}: no se contrasta (${EXCEPCIONES[campo]})`); continue; }
        comparados++;
        const v = norm(valor);
        // El nº de serie va en varias líneas dentro de una sola casilla: se compara
        // línea a línea.
        const trozos = String(valor).split('\n').map(norm).filter(Boolean);
        const dentro = trozos.every(t => norm(texto).includes(t));
        check(dentro, `${campo} = "${valor.length > 60 ? valor.slice(0, 57) + '…' : valor}"`,
            dentro ? undefined : `no aparece en el documento clásico (buscado: "${v.slice(0, 60)}")`);
    }
    if (!comparados) { ko++; console.log('    ✗ no se ha comparado ni un solo campo (¿el formulario ha salido vacío?)'); }

    // Que el impreso se rellene DE VERDAD: los avisos del servicio delatan un nombre
    // de campo mal escrito, que dejaría ese dato fuera del documento sin que se note.
    const { pdf, avisos: avisosRellenar } = await rellenar(formulario.plantilla, campos, { fdo: formulario.fdo });
    check(avisosRellenar.length === 0, 'el impreso acepta todos los campos', avisosRellenar.join(' · '));

    if (GENERAR_PDF) {
        fs.mkdirSync(SALIDA, { recursive: true });
        fs.writeFileSync(path.join(SALIDA, `${ficheroBase}_OFICIAL.pdf`), pdf);
        fs.writeFileSync(path.join(SALIDA, `${ficheroBase}_CLASICO.pdf`), await htmlToPdf(plantillaHtml));
        console.log(`    → PDFs en ${SALIDA}`);
    }
}

async function cargarExpediente(numero) {
    const { data: exp } = await supabase.from('expedientes').select('*').eq('numero_expediente', numero).maybeSingle();
    if (!exp) return null;
    const [{ data: cliente }, { data: op }] = await Promise.all([
        exp.cliente_id ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
        exp.oportunidad_id ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { ...exp, clientes: cliente || {}, oportunidades: op || {} };
}

/**
 * Un expediente REAL de cada ficha, y con DATOS: el que ya tiene su CIFO fechado
 * es el que lleva la demanda, el SCOP y las fechas rellenas. Uno recién creado
 * compara ceros con ceros y no prueba nada.
 */
async function elegirExpedientes() {
    if (SOLO) return [SOLO];
    const elegidos = [];
    for (const ficha of ['RES060', 'RES080', 'RES093', 'TER100']) {
        const conDatos = await supabase.from('expedientes')
            .select('numero_expediente')
            .ilike('numero_expediente', `%${ficha}%`)
            .not('documentacion->>fecha_inicio_cifo', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);
        const cualquiera = conDatos.data?.[0] ? null : await supabase.from('expedientes')
            .select('numero_expediente')
            .ilike('numero_expediente', `%${ficha}%`)
            .order('created_at', { ascending: false })
            .limit(1);
        const fila = conDatos.data?.[0] || cualquiera?.data?.[0];
        if (fila) elegidos.push(fila.numero_expediente);
        else console.log(`  (no hay ningún expediente ${ficha} en la base)`);
    }
    return elegidos;
}

const fichaDe = (num) => ['RES080', 'RES093', 'TER100'].find(f => String(num).includes(f)) || 'RES060';

(async () => {
    console.log('═══ El impreso OFICIAL dice lo mismo que la maqueta ═══');
    const numeros = await elegirExpedientes();
    if (!numeros.length) { console.log('No hay expedientes que comparar.'); process.exit(1); }

    for (const numero of numeros) {
        const exp = await cargarExpediente(numero);
        if (!exp) { console.log(`\n${numero}: no existe`); ko++; continue; }
        const ficha = fichaDe(numero);
        console.log(`\n─── ${numero} · ${ficha} ───`);

        const results = computeExpedienteFinancials(exp);
        const htmlFicha = ficha === 'RES080' ? buildFichaRes080Html(exp)
            : ficha === 'RES093' ? buildFichaRes093Html(exp)
                : ficha === 'TER100' ? buildFichaTer100Html(exp)
                    : buildFichaRes060Html(exp, results);

        await comparar(`Ficha ${ficha}`, htmlFicha, fichaFormulario(ficha, exp, { results }), `${numero}_Ficha`);
        await comparar('Anexo I', buildAnexoIHtml(exp, results, {}, true), anexoIFormulario(exp, results, {}), `${numero}_AnexoI`);
    }

    console.log(`\n═══ ${ok} bien · ${ko} mal · ${avisos} sin contrastar (a propósito) ═══`);
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
