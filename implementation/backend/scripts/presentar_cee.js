#!/usr/bin/env node
// ─── presentar_cee.js ────────────────────────────────────────────────────────
// La parte de la app de la skill `presentar-cee`: qué hay que presentar, qué se
// teclea en la sede de la JCCM (procedimiento 020264 · SIACI SJM3) y qué se sube
// a la app cuando la sede devuelve el justificante.
//
//   node scripts/presentar_cee.js pendientes
//   node scripts/presentar_cee.js certificado          (con qué certificado firma en la sede)
//   node scripts/presentar_cee.js preparar <nº> [--fase inicial|final] [--certificador <id|NIF|nombre>]
//   node scripts/presentar_cee.js devuelto <nº> --registro <pdf> [--tasa <pdf>] [--fase …] [--escribir]
//
// NO rellena el formulario ni paga: eso lo hace Claude en el navegador con lo que
// deja `preparar` (rellenar.js + los ficheros). Todo lo que aquí se calcula sale
// del MISMO borrador que enseña la app (`borradorCeeService.componer`), así que lo
// que se teclea en la sede es lo que ve una persona en el popup «Presentar el CEE».
//
// ⚠️ Local = PRODUCCIÓN: `devuelto --escribir` sube a Drive y marca REGISTRADO.
// Sin `--escribir` solo lee el justificante y dice qué haría.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabaseClient');

const SCRATCH = path.join(__dirname, '..', 'scratch', 'presentar-cee');
const QUIEN = { texto: 'Fran (presentación automática)', usuario: 'FRAN' };

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const orden = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(`--${k}`);
const fase = (opt('fase') || 'inicial').toLowerCase() === 'final' ? 'final' : 'inicial';

// ─── Dónde vive cada número ──────────────────────────────────────────────────
async function localizar(numero) {
    const campos = 'id, numero_expediente, cliente_id, seguimiento, estado';
    const { data: cd } = await supabase.from('cee_directos').select(`${campos}, alcance`).eq('numero_expediente', numero).maybeSingle();
    if (cd) return { origen: 'cee_directo', row: cd };
    const { data: ex } = await supabase.from('expedientes').select(campos).eq('numero_expediente', numero).maybeSingle();
    if (ex) return { origen: 'expediente', row: ex };
    throw new Error(`No encuentro ${numero} ni en cee_directos ni en expedientes`);
}

const claveFase = (f) => (f === 'final' ? 'cee_final' : 'cee_inicial');

// ─── pendientes ──────────────────────────────────────────────────────────────
// El MISMO criterio que el radar del parte («Con tu visto bueno y sin registrar»,
// seguimientoRadar.detectarRegistro): subestado REVISADO, sin fecha de registro y
// sin `registrado_at` en el encargo de presentación. Desde el 25/10/2026 el visto
// bueno es lo que lo hace presentable (Eva ya no presenta): FIRMADO dice si ya
// hay PDF firmado en su casilla; si no, se firma antes (`firmar_cee.js`).
// REGLA — solo se PRESENTAN los de la CASA (Fran por el CIF, o el Agente IA): los
// de un técnico de fuera son suyos, se quedan como están y los presenta él con el
// aviso del visto bueno (Fran, 25/10/2026). Se listan aparte, para recordárselo.
async function listaPendientes() {
    const { plazoDesdeFirma } = require('../services/presentacionCeeService');
    const { esDeLaCasa } = require('../services/cee/canonicoAlVistoBueno');
    const campos = 'id, numero_expediente, seguimiento, presentacion:cee->presentacion, ficheros:cee->cee_files, '
        + 'cert:cee->>certificador_id, '
        + 'ffi:cee->>fecha_firma_cee_inicial, fff:cee->>fecha_firma_cee_final, '
        + 'dfi:documentacion->>fecha_firma_cee_inicial, dff:documentacion->>fecha_firma_cee_final, '
        + 'ri:documentacion->>fecha_registro_cee_inicial, rf:documentacion->>fecha_registro_cee_final';
    const out = [];
    for (const [tabla, origen] of [['expedientes', 'expediente'], ['cee_directos', 'cee_directo']]) {
        const { data, error } = await supabase.from(tabla).select(campos)
            .or('seguimiento->>cee_inicial.eq.REVISADO,seguimiento->>cee_final.eq.REVISADO');
        if (error) throw new Error(`${tabla}: ${error.message}`);
        for (const r of data || []) {
            for (const f of ['inicial', 'final']) {
                if (r.seguimiento?.[claveFase(f)] !== 'REVISADO') continue;
                if ((f === 'final' ? r.rf : r.ri) || r.presentacion?.[f]?.registrado_at) continue;
                const firma = f === 'final' ? (r.fff || r.dff) : (r.ffi || r.dfi);
                const enc = r.presentacion?.[f];
                out.push({
                    numero: r.numero_expediente, origen, fase: f, certId: r.cert || null,
                    vbAt: r.seguimiento?.[`${claveFase(f)}_ts`]?.REVISADO || null,
                    plazo: plazoDesdeFirma(firma),
                    firmado: !!r.ficheros?.[f]?.pdf,
                    encargo: enc?.enviado_at && !enc?.retirado_at ? `${enc.nombre || ""} <${enc.email || "?"}> desde ${enc.enviado_at.slice(0, 10)}` : null,
                });
            }
        }
    }
    // Quién es cada certificador: UNA consulta para todos.
    const ids = [...new Set(out.map(p => p.certId).filter(Boolean))];
    const certs = new Map();
    if (ids.length) {
        const { data } = await supabase.from('prescriptores')
            .select('id_empresa, razon_social, cif, empresa_cif, es_agente_ia').in('id_empresa', ids);
        for (const c of data || []) certs.set(String(c.id_empresa), c);
    }
    for (const p of out) {
        const c = certs.get(String(p.certId));
        p.casa = esDeLaCasa(c);
        p.tecnico = c?.razon_social || 'sin técnico';
    }
    out.sort((a, b) => (a.plazo?.quedan ?? 999) - (b.plazo?.quedan ?? 999));
    return out;
}

async function pendientes() {
    const out = await listaPendientes();
    const casa = out.filter(p => p.casa), ajenos = out.filter(p => !p.casa);
    if (!casa.length) console.log('No hay ningún CEE de la casa con visto bueno pendiente de presentar.');
    else {
        console.log('A PRESENTAR (de la casa):');
        console.log('Nº                 FASE     QUEDAN  LÍMITE      FIRMADO  ENCARGO ANTIGUO');
        for (const p of casa) {
            console.log(`${p.numero.padEnd(18)} ${p.fase.padEnd(8)} ${String(p.plazo?.quedan ?? '¿?').padStart(6)}  ${(p.plazo?.limite || '—').padEnd(10)}  ${(p.firmado ? 'sí' : 'NO').padEnd(7)}  ${p.encargo || '—'}`);
        }
        if (casa.some(p => !p.firmado)) console.log('Sin firmar: se firma antes de presentar (node scripts/firmar_cee.js <nº> [--fase final] --escribir).');
        if (casa.some(p => p.encargo)) console.log('⚠️ Con un encargo antiguo a otra persona sin cerrar: puede que ya lo haya presentado (dos tasas). Pregunta antes.');
    }
    if (ajenos.length) {
        console.log('\nLOS PRESENTA SU TÉCNICO (no se tocan ni se presentan desde aquí; se le recuerda):');
        for (const p of ajenos) {
            console.log(`${p.numero.padEnd(18)} ${p.fase.padEnd(8)} ${String(p.plazo?.quedan ?? '¿?').padStart(6)}  ${(p.plazo?.limite || '—').padEnd(10)}  ${p.tecnico} · visto bueno ${p.vbAt ? p.vbAt.slice(0, 10) : '¿?'}`);
        }
    }
}

// ─── Sexo: el de la ficha; si no consta, se SUPONE por el nombre ─────────────
// (decisión del usuario, 15/10/2026: «si no se indica, suponer según el nombre;
// si se falla no es limitante»). Se mira el PRIMER nombre: «JOSE MARIA» es H.
const MUJER_SIN_A = new Set(['CARMEN', 'PILAR', 'ISABEL', 'ROCIO', 'CONSUELO', 'AMPARO', 'ROSARIO', 'MERCEDES',
    'DOLORES', 'INES', 'BEATRIZ', 'RAQUEL', 'RUTH', 'ESTHER', 'MONTSERRAT', 'NIEVES', 'SOLEDAD', 'ASUNCION',
    'CONCEPCION', 'ENCARNACION', 'LOURDES', 'MILAGROS', 'REMEDIOS', 'LUZ', 'MARIBEL', 'MABEL', 'MIRIAM', 'BELEN',
    'MAR', 'SOL', 'ANGELES', 'IRENE', 'NOEMI', 'YOLANDA', 'ROSA', 'MARISOL', 'TRINIDAD', 'CRUZ', 'PAZ', 'EDURNE',
    'ITZIAR', 'AINHOA', 'ARANTXA', 'REYES', 'GEMMA', 'CORAL', 'ABRIL', 'ESTEFANIA', 'JUDIT', 'EDITH']);
const HOMBRE_CON_A = new Set(['BORJA', 'LUCA', 'NICOLA', 'JOSUA', 'ANDREA', 'ELIA', 'GARCILASO', 'MATIA']);
function sexoPorNombre(nombre) {
    const n = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().split(/\s+/)[0] || '';
    if (!n) return null;
    if (MUJER_SIN_A.has(n)) return 'M';
    if (HOMBRE_CON_A.has(n)) return 'H';
    return n.endsWith('A') ? 'M' : 'H';
}

// ─── preparar ────────────────────────────────────────────────────────────────
const TIPO_VIA = { 'AUTOVIA': 'AU', 'AVENIDA': 'AV', 'BAJADA': 'BA', 'CALLE': 'C/', 'CAMINO': 'CA', 'CARRETERA': 'CR',
    'CUESTA': 'CU', 'GLORIETA': 'GL', 'PASEO': 'PO', 'PARQUE': 'PQ', 'PASAJE': 'PS', 'PLAZA': 'PZ', 'RAMBLA': 'RA',
    'RONDA': 'RO', 'TRAVESIA': 'TR', 'VIA': 'V/' };
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const codVia = (t) => TIPO_VIA[sinTildes(t)] || '';
const aIso = (dmy) => { const m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

function campos(ap) {
    const o = {};
    for (const c of ap?.campos || []) if (o[c.campo] === undefined) o[c.campo] = c.valor ?? '';
    return o;
}

/** Las casillas VIVIENDA/TERCIARIO, de la instrucción que ya redacta el borrador. */
function casillasEdificio(apEdificio) {
    const t = sinTildes((apEdificio?.instruccionesFinal || []).join(' '));
    if (t.includes('BLOQUE COMPLETO')) return { TIPO_EDIFICIO: 'V', TIPO_VIVIENDA: 'B', TIPO_BLOQUE: 'BC' };
    if (t.includes('VIVIENDA INDIVIDUAL')) return { TIPO_EDIFICIO: 'V', TIPO_VIVIENDA: 'B', TIPO_BLOQUE: 'VI' };
    if (t.includes('UNIFAMILIAR')) return { TIPO_EDIFICIO: 'V', TIPO_VIVIENDA: 'U' };
    if (t.includes('LOCAL')) return { TIPO_EDIFICIO: 'T', TIPO_TERCIARIO: 'V' };
    if (t.includes('EDIFICIO COMPLETO')) return { TIPO_EDIFICIO: 'T', TIPO_TERCIARIO: 'E' };
    return null;
}

// ─── Quién firma, si no es el asignado ───────────────────────────────────────
// Con el AGENTE IA en la barra el representante es el certificador de la casa (Fran)
// sin decir nada (`borradorCeeService.representanteDe`); `--certificador` lo cambia
// por otro de Prescriptores: su id_empresa, su NIF/CIF o un trozo de su nombre.
async function resolverCertificador(q) {
    if (!q) return null;
    const t = String(q).trim();
    if (/^[0-9a-f-]{36}$/i.test(t)) return t;
    const nif = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const { data: porNif } = await supabase.from('prescriptores').select('id_empresa, razon_social')
        .eq('tipo_empresa', 'CERTIFICADOR').or(`cif.eq.${nif},nif_responsable.eq.${nif}`);
    let lista = porNif || [];
    if (!lista.length) {
        const { data } = await supabase.from('prescriptores').select('id_empresa, razon_social')
            .eq('tipo_empresa', 'CERTIFICADOR').ilike('razon_social', `%${t.replace(/[%_,()]/g, ' ')}%`);
        lista = data || [];
    }
    if (lista.length !== 1) {
        throw new Error(`--certificador «${t}»: ${lista.length ? `${lista.length} posibles (${lista.map(p => p.razon_social).join(' · ')})` : 'ninguno'} en Prescriptores. Dalo por su id_empresa.`);
    }
    return lista[0].id_empresa;
}

/** El nombre del técnico si el CEE NO es de la casa (Fran por el CIF o el Agente IA); si lo es, null. */
async function tecnicoDeFuera(origen, id) {
    const tabla = origen === 'cee_directo' ? 'cee_directos' : 'expedientes';
    const { data: fila } = await supabase.from(tabla).select('cert:cee->>certificador_id').eq('id', id).maybeSingle();
    if (!fila?.cert) return null;   // sin técnico asignado: lo decide quien presenta
    const { data: c } = await supabase.from('prescriptores')
        .select('razon_social, cif, empresa_cif, es_agente_ia').eq('id_empresa', fila.cert).maybeSingle();
    return c && !require('../services/cee/canonicoAlVistoBueno').esDeLaCasa(c) ? (c.razon_social || 'otro técnico') : null;
}

async function preparar(numero) {
    const svc = require('../services/borradorCeeService');
    const { esRevisar } = require('../services/presentacionCeeService');
    const { origen, row } = await localizar(numero);
    const optsRep = { representanteId: await resolverCertificador(opt('certificador')) };
    const { borrador } = await svc.componer(origen, row.id, fase, optsRep);
    if (!borrador.aplica) throw new Error(`${numero}: no es de Castilla-La Mancha (${borrador.motivo || 'sin plantilla'}). Esta skill solo presenta en la JCCM.`);

    // Presentar dos veces es pagar dos tasas: si la fase ya está registrada, no se prepara para enviar.
    const yaRegistrado = String(row.seguimiento?.[claveFase(fase)] || '').toUpperCase() === 'REGISTRADO';

    const ap = Object.fromEntries((borrador.apartados || []).map(a => [a.id, a]));
    const sol = campos(ap['01']), rep = campos(ap['02']), edi = campos(ap['05']), cer = campos(ap['06']);
    const avisos = [...(borrador.avisos || []).map(a => (typeof a === 'string' ? a : a.texto || JSON.stringify(a)))];

    // Tipo de vía del solicitante: si viene en blanco y es la MISMA calle que el
    // edificio (lo normal: vive en la casa que certifica), se toma la del edificio.
    let solVia = codVia(sol['Tipo vía']);
    if (!solVia && sinTildes(sol['Nombre de la vía']) === sinTildes(edi['Nombre de la vía'])) solVia = codVia(edi['Tipo vía']);
    if (!solVia) avisos.push('Tipo de vía del SOLICITANTE en blanco y distinta del edificio: elígelo a mano.');

    const sexoSol = sol['Sexo'] ? (sinTildes(sol['Sexo']).startsWith('M') ? 'M' : 'H') : sexoPorNombre(sol['Nombre']);
    if (!sol['Sexo']) avisos.push(`Sexo del solicitante SUPUESTO por el nombre (${sol['Nombre']} → ${sexoSol === 'M' ? 'Mujer' : 'Hombre'}).`);
    const sexoRep = sexoPorNombre(rep['Nombre']);
    const casillas = casillasEdificio(ap['05']);
    if (!casillas) avisos.push('El certificado no declara el tipo de edificio: marca VIVIENDA/TERCIARIO a mano.');
    const calidadSol = sinTildes(sol['En calidad de']).startsWith('PROMOTOR') ? 'Promotor' : 'Propietario';

    // Lo que se teclea. Las claves son los `name` del formulario de la sede
    // (medidos el 15/10/2026). Los selects de provincia/municipio van por TEXTO.
    const valores = {
        TRAMITE_INICIAR: 'EE',                       // edificio existente (todo lo nuestro lo es)
        NIFCIF: String(sol['NIF'] || '').toUpperCase(), NOMBRE: sol['Nombre'], APELL1: sol['Apellido 1'], APELL2: sol['Apellido 2'],
        SEXO: sexoSol,
        SOL_TIPVIA_VIVIENDA: solVia, SOL_VIVIENDA: sol['Nombre de la vía'], SOL_NCALLE_VIVIENDA: sol['N.º Calle'],
        SOL_PORTAL_VIVIENDA: sol['Portal'], SOL_ESCALERA_VIVIENDA: sol['Escalera'], SOL_PLANTA_VIVIENDA: sol['Planta'], SOL_PUERTA_VIVIENDA: sol['Puerta'],
        CODPOS: sol['Código Postal'], TMOVIL: sol['Teléfono móvil'], EMAIL: sol['e-mail'], CALIDADSOL: calidadSol,
        SEXOREPR: sexoRep,
        REP_TIPVIA_VIVIENDA: codVia(rep['Tipo vía']), DOMICILIOREPR: rep['Nombre de la vía'], NUMCALLEREP: rep['N.º Calle'],
        PORTALREP: rep['Portal'], ESCALERAREP: rep['Escalera'], PLANTAREP: rep['Planta'], PUERTAREP: rep['Puerta'],
        CODPOSREPR: rep['Código Postal'], TMOVILREPR: rep['Teléfono móvil'], EMAILREPR: rep['e-mail'],
        AMBITO_SOL: 'I',
        USO_EDIFICIO: edi['Uso del Edificio'], TIPVIA_EDIFICIO: codVia(edi['Tipo vía']), VIVIENDA_EDIFICIO: edi['Nombre de la vía'],
        NCALLE_EDIFICIO: edi['N.º Calle'], PORTAL_EDIFICIO: edi['Portal'], ESCALERA_EDIFICIO: edi['Escalera'],
        PLANTA_EDIFICIO: edi['Planta'], PUERTA_EDIFICIO: edi['Puerta'], CODPOS_EDIFICIO: edi['Código Postal'],
        VIV_IDENT_REFCATASTRAL1: edi['Referencia catastral'],
        ...(casillas || {}),
        FECH_EMISION: aIso(cer['Fecha de emisión del certificado']), FECH_VISITA: aIso(cer['Fecha visita técnico certificador']),
        CAL_EMISIONES: cer['Calificación Emisiones CO2'], CAL_CONSUMO: cer['Calificación Consumo Energía Primaria'],
    };
    const texto = {   // selects que dependen de otro (municipio tras provincia) o van por su texto
        BLAND: sol['Provincia'], ORT01: sol['Población'],
        BLANDREPR: rep['Provincia'], ORT01REPR: rep['Población'],
        BLAND_EDIFICIO: edi['Provincia'], ORT01_EDIFICIO: edi['Población'],
        CALIDADREPR: 'Técnico competente',
    };
    // Provincia en blanco en la ficha (26RES060_221): la dicen los dos primeros dígitos del
    // código postal, que son además el `value` del desplegable de la sede («13» = Ciudad Real).
    for (const [prov, cp] of [['BLAND', 'CODPOS'], ['BLANDREPR', 'CODPOSREPR'], ['BLAND_EDIFICIO', 'CODPOS_EDIFICIO']]) {
        if (!texto[prov] && /^\d{5}$/.test(String(valores[cp] || ''))) {
            texto[`${prov}_COD`] = String(valores[cp]).slice(0, 2);
            avisos.push(`Provincia en blanco (${prov}): se elige por el código postal ${valores[cp]}.`);
        }
    }
    for (const [k, v] of Object.entries({ ...valores, ...texto })) {
        if (v === '' || v == null) delete valores[k];
    }
    const faltan = ['NIFCIF', 'NOMBRE', 'APELL1', 'SOL_VIVIENDA', 'SOL_NCALLE_VIVIENDA', 'CODPOS', 'TMOVIL', 'EMAIL',
        'USO_EDIFICIO', 'VIVIENDA_EDIFICIO', 'NCALLE_EDIFICIO', 'CODPOS_EDIFICIO', 'VIV_IDENT_REFCATASTRAL1',
        'FECH_EMISION', 'FECH_VISITA', 'CAL_EMISIONES', 'CAL_CONSUMO',
        // 02 Representante: la sede los exige por casillas y, vacíos, no deja «Pagar y enviar»
        // («En 02 Representante: Cumplimente los campos obligatorios», 26RES060_189).
        'REP_TIPVIA_VIVIENDA', 'DOMICILIOREPR', 'NUMCALLEREP', 'CODPOSREPR', 'TMOVILREPR', 'EMAILREPR',
    ].filter(k => !valores[k]);
    if (!texto.ORT01REPR) faltan.push('ORT01REPR');
    if (faltan.length) avisos.push(`Faltan datos obligatorios: ${faltan.join(', ')}`);

    // ── Ficheros: se bajan de Drive y se guardan con su NOMBRE ORIGINAL. La sede
    // pone ella sola el NIF del solicitante delante (medido en 2026CEE_63: un
    // fichero que ya lo llevaba quedó «NIF_NIF_…»).
    const dir = path.join(SCRATCH, `${numero}_${fase}`);
    fs.mkdirSync(dir, { recursive: true });
    const ficheros = {};
    const pre = borrador.nif ? `${borrador.nif}_` : '';
    for (const f of borrador.ficheros || []) {
        if (!f.presente) { if (f.clave !== 'mejoras') avisos.push(`Falta en Drive: ${f.titulo || f.clave}`); continue; }
        const { buffer, filename } = await svc.fichero(origen, row.id, fase, f.clave, optsRep);
        const nombre = filename.startsWith(pre) ? filename.slice(pre.length) : filename;
        if (esRevisar(nombre)) { avisos.push(`«${nombre}» lleva REVISAR en el nombre: no se presenta.`); continue; }
        const destino = path.join(dir, nombre);
        fs.writeFileSync(destino, buffer);
        ficheros[f.clave] = destino;
    }
    // Las recomendaciones de mejora van en el Anexo III del propio PDF firmado de
    // CE3X: sin informe aparte, se adjunta el mismo PDF en esa categoría.
    if (!ficheros.mejoras && ficheros.pdf) ficheros.mejoras = ficheros.pdf;

    // La «Fecha de emisión» que la sede compara con el XML es su <FechaGeneracion> (la que el
    // PDF imprime como «Fecha (de generación del documento)»), no la de la firma que guarda la
    // app. En 26RES060_221 el CEE se regeneró días después y la sede rechazó el XML: «La Fecha
    // de emisión del certificado no coincide con la del xml».
    if (ficheros.xml) {
        const xml = fs.readFileSync(ficheros.xml, 'latin1');
        const gen = aIso((xml.match(/<FechaGeneracion>\s*([\d/]+)/i) || [])[1]);
        const cal = aIso((xml.match(/<FechaCalificacion>\s*([\d/]+)/i) || [])[1]);
        if (gen && gen !== valores.FECH_EMISION) {
            avisos.push(`Fecha de emisión: la app dice ${valores.FECH_EMISION || '—'} pero el XML se generó el ${gen}. Se declara la del XML (la que compara la sede).`
                + (cal && cal !== gen ? ` OJO: la calificación es del ${cal}; si la sede la rechaza, hay que regenerar el CEE con una sola fecha y firmar de nuevo el PDF.` : ''));
            valores.FECH_EMISION = gen;
        }
        // Y la de VISITA, igual: la sede la compara con la <Fecha> de <Visita> del XML. En
        // 2026CEE_59 la app decía 25/10 y el XML 27/10: «La Fecha visita del xml no coincide
        // con la fecha visita técnico certificador introducida en el formulario».
        const vis = aIso((xml.match(/<Visita>[\s\S]*?<Fecha>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/Fecha>/i)
            || xml.match(/<FechaVisita>\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]);
        if (vis && vis !== valores.FECH_VISITA) {
            avisos.push(`Fecha de visita: la app dice ${valores.FECH_VISITA || '—'} pero el XML dice ${vis}. Se declara la del XML (la que compara la sede); corrígela en la app si es la buena.`);
            valores.FECH_VISITA = vis;
        }
    }

    // REGLA — un CEE cuyo XML no VALIDA no se presenta (2026-10-19, 26RES060_195): su PDF
    // lleva la marca «certificado incompleto» y el Registro lo rechaza — con la tasa pagada.
    let incompleto = null;
    if (ficheros.xml) {
        const v = await require('../services/cee/cexAPdf').validarXml(fs.readFileSync(ficheros.xml));
        if (!v.ok) {
            incompleto = v.errores;
            avisos.unshift(`⛔ CERTIFICADO INCOMPLETO, NO se presenta: ${v.errores.join(' · ')}`);
        } else if (!v.comprobado) {
            avisos.push('El XML no se ha podido validar con xml2cert en este equipo: abre el PDF y comprueba que NO lleva la marca «certificado incompleto».');
        }
    }

    if (yaRegistrado) avisos.unshift(`${numero} (${fase}) YA ESTÁ REGISTRADO: no se presenta otra vez (sería otra tasa).`);
    // El CEE de un técnico de FUERA lo presenta él (Fran, 25/10/2026): desde aquí, nunca.
    const ajeno = await tecnicoDeFuera(origen, row.id);
    if (ajeno) avisos.unshift(`${numero} (${fase}) es de ${ajeno}: lo presenta SU TÉCNICO, no la casa.`);
    // Con qué certificado firma AutoFirma en la sede: se le fija por huella (certificado.js).
    let cert = null;
    try { cert = certificadoQuePresenta(); } catch (e) { avisos.unshift(`⛔ ${e.message}: sin él la sede no se firma sola.`); }
    const listo = cert && !yaRegistrado && !ajeno && !incompleto && !faltan.length && ficheros.pdf && ficheros.xml && ficheros.cex;
    const plan = {
        numero, origen, fase, listo: !!listo,
        sede: 'http://www.jccm.es/administracion_electronica/formularios/SJM3.phtml?SER_ID=JM3&PROC=JM3&FIRMA=S',
        tasa: '16,39 € (Tarifa 18.1, octubre de 2026: el importe que manda es el que diga la sede)',
        valores, texto, ficheros,
        // Categorías del desplegable «Tipo de documento» de ANEXAR DOCUMENTOS.
        adjuntos: [
            { categoria: '3926', fichero: ficheros.pdf, que: 'PDF del certificado' },
            { categoria: '3927', fichero: ficheros.mejoras, que: 'Recomendaciones de medidas de mejora' },
            { categoria: '3928', fichero: ficheros.xml, que: 'XML' },
            { categoria: '3929', fichero: ficheros.cex, que: 'Archivo de cálculo (.cex)' },
        ].filter(a => a.fichero),
        avisos,
    };
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
    fs.writeFileSync(path.join(dir, 'rellenar.js'), scriptRellenar(valores, texto));
    if (cert) {
        fs.writeFileSync(path.join(dir, 'certificado.js'), scriptCertificado(cert.huella));
        fs.writeFileSync(path.join(dir, 'enviar.js'), scriptEnviar(cert.huella));
    }

    console.log(`${numero} · fase ${fase} · ${origen} · ${listo ? 'LISTO para presentar' : 'NO LISTO'}`);
    console.log(`Solicitante: ${sol['Nombre']} ${sol['Apellido 1']} ${sol['Apellido 2'] || ''} (${calidadSol}) · Edificio: ${edi['Uso del Edificio']} · RC ${edi['Referencia catastral']}`);
    console.log(`Representante: ${[rep['Nombre'], rep['Apellido 1'], rep['Apellido 2']].filter(Boolean).join(' ') || '—'} (${rep['NIF'] || 'sin NIF'}) · `
        + `${[valores.REP_TIPVIA_VIVIENDA,valores.DOMICILIOREPR, valores.NUMCALLEREP].filter(Boolean).join(' ')}`
        + `${valores.PLANTAREP ? ` planta ${valores.PLANTAREP}` : ''}${valores.PUERTAREP ? ` puerta ${valores.PUERTAREP}` : ''}`
        + ` · ${valores.CODPOSREPR || ''} ${texto.ORT01REPR || ''}`);
    console.log(`Certificado: emitido ${cer['Fecha de emisión del certificado']} · ${cer['Calificación Consumo Energía Primaria']}/${cer['Calificación Emisiones CO2']}`);
    if (cert) console.log(`Firma en la sede: ${textoCert(cert)}`);
    console.log('Adjuntos:'); for (const a of plan.adjuntos) console.log(`  [${a.categoria}] ${a.que}: ${path.basename(a.fichero)}`);
    if (avisos.length) { console.log('AVISOS:'); for (const a of avisos) console.log(`  ⚠️ ${a}`); }
    console.log(`\nPlan: ${path.join(dir, 'plan.json')}\nPara el navegador: ${path.join(dir, 'rellenar.js')}`
        + (cert ? `; antes de identificarse, ${path.join(dir, 'certificado.js')}; y para enviar (en vez de pulsar «Enviar»), ${path.join(dir, 'enviar.js')}` : ''));
}

// ─── El certificado con el que se firma en la sede ───────────────────────────
// La sede llama a AutoFirma sin `headless` y AutoFirma enseña su ventana para elegir
// certificado, que el navegador no puede pulsar; en el almacén de Windows hay los de
// varias personas (clientes, representantes). Se le fija el certificado por HUELLA con los
// mismos parámetros que usa la propia librería de la sede (miniapplet 1.7,
// `addSignatoryCertificateToExtraParams`: `filters=…` + `headless=true`): con un solo
// certificado que pase el filtro AutoFirma firma sin ventana, y con ninguno da error.
// El certificado es el PERSONAL de quien presenta (no uno «(R: …)» de representante).
const TITULAR_PRESENTA = (process.env.CEE_PRESENTA_TITULAR || 'MOYA LOPEZ').toUpperCase();

function certificadoQuePresenta() {
    const { execFileSync } = require('child_process');
    const huella = (process.env.CEE_PRESENTA_HUELLA || '').trim();
    const donde = huella
        ? `$_.Thumbprint -eq '${huella.replace(/[^0-9A-Fa-f]/g, '')}'`
        : `$_.Subject -match '^CN=${TITULAR_PRESENTA.replace(/[^A-Z ]/g, '')}\\b' -and $_.Subject -notmatch '\\(R:'`;
    const ps = `$c = @(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotBefore -lt (Get-Date) -and $_.NotAfter -gt (Get-Date) -and ${donde} } | Sort-Object NotAfter -Descending); `
        + `if ($c.Count) { [pscustomobject]@{ huella = $c[0].Thumbprint; nombre = $c[0].GetNameInfo('SimpleName', $false); emisor = $c[0].GetNameInfo('SimpleName', $true); caduca = $c[0].NotAfter.ToString('dd/MM/yyyy'); hay = $c.Count } | ConvertTo-Json -Compress }`;
    let out = '';
    try { out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim(); } catch { /* sin PowerShell: no es el PC */ }
    const c = out ? JSON.parse(out) : null;
    if (!c || !/^[0-9A-F]{40}$/i.test(c.huella)) {
        throw new Error(huella ? `No encuentro vigente en el almacén de Windows el certificado de CEE_PRESENTA_HUELLA`
            : `No encuentro vigente en el almacén de Windows el certificado personal de ${TITULAR_PRESENTA}`);
    }
    // El nombre del certificado de la FNMT lleva el NIF al final: no se enseña.
    c.nombre = String(c.nombre).replace(/\s*-\s*[0-9XYZ]\d{7}[A-Z]$/i, '');
    return c;
}

const textoCert = (c) => `${c.nombre} (${c.emisor}, hasta ${c.caduca})${c.hay > 1 ? ` · hay ${c.hay} vigentes: el que caduca más tarde` : ''}`;

/**
 * El trozo común de certificado.js y enviar.js: `fijar(w)` envuelve las llamadas de
 * MiniApplet/AutoScript de la ventana `w` para que lleven el filtro por huella y
 * `headless=true`, y devuelve cuántas librerías quedan fijadas.
 */
function codigoFijar(huella) {
    return `const H = ${JSON.stringify(huella.toUpperCase())};
const conFiltro = (p) => String(p || '').split('\\n').filter(l => l && !/^(filters?[=.]|headless=)/.test(l))
  .concat(['filters=thumbprint:SHA1:' + H, 'headless=true']).join('\\n');
// Dónde va «extraParams»: justo antes del primer callback, salvo signAndSaveToFile (le sigue el nombre del fichero).
const OPS = ['sign', 'coSign', 'cosign', 'counterSign', 'countersign', 'signBatch', 'selectCertificate', 'signAndSaveToFile'];
const fijar = (w) => {
  let n = 0;
  for (const lib of [w.MiniApplet, w.AutoScript].filter(Boolean)) {
    if (lib.__certFijado === H) { n++; continue; }
    for (const op of OPS) {
      const orig = lib[op]; if (typeof orig !== 'function') continue;
      lib[op] = function (...a) {
        let i = op === 'signAndSaveToFile' ? 4 : a.findIndex(x => typeof x === 'function') - 1;
        if (i < 0) i = a.length;
        a[i] = conFiltro(a[i]);
        w.__firmasConFiltro = (w.__firmasConFiltro || 0) + 1;
        if (w !== window) window.__firmasConFiltro = (window.__firmasConFiltro || 0) + 1;
        return orig.apply(this, a);
      };
    }
    lib.__certFijado = H; n++;
  }
  return n;
};`;
}

/**
 * El código que se ejecuta en la página de la sede JUSTO ANTES de la firma de
 * IDENTIFICARSE (cada recarga lo borra). Para la de «Enviar», enviar.js.
 */
function scriptCertificado(huella) {
    return `// Generado por presentar_cee.js: fija el certificado de la firma. Pegar en javascript_tool ANTES de firmar.
(() => {
${codigoFijar(huella)}
if (!window.MiniApplet && !window.AutoScript) return 'REVISAR: la página no tiene MiniApplet ni AutoScript';
const n = fijar(window);
return 'OK: certificado fijado por huella ' + H.slice(0, 6) + '… en ' + n + ' librería(s)';
})()`;
}

/**
 * El código que ENVÍA la solicitud (en lugar de pulsar «Enviar»), con la 046 ya escrita.
 * REGLA — la firma de «Enviar» no la arregla certificado.js (27/10/2026, 2026CEE_59): al
 * pulsar «Enviar» la sede manda el formulario y la página que DEVUELVE —con el XML a
 * firmar— llama nada más cargarse a `firmarDatosMA()` (alert + MiniApplet.sign), así que
 * el filtro pegado antes se pierde con la recarga y AutoFirma abre su ventana (el
 * vigilante la cancela: «No se han podido firmar los datos del formulario»). Aquí el
 * formulario se envía, con su codificación de siempre, a un MARCO de la misma página, y un
 * vigía de 1 ms fija el certificado en la librería del marco en cuanto aparece, antes de que
 * su página llegue a firmar. El aviso «Se van a firmar…» sale igual (escritorio.ps1 aviso);
 * el número de registro y el enlace del justificante quedan en el marco: `__resultadoEnvio()`.
 */
function scriptEnviar(huella) {
    return `// Generado por presentar_cee.js: envía la solicitud con el certificado fijado. Pegar en javascript_tool en vez de pulsar «Enviar».
(() => {
${codigoFijar(huella)}
const ref = (document.getElementsByName('REFERENCIA_PAGO')[0] || {}).value || '';
if (!/^046\\d{10}$/.test(ref)) return 'REVISAR: falta la referencia 046 del pago (13 dígitos) en REFERENCIA_PAGO';
const f = document.FORMPROC, btn = document.getElementById('ENVIAR');
if (!f || !btn) return 'REVISAR: no encuentro el formulario FORMPROC o el botón ENVIAR';
let ifr = document.getElementById('__resp');
if (!ifr) {
  ifr = document.createElement('iframe'); ifr.name = '__resp'; ifr.id = '__resp';
  ifr.style.cssText = 'width:100%;height:700px;border:3px solid #c00';
  document.body.prepend(ifr);
}
clearInterval(window.__vigia);
window.__vigia = setInterval(() => { try { const w = ifr.contentWindow; if (w && (w.MiniApplet || w.AutoScript)) fijar(w); } catch (e) {} }, 1);
window.__resultadoEnvio = () => {
  let d = null; try { d = ifr.contentDocument; } catch (e) {}
  const t = d && d.body ? d.body.innerText : '';
  const m = t.match(/n[uú]mero de registro\\s+(\\d+\\/\\d{4})\\s+solicitado el\\s+([\\d/]+)\\s+a las\\s+([\\d:]+)/i);
  const pdf = d ? [...d.querySelectorAll('a')].find(a => /creaPDF/i.test(a.href || '')) : null;
  return { firmasConFiltro: window.__firmasConFiltro || 0, registro: m ? m[1] : null, fecha: m ? m[2] : null, hora: m ? m[3] : null,
    justificante: !!pdf, error: (t.match(/[^\\n]*(no se ha podido|error)[^\\n]*/i) || [null])[0] };
};
window.__bajarJustificante = () => { const d = ifr.contentDocument; const a = [...d.querySelectorAll('a')].find(a => /creaPDF/i.test(a.href || '')); if (!a) return 'SIN ENLACE'; a.click(); return 'descargando'; };
f.target = '__resp';
setTimeout(() => f.requestSubmit(btn), 150);
return 'OK: solicitud enviada al marco con el certificado ' + H.slice(0, 6) + '… vigilado; acepta el aviso «Se van a firmar…» (escritorio.ps1 aviso)';
})()`;
}

/**
 * El código que se ejecuta en la página de la sede (javascript_tool), DESPUÉS de
 * haber marcado «Es representante» (que recarga la página). Rellena por `name`,
 * dispara los `change` de jQuery que cargan los municipios, espera y elige el
 * municipio por TEXTO. No adjunta, no pulsa «Añadir Referencia» ni envía.
 */
function scriptRellenar(valores, texto) {
    // La referencia catastral NO la escribe el script: hay que TECLEARLA y pulsar «Añadir
    // Referencia» con clics reales justo antes del XML. Puesta por JavaScript sale en la
    // lista pero la sede no la cuenta al validar el XML (medido en 2026CEE_64).
    const { VIV_IDENT_REFCATASTRAL1: _rc, ...sinRc } = valores;
    return `// Generado por scripts/presentar_cee.js — pegar en javascript_tool de la pestaña de la sede.
await (async () => {
const V = ${JSON.stringify(sinRc)};
const T = ${JSON.stringify(texto)};
const $ = window.jQuery; const out = [];
const el = (n) => document.getElementsByName(n);
const norm = (s) => String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().trim();
for (const [n, v] of Object.entries(V)) {
  const e = el(n); if (!e.length) { out.push('NO EXISTE ' + n); continue; }
  if (e[0].type === 'radio') { const r = [...e].find(x => x.value === v); if (r && !r.disabled) { r.click(); } else out.push('radio ' + n + '=' + v + (r ? ' deshabilitado' : ' no existe')); continue; }
  $(e[0]).val(v).trigger('input').trigger('change');
}
const pick = (n, txt, empieza) => { const s = el(n)[0]; if (!s) return out.push('NO EXISTE ' + n);
  const o = [...s.options].find(o => empieza ? norm(o.text).startsWith(norm(txt)) : norm(o.text) === norm(txt));
  if (!o) return out.push('SIN OPCION ' + n + '=' + txt); $(s).val(o.value).trigger('change'); };
// La sede escribe «Solana (La)» donde la app dice «LA SOLANA»: se prueban las dos formas.
const conArticulo = (txt) => { const m = norm(txt).match(/^(LA|EL|LOS|LAS) (.+)$/); return m ? m[2] + ' (' + m[1] + ')' : txt; };
const pickMuni = (n, txt) => { const s = el(n)[0]; if (!s) return out.push('NO EXISTE ' + n);
  const o = [...s.options].find(o => norm(o.text) === norm(txt)) || [...s.options].find(o => norm(o.text) === norm(conArticulo(txt)));
  if (!o) return out.push('SIN OPCION ' + n + '=' + txt); $(s).val(o.value).trigger('change'); };
for (const n of ['BLAND','BLANDREPR','BLAND_EDIFICIO']) { if (T[n]) pick(n, T[n]); else if (T[n + '_COD']) $(el(n)[0]).val(T[n + '_COD']).trigger('change'); }
if (T.CALIDADREPR) pick('CALIDADREPR', T.CALIDADREPR, true);
await new Promise(r => setTimeout(r, 2500));
for (const n of ['ORT01','ORT01REPR','ORT01_EDIFICIO']) if (T[n]) pickMuni(n, T[n]);
// Las casillas dependientes (Unifamiliar, Bloque…) se habilitan tras TIPO_EDIFICIO: segunda pasada.
for (const n of ['TIPO_VIVIENDA','TIPO_BLOQUE','TIPO_TERCIARIO']) if (V[n]) { const r = [...el(n)].find(x => x.value === V[n]); if (r && !r.checked) r.click(); }
const chk = (n, on) => { const e = el(n)[0]; if (e && e.checked !== on) e.click(); };
chk('ACR_CIERTO_1', true); chk('AUTORIZA1', false);
for (const n of ['DOC_1','DOC_2','DOC_3','DOC_4']) chk(n, true); chk('DOC_5', false);
// Lo que no ha tomado su valor (un tipo de vía sin esa opción, una casilla que la sede
// deshabilita) se dice aquí: si no, se descubre en «Pagar y enviar» (26RES060_189, el 02).
for (const [n, v] of Object.entries(V)) { const e = el(n)[0]; if (!e || e.type === 'radio' || e.type === 'checkbox') continue;
  if (String(e.value) !== String(v)) out.push('NO TOMA ' + n + '=' + v + ' (queda «' + e.value + '»)'); }
for (const n of ['BLANDREPR','ORT01REPR']) { const e = el(n)[0]; if (e && (T[n] || T[n + '_COD']) && !e.value) out.push('VACÍO ' + n); }
return out.length ? 'REVISAR: ' + out.join(' | ') : 'OK: rellenado';
})()`;
}

// ─── devuelto ────────────────────────────────────────────────────────────────
// Lo mismo que hace la página de presentar (presentacionCeeService.subirDevuelto)
// sin token, y contado como Fran: el justificante va a la casilla «registro» (lee
// la fecha, marca REGISTRADO, avanza el estado) y la tasa a OTROS como «{nº} – TASA».
async function devuelto(numero) {
    const reg = opt('registro'), tasa = opt('tasa');
    if (!reg) throw new Error('Falta --registro <pdf del justificante de la sede>');
    const { origen, row } = await localizar(numero);
    const bReg = fs.readFileSync(reg);
    const bTasa = tasa ? fs.readFileSync(tasa) : null;
    console.log(`${numero} (${origen}) · fase ${fase} · seguimiento ${JSON.stringify(row.seguimiento)}`);

    if (!flag('escribir')) {
        const { resolverFechaRegistro } = require('../services/registroCeeOcrService');
        const l = await resolverFechaRegistro(bReg);
        console.log('EN SECO · del justificante se lee:', JSON.stringify(l));
        console.log('Con --escribir: sube el justificante, marca REGISTRADO' + (bTasa ? ' y sube la tasa como «… – TASA».' : '.'));
        return;
    }

    // Por defecto lo sube el SERVIDOR (la ruta interna de presentacionCeeRutas): es el que
    // tiene el WhatsApp conectado y las variables de los avisos, así que llegan los mismos
    // avisos que cuando sube el certificador. Desde el PC (`--local`) no sale ninguno.
    if (!flag('local')) {
        const base = (process.env.PRESENTAR_API || 'https://app.brokergy.es').replace(/\/+$/, '');
        const negocio = origen === 'cee_directo' ? 'cee-directos' : 'expedientes';
        const subir = async (tipo, buffer, nombre) => {
            const fd = new FormData();
            fd.append('file', new Blob([buffer], { type: 'application/pdf' }), nombre);
            fd.append('quien', QUIEN.texto);
            const r = await fetch(`${base}/api/${negocio}/${row.id}/presentacion-cee/devuelto?fase=${fase}&tipo=${tipo}`,
                { method: 'POST', headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' }, body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(`${base} respondió ${r.status} al subir ${tipo}: ${j.error || '¿está desplegada la ruta /presentacion-cee/devuelto?'} (con --local se sube desde el PC, sin avisos)`);
            return j;
        };
        const r1 = await subir('registro', bReg, path.basename(reg));
        console.log('REGISTRO (servidor):', r1.name, '· registrado', r1.registrado, '· fecha', r1.fecha_registro, r1.aviso_fecha ? `· ⚠️ ${r1.aviso_fecha}` : '');
        // CEE inicial: el servidor avisa solo al cliente y al instalador (ceeRegistradoAviso).
        if (r1.aviso_cliente) console.log('AVISO (servidor):', r1.aviso_cliente.texto || r1.aviso_cliente.reason);
        if (bTasa) { const r2 = await subir('tasa', bTasa, path.basename(tasa)); console.log('TASA (servidor):', r2.name); }
        return;
    }

    const { subirCae, subirCeeDirecto } = require('../services/cee/subidaCeePublica');
    const r = origen === 'cee_directo'
        ? await subirCeeDirecto({ id: row.id, fase, slot: 'registro', buffer: bReg, mimetype: 'application/pdf', quien: QUIEN })
        : await subirCae({ expedienteId: row.id, fase, slot: 'registro', buffer: bReg, mimetype: 'application/pdf', quien: QUIEN });
    console.log('REGISTRO:', r.name, '· registrado', r.registrado, '· fecha', r.fecha_registro, r.aviso_fecha ? `· ⚠️ ${r.aviso_fecha}` : '');

    if (bTasa) {
        if (origen === 'cee_directo') {
            const fila = await require('../services/ceeDirectoService').cargar(row.id, { conRelaciones: false });
            const up = await require('../services/ceeDirectoUploadService').uploadFile(fila, fase, null, bTasa, 'application/pdf', { nombreLibre: 'TASA.pdf' });
            await require('../services/ceeDirectoService').anotarHistorial(row.id, { tipo: 'CEE', texto: `🧾 ${QUIEN.texto} ha subido el recibo de la tasa del CEE ${fase}.`, usuario: QUIEN.usuario });
            console.log('TASA:', up.fileName);
        } else {
            const ceeUploadService = require('../services/ceeUploadService');
            const driveService = require('../services/driveService');
            const { data: exp } = await supabase.from('expedientes').select('*').eq('id', row.id).maybeSingle();
            const raiz = await ceeUploadService.resolveDriveFolderId(exp);
            const { id: carpeta } = await ceeUploadService.ensureCeeSectionFolder(raiz, fase);
            const fileName = `${numero} – TASA.pdf`;
            const prev = await driveService.findFileByName(carpeta, fileName);
            if (prev) await driveService.archiveExistingToOld(carpeta, prev, fileName);
            await driveService.saveFileToFolder(carpeta, fileName, 'application/pdf', bTasa, { throwOnError: true });
            console.log('TASA:', fileName);
        }
    }

    // El encargo de presentación (si lo había) queda cerrado, como al subirlo Eva.
    const tabla = origen === 'cee_directo' ? 'cee_directos' : 'expedientes';
    const { data: f } = await supabase.from(tabla).select(`${origen === 'cee_directo' ? 'alcance, ' : ''}seguimiento, presentacion:cee->presentacion`).eq('id', row.id).maybeSingle();
    if (f?.presentacion?.[fase]) {
        const pres = { ...f.presentacion, [fase]: { ...f.presentacion[fase], registrado_at: new Date().toISOString() } };
        const { error } = origen === 'cee_directo'
            ? await supabase.rpc('set_cee_directo_cee_field', { p_cee_directo_id: row.id, p_field: 'presentacion', p_value: pres })
            : await supabase.rpc('set_expediente_cee_field', { p_expediente_id: row.id, p_field: 'presentacion', p_value: pres });
        if (error) console.warn('⚠️ No se pudo cerrar el encargo:', error.message);
        if (origen === 'cee_directo') {
            const estado = require('../utils/ceeDirectoEstados').deriveEstado({ alcance: f.alcance, seguimiento: f.seguimiento, presentacion: pres });
            await supabase.from('cee_directos').update({ estado }).eq('id', row.id);
            console.log('ENCARGO cerrado · estado →', estado);
        } else console.log('ENCARGO cerrado');
    }
    await new Promise(r => setTimeout(r, 3000)); // deja salir los avisos asíncronos
}

// ─── notificaciones ──────────────────────────────────────────────────────────
// Lo que llega DESPUÉS del registro por notifica.jccm.es: tres notificaciones por
// certificado (Resolución de Inscripción · EtiquetaCEE · Oficio FEE). Cada PDF que baja
// la plataforma es un ENVOLTORIO con el documento de verdad como fichero ADJUNTO dentro:
// se extrae, se comprueba que es de ESTE certificado (su referencia catastral) y se sube:
// la etiqueta a su casilla y las dos resoluciones a OTROS. Por el servidor, como el registro.
async function adjuntosDe(pdfPath) {
    const pdfjs = await import(require('url').pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), verbosity: 0 }).promise;
    const portada = (await (await doc.getPage(1)).getTextContent()).items.map(x => x.str).join(' ');
    const expSede = (portada.match(/expediente:\s*([\d/]+\s*\(\d+\))/i) || [])[1] || null;
    const at = Object.values((await doc.getAttachments()) || {});
    if (!at.length) throw new Error(`${path.basename(pdfPath)} no lleva ningún documento adjunto`);
    const a = at[0];
    const buffer = Buffer.from(a.content);
    const dentro = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    let texto = '';
    for (let i = 1; i <= dentro.numPages; i++) texto += (await (await dentro.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + ' ';
    return { buffer, nombre: a.filename, expSede, texto: texto.replace(/\s+/g, ' ') };
}

async function notificaciones(numero) {
    const piezas = [['etiqueta', opt('etiqueta'), null], ['otros', opt('resolucion'), 'RESOLUCIÓN DE INSCRIPCIÓN'], ['otros', opt('oficio'), 'OFICIO FEE']]
        .filter(([, f]) => f);
    if (!piezas.length) throw new Error('Pasa al menos --etiqueta <pdf> (y --resolucion <pdf> --oficio <pdf>)');
    const { origen, row } = await localizar(numero);
    const { borrador } = await require('../services/borradorCeeService').componer(origen, row.id, fase);
    const rc = (campos((borrador.apartados || []).find(a => a.id === '05'))['Referencia catastral'] || '').toUpperCase();
    if (!rc) throw new Error(`${numero}: no sé su referencia catastral para comprobar los documentos`);

    const listos = [];
    const sedes = new Set();
    for (const [tipo, f, rotulo] of piezas) {
        const d = await adjuntosDe(f);
        const ok = d.texto.toUpperCase().includes(rc.slice(0, 14));
        console.log(`${path.basename(f)} → «${d.nombre}» · expediente sede ${d.expSede || '?'} · ${ok ? `RC ${rc.slice(0, 14)} ✓` : 'RC NO COINCIDE'}`);
        if (!ok) throw new Error(`«${d.nombre}» no es de ${numero} (no aparece su referencia ${rc.slice(0, 14)}). No se sube nada.`);
        if (d.expSede) sedes.add(d.expSede);
        listos.push({ tipo, buffer: d.buffer, nombre: tipo === 'etiqueta' ? 'etiqueta.pdf' : `${rotulo}.pdf` });
    }
    if (sedes.size > 1) throw new Error(`Los documentos son de expedientes de la sede distintos (${[...sedes].join(', ')}). No se sube nada.`);
    if (!flag('escribir')) { console.log('EN SECO · con --escribir: etiqueta a su casilla y resoluciones a OTROS.'); return; }

    if (!flag('local')) {
        const base = (process.env.PRESENTAR_API || 'https://app.brokergy.es').replace(/\/+$/, '');
        const negocio = origen === 'cee_directo' ? 'cee-directos' : 'expedientes';
        for (const p of listos) {
            const fd = new FormData();
            fd.append('file', new Blob([p.buffer], { type: 'application/pdf' }), p.nombre);
            fd.append('quien', QUIEN.texto);
            const r = await fetch(`${base}/api/${negocio}/${row.id}/presentacion-cee/devuelto?fase=${fase}&tipo=${p.tipo}`,
                { method: 'POST', headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' }, body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(`${base} respondió ${r.status} con ${p.nombre}: ${j.error || '?'} (¿desplegado el tipo «${p.tipo}»? con --local se sube desde el PC)`);
            console.log(`${p.tipo.toUpperCase()} (servidor):`, j.name);
        }
        return;
    }
    const svc = require('../services/presentacionCeeService');
    for (const p of listos) {
        const r = await svc.subirDevueltoInterno(origen, row.id, fase, { tipo: p.tipo, buffer: p.buffer, mimetype: 'application/pdf', nombreOriginal: p.nombre, quien: QUIEN.texto });
        console.log(`${p.tipo.toUpperCase()} (local):`, r.name);
    }
    await new Promise(r => setTimeout(r, 3000));
}

// ─── main ────────────────────────────────────────────────────────────────────
// `listaPendientes` la usa también la ronda de las 21:00 (asistente_pc.js noche).
module.exports = { listaPendientes };
if (require.main === module) (async () => {
    if (orden === 'pendientes') await pendientes();
    else if (orden === 'preparar' && args[1]) await preparar(args[1]);
    else if (orden === 'devuelto' && args[1]) await devuelto(args[1]);
    else if (orden === 'notificaciones' && args[1]) await notificaciones(args[1]);
    else if (orden === 'certificado') {
        // Solo dice con qué certificado se firmaría y deja certificado.js suelto (para probar).
        const c = certificadoQuePresenta();
        fs.mkdirSync(SCRATCH, { recursive: true });
        fs.writeFileSync(path.join(SCRATCH, 'certificado.js'), scriptCertificado(c.huella));
        fs.writeFileSync(path.join(SCRATCH, 'enviar.js'), scriptEnviar(c.huella));
        console.log(`Firma en la sede: ${textoCert(c)}\n${path.join(SCRATCH, 'certificado.js')}\n${path.join(SCRATCH, 'enviar.js')}`);
    }
    else {
        console.log('Uso:\n  node scripts/presentar_cee.js pendientes\n  node scripts/presentar_cee.js certificado\n  node scripts/presentar_cee.js preparar <nº> [--fase inicial|final]\n'
            + '  node scripts/presentar_cee.js devuelto <nº> --registro <pdf> [--tasa <pdf>] [--fase …] [--escribir]');
        process.exitCode = 1;
    }
    process.exit(process.exitCode || 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

