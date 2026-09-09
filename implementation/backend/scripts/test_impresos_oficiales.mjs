/**
 * test_impresos_oficiales.mjs — el impreso oficial se rellena entero y sin sorpresas.
 * ---------------------------------------------------------------------------
 * Las fichas y el Anexo I se generan rellenando el PDF de formulario del
 * Ministerio. Lo que puede romperse ahí no da error: deja un HUECO. Un nombre de
 * campo mal escrito, una CCAA que no casa con ninguna opción del desplegable, un
 * carácter que la tipografía no sabe escribir — el PDF sale, se firma y se presenta,
 * y el requerimiento llega tres semanas después.
 *
 * Esto comprueba los casos que de verdad se dan y que no salen en un expediente
 * cualquiera: cliente EMPRESA (firma su representante), subvención declarada (las
 * casillas del apartado 4 y de la declaración responsable), cascada de equipos
 * (varias series en una casilla), ACS fuera de alcance ("no aplica") y las CCAA que
 * la BD escribe distinto del impreso.
 *
 * No toca la base de datos, ni Drive, ni envía nada.
 *
 *   node implementation/backend/scripts/test_impresos_oficiales.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { rellenar, PLANTILLAS } = require('../services/formularioOficialService');

const F = '../../frontend/src/features/expedientes';
const { fichaFormulario } = await import(`${F}/logic/fichasFormulario.js`);
const { anexoIFormulario } = await import(`${F}/logic/anexoIFormulario.js`);
const { PDFDocument, PDFCheckBox, PDFDropdown, PDFTextField } = require('pdf-lib');

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};

/** Lo que de verdad ha quedado escrito dentro del PDF, campo a campo. */
async function leerCampos(pdfBytes) {
    const doc = await PDFDocument.load(pdfBytes);
    const out = {};
    for (const f of doc.getForm().getFields()) {
        if (f instanceof PDFTextField) out[f.getName()] = f.getText() || '';
        else if (f instanceof PDFCheckBox) out[f.getName()] = f.isChecked();
        else if (f instanceof PDFDropdown) out[f.getName()] = (f.getSelected() || [])[0] || '';
    }
    return out;
}

async function generar(formulario) {
    const { pdf, avisos } = await rellenar(formulario.plantilla, formulario.campos, { fdo: formulario.fdo });
    return { pdf, avisos, escritos: await leerCampos(pdf) };
}

// ─── El expediente de laboratorio ────────────────────────────────────────────
const base = {
    numero_expediente: '26RES060_999',
    oportunidades: { ficha: 'RES060', datos_calculo: { inputs: {}, zona: 'D3' } },
    clientes: {
        nombre_razon_social: 'MARÍA JUANA', apellidos: 'MONTOYA JAIME', dni: '70718996E',
        direccion: 'CL NUMANCIA 13', codigo_postal: '13240', municipio: 'La Solana', provincia: 'Ciudad Real',
        tlf: '615126831', email: 'cliente@ejemplo.es',
    },
    instalacion: {
        ref_catastral: '0005721VJ8100N0001TP', ccaa: 'Castilla-La Mancha',
        cambio_acs: true, misma_aerotermia_acs: true,
        caldera_antigua_cal: { rendimiento_id: 'default' },
        aerotermia_cal: { scop: 4.5, numero_serie: 'SERIE-1' },
    },
    cee: { cee_inicial: { demandaCalefaccion: 120.5, superficieHabitable: 110, demandaACS: 21.4 } },
    documentacion: { fecha_inicio_cifo: '2026-01-12', fecha_fin_cifo: '2026-02-28' },
};

const con = (patch) => ({ ...base, ...patch });

console.log('═══ El impreso oficial se rellena entero ═══');

// ── 1. Las cuatro fichas: ni un aviso, y la tabla del cálculo llena ──────────
console.log('\n1. Las cuatro fichas se rellenan sin dejar campos fuera');
for (const ficha of ['RES060', 'RES080', 'RES093', 'TER100']) {
    const exp = con({ numero_expediente: `26${ficha}_999` });
    const form = fichaFormulario(ficha, exp, { results: { savingsKwh: 38215 } });
    const { avisos, escritos } = await generar(form);
    check(avisos.length === 0, `${ficha}: el impreso acepta todos los campos`, avisos.join(' · '));
    // El representante y las fechas son de todas; el resto cambia por ficha.
    check(!!escritos['NIFNIE'], `${ficha}: el NIF del representante queda escrito`);
    check(!!escritos['Fecha inicio actuación'], `${ficha}: la fecha de inicio queda escrita`, escritos['Fecha inicio actuación']);
}

// ── 2. El ahorro llega al impreso tal cual ──────────────────────────────────
console.log('\n2. El ahorro es el que se le pasa, con su formato español');
{
    const form = fichaFormulario('RES060', base, { results: { savingsKwh: 38215.4 } });
    const { escritos } = await generar(form);
    check(escritos['AEtotal'] === '38.215', 'AE_TOTAL = "38.215"', escritos['AEtotal']);
    check(escritos['DCAL'] === '120,50', 'D_CAL = "120,50"', escritos['DCAL']);
    check(escritos['S'] === '110,00', 'S = "110,00"', escritos['S']);
    check(escritos['SCOP'] === '4,50', 'SCOP = "4,50"', escritos['SCOP']);
}

// ── 3. ACS fuera de alcance: "no aplica", nunca 0 (regla 12.b) ──────────────
console.log('\n3. Con el ACS fuera de alcance, D_ACS y SCOP_dhw dicen "no aplica"');
{
    const exp = con({ instalacion: { ...base.instalacion, cambio_acs: false } });
    const { escritos } = await generar(fichaFormulario('RES060', exp, { results: {} }));
    check(escritos['DACS'] === 'no aplica', 'D_ACS = "no aplica"', escritos['DACS']);
    check(escritos['SCOPdhw'] === 'no aplica', 'SCOP_dhw = "no aplica"', escritos['SCOPdhw']);
}

// ── 4. Cascada: TODAS las series en la casilla del Anexo I ──────────────────
console.log('\n4. En cascada, el Anexo I lista todas las unidades');
{
    const exp = con({
        instalacion: {
            ...base.instalacion,
            aerotermia_cal: { scop: 4.5, numero_serie: 'SERIE-1', equipos_extra: [{ numero_serie: 'SERIE-2' }, { numero_serie: 'SERIE-3' }] },
        },
    });
    const { escritos, avisos } = await generar(anexoIFormulario(exp, {}, {}));
    const series = escritos['n serie de equipos'] || '';
    check(avisos.length === 0, 'el Anexo I acepta todos los campos', avisos.join(' · '));
    check(['SERIE-1', 'SERIE-2', 'SERIE-3'].every(s => series.includes(s)), 'las tres series están en la casilla', JSON.stringify(series));
    check(!series.includes('<br>'), 'no se cuela ni un <br> de la maqueta HTML', JSON.stringify(series));
}

// ── 5. Sin nº de serie no queda un rótulo suelto ────────────────────────────
console.log('\n5. Sin nº de serie, la casilla se queda vacía (no "Ud. exterior:" a secas)');
{
    const exp = con({ instalacion: { ...base.instalacion, aerotermia_cal: { scop: 4.5 } } });
    const { escritos } = await generar(anexoIFormulario(exp, {}, {}));
    check((escritos['n serie de equipos'] || '').trim() === '', 'la casilla de series queda en blanco', JSON.stringify(escritos['n serie de equipos']));
}

// ── 6. Cliente EMPRESA: firma el representante legal (regla 23) ─────────────
console.log('\n6. Cliente empresa: el apartado 3 y el "Fdo." son del representante');
{
    const exp = con({
        clientes: {
            es_empresa: true, nombre_razon_social: 'CONSTRUCCIONES MARIANO 1999, SL', dni: 'B13123456',
            representante_nombre: 'MARIANO', representante_apellidos: 'GARCÍA DE LA HOZ', representante_dni: '05123456X',
            direccion: 'CL MAYOR 1', codigo_postal: '13700', municipio: 'Tomelloso', tlf: '600111222', email: 'obras@ejemplo.es',
        },
    });
    const form = anexoIFormulario(exp, {}, {});
    const { escritos } = await generar(form);
    check(escritos['Prop inicial de ahorro'] === 'CONSTRUCCIONES MARIANO 1999, SL', 'el propietario del ahorro es la SOCIEDAD', escritos['Prop inicial de ahorro']);
    check(escritos['Representante'] === 'MARIANO GARCÍA DE LA HOZ', 'el representante va en el apartado 3', escritos['Representante']);
    check(escritos['NIFNIE-1'] === '05123456X', 'con su propio NIF', escritos['NIFNIE-1']);
    check(form.fdo === 'MARIANO GARCÍA DE LA HOZ', 'y es quien firma ("Fdo.")', form.fdo);
}

// ── 7. Subvención declarada: casillas y tabla del apartado de ayudas ────────
console.log('\n7. Una ayuda declarada llega entera al impreso');
{
    const exp = con({
        documentacion: {
            ...base.documentacion,
            subvenciones: {
                bono_social: { percibe: true, tipos: ['electrico_vulnerable', 'termico'] },
                solicitada: true,
                ayuda: {
                    catalogo_id: 'RD477_2021', num_expediente: 'PR3-13-2024-00144', estado: 'PENDIENTE',
                    fecha_solicitud: '2024-08-10', fecha_resolucion: '2026-01-31', cuantia_eur: '18800',
                },
            },
        },
    });
    const { escritos } = await generar(anexoIFormulario(exp, {}, {}));
    check(escritos['Se ha solicitado ayuda o subvención'] === true, 'marca "SE HA SOLICITADO"');
    check(escritos['No se ha solicitado ayuda o subvención'] === false, 'y NO marca la contraria');
    check(escritos['Está pendiente de resolución dicha ayuda'] === true, 'marca "pendiente de resolución"');
    check(escritos['Bono social eléctrico para consumidores vulnerable'] === true, 'marca el bono social eléctrico (vulnerables)');
    check(escritos['Bono social térmico'] === true, 'marca el bono social térmico');
    check(escritos['Ninguno de los anteriores'] === false, 'y NO marca "ninguno de los anteriores"');
    check(escritos['Año'] === '2021', 'el año del programa', escritos['Año']);
    check(escritos['Disposición reguladora'] === 'Real Decreto 477/2021, de 29 de junio', 'la disposición reguladora', escritos['Disposición reguladora']);
    check(escritos['Fecha de solicitud'] === '10/08/2024', 'la fecha de solicitud en dd/mm/aaaa', escritos['Fecha de solicitud']);
    // El EURO no está en Latin-1: sin la lista de extras de WinAnsi salía "18.800,00 ?".
    check(escritos['Cuantía de la ayuda esperada obtenida'] === '18.800,00 €', 'la cuantía, con su símbolo del euro', escritos['Cuantía de la ayuda esperada obtenida']);
}

// ── 8. Sin ayuda: la declaración por defecto ───────────────────────────────
console.log('\n8. Sin nada declarado: "NO SE HA SOLICITADO" y "ninguno de los anteriores"');
{
    const { escritos } = await generar(anexoIFormulario(base, {}, {}));
    check(escritos['No se ha solicitado ayuda o subvención'] === true, 'marca "NO SE HA SOLICITADO"');
    check(escritos['Ninguno de los anteriores'] === true, 'marca "ninguno de los anteriores"');
    check(escritos['Otro'] === true, 'y el título de representación es el convenio de cesión');
    check(escritos['Otro documento'] === '26RES060_999 - ANEXO CESIÓN AHORRO', 'con el nº de expediente', escritos['Otro documento']);
}

// ── 9. La CCAA se ELIGE del desplegable, la escriba como la escriba la BD ───
console.log('\n9. La comunidad autónoma casa con la opción oficial');
{
    const casos = [
        ['CASTILLA-LA MANCHA', 'Castilla-La Mancha'],
        ['Comunidad Valenciana', 'Comunitat Valenciana'],
        ['Baleares', 'Illes Balears'],
        ['Navarra', 'Comunidad Foral de Navarra'],
        ['Asturias', 'Principado de Asturias'],
        ['Región de Murcia', 'Región de Murcia'],
        ['PAÍS VASCO', 'País Vasco'],
    ];
    for (const [guardada, esperada] of casos) {
        const exp = con({ instalacion: { ...base.instalacion, ccaa: guardada } });
        const { escritos } = await generar(anexoIFormulario(exp, {}, {}));
        check(escritos['CC AA'] === esperada, `"${guardada}" → "${esperada}"`, escritos['CC AA']);
    }
}

// ── 10. El campo de firma del impreso no deja su sello "SIGN" ──────────────
console.log('\n10. El sello "SIGN" de la plantilla no sale en el documento');
{
    for (const plantilla of Object.keys(PLANTILLAS)) {
        const { pdf } = await rellenar(plantilla, {});
        const doc = await PDFDocument.load(pdf);
        const firmas = doc.getForm().getFields().filter(f => f.constructor.name === 'PDFSignature');
        check(firmas.length === 0, `${plantilla}: sin campo de firma heredado`, firmas.map(f => f.getName()).join(','));
    }
}

// ── 11. Una plantilla que no existe no se rellena ─────────────────────────
console.log('\n11. Solo se rellenan las plantillas conocidas');
{
    let lanzo = false;
    try { await rellenar('../../../etc/passwd', {}); } catch { lanzo = true; }
    check(lanzo, 'una plantilla desconocida se rechaza');
}

console.log(`\n═══ ${ok} bien · ${ko} mal ═══`);
process.exit(ko ? 1 : 0);
