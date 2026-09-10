#!/usr/bin/env node
/**
 * rellenar_fichas_tecnicas.js — deja enlazadas las fichas técnicas que el
 * expediente YA TIENE en el catálogo pero que nadie ha copiado a su slot.
 *
 *   node scripts/rellenar_fichas_tecnicas.js 25RES080_26 26RES080_34      (en seco)
 *   node scripts/rellenar_fichas_tecnicas.js --lote=LOTE-2025-005 --execute
 *
 * POR QUÉ HACE FALTA. El paquete E{n} de un lote resuelve la pieza «4-1 Fichas
 * técnicas» desde el SLOT del expediente (`ft_*_link`), no desde la carpeta de
 * Drive ni desde el catálogo. Hasta hoy, ese slot solo lo rellenaba el modal del
 * certificado al abrirlo, así que un expediente con el modelo elegido y su ficha
 * en el catálogo podía llegar al lote diciendo que le faltaba un documento que
 * no faltaba (medido en LOTE-2025-005). Este script es la brocha para lo ya
 * ocurrido; para lo que venga, el paquete lo rellena solo (ver
 * services/fichaTecnicaSlot.js y envioGestorService).
 *
 * En SECO dice qué haría y por qué no puede en los que no puede. Lo que no se
 * puede resolver aquí es siempre lo mismo: un modelo que NO está en el catálogo,
 * o que está sin ficha — y eso se arregla en el catálogo, una vez, para todos
 * los expedientes que vengan detrás.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('../services/supabaseClient');
const { asegurarFichaTecnica } = require('../services/fichaTecnicaSlot');

const MOTIVOS = {
    no_model: 'el expediente no declara ese modelo (elígelo en la pestaña Envolvente / Instalación)',
    model_not_found: 'el modelo declarado ya no existe en el catálogo',
    no_ficha_in_db: 'el modelo está en el catálogo pero SIN ficha técnica — súbesela al catálogo',
    no_drive_folder: 'el expediente no tiene carpeta de Drive',
    slot_no_aplica: 'este expediente no lleva esa ficha',
    external_not_pdf: 'la URL de la ficha del catálogo no es un PDF',
    external_fetch_failed: 'no se pudo descargar la ficha del catálogo',
    bad_ficha_url: 'la ficha del catálogo no es una URL utilizable',
};

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const lote = (args.find(a => a.startsWith('--lote=')) || '').split('=')[1];
    const numeros = args.filter(a => !a.startsWith('--'));

    let q = supabase.from('expedientes')
        .select('id, oportunidad_id, numero_expediente, documentacion, instalacion, lote_id');
    if (numeros.length) q = q.in('numero_expediente', numeros);
    else if (lote) {
        const { data: l } = await supabase.from('lotes').select('id').eq('codigo', lote).single();
        if (!l) { console.error(`No existe el lote ${lote}`); process.exit(1); }
        q = q.eq('lote_id', l.id);
    } else {
        console.error('Uso: rellenar_fichas_tecnicas.js <nº expte…> | --lote=LOTE-AAAA-NNN [--execute]');
        process.exit(1);
    }
    const { data: exps, error } = await q;
    if (error) { console.error(error.message); process.exit(1); }
    if (!exps || !exps.length) { console.error('Sin expedientes.'); process.exit(1); }

    const { resolveAllFichaSlots, ftDocFields } = await import(
        require('url').pathToFileURL(require('path').join(
            __dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')).href);

    console.log(execute ? '\n=== APLICANDO ===\n' : '\n=== EN SECO (añade --execute para aplicar) ===\n');
    let rellenados = 0, bloqueados = 0;

    for (const exp of exps.sort((a, b) => a.numero_expediente.localeCompare(b.numero_expediente))) {
        const slots = resolveAllFichaSlots(exp) || [];
        const vacios = slots.filter(sl => {
            const c = ftDocFields(sl.type);
            const d = exp.documentacion || {};
            return !d[c.id] && !d[c.link];
        });
        if (!vacios.length) { console.log(`✓ ${exp.numero_expediente} — sus ${slots.length} fichas ya están enlazadas`); continue; }

        console.log(`\n${exp.numero_expediente} — ${vacios.length} de ${slots.length} huecos sin enlazar`);
        for (const sl of vacios) {
            if (!execute) {
                // En seco NO se toca Drive: se dice si el catálogo tiene con qué.
                const r = await puedeResolverse(exp, sl.type);
                console.log(`   ${r.ok ? '→ se copiaría' : '⛔ no se puede'}  ${sl.label}${r.detalle ? ` · ${r.detalle}` : ''}`);
                if (r.ok) rellenados++; else bloqueados++;
                continue;
            }
            const r = await asegurarFichaTecnica(exp, sl.type);
            if (r.ok) {
                rellenados++;
                console.log(`   ✓ ${sl.label} ← "${r.model}" (${r.source === 'existing' ? 'ya estaba en Drive, solo faltaba el enlace' : 'copiada del catálogo'})`);
            } else {
                bloqueados++;
                console.log(`   ⛔ ${sl.label} — ${MOTIVOS[r.error] || r.error}${r.model ? ` [${r.model}]` : ''}`);
            }
        }
    }
    console.log(`\n${execute ? 'Enlazadas' : 'Se enlazarían'}: ${rellenados} · Sin resolver: ${bloqueados}\n`);
}

/** Comprobación de SOLO LECTURA: ¿tiene el catálogo la ficha de este hueco? */
async function puedeResolverse(exp, type) {
    const { findSlotForExpediente } = await import(
        require('url').pathToFileURL(require('path').join(
            __dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')).href);
    const slot = findSlotForExpediente(exp, type);
    if (!slot) return { ok: false, detalle: MOTIVOS.slot_no_aplica };
    if (!slot.modelId) return { ok: false, detalle: MOTIVOS.no_model };
    const tabla = type === 'marco' ? 'ventanas_marcos' : (type === 'cristal' ? 'ventanas_cristales' : 'aerotermia');
    const { data } = await supabase.from(tabla).select('id, ficha_tecnica').eq('id', slot.modelId).single();
    if (!data) return { ok: false, detalle: MOTIVOS.model_not_found };
    if (!data.ficha_tecnica) return { ok: false, detalle: MOTIVOS.no_ficha_in_db };
    return { ok: true };
}

main().catch(e => { console.error(e); process.exit(1); });
