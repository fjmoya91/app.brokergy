// ─── guiaIrpf.js ─────────────────────────────────────────────────────────────
// La GUÍA de una página que se le entrega al cliente junto a sus dos
// certificados de eficiencia energética, para que se aplique la deducción del
// IRPF por obras de mejora de la eficiencia energética de viviendas (DA 50ª de
// la Ley 35/2006 del IRPF).
//
// FUENTE ÚNICA de todo lo que la guía dice: qué deducción se aplica, la
// estimación, los datos que pide Renta Web, el texto del mensaje de envío y el
// HTML del PDF. La consumen el popup de envío (vista previa) y el backend
// (`guiaIrpfService`: el PDF que viaja por email y WhatsApp, el que se guarda en
// Drive y el que se descarga desde el portal del cliente). Si cada superficie lo
// compusiera por su cuenta, el cliente podría leer en el mensaje un porcentaje y
// en el PDF otro.
//
// Puro ESM y sin React: el backend lo carga por import() dinámico, como cifoDoc
// (ver project_backend_importa_frontend_esm). Por eso los imports llevan `.js`.
//
// QUÉ DEDUCCIÓN — se decide con los CERTIFICADOS y el TIPO DE VIVIENDA, como dice
// el manual de BROKERGY ("MANUAL DEDUCCIONES IRPF POR REHABILITACIÓN ENERGÉTICA"):
//   · consumo de energía primaria no renovable −30 % o letra A/B  →
//        vivienda unifamiliar · edificio completo  → 60 % (la más favorable)
//        piso en un bloque                          → 40 %
//   · si no, demanda de calefacción + refrigeración −7 %          → 20 %
//   · si no                                                       → no hay guía
//
// REGLA — la guía INFORMA, no promete. Habla de lo que acreditan los
// certificados y de cómo se rellena la declaración; el derecho a la deducción
// depende además de la situación de cada contribuyente (cuota suficiente,
// titularidad, pagos que no sean en efectivo…), y se dice al pie. Decisión del
// usuario (2026-10-01): hasta ahora la comprobación del IRPF no salía de la app;
// el cliente la necesita para hacer su declaración y se le entrega así.
// ─────────────────────────────────────────────────────────────────────────────
import { comprobarIrpf, UMBRAL_AHORRO } from './irpfEpnr.js';
import { leerDatosIrpfDeTexto } from '../../calculator/logic/xmlCeeParser.js';
import { buildFontFaces, FUENTE_FACTURA_SO, origenApp } from './fuentesDoc.js';
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from '../../lotes/logic/facturaLogo.js';

/** Reducción mínima de la demanda de calefacción + refrigeración (deducción del 20 %). */
export const UMBRAL_DEMANDA = 7;

/** IVA que se supone cuando la factura solo trae la base. Se marca como estimado. */
export const IVA_ESTIMADO_PCT = 21;

/**
 * La obra del EJEMPLO, IVA incluido: lo que la guía usa para enseñar cómo se
 * calcula la deducción cuando no tenemos las facturas de la obra del cliente.
 *
 * REGLA — sin facturas de la obra NO se estima nada sobre lo que haya. Pasa casi
 * siempre en un CEE directo: la obra la contrató el cliente con otro y lo único
 * que conocemos es la factura de los certificados (161 € en 2026CEE_60). Estimar
 * sobre eso le diría que se deduce noventa euros. En su lugar va un EJEMPLO
 * rotulado como tal, con una obra tipo, y se le dice que lo suyo es el mismo % de
 * lo que haya pagado (decisión del usuario, 2026-10-01). En cuanto hay una
 * factura de la obra —del expediente o añadida a mano en el popup— sale su caso real.
 */
export const IMPORTE_EJEMPLO = 9000;

/**
 * Las tres deducciones. `opcionRenta` es el rótulo LITERAL de la opción en Renta
 * Web (capturas del manual): es lo que el cliente tiene que buscar en pantalla, así
 * que no se parafrasea.
 *
 * Vigencia: prorrogadas por el RDL 7/2026 (convalidado). Obras pagadas hasta el
 * 31/12/2026 en las del 20 % y 40 %, y hasta el 31/12/2027 en la del 60 %, con el
 * certificado posterior expedido antes de que acabe ese plazo. Cuando se vuelvan a
 * prorrogar, se cambia AQUÍ.
 */
export const MODALIDADES = {
    '60': {
        pct: 60,
        nombre: 'Obras en edificios de uso predominantemente residencial',
        opcionRenta: 'Por las obras realizadas en edificios de uso predominantemente residencial',
        indicador: 'epnr',
        baseAnual: 5000,
        baseTotal: 15000,
        aniosExtra: 4,
        hasta: '2027-12-31',
    },
    '40': {
        pct: 40,
        nombre: 'Mejora del consumo de energía primaria no renovable',
        opcionRenta: 'Por las obras realizadas para la mejora en el consumo de energía primaria no renovable',
        indicador: 'epnr',
        baseAnual: 7500,
        baseTotal: 7500,
        aniosExtra: 0,
        hasta: '2026-12-31',
    },
    '20': {
        pct: 20,
        nombre: 'Reducción de la demanda de calefacción y refrigeración',
        opcionRenta: 'Por la reducción de la demanda de calefacción y refrigeración',
        indicador: 'demanda',
        baseAnual: 5000,
        baseTotal: 5000,
        aniosExtra: 0,
        hasta: '2026-12-31',
    },
};

/** Ruta en Renta Web hasta el formulario (capturas del manual). */
export const RUTA_RENTA = [
    'Apartados de la declaración',
    'Deducciones generales',
    'Por obras de mejora de la eficiencia energética en viviendas',
];

export const TIPOS_VIVIENDA = {
    unifamiliar: { label: 'Vivienda unifamiliar', corto: 'Unifamiliar' },
    piso: { label: 'Vivienda en un bloque (piso)', corto: 'Piso' },
    bloque: { label: 'Edificio completo (comunidad de propietarios)', corto: 'Edificio completo' },
};

// Las tres haciendas forales: allí el IRPF no es el de la Ley 35/2006 y esta
// guía no vale. Se avisa a quien la envía; no se decide por él.
const PROVINCIAS_FORALES = ['ALAVA', 'ARABA', 'GIPUZKOA', 'GUIPUZCOA', 'BIZKAIA', 'VIZCAYA', 'NAVARRA'];

// ─── Formato ─────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// ⚠️ NO `toLocaleString('es-ES')`: en español no agrupa los números de CUATRO
// cifras (la regla del «mínimo de dos dígitos de grupo»), así que 7.768 salía
// "7768 €" junto a "12.947 €" en el mismo documento. El punto se pone siempre.
const miles = (v, dec = 2) => {
    const n = Number(v) || 0;
    const [ent, frac] = Math.abs(n).toFixed(dec).split('.');
    return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${frac ? `,${frac}` : ''}`;
};
export const eur = (v, dec = 2) => `${miles(v, dec)} €`;
const n2 = (v) => miles(v, 2);
const n1 = (v) => miles(v, 1);
const isoOk = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
export const fechaEs = (iso) => (isoOk(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);
const anioDe = (iso) => (isoOk(iso) ? Number(String(iso).slice(0, 4)) : null);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

/**
 * El tipo de vivienda que declara el `<TipoDeEdificio>` del certificado.
 * Se compara por subcadena normalizada (el XML guardado viene en MAYÚSCULAS y el
 * enum se escribe de varias formas según la herramienta), igual que
 * `clasificarTipoEdificio`, que no distingue el piso de la unifamiliar.
 */
export function tipoViviendaDeCee(raw) {
    const t = norm(raw);
    if (!t) return null;
    if (t.includes('UNIFAMILIAR')) return 'unifamiliar';
    if (t.includes('BLOQUE') && t.includes('COMPLETO')) return 'bloque';
    if (t.includes('BLOQUE')) return 'piso';
    if (t.includes('TERCIARIO')) return 'terciario';
    return null;
}

/**
 * Los datos de un certificado para la guía: lo que dice su `.xml` crudo y, si no
 * lo hay (un CEE leído de un PDF, o el CEE anterior que trajo el cliente), el
 * objeto parseado.
 *
 * REGLA — aquí manda el `.xml`, al revés que en la comprobación de la pantalla.
 * Lo que el cliente teclea en Renta Web es lo que dice EL CERTIFICADO que tiene
 * en la mano, y el objeto parseado puede haberse quedado atrás: medido en
 * 2026CEE_60, al cargar por error el CEE de otro técnico encima del nuestro la
 * demanda se reparó y la FECHA no — la ficha decía 29/06/2026 y el certificado
 * es del 29/09/2026. Cuando difieren se dice en `_diferencias`.
 */
export function completarCee(cee, xml) {
    const base = cee && typeof cee === 'object' ? { ...cee } : {};
    if (xml && typeof xml === 'string') {
        const re = leerDatosIrpfDeTexto(xml);
        const diferencias = [];
        const guardadaFecha = isoOk(base.fechaFirma) ? String(base.fechaFirma).slice(0, 10) : null;
        if (guardadaFecha && re.fechaFirma && guardadaFecha !== re.fechaFirma) {
            diferencias.push({ campo: 'fecha', guardado: guardadaFecha, certificado: re.fechaFirma });
        }
        const guardadoCons = Number(base.epnrConsumo);
        if (isFinite(guardadoCons) && guardadoCons > 0 && re.epnrConsumo != null && Math.abs(guardadoCons - re.epnrConsumo) > 0.01) {
            diferencias.push({ campo: 'consumo', guardado: guardadoCons, certificado: re.epnrConsumo });
        }
        for (const k of Object.keys(re)) if (re[k] != null) base[k] = re[k];
        if (diferencias.length) base._diferencias = diferencias;
    }
    return Object.keys(base).length ? base : null;
}

/** ¿Baja la demanda de calefacción + refrigeración al menos un 7 %? */
export function comprobarDemanda(ini, fin) {
    const suma = (c) => {
        const cal = Number(c?.demandaCalefaccion);
        if (!isFinite(cal) || cal <= 0) return null;
        const ref = Number(c?.demandaRefrigeracion);
        return cal + (isFinite(ref) && ref > 0 ? ref : 0);
    };
    const a = suma(ini);
    const b = suma(fin);
    if (a == null || b == null) return { estado: 'faltan_datos' };
    const ahorroPct = ((a - b) / a) * 100;
    return { estado: 'ok', antes: a, despues: b, ahorroPct, cumple: ahorroPct >= UMBRAL_DEMANDA };
}

/**
 * Qué deducción se aplica. Devuelve la modalidad ('60'|'40'|'20') o null, y POR
 * QUÉ — lo que se le enseña a quien envía.
 */
export function elegirModalidad({ tipo, irpf, demanda }) {
    if (tipo === 'terciario') {
        return { modalidad: null, motivo: 'El certificado es de un edificio de uso TERCIARIO: estas deducciones son solo para viviendas.' };
    }
    if (irpf?.estado === 'ok' && irpf.cumple) {
        if (tipo === 'piso') return { modalidad: '40', motivo: 'Piso en un bloque: deducción del 40 % (la del 60 % es para viviendas unifamiliares y obras de toda la comunidad).' };
        if (tipo === 'unifamiliar' || tipo === 'bloque') return { modalidad: '60', motivo: tipo === 'bloque' ? 'Edificio completo: deducción del 60 % sobre la parte de cada propietario.' : 'Vivienda unifamiliar: deducción del 60 %, la más favorable.' };
        return { modalidad: null, motivo: 'No consta el tipo de vivienda: elige si es unifamiliar o un piso.' };
    }
    if (demanda?.estado === 'ok' && demanda.cumple) {
        return { modalidad: '20', motivo: `El consumo de energía primaria no renovable no baja un ${UMBRAL_AHORRO} % ni llega a la A/B, pero la demanda de calefacción y refrigeración baja un ${n1(demanda.ahorroPct)} % (≥ ${UMBRAL_DEMANDA} %): deducción del 20 %.` };
    }
    if (irpf?.estado !== 'ok') {
        return { modalidad: null, motivo: (irpf?.falta || []).join(' ') || 'Faltan los datos de los certificados.' };
    }
    return { modalidad: null, motivo: `Los certificados no cumplen ningún requisito: ni ${UMBRAL_AHORRO} % de ahorro en energía primaria no renovable (ni letra A/B), ni ${UMBRAL_DEMANDA} % en la demanda de calefacción y refrigeración.` };
}

/**
 * Cuánto se deduce y en qué declaración, POR PROPIETARIO.
 *
 * 60 %: base máxima 5.000 €/año y 15.000 € en total; lo que exceda el año se
 * arrastra a los 4 siguientes (manual: 12.000 € → 3.000 + 3.000 + 1.200).
 * 40 % y 20 %: base máxima anual 7.500 € / 5.000 €, sin arrastre.
 */
export function calendarioDeduccion({ modalidad, base, anio, propietarios = 1 }) {
    const m = MODALIDADES[modalidad];
    const n = Math.max(1, Number(propietarios) || 1);
    const porProp = r2((Number(base) || 0) / n);
    if (!m || porProp <= 0 || !anio) return { anios: [], porPropietario: 0, total: 0, propietarios: n, basePorPropietario: porProp };
    const anios = [];
    let resto = Math.min(porProp, m.baseTotal);
    for (let k = 0; k <= m.aniosExtra && resto > 0.005; k++) {
        const b = Math.min(resto, m.baseAnual);
        anios.push({ anio: anio + k, base: r2(b), importe: r2(b * m.pct / 100) });
        resto -= b;
    }
    const porPropietario = r2(anios.reduce((s, a) => s + a.importe, 0));
    return { anios, porPropietario, total: r2(porPropietario * n), propietarios: n, basePorPropietario: porProp };
}

/**
 * Las facturas tal y como entran en la guía: con IVA. Si la fila solo trae la
 * base, se supone el 21 % y se MARCA — quien envía lo ve y lo corrige en el popup.
 */
export function facturaConIva(f) {
    const conIva = Number(f?.importe_con_iva ?? f?.importe);
    if (isFinite(conIva) && conIva > 0) return { importe: r2(conIva), ivaEstimado: !!f?.ivaEstimado };
    const base = Number(f?.importe_sin_iva);
    if (isFinite(base) && base > 0) return { importe: r2(base * (1 + IVA_ESTIMADO_PCT / 100)), ivaEstimado: true };
    return { importe: 0, ivaEstimado: false };
}

/**
 * Compone la guía.
 *
 * @param {object} d
 * @param {string} d.numeroExpediente
 * @param {'cae'|'cee_directo'} d.negocio
 * @param {{nombre:string, nif:string}} d.titular
 * @param {number} [d.propietarios]       titular + copropietarios
 * @param {{direccion, refCatastral, provincia}} d.vivienda
 * @param {string} [d.tipoSimulacion]     'unifamiliar'|'piso' de la oportunidad (respaldo)
 * @param {string} [d.tipoManual]         lo elegido en el popup (manda)
 * @param {{cee, xml, fecha, rotulo}} d.anterior   certificado de antes de la obra
 * @param {{cee, xml, fecha, rotulo}} d.posterior  certificado de después
 * @param {Array}  d.facturas  [{ id, numero, fecha, emisor, nif, importe (con IVA), ivaEstimado, incluir }]
 * @param {Array}  [d.obras]   [{ nif, nombre }] quien hizo la obra si las facturas no lo dicen
 * @param {string} [d.hoy]     YYYY-MM-DD
 */
export function componerGuia(d = {}) {
    const ant = completarCee(d.anterior?.cee, d.anterior?.xml) || null;
    const pos = completarCee(d.posterior?.cee, d.posterior?.xml) || null;
    // «Fecha del certificado» es la que lleva IMPRESA el certificado (su .xml, o el
    // objeto parseado si no hay .xml). La del expediente (`fechaFirmaCee`) es el
    // respaldo, y si dice otra cosa se avisa: es un dato que hay que corregir.
    const fechaAnt = isoOk(ant?.fechaFirma) ? ant.fechaFirma.slice(0, 10) : (isoOk(d.anterior?.fecha) ? d.anterior.fecha.slice(0, 10) : null);
    const fechaPos = isoOk(pos?.fechaFirma) ? pos.fechaFirma.slice(0, 10) : (isoOk(d.posterior?.fecha) ? d.posterior.fecha.slice(0, 10) : null);

    const irpf = comprobarIrpf(ant ? { ...ant, fechaFirma: fechaAnt } : null, pos ? { ...pos, fechaFirma: fechaPos } : null, {
        rotulos: { inicial: d.anterior?.rotulo || 'CEE anterior', final: d.posterior?.rotulo || 'CEE posterior' },
    });
    const demanda = comprobarDemanda(ant, pos);

    const tipoCee = tipoViviendaDeCee(pos?.tipoEdificio) || tipoViviendaDeCee(ant?.tipoEdificio);
    const tipo = TIPOS_VIVIENDA[d.tipoManual] ? d.tipoManual
        : (tipoCee || (TIPOS_VIVIENDA[d.tipoSimulacion] ? d.tipoSimulacion : null));
    const tipoOrigen = TIPOS_VIVIENDA[d.tipoManual] ? 'manual' : (tipoCee ? 'certificado' : (tipo ? 'simulacion' : null));

    const { modalidad, motivo } = elegirModalidad({ tipo, irpf, demanda });
    const m = modalidad ? MODALIDADES[modalidad] : null;

    // Facturas que entran, con IVA.
    const facturas = (d.facturas || [])
        .filter(f => f && f.incluir !== false)
        .map(f => {
            const { importe, ivaEstimado } = facturaConIva(f);
            return {
                id: f.id || null,
                numero: f.numero || '',
                fecha: isoOk(f.fecha) ? String(f.fecha).slice(0, 10) : null,
                emisor: f.emisor || '',
                nif: String(f.nif || '').toUpperCase().replace(/[\s.-]/g, '') || '',
                importe,
                ivaEstimado,
                // La de los CERTIFICADOS (BROKERGY) cuenta en el importe —la norma
                // incluye «la emisión de los correspondientes certificados»— pero
                // quien la emite no ha realizado las obras.
                certificado: !!f.certificado,
            };
        })
        .filter(f => f.importe > 0);
    const total = r2(facturas.reduce((s, f) => s + f.importe, 0));
    // Solo está la factura de los CERTIFICADOS: el importe de la obra lo pone el
    // cliente. Presentar esos ciento y pico euros como "cantidades satisfechas"
    // —y estimar sobre ellos— le diría que su deducción es de noventa euros.
    const soloCertificados = facturas.length > 0 && facturas.every(f => f.certificado);
    // Ninguna factura de la OBRA (ni una, o solo la de los certificados): en vez
    // de la estimación va el EJEMPLO (ver IMPORTE_EJEMPLO).
    const sinFacturasObra = !facturas.some(f => !f.certificado);

    // En qué declaración. 20/40: la del año en que se expide el certificado
    // posterior. 60: la de cada año de pago, con el certificado ya expedido — se
    // toma el más tardío de los dos y se avisa si se pagó antes.
    const anioCert = anioDe(fechaPos);
    const aniosFact = facturas.map(f => anioDe(f.fecha)).filter(Boolean);
    const anio = modalidad === '60' ? Math.max(anioCert || 0, ...aniosFact) || null : anioCert;

    const propietarios = Math.max(1, Number(d.propietarios) || 1);
    const calendario = modalidad ? calendarioDeduccion({ modalidad, base: total, anio, propietarios }) : null;
    // El ejemplo es el de UNA persona que paga la obra entera: repartirlo entre
    // propietarios convertiría una cifra ilustrativa en otra que parece calculada.
    // Sin año (falta la fecha del certificado) se cuenta igual y se rotula «Año 1».
    const ejemplo = modalidad && sinFacturasObra
        ? {
            importe: IMPORTE_EJEMPLO,
            conAnio: !!anio,
            calendario: calendarioDeduccion({ modalidad, base: IMPORTE_EJEMPLO, anio: anio || 1, propietarios: 1 }),
        }
        : null;

    // Quién hizo la obra: los NIF de las facturas; si no los traen, el instalador.
    const obras = [];
    const vistos = new Set();
    for (const f of facturas) {
        if (f.certificado) continue;
        if (f.nif && !vistos.has(f.nif)) { vistos.add(f.nif); obras.push({ nif: f.nif, nombre: f.emisor }); }
    }
    for (const o of (d.obras || [])) {
        const nif = String(o?.nif || '').toUpperCase().replace(/[\s.-]/g, '');
        if (nif && !vistos.has(nif)) { vistos.add(nif); obras.push({ nif, nombre: o.nombre || '' }); }
    }

    // ── Avisos para QUIEN ENVÍA (no salen en el PDF) ───────────────────────────
    const avisos = [];
    if (irpf.estado === 'ok') avisos.push(...(irpf.avisos || []));
    if (!tipo) avisos.push('No consta el tipo de vivienda en el certificado: elígelo.');
    else if (tipoOrigen === 'simulacion') avisos.push('El tipo de vivienda sale de la simulación: el certificado no lo declara.');
    if (!fechaAnt || !fechaPos) avisos.push('Falta la fecha de alguno de los certificados: Renta Web la pide.');
    // Que no haya facturas de la obra NO es un aviso: en un CEE directo es lo
    // normal y la guía ya lo resuelve con el ejemplo. Un aviso que sale siempre
    // enseña a no leer los demás; el popup lo dice como información (`ejemplo`).
    for (const [lado, c, fechaExp] of [['anterior', ant, d.anterior?.fecha], ['posterior', pos, d.posterior?.fecha]]) {
        const rot = (lado === 'anterior' ? d.anterior?.rotulo : d.posterior?.rotulo) || `certificado ${lado}`;
        for (const df of (c?._diferencias || [])) {
            avisos.push(df.campo === 'fecha'
                ? `El ${rot} es del ${fechaEs(df.certificado)} según su .xml, pero lo guardado dice ${fechaEs(df.guardado)}. La guía usa la del certificado: corrige el dato guardado.`
                : `El consumo del ${rot} guardado (${n2(df.guardado)}) no es el de su .xml (${n2(df.certificado)}). La guía usa el del certificado.`);
        }
        const fe = isoOk(fechaExp) ? String(fechaExp).slice(0, 10) : null;
        const fc = lado === 'anterior' ? fechaAnt : fechaPos;
        if (fe && fc && fe !== fc && !(c?._diferencias || []).some(x => x.campo === 'fecha' && x.guardado === fe)) {
            avisos.push(`La fecha del ${rot} en el expediente (${fechaEs(fe)}) no es la del propio certificado (${fechaEs(fc)}). La guía usa la del certificado: corrígela en la rejilla del CEE.`);
        }
    }
    if (fechaAnt && fechaPos && fechaAnt === fechaPos) avisos.push('Los dos certificados tienen la MISMA fecha: comprueba que no se ha cargado el mismo dos veces.');
    const estimadas = facturas.filter(f => f.ivaEstimado);
    if (estimadas.length) avisos.push(`${estimadas.length === 1 ? 'Una factura lleva' : `${estimadas.length} facturas llevan`} el IVA SUPUESTO al ${IVA_ESTIMADO_PCT} % (solo consta la base). Compruébalo con la factura: si es el 10 %, cambia el importe.`);
    if (fechaAnt && fechaPos) {
        // La de los certificados se emite al entregarlos: que sea posterior es lo normal.
        const fuera = facturas.filter(f => !f.certificado && f.fecha && (f.fecha < fechaAnt || f.fecha > fechaPos));
        if (fuera.length) avisos.push(`${fuera.length === 1 ? 'Una factura es' : `${fuera.length} facturas son`} de fuera del periodo entre los dos certificados (${fechaEs(fechaAnt)} – ${fechaEs(fechaPos)}).`);
    }
    if (modalidad === '60' && anioCert && aniosFact.some(a => a < anioCert)) {
        avisos.push(`Hay facturas de un año anterior al del certificado posterior (${anioCert}): en la del 60 % se deduce lo pagado cada año con el certificado ya expedido. Que lo confirme su asesor.`);
    }
    if (m && fechaPos && fechaPos > m.hasta) {
        avisos.push(`El certificado posterior (${fechaEs(fechaPos)}) es posterior al plazo vigente de esta deducción (${fechaEs(m.hasta)}).`);
    }
    if (PROVINCIAS_FORALES.some(p => norm(d.vivienda?.provincia).includes(p))) {
        avisos.push('La vivienda está en territorio FORAL (País Vasco o Navarra): allí el IRPF es el de su Hacienda foral y esta guía no aplica.');
    }

    return {
        numeroExpediente: d.numeroExpediente || '',
        negocio: d.negocio || 'cae',
        titular: { nombre: d.titular?.nombre || '', nif: d.titular?.nif || '' },
        vivienda: {
            direccion: d.vivienda?.direccion || '',
            refCatastral: d.vivienda?.refCatastral || pos?.refCatastral || pos?.identificacion?.refCatastral || ant?.identificacion?.refCatastral || '',
            provincia: d.vivienda?.provincia || '',
        },
        tipo,
        tipoOrigen,
        tipoCee,
        modalidad,
        motivo,
        puede: !!modalidad,
        irpf,
        demanda,
        certificados: {
            anterior: {
                rotulo: d.anterior?.rotulo || 'Certificado anterior',
                fecha: fechaAnt,
                consumo: Number(ant?.epnrConsumo) || null,
                letra: irpf.letraIni || ant?.epnrLetra || null,
                demanda: demanda.estado === 'ok' ? demanda.antes : null,
            },
            posterior: {
                rotulo: d.posterior?.rotulo || 'Certificado posterior',
                fecha: fechaPos,
                consumo: Number(pos?.epnrConsumo) || null,
                letra: irpf.letraFin || pos?.epnrLetra || null,
                demanda: demanda.estado === 'ok' ? demanda.despues : null,
            },
        },
        facturas,
        total,
        soloCertificados,
        sinFacturasObra,
        anio,
        propietarios,
        calendario,
        ejemplo,
        obras: obras.slice(0, 2),
        hoy: isoOk(d.hoy) ? d.hoy.slice(0, 10) : new Date().toISOString().slice(0, 10),
        avisos,
    };
}

// ─── El mensaje de envío ─────────────────────────────────────────────────────
/**
 * Texto del email y del WhatsApp. Sale de aquí y no de la ruta: lo enseña el
 * popup para retocarlo y lo manda el backend, y tienen que ser el mismo.
 *
 * @param {object} guia
 * @param {object} opts
 * @param {string} [opts.nombre]       a quién se saluda (quien lo recibe)
 * @param {number} [opts.certificados] cuántos certificados van adjuntos (1 o 2)
 */
export function mensajeGuiaIrpf(guia, { nombre = '', certificados = 2 } = {}) {
    const pila = String(nombre || '').trim().split(/\s+/)[0];
    const saludo = pila ? `¡Hola ${pila.charAt(0).toUpperCase()}${pila.slice(1).toLowerCase()}!` : '¡Hola!';
    const m = guia?.modalidad ? MODALIDADES[guia.modalidad] : null;
    const certs = certificados >= 2
        ? 'tus *dos certificados de eficiencia energética* (el de antes y el de después de la obra)'
        : 'tu *certificado de eficiencia energética*';
    const lineas = [
        saludo,
        '',
        `Te enviamos ${certs} y una *guía de una página* para que puedas aplicarte la deducción por obras de mejora energética en tu declaración de la Renta.`,
    ];
    if (m) {
        lineas.push('', `En la guía tienes la deducción que puedes aplicar (*${m.pct} %*), dónde se marca en Renta Web y todos los datos que te va a pedir, ya rellenos con los de tus certificados.`);
        const ej = fraseEjemplo(guia);
        if (ej) lineas.push('', ej);
    }
    if (certificados < 2) {
        lineas.push('', 'Junto a él necesitarás el certificado que tenías de antes de la obra.');
    }
    lineas.push(
        '',
        'Guárdalos junto a tus facturas y los justificantes de pago: son los documentos que justifican la deducción si Hacienda te los pide.',
        '',
        'Cualquier duda, aquí estamos.',
        '*BROKERGY · Ingeniería Energética*',
    );
    return lineas.join('\n');
}

/**
 * La frase del EJEMPLO para los mensajes (null si la guía lleva el caso real).
 * La misma en el envío de la guía y en la entrega del certificado: el cliente no
 * puede leer en el WhatsApp una cifra y en el PDF otra.
 */
export function fraseEjemplo(guia) {
    const m = guia?.modalidad ? MODALIDADES[guia.modalidad] : null;
    const ej = guia?.ejemplo;
    if (!m || !ej?.calendario?.porPropietario) return null;
    return `Como no tenemos las facturas de tu obra, la guía lleva un *ejemplo*: con una obra de ${eur(ej.importe, 0)} (IVA incluido) te deducirías ${eur(ej.calendario.porPropietario, 0)}. Lo tuyo será el *${m.pct} %* de lo que hayas pagado.`;
}

/**
 * El párrafo que se añade al mensaje de ENTREGA del certificado (CEE directo)
 * cuando la guía viaja con él. Ahí el protagonista es el certificado; la guía va
 * detrás, así que no se repite el saludo ni la despedida.
 *
 * @param {object} guia
 * @param {object} [opts]
 * @param {boolean} [opts.unico] el certificado de "antes" es el que trajo el cliente
 */
export function textoGuiaEnEntrega(guia, { unico = false } = {}) {
    const m = guia?.modalidad ? MODALIDADES[guia.modalidad] : null;
    if (!m) return '';
    const lineas = [
        `Y como ${unico ? 'tu certificado, frente al que tenías de antes de la obra, acredita' : 'tus certificados acreditan'} la mejora energética de la vivienda, te mandamos también una *guía de una página* para aplicarte la *deducción del ${m.pct} %* en tu declaración de la Renta: dónde se marca en Renta Web y los datos que te va a pedir, ya rellenos.`,
    ];
    const ej = fraseEjemplo(guia);
    if (ej) lineas.push(ej);
    if (unico) lineas.push('Para la deducción necesitarás también el certificado que tenías de antes de la obra.');
    return lineas.join('\n\n');
}

/** Asunto del email. */
export function asuntoGuiaIrpf(guia) {
    const num = guia?.numeroExpediente ? `${guia.numeroExpediente} — ` : '';
    return `${num}Tus certificados energéticos y la guía para la deducción en la Renta`;
}

// ─── El documento ────────────────────────────────────────────────────────────

const ORANGE = '#F39200';
const GRAD = 'linear-gradient(90deg,#F39200 0%,#F8B019 30%,#CBD64A 70%,#9DC23B 100%)';
const GREEN = '#7FA62A';
const GREEN_BG = '#F3F8E6';
const DARK = '#1a1f24';
const GREY = '#5a636b';
const GREY2 = '#7a838b';
const LINE = '#e6e8e3';

/**
 * El HTML de la guía (A4, una página).
 * @param {object} guia     el resultado de `componerGuia`
 * @param {object} [opts]
 * @param {string} [opts.appUrl] de dónde se sirven las fuentes (Puppeteer rasteriza sobre about:blank)
 */
export function buildGuiaIrpfHtml(guia, { appUrl = origenApp() } = {}) {
    const g = guia || {};
    const m = g.modalidad ? MODALIDADES[g.modalidad] : null;
    const ini = g.certificados?.anterior || {};
    const fin = g.certificados?.posterior || {};
    const cal = g.calendario;
    const multi = (g.propietarios || 1) > 1;
    const tipoLabel = TIPOS_VIVIENDA[g.tipo]?.label || '—';

    // Por qué la acreditan los certificados, en una frase.
    let acredita = '';
    if (m?.indicador === 'epnr' && g.irpf?.estado === 'ok') {
        const ahorro = `el consumo de energía primaria no renovable baja un <b>${n1(g.irpf.ahorroPct)} %</b> (${n2(g.irpf.consumoIni)} → ${n2(g.irpf.consumoFin)} kWh/m²·año)`;
        acredita = g.irpf.porAhorro
            ? `Tus certificados lo acreditan: ${ahorro}; se exige al menos un ${UMBRAL_AHORRO} %.`
            : `Tus certificados lo acreditan: la vivienda alcanza la <b>letra ${esc(g.irpf.letraFin)}</b> en consumo de energía primaria no renovable (vale la A o la B).`;
    } else if (m?.indicador === 'demanda' && g.demanda?.estado === 'ok') {
        acredita = `Tus certificados lo acreditan: la demanda de calefacción y refrigeración baja un <b>${n1(g.demanda.ahorroPct)} %</b> (${n2(g.demanda.antes)} → ${n2(g.demanda.despues)} kWh/m²·año); se exige al menos un ${UMBRAL_DEMANDA} %.`;
    }

    // ── Caja de la estimación ──
    let estimacion = '';
    const ej = g.ejemplo?.calendario;
    if (m && ej && ej.porPropietario > 0) {
        // Sin facturas de la obra: un EJEMPLO, rotulado como tal en su cabecera y
        // en su nota. Nunca una cifra que parezca calculada sobre su obra.
        const reparto = ej.anios.map((a, k) => `<div class="est-fila"><span>${g.ejemplo.conAnio ? `Renta ${a.anio}` : `Año ${k + 1}`}</span><b>${eur(a.importe, 0)}</b></div>`).join('');
        const baseUsada = r2(ej.anios.reduce((s, a) => s + a.base, 0));
        const maxAnual = m.baseAnual * m.pct / 100;
        estimacion = `
          <div class="est-k">Ejemplo · obra de ${eur(g.ejemplo.importe, 0)}</div>
          <div class="est-v arc">${eur(ej.porPropietario, 0)}</div>
          <div class="est-rep">${reparto}</div>
          <div class="est-n">Si la obra costara ${eur(g.ejemplo.importe, 0)}, IVA incluido: ${m.pct} % de ${eur(baseUsada, 0)}${baseUsada < g.ejemplo.importe ? ' (la base máxima)' : ''}${ej.anios.length > 1 ? `, en ${ej.anios.length} declaraciones (máximo ${eur(maxAnual, 0)} al año)` : ''}. Lo tuyo será el ${m.pct} % de lo que hayas pagado${multi ? ', cada propietario por su parte' : ''}.</div>`;
    } else if (m && cal && cal.porPropietario > 0 && !g.soloCertificados) {
        const reparto = cal.anios.map(a => `<div class="est-fila"><span>Renta ${a.anio}</span><b>${eur(a.importe)}</b></div>`).join('');
        estimacion = `
          <div class="est-k">Deducción estimada${multi ? ' por propietario' : ''}</div>
          <div class="est-v arc">${eur(cal.porPropietario)}</div>
          <div class="est-rep">${reparto}</div>
          <div class="est-n">${m.pct} % de ${eur(cal.basePorPropietario)} pagados${multi ? ` (parte de cada uno de los ${g.propietarios} propietarios)` : ''}, IVA incluido. Máximo ${eur(m.baseAnual * m.pct / 100, 0)} al año${m.aniosExtra ? ` y ${eur(m.baseTotal * m.pct / 100, 0)} en total` : ''}.</div>`;
    } else if (m) {
        // Sin el importe de la obra no hay cifra que estimar: se dice el TOPE, que
        // es lo que el cliente quiere saber antes de sumar sus facturas.
        const maxAnual = m.baseAnual * m.pct / 100;
        const maxTotal = m.baseTotal * m.pct / 100;
        estimacion = `
          <div class="est-k">Lo máximo que puedes deducirte</div>
          <div class="est-v arc">${eur(maxTotal, 0)}</div>
          <div class="est-rep">
            <div class="est-fila"><span>Por año</span><b>${eur(maxAnual, 0)}</b></div>
            ${m.aniosExtra ? `<div class="est-fila"><span>Años para aplicarla</span><b>hasta ${m.aniosExtra + 1}</b></div>` : ''}
          </div>
          <div class="est-n">${m.pct} % de lo que hayas pagado por la obra, IVA incluido${multi ? ', por cada propietario' : ''}${m.aniosExtra ? `. Lo que pase de ${eur(maxAnual, 0)} un año, en los ${m.aniosExtra} siguientes` : ''}.</div>`;
    }

    // ── Datos de Renta Web ──
    const fila = (k, v) => `<tr><td class="k">${k}</td><td class="v" colspan="2">${v}</td></tr>`;
    const hueco = (txt) => `<span class="hueco">${esc(txt)}</span>`;
    const obraTxt = (o) => o
        ? `<b>${esc(o.nif)}</b>${o.nombre ? ` <span class="u">· ${esc(o.nombre)}</span>` : ''}`
        : hueco('el NIF de la empresa que hizo la obra (está en su factura)');

    const filasPar = m?.indicador === 'demanda'
        ? `<tr><td class="k">Demanda energética de calefacción y refrigeración <span class="u">kWh/m²·año</span></td><td class="c">${ini.demanda != null ? n2(ini.demanda) : '—'}</td><td class="c">${fin.demanda != null ? n2(fin.demanda) : '—'}</td></tr>`
        : `<tr><td class="k">Consumo de energía primaria no renovable <span class="u">kWh/m²·año</span></td><td class="c">${ini.consumo != null ? n2(ini.consumo) : '—'}</td><td class="c">${fin.consumo != null ? n2(fin.consumo) : '—'}</td></tr>
           <tr><td class="k">Letra de calificación energética <span class="u">consumo de energía</span></td><td class="c"><span class="letra">${esc(ini.letra || '—')}</span></td><td class="c"><span class="letra">${esc(fin.letra || '—')}</span></td></tr>`;

    const cantidad = g.soloCertificados
        ? `<b>${eur(g.total)}</b> <span class="u">de los certificados</span> + ${hueco('la suma de tus facturas de la obra, IVA incluido')}`
        : g.total > 0
        ? `<b>${eur(g.total)}</b> <span class="u">IVA incluido${multi ? ` · si sois ${g.propietarios} propietarios a partes iguales, cada uno pone ${eur(g.total / g.propietarios)}` : ''}</span>`
        : hueco('la suma de tus facturas de la obra, IVA incluido');

    const datos = `
      <table class="datos">
        ${g.modalidad === '60' ? fila('Contribuyente titular', 'El propietario de la vivienda que hace la declaración') : ''}
        ${fila('Situación <span class="u">clave</span>', '<b>1</b> <span class="u">· vivienda con referencia catastral en territorio común</span>')}
        ${fila('Referencia catastral', g.vivienda?.refCatastral ? `<b class="mono">${esc(g.vivienda.refCatastral)}</b>` : hueco('la referencia catastral de tu vivienda'))}
        ${fila('NIF/NIE de quien ha realizado las obras <span class="u">(1)</span>', obraTxt(g.obras?.[0]))}
        ${g.obras?.[1] ? fila('NIF/NIE de quien ha realizado las obras <span class="u">(2)</span>', obraTxt(g.obras[1])) : ''}
        <tr class="cab"><td></td><td class="c">Certificado ANTERIOR <span>· antes</span></td><td class="c">Certificado POSTERIOR <span>· después</span></td></tr>
        <tr><td class="k">Fecha del certificado de eficiencia energética</td><td class="c"><b>${esc(fechaEs(ini.fecha) || '—')}</b></td><td class="c"><b>${esc(fechaEs(fin.fecha) || '—')}</b></td></tr>
        ${filasPar}
        <tr class="sep"><td class="k">Cantidades satisfechas en ${g.anio || '—'} <span class="u">respecto de cada inmueble</span></td><td class="v" colspan="2">${cantidad}</td></tr>
      </table>`;

    // ── Facturas ──
    // Más de seis filas no caben con el resto de la hoja: las que pasan se
    // resumen en una línea con su importe, que el total sigue contando.
    const MAX_FILAS = 6;
    const lista = g.facturas || [];
    const visibles = lista.length > MAX_FILAS ? lista.slice(0, MAX_FILAS - 1) : lista;
    const resto = lista.slice(visibles.length);
    const filasFact = visibles.map(f => `
        <tr><td>${esc(f.numero || '—')}</td><td>${esc(fechaEs(f.fecha) || '—')}</td><td>${esc(f.emisor || '—')}${f.nif ? ` <span class="u">${esc(f.nif)}</span>` : ''}</td><td class="r">${eur(f.importe)}</td></tr>`).join('')
        + (resto.length ? `<tr><td colspan="3">Y ${resto.length} facturas más</td><td class="r">${eur(resto.reduce((s, f) => s + f.importe, 0))}</td></tr>` : '');
    const facturasHtml = lista.length ? `
      <table class="fact">
        <thead><tr><th>Nº factura</th><th>Fecha</th><th>Emitida por</th><th class="r">Importe IVA incl.</th></tr></thead>
        <tbody>${filasFact}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="r">${eur(g.total)}</td></tr></tfoot>
      </table>` : '';

    const periodo = ini.fecha && fin.fecha
        ? `entre el <b>${esc(fechaEs(ini.fecha))}</b> y el <b>${esc(fechaEs(fin.fecha))}</b> (las fechas de tus dos certificados)`
        : 'entre la fecha de tu certificado anterior y la del posterior';
    const masFacturas = (!lista.length || g.soloCertificados)
        ? `<div class="mas"><b>Suma tus facturas de la obra.</b> Todas las de las obras de mejora energética de esta vivienda —aerotermia, ventanas, aislamiento, placas solares…— pagadas ${periodo}, con su IVA, van a «Cantidades satisfechas»${g.soloCertificados ? ' junto a la de los certificados' : ''}. El NIF de quien hizo la obra está en esas facturas.${m && g.ejemplo ? ` Tu deducción es el <b>${m.pct} %</b> de esa suma, como en el ejemplo.` : ''}</div>`
        : `<div class="mas"><b>¿Tienes más facturas?</b> Si pagaste otras obras de mejora energética de esta vivienda —ventanas, aislamiento, placas solares…— ${periodo}, súmalas también a «Cantidades satisfechas», con su IVA. También cuenta lo que pagaste por los <b>certificados de eficiencia energética</b>.</div>`;

    // ── Ten en cuenta ──
    const notas = [
        'Solo cuentan los pagos por <b>transferencia, tarjeta, cheque nominativo o ingreso en cuenta</b>: lo pagado en efectivo no deduce.',
        'No incluyas el coste de equipos que usen <b>combustibles fósiles</b> (calderas de gas, gasóleo…).',
        g.negocio === 'cae'
            ? 'Si recibiste una <b>subvención</b> por esta obra, réstala. El <b>bono CAE no es una subvención</b>: no lo restes.'
            : 'Si recibiste una <b>subvención</b> por esta obra, réstala del importe.',
        m && m.aniosExtra
            ? `Lo que pase de ${eur(m.baseAnual * m.pct / 100, 0)} al año, Renta Web te lo deja para los ${m.aniosExtra} años siguientes: decláralo en «Exceso de cantidades satisfechas».`
            : 'Renta Web calcula sola la base y el importe de la deducción con los datos de arriba.',
        g.modalidad === '40' || g.modalidad === '20'
            ? 'Es para tu <b>vivienda habitual</b> o una vivienda que tengas <b>alquilada</b> como vivienda.'
            : 'Si la vivienda es de <b>varios propietarios</b>, cada uno se la aplica por la parte que pagó, con sus propios límites.',
        'Guarda las <b>facturas, los justificantes de pago y los certificados</b>: es lo que pide Hacienda si lo revisa.',
    ];

    const cabeceraNum = [g.numeroExpediente && `Expediente ${esc(g.numeroExpediente)}`, `preparada el ${esc(fechaEs(g.hoy) || '')}`].filter(Boolean).join(' · ');
    const ruta = ['Renta Web', ...RUTA_RENTA];

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  ${buildFontFaces(appUrl, FUENTE_FACTURA_SO)}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope', 'Segoe UI', Arial, sans-serif; color: ${DARK}; background: #fff; font-size: 10.4px; line-height: 1.4;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .arc { font-family: 'Archivo', 'Arial Black', Arial, sans-serif; }
  b { font-weight: 700; }
  .sheet { position: relative; width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
  .pad { padding: 0 38px; }
  .kick { font-size: 8.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: ${GREEN}; }
  .sec { margin-top: 13px; }
  .sec-t { font-size: 8.5px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: ${GREY2}; margin: 0 0 5px; display: flex; align-items: center; gap: 8px; }
  .sec-t::after { content: ''; flex: 1; height: 1px; background: ${LINE}; }
  .u { font-size: 8.5px; color: ${GREY2}; font-weight: 500; }

  .head { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 14px 38px 0; }
  .head h1 { font-size: 18px; line-height: 1.1; margin: 3px 0 2px; font-weight: 800; letter-spacing: 0.1px; text-align: right; white-space: nowrap; }
  .head .sub { font-size: 9px; color: ${GREY2}; text-align: right; }

  .strip { display: flex; border: 1px solid ${LINE}; border-radius: 9px; overflow: hidden; margin-top: 11px; }
  .strip > div { padding: 5px 11px; border-left: 1px solid ${LINE}; min-width: 0; }
  .strip > div:first-child { border-left: 0; }
  .strip .sk { font-size: 7.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: ${GREY2}; }
  .strip .sv { font-size: 9.5px; font-weight: 700; margin-top: 1px; line-height: 1.3; }

  .hero { display: flex; gap: 10px; margin-top: 10px; }
  .ded { flex: 1.5; border: 1px solid ${LINE}; border-radius: 11px; padding: 9px 14px 10px 17px; position: relative; background: #fff; }
  .ded::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: 11px 0 0 11px; background: ${GRAD}; }
  .ded-top { display: flex; align-items: center; gap: 12px; margin-top: 3px; }
  .ded-pct { font-size: 40px; font-weight: 800; line-height: 1; color: ${ORANGE}; white-space: nowrap; }
  .ded-nom { font-size: 12px; font-weight: 800; line-height: 1.22; }
  .ded-nom span { display: block; font-size: 9px; font-weight: 600; color: ${GREY}; margin-top: 2px; }
  .ded-ok { margin-top: 7px; background: ${GREEN_BG}; border-radius: 7px; padding: 6px 9px; font-size: 9.7px; color: #3d4f12; line-height: 1.35; }
  .est { flex: 1; border-radius: 11px; padding: 9px 14px; background: ${DARK}; color: #fff; display: flex; flex-direction: column; }
  .est-k { font-size: 8.5px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: #CBD64A; }
  .est-v { font-size: 25px; font-weight: 800; line-height: 1.05; margin-top: 3px; white-space: nowrap; }
  .est-rep { margin-top: 4px; }
  .est-fila { display: flex; justify-content: space-between; font-size: 9.5px; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .est-fila span { color: rgba(255,255,255,0.75); }
  .est-n { margin-top: auto; padding-top: 5px; font-size: 8px; color: rgba(255,255,255,0.62); line-height: 1.32; }

  /* Rejilla FIJA y no una cadena que se parte donde caiga: partida al azar dejaba
     un paso suelto en una línea y el 5 desplazado por su recuadro. Aquí todos los
     pasos llevan el MISMO relleno (con borde transparente los normales), así que
     los números caen en columna; el 5 ocupa la fila entera. */
  .ruta { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 12px; border: 1px solid ${LINE}; border-radius: 9px; padding: 4px 6px; background: #fbfbf9; }
  .ruta .p { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; line-height: 1.25; padding: 2.5px 8px 2.5px 4px; border: 1px solid transparent; border-radius: 6px; min-width: 0; }
  .ruta .n { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: ${ORANGE}; color: #fff; font-size: 8.5px; font-weight: 800; flex-shrink: 0; }
  .ruta .p.fin { grid-column: 1 / -1; background: #FFF1D6; border-color: #F8D49A; }
  .ruta .p.fin .luego { margin-left: auto; padding-left: 10px; font-size: 9.5px; font-weight: 600; color: ${GREY}; white-space: nowrap; }

  table { width: 100%; border-collapse: collapse; }
  .datos { border: 1px solid ${LINE}; border-radius: 9px; overflow: hidden; border-collapse: separate; border-spacing: 0; }
  .datos td { padding: 4.3px 10px; border-top: 1px solid ${LINE}; vertical-align: middle; }
  .datos tr:first-child td { border-top: 0; }
  .datos td.k { width: 44%; font-size: 9.8px; color: ${GREY}; background: #fbfbf9; }
  .datos td.v { font-size: 10.4px; }
  .datos td.c { text-align: center; font-size: 10.5px; width: 28%; }
  .datos tr.cab td { background: ${DARK}; color: #fff; font-size: 8.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 4px 10px; }
  .datos tr.cab td span { font-weight: 600; letter-spacing: 0; text-transform: none; color: rgba(255,255,255,0.65); }
  .datos tr.sep td { border-top: 2px solid ${ORANGE}; }
  .datos .letra { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 17px; padding: 0 5px; border-radius: 4px; background: ${DARK}; color: #fff; font-weight: 800; font-size: 10px; }
  .mono { letter-spacing: 0.4px; }
  .hueco { display: inline-block; color: ${GREY2}; font-style: italic; border-bottom: 1px dotted ${GREY2}; }

  .fact th { font-size: 7.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: ${GREY2}; text-align: left; padding: 2px 8px; border-bottom: 1px solid ${LINE}; }
  .fact td { font-size: 9.6px; padding: 3px 8px; border-bottom: 1px solid #f1f2ee; }
  .fact .r { text-align: right; white-space: nowrap; }
  .fact tfoot td { font-weight: 800; font-size: 10px; border-bottom: 0; padding-top: 3px; }
  .mas { margin-top: 7px; border-left: 3px solid ${GREEN}; background: ${GREEN_BG}; border-radius: 0 7px 7px 0; padding: 6px 10px; font-size: 9.7px; color: #33400f; line-height: 1.35; }

  .notas { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; padding: 0; margin: 0; list-style: none; }
  .notas li { font-size: 9.2px; color: ${GREY}; line-height: 1.33; padding-left: 11px; position: relative; }
  .notas li::before { content: ''; position: absolute; left: 0; top: 4.5px; width: 5px; height: 5px; border-radius: 50%; background: ${ORANGE}; }
  .notas b { color: ${DARK}; }

  .legal { margin-top: auto; padding: 9px 38px 7px; font-size: 7.6px; color: ${GREY2}; line-height: 1.38; }
  .band { padding: 9px 38px; background: ${DARK}; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  .band .s { font-weight: 700; font-size: 11px; line-height: 1.3; color: #fff; letter-spacing: 0.3px; }
  .band .s span { background: linear-gradient(90deg,#F8B019,#CBD64A,#9DC23B); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .band .c { font-size: 8px; color: rgba(255,255,255,0.6); text-align: right; line-height: 1.45; }
</style></head>
<body>
  <div class="sheet">
    <div style="height:5px; width:100%; background:${GRAD};"></div>

    <div class="head">
      <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:32px; width:auto; object-fit:contain; display:block;">
      <div>
        <div class="kick" style="text-align:right;">Guía para tu declaración de la Renta</div>
        <h1 class="arc">Cómo aplicar tu deducción por mejora energética</h1>
        <div class="sub">${cabeceraNum}</div>
      </div>
    </div>

    <div class="pad">
      <div class="strip">
        <div style="flex:1.1;"><div class="sk">Titular</div><div class="sv">${esc(g.titular?.nombre || '—')}${g.titular?.nif ? ` <span class="u">${esc(g.titular.nif)}</span>` : ''}</div></div>
        <div style="flex:1.6;"><div class="sk">Vivienda</div><div class="sv">${esc(g.vivienda?.direccion || '—')}</div></div>
        <div style="flex:0.7;"><div class="sk">Tipo</div><div class="sv">${esc(tipoLabel)}</div></div>
      </div>

      ${m ? `
      <div class="hero">
        <div class="ded">
          <div class="kick">La deducción que puedes aplicarte</div>
          <div class="ded-top">
            <div class="ded-pct arc">${m.pct}&nbsp;%</div>
            <div class="ded-nom">${esc(m.nombre)}<span>de lo que has pagado por la obra, IVA incluido${g.modalidad === '60' && g.tipo === 'unifamiliar' ? ' · válida para viviendas unifamiliares' : ''}</span></div>
          </div>
          ${acredita ? `<div class="ded-ok">✓ ${acredita}</div>` : ''}
        </div>
        <div class="est">${estimacion}</div>
      </div>` : ''}

      <div class="sec">
        <div class="sec-t">Dónde se pone en Renta Web</div>
        <div class="ruta">
          ${ruta.map((t, i) => `<div class="p"><span class="n">${i + 1}</span><span>${esc(t)}</span></div>`).join('')}
          <div class="p fin"><span class="n">${ruta.length + 1}</span><span>${esc(m?.opcionRenta || 'La opción de tu deducción')}</span><span class="luego">→ «Alta inmueble» y copia los datos de abajo</span></div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-t">Los datos que te va a pedir · cópialos tal cual</div>
        ${datos}
      </div>

      <div class="sec">
        <div class="sec-t">Facturas incluidas en «Cantidades satisfechas»</div>
        ${facturasHtml}
        ${masFacturas}
      </div>

      <div class="sec">
        <div class="sec-t">Ten en cuenta</div>
        <ul class="notas">${notas.map(t => `<li>${t}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="legal">
      Guía orientativa elaborada por BROKERGY con los datos de tus certificados de eficiencia energética, conforme a la disposición adicional quincuagésima de la Ley 35/2006 del IRPF${m ? ` (vigente para obras pagadas hasta el ${esc(fechaEs(m.hasta))})` : ''}. No sustituye al asesoramiento fiscal: la deducción depende de tu situación personal —cuota del impuesto, titularidad, otras ayudas—. Ante cualquier duda, consulta con tu asesor o con el Asistente de Renta de la Agencia Tributaria.
    </div>
    <div class="band">
      <div class="s arc">LA ENERGÍA NI SE CREA NI SE DESTRUYE,<br><span>BROKERGY LA TRANSFORMA EN DINERO.</span></div>
      <div style="display:flex; align-items:center; gap:11px;">
        <div class="c">info@brokergy.es · 695 615 330<br>app.brokergy.es</div>
        <img src="${BROKERGY_CIRCULAR_DATAURI}" alt="" style="height:36px; width:36px; object-fit:contain; flex-shrink:0;">
      </div>
    </div>
  </div>
</body></html>`;
}
