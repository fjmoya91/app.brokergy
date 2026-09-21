#!/usr/bin/env node
/**
 * test_revision_cee.js — la revisión del CEE, sin BD y sin red.
 *
 *   node scripts/test_revision_cee.js
 *
 * Dos bloques:
 *   A) el LECTOR contra los 462 certificados reales de `data/real_cases_xml`
 *      (si están presentes: viven en un worktree y no en el repo).
 *   B) el JUICIO sobre casos construidos a mano, uno por cada cosa que la
 *      revisión tiene que cazar.
 */
const fs = require('fs');
const path = require('path');

const { radiografiaXml, compararEnvolventes } = require('../services/cee/radiografiaCee');
const { revisarCee } = require('../services/cee/revisionCee');

const CORPUS = path.resolve(__dirname, '../../../.claude/worktrees/epic-hugle-450032/data/real_cases_xml');

let fallos = 0;
const ok = (cond, texto, extra) => {
    console.log(`  ${cond ? '✓' : '✗'} ${texto}${extra ? `  — ${extra}` : ''}`);
    if (!cond) fallos++;
};

// ─── A) El lector, contra certificados de verdad ─────────────────────────────

function bloqueCorpus() {
    console.log('\nA) El lector, contra el corpus real');
    if (!fs.existsSync(CORPUS)) {
        console.log('  (corpus no disponible aquí — se salta; vive en data/real_cases_xml)');
        return;
    }
    const files = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.xml'));
    let leidos = 0;
    const tiposRaros = new Set();
    const vectoresRaros = new Set();
    let sinDemanda = 0;
    let sinSuperficie = 0;

    for (const f of files) {
        const rx = radiografiaXml(fs.readFileSync(path.join(CORPUS, f)));
        leidos++;
        const gens = [...rx.generadores.calefaccion, ...rx.generadores.acs, ...rx.generadores.refrigeracion];
        for (const g of gens) {
            if (!g.tipo_conocido) tiposRaros.add(g.tipo);
            if (g.vector && !g.combustible) vectoresRaros.add(g.vector);
        }
        if (rx.demanda.calefaccion === null) sinDemanda++;
        if (rx.geometria.superficie_habitable === null) sinSuperficie++;
        //: CE3X escribe 99999999.99 donde el dato no consta: si eso se colara
        //: como valor, saldría una caldera de cien millones de kW.
        for (const g of gens) {
            if (g.potencia_kw !== null && g.potencia_kw > 10000) {
                ok(false, `${f}: potencia imposible`, `${g.potencia_kw} kW`);
            }
        }
    }
    ok(leidos === files.length, `se leen los ${files.length} certificados sin reventar`, `leídos ${leidos}`);
    ok(tiposRaros.size === 0, 'ningún <Tipo> de generador sin clasificar', [...tiposRaros].join(' · '));
    ok(vectoresRaros.size === 0, 'ningún <VectorEnergetico> sin mapear', [...vectoresRaros].join(' · '));
    ok(sinDemanda === 0, 'todos declaran demanda de calefacción');
    ok(sinSuperficie === 0, 'todos declaran superficie habitable');
}

// ─── B) El juicio ────────────────────────────────────────────────────────────

/** Un `.xml` mínimo, con los nodos que de verdad escribe CE3X. */
function xmlDe({ rc = '9034325VJ9393S0001SS', zona = 'D3', sup = 164.8, demanda = 180.83,
    calefaccion = [], acs = [], opacos = [], huecos = [],
    fecha = ce3x(FECHA_CERT), visita = ce3x(FECHA_VISITA),
    nifCert = '71355161F', nombreCert = 'RAQUEL MONCAYO TERRIZA' } = {}) {
    const gen = (g) => `<RendimientoNominal>99999999.99</RendimientoNominal>`
        + `<Tipo>${g.tipo}</Tipo><ModoDeObtencion>Estimado</ModoDeObtencion>`
        + `<VectorEnergetico>${g.vector}</VectorEnergetico>`
        + `<PotenciaNominal>${g.kw ?? 31.5}</PotenciaNominal>`
        + `<Nombre>${g.nombre}</Nombre>`
        + `<RendimientoEstacional>${g.rend ?? 0.67}</RendimientoEstacional>`;
    //: `modo` por defecto 'Usuario' = el «Conocido» de CE3X (ver MODO_CONOCIDO).
    const el = (e) => `<Elemento><Nombre>${e.nombre}</Nombre><Tipo>${e.tipo}</Tipo>`
        + `<ModoDeObtencion>${e.modo || 'Usuario'}</ModoDeObtencion>`
        + `<Superficie>${e.sup ?? 10}</Superficie><Transmitancia>${e.u}</Transmitancia>`
        + `<Orientacion>Norte</Orientacion></Elemento>`;
    return `<?xml version="1.0" encoding="UTF-8" ?><DatosEnergeticosDelEdificio version="2">
<DatosDelCertificador><NIF>${nifCert}</NIF><NIFEntidad>${nifCert}</NIFEntidad>
<NombreyApellidos>${nombreCert}</NombreyApellidos><RazonSocial>${nombreCert}</RazonSocial>
<Titulacion>Graduado en Ingeniería Industrial</Titulacion><Fecha>${fecha}</Fecha></DatosDelCertificador>
<FechaVisita>${visita}</FechaVisita><FechaGeneracion>${fecha}</FechaGeneracion>
<IdentificacionEdificio><ReferenciaCatastral>${rc}</ReferenciaCatastral>
<ZonaClimatica>${zona}</ZonaClimatica><Provincia>Ciudad Real</Provincia><Municipio>Tomelloso</Municipio>
<NormativaVigente>NBE-CT-79</NormativaVigente><Procedimiento>CEXv2.3</Procedimiento></IdentificacionEdificio>
<DatosGeneralesyGeometria><SuperficieHabitable>${sup}</SuperficieHabitable>
<NumeroDePlantasSobreRasante>99999999.99</NumeroDePlantasSobreRasante>
<VolumenEspacioHabitable>461.44</VolumenEspacioHabitable></DatosGeneralesyGeometria>
<InstalacionesTermicas>
${calefaccion.length ? `<GeneradoresDeCalefaccion>${calefaccion.map((g) => `<Generador>${gen(g)}</Generador>`).join('')}</GeneradoresDeCalefaccion>` : ''}
${acs.length ? `<InstalacionesACS>${acs.map((g) => `<Instalacion>${gen(g)}</Instalacion>`).join('')}</InstalacionesACS>` : ''}
</InstalacionesTermicas>
<Demanda><EdificioObjeto><Calefaccion>${demanda}</Calefaccion><Refrigeracion>13.39</Refrigeracion><ACS>10.06</ACS></EdificioObjeto></Demanda>
<Calificacion><EnergiaPrimariaNoRenovable><Global>E</Global></EnergiaPrimariaNoRenovable>
<EmisionesCO2><Global>E</Global></EmisionesCO2></Calificacion>
<CerramientosOpacos>${opacos.map(el).join('')}</CerramientosOpacos>
${huecos.map((h) => el({ ...h, tipo: 'Hueco' })).join('')}
</DatosEnergeticosDelEdificio>`;
}

const CALDERA_GAS = { nombre: 'CALDERA LAURA 30/30F', tipo: 'Caldera Estándar', vector: 'GasNatural', rend: 0.67 };
const BOMBA = { nombre: 'DAIKIN ALTHERMA 3', tipo: 'Bomba de Calor - Caudal Ref. Variable', vector: 'ElectricidadPeninsular', rend: 4.87 };

function expedienteDe(extra = {}) {
    return {
        numero_expediente: '26RES060_999',
        instalacion: {
            ref_catastral: '9034325VJ9393S0001SS',
            zona_climatica: 'D3',
            cambio_acs: true,
            misma_caldera_acs: true,
            caldera_antigua_cal: { rendimiento_id: 'gas_79_97' },
            ...(extra.instalacion || {}),
        },
        cee: { fecha_firma_cee_inicial: isoDe(FECHA_CERT), ...(extra.cee || {}) },
        documentacion: extra.documentacion || {},
        oportunidades: {
            datos_calculo: {
                inputs: { fuelType: 'gas_natural', ...(extra.inputs || {}) },
                result: { q_net: 180.83, superficieAplicada: 164.8 },
            },
        },
    };
}

const punto = (res, id) => res.comprobaciones.find((p) => p.id === id);

/**
 * Fechas RELATIVAS A HOY, no fijas.
 *
 * Una de las comprobaciones es «la fecha del certificado no puede ser futura»,
 * así que con fechas escritas a mano el test dice cosas distintas según el día
 * en que se ejecute — y un test atado al reloj acaba fallando sin que nadie
 * haya roto nada.
 */
const haceDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};
const ce3x = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const FECHA_CERT = haceDias(2);     // el certificado, de anteayer
const FECHA_VISITA = haceDias(10);  // la visita, diez días antes
const FECHA_OTRA = haceDias(6);     // una fecha válida pero distinta de la del expediente

async function bloqueJuicio() {
    console.log('\nB) El juicio');

    // 1 — el caso bueno
    let res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(res.veredicto === 'APTO CON AVISOS', 'un CEE correcto sale APTO CON AVISOS', `${res.veredicto} (la acumulación no se puede comprobar con el .xml)`);
    ok(res.resumen.fallas === 0, 'y sin un solo fallo');
    ok(punto(res, 'acumulacion_acs').estado === 'no_comprobable', 'la acumulación se declara NO COMPROBABLE, no se calla');

    // 2 — el certificado equivocado: el inicial ya lleva la aerotermia
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [BOMBA], acs: [BOMBA] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(res.veredicto === 'NO APTO', 'un CEE inicial que ya declara la bomba de calor → NO APTO');
    ok(punto(res, 'generador_combustion').estado === 'falla', 'y lo dice: el equipo de partida no es de combustión');
    ok(punto(res, 'combustible').estado === 'falla', 'y que el combustible no casa');

    // 3 — el combustible no es el declarado
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({
            calefaccion: [{ ...CALDERA_GAS, vector: 'GasoleoC' }], acs: [{ ...CALDERA_GAS, vector: 'GasoleoC' }],
        })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'combustible').estado === 'falla', 'gasóleo donde el expediente dice gas natural → falla');
    ok(punto(res, 'combustible').dice.includes('gasóleo'), 'y enseña la evidencia', punto(res, 'combustible').dice);

    // 3-bis — MISMA familia de combustible: la tabla del Anexo VIII no los
    //         distingue, así que el ahorro no cambia → aviso, no fallo.
    //         Medido en producción: 26RES060_181 (gas natural ↔ GLP) y
    //         25RES060_67 (carbón ↔ biomasa) son estos dos casos.
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({
            calefaccion: [{ ...CALDERA_GAS, vector: 'GLP' }], acs: [{ ...CALDERA_GAS, vector: 'GLP' }],
        })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'combustible').estado === 'aviso', 'GLP donde el expediente dice gas natural → aviso (misma fila del Anexo VIII)');
    ok(res.veredicto !== 'NO APTO', 'y no tumba el certificado', res.veredicto);

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({
            calefaccion: [{ ...CALDERA_GAS, vector: 'BiomasaPellet' }], acs: [{ ...CALDERA_GAS, vector: 'BiomasaPellet' }],
        })),
        expediente: expedienteDe({ instalacion: { caldera_antigua_cal: { rendimiento_id: 'solid_man_no_cal' } } }),
        fase: 'inicial',
    });
    ok(punto(res, 'combustible').estado === 'aviso', 'biomasa donde el expediente dice sólido sin precisar → aviso, no fallo');

    // 4 — sin generador de calefacción y el expediente NO lo declaraba así
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'generador_inicial').estado === 'falla', 'sin generador en el certificado, en un RES060 → falla');

    // 4-bis — …pero en un RES080 eso NO tumba el certificado: allí la actuación
    //         es la envolvente. Medido: los 3 casos reales de producción
    //         (26RES080_67, _76 y _77) son exactamente esto.
    const expR80SinGen = expedienteDe();
    expR80SinGen.numero_expediente = '26RES080_997';
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ acs: [CALDERA_GAS] })),
        expediente: expR80SinGen, fase: 'inicial',
    });
    ok(punto(res, 'generador_inicial').estado === 'aviso', 'sin generador en un RES080 → aviso, no fallo');

    // 5 — …y el mismo certificado, con el expediente declarando que NO había calefacción
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ acs: [CALDERA_GAS] })),
        expediente: expedienteDe({ instalacion: { caldera_antigua_cal: { rendimiento_id: 'sin_calefaccion' } } }),
        fase: 'inicial',
    });
    ok(punto(res, 'generador_inicial').estado === 'ok', 'una vivienda SIN calefacción declarada no es un fallo (regla 8.d)');

    // 6 — el ACS lo da otro aparato del que dice el expediente
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({
            calefaccion: [CALDERA_GAS],
            acs: [{ nombre: 'TERMO ARISTON', tipo: 'Efecto Joule', vector: 'ElectricidadPeninsular', rend: 1 }],
        })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'acs_alcance').estado === 'aviso', 'un ACS con otro aparato, diciendo el expediente que es la misma caldera → aviso');

    // 7 — la vivienda no es la del expediente
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ rc: '1111111VJ1111S0001AA', calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'ref_catastral').estado === 'falla', 'otra referencia catastral → falla');

    // 8 — la demanda certificada por debajo de la simulada
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ demanda: 120, calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'demanda').estado === 'falla', 'demanda muy por debajo de la simulada → falla');

    // 9 — RES080: la cubierta que cambia es la que el expediente declara
    const ini = radiografiaXml(xmlDe({
        calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS],
        opacos: [{ nombre: 'CUBIERTA URALITA', tipo: 'Cubierta', u: 3.67 }, { nombre: 'FACHADA N', tipo: 'Fachada', u: 1.69 }],
    }));
    const fin = radiografiaXml(xmlDe({
        calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS],
        opacos: [{ nombre: 'CUBIERTA URALITA', tipo: 'Cubierta', u: 0.21 }, { nombre: 'FACHADA N', tipo: 'Fachada', u: 1.69 }],
    }));
    const expR80 = expedienteDe({
        inputs: { isReforma: true },
        documentacion: { envolvente: { aislamiento_cubierta: true } },
    });
    expR80.numero_expediente = '26RES080_999';
    res = await revisarCee({ radiografia: ini, otraFase: fin, expediente: expR80, fase: 'inicial' });
    ok(res.ficha === 'RES080', 'se detecta la ficha RES080');
    ok(punto(res, 'envolvente').estado === 'ok', 'la cubierta declarada es la que cambia entre los dos certificados');
    ok(punto(res, 'envolvente').dice.includes('CUBIERTA URALITA'), 'y se dice CUÁL con su U antes y después', punto(res, 'envolvente').dice);

    // 10 — RES080 en el que NO cambia nada
    res = await revisarCee({ radiografia: ini, otraFase: ini, expediente: expR80, fase: 'inicial' });
    ok(punto(res, 'envolvente').estado === 'falla', 'dos certificados con la MISMA envolvente en un RES080 → falla');

    // 11 — RES080 que mejora algo que el expediente no declara
    //: ⚠️ El NÚMERO manda sobre los inputs al detectar la ficha
    //: (`fichaFromNumero` es lo primero que mira `detectPrograma`), así que un
    //: expediente de prueba que quiera ser RES080 tiene que llamarse así.
    const expVentanas = expedienteDe({ documentacion: { envolvente: { sustituye_ventanas: true } } });
    expVentanas.numero_expediente = '26RES080_998';
    res = await revisarCee({ radiografia: ini, otraFase: fin, fase: 'inicial', expediente: expVentanas });
    ok(punto(res, 'envolvente').estado === 'falla', 'el expediente declara ventanas y el certificado mejora la cubierta → falla');

    // 12 — con un solo certificado no se puede decir qué cambia
    res = await revisarCee({ radiografia: ini, expediente: expR80, fase: 'inicial' });
    ok(punto(res, 'envolvente').estado === 'no_comprobable', 'con un solo .xml, los elementos sustituidos NO se afirman');

    // 13 — fase FINAL: tiene que estar la bomba de calor
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'final',
    });
    ok(punto(res, 'generador_final').estado === 'falla', 'un CEE final que sigue declarando la caldera → falla');

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [BOMBA], acs: [BOMBA] })),
        expediente: expedienteDe(), fase: 'final',
    });
    ok(punto(res, 'generador_final').estado === 'ok', 'y con la bomba de calor declarada, correcto');

    // 14 — el `tipo` viaja con cada cambio de cerramiento (sin él, el cruce con
    //      la pestaña Envolvente no puede saber si lo que cambia es la cubierta)
    const cambios = compararEnvolventes(ini, fin);
    ok(cambios.opacos.cambiados.every((c) => !!c.tipo), 'cada cerramiento que cambia dice de qué TIPO es');

    // ── TRANSMITANCIAS ───────────────────────────────────────────────────────
    const OPACOS_OK = [
        { nombre: 'F1E', tipo: 'Fachada', u: 1.69 },
        { nombre: 'CU1', tipo: 'Cubierta', u: 1.0 },
        { nombre: 'SU1', tipo: 'Suelo', u: 1.25 },
    ];
    const conOpacos = (opacos) => radiografiaXml(xmlDe({
        calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], opacos,
    }));

    res = await revisarCee({ radiografia: conOpacos(OPACOS_OK), expediente: expedienteDe(), fase: 'inicial' });
    ok(punto(res, 'transmitancias').estado === 'ok', 'todas las transmitancias como «Usuario» (= Conocido) → correcto');

    res = await revisarCee({
        radiografia: conOpacos([
            { ...OPACOS_OK[0], modo: 'PorDefecto' },
            { ...OPACOS_OK[1], modo: 'Estimado' },
            OPACOS_OK[2],
        ]),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'transmitancias').estado === 'aviso', 'una «por defecto» y una «estimada» → aviso, no fallo');
    ok(punto(res, 'transmitancias').dice.includes('2 de 2'), 'y se dice cuántas y cuáles', punto(res, 'transmitancias').dice);
    ok(res.veredicto !== 'NO APTO', 'y no tumba el certificado', res.veredicto);

    //: En un RES080, un cerramiento sin justificar que ADEMÁS se rehabilita pesa
    //: más: su U de partida es la base del ahorro.
    const expR80Cub = expedienteDe({ documentacion: { envolvente: { aislamiento_cubierta: true } } });
    expR80Cub.numero_expediente = '26RES080_996';
    res = await revisarCee({
        radiografia: conOpacos([OPACOS_OK[0], { ...OPACOS_OK[1], modo: 'PorDefecto' }, OPACOS_OK[2]]),
        expediente: expR80Cub, fase: 'inicial',
    });
    ok(/REHABILITA/.test(punto(res, 'transmitancias').detalle || ''),
        'y en un RES080 se señala si la sin justificar es la que se rehabilita');

    //: El SUELO no dispara el aviso —solo el 11 % de los certificados de
    //: producción lo justifica— pero SÍ se menciona, para no esconderlo.
    res = await revisarCee({
        radiografia: conOpacos([OPACOS_OK[0], OPACOS_OK[1], { ...OPACOS_OK[2], modo: 'PorDefecto' }]),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'transmitancias').estado === 'ok', 'el SUELO por defecto NO dispara el aviso');
    ok(/suelo/i.test(punto(res, 'transmitancias').dice), 'pero se menciona igualmente', punto(res, 'transmitancias').dice);

    //: Los PUENTES TÉRMICOS no cuentan: van casi siempre por defecto (19.999 de
    //: 29.780 apariciones del corpus) y ahogarían el recuento de fachadas.
    const conPuentes = radiografiaXml(xmlDe({
        calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS],
        opacos: [...OPACOS_OK,
            { nombre: 'PT1', tipo: 'Pilar en Esquina', u: 0.1, sup: null, modo: 'PorDefecto' }],
    }));
    res = await revisarCee({ radiografia: conPuentes, expediente: expedienteDe(), fase: 'inicial' });
    ok(punto(res, 'transmitancias').estado === 'ok', 'un puente térmico «por defecto» no cuenta como transmitancia sin justificar');

    // ── FECHAS ───────────────────────────────────────────────────────────────
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'fecha_certificado').estado === 'ok', 'la fecha del certificado coincide con la del expediente');
    ok(punto(res, 'fecha_visita').estado === 'ok', 'y la visita es anterior al certificado');

    res = await revisarCee({
        //: Una fecha PASADA y distinta de la del expediente. Con una futura
        //: caería en la otra rama (fecha imposible), que es otro punto.
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], fecha: ce3x(FECHA_OTRA) })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'fecha_certificado').estado === 'aviso', 'otra fecha que la del expediente → aviso');
    ok(/le pide firmar/.test(punto(res, 'fecha_certificado').detalle || ''),
        'y se explica que el visto bueno le pedirá la del expediente');

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], visita: ce3x(haceDias(1)) })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'fecha_visita').estado === 'falla', 'una visita POSTERIOR al certificado → falla');

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], visita: '//' })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'fecha_visita').estado === 'aviso', 'sin fecha de visita («//») → aviso');

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], fecha: '31/12/2099' })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'fecha_certificado').estado === 'falla', 'una fecha de certificado FUTURA → falla');

    //: El posterior a la obra va después del de partida.
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], fecha: ce3x(FECHA_CERT) })),
        otraFase: radiografiaXml(xmlDe({ calefaccion: [BOMBA], acs: [BOMBA], fecha: '01/01/2020' })),   // muy anterior: el final no puede ir antes
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'orden_fases').estado === 'falla', 'un CEE final ANTERIOR al inicial → falla');

    // ── QUIÉN FIRMA ──────────────────────────────────────────────────────────
    const CERT = { razon_social: 'MONCAYO', cif: '71355161F', nombre_responsable: 'RAQUEL' };
    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial', certificador: CERT,
    });
    ok(punto(res, 'certificador').estado === 'ok', 'lo firma el técnico asignado → correcto');

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({
            calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS], nifCert: '06282551D', nombreCert: 'OTRO TÉCNICO',
        })),
        expediente: expedienteDe(), fase: 'inicial', certificador: CERT,
    });
    ok(punto(res, 'certificador').estado === 'aviso', 'lo firma OTRO técnico → aviso, no fallo');
    ok(punto(res, 'certificador').dice.includes('OTRO TÉCNICO'), 'y se dice quién', punto(res, 'certificador').dice);

    res = await revisarCee({
        radiografia: radiografiaXml(xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })),
        expediente: expedienteDe(), fase: 'inicial',
    });
    ok(punto(res, 'certificador').estado === 'no_comprobable', 'sin certificador asignado, no se afirma nada');

    // 15 — EL XML GUARDADO EN LA BD, QUE ESTÁ EN MAYÚSCULAS.
    //
    // `normalizeData` deja `cee.xml_inicial` entero en MAYÚSCULAS, y por eso
    // `parseCeeXml` no puede releerlo (regla 32: busca los tags con mayúsculas
    // exactas y además DOMParser rechaza `<?XML VERSION…?>`). Este lector sí,
    // porque busca sin distinguir mayúsculas y normaliza los valores antes de
    // casarlos con los enums — y de ahí sale que la revisión se puede hacer sin
    // bajar nada de Drive. Si alguien quita el flag `i` de las expresiones, esto
    // deja de funcionar EN SILENCIO: el lector devolvería todo a null.
    const enMayusculas = xmlDe({ calefaccion: [CALDERA_GAS], acs: [CALDERA_GAS] })
        .replace(/<(\/?)(\w+)/g, (_, cierre, tag) => `<${cierre}${tag.toUpperCase()}`)
        .replace(/CALDERA Estándar/gi, 'CALDERA ESTÁNDAR')
        .toUpperCase();
    const rxMay = radiografiaXml(enMayusculas);
    const gMay = rxMay.generadores.calefaccion[0];
    ok(!!gMay, 'el .xml EN MAYÚSCULAS de la BD se lee igual');
    ok(gMay && gMay.tipo_conocido && gMay.es_combustion === true, 'y su <TIPO> se sigue clasificando', gMay && gMay.tipo);
    ok(gMay && gMay.combustible === 'gas_natural', 'y su <VECTORENERGETICO> se sigue mapeando', gMay && gMay.combustible);
    ok(rxMay.geometria.superficie_habitable === 164.8, 'y los números siguen saliendo', String(rxMay.geometria.superficie_habitable));
    ok(rxMay.identificacion.ref_catastral === '9034325VJ9393S0001SS', 'y la referencia catastral');
}

(async () => {
    console.log('REVISIÓN DEL CEE');
    bloqueCorpus();
    await bloqueJuicio();
    console.log(`\n${fallos === 0 ? '✓ todo correcto' : `✗ ${fallos} comprobaciones han fallado`}`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('✗', e); process.exit(1); });
