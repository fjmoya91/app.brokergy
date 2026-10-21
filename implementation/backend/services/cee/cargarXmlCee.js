'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// El XML de un CEE que hacemos NOSOTROS (inicial o final), cargado en la app
// como «Cargar CEE»: `cee_{fase}`, `xml_{fase}`, los combustibles, las FECHAS de
// firma y visita y, fuera del RES080, la D_ACS por litros/día.
//
// Decisión del usuario (21/10/2026, 26RES060_241): «siempre que hagas un CEE
// inicial o final, carga el XML». Sin él el expediente no tiene ahorro propio y
// nadie sabe cuánto sale hasta que alguien lo carga a mano; antes solo lo hacía
// `cee_inicial.js listo`. Lo usan `cee_inicial.js` (`aplicar --escribir`,
// `listo`, `cargar`), `cee_final.js` y `cee_final_copiando.js`.
//
// REGLA — no pisa la ENTREGA de un técnico: si `cee_{fase}` ya se cargó de un
// fichero que no es un borrador nuestro (`_REVISAR`), NO se toca salvo `forzar`.
// El nombre canónico «{nº} – CEE INICIAL.xml» NO prueba nada: la subida del
// técnico renombra a ése (26RES080_41). `listo` carga con `forzar`: lo que se va
// a firmar manda. El borrador del agente es una propuesta; lo que subió y cargó
// un certificador manda.
// REGLA — en una OPORTUNIDAD no se carga: el XML va al expediente al aceptarla.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../supabaseClient');
const cex = require('../ceeEnvolventeCex');
const previstoSrv = require('./previstoRes080');

/** El texto del XML de CE3X: la 3.x lo escribe en UTF-8; la 2.3, en latin-1. */
function textoXml(xml) {
    if (!Buffer.isBuffer(xml)) return String(xml);
    const cab = xml.subarray(0, 120).toString('latin1');
    return /encoding=["']utf-?8/i.test(cab) ? xml.toString('utf8') : xml.toString('latin1');
}

/** ¿El `cee_{fase}` cargado salió de un fichero NUESTRO (se puede sustituir)? */
function esNuestro(nombre) {
    if (!nombre) return true;
    return /_REVISAR/i.test(nombre);
}

/**
 * @param {object} ctx      el de `cex.cargarExpediente` (expediente + origen)
 * @param {'inicial'|'final'} fase
 * @param {Buffer|string} xml
 * @param {object} [o]
 * @param {string}  [o.fileName]  con qué nombre consta (el del `.xml` en Drive)
 * @param {boolean} [o.escribir]  sin él, solo dice qué cargaría
 * @param {boolean} [o.forzar]    pisar un CEE cargado de la entrega de un técnico
 * @returns {{ cargado, omitido?, parsed?, campos?, bd? }}
 */
async function cargarXmlEnApp(ctx, fase, xml, { fileName = null, escribir = false, forzar = false } = {}) {
    const e = ctx.expediente;
    if (cex.esOportunidad(e) || ctx.origen === 'op') {
        return { cargado: false, omitido: 'oportunidad: el XML se carga en el expediente al aceptarla' };
    }
    const esCee = cex.esCeeDirecto(e) || ctx.origen === 'cee';
    const tabla = esCee ? 'cee_directos' : 'expedientes';
    const xmlTexto = textoXml(xml);
    const parsed = await previstoSrv.leerXml(xmlTexto);
    if (fileName) parsed._fileName = fileName;

    const { data: fila, error: errFila } = await supabase.from(tabla)
        .select(`previo:cee->cee_${fase}->_fileName, acs_method:cee->acs_method, dacs_litros_dia:cee->dacs_litros_dia,`
            + ' cee_inicial:cee->cee_inicial, cee_final:cee->cee_final, is_reforma:cee->is_reforma')
        .eq('id', e.id).maybeSingle();
    if (errFila) throw new Error(`No se ha podido leer el CEE cargado: ${errFila.message}`);
    if (fila?.previo && !esNuestro(fila.previo) && !forzar) {
        return { cargado: false, parsed,
                 omitido: `ya hay un CEE ${fase} cargado de «${fila.previo}» (entrega de un técnico): no se pisa sin forzar` };
    }

    const campos = [[`cee_${fase}`, parsed], [`xml_${fase}`, xmlTexto]];
    if (parsed.combustibleACS) campos.push([`comb_acs_${fase}`, parsed.combustibleACS]);
    if (parsed.combustibleCalefaccion) campos.push([`comb_cal_${fase}`, parsed.combustibleCalefaccion]);
    const fechas = [[`fecha_firma_cee_${fase}`, parsed.fechaFirma], [`fecha_visita_cee_${fase}`, parsed.fechaVisita]]
        .filter(([, v]) => v);

    //: La D_ACS por los litros/día del certificado (criterio del 19/10/2026), la
    //: MISMA función que al cargar un CEE en el módulo. No en un RES080.
    const num = e.numero_expediente || '';
    const esReforma = e.oportunidades?.ficha === 'RES080' || fila?.is_reforma || /RES080/i.test(num);
    let ajuste = {};
    if (!esCee && !esReforma) {
        const { ajusteAcsLitros } = await import(pathToFileURL(path.join(__dirname,
            '../../../frontend/src/features/expedientes/logic/demandaAcs.js')).href);
        ajuste = ajusteAcsLitros({ ...(fila || {}), [`cee_${fase}`]: parsed }) || {};
    }
    const resumen = { campos: campos.map(([k]) => k), fechas: Object.fromEntries(fechas), ajuste };
    if (!escribir) return { cargado: false, omitido: 'en seco', parsed, ...resumen };

    for (const [k, v] of campos) await cex.setCeeField(e, k, v);
    for (const [k, v] of fechas) {
        await cex.setCeeField(e, k, v);
        //: Valor SUELTO por la RPC de clave: `merge_*_doc_json` vuelve lista una fecha.
        const { error } = esCee
            ? await supabase.rpc('set_cee_directo_doc_field', { p_id: e.id, p_field: k, p_value: v })
            : await supabase.rpc('set_expediente_doc_field', { p_oportunidad_id: e.oportunidad_id, p_field: k, p_value: v });
        if (error) throw new Error(`${k}: ${error.message}`);
    }
    for (const [k, v] of Object.entries(ajuste)) await cex.setCeeField(e, k, v);

    const { data: bd } = await supabase.from(tabla)
        .select(`sup:cee->cee_${fase}->superficieHabitable, dem:cee->cee_${fase}->demandaCalefaccion,`
            + ` firma:documentacion->fecha_firma_cee_${fase}, visita:documentacion->fecha_visita_cee_${fase}`)
        .eq('id', e.id).maybeSingle();
    return { cargado: true, parsed, ...resumen, bd };
}

/** Las líneas que imprimen los scripts. */
function lineasCarga(r, fase) {
    if (!r) return [];
    const p = r.parsed || {};
    const dice = `${p.superficieHabitable ?? '—'} m² · dem. cal ${p.demandaCalefaccion ?? '—'} · ACS ${p.demandaACS ?? '—'}`
        + ` · ${p.emisionesLetra || '—'}/${p.epnrLetra || '—'} · firma ${p.fechaFirma || '—'} · visita ${p.fechaVisita || '—'}`;
    if (r.cargado) return [`✓ XML del CEE ${fase} CARGADO en la app («Cargar CEE»): ${dice}`
        + `${Object.keys(r.ajuste || {}).length ? ` · D_ACS ${JSON.stringify(r.ajuste)}` : ''}`];
    if (r.omitido === 'en seco') return [`+ con --escribir se cargará el XML del CEE ${fase} en la app: ${dice}`];
    return [`· XML del CEE ${fase} NO cargado en la app: ${r.omitido}`];
}

module.exports = { cargarXmlEnApp, lineasCarga, textoXml };
