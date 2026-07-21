// ============================================================================
// cifoService.js — Generación AUTOMÁTICA (server-side) del Certificado CIFO
// (RES060 / RES093), para que un agente (skill de Cowork / tool MCP) o la propia
// app dejen el documento en "6. ANEXOS CAE" y enlazado en su slot
// (documentacion.cert_cifo_drive_link), listo para revisar/firmar — el MISMO
// resultado que "Guardar en Drive" desde el modal del expediente.
//
// FUENTE ÚNICA del diseño: importa el módulo del frontend
// features/expedientes/logic/cifoDoc.js por import() dinámico ESM (igual que
// expedienteFinancialsNode importa calculation.js). Así el PDF sale IDÉNTICO por
// app y por generación automática: no hay plantilla duplicada.
//
// Política de incidencias (acordada): LEVE para lo que falta pero no impide
// generar; GRAVE (y NO se genera) solo si el CIFO sería inválido por
// construcción (sin demanda/superficie, sin SCOP, sin empresa instaladora,
// sin carpeta de Drive).
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const pdfService = require('./pdfService');
const { getUnidades: getUnidadesAero, unidadesSinSerie } = require('../utils/aerotermiaUnits');

const SUBCARPETA_ANEXOS = '6. ANEXOS CAE';
const SUBCARPETA_FT = '3. FICHAS TÉCNICAS Y CERTIFICACIONES';
// Origen absoluto para los assets del PDF (portada + fuentes). Puppeteer los
// descarga por HTTP (setContent → base about:blank, las rutas relativas no
// cargan). app.brokergy.es sirve /assets y /fonts públicamente.
const ASSET_URL = process.env.CIFO_ASSET_URL || process.env.VITE_APP_URL || 'https://app.brokergy.es';

// ─── Imports ESM diferidos de los módulos puros del frontend ─────────────────
let _cifoDocPromise = null;
function loadCifoDoc() {
    if (!_cifoDocPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/cifoDoc.js')).href;
        _cifoDocPromise = import(url);
    }
    return _cifoDocPromise;
}
let _calcPromise = null;
function loadCalc() {
    if (!_calcPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/calculator/logic/calculation.js')).href;
        _calcPromise = import(url);
    }
    return _calcPromise;
}
let _res080DocPromise = null;
function loadRes080Doc() {
    if (!_res080DocPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/res080Doc.js')).href;
        _res080DocPromise = import(url);
    }
    return _res080DocPromise;
}

// Parser de huecos/opacos del XML del CEE (equivalente Node de getHuecosFromXml,
// que en el frontend usa DOMParser). Solo se usa como fallback cuando el cee NO
// trae ya los arrays huecos/opacos. Devuelve [{nombre,tipo,superficie,transmitancia,
// factorSolar,orientacion}]. Async (xml2js).
async function parseHuecosFromXmlNode(xmlStr) {
    if (!xmlStr || typeof xmlStr !== 'string') return [];
    try {
        const xml2js = require('xml2js');
        const parsed = await xml2js.parseStringPromise(xmlStr, { explicitArray: false, ignoreAttrs: false });
        const out = [];
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            for (const [key, val] of Object.entries(node)) {
                if (key.toLowerCase() === 'elemento') {
                    const arr = Array.isArray(val) ? val : [val];
                    for (const el of arr) collect(el);
                } else if (val && typeof val === 'object') {
                    walk(val);
                }
            }
        };
        const txt = (el, tag) => {
            const k = Object.keys(el || {}).find(x => x.toLowerCase() === tag.toLowerCase());
            const v = k ? el[k] : undefined;
            return (typeof v === 'string' ? v : (v && v._) || '').trim();
        };
        const num = (el, tag) => parseFloat((txt(el, tag) || '0').replace(',', '.')) || 0;
        const collect = (el) => {
            const tipo = txt(el, 'Tipo').toLowerCase();
            if (tipo === 'hueco') {
                out.push({ nombre: txt(el, 'Nombre') || 'Desconocido', tipo: 'Hueco', superficie: num(el, 'Superficie'), transmitancia: num(el, 'Transmitancia'), factorSolar: num(el, 'FactorSolar'), orientacion: txt(el, 'Orientacion') || 'Desconocida' });
            } else if (['fachada', 'cubierta', 'suelo', 'particioninteriorvertical', 'particioninteriorhorizontal'].includes(tipo)) {
                out.push({ nombre: txt(el, 'Nombre') || 'Desconocido', tipo: txt(el, 'Tipo') || 'Desconocido', superficie: num(el, 'Superficie'), transmitancia: num(el, 'Transmitancia'), orientacion: txt(el, 'Orientacion') || 'Desconocida' });
            }
        };
        walk(parsed);
        return out;
    } catch (e) {
        console.warn('[cifoService] parseHuecosFromXmlNode falló:', e.message);
        return [];
    }
}

// Asegura que cee.cee_inicial/final tengan huecos/opacos (pre-parseados desde XML
// si faltan) — así deriveRes080Data no necesita parser síncrono.
async function ensureHuecosParsed(cee) {
    const need = (obj, xml) => obj && (!obj.huecos || !obj.opacos) && xml;
    if (need(cee.cee_inicial, cee.xml_inicial)) {
        const all = await parseHuecosFromXmlNode(cee.xml_inicial);
        cee.cee_inicial.huecos = cee.cee_inicial.huecos || all.filter(e => e.tipo === 'Hueco');
        cee.cee_inicial.opacos = cee.cee_inicial.opacos || all.filter(e => e.tipo !== 'Hueco');
    }
    if (need(cee.cee_final, cee.xml_final)) {
        const all = await parseHuecosFromXmlNode(cee.xml_final);
        cee.cee_final.huecos = cee.cee_final.huecos || all.filter(e => e.tipo === 'Hueco');
        cee.cee_final.opacos = cee.cee_final.opacos || all.filter(e => e.tipo !== 'Hueco');
    }
}

// Resultado energético RES080 (details + EFi/EFf + AETOTAL) — espejo de la rama
// RES080 de calcResults en ExpedienteDetailView.
async function computeRes080Results(exp) {
    const { calculateRes080, calculateRes080FromEmissions } = await loadCalc();
    const cee = exp.cee || {};
    const ceeSourceManual = String(cee.cee_source || '').toLowerCase() === 'manual';
    let res080 = null;
    if (ceeSourceManual && cee.emisiones_manual) {
        const em = cee.emisiones_manual;
        const supFallback = cee.superficie_manual || exp.oportunidades?.datos_calculo?.surface;
        res080 = calculateRes080FromEmissions({
            emiAcsIni: em.acs_ini, emiAcsFin: em.acs_fin, emiCalIni: em.cal_ini, emiCalFin: em.cal_fin,
            emiRefIni: em.ref_ini, emiRefFin: em.ref_fin,
            combAcsInicial: cee.comb_acs_inicial, combAcsFinal: cee.comb_acs_final,
            combCalefaccionInicial: cee.comb_cal_inicial, combCalefaccionFinal: cee.comb_cal_final,
            combRefrigeracionInicial: cee.comb_ref_inicial, combRefrigeracionFinal: cee.comb_ref_final,
            superficieInicial: cee.superficie_manual_inicial || supFallback,
            superficieFinal: cee.superficie_manual_final || cee.superficie_manual_inicial || supFallback,
        });
    } else if (cee.cee_inicial && cee.cee_final) {
        res080 = calculateRes080({
            xmlInicial: cee.cee_inicial, xmlFinal: cee.cee_final,
            combAcsInicial: cee.comb_acs_inicial, combAcsFinal: cee.comb_acs_final,
            combCalefaccionInicial: cee.comb_cal_inicial, combCalefaccionFinal: cee.comb_cal_final,
            combRefrigeracionInicial: cee.comb_ref_inicial, combRefrigeracionFinal: cee.comb_ref_final,
            superficieCustom: cee.superficie_custom,
        });
    }
    return res080;
}

// Extrae el fileId de Drive de un enlace (…/file/d/<ID>/…, …?id=<ID>, o el ID pelado).
function driveIdFromLink(link) {
    if (!link) return null;
    const s = String(link);
    const m = s.match(/[-\w]{25,}/);
    return m ? m[0] : null;
}

// ─── Carga del expediente con los MISMOS joins que GET /api/expedientes/:id ───
// (clientes, oportunidades, prescriptor instalador). Devuelve el objeto que
// espera deriveCifoData/buildCifoHtml.
async function loadExpedientePayload(numeroOrId) {
    let { data: simple } = await supabase.from('expedientes').select('*').eq('id', numeroOrId).maybeSingle();
    if (!simple) {
        const clean = String(numeroOrId).replace(/\s/g, '');
        const { data } = await supabase.from('expedientes')
            .select('*').ilike('numero_expediente', `%${clean}%`);
        if (data && data.length === 1) simple = data[0];
        else if (data && data.length > 1) return { ambiguous: data.map(d => d.numero_expediente) };
    }
    if (!simple) return { notFound: true };

    const [{ data: cli }, { data: op }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', simple.cliente_id).maybeSingle(),
        supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, prescriptor_id, instalador_asociado_id').eq('id', simple.oportunidad_id).maybeSingle(),
    ]);

    let assignedPrescriptor = null;
    const targetInstId = simple.instalacion?.instalador_id || simple.instalador_asociado_id || op?.instalador_asociado_id || op?.prescriptor_id;
    if (targetInstId) {
        const { data: presInfo } = await supabase.from('prescriptores').select('*').eq('id_empresa', targetInstId).maybeSingle();
        if (presInfo) assignedPrescriptor = presInfo;
    }

    const payload = { ...simple, clientes: cli || null, oportunidades: op || null, prescriptores: assignedPrescriptor };
    return { exp: payload, op: op || {}, simple };
}

function resolveTipologia(exp, op) {
    let ficha = op?.ficha || 'RES060';
    if (exp.numero_expediente?.includes('RES080')) ficha = 'RES080';
    else if (exp.numero_expediente?.includes('RES093')) ficha = 'RES093';
    else if (exp.numero_expediente?.includes('RES060')) ficha = 'RES060';
    return ficha;
}

// ─── Ahorro AE_TOTAL (savingsKwh) — espejo EXACTO de calcResults (final-first) ──
async function computeSavingsKwh(exp, op) {
    const { calculateSavings, calculateRes080, calculateRes080FromEmissions, calculateHybridization, BOILER_EFFICIENCIES } = await loadCalc();
    const ficha = resolveTipologia(exp, op);
    const cee = exp.cee || {};
    const inst = exp.instalacion || {};
    const calcInputs = op?.datos_calculo?.inputs || {};
    let savings = null;

    if (ficha === 'RES060' || ficha === 'RES093') {
        const ceeFinalValido = cee.cee_final && parseFloat(cee.cee_final.demandaCalefaccion) > 0;
        const ceeBase = ceeFinalValido ? cee.cee_final : (cee.cee_inicial || cee.cee_final || {});
        const superficie = parseFloat(ceeBase.superficieHabitable) || parseFloat(op?.datos_calculo?.surface) || 0;
        const q_net_heating = (parseFloat(ceeBase.demandaCalefaccion) || 0) * superficie || parseFloat(op?.datos_calculo?.Q_net) || 0;

        let dacs = 0;
        if (cee.acs_method === 'cte') {
            const numPeople = (parseInt(cee.num_rooms) || 4) + 1;
            dacs = 28 * numPeople * 0.001162 * 365 * 46;
        } else {
            dacs = (parseFloat(ceeBase.demandaACS) || 0) * superficie || parseFloat(op?.datos_calculo?.demand_acs) || 0;
        }

        if (superficie > 0 && q_net_heating > 0) {
            const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
            const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
            const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
            const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);
            let cb = 1;
            const hibridActive = (inst.hibridacion ?? calcInputs.hibridacion) ?? (ficha === 'RES093');
            if (hibridActive) {
                const hybridRes = calculateHybridization({
                    demandAnnual: q_net_heating,
                    zone: op?.datos_calculo?.zona || 'D3',
                    heatPumpPower: parseFloat(inst.potencia_bomba || calcInputs.potenciaBomba) || 0,
                });
                cb = hybridRes.cb;
            }
            const changeAcsFlag = inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs?.aerotermia_db_id);
            savings = calculateSavings({
                q_net_heating,
                dacs: inst.cambio_acs !== false ? dacs : 0,
                boilerEff: boilerEffValue,
                scopHeating, scopAcs, cb,
                changeAcs: changeAcsFlag,
            });
        }
    }
    // RES080 no se genera por esta vía (Certificado Final de Obra, plantilla propia).
    return savings?.savingsKwh || 0;
}

// ─── Anexos: FT de calefacción (+ ACS si aplica) + extras del CIFO ────────────
function resolveAnnexAttachments(exp) {
    const doc = exp.documentacion || {};
    const inst = exp.instalacion || {};
    const tieneAcs = inst.cambio_acs !== false;
    const attachments = [];
    const driveIds = [];

    const ftCalId = doc.ft_aerotermia_cal_id || driveIdFromLink(doc.ft_aerotermia_cal_link);
    if (ftCalId) {
        attachments.push({ id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: { driveId: ftCalId } });
        driveIds.push(ftCalId);
    }
    if (tieneAcs) {
        const ftAcsId = doc.ft_aerotermia_acs_id || driveIdFromLink(doc.ft_aerotermia_acs_link);
        if (ftAcsId) {
            attachments.push({ id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: { driveId: ftAcsId } });
            driveIds.push(ftAcsId);
        }
    }
    for (const ex of (Array.isArray(doc.cifo_extra_annexes) ? doc.cifo_extra_annexes : [])) {
        const id = ex.driveId || driveIdFromLink(ex.link);
        if (id) {
            attachments.push({ id: `extra_${id}`, label: ex.label || ex.fileName || 'Documento anexo', file: { driveId: id } });
            driveIds.push(id);
        }
    }
    return { attachments, driveIds, tieneAcs };
}

// ─── Ensamblado AUTOMÁTICO de los anexos que justifican el SCOP ───────────────
// Antes de generar, para cada equipo (cal y ACS si aplica):
//   1) Si la ficha técnica NO está en su slot pero el modelo del catálogo la tiene,
//      la copia a "3. FICHAS TÉCNICAS Y CERTIFICACIONES" y rellena el slot.
//   2) Si el método de SCOP es EPREL y hay url_eprel, DESCARGA el Fiche (+Label) de
//      la API pública de EPREL, los guarda en Drive y los registra en
//      cifo_extra_annexes[] (idempotente por nombre) → se fusionan en el PDF.
//   3) Enriquece la fila del catálogo `aerotermia`: si le falta `eprel` o
//      `ficha_tecnica` y ahora los tenemos, la actualiza (para la próxima vez).
// Muta exp.documentacion EN MEMORIA (el guardado final del PDF lo persiste todo).
// Persiste aparte solo la tabla `aerotermia`. Devuelve { warnings, catalogUpdates }.
async function ensureScopAnnexes(exp) {
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || (exp.documentacion = {});
    const op = exp.oportunidades || {};
    const warnings = [];
    const catalogUpdates = [];

    const driveFolderId = op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id || exp.drive_folder_id || null;
    let ftFolderId;
    const ensureFtFolder = async () => {
        if (ftFolderId !== undefined) return ftFolderId;
        ftFolderId = driveFolderId
            ? (await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_FT) || await driveService.createSubfolder(driveFolderId, SUBCARPETA_FT))
            : null;
        return ftFolderId;
    };

    const extras = Array.isArray(doc.cifo_extra_annexes) ? doc.cifo_extra_annexes : (doc.cifo_extra_annexes = []);
    const hasExtra = (fileName) => extras.some(e => e.fileName === fileName);

    const processNode = async (type, node) => {
        if (!node) return;
        const slotLink = `ft_aerotermia_${type}_link`;
        const slotId = `ft_aerotermia_${type}_id`;
        const dbId = node.aerotermia_db_id;

        let catalog = null;
        if (dbId) {
            const { data } = await supabase.from('aerotermia').select('id, eprel, ficha_tecnica').eq('id', dbId).maybeSingle();
            catalog = data || null;
        }

        // 1) Ficha técnica desde el catálogo si falta en el slot.
        if (!doc[slotLink] && catalog?.ficha_tecnica) {
            const fid = await ensureFtFolder();
            const catFtId = driveIdFromLink(catalog.ficha_tecnica);
            if (fid && catFtId) {
                const copied = await driveService.copyFile(catFtId, fid, `FT_AEROTERMIA_${type.toUpperCase()}.pdf`);
                if (copied) { doc[slotLink] = copied.link; doc[slotId] = copied.id; }
                else warnings.push(`No se pudo copiar la ficha técnica del catálogo para ${type === 'cal' ? 'calefacción' : 'ACS'}.`);
            }
        }

        // 2) EPREL: descargar Fiche + Label y registrarlos como anexos.
        if ((node.metodo_scop || '').toLowerCase() === 'eprel' && node.url_eprel) {
            const m = String(node.url_eprel).match(/product\/([a-zA-Z]+)\/(\d+)/);
            if (m) {
                const grupo = m[1], id = m[2];
                const fid = await ensureFtFolder();
                if (fid) {
                    const items = [
                        ['Ficha EPREL', `Fiche_${id}_ES.pdf`, `https://eprel.ec.europa.eu/api/products/${grupo}/${id}/fiches?language=ES`],
                        ['Etiqueta EPREL', `Label_${id}.pdf`, `https://eprel.ec.europa.eu/api/products/${grupo}/${id}/labels?format=PDF`],
                    ];
                    for (const [label, fileName, apiUrl] of items) {
                        if (hasExtra(fileName)) continue;
                        try {
                            const r = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0)', 'Accept': 'application/pdf,*/*' } });
                            const buf = Buffer.from(await r.arrayBuffer());
                            const isPdf = r.ok && buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50;
                            if (isPdf) {
                                const saved = await driveService.saveFileToFolder(fid, fileName, 'application/pdf', buf);
                                if (saved) extras.push({ driveId: saved.id, link: saved.link, fileName, label: `${label} ${id}` });
                            } else {
                                warnings.push(`No se pudo descargar la ${label.toLowerCase()} EPREL ${id} (estado ${r.status}): adjúntala a mano.`);
                            }
                        } catch (e) {
                            warnings.push(`No se pudo descargar la ${label.toLowerCase()} EPREL ${id}: ${e.message}`);
                        }
                    }
                }
            } else {
                warnings.push(`La URL EPREL de ${type === 'cal' ? 'calefacción' : 'ACS'} no tiene el formato esperado (…/product/grupo/id).`);
            }
        }

        // 3) Enriquecer el catálogo para la próxima vez.
        if (dbId && catalog) {
            const upd = {};
            if (!catalog.eprel && node.url_eprel) upd.eprel = node.url_eprel;
            if (!catalog.ficha_tecnica && (doc[slotLink] || node.url_ficha)) upd.ficha_tecnica = doc[slotLink] || node.url_ficha;
            if (Object.keys(upd).length) {
                const { error } = await supabase.from('aerotermia').update(upd).eq('id', dbId);
                if (!error) catalogUpdates.push({ id: dbId, campos: Object.keys(upd) });
            }
        }
    };

    await processNode('cal', inst.aerotermia_cal);
    if (inst.cambio_acs !== false && !inst.misma_aerotermia_acs && inst.aerotermia_acs) {
        await processNode('acs', inst.aerotermia_acs);
    }
    return { warnings, catalogUpdates };
}

// ─── Validación → incidencias (GRAVE bloquea; LEVE avisa y genera igual) ───────
function buildValidation(exp, data, savingsKwh, folderId) {
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const blocking = [];
    const warnings = [];

    // Bloqueantes (GRAVE): sin ellos el CIFO es inválido.
    if (!(parseFloat(data.sRaw) > 0) || !(parseFloat(data.dcalRaw) > 0)) {
        blocking.push('No se puede generar el CIFO: falta la demanda de calefacción (D_CAL) y/o la superficie (S). Aporta el CEE con esos datos.');
    }
    if (!(data.scopCalRaw > 0)) {
        blocking.push('No se puede generar el CIFO: falta el SCOP de la bomba de calor de calefacción.');
    }
    if (!data.empNombre || data.empNombre === '—') {
        blocking.push('No se puede generar el CIFO: falta la empresa instaladora asociada al expediente.');
    }
    if (!folderId) {
        blocking.push('No se puede generar el CIFO: el expediente no tiene carpeta de Drive donde guardarlo.');
    }

    // Leves: se genera igual, pero conviene revisarlas.
    if (data.metodoCal === 'eprel' && !inst.aerotermia_cal?.url_eprel) {
        warnings.push('El método de SCOP en calefacción es EPREL pero falta la URL EPREL de la unidad exterior.');
    }
    if (!(doc.ft_aerotermia_cal_id || doc.ft_aerotermia_cal_link)) {
        warnings.push('Falta la ficha técnica de la aerotermia de calefacción: el CIFO se genera sin ese anexo.');
    }
    // Instalaciones EN CASCADA: cada equipo tiene que ir identificado con su nº de
    // serie en la tabla del CIFO, y dos equipos distintos no pueden compartirlo.
    for (const [bloque, aero] of [['calefacción', inst.aerotermia_cal], ['ACS', inst.misma_aerotermia_acs ? null : inst.aerotermia_acs]]) {
        if (!aero) continue;
        if (bloque === 'ACS' && !data.tieneAcs) continue;
        const uds = getUnidadesAero(aero);
        if (uds.length < 2) continue;
        const faltan = unidadesSinSerie(aero);
        if (faltan.length) {
            warnings.push(`Instalación en cascada de ${bloque} (${uds.length} equipos): falta el nº de serie del equipo ${faltan.join(', ')}.`);
        }
        const series = uds.map(u => String(u.numero_serie || u.n_serie_ext || '').trim().toUpperCase()).filter(Boolean);
        if (new Set(series).size !== series.length) {
            warnings.push(`Instalación en cascada de ${bloque}: hay números de serie repetidos entre los equipos. Revisa que no sea una copia por error.`);
        }
    }
    if (data.tieneAcs) {
        if (!(doc.ft_aerotermia_acs_id || doc.ft_aerotermia_acs_link)) {
            warnings.push('La actuación incluye ACS pero falta la ficha técnica de la aerotermia de ACS: el CIFO se genera sin ese anexo.');
        }
        const serieCal = inst.aerotermia_cal?.numero_serie || inst.aerotermia_cal?.n_serie_ext;
        const serieAcs = inst.misma_aerotermia_acs ? serieCal : (inst.aerotermia_acs?.numero_serie || inst.aerotermia_acs?.n_serie_ext);
        if (!inst.misma_aerotermia_acs && serieAcs && serieCal && serieAcs === serieCal) {
            warnings.push('El nº de serie del equipo de ACS coincide con el de calefacción: revisa que no sea una copia por error.');
        }
    }
    if (data.fechaInicio === '—' || data.fechaFin === '—') {
        warnings.push('Faltan las fechas de inicio/fin de la actuación (facturas o pruebas del certificado de instalación).');
    }
    return { blocking, warnings };
}

// Registra incidencias en documentacion.incidencias[] (mismo shape que el módulo
// de incidencias). Dedup por texto entre las ABIERTAS para no duplicar al regenerar.
function appendIncidencias(docObj, items, severidad) {
    const list = docObj.incidencias || (docObj.incidencias = []);
    const abiertasTxt = new Set(list.filter(i => i.estado !== 'SUBSANADA').map(i => i.texto));
    let added = 0;
    for (const texto of items) {
        if (abiertasTxt.has(texto)) continue;
        list.push({
            id: `${Date.now()}_${added}_inc`,
            texto,
            procedencia: 'AGENTE_IA',
            severidad,
            estado: 'ABIERTA',
            fecha: new Date().toISOString(),
            usuario: 'ASISTENTE_IA',
            resuelta_at: null,
            resuelta_por: null,
        });
        added++;
    }
    return added;
}

// ─── Estado (lo que falta / si puede generar) — espejo del checklist ──────────
async function getEstadoCifo(numeroOrId) {
    const loaded = await loadExpedientePayload(numeroOrId);
    if (loaded.notFound) return { ok: false, message: `No se encontró el expediente "${numeroOrId}".` };
    if (loaded.ambiguous) return { ok: false, message: 'Número de expediente ambiguo.', coincidencias: loaded.ambiguous };
    const { exp, op } = loaded;

    const tipologia = resolveTipologia(exp, op);
    const folderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id || exp.drive_folder_id || null;

    let blocking, warnings;
    if (tipologia === 'RES080') {
        await ensureHuecosParsed(exp.cee || {});
        const results = await computeRes080Results(exp);
        ({ blocking, warnings } = buildValidationRes080(exp, results, folderId));
    } else {
        const { deriveCifoData } = await loadCifoDoc();
        const savingsKwh = await computeSavingsKwh(exp, op);
        const data = deriveCifoData({ expediente: exp, results: { savingsKwh } });
        ({ blocking, warnings } = buildValidation(exp, data, savingsKwh, folderId));
    }

    return {
        ok: true, tipologia,
        expediente: exp.numero_expediente,
        puede_generar: blocking.length === 0,
        datos_faltan: blocking,
        avisos: warnings,
        ya_generado: !!exp.documentacion?.cert_cifo_drive_link,
        ya_firmado: !!exp.documentacion?.cert_cifo_signed_link,
    };
}

// Validación RES080 (Certificado Final de Obra): GRAVE si no hay comparativa
// energética (sin la cual el AETOTAL no existe) o falta carpeta; LEVE lo demás.
function buildValidationRes080(exp, results, folderId) {
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const blocking = [];
    const warnings = [];
    if (!results || !(parseFloat(results.ahorroEnergiaFinalTotal) > 0)) {
        blocking.push('No se puede generar el RES080: falta la comparativa energética (los dos CEE inicial y final en XML, o las emisiones manuales) para calcular el ahorro AE_TOTAL.');
    }
    if (!folderId) {
        blocking.push('No se puede generar el RES080: el expediente no tiene carpeta de Drive donde guardarlo.');
    }
    if (!(parseFloat(inst.aerotermia_cal?.scop) > 0)) {
        warnings.push('Falta el SCOP de la aerotermia de calefacción: la justificación del SCOP saldrá incompleta.');
    }
    if (!(doc.ft_aerotermia_cal_id || doc.ft_aerotermia_cal_link)) {
        warnings.push('Falta la ficha técnica de la aerotermia de calefacción: el RES080 se genera sin ese anexo.');
    }
    if (inst.cambio_acs !== false && !(doc.ft_aerotermia_acs_id || doc.ft_aerotermia_acs_link)) {
        warnings.push('La actuación incluye ACS pero falta la ficha técnica de la aerotermia de ACS: el RES080 se genera sin ese anexo.');
    }
    return { blocking, warnings };
}

// ─── Generación ───────────────────────────────────────────────────────────────
async function generarCifo(numeroOrId, { force = false } = {}) {
    const loaded = await loadExpedientePayload(numeroOrId);
    if (loaded.notFound) return { ok: false, message: `No se encontró el expediente "${numeroOrId}".` };
    if (loaded.ambiguous) return { ok: false, message: 'Número de expediente ambiguo.', coincidencias: loaded.ambiguous };
    const { exp, op, simple } = loaded;
    const numexpte = exp.numero_expediente;

    const tipologia = resolveTipologia(exp, op);
    if (exp.documentacion?.cert_cifo_signed_link && !force) {
        return { ok: false, tipologia, needsConfirm: true, message: `Ya existe un ${tipologia === 'RES080' ? 'Certificado RES080' : 'CIFO'} FIRMADO. Regenerar invalidaría la firma. Vuelve a llamar con force:true si de verdad quieres regenerar el borrador.` };
    }

    const folderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id || exp.drive_folder_id || null;

    // Ensamblar los anexos que justifican el SCOP (FT del catálogo si falta + EPREL
    // Fiche/Label) y enriquecer el catálogo. Muta exp.documentacion en memoria, así
    // que resolveAnnexAttachments (más abajo) ya los incluye.
    const scopAnnex = await ensureScopAnnexes(exp);

    // Construir HTML + validación según tipología (RES060/093 vs RES080). El resto
    // (render, fusión de anexos, guardado, enlace, historial, incidencias) es común.
    let html, blocking, warnings, attachments, docLabel;
    if (tipologia === 'RES080') {
        await ensureHuecosParsed(exp.cee || {});
        const results = await computeRes080Results(exp);
        ({ blocking, warnings } = buildValidationRes080(exp, results, folderId));
        if (blocking.length === 0) {
            const { deriveRes080Data, buildRes080Html } = await loadRes080Doc();
            const data = deriveRes080Data({ expediente: exp, results });
            ({ attachments } = resolveAnnexAttachments(exp));
            html = buildRes080Html({ data, appUrl: ASSET_URL, attachments, isForPdf: true });
        }
        docLabel = 'Certificado Reforma RES080';
    } else {
        const { deriveCifoData, buildCifoHtml } = await loadCifoDoc();
        const savingsKwh = await computeSavingsKwh(exp, op);
        const data = deriveCifoData({ expediente: exp, results: { savingsKwh } });
        ({ blocking, warnings } = buildValidation(exp, data, savingsKwh, folderId));
        if (blocking.length === 0) {
            ({ attachments } = resolveAnnexAttachments(exp));
            html = buildCifoHtml({ data, appUrl: ASSET_URL, attachments, withAnnexPreview: false });
        }
        docLabel = 'Certificado CIFO';
    }

    // Sumar los avisos del ensamblado de anexos (EPREL/FT) a los de validación.
    warnings = [...(warnings || []), ...scopAnnex.warnings];

    // Bloqueantes → incidencia GRAVE y NO se genera.
    if (blocking.length > 0) {
        const docObj = simple.documentacion || {};
        const n = appendIncidencias(docObj, blocking, 'GRAVE');
        if (n > 0) await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', simple.id);
        return { ok: false, tipologia, expediente: numexpte, blocking, warnings, message: `No se pudo generar el ${docLabel}: ${blocking.join(' ')}` };
    }

    const driveIds = attachments.map(a => a.file.driveId);
    let pdfBuffer = await pdfService.htmlToPdf(html);
    const annexBuffers = await pdfService.fetchAnnexBuffers(driveIds);
    if (annexBuffers.length > 0) pdfBuffer = await pdfService.mergePdfs(pdfBuffer, annexBuffers);

    // Guardar en "6. ANEXOS CAE" con el nombre oficial (mismo slot cert_cifo_* que
    // el CIFO — un expediente es RES060/093 O RES080, nunca ambos).
    const targetFolderId = await driveService.getOrCreateSubfolder(folderId, SUBCARPETA_ANEXOS);
    const fileName = `${numexpte} - ${docLabel}.pdf`;
    const driveResult = await driveService.saveFileToFolder(targetFolderId, fileName, 'application/pdf', pdfBuffer);
    if (!driveResult) return { ok: false, tipologia, expediente: numexpte, message: `No se pudo guardar el ${docLabel} en Drive.` };

    // Enlazar el slot + historial + incidencias LEVE (sin tocar cert_cifo_signed_link).
    const docObj = simple.documentacion || {};
    docObj.cert_cifo_drive_link = driveResult.link;
    const hist = Array.isArray(docObj.historial) ? docObj.historial : (docObj.historial = []);
    hist.push({ tipo: 'CIFO_GENERADO', fecha: new Date().toISOString(), usuario: 'ASISTENTE_IA', detalle: `${docLabel} generado automáticamente y guardado en 6. ANEXOS CAE`, link: driveResult.link });
    const nWarn = appendIncidencias(docObj, warnings, 'LEVE');
    await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', simple.id);

    return {
        ok: true,
        tipologia,
        expediente: numexpte,
        link: driveResult.link,
        anexos: attachments.map(a => ({ label: a.label, driveId: a.file.driveId })),
        catalogo_actualizado: scopAnnex.catalogUpdates,
        warnings,
        incidencias_leves: nWarn,
        message: `${docLabel} (${tipologia}) generado y guardado en "6. ANEXOS CAE". Enlazado en el expediente y listo para revisar/firmar.${scopAnnex.catalogUpdates.length ? ` Catálogo aerotermia actualizado (${scopAnnex.catalogUpdates.length} fila/s).` : ''}${nWarn ? ` Se registraron ${nWarn} incidencia(s) LEVE.` : ''}`,
    };
}

module.exports = { generarCifo, getEstadoCifo, loadExpedientePayload, computeSavingsKwh, computeRes080Results };
