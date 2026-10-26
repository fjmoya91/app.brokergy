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
// En un expediente CAE la guía lleva una SEGUNDA hoja, «Tu bono CAE en la Renta»
// (26/10/2026): el bono no se resta de la deducción y su justificante es la carta
// de pago, no una «resolución» (ver `datosBonoCae`). Sale también suelta
// (`buildHojaBonoCaeHtml`). En un CEE directo, la guía sigue siendo de una hoja.
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
import { buildFontFaces, FUENTE_INTER, origenApp } from './fuentesDoc.js';
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from '../../lotes/logic/facturaLogo.js';
import { calcularIrpfGananciaPatrimonial } from '../../calculator/logic/calculation.js';

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
    // Lo que decide el 40 % es la DIVISIÓN HORIZONTAL (participación < 100 % en el
    // Catastro), y ahí caben un piso y una vivienda EN HILERA que comparte finca
    // (2026CEE_60). Cuál de los dos es lo dice `descripcionTipo`.
    piso: { label: 'Vivienda en división horizontal (piso o en hilera)', corto: 'Piso / hilera' },
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

/**
 * Cómo se le NOMBRA al cliente su vivienda. El tipo `piso` es "en división
 * horizontal", y eso es tanto un piso como una vivienda EN HILERA que comparte
 * finca: decirle a la dueña de un adosado que vive en "un edificio dividido en
 * pisos" es decirle algo falso de su casa (2026CEE_60). Si el certificado la
 * declara unifamiliar y aun así está en división horizontal, es la hilera.
 */
export function descripcionTipo({ tipo, tipoCee } = {}) {
    if (tipo === 'piso') return tipoCee === 'unifamiliar' ? 'Vivienda unifamiliar en hilera (división horizontal)' : 'Piso (división horizontal)';
    return TIPOS_VIVIENDA[tipo]?.label || null;
}

/**
 * El tipo de vivienda cuando nadie lo ha elegido a mano en el popup.
 *
 * REGLA — manda el CATASTRO, como en la oportunidad: una vivienda con
 * participación < 100 % está en una finca en DIVISIÓN HORIZONTAL y va como
 * PISO (40 %), diga lo que diga el certificado. Es el mismo criterio de
 * `calculateFinancials` (`tipo === 'piso' || participation < 100`) y de la ficha
 * del inmueble (`PropertySheet`). Medido en 2026CEE_60: el certificado declara
 * «ViviendaUnifamiliar» y el Catastro le da un 16 % de participación — la guía
 * salió al 60 % y se le mandó así a la clienta.
 *
 * Solo un «edificio completo» que declare el propio certificado se respeta: la
 * participación es de UN inmueble y un bloque entero no la tiene. Con el 100 %
 * (o sin dato) decide el certificado, y si tampoco lo dice, la simulación.
 *
 * @returns {{tipo:string|null, origen:'catastro'|'certificado'|'simulacion'|null, participacion:number|null}}
 */
export function tipoAutomatico({ tipoCee, participacion, tipoSimulacion } = {}) {
    const p = Number(String(participacion ?? '').replace('%', '').replace(',', '.'));
    const part = isFinite(p) && p > 0 ? r2(p) : null;
    if (tipoCee === 'bloque') return { tipo: 'bloque', origen: 'certificado', participacion: part };
    // Lo mismo que decidió la simulación al calcular la oportunidad (CAE).
    if ((part != null && part < 100) || tipoSimulacion === 'piso') {
        return { tipo: 'piso', origen: part != null && part < 100 ? 'catastro' : 'simulacion', participacion: part };
    }
    if (tipoCee) return { tipo: tipoCee, origen: 'certificado', participacion: part };
    if (TIPOS_VIVIENDA[tipoSimulacion]) return { tipo: tipoSimulacion, origen: 'simulacion', participacion: part };
    return { tipo: null, origen: null, participacion: part };
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
        if (tipo === 'piso') return { modalidad: '40', motivo: 'Vivienda en división horizontal (piso o en hilera): deducción del 40 % (la del 60 % es para viviendas unifamiliares independientes y obras de toda la comunidad).' };
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
 * El BONO CAE en la Renta (26/10/2026, Fran: «muchos clientes y gestores lo restan
 * del coste de la obra, como las subvenciones de antes, y me piden el justificante
 * de la resolución»).
 *
 * REGLA — el bono CAE NO se resta de las «Cantidades satisfechas». La DA 50ª solo
 * descuenta lo «subvencionado a través de un programa de ayudas públicas» con
 * resolución definitiva de concesión (las ayudas del RD 853/2021 o del 477/2021), y
 * el bono no lo concede ninguna Administración: es el precio que paga un sujeto
 * obligado por los ahorros que el cliente cede (RD 36/2023). Tributa aparte, como
 * GANANCIA PATRIMONIAL en la base del ahorro (DGT V2137-25), con la escala de
 * `calcularIrpfGananciaPatrimonial`. No hay resolución: el justificante es la CARTA
 * DE PAGO (cartaPagoService), con el convenio de cesión firmado.
 *
 * Con el bono ya cobrado van su importe, su carta y el impuesto aproximado; sin
 * cobrar, la hoja lo explica sin cifras (nunca un importe previsto que luego no sea).
 */
export function datosBonoCae(c) {
    const importe = Number(c?.importe);
    const cobrado = isFinite(importe) && importe > 0;
    return {
        importe: cobrado ? r2(importe) : null,
        fechaPago: isoOk(c?.fechaPago) ? String(c.fechaPago).slice(0, 10) : null,
        carta: String(c?.carta || '').trim() || null,
        // Aproximado: el tramo depende de las OTRAS ganancias del ahorro del año.
        impuesto: cobrado ? r2(calcularIrpfGananciaPatrimonial(importe)) : null,
    };
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
 * @param {string} [d.tipoSimulacion]     'unifamiliar'|'piso' de la oportunidad
 * @param {number} [d.participacion]      % de participación del inmueble en el Catastro (< 100 → piso)
 * @param {string} [d.catastroError]      por qué no se pudo consultar el Catastro (se avisa)
 * @param {string} [d.tipoManual]         lo elegido en el popup (manda)
 * @param {{cee, xml, fecha, rotulo}} d.anterior   certificado de antes de la obra
 * @param {{cee, xml, fecha, rotulo}} d.posterior  certificado de después
 * @param {Array}  d.facturas  [{ id, numero, fecha, emisor, nif, importe (con IVA), ivaEstimado, incluir }]
 * @param {Array}  [d.obras]   [{ nif, nombre }] quien hizo la obra si las facturas no lo dicen
 * @param {{importe, fechaPago, carta}} [d.cae]  el bono CAE COBRADO (del cobro del expediente); sin él, la hoja del bono va sin cifras
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
    const { tipo: tipoAuto, origen: origenAuto, participacion } = tipoAutomatico({
        tipoCee, participacion: d.participacion, tipoSimulacion: d.tipoSimulacion,
    });
    const tipo = TIPOS_VIVIENDA[d.tipoManual] ? d.tipoManual : tipoAuto;
    const tipoOrigen = TIPOS_VIVIENDA[d.tipoManual] ? 'manual' : origenAuto;

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
    if (!tipo) avisos.push('No consta el tipo de vivienda (ni en el Catastro ni en el certificado): elígelo.');
    else if (tipoOrigen === 'simulacion' && !tipoCee) avisos.push('El tipo de vivienda sale de la simulación: el certificado no lo declara.');
    // El certificado y el Catastro no dicen lo mismo: va lo del Catastro, y se dice.
    if (tipoOrigen !== 'manual' && tipoCee && tipo && tipoCee !== tipo && TIPOS_VIVIENDA[tipoCee]) {
        avisos.push(`El certificado dice «${TIPOS_VIVIENDA[tipoCee].label}», pero ${tipoOrigen === 'catastro'
            ? `en el Catastro la vivienda tiene una participación del ${n2(participacion)} % (división horizontal)`
            : 'la simulación de la oportunidad la calculó como piso'}: va como ${(descripcionTipo({ tipo, tipoCee }) || TIPOS_VIVIENDA[tipo].label).toLowerCase()}${m ? ` → deducción del ${m.pct} %` : ''}, igual que en la oportunidad. Si no lo es, cámbialo arriba.`);
    }
    if (d.catastroError && tipoOrigen !== 'manual') {
        avisos.push(`No se ha podido consultar el Catastro (${d.catastroError}): el tipo de vivienda sale del certificado. Compruébalo: si es un piso, la deducción es la del 40 %.`);
    }
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
        // Solo en un expediente CAE: la guía lleva la hoja «Tu bono CAE en la Renta».
        cae: (d.negocio || 'cae') === 'cae' ? datosBonoCae(d.cae) : null,
        titular: { nombre: d.titular?.nombre || '', nif: d.titular?.nif || '' },
        vivienda: {
            direccion: d.vivienda?.direccion || '',
            refCatastral: d.vivienda?.refCatastral || pos?.refCatastral || pos?.identificacion?.refCatastral || ant?.identificacion?.refCatastral || '',
            provincia: d.vivienda?.provincia || '',
        },
        tipo,
        tipoOrigen,
        tipoCee,
        // Lo que saldría sin tocar nada (para que el popup sepa volver a "automático").
        tipoDescripcion: descripcionTipo({ tipo, tipoCee }),
        tipoAuto,
        tipoAutoOrigen: origenAuto,
        participacion,
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
export function mensajeGuiaIrpf(guia, { nombre = '', certificados = 2, previa = null } = {}) {
    const pila = String(nombre || '').trim().split(/\s+/)[0];
    const saludo = pila ? `¡Hola ${pila.charAt(0).toUpperCase()}${pila.slice(1).toLowerCase()}!` : '¡Hola!';
    const m = guia?.modalidad ? MODALIDADES[guia.modalidad] : null;
    const certs = certificados >= 2
        ? 'tus *dos certificados de eficiencia energética* (el de antes y el de después de la obra)'
        : 'tu *certificado de eficiencia energética*';
    const lineas = [saludo, ''];
    const correccion = esCorreccion(guia, previa);
    if (correccion) {
        // Ya tiene una guía con OTRO porcentaje: lo primero que tiene que leer es
        // que la anterior no vale y por qué. Si no, se queda con dos guías que
        // dicen cosas distintas y aplica la que tenga más a mano.
        const pm = MODALIDADES[previa.modalidad];
        const fecha = fechaEs(String(previa.at || '').slice(0, 10));
        lineas.push(
            `Te reenviamos la *guía para la deducción en la Renta*, *corregida*: en la que te mandamos${fecha ? ` el ${fecha}` : ''} te indicábamos la deducción del ${pm.pct} %, pero la que te corresponde es la del *${m.pct} %*${motivoDelTipo(guia)}. Usa esta y descarta la anterior.`,
            '',
            `Te adjuntamos de nuevo ${certificados >= 2 ? 'tus certificados de eficiencia energética, que no cambian' : 'tu certificado de eficiencia energética, que no cambia'}, para que lo tengas todo junto.`,
        );
    } else {
        lineas.push(`Te enviamos ${certs} y una *guía${guia?.cae ? '' : ' de una página'}* para que puedas aplicarte la deducción por obras de mejora energética en tu declaración de la Renta.`);
        const ahorro = fraseAhorro(guia);
        if (ahorro) lineas.push('', ahorro);
        if (m) lineas.push('', `En la guía tienes la deducción que puedes aplicar (*${m.pct} %*), dónde se marca en Renta Web y todos los datos que te va a pedir, ya rellenos con los de tus certificados.`);
    }
    if (guia?.cae) {
        // La duda que más llega de los gestores: restar el bono y pedir «la resolución».
        const carta = guia.cae.importe > 0
            ? `la *carta de pago*${guia.cae.carta ? ` (${guia.cae.carta})` : ''} que te enviamos con la transferencia`
            : 'la *carta de pago* que te enviaremos con la transferencia del bono';
        lineas.push('', `En la segunda hoja te explicamos el *bono CAE*: *no se resta* de lo que pagaste por la obra (no es una subvención) y no tiene resolución; tu justificante ${guia.cae.importe > 0 ? 'es' : 'será'} ${carta}, junto con el convenio de cesión que firmaste. Si tu gestor te pide «la resolución», enséñale esa hoja.`);
    }
    if (m) {
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
 * El AHORRO de energía que acreditan los certificados, para los MENSAJES (con *negrita*
 * de WhatsApp). Son las cifras de la frase «Tus certificados lo acreditan» del PDF:
 * Fran, 26/10/2026 (2026CEE_61), «me han preguntado qué y cuánto se ahorra; que vaya
 * también en el mensaje», porque en la guía no se ve a la primera.
 * null si la guía no lleva cifras (sin modalidad, o sin certificados comparados).
 *
 * @param {object} guia
 * @param {object} [opts]
 * @param {boolean} [opts.tercero] el mensaje es para quien NO es el propietario (partner)
 */
export function fraseAhorro(guia, { tercero = false } = {}) {
    const m = guia?.modalidad ? MODALIDADES[guia.modalidad] : null;
    if (!m) return null;
    const viv = tercero ? 'la vivienda' : 'tu vivienda';
    const titulo = `📉 *Lo que ahorra ${viv}:*`;
    const de = (a, b) => `de ${n2(a)} a ${n2(b)} kWh/m²·año`;
    const ir = guia.irpf;
    if (m.indicador === 'epnr' && ir?.estado === 'ok') {
        const letras = ir.letraIni && ir.letraFin && ir.letraIni !== ir.letraFin ? `, de la letra ${ir.letraIni} a la ${ir.letraFin}` : '';
        if (ir.porAhorro) {
            return `${titulo} con la obra, su consumo de energía primaria no renovable baja un *${n1(ir.ahorroPct)} %*: ${de(ir.consumoIni, ir.consumoFin)}${letras}. Para la deducción se exige al menos un ${UMBRAL_AHORRO} %.`;
        }
        const baja = ir.ahorroPct > 0 ? `baja un *${n1(ir.ahorroPct)} %* (${de(ir.consumoIni, ir.consumoFin)}) y ` : '';
        return `${titulo} con la obra, su consumo de energía primaria no renovable ${baja}alcanza la *letra ${ir.letraFin}*, que es lo que exige la deducción (la A o la B).`;
    }
    const d = guia.demanda;
    if (m.indicador === 'demanda' && d?.estado === 'ok') {
        return `${titulo} con la obra, su demanda de calefacción y refrigeración baja un *${n1(d.ahorroPct)} %*: ${de(d.antes, d.despues)}. Para la deducción se exige al menos un ${UMBRAL_DEMANDA} %.`;
    }
    return null;
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
    // El ahorro va DELANTE, con sus cifras: es lo primero que pregunta el cliente.
    const ahorro = fraseAhorro(guia);
    const porQue = ahorro
        ? `Con ${unico ? 'este certificado, frente al que tenías de antes de la obra,' : 'tus certificados'} puedes aplicarte la *deducción del ${m.pct} %* en tu declaración de la Renta, así que te mandamos también una *guía de una página*: dónde se marca en Renta Web y los datos que te va a pedir, ya rellenos.`
        : `Y como ${unico ? 'tu certificado, frente al que tenías de antes de la obra, acredita' : 'tus certificados acreditan'} la mejora energética de la vivienda, te mandamos también una *guía de una página* para aplicarte la *deducción del ${m.pct} %* en tu declaración de la Renta: dónde se marca en Renta Web y los datos que te va a pedir, ya rellenos.`;
    const lineas = [ahorro, porQue].filter(Boolean);
    const ej = fraseEjemplo(guia);
    if (ej) lineas.push(ej);
    if (unico) lineas.push('Para la deducción necesitarás también el certificado que tenías de antes de la obra.');
    return lineas.join('\n\n');
}

/**
 * ¿La guía que se va a mandar CORRIGE una ya enviada? Solo si cambia el
 * porcentaje: reenviarla con lo mismo no es una corrección.
 * @param {object} guia
 * @param {{modalidad:string, at:string}|null} previa  lo sellado del último envío
 */
export function esCorreccion(guia, previa) {
    return !!(guia?.modalidad && previa?.modalidad && MODALIDADES[previa.modalidad] && previa.modalidad !== guia.modalidad);
}

/** Por qué corresponde ESTA deducción, en lenguaje de cliente (para la corrección). */
function motivoDelTipo(guia) {
    if (guia?.tipo === 'piso') {
        const part = guia.participacion != null && guia.participacion < 100 ? ` (en el Catastro tiene una participación del ${n2(guia.participacion)} %)` : '';
        return guia.tipoCee === 'unifamiliar'
            ? `, porque tu vivienda, en hilera, forma parte de una finca en régimen de división horizontal${part}`
            : `, porque tu vivienda es un piso dentro de un edificio en régimen de división horizontal${part}`;
    }
    if (guia?.tipo === 'unifamiliar') return ', porque tu vivienda es unifamiliar';
    if (guia?.tipo === 'bloque') return ', porque la obra es de todo el edificio';
    return '';
}

/** Asunto del email. */
export function asuntoGuiaIrpf(guia, { previa = null } = {}) {
    const num = guia?.numeroExpediente ? `${guia.numeroExpediente} — ` : '';
    if (esCorreccion(guia, previa)) return `${num}Guía CORREGIDA para la deducción en la Renta (${MODALIDADES[guia.modalidad].pct} %)`;
    return `${num}Tus certificados energéticos y la guía para la deducción en la Renta`;
}

// ─── El documento ────────────────────────────────────────────────────────────

// Estilo «carta de pago» (regla 164, 26/10/2026): los tokens de la carta del
// Bono CAE (plantillas/carta_pago_bono_cae.html), que es su misma hoja impresa.
const ORANGE = '#ffa000';        // relleno (números de la ruta, filete de la tabla)
const ORANGE_TXT = '#b33a0a';    // naranja como TEXTO sobre blanco
const GRAD = 'linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%)';
const GREEN = '#b1d13e';
const GREEN_TXT = '#4d6b0f';
const GREEN_BG = 'rgba(177,209,62,.14)';
const LIMA = '#c7f601';
const DARK = '#141111';
const CREMA = '#faf9f7';
const GREY = '#55585f';
const GREY2 = '#6b6e76';
const LINE = 'rgba(20,17,17,.10)';

/**
 * El HTML de la guía (A4, una página).
 * @param {object} guia     el resultado de `componerGuia`
 * @param {object} [opts]
 * @param {string} [opts.appUrl] de dónde se sirven las fuentes (Puppeteer rasteriza sobre about:blank)
 */
/**
 * Lo mismo que la guía en PDF, para la PANTALLA del cliente (portal, «Para tu Renta»,
 * 24/10/2026): qué deducción, dónde se marca en Renta Web y los datos que pide, con
 * los MISMOS rótulos literales que el PDF. Sin facturas una a una (van en el PDF).
 * Con `puede: false`, solo el motivo: no se le enseña una deducción que no tiene.
 */
export function resumenRentaCliente(g) {
    if (!g?.puede || !g.modalidad) return { puede: false, motivo: g?.motivo || null };
    const m = MODALIDADES[g.modalidad];
    const ini = g.certificados?.anterior || {};
    const fin = g.certificados?.posterior || {};
    const obra = (o) => (o ? [o.nif, o.nombre].filter(Boolean).join(' · ') : null);
    // `copiar` (24/10/2026, portal): lo que el cliente TECLEA en esa casilla de Renta
    // Web, sin el rótulo ni el nombre de la empresa — el botón «Copiar» del portal.
    // La cantidad, sin separador de miles y con coma decimal, como la admite el campo.
    const cantidad = g.total > 0 && !g.soloCertificados ? Number(g.total).toFixed(2).replace('.', ',') : null;
    const filas = [
        g.modalidad === '60' ? { k: 'Contribuyente titular', v: 'El propietario de la vivienda que hace la declaración' } : null,
        { k: 'Situación (clave)', v: '1 · vivienda con referencia catastral en territorio común', copiar: '1' },
        { k: 'Referencia catastral', v: g.vivienda?.refCatastral || null, mono: true, copiar: g.vivienda?.refCatastral || null },
        { k: 'NIF/NIE de quien ha realizado las obras (1)', v: obra(g.obras?.[0]), copiar: g.obras?.[0]?.nif || null },
        g.obras?.[1] ? { k: 'NIF/NIE de quien ha realizado las obras (2)', v: obra(g.obras[1]), copiar: g.obras[1].nif || null } : null,
        {
            k: g.total > 0 ? `Cantidades satisfechas en ${g.anio || '—'}` : 'Cantidades satisfechas',
            v: cantidad ? `${eur(g.total)} (IVA incluido)` : 'La suma de tus facturas de la obra, IVA incluido',
            copiar: cantidad,
        },
    ].filter(Boolean);
    const porDemanda = m?.indicador === 'demanda';
    return {
        puede: true,
        pct: m.pct,
        nombre: m.nombre,
        ruta: [...RUTA_RENTA, m.opcionRenta],
        filas,
        certificados: {
            rotulo: porDemanda ? 'Demanda de calefacción y refrigeración (kWh/m²·año)' : 'Consumo de energía primaria no renovable (kWh/m²·año)',
            anterior: { fecha: fechaEs(ini.fecha), valor: porDemanda ? ini.demanda : ini.consumo, letra: porDemanda ? null : ini.letra || null },
            posterior: { fecha: fechaEs(fin.fecha), valor: porDemanda ? fin.demanda : fin.consumo, letra: porDemanda ? null : fin.letra || null },
        },
    };
}

export function buildGuiaIrpfHtml(guia, { appUrl = origenApp() } = {}) {
    const g = guia || {};
    const m = g.modalidad ? MODALIDADES[g.modalidad] : null;
    const ini = g.certificados?.anterior || {};
    const fin = g.certificados?.posterior || {};
    const cal = g.calendario;
    const multi = (g.propietarios || 1) > 1;
    const tipoLabel = g.tipoDescripcion || TIPOS_VIVIENDA[g.tipo]?.label || '—';

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
            ? 'Si recibiste una <b>subvención</b> pública, réstala. El <b>bono CAE no se resta</b>: no es una subvención (hoja 2).'
            : 'Si recibiste una <b>subvención</b> por esta obra, réstala del importe.',
        m && m.aniosExtra
            ? `Lo que pase de ${eur(m.baseAnual * m.pct / 100, 0)} al año, Renta Web te lo deja para los ${m.aniosExtra} años siguientes: decláralo en «Exceso de cantidades satisfechas».`
            : 'Renta Web calcula sola la base y el importe de la deducción con los datos de arriba.',
        g.modalidad === '40' || g.modalidad === '20'
            ? 'Es para tu <b>vivienda habitual</b> o una vivienda que tengas <b>alquilada</b> como vivienda.'
            : 'Si la vivienda es de <b>varios propietarios</b>, cada uno se la aplica por la parte que pagó, con sus propios límites.',
        'Guarda las <b>facturas, los justificantes de pago y los certificados</b>: es lo que pide Hacienda si lo revisa.',
    ];

    const ruta = ['Renta Web', ...RUTA_RENTA];

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>${estiloGuia(appUrl)}</style></head>
<body>
  <div class="sheet">
    <div class="filete"></div>

    ${cabeceraHoja('Guía para tu declaración de la Renta', g)}

    <div class="pad">
      <h1 class="arc">Cómo aplicar tu deducción <span class="mark">en la Renta</span></h1>

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
          ${''/* Dentro de la tarjeta, al lado de la estimación: fuera de ella la hoja no cabe. */}
          ${acredita ? `<div class="ded-ok"><span class="ok">✓</span><span>${acredita}</span></div>` : ''}
        </div>
        <div class="est">${estimacion}</div>
      </div>` : ''}

      <div class="sec">
        <div class="sec-t">Dónde se pone en Renta Web</div>
        <div class="ruta">
          ${ruta.map((t, i) => `<div class="p"><span class="n">${i + 1}</span><span>${esc(t)}</span></div>`).join('')}
          <div class="p fin"><span class="n">${ruta.length + 1}</span><span class="opc">${esc(m?.opcionRenta || 'La opción de tu deducción')}</span><span class="luego">→ «Alta inmueble» y copia los datos de abajo</span></div>
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
    ${bandaPie()}
  </div>
  ${g.cae ? hojaBonoCae(g) : ''}
</body></html>`;
}

/**
 * La hoja «Tu bono CAE en la Renta» SUELTA (26/10/2026): para mandársela a quien
 * pide «el justificante de la resolución» sin esperar a su guía. Sin datos sale
 * genérica; con `cae` (de `datosBonoCae`) y el expediente, con sus cifras.
 */
export function buildHojaBonoCaeHtml({ numeroExpediente = '', cae = null, hoy = null } = {}, { appUrl = origenApp() } = {}) {
    const g = { numeroExpediente, hoy: hoy || new Date().toISOString().slice(0, 10), cae: cae || datosBonoCae(null), suelta: true };
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>${estiloGuia(appUrl)}</style></head>
<body>
  ${hojaBonoCae(g)}
</body></html>`;
}

function cabeceraHoja(kicker, g) {
    return `<div class="head">
      <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:32px; width:auto; object-fit:contain; display:block;">
      <div class="ref">
        <div class="kick">${esc(kicker)}</div>
        ${g.numeroExpediente ? `<div class="n">Expediente ${esc(g.numeroExpediente)}</div>` : ''}
        <div class="sub">Preparada el ${esc(fechaEs(g.hoy) || '')}</div>
      </div>
    </div>`;
}

function bandaPie() {
    return `<div class="band">
      <div class="s">BROKERGY · Ingeniería energética<span>Ahorra energía, gana dinero, ayuda al planeta</span></div>
      <div style="display:flex; align-items:center; gap:11px;">
        <div class="c">info@brokergy.es · 695 615 330<br>app.brokergy.es</div>
        <img src="${BROKERGY_CIRCULAR_DATAURI}" alt="" style="height:36px; width:36px; object-fit:contain; flex-shrink:0;">
      </div>
    </div>`;
}

/** La hoja del bono CAE (ver `datosBonoCae`). Una A4 más, con la misma cabecera y pie. */
function hojaBonoCae(g) {
    const c = g.cae || {};
    const cobrado = c.importe > 0;
    const pasa6000 = cobrado && c.importe > 6000;
    const escala = '<b>19 %</b> hasta 6.000 € y <b>21 %</b> de 6.000 a 50.000 €';
    // El ejemplo del error: la obra es de EJEMPLO; el bono, el suyo si ya se cobró
    // (y la obra, al menos el triple, que un bono de 8.100 € sobre 12.000 no es creíble).
    const bonoEj = cobrado ? Math.round(c.importe) : 1500;
    const OBRA_EJ = Math.max(12000, Math.ceil((bonoEj * 3) / 1000) * 1000);
    const justificante = cobrado && c.carta
        ? `la <b>carta de pago ${esc(c.carta)}</b> que te enviamos con la transferencia${c.fechaPago ? ` del ${esc(fechaEs(c.fechaPago))}` : ''}`
        // Sin cobro en la guía de un expediente, aún no la tiene; la suelta no sabe si ya se pagó.
        : `la <b>carta de pago</b> que ${g.suelta ? 'recibes' : 'te enviaremos'} con la transferencia del bono`;

    const cifra = cobrado
        ? `<div class="est-k">Tu bono CAE</div>
          <div class="est-v arc">${eur(c.importe)}</div>
          <div class="est-rep">
            <div class="est-fila"><span>Tributa al</span><b>${pasa6000 ? '19 % y 21 %' : '19 %'}</b></div>
            <div class="est-fila"><span>Impuesto aproximado</span><b>${eur(c.impuesto, 0)}</b></div>
          </div>
          <div class="est-n">Si este año no tienes otras ganancias del ahorro (intereses, venta de acciones…): ${pasa6000 ? 'el 19 % de los primeros 6.000 € y el 21 % del resto' : 'el 19 % del bono'}. No lleva retención: se paga en la declaración.</div>`
        : `<div class="est-k">Cómo tributa el bono</div>
          <div class="est-v arc">19&nbsp;% · 21&nbsp;%</div>
          <div class="est-n" style="margin-top:6px;">Es una <b style="color:#fff;">ganancia patrimonial</b> y va a la base del ahorro: ${escala} (sumado a tus otras ganancias del ahorro del año). No lleva retención: se paga en la declaración.</div>`;

    return `
  <div class="sheet hoja2">
    <div class="filete"></div>

    ${cabeceraHoja('Tu bono CAE en la Renta', g)}

    <div class="pad">
      <h1 class="arc">El bono CAE <span class="mark">no es una subvención</span></h1>
      <p class="lead">Muchos gestores lo tratan como las ayudas públicas de antes y lo restan de lo que pagaste por la obra. <b>Con el bono CAE no se hace así</b>, y por eso tampoco existe una «resolución» que enseñar.</p>

      <div class="hero">
        <div class="ded">
          <div class="kick">En la deducción por la obra</div>
          <div class="ded-top">
            <div class="ded-pct arc" style="font-size:40px;">No se resta</div>
          </div>
          <div class="ded-ok"><span class="ok">✓</span><span>En «Cantidades satisfechas» va <b>todo lo que pagaste</b> por la obra, IVA incluido, sin descontar el bono. La deducción${g.suelta ? '' : ' de la hoja 1'} se calcula sobre esa cifra.</span></div>
        </div>
        <div class="est">${cifra}</div>
      </div>

      <div class="sec">
        <div class="sec-t">Por qué no se resta</div>
        <div class="razones">
          <div class="rz">
            <div class="rz-t">Lo que dice la ley</div>
            <p>La deducción solo descuenta lo <b>«subvencionado a través de un programa de ayudas públicas»</b> con su resolución de concesión (disposición adicional quincuagésima de la Ley 35/2006 del IRPF).</p>
            <p class="u2">Es lo que pasaba con las ayudas de los programas del <b>Real Decreto 853/2021</b> (rehabilitación residencial) o del <b>477/2021</b> (autoconsumo y renovables térmicas): ahí sí se restaba lo concedido.</p>
          </div>
          <div class="rz">
            <div class="rz-t">Qué es el bono CAE</div>
            <p>No lo concede ninguna Administración. Es el <b>precio</b> que una empresa obligada a ahorrar energía paga por los ahorros que genera tu obra y que tú le <b>cediste</b> al firmar el convenio (Sistema de Certificados de Ahorro Energético, Real Decreto 36/2023).</p>
            <p class="u2">Por eso Hacienda lo trata como una <b>ganancia patrimonial</b>, no como una subvención (Dirección General de Tributos, consulta vinculante V2137-25, de 11/11/2025).</p>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-t">El error más frecuente, con números · ejemplo con una obra de ${eur(OBRA_EJ, 0)}</div>
        <div class="error">
          <div class="mal">
            <div class="e-k">✗ Así no</div>
            <div class="e-v arc">${eur(OBRA_EJ - bonoEj, 0)}</div>
            <div class="e-n">en «Cantidades satisfechas»: ${eur(OBRA_EJ, 0)} de la obra <b>menos</b> ${eur(bonoEj, 0)} del bono. Pierdes deducción.</div>
          </div>
          <div class="bien">
            <div class="e-k">✓ Así sí</div>
            <div class="e-v arc">${eur(OBRA_EJ, 0)}</div>
            <div class="e-n">en «Cantidades satisfechas», todo lo pagado. Y los ${eur(bonoEj, 0)} del bono, <b>aparte</b>, como ganancia patrimonial.</div>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-t">¿Y el justificante de la resolución?</div>
        <div class="just">
          <div class="just-i arc">CP</div>
          <div>
            <b>No hay resolución, porque el bono no se concede: se cobra.</b> Tu justificante es ${justificante}, junto con el <b>convenio de cesión de ahorros</b> que firmaste. Guárdalos con las facturas de la obra: es lo que enseñarás si Hacienda o tu gestor te lo piden.
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-t">Cómo se declara el bono</div>
        <ul class="notas">
          <li>Como <b>ganancia patrimonial derivada de la transmisión</b> de un derecho (otros elementos patrimoniales): la ganancia es lo que cobras.</li>
          <li>Va a la <b>base del ahorro</b>: ${escala}. No a la base general.</li>
          <li>En la Renta del año en que se cierra la cesión y lo cobras. Si firmaste un año y cobraste al siguiente, que tu asesor confirme cuál.</li>
          <li>Son <b>dos cosas distintas</b>: el bono tributa por un lado y la deducción por la obra se aplica por otro, completa.</li>
        </ul>
      </div>
    </div>

    <div class="legal">
      Nota orientativa elaborada por BROKERGY conforme a la disposición adicional quincuagésima de la Ley 35/2006 del IRPF, el Real Decreto 36/2023 y la consulta vinculante V2137-25 de la Dirección General de Tributos. No sustituye al asesoramiento fiscal: lo que pagues depende de tu situación personal. Ante cualquier duda, consulta con tu asesor o con el Asistente de Renta de la Agencia Tributaria.
    </div>
    ${bandaPie()}
  </div>`;
}

/** El CSS de las hojas de la guía (la del IRPF y la del bono CAE). */
function estiloGuia(appUrl) {
    return `
  ${buildFontFaces(appUrl, FUENTE_INTER)}
  ${'' /* Antonio solo tiene la cara latina (como en las páginas del cliente): cubre el castellano. */}
  @font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('${appUrl}/fonts/Antonio-700-latin.woff2') format('woff2');}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: ${DARK}; background: #fff; font-size: 10.2px; line-height: 1.4;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .arc { font-family: 'Antonio', 'Inter', 'Arial Narrow', Arial, sans-serif; font-weight: 700; letter-spacing: -0.005em; }
  b { font-weight: 700; }
  .sheet { position: relative; width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
  .filete { height: 6px; width: 100%; background: ${GRAD}; flex-shrink: 0; }
  .pad { padding: 0 38px; }
  .kick { font-size: 8.3px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: ${ORANGE_TXT}; }
  .sec { margin-top: 10px; }
  /* El rótulo de cada bloque, como «BENEFICIARIO» en la carta: naranja y un filo de tinta debajo. */
  .sec-t { font-size: 8.3px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: ${ORANGE_TXT}; margin: 0 0 5px; padding-bottom: 3px; border-bottom: 1px solid ${DARK}; }
  .u { font-size: 8.4px; color: ${GREY2}; font-weight: 500; }

  .head { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 12px 38px 0; }
  .head .ref { text-align: right; }
  .head .ref .kick { color: ${GREY}; }
  .head .ref .n { font-size: 11px; font-weight: 700; margin-top: 2px; }
  .head .ref .sub { font-size: 8.6px; color: ${GREY2}; }
  h1 { margin: 6px 0 0; font-size: 28px; line-height: 1.04; color: ${DARK}; }
  /* UNA palabra en lima por titular; el fondo empieza al 14 % del alto (regla 164). */
  .mark { background: linear-gradient(transparent 14%, ${LIMA} 14%); padding: 0 .12em; border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }

  .strip { display: flex; margin-top: 8px; border-top: 1px solid ${LINE}; border-bottom: 1px solid ${LINE}; }
  .strip > div { padding: 3px 12px 4px; border-left: 1px solid ${LINE}; min-width: 0; }
  .strip > div:first-child { border-left: 0; padding-left: 0; }
  .strip .sk { font-size: 7.4px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: ${GREY2}; }
  .strip .sv { font-size: 9.6px; font-weight: 600; margin-top: 1px; line-height: 1.3; }

  /* La cifra protagonista, en la tarjeta de tinta de la carta («IMPORTE ABONADO»), con el filete abajo. */
  .hero { position: relative; overflow: hidden; display: flex; margin-top: 10px; border-radius: 14px; background: ${DARK}; color: #fff; padding: 9px 18px 12px; }
  .hero::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: ${GRAD}; }
  .ded { flex: 1.35; padding-right: 16px; }
  .hero .kick { color: ${ORANGE}; }
  .ded-top { display: flex; align-items: center; gap: 13px; margin-top: 2px; }
  .ded-pct { font-size: 46px; line-height: 1; white-space: nowrap; }
  .ded-nom { font-size: 11.6px; font-weight: 700; line-height: 1.24; }
  .ded-nom span { display: block; font-size: 8.8px; font-weight: 500; color: rgba(255,255,255,0.68); margin-top: 2px; }
  .est { flex: 1; padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.16); display: flex; flex-direction: column; }
  .est-k { font-size: 8.3px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; color: ${GREEN}; }
  .est-v { font-family: 'Antonio', 'Inter', 'Arial Narrow', Arial, sans-serif; font-size: 30px; line-height: 1.02; margin-top: 2px; white-space: nowrap; }
  .est-rep { margin-top: 3px; }
  .est-fila { display: flex; justify-content: space-between; font-size: 9.3px; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .est-fila span { color: rgba(255,255,255,0.72); }
  .est-n { margin-top: auto; padding-top: 4px; font-size: 7.8px; color: rgba(255,255,255,0.62); line-height: 1.32; }
  .ded-ok { margin-top: 7px; display: flex; gap: 7px; align-items: flex-start; background: rgba(177,209,62,.13); border-radius: 9px; padding: 5px 9px; font-size: 9.1px; color: rgba(255,255,255,0.86); line-height: 1.35; }
  .ded-ok .ok { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: ${GREEN}; color: ${DARK}; font-size: 8.5px; font-weight: 800; margin-top: 0.5px; }
  .ded-ok b { color: ${GREEN}; }

  /* Rejilla FIJA y no una cadena que se parte donde caiga: partida al azar dejaba
     un paso suelto en una línea y el 5 desplazado por su recuadro. Aquí todos los
     pasos llevan el MISMO relleno (con borde transparente los normales), así que
     los números caen en columna; el 5 ocupa la fila entera. */
  .ruta { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 12px; border: 1px solid ${LINE}; border-radius: 10px; padding: 4px 6px; background: ${CREMA}; }
  .ruta .p { display: flex; align-items: center; gap: 6px; font-size: 9.8px; font-weight: 600; line-height: 1.25; padding: 2.5px 8px 2.5px 4px; border: 1px solid transparent; border-radius: 7px; min-width: 0; }
  .ruta .n { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: ${ORANGE}; color: ${DARK}; font-size: 8.3px; font-weight: 800; flex-shrink: 0; }
  .ruta .p.fin { grid-column: 1 / -1; background: #fff; border-color: ${LINE}; font-weight: 700; }
  .ruta .p.fin .opc { background: linear-gradient(transparent 14%, ${LIMA} 14%); padding: 0 3px; border-radius: 3px; }
  .ruta .p.fin .luego { margin-left: auto; padding-left: 10px; font-size: 9.3px; font-weight: 500; color: ${GREY}; white-space: nowrap; }

  table { width: 100%; border-collapse: collapse; }
  .datos { border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden; border-collapse: separate; border-spacing: 0; }
  .datos td { padding: 3.5px 10px; border-top: 1px solid ${LINE}; vertical-align: middle; }
  .datos tr:first-child td { border-top: 0; }
  .datos td.k { width: 44%; font-size: 9.5px; color: ${GREY}; background: ${CREMA}; }
  .datos td.v { font-size: 10.2px; }
  .datos td.c { text-align: center; font-size: 10.3px; width: 28%; font-variant-numeric: tabular-nums; }
  .datos tr.cab td { background: ${DARK}; color: #fff; font-size: 8.3px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 4px 10px; }
  .datos tr.cab td span { font-weight: 500; letter-spacing: 0; text-transform: none; color: rgba(255,255,255,0.65); }
  .datos tr.sep td { border-top: 2px solid ${ORANGE}; }
  .datos .letra { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 17px; padding: 0 5px; border-radius: 4px; background: ${DARK}; color: #fff; font-weight: 800; font-size: 10px; }
  .mono { letter-spacing: 0.4px; }
  .hueco { display: inline-block; color: ${GREY2}; font-style: italic; border-bottom: 1px dotted ${GREY2}; }

  .fact th { font-size: 7.4px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: ${GREY2}; text-align: left; padding: 2px 8px; border-bottom: 1px solid ${LINE}; }
  .fact td { font-size: 9.4px; padding: 2.4px 8px; border-bottom: 1px solid rgba(20,17,17,.05); font-variant-numeric: tabular-nums; }
  .fact .r { text-align: right; white-space: nowrap; }
  .fact tfoot td { font-weight: 800; font-size: 10px; border-bottom: 0; padding-top: 3px; }
  .mas { margin-top: 7px; border: 1px solid rgba(177,209,62,.45); background: ${GREEN_BG}; border-radius: 9px; padding: 6px 10px; font-size: 9.5px; color: ${GREEN_TXT}; line-height: 1.35; }
  .mas b { color: ${DARK}; }

  .notas { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; padding: 0; margin: 0; list-style: none; }
  .notas li { font-size: 9px; color: ${GREY}; line-height: 1.33; padding-left: 11px; position: relative; }
  .notas li::before { content: ''; position: absolute; left: 0; top: 4.5px; width: 5px; height: 5px; border-radius: 50%; background: ${ORANGE}; }
  .notas b { color: ${DARK}; }

  .legal { margin-top: auto; padding: 7px 38px 6px; font-size: 7.5px; color: ${GREY2}; line-height: 1.38; }
  /* El pie de la carta: banda de tinta con el nombre y el lema en naranja. */
  .band { padding: 9px 38px; background: ${DARK}; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  .band .s { font-weight: 700; font-size: 10.5px; line-height: 1.35; color: #fff; }
  .band .s span { display: block; font-size: 8.6px; font-weight: 600; color: ${ORANGE}; }
  .band .c { font-size: 8px; color: rgba(255,255,255,0.62); text-align: right; line-height: 1.45; }

  /* La hoja del bono CAE (hoja 2): otra A4 detrás de la guía, o suelta. */
  .sheet + .sheet { break-before: page; page-break-before: always; }
  .lead { margin: 6px 0 0; font-size: 10.6px; color: ${GREY}; line-height: 1.42; }
  .lead b { color: ${DARK}; }
  .razones { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rz { border: 1px solid ${LINE}; border-radius: 12px; padding: 8px 12px; background: #fff; }
  .rz-t { font-size: 11px; font-weight: 800; margin-bottom: 3px; }
  .rz p { margin: 0; font-size: 9.6px; line-height: 1.42; color: ${GREY}; }
  .rz p b { color: ${DARK}; }
  .rz p.u2 { margin-top: 5px; }
  .just { display: flex; gap: 12px; align-items: flex-start; border: 1px solid rgba(177,209,62,.45); background: ${GREEN_BG}; border-radius: 12px; padding: 9px 12px; font-size: 10px; line-height: 1.45; color: ${DARK}; }
  .just-i { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: ${DARK}; color: ${GREEN}; font-size: 15px; }
  .error { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .error > div { border-radius: 12px; padding: 8px 12px; }
  /* Lo que no se hace va en ÁMBAR, nunca en rojo (regla 164). */
  .error .mal { background: #fff7e6; border: 1px solid rgba(255,160,0,.45); }
  .error .bien { background: ${GREEN_BG}; border: 1px solid rgba(177,209,62,.45); }
  .e-k { font-size: 8.3px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
  .mal .e-k { color: ${ORANGE_TXT}; }
  .bien .e-k { color: ${GREEN_TXT}; }
  .e-v { font-size: 26px; line-height: 1.05; margin-top: 2px; }
  .mal .e-v { text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: ${ORANGE}; color: ${GREY}; }
  .e-n { font-size: 9.4px; color: ${GREY}; line-height: 1.4; margin-top: 2px; }
  .e-n b { color: ${DARK}; }
  /* La hoja 2 tiene menos que contar que la 1: letra algo mayor y más aire, para que no quede media hoja en blanco. */
  .hoja2 h1 { font-size: 34px; margin-top: 10px; }
  .hoja2 .lead { font-size: 11.6px; margin-top: 8px; }
  .hoja2 .hero { margin-top: 14px; padding: 12px 18px 15px; }
  .hoja2 .ded-ok, .hoja2 .est-n { font-size: 9.6px; }
  .hoja2 .rz { padding: 10px 14px; }
  .hoja2 .rz-t { font-size: 12px; }
  .hoja2 .rz p { font-size: 10.4px; }
  .hoja2 .e-n { font-size: 10.2px; }
  .hoja2 .just { font-size: 10.8px; padding: 11px 14px; }
  .hoja2 .notas { grid-template-columns: 1fr; gap: 6px; }
  .hoja2 .notas li { font-size: 10.6px; }
  .hoja2 .notas li::before { top: 5.5px; }
  .hoja2 .sec { margin-top: 20px; }
  .hoja2 .sec-t { margin-bottom: 8px; }
`;
}
