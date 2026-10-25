#!/usr/bin/env node
// ─── sembrar_articulos.js ────────────────────────────────────────────────────
// Carga el catálogo de ARTÍCULOS de la pestaña Facturación a partir de la hoja
// ARTÍCULOS de AppSheet («APP PPTO Y FACTURAS», leída el 24/10/2026), con los
// nombres limpios (sin el «*» de las tasas: el PDF lo pone solo a los suplidos)
// y lo que AppSheet no tenía: familia, VARIANTES, lo que cada uno ARRASTRA (el
// CEE trae su tasa) y si abre un expediente CEE al aceptarse.
//
// `usos` arranca con las líneas de presupuesto + factura que cada artículo tuvo
// en AppSheet: el buscador del editor pone primero lo más usado.
//
// En SECO por defecto (enseña lo que haría). `--escribir` escribe en la
// Supabase de PRODUCCIÓN. Idempotente: un artículo que ya existe (mismo nombre)
// no se duplica ni se toca — los precios, una vez en la app, los cambia ADMIN
// desde la pestaña Artículos.
//
//   node scripts/sembrar_articulos.js            → en seco
//   node scripts/sembrar_articulos.js --escribir → escribe
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const supabase = require('../services/supabaseClient');

const ESCRIBIR = process.argv.includes('--escribir');

// `clave` solo sirve aquí, para resolver lo que arrastra cada uno.
const CATALOGO = [
    // ── Certificados ──────────────────────────────────────────────────────
    {
        clave: 'cee', appsheet_id: '2', familia: 'CEE', orden: 10, usos: 31, genera: 'CEE_UNICO',
        nombre: 'Certificado de Eficiencia Energética, incluida su presentación en Industria', precio: 150,
        arrastra: [{ clave: 'tasa_cee_clm', uds: 1 }],
    },
    {
        clave: 'cee_doble', appsheet_id: '1', familia: 'CEE', orden: 20, usos: 58, genera: 'CEE_DOBLE',
        nombre: 'Certificado de Eficiencia Energética inicial y final, incluida su presentación en Industria', precio: 220,
        arrastra: [{ clave: 'tasa_cee_clm', uds: 2 }],
    },
    {
        clave: 'cee_final', appsheet_id: '3', familia: 'CEE', orden: 30, usos: 31,
        nombre: 'Certificado de Eficiencia Energética final, incluida su presentación en Industria', precio: 50,
        arrastra: [{ clave: 'tasa_cee_clm', uds: 1 }],
    },
    // ── Legalizaciones ────────────────────────────────────────────────────
    {
        clave: 'leg_fv', familia: 'LEGALIZACIÓN', orden: 10, usos: 0,
        nombre: 'Legalización de instalación solar fotovoltaica', precio: 300,
        // AppSheet no tenía este artículo: 300 € los dio Fran el 24/10/2026.
        variantes: [
            { id: 'vivienda', nombre: 'Vivienda unifamiliar', precio: 300 },
            { id: 'nave', nombre: 'Nave industrial', precio: 300 },
        ],
    },
    {
        clave: 'leg_aero', appsheet_id: '6', familia: 'LEGALIZACIÓN', orden: 20, usos: 7,
        nombre: 'Legalización de instalación de aerotermia', precio: 190,
        arrastra: [{ clave: 'tasa_term_clm', uds: 1 }],
    },
    {
        clave: 'eici_madrid', appsheet_id: '12', familia: 'LEGALIZACIÓN', orden: 30, usos: 2,
        nombre: 'EICI aerotermia Comunidad de Madrid', precio: 57.75,
    },
    // ── Subvenciones ──────────────────────────────────────────────────────
    { clave: 'subv_sol', appsheet_id: '4', familia: 'SUBVENCIONES', orden: 10, usos: 23, nombre: 'Solicitud de subvención', precio: 400 },
    { clave: 'subv_just', appsheet_id: '5', familia: 'SUBVENCIONES', orden: 20, usos: 18, nombre: 'Justificación de subvención', precio: 300 },
    {
        clave: 'subv_feder', appsheet_id: 'fdbf313c', familia: 'SUBVENCIONES', orden: 30, usos: 1,
        nombre: 'Solicitud de subvención, proyecto técnico, CEE inicial y consultoría FEDER', precio: 1500,
    },
    // ── Ingeniería ────────────────────────────────────────────────────────
    { clave: 'memoria', appsheet_id: 'f5fcef61', familia: 'INGENIERÍA', orden: 10, usos: 13, nombre: 'Memoria técnica de actuación', precio: 400 },
    { clave: 'informe', appsheet_id: '8af0d228', familia: 'INGENIERÍA', orden: 20, usos: 2, nombre: 'Informe técnico', precio: 200 },
    { clave: 'visita', appsheet_id: '37a43618', familia: 'INGENIERÍA', orden: 30, usos: 1, nombre: 'Visita a instalaciones', precio: 300 },
    { clave: 'ingenieria', appsheet_id: 'fdb60890', familia: 'INGENIERÍA', orden: 40, usos: 6, nombre: 'Prestación de servicios de ingeniería', precio: 2250 },
    // ── CAE ───────────────────────────────────────────────────────────────
    { clave: 'cae_gestion', appsheet_id: '529a035b', familia: 'CAE', orden: 10, usos: 11, nombre: 'Gestión técnica y administrativa ayuda BONO ENERGÉTICO CAE', precio: 250 },
    { clave: 'cae_informe', appsheet_id: '90986a25', familia: 'CAE', orden: 20, usos: 2, nombre: 'Informe técnico para el cálculo de ahorro energético (CAE)', precio: 500 },
    { clave: 'cae_pericial', appsheet_id: '35a24756', familia: 'CAE', orden: 30, usos: 1, nombre: 'Informe técnico pericial de justificación del ahorro energético', precio: 400 },
    // ── Consultoría ───────────────────────────────────────────────────────
    { clave: 'consultoria', appsheet_id: 'e410ac51', familia: 'CONSULTORÍA', orden: 10, usos: 1, nombre: 'Consultoría técnica en eficiencia energética y subvenciones', precio: 150 },
    // ── Tasas (suplidos: sin IVA y sin descuento) ─────────────────────────
    { clave: 'tasa_cee_clm', appsheet_id: '7', familia: 'TASAS', orden: 10, usos: 83, suplido: true, nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha', precio: 16.39 },
    { clave: 'tasa_cee_cyl', appsheet_id: '8', familia: 'TASAS', orden: 20, usos: 3, suplido: true, nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla y León', precio: 29.1 },
    { clave: 'tasa_cee_and_p', appsheet_id: '13', familia: 'TASAS', orden: 30, usos: 0, suplido: true, nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Andalucía (hasta 250 m²)', precio: 14.69 },
    { clave: 'tasa_cee_and_g', appsheet_id: '14', familia: 'TASAS', orden: 40, usos: 2, suplido: true, nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Andalucía (más de 250 m²)', precio: 56.31 },
    { clave: 'tasa_cee_val', appsheet_id: '96c4da35', familia: 'TASAS', orden: 50, usos: 2, suplido: true, nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Comunidad Valenciana', precio: 10.19 },
    { clave: 'tasa_term_clm', appsheet_id: '9', familia: 'TASAS', orden: 60, usos: 5, suplido: true, nombre: 'Tasa Legalización Instalación térmica Castilla-La Mancha', precio: 11.97 },
    { clave: 'tasa_term_cyl', appsheet_id: '10', familia: 'TASAS', orden: 70, usos: 0, suplido: true, nombre: 'Tasa Legalización Instalación térmica Castilla y León', precio: 19.65 },
    { clave: 'tasa_term_mad', appsheet_id: '11', familia: 'TASAS', orden: 80, usos: 2, suplido: true, nombre: 'Tasa Legalización Instalación térmica Comunidad de Madrid', precio: 3.12 },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fmt = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

async function main() {
    let { data: existentes, error } = await supabase.from('articulos').select('id, nombre, appsheet_id');
    if (error) {
        console.error(`✗ No se puede leer la tabla «articulos»: ${error.message}`);
        console.error('  ¿Se ha aplicado ya scripts/facturacion_schema.sql en Supabase?');
        // En seco se enseña igual lo que se haría.
        if (ESCRIBIR) { process.exitCode = 1; return; }
        existentes = [];
        console.log('');
    }
    const porNombre = new Map((existentes || []).map(a => [norm(a.nombre), a]));
    const ids = {};
    const nuevos = [];
    for (const a of CATALOGO) {
        const ya = porNombre.get(norm(a.nombre));
        if (ya) { ids[a.clave] = ya.id; continue; }
        nuevos.push(a);
    }

    console.log(`${ESCRIBIR ? 'ESCRIBIENDO' : 'EN SECO'} · ${CATALOGO.length} artículos en el catálogo base · ${existentes.length} ya en la tabla · ${nuevos.length} por crear\n`);
    for (const a of CATALOGO) {
        const estado = nuevos.includes(a) ? '+ nuevo ' : '= ya está';
        const extra = [
            a.suplido ? 'suplido' : null,
            a.genera ? `abre ${a.genera}` : null,
            a.variantes ? `variantes: ${a.variantes.map(v => `${v.nombre} ${fmt(v.precio)}`).join(' / ')}` : null,
            a.arrastra ? `arrastra: ${a.arrastra.map(x => `${x.uds} × ${CATALOGO.find(c => c.clave === x.clave).nombre}`).join(', ')}` : null,
            a.appsheet_id ? `AppSheet ${a.appsheet_id}` : 'NUEVO (no estaba en AppSheet)',
        ].filter(Boolean).join(' · ');
        console.log(`${estado}  [${a.familia}] ${a.nombre} — ${fmt(a.precio)}\n           ${extra}`);
    }
    if (!ESCRIBIR) {
        console.log('\nNada escrito. Para escribir: node scripts/sembrar_articulos.js --escribir');
        return;
    }

    // 1) Alta sin lo que arrastran (aún no tienen id).
    for (const a of nuevos) {
        const fila = {
            nombre: a.nombre, familia: a.familia, precio: a.precio,
            iva_pct: a.suplido ? 0 : 21, suplido: !!a.suplido,
            variantes: a.variantes || [], arrastra: [], genera: a.genera || null,
            activo: true, orden: a.orden, usos: a.usos || 0, appsheet_id: a.appsheet_id || null,
        };
        const { data, error: e } = await supabase.from('articulos').insert(fila).select('id').single();
        if (e) throw new Error(`${a.nombre}: ${e.message}`);
        ids[a.clave] = data.id;
    }
    // 2) Lo que arrastran, ya con los id. Solo a los recién creados: a uno que ya
    //    estaba se le respeta lo que tenga.
    for (const a of nuevos.filter(x => x.arrastra?.length)) {
        const arrastra = a.arrastra.map(x => ({ articulo_id: ids[x.clave], uds: x.uds }));
        if (arrastra.some(x => !x.articulo_id)) throw new Error(`${a.nombre}: no se resuelve lo que arrastra`);
        const { error: e } = await supabase.from('articulos').update({ arrastra }).eq('id', ids[a.clave]);
        if (e) throw new Error(`${a.nombre} (arrastra): ${e.message}`);
    }
    console.log(`\n✓ ${nuevos.length} artículos creados.`);
}

main().catch(e => { console.error('✗', e.message); process.exitCode = 1; });
