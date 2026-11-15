// ============================================================================
// viaFm.js — FUENTE ÚNICA de la DOCUMENTACIÓN de la vía del FACTOR MULTIPLICADOR
// (Resolución BOE-A-2026-23367, en vigor el 08/11/2026). Funciones PURAS.
// ----------------------------------------------------------------------------
// El CÁLCULO del bono por la vía FM vive en el motor
// (frontend/src/features/calculator/logic/res060fc.js, `calculateRes060FM`); aquí
// solo lo que pide el EXPEDIENTE: qué ficha oficial le toca, qué tipología declara
// el instalador, qué documentos de los 13 del apartado 3 le corresponden en cada
// caso y cómo se comprueba la vivienda habitual. Lo consumen el checklist del
// gestor de documentación (`buildDocChecklist`), la ruta `GET /:id/via-fm` (el
// panel del expediente) y los documentos que se generan para firmar.
//
// Los datos de la vía los declara el expediente en `documentacion.via_fm` (en la
// BLACKLIST de `normalizeData`: sus enums van en minúscula; y en
// CLAVES_PROTEGIDAS: los escribe solo `PUT /:id/via-fm/datos`).
//
// Detalle y porqué: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ============================================================================

const { esNumeroFm, fichaFromNumero } = require('./fichas');

// ── Ficha oficial ────────────────────────────────────────────────────────────
// La hibridación FM tiene UNA ficha por zona (RES090_FM … RES094_FM); el número
// del expediente sigue siendo 26RES093FM_N para todas, porque en la app RES093 es
// «hibridación». Mismo mapa que `CB_PARALELO` del motor (test_via_fm.mjs lo casa).
const FICHA_HIBRIDACION_FM = {
    A: { ficha: 'RES090_FM', zonas: 'A3 o A4' },
    B: { ficha: 'RES091_FM', zonas: 'B3 o B4' },
    C: { ficha: 'RES092_FM', zonas: 'C1, C2, C3 o C4' },
    D: { ficha: 'RES093_FM', zonas: 'D1, D2 o D3' },
    E: { ficha: 'RES094_FM', zonas: 'E1' },
};

const letraZona = (zona) => {
    const l = String(zona || '').trim().toUpperCase().charAt(0);
    return 'ABCDE'.includes(l) && l ? l : null;
};

/**
 * Código y título de la ficha oficial FM. `hibridacion` (RES093FM) toma la de su
 * zona; sin zona, la D (la del motor). `vulnerable` añade el «-S».
 */
function fichaOficialFm({ hibridacion = false, zona = null, vulnerable = false, rehabilitacion = false } = {}) {
    let codigo;
    let titulo;
    let sinZona = false;
    if (rehabilitacion) {
        // RES080_FM (BOE-A-2026-23367, págs. 20–22). La Resolución no le da variante -S.
        return {
            codigo: 'RES080_FM',
            titulo: 'Rehabilitación profunda de edificios de viviendas con coeficiente corrector con factor multiplicador sobre la parte de bomba de calor',
            sinZona: false,
            version: 'V1.0',
        };
    }
    if (hibridacion) {
        const z = letraZona(zona);
        sinZona = !z;
        const t = FICHA_HIBRIDACION_FM[z || 'D'];
        codigo = t.ficha;
        // Literal del BOE, errata incluida («factor DE multiplicador»): es el título
        // que se declara, y tiene que casar con el del catálogo.
        titulo = `Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática ${t.zonas} con coeficiente corrector con factor de multiplicador aplicable`;
        if (vulnerable) titulo += ', en vivienda habitada por un consumidor vulnerable';
    } else {
        codigo = 'RES060_FM';
        titulo = vulnerable
            ? 'Sustitución de caldera por bomba de calor de accionamiento eléctrico con coeficiente corrector con factor multiplicador cuando habiten consumidores vulnerables'
            : 'Sustitución de caldera por bomba de calor de accionamiento eléctrico con coeficiente corrector con factor multiplicador aplicable';
    }
    if (vulnerable) codigo += '-S';
    // Todas las fichas FM nacen en la V1.0 (BOE-A-2026-23367).
    return { codigo, titulo, sinZona, version: 'V1.0' };
}

// ── Tipología (punto 1: la declara el INSTALADOR) ───────────────────────────
// Mismo criterio que el motor (`tipologiaFM`): bloque = edificio con sistema
// centralizado; 'piso' = piso con sistema individual; el resto, unifamiliar.
const TIPOLOGIAS = {
    unifamiliar: { label: 'Edificio unifamiliar', fm: 2 },
    piso: { label: 'Piso con sistema individual de calefacción y ACS', fm: 2.5 },
    bloque: { label: 'Edificio con sistema centralizado de calefacción y ACS', fm: 3 },
};

/** Tipología de la simulación (`inputs`), o la que declare el expediente. */
function tipologiaFm(inputs = {}, declarada = null) {
    if (declarada && TIPOLOGIAS[declarada]) return { clase: declarada, ...TIPOLOGIAS[declarada], de: 'expediente' };
    const tipo = String(inputs.tipo || (inputs.housing_type === 'flat' ? 'piso' : '')).toLowerCase();
    const bloque = String(inputs.tipoInmueble || '').toLowerCase() === 'bloque';
    const clase = bloque ? 'bloque' : (tipo === 'piso' ? 'piso' : 'unifamiliar');
    return { clase, ...TIPOLOGIAS[clase], de: 'simulacion' };
}

// ── Datos que declara el expediente (`documentacion.via_fm`) ────────────────
const BOOL_O_NULL = (v) => (v === true || v === false ? v : null);
const KWH = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Math.round(Number(v) * 10) / 10);
const FECHA = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

/**
 * Sanea lo que llega del panel. Solo pasan estas claves; lo demás se descarta.
 *   tipologia            'unifamiliar' | 'piso' | 'bloque' | null (= la de la simulación)
 *   vulnerable           consumidor vulnerable → ficha _FM-S (×1,5)
 *   caldera_retirada     RES060_FM: la caldera se desmonta (false = queda en preinstalación)
 *   bt_aplica            hay aumento de potencia → certificado de baja tensión (RES060_FM)
 *   caldera_nueva        hibridación: la caldera TAMBIÉN se cambia por otra (punto 13)
 *   vivienda_habitual    'facturas' | 'curva' | null
 *   inquilino            vulnerable que vive de alquiler o cedido (compromiso del arrendatario)
 *   centralizado_mixto   vulnerable en un edificio centralizado con pisos de otros (presidente CC. PP.)
 *   facturas_luz         [{ desde, hasta, kwh, cups, misma_direccion }] (máx. 24)
 *   mantenimiento        punto 8: 'acepta' | 'desiste' | null (= casillas en blanco, solo papel)
 *   mantenimiento_importe punto 8: el precio de la oferta, como se escribe («185 €/año, IVA incluido»)
 *   anexo_b_casilla      Anexo B: 'renta' | 'severo' | 'no_fn' | null (= en blanco, solo papel)
 *   vulnerable_persona   Anexo B: { nombre, nif, domicilio, telefono, email } si NO es el titular
 *   ef_sim_bc / ef_sim_rest  RES080_FM: kWh/año de energía final de los dos CEE SIMULADOS
 *                        (solo la bomba / todo menos la bomba) mientras no estén sus CEE
 */
const TEXTO = (v, max) => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    return s || null;
};
function sanearPersona(p) {
    if (!p || typeof p !== 'object') return null;
    const out = {
        nombre: TEXTO(p.nombre, 120), nif: TEXTO(p.nif, 20), domicilio: TEXTO(p.domicilio, 200),
        telefono: TEXTO(p.telefono, 30), email: TEXTO(p.email, 120),
    };
    return out.nombre ? out : null;
}
function sanearDatosFm(body = {}) {
    const b = body || {};
    const out = {
        tipologia: TIPOLOGIAS[b.tipologia] ? b.tipologia : null,
        vulnerable: b.vulnerable === true,
        caldera_retirada: BOOL_O_NULL(b.caldera_retirada),
        bt_aplica: BOOL_O_NULL(b.bt_aplica),
        caldera_nueva: b.caldera_nueva === true,
        vivienda_habitual: ['facturas', 'curva'].includes(b.vivienda_habitual) ? b.vivienda_habitual : null,
        inquilino: b.inquilino === true,
        centralizado_mixto: b.centralizado_mixto === true,
        facturas_luz: (Array.isArray(b.facturas_luz) ? b.facturas_luz : []).slice(0, 24).map((f) => ({
            desde: FECHA(f?.desde),
            hasta: FECHA(f?.hasta),
            kwh: Number.isFinite(Number(f?.kwh)) && f?.kwh !== '' && f?.kwh !== null ? Math.max(0, Number(f.kwh)) : null,
            cups: String(f?.cups || '').toUpperCase().replace(/\s+/g, '').slice(0, 22) || null,
            misma_direccion: BOOL_O_NULL(f?.misma_direccion),
        })).filter((f) => f.desde || f.hasta || f.kwh != null || f.cups),
        mantenimiento: ['acepta', 'desiste'].includes(b.mantenimiento) ? b.mantenimiento : null,
        mantenimiento_importe: TEXTO(b.mantenimiento_importe, 60),
        anexo_b_casilla: CASILLAS_ANEXO_B.includes(b.anexo_b_casilla) ? b.anexo_b_casilla : null,
        vulnerable_persona: sanearPersona(b.vulnerable_persona),
        // El aviso al cliente de ESPERAR al 15/01/2027 para pedirlo por la FM (panel
        // «Vía FM» → AvisoEsperaFmModal): cuándo salió y a quién, y qué contestó.
        aviso_espera: sanearAvisoEspera(b.aviso_espera),
        espera_cliente: ['acepta', 'rechaza'].includes(b.espera_cliente) ? b.espera_cliente : null,
        // RES080_FM: la energía final (kWh/año) de los dos CEE simulados, tecleada.
        ef_sim_bc: KWH(b.ef_sim_bc),
        ef_sim_rest: KWH(b.ef_sim_rest),
    };
    return out;
}
function sanearAvisoEspera(a) {
    if (!a || typeof a !== 'object') return null;
    const at = /^\d{4}-\d{2}-\d{2}T/.test(String(a.at || '')) ? String(a.at).slice(0, 30) : null;
    if (!at) return null;
    const a_ = (Array.isArray(a.a) ? a.a : []).slice(0, 6).map((x) => TEXTO(x, 120)).filter(Boolean);
    return { at, a: a_, por: TEXTO(a.por, 120) };
}

// ── Los documentos de firma que GENERA la app ───────────────────────────────
// Uno por `genera` de `documentosFm`. El contenido lo maquetan los generadores del
// frontend (logic/documentosFm.js, `GENERADORES_FM`); aquí, lo que el SERVIDOR
// necesita para guardarlo y servirlo: en qué apartado del gestor acaba firmado,
// cómo se llama el fichero y QUIÉN lo firma. El borrador vive en
// `documentacion.fm_docs[genera]` ({ drive_link, drive_id, drive_at, signed_at });
// el FIRMADO, en su apartado del gestor (`reforma_uploads[slot]`), como si se
// hubiera subido.
//   firma 'cliente'    → en la página de firma del cliente (/firmar-anexos), junto
//                        al Anexo A y al Convenio.
//   firma 'instalador' → en la página del instalador (/instalador/:id), junto al CIFO.
const CASILLAS_ANEXO_B = ['renta', 'severo', 'no_fn'];
const GENERADOS_FM = {
    declaracion_instalador: { slot: 'FM_DECL_INSTALADOR', fichero: 'Declaracion tipologia', corto: 'Declaración de la tipología', firma: 'instalador' },
    informado_fg: { slot: 'FM_INFORMADO_FG', fichero: 'Informado bomba de calor', corto: 'Documento informativo', firma: 'cliente' },
    oferta_mantenimiento: { slot: 'FM_OFERTA_MANTENIMIENTO', fichero: 'Oferta mantenimiento', corto: 'Oferta de mantenimiento', firma: 'cliente' },
    anexo_b: { slot: 'FM_VULN_ANEXO_B', fichero: 'Anexo B', corto: 'Anexo B', firma: 'cliente' },
};

/**
 * Los documentos generados que tiene que firmar `quien` ('cliente' | 'instalador')
 * en ESTE expediente: los que su ficha pide (`documentosFm` con `genera`) y cuyo
 * borrador ya existe. `uploads`: reforma_uploads; `fmDocs`: documentacion.fm_docs.
 * Cada uno: { genera, slot, label, corto, fichero, drive_link, drive_at, firmado, signed_at }.
 */
/**
 * ¿Lo firmado del apartado vale para el borrador de AHORA? Un borrador generado
 * DESPUÉS de la última subida (se cambió un dato y se volvió a generar) vuelve a
 * pedir la firma; el firmado anterior no se borra. Sin fechas, cuenta lo subido.
 */
function firmadoVigente(subidas, borradorAt) {
    const lista = Array.isArray(subidas) ? subidas : [];
    if (!lista.length) return false;
    const ultima = lista.map((u) => (u && u.at) || '').sort().pop();
    return !borradorAt || !ultima || ultima >= borradorAt;
}

function generadosParaFirmar(ctx, { quien, fmDocs = {}, uploads = {} } = {}) {
    if (!ctx?.activa) return [];
    return documentosFm(ctx)
        .filter((d) => d.genera && GENERADOS_FM[d.genera]?.firma === quien)
        .map((d) => {
            const meta = GENERADOS_FM[d.genera];
            const b = (fmDocs || {})[d.genera] || {};
            return {
                genera: d.genera, slot: meta.slot, label: d.label, corto: meta.corto, fichero: meta.fichero,
                drive_link: b.drive_link || null, drive_id: b.drive_id || null, drive_at: b.drive_at || null,
                firmado: firmadoVigente(uploads[meta.slot], b.drive_at), signed_at: b.signed_at || null,
            };
        })
        .filter((d) => d.drive_link || d.drive_id);
}

// ── Vivienda habitual (punto 4) ─────────────────────────────────────────────
const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const UN_DIA = 86400000;
const fechaEs = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');

/**
 * Periodo que hay que justificar: del 1/11 al 31/3 del invierno ANTERIOR al
 * inicio de la actuación. Sin inicio, el invierno anterior a `hoy`.
 * Inicio en marzo de 2027 → 01/11/2025-31/03/2026 (el invierno ya empezado no es
 * «previo»); inicio en noviembre de 2026 → 01/11/2025-31/03/2026.
 */
function inviernoPrevio(inicioIso, hoyIso = new Date().toISOString().slice(0, 10)) {
    const ref = FECHA(inicioIso) || FECHA(hoyIso);
    const y = +ref.slice(0, 4);
    const m = +ref.slice(5, 7);
    // El invierno «previo» termina el 31/3 anterior a la fecha de referencia.
    const finAnio = m >= 4 ? y : y - 1;
    return { desde: `${finAnio - 1}-11-01`, hasta: `${finAnio}-03-31` };
}

/**
 * Comprueba las facturas de luz contra el punto 4: continuas del 1/11 al 31/3, un
 * solo CUPS, dirección idéntica a la catastral y > 75 kWh/mes de media.
 * Devuelve { periodo, cubierto, huecos[], mediaMensual, cups, ok, avisos[] }.
 * Lo que no se puede saber (sin fechas, sin kWh) se DICE, no se da por bueno.
 */
function validarViviendaHabitual(facturas = [], inicioIso = null, hoyIso) {
    const periodo = inviernoPrevio(inicioIso, hoyIso);
    const avisos = [];
    const validas = (facturas || []).filter((f) => FECHA(f.desde) && FECHA(f.hasta) && f.hasta >= f.desde);
    if ((facturas || []).length > validas.length) avisos.push('Hay facturas sin las dos fechas del periodo: no cuentan.');

    // Cobertura del periodo, día a día (unión de intervalos recortada al periodo).
    const p0 = dia(periodo.desde);
    const p1 = dia(periodo.hasta);
    const tramos = validas
        .map((f) => [Math.max(dia(f.desde), p0), Math.min(dia(f.hasta), p1)])
        .filter(([a, b]) => b >= a)
        .sort((x, y) => x[0] - y[0]);
    const huecos = [];
    let cursor = p0;
    for (const [a, b] of tramos) {
        if (a > cursor) huecos.push({ desde: new Date(cursor).toISOString().slice(0, 10), hasta: new Date(a - UN_DIA).toISOString().slice(0, 10) });
        cursor = Math.max(cursor, b + UN_DIA);
    }
    if (cursor <= p1) huecos.push({ desde: new Date(cursor).toISOString().slice(0, 10), hasta: periodo.hasta });
    const cubierto = huecos.length === 0;

    // Media mensual: kWh de las facturas que tocan el periodo, prorrateados a los
    // días DENTRO del periodo, entre los meses del periodo (≈ 5).
    let kwhPeriodo = 0;
    let sinKwh = false;
    for (const f of validas) {
        const a = dia(f.desde);
        const b = dia(f.hasta);
        const dentro = Math.min(b, p1) - Math.max(a, p0);
        if (dentro < 0) continue;
        if (f.kwh == null) { sinKwh = true; continue; }
        const total = (b - a) / UN_DIA + 1;
        kwhPeriodo += f.kwh * ((dentro / UN_DIA + 1) / total);
    }
    const meses = ((p1 - p0) / UN_DIA + 1) / 30.4375;
    const mediaMensual = cubierto && !sinKwh ? Math.round((kwhPeriodo / meses) * 10) / 10 : null;
    if (sinKwh) avisos.push('Falta el consumo (kWh) de alguna factura del periodo: no se puede calcular la media.');

    const cupsSet = new Set(validas.map((f) => f.cups).filter(Boolean));
    if (cupsSet.size > 1) avisos.push(`Las facturas traen ${cupsSet.size} CUPS distintos: tienen que ser del mismo suministro.`);
    if (validas.length && !cupsSet.size) avisos.push('No consta el CUPS de las facturas: la ficha exige que se vea.');
    if (validas.some((f) => f.misma_direccion === false)) avisos.push('Alguna factura NO trae la dirección catastral: la ficha la exige idéntica.');
    if (validas.some((f) => f.misma_direccion == null)) avisos.push('Falta confirmar en alguna factura que la dirección de suministro es la catastral.');
    if (!tramos.length) avisos.push(`Aún no hay facturas apuntadas que caigan en el periodo ${fechaEs(periodo.desde)}–${fechaEs(periodo.hasta)}.`);
    else if (!cubierto) avisos.push(`El periodo ${fechaEs(periodo.desde)}–${fechaEs(periodo.hasta)} no está cubierto entero. Faltan: ${huecos.map((h) => `${fechaEs(h.desde)}–${fechaEs(h.hasta)}`).join(', ')}.`);
    if (mediaMensual != null && mediaMensual <= 75) avisos.push(`La media es de ${mediaMensual} kWh/mes: la ficha pide MÁS de 75.`);

    const ok = cubierto && mediaMensual != null && mediaMensual > 75 && cupsSet.size === 1
        && validas.every((f) => f.misma_direccion === true);
    return { periodo, cubierto, huecos, mediaMensual, cups: cupsSet.size === 1 ? [...cupsSet][0] : null, ok, avisos };
}

// ── Facturas de la obra (punto 6) ───────────────────────────────────────────
const FM_INICIO_FACTURAS = '2026-03-22';   // posteriores al 22/03/2026
const FM_FIN_FACTURAS = '2027-11-30';      // anteriores al 01/12/2027
const FM_FIN_FACTURAS_CCPP = '2027-12-31'; // CC. PP.: anteriores al 01/01/2028

/** Facturas de la obra fuera de la ventana del FM. `facturas`: documentacion.facturas. */
function facturasFueraDePlazo(facturas = [], { comunidad = false } = {}) {
    const fin = comunidad ? FM_FIN_FACTURAS_CCPP : FM_FIN_FACTURAS;
    return (facturas || [])
        .map((f) => ({ numero: f.numero_factura || f.numero || null, fecha: String(f.fecha_factura || f.fecha || '').slice(0, 10) }))
        .filter((f) => FECHA(f.fecha) && (f.fecha <= FM_INICIO_FACTURAS || f.fecha > fin));
}

// ── Contexto de la vía ──────────────────────────────────────────────────────
/**
 * Todo lo que decide qué se pide. `exp` necesita numero_expediente y (si los hay)
 * los datos de la vía y las letras de los CEE; `inputs`/`zona`, los de la oportunidad.
 */
function contextoFm({ numero, datos = {}, inputs = {}, zona = null, letrasFinal = [], letrasInicial = [] } = {}) {
    const activa = esNumeroFm(numero);
    const ficha = fichaFromNumero(numero);
    const hibridacion = ficha === 'RES093';
    // RES080_FM: rehabilitación profunda (envolvente + caldera → bomba), cuatro CEE.
    const rehabilitacion = ficha === 'RES080';
    const d = sanearDatosFm(datos || {});
    const tip = tipologiaFm(inputs, d.tipologia);
    const z = letraZona(zona || inputs.zona);
    const oficial = fichaOficialFm({ hibridacion, rehabilitacion, zona: zona || inputs.zona, vulnerable: d.vulnerable });
    const norm = (ls) => (ls || []).filter(Boolean).map((l) => String(l).trim().toUpperCase());
    const lf = norm(letrasFinal);
    const li = norm(letrasInicial);
    // Punto 13 (RES060_FM): zonas D y E con el CEE (posterior) en F o G. Sin final,
    // el inicial avisa: la envolvente no cambia al cambiar el generador.
    const letras = lf.length ? lf : li;
    const fg = letras.find((l) => l === 'F' || l === 'G') || null;
    return {
        activa,
        ficha,
        hibridacion,
        rehabilitacion,
        datos: d,
        tipologia: tip,
        zona: zona || inputs.zona || null,
        zonaLetra: z,
        zonaDE: z === 'D' || z === 'E',
        fichaOficial: oficial,
        letraFg: fg,
        letraFgDe: fg ? (lf.length ? 'final' : 'inicial') : null,
        letrasConocidas: letras.length > 0,
    };
}

// ── Los documentos de la ficha, uno a uno ───────────────────────────────────
// `slot`: clave del apartado del gestor (si se SUBE); `genera`: lo prepara la app
// para firmar; `cubre`: otro documento del expediente que ya lo cumple.
// `aportaInstalador`: lo emite el instalador, no el cliente.
const ACCEPT_DOC = '.pdf,image/*';

/**
 * Los 13 puntos (y los del vulnerable) que le tocan a ESTE expediente, en orden.
 * Cada uno: { punto, key, label, help, quien, slot?, genera?, cubre?, required, condicion? }.
 */
function documentosFm(ctx) {
    if (!ctx?.activa) return [];
    if (ctx.rehabilitacion) return documentosFm080(ctx);
    const d = ctx.datos;
    const hib = ctx.hibridacion;
    const out = [];
    const add = (x) => out.push({ required: true, ...x });

    add({ punto: '1', key: 'FM_DECL_INSTALADOR', slot: 'FM_DECL_INSTALADOR', genera: 'declaracion_instalador', quien: 'instalador', aportaInstalador: true,
        label: 'Declaración responsable del instalador (tipología)',
        help: `El instalador declara la tipología: ${ctx.tipologia.label}. La app la GENERA y el instalador la firma en su página, junto al CIFO.` });
    add({ punto: '2 y 5', key: 'FM_ANEXO_A', cubre: 'anexo_i', quien: 'cliente',
        label: 'Anexo A (declaración de ayudas)', help: 'Sustituye al Anexo I: en la vía FM, el «Anexo I» de Documentos se genera ya como Anexo A y se firma igual, en el mismo enlace que el Convenio. Un Anexo I firmado antes sigue valiendo.' });
    add({ punto: '3', key: 'FM_CERT_INSTALACION', cubre: 'cifo', quien: 'instalador', aportaInstalador: true,
        label: 'Certificado de la instalación con las variables de la fórmula', help: 'El CIFO, firmado por el representante de la empresa habilitada.' });
    if (!hib && d.caldera_retirada === false) {
        add({ punto: '3.b', key: 'FM_JUSTIF_PREINSTALACION', slot: 'FM_JUSTIF_PREINSTALACION', quien: 'instalador', aportaInstalador: true,
            label: 'Justificación: la bomba cubre toda la demanda y la caldera queda en preinstalación',
            help: 'Del instalador: Ax/Wy de la bomba, temperatura exterior de proyecto e impulsión, y que la caldera queda en PREINSTALACIÓN (no hibridada) con accionamiento manual de emergencia.' });
    }
    if (!hib) {
        // Fran, 07/11/2026: «así usamos un único documento que es el CIFO». La
        // hoja «Certificado de inercia hidráulica» va dentro del CIFO
        // (logic/inerciaFm.js); no se pide como papel aparte.
        add({ punto: '3.c', key: 'FM_CERT_INERCIA', cubre: 'cifo', quien: 'instalador', aportaInstalador: true,
            label: 'Certificado de inercia (volumen total y específico)',
            help: 'Lo cubre el CIFO: hoja propia «Certificado de inercia hidráulica de la instalación». Los litros se teclean en Instalación; el volumen específico (l/kW) se calcula.' });
    }
    if (ctx.tipologia.clase !== 'bloque') {
        const curva = d.vivienda_habitual === 'curva';
        add({ punto: '4', key: 'FM_VIVIENDA_HABITUAL', slot: 'FM_VIVIENDA_HABITUAL', quien: 'cliente',
            label: curva ? 'Vivienda habitual: curva de consumo horario de la distribuidora' : 'Vivienda habitual: facturas de luz del 1/11 al 31/3 del invierno anterior',
            help: curva
                ? 'El archivo de la curva de consumo horario, firmado digitalmente por la distribuidora eléctrica.'
                : 'Las facturas de la luz (o del combustible) que cubran SIN huecos del 1 de noviembre al 31 de marzo del invierno anterior a la obra, con el CUPS, la dirección igual que la del Catastro y más de 75 kWh al mes de media.' });
    }
    add({ punto: '6', key: 'FM_FACTURAS', cubre: 'DOC_FACTURAS', quien: 'instalador',
        label: 'Facturas con el número de serie, posteriores al 22/03/2026 y anteriores al 01/12/2027', help: 'Las facturas de la obra, con la descripción y el nº de serie de los equipos principales.' });
    add({ punto: '7', key: 'FM_FOTOS', cubre: 'anexo_fotografico', quien: 'brokergy',
        label: 'Informe fotográfico antes y después', help: 'El Anexo Fotográfico, con las fotos del gestor.' });
    add({ punto: '8', key: 'FM_OFERTA_MANTENIMIENTO', slot: 'FM_OFERTA_MANTENIMIENTO', genera: 'oferta_mantenimiento', quien: 'instalador',
        label: 'Oferta de mantenimiento de 2 años, aceptada o desistida',
        help: 'La oferta del contrato de mantenimiento de la empresa habilitada (≥ 2 años desde la puesta en servicio), con la firma del propietario aceptándola O desistiendo. La app la GENERA; el cliente la firma en su enlace, junto al Anexo A.' });
    if (hib || d.bt_aplica === true) {
        add({ punto: '9', key: 'FM_BOLETIN_BT', slot: 'FM_BOLETIN_BT', quien: 'instalador', aportaInstalador: true,
            label: 'Certificado de baja tensión con el aumento de potencia',
            help: 'El boletín eléctrico de la empresa habilitada, registrado en la comunidad autónoma, que incluya el aumento de potencia.' });
    } else if (d.bt_aplica == null) {
        add({ punto: '9', key: 'FM_BOLETIN_BT', slot: 'FM_BOLETIN_BT', quien: 'instalador', aportaInstalador: true, required: false,
            condicion: 'Solo si la obra aumenta la potencia eléctrica: márcalo en la vía FM del expediente.',
            label: 'Certificado de baja tensión (si aumenta la potencia)',
            help: 'Solo cuando la obra aumenta la potencia eléctrica: el boletín registrado con ese aumento.' });
    }
    add({ punto: '10', key: 'FM_PUESTA_SERVICIO', cubre: 'DOC_RITE', quien: 'instalador', aportaInstalador: true,
        label: 'Comunicación de puesta en servicio (o el acta, hasta 70 kW)', help: 'El certificado RITE registrado; si la instalación ya está inscrita y no pasa de 70 kW, el acta.' });
    add({ punto: '11', key: 'FM_CEE_POSTERIOR', cubre: 'cee_final', quien: 'brokergy',
        label: 'CEE posterior a la obra, registrado', help: 'El CEE final registrado. La vía FM no pide el inicial (se hace igual, como plan B).' });
    add({ punto: '12', key: 'FM_CONSENTIMIENTO_IRPF', cubre: 'convenio', quien: 'cliente',
        label: 'Consentimiento: el incentivo tributa en el IRPF y el ahorro depende de la bomba', help: 'Va como cláusula del Convenio de Cesión de la vía FM y en la propuesta.' });
    if (!hib && ctx.zonaDE) {
        add({ punto: '13', key: 'FM_INFORMADO_FG', slot: 'FM_INFORMADO_FG', genera: 'informado_fg', quien: 'cliente',
            required: !!ctx.letraFg,
            condicion: ctx.letraFg ? null : (ctx.letrasConocidas ? 'El CEE no sale F ni G: no hace falta.' : 'Solo si el CEE final sale F o G.'),
            label: 'Documento firmado: informado de que la bomba podría no rendir lo previsto (zona D/E, CEE F o G)',
            help: `Zona ${ctx.zona || ctx.zonaLetra}${ctx.letraFg ? ` y CEE ${ctx.letraFgDe} con ${ctx.letraFg}` : ''}: el propietario firma que se le ha informado de que, por el aislamiento de la vivienda, la bomba podría no alcanzar las prestaciones esperadas. La app lo GENERA y se firma en el enlace del cliente.` });
    }
    if (hib && d.caldera_nueva) {
        add({ punto: '13', key: 'FM_FICHAS_HIBRIDO', slot: 'FM_FICHAS_HIBRIDO', quien: 'instalador', aportaInstalador: true,
            label: 'Fichas técnicas de la caldera nueva y de la bomba (potencias a la temperatura de diseño)',
            help: 'Del fabricante: las potencias térmicas de la caldera nueva y de la bomba a la temperatura exterior de diseño de la ubicación. Si son menores que la del sistema sustituido, la justificación del dimensionamiento.' });
    }
    if (d.vulnerable) {
        add({ punto: 'S.2', key: 'FM_VULN_BONO_SOCIAL', slot: 'FM_VULN_BONO_SOCIAL', quien: 'cliente',
            label: 'Factura con el bono social a su nombre (o la solicitud)', help: 'La factura de la luz donde figura como beneficiario del bono social, o el justificante de haberlo solicitado a la comercializadora de referencia.' });
        add({ punto: 'S.3', key: 'FM_VULN_ANEXO_B', slot: 'FM_VULN_ANEXO_B', genera: 'anexo_b', quien: 'cliente',
            label: 'Anexo B: justificación de consumidor vulnerable', help: 'Lo firma el consumidor vulnerable (el titular, o quien se indique). La app lo GENERA con sus datos y se firma en el enlace del cliente.' });
        add({ punto: 'S.4', key: 'FM_VULN_TITULO', slot: 'FM_VULN_TITULO', quien: 'cliente',
            label: d.inquilino ? 'Contrato de arrendamiento o de cesión (copia legalizada)' : 'Nota simple de la propiedad',
            help: 'Nota simple que justifique la propiedad, o copia legalizada o compulsada del contrato de arrendamiento o de cesión.' });
        add({ punto: 'S.5', key: 'FM_VULN_EMPADRONAMIENTO', slot: 'FM_VULN_EMPADRONAMIENTO', quien: 'cliente',
            label: 'Certificado de empadronamiento', help: 'Del ayuntamiento, de los residentes en la vivienda.' });
        if (d.inquilino) {
            add({ punto: 'S.6', key: 'FM_VULN_COMPROMISO', slot: 'FM_VULN_COMPROMISO', quien: 'cliente',
                label: 'Compromiso de 2 años (vulnerable y sin subir el alquiler)', help: 'Firmado por el arrendatario: la condición de vulnerable se mantiene 2 años desde la obra y el alquiler no cambia en ese tiempo.' });
        }
        if (ctx.tipologia.clase === 'bloque' && d.centralizado_mixto) {
            add({ punto: 'S.7', key: 'FM_VULN_CERT_PRESIDENTE', slot: 'FM_VULN_CERT_PRESIDENTE', quien: 'cliente',
                label: 'Certificado del presidente de la comunidad (cuotas y pisos vulnerables)', help: 'Con la cuota de participación de cada piso e identificando los que ocupan consumidores vulnerables.' });
        }
    }
    return out;
}

/**
 * RES080_FM (BOE-A-2026-23367, págs. 20–22): los documentos de la rehabilitación
 * profunda con factor multiplicador sobre la parte de la bomba. El 1 es la propia
 * ficha. Los dos CEE SIMULADOS (10 y 11) no se registran; se hacen con la misma
 * herramienta que el previo y el posterior.
 */
function documentosFm080(ctx) {
    const d = ctx.datos;
    const out = [];
    const add = (x) => out.push({ required: true, ...x });
    add({ punto: '2', key: 'FM_ANEXO_A', cubre: 'anexo_i', quien: 'cliente',
        label: 'Anexo A (declaración de ayudas)', help: 'La ficha dice «anexo I» (errata): es el Anexo A. El «Anexo I» de Documentos se genera ya como Anexo A en la vía FM y se firma en el mismo enlace que el Convenio.' });
    if (ctx.tipologia.clase !== 'bloque') {
        const curva = d.vivienda_habitual === 'curva';
        add({ punto: '3', key: 'FM_VIVIENDA_HABITUAL', slot: 'FM_VIVIENDA_HABITUAL', quien: 'cliente',
            label: curva ? 'Vivienda habitual: curva de consumo horario de la distribuidora' : 'Vivienda habitual: facturas de luz del 1/11 al 31/3 del invierno anterior',
            help: curva
                ? 'El archivo de la curva de consumo horario, firmado digitalmente por la distribuidora eléctrica.'
                : 'Las facturas de la luz (o del combustible) que cubran SIN huecos del 1 de noviembre al 31 de marzo del invierno anterior a la obra, con el CUPS, la dirección igual que la del Catastro y más de 75 kWh al mes de media.' });
    }
    add({ punto: '4', key: 'FM_FACTURAS', cubre: 'DOC_FACTURAS', quien: 'instalador',
        label: 'Facturas de la obra (envolvente y bomba), posteriores al 22/03/2026 y anteriores al 01/12/2027', help: 'Las facturas de la rehabilitación, con la descripción de cada actuación y el nº de serie de los equipos principales.' });
    add({ punto: '5', key: 'FM_FOTOS', cubre: 'anexo_fotografico', quien: 'brokergy',
        label: 'Informe fotográfico antes y después', help: 'El Anexo Fotográfico, con las fotos del gestor.' });
    add({ punto: '6', key: 'FM_CERT_DIRECTOR_OBRA', slot: 'FM_CERT_DIRECTOR_OBRA', quien: 'brokergy', aportaInstalador: true,
        label: 'Certificado del director o responsable de la obra',
        help: 'Firmado por el director (o responsable) de la obra: los elementos actuados, la fecha de fin de obra y las variables de la fórmula (EF_i, EF_f, EF_simBC, EF_simRest y f_M).' });
    add({ punto: '7', key: 'FM_PUESTA_SERVICIO', cubre: 'DOC_RITE', quien: 'instalador', aportaInstalador: true,
        label: 'Puesta en funcionamiento de la bomba (certificado RITE registrado)', help: 'El certificado RITE registrado; si la instalación ya está inscrita y no pasa de 70 kW, el acta.' });
    add({ punto: '8', key: 'FM_CEE_PREVIO', cubre: 'cee_inicial', quien: 'brokergy',
        label: 'CEE previo a la obra, registrado', help: 'El CEE inicial registrado (EF_i).' });
    add({ punto: '9', key: 'FM_CEE_POSTERIOR', cubre: 'cee_final', quien: 'brokergy',
        label: 'CEE posterior a la obra, registrado y con la misma herramienta', help: 'El CEE final registrado (EF_f), hecho con el mismo programa que el previo.' });
    add({ punto: '10', key: 'FM_CEE_SIM_REST', slot: 'FM_CEE_SIM_REST', quien: 'brokergy', aportaInstalador: true,
        label: 'CEE simulado con TODO menos la bomba (EF_simRest)',
        help: `El CEE del edificio con la envolvente nueva y la caldera de antes, sin registrar.${d.ef_sim_rest ? ` Tecleado: ${d.ef_sim_rest} kWh/año.` : ''}` });
    add({ punto: '11', key: 'FM_CEE_SIM_BC', slot: 'FM_CEE_SIM_BC', quien: 'brokergy', aportaInstalador: true,
        label: 'CEE simulado con SOLO la bomba (EF_simBC)',
        help: `El CEE del edificio de antes con solo la caldera cambiada por la bomba, sin registrar.${d.ef_sim_bc ? ` Tecleado: ${d.ef_sim_bc} kWh/año.` : ''}` });
    add({ punto: 'IRPF', key: 'FM_CONSENTIMIENTO_IRPF', cubre: 'convenio', quien: 'cliente',
        label: 'Consentimiento: el incentivo tributa en el IRPF', help: 'Va como cláusula del Convenio de Cesión de la vía FM y en la propuesta, como en las demás fichas FM.' });
    return out;
}

/** Los que se SUBEN al gestor, como slots de `buildDocChecklist` (fase DESPUÉS). */
function slotsFm(ctx) {
    return documentosFm(ctx).filter((x) => x.slot).map((x) => ({
        key: x.slot,
        fase: 'DESPUES',
        // Lo del instalador, como el certificado RITE: no obligatorio PARA EL
        // CLIENTE. Que la ficha lo pide lo dice el panel de la vía FM (`documentosFm`).
        required: x.aportaInstalador ? false : x.required !== false,
        multiple: true,
        accept: ACCEPT_DOC,
        label: `FM ${x.punto} · ${x.label}`,
        help: x.condicion ? `${x.help} ${x.condicion}` : x.help,
        // Lo que el cliente no puede conseguir (lo emite el instalador) no se le
        // reclama: mismo criterio que el certificado RITE.
        ...(x.aportaInstalador ? { aportaInstalador: true, optionalAlways: true } : {}),
        // Lo condicionado («solo si sale F o G») no pasa a obligatorio al aceptar.
        ...(x.required === false ? { optionalAlways: true } : {}),
        viaFm: true,
        puntoFm: x.punto,
        generaFm: x.genera || null,
    }));
}

/** Todas las claves de slot que la vía FM puede llegar a pedir (para el destino y el lenguaje de casa). */
const SLOTS_FM = ['FM_DECL_INSTALADOR', 'FM_JUSTIF_PREINSTALACION', 'FM_CERT_INERCIA', 'FM_VIVIENDA_HABITUAL',
    'FM_OFERTA_MANTENIMIENTO', 'FM_BOLETIN_BT', 'FM_INFORMADO_FG', 'FM_FICHAS_HIBRIDO', 'FM_VULN_BONO_SOCIAL',
    'FM_VULN_ANEXO_B', 'FM_VULN_TITULO', 'FM_VULN_EMPADRONAMIENTO', 'FM_VULN_COMPROMISO', 'FM_VULN_CERT_PRESIDENTE',
    // RES080_FM
    'FM_CERT_DIRECTOR_OBRA', 'FM_CEE_SIM_REST', 'FM_CEE_SIM_BC'];

// Cómo se le llama al CLIENTE (enlace público). Lo del instalador no se le pide.
const LABEL_CLIENTE_FM = {
    FM_VIVIENDA_HABITUAL: { label: 'Las facturas de la luz del invierno pasado', help: 'Todas las del 1 de noviembre al 31 de marzo, sin que falte ninguna. Que se vea el CUPS (un código que empieza por ES) y la dirección de la casa.' },
    FM_OFERTA_MANTENIMIENTO: { label: 'La oferta de mantenimiento, firmada', help: 'El papel del instalador con el mantenimiento de 2 años: fírmalo tanto si lo contratas como si no (hay una casilla para cada cosa).' },
    FM_INFORMADO_FG: { label: 'El documento de que te hemos informado, firmado', help: 'Un papel que dice que te hemos explicado que, por el aislamiento de tu casa, la máquina podría rendir algo menos. Te lo mandamos para firmar.' },
    FM_VULN_BONO_SOCIAL: { label: 'Una factura de la luz con el bono social', help: 'Una factura donde salga que tienes el bono social a tu nombre. Si lo has pedido y aún no lo tienes, la solicitud.' },
    FM_VULN_ANEXO_B: { label: 'El Anexo B, firmado', help: 'Te lo mandamos rellenado: solo tienes que marcar tu casilla y firmarlo.' },
    FM_VULN_TITULO: { label: 'La nota simple o el contrato de alquiler', help: 'La nota simple del Registro si la casa es tuya; si vives de alquiler, el contrato.' },
    FM_VULN_EMPADRONAMIENTO: { label: 'El certificado de empadronamiento', help: 'Lo da el ayuntamiento: el de las personas que viven en la casa.' },
    FM_VULN_COMPROMISO: { label: 'El compromiso del inquilino, firmado', help: 'Que seguirás 2 años en la casa con el mismo alquiler.' },
    FM_VULN_CERT_PRESIDENTE: { label: 'El certificado del presidente de la comunidad', help: 'Con la cuota de cada piso y cuáles ocupan personas con bono social.' },
};

module.exports = {
    FICHA_HIBRIDACION_FM,
    TIPOLOGIAS,
    SLOTS_FM,
    LABEL_CLIENTE_FM,
    FM_INICIO_FACTURAS,
    FM_FIN_FACTURAS,
    FM_FIN_FACTURAS_CCPP,
    letraZona,
    fichaOficialFm,
    tipologiaFm,
    sanearDatosFm,
    inviernoPrevio,
    validarViviendaHabitual,
    facturasFueraDePlazo,
    contextoFm,
    documentosFm,
    slotsFm,
    GENERADOS_FM,
    CASILLAS_ANEXO_B,
    generadosParaFirmar,
    firmadoVigente,
};
