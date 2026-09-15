// ─── test_borrador_cee.mjs ───────────────────────────────────────────────────
// El borrador para presentar el CEE, contrastado contra el acuse REAL de
// 26RES060_186 (plantillas/BORRADOR PRESENTAR CEE.pdf): los datos que el
// certificador tecleó en la sede tienen que ser los que la app compone sola.
//
//   node implementation/backend/scripts/test_borrador_cee.mjs

import { buildBorradorCee, buildBorradorCeeHtml, trocearVia, usoEdificio, ccaaDe, partirApellidos }
    from '../../frontend/src/features/expedientes/logic/borradorCee.js';
import { leerCalificacionesDeTexto } from '../../frontend/src/features/calculator/logic/xmlCeeParser.js';

let ok = 0, fail = 0;
const eq = (nombre, real, esperado) => {
    const a = JSON.stringify(real), b = JSON.stringify(esperado);
    if (a === b) { ok++; console.log(`  ✓ ${nombre}`); }
    else { fail++; console.log(`  ✗ ${nombre}\n      esperado: ${b}\n      real:     ${a}`); }
};
const test = (n, f) => { console.log(`\n── ${n}`); f(); };

// Lo que el PDF del acuse dice en cada apartado, para poder compararlo campo a campo.
const campo = (b, apId, nombre) =>
    (b.apartados.find(a => a.id === apId)?.campos || []).find(c => c.campo === nombre)?.valor ?? null;

// ─── 1. Troceo de la vía ─────────────────────────────────────────────────────
test('trocearVia — direcciones reales de la base de datos', () => {
    eq('"CL MEJICO 4" (cliente de 26RES060_186)',
        trocearVia('CL MEJICO 4'),
        { tipo: 'Calle', nombre: 'MEJICO', numero: '4', portal: '', escalera: '', planta: '', puerta: '', resto: '', original: 'CL MEJICO 4' });

    // El certificador del expediente. El acuse lo declara: Calle DON SERGIO,
    // nº 12, Planta 1, Puerta E.
    const s = trocearVia('C/ DON SERGIO, 12 - 1ºE');
    eq('"C/ DON SERGIO, 12 - 1ºE" → tipo', s.tipo, 'Calle');
    eq('"C/ DON SERGIO, 12 - 1ºE" → nombre', s.nombre, 'DON SERGIO');
    eq('"C/ DON SERGIO, 12 - 1ºE" → número', s.numero, '12');
    eq('"C/ DON SERGIO, 12 - 1ºE" → planta', s.planta, '1');
    eq('"C/ DON SERGIO, 12 - 1ºE" → puerta', s.puerta, 'E');

    const a = trocearVia('AVD. DON ANTONIO HUERTAS Nº19');
    eq('"AVD. DON ANTONIO HUERTAS Nº19" → tipo', a.tipo, 'Avenida');
    eq('"AVD. DON ANTONIO HUERTAS Nº19" → nombre', a.nombre, 'DON ANTONIO HUERTAS');
    eq('"AVD. DON ANTONIO HUERTAS Nº19" → número', a.numero, '19');

    const n = trocearVia('CALLE NIEVES, 45-3A');
    eq('"CALLE NIEVES, 45-3A" → nombre', n.nombre, 'NIEVES');
    eq('"CALLE NIEVES, 45-3A" → planta/puerta', [n.planta, n.puerta], ['3', 'A']);

    // Lo ambiguo NO se reparte a ojo: se deja entero y con su aviso.
    const c = trocearVia('CARRER NUNO SANÇ 5-B-3');
    eq('"CARRER NUNO SANÇ 5-B-3" → número', c.numero, '5');
    eq('"CARRER NUNO SANÇ 5-B-3" → NO inventa planta ni puerta', [c.planta, c.puerta], ['', '']);
    eq('"CARRER NUNO SANÇ 5-B-3" → lo ambiguo queda en resto', c.resto, 'B-3');

    // Con el CP y el municipio pegados (como lo guarda el Catastro), se corta.
    const f = trocearVia('CL MEJICO 4 13620 PEDRO MUÑOZ (CIUDAD REAL)');
    eq('cadena completa del Catastro → nombre', f.nombre, 'MEJICO');
    eq('cadena completa del Catastro → número', f.numero, '4');

    // Una sigla que no está en la tabla no se traduce: se deja en el nombre.
    eq('sigla desconocida no inventa un tipo', trocearVia('XX ALGUNA COSA 3').tipo, '');
});

// ─── 1.b Apellido 1 y Apellido 2 ─────────────────────────────────────────────
// El formulario los pide por separado y la app los guarda juntos.
test('partirApellidos — como los pide el formulario', () => {
    // El caso del formulario REAL de 26RES060_187.
    const r = partirApellidos('RAMOS FERNANDEZ MARCOTE');
    eq('"RAMOS FERNANDEZ MARCOTE"', [r.ap1, r.ap2], ['RAMOS', 'FERNANDEZ MARCOTE']);
    eq('y se marca como conjetura, porque podría ser al revés', r.dudoso, true);

    const dos = partirApellidos('MOYA LÓPEZ');
    eq('"MOYA LÓPEZ" (el certificador)', [dos.ap1, dos.ap2], ['MOYA', 'LÓPEZ']);
    eq('con dos palabras no hay duda', dos.dudoso, false);

    // Las partículas van PEGADAS a la palabra que siguen: "DE LA FUENTE" es UN
    // apellido, no tres.
    const p = partirApellidos('DE LA FUENTE GARCIA');
    eq('"DE LA FUENTE GARCIA"', [p.ap1, p.ap2], ['DE LA FUENTE', 'GARCIA']);
    eq('ahí la partícula marca el corte, no es conjetura', p.dudoso, false);

    // Y una partícula DESPUÉS de la primera palabra abre el SEGUNDO apellido.
    const q = partirApellidos('GARCIA DE LA TORRE');
    eq('"GARCIA DE LA TORRE"', [q.ap1, q.ap2], ['GARCIA', 'DE LA TORRE']);
    eq('tampoco es conjetura', q.dudoso, false);

    eq('un solo apellido no inventa el segundo',
        [partirApellidos('PLIEGO').ap1, partirApellidos('PLIEGO').ap2], ['PLIEGO', '']);
    eq('sin apellidos no revienta',
        [partirApellidos(null).ap1, partirApellidos('').ap2], ['', '']);
});

// ─── 2. Casillas VIVIENDA / TERCIARIO ────────────────────────────────────────
test('usoEdificio — las ocho casillas del impreso', () => {
    eq('VIVIENDAUNIFAMILIAR (el del acuse)', usoEdificio('VIVIENDAUNIFAMILIAR'),
        { uso: 'VIVIENDA UNIFAMILIAR', casillas: ['Vivienda', 'Unifamiliar'] });
    eq('ViviendaIndividualEnBloque', usoEdificio('ViviendaIndividualEnBloque'),
        { uso: 'VIVIENDA INDIVIDUAL EN BLOQUE', casillas: ['Vivienda', 'Bloque', 'Vivienda Individual'] });
    eq('BloqueDeViviendaCompleto', usoEdificio('BloqueDeViviendaCompleto'),
        { uso: 'BLOQUE DE VIVIENDAS COMPLETO', casillas: ['Vivienda', 'Bloque', 'Bloque Completo'] });
    eq('EdificioUsoTerciario', usoEdificio('EdificioUsoTerciario'),
        { uso: 'EDIFICIO DE USO TERCIARIO', casillas: ['Terciario', 'Edificio completo'] });
    eq('LocalUsoTerciario', usoEdificio('LocalUsoTerciario'),
        { uso: 'LOCAL DE USO TERCIARIO', casillas: ['Terciario', 'Local'] });
    eq('un tipo desconocido no marca nada', usoEdificio('LoQueSea'), { uso: null, casillas: [] });
});

// ─── 3. El expediente del acuse, campo a campo ───────────────────────────────
// Datos tal cual están hoy en Supabase para 26RES060_186.
const CTX = {
    expediente: {
        numero_expediente: '26RES060_186',
        instalacion: {},
        cee: {
            certificador_id: 'c05b23c1-aa81-4a9a-bd6b-b59cb65775c5',
            fecha_firma_cee_inicial: '2026-09-14',
            fecha_visita_cee_inicial: '2026-09-14',
            cee_inicial: {
                tipoEdificio: 'VIVIENDAUNIFAMILIAR',
                fechaFirma: '2026-09-14',
                fechaVisita: '2026-09-14',
                epnrLetra: 'G',
                emisionesLetra: 'G',
                identificacion: {
                    nombre: 'UNIFAMILIAR EN CL MEJICO 4',
                    direccion: 'CL MEJICO 4',
                    municipio: 'PEDRO MUÑOZ',
                    provincia: 'Ciudad Real',
                    refCatastral: '4410205WJ0641S0001JH',
                },
            },
        },
    },
    cliente: {
        nombre_razon_social: 'ISAAC', apellidos: 'PLIEGO RODRIGUEZ', dni: '06226790T',
        sexo: 'HOMBRE', direccion: 'CL MEJICO 4 13620 PEDRO MUÑOZ (CIUDAD REAL)',
        municipio: 'PEDRO MUÑOZ', provincia: 'CIUDAD REAL', codigo_postal: '13620',
        tlf: '619405783', email: 'isaacpliego@hotmail.com', es_empresa: false,
    },
    certificador: {
        razon_social: 'FRANCISCO JAVIER MOYA LÓPEZ', cif: '06282551D', es_autonomo: true,
        nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ',
        nif_responsable: null, tlf: '623926179', tlf_responsable: '623926179',
        email: 'franciscojavier.moya.s2e2@gmail.com',
        direccion: 'C/ DON SERGIO, 12 - 1ºE', municipio: 'TOMELLOSO',
        provincia: 'CIUDAD REAL', codigo_postal: '13700',
    },
    oportunidad: { ref_catastral: '4410205WJ0641S0001JH' },
};

test('26RES060_186 — 01 Solicitante (lo que dice el acuse)', () => {
    // La fecha de referencia es el día en que se presentó de verdad: así el aviso
    // del plazo no salta y el test no caduca.
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    eq('se genera (es de Castilla-La Mancha)', [b.aplica, b.ccaa], [true, 'CASTILLA-LA MANCHA']);
    eq('NIF', campo(b, '01', 'NIF'), '06226790T');
    eq('Nombre', campo(b, '01', 'Nombre'), 'ISAAC');
    eq('Apellido 1', campo(b, '01', 'Apellido 1'), 'PLIEGO');
    eq('Apellido 2', campo(b, '01', 'Apellido 2'), 'RODRIGUEZ');
    eq('Sexo', campo(b, '01', 'Sexo'), 'Hombre');
    eq('Tipo vía', campo(b, '01', 'Tipo vía'), 'Calle');
    eq('Nombre de la vía', campo(b, '01', 'Nombre de la vía'), 'MEJICO');
    eq('N.º Calle', campo(b, '01', 'N.º Calle'), '4');
    eq('Provincia', campo(b, '01', 'Provincia'), 'Ciudad Real');
    eq('Población', campo(b, '01', 'Población'), 'PEDRO MUÑOZ');
    eq('Código Postal', campo(b, '01', 'Código Postal'), '13620');
    eq('Teléfono móvil', campo(b, '01', 'Teléfono móvil'), '619405783');
    eq('e-mail', campo(b, '01', 'e-mail'), 'isaacpliego@hotmail.com');
    eq('En calidad de', campo(b, '01', 'En calidad de'), 'Propietario');
});

test('26RES060_186 — 02 Representante (el certificador asignado)', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    eq('NIF', campo(b, '02', 'NIF'), '06282551D');
    eq('Nombre', campo(b, '02', 'Nombre'), 'FRANCISCO JAVIER');
    eq('Apellido 1', campo(b, '02', 'Apellido 1'), 'MOYA');
    eq('Apellido 2', campo(b, '02', 'Apellido 2'), 'LÓPEZ');
    eq('Nombre de la vía', campo(b, '02', 'Nombre de la vía'), 'DON SERGIO');
    eq('N.º Calle', campo(b, '02', 'N.º Calle'), '12');
    eq('Planta', campo(b, '02', 'Planta'), '1');
    eq('Puerta', campo(b, '02', 'Puerta'), 'E');
    eq('Provincia', campo(b, '02', 'Provincia'), 'Ciudad Real');
    eq('Población', campo(b, '02', 'Población'), 'TOMELLOSO');
    eq('C.P.', campo(b, '02', 'Código Postal'), '13700');
    eq('Teléfono móvil', campo(b, '02', 'Teléfono móvil'), '623926179');
});

test('26RES060_186 — 05 Edificio y 06 Certificado', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    eq('Uso del Edificio', campo(b, '05', 'Uso del Edificio'), 'VIVIENDA UNIFAMILIAR');
    eq('Nombre de la vía', campo(b, '05', 'Nombre de la vía'), 'MEJICO');
    eq('Referencia catastral', campo(b, '05', 'Referencia catastral'), '4410205WJ0641S0001JH');
    // El recuadro VIVIENDA/TERCIARIO va DESPUÉS de los campos, que es donde lo
    // pone el formulario (detrás de la referencia catastral).
    const ap05 = b.apartados.find(a => a.id === '05');
    eq('el tipo de vivienda sale del .xml', /Vivienda\*\* \+ \*\*Unifamiliar/.test(ap05.instruccionesFinal[0]), true);
    eq('y va al FINAL del apartado, no al principio', ap05.instrucciones, undefined);

    eq('Fecha de emisión', campo(b, '06', 'Fecha de emisión del certificado'), '14/09/2026');
    eq('Fecha visita', campo(b, '06', 'Fecha visita técnico certificador'), '14/09/2026');
    eq('Calificación Emisiones CO2', campo(b, '06', 'Calificación Emisiones CO2'), 'G');
    eq('Calificación Consumo Energía Primaria', campo(b, '06', 'Calificación Consumo Energía Primaria'), 'G');
});

test('26RES060_186 — los cuatro ficheros anexados', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    eq('nombres con el NIF del titular delante', b.ficheros.map(f => f.nombreRegistro), [
        '06226790T_26RES060_186 – CEE INICIAL_fdo.pdf',
        '06226790T_26RES060_186 – CEE INICIAL.xml',
        '06226790T_26RES060_186 – CEE INICIAL_informeMedidasMejora.pdf',
        '06226790T_26RES060_186 – CEE INICIAL.cex',
    ]);
    // El nombre en Drive es el canónico SIN el NIF: es contra el que se casa la
    // carpeta, y el del Registro es ése con el prefijo.
    eq('el nombre en Drive va sin el NIF', b.ficheros[0].nombreDrive, '26RES060_186 – CEE INICIAL_fdo.pdf');
    eq('cada uno dice qué documento es', b.ficheros.map(f => f.clave), ['pdf', 'xml', 'mejoras', 'cex']);
    // `presente: null` es "no se ha mirado Drive": lo resuelve el backend. No es
    // lo mismo que decir que falta.
    eq('sin mirar Drive no se afirma que estén', b.ficheros.every(f => f.presente === null), true);
    eq('el NIF viaja aparte, para renombrar', b.nif, '06226790T');
    eq('sin avisos: el expediente está completo', b.avisos, []);
});

test('El teléfono y el correo caen a la PERSONA DE CONTACTO', () => {
    // 26RES060_187: el titular los tiene los dos en blanco y su contacto (JUAN
    // ANTONIO) los dos rellenos. El formulario exige los dos.
    const sinSuyos = JSON.parse(JSON.stringify(CTX));
    sinSuyos.cliente = {
        ...sinSuyos.cliente, tlf: null, email: null,
        persona_contacto_nombre: 'JUAN ANTONIO',
        persona_contacto_tlf: '629679131',
        persona_contacto_email: 'juanantoniogaroz@gmail.com',
    };
    const b = buildBorradorCee(sinSuyos, { fase: 'inicial', hoy: '2026-09-14' });
    eq('teléfono del contacto', campo(b, '01', 'Teléfono móvil'), '629679131');
    eq('correo del contacto', campo(b, '01', 'e-mail'), 'juanantoniogaroz@gmail.com');
    const tel = b.apartados[0].campos.find(c => c.campo === 'Teléfono móvil');
    eq('y se dice de quién es, con su nombre', /JUAN ANTONIO/.test(tel.nota || ''), true);
    eq('no avisa de que falten', b.avisos, []);

    // El del TITULAR manda cuando existe.
    const conSuyos = JSON.parse(JSON.stringify(sinSuyos));
    conSuyos.cliente.tlf = '600111222';
    const b2 = buildBorradorCee(conSuyos, { fase: 'inicial', hoy: '2026-09-14' });
    eq('el suyo manda', campo(b2, '01', 'Teléfono móvil'), '600111222');
    eq('y entonces no se anota procedencia',
        b2.apartados[0].campos.find(c => c.campo === 'Teléfono móvil').nota, undefined);

    // Sin ninguno de los dos, se avisa: el formulario los exige.
    const sinNada = JSON.parse(JSON.stringify(CTX));
    sinNada.cliente = { ...sinNada.cliente, tlf: null, email: null };
    const b3 = buildBorradorCee(sinNada, { fase: 'inicial', hoy: '2026-09-14' });
    eq('avisa de que el formulario los exige',
        b3.avisos.some(a => /exige teléfono y correo/.test(a) && /los dos/.test(a)), true);
});

test('Las instrucciones de X son las del acuse', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    const ap = (id) => b.apartados.find(a => a.id === id);
    eq('04 es SIEMPRE Inscripción', /Marca \*\*Inscripción\*\*/.test(ap('04').instrucciones[0]), true);
    eq('07.1 se marca', /Marca la X/.test(ap('07.1').instrucciones[0]), true);
    eq('07.2 se deja SIN marcar', /SIN marcar/.test(ap('07.2').instrucciones[0]), true);
    eq('07.3 se marcan las cuatro', /Marca las X/.test(ap('07.3').instrucciones[0]), true);
    eq('08 la tasa va con tarjeta', /con tarjeta/.test(ap('08').instrucciones[0]), true);
    eq('08 deja el hueco de la referencia', ap('08').campos[0].hueco, true);
    eq('los apartados 03 y protección de datos NO salen',
        b.apartados.some(a => a.id === '03'), false);
});

// ─── 4. Fuera de Castilla-La Mancha no se genera ─────────────────────────────
test('Otra comunidad: se dice que no hay plantilla, no se inventa una', () => {
    const fuera = JSON.parse(JSON.stringify(CTX));
    fuera.expediente.cee.cee_inicial.identificacion.provincia = 'VALENCIA';
    fuera.cliente.provincia = 'VALENCIA';
    fuera.cliente.codigo_postal = '46001';
    const b = buildBorradorCee(fuera, { fase: 'inicial' });
    eq('no aplica', b.aplica, false);
    eq('dice de qué comunidad es', b.ccaa, 'COMUNIDAD VALENCIANA');
    eq('explica por qué', /COMUNIDAD VALENCIANA/.test(b.motivo) && /020264/.test(b.motivo), true);
    eq('no pinta apartados', b.apartados, []);

    eq('el CP basta para situar la comunidad', ccaaDe({ codigo_postal: '13700' }), 'CASTILLA-LA MANCHA');
});

// ─── 5. Avisos ───────────────────────────────────────────────────────────────
test('Avisa de lo que impide presentar', () => {
    const sinLetras = JSON.parse(JSON.stringify(CTX));
    delete sinLetras.expediente.cee.cee_inicial.epnrLetra;
    delete sinLetras.expediente.cee.cee_inicial.emisionesLetra;
    const b1 = buildBorradorCee(sinLetras, { fase: 'inicial', hoy: '2026-09-14' });
    eq('sin calificaciones, dice dónde están', b1.avisos.some(a => /calificaciones/.test(a)), true);

    const sinRc = JSON.parse(JSON.stringify(CTX));
    sinRc.expediente.cee.cee_inicial.identificacion.refCatastral = '';
    sinRc.oportunidad.ref_catastral = '';
    const b2 = buildBorradorCee(sinRc, { fase: 'inicial', hoy: '2026-09-14' });
    eq('sin referencia catastral, avisa', b2.avisos.some(a => /referencia catastral/.test(a)), true);

    const b3 = buildBorradorCee({ ...CTX, certificador: null }, { fase: 'inicial', hoy: '2026-09-14' });
    eq('sin certificador, avisa', b3.avisos.some(a => /certificador asignado/.test(a)), true);

    // El plazo de UN MES del apartado 07.2: es lo que de verdad cuesta dinero,
    // porque pasado hay que volver a emitir el certificado.
    const b4 = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-11-01' });
    eq('pasado el mes, avisa del plazo', b4.avisos.some(a => /plazo para/.test(a)), true);
    const b5 = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-10-10' });
    eq('a punto de vencer, avisa', b5.avisos.some(a => /vence en/.test(a)), true);
    const b6 = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-20' });
    eq('dentro de plazo, no molesta', b6.avisos, []);
});

// ─── 6. Cliente EMPRESA ──────────────────────────────────────────────────────
test('Cliente persona jurídica: comparece su representante legal', () => {
    const emp = JSON.parse(JSON.stringify(CTX));
    emp.cliente = {
        ...emp.cliente, es_empresa: true, nombre_razon_social: 'HOTELES DEL SUR, SL',
        apellidos: '', dni: 'B12345678',
        representante_nombre: 'ANA', representante_apellidos: 'GARCIA LOPEZ', representante_dni: '11111111H',
    };
    const b = buildBorradorCee(emp, { fase: 'inicial', hoy: '2026-09-14' });
    eq('NIF es el del representante', campo(b, '01', 'NIF'), '11111111H');
    eq('Nombre es el del representante', campo(b, '01', 'Nombre'), 'ANA');
    eq('y sus apellidos, partidos', [campo(b, '01', 'Apellido 1'), campo(b, '01', 'Apellido 2')], ['GARCIA', 'LOPEZ']);
    eq('la entidad se dice en la nota', /HOTELES DEL SUR, SL/.test(b.apartados[0].nota), true);
});

// ─── 7. Fase FINAL ───────────────────────────────────────────────────────────
test('Fase final: lee su propio certificado', () => {
    const conFinal = JSON.parse(JSON.stringify(CTX));
    conFinal.expediente.cee.fecha_firma_cee_final = '2026-12-02';
    conFinal.expediente.cee.fecha_visita_cee_final = '2026-12-01';
    conFinal.expediente.cee.cee_final = {
        tipoEdificio: 'VIVIENDAUNIFAMILIAR', epnrLetra: 'B', emisionesLetra: 'A',
        identificacion: conFinal.expediente.cee.cee_inicial.identificacion,
    };
    const b = buildBorradorCee(conFinal, { fase: 'final', hoy: '2026-12-10' });
    eq('fecha de emisión del FINAL', campo(b, '06', 'Fecha de emisión del certificado'), '02/12/2026');
    eq('calificaciones del FINAL', [campo(b, '06', 'Calificación Emisiones CO2'), campo(b, '06', 'Calificación Consumo Energía Primaria')], ['A', 'B']);
    eq('los ficheros son los del CEE FINAL', b.ficheros[0].nombreRegistro, '06226790T_26RES060_186 – CEE FINAL_fdo.pdf');
});

// ─── 8. El HTML del PDF ──────────────────────────────────────────────────────
test('El PDF se compone y dice lo que tiene que decir', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    const html = buildBorradorCeeHtml(b);
    eq('es una página completa', /<!DOCTYPE html>/.test(html) && /<\/html>$/.test(html.trim()), true);
    eq('cita el procedimiento', /020264/.test(html) && /SJM3/.test(html), true);
    eq('lleva los datos del titular', /06226790T/.test(html) && /ISAAC PLIEGO RODRIGUEZ/.test(html), true);
    eq('lleva la referencia catastral', /4410205WJ0641S0001JH/.test(html), true);
    eq('la negrita de las instrucciones se convierte', /<b>Inscripción<\/b>/.test(html), true);
    eq('no quedan asteriscos sin traducir', /\*\*/.test(html), false);
    eq('el hueco de la tasa se dibuja', /class="hueco"/.test(html), true);
    eq('avisa de que no es el impreso', /NO es el impreso/.test(html), true);
    // El recuadro de VIVIENDA va detrás de la tabla del apartado 05, como en el
    // formulario. Si saliera antes, quien lo recorre de arriba abajo no lo
    // encontraría donde lo tiene delante.
    const ap05 = html.indexOf('05 Datos Identificativos');
    const tabla05 = html.indexOf('Referencia catastral', ap05);
    const recuadro = html.indexOf('En el recuadro de abajo', ap05);
    eq('el recuadro VIVIENDA va DESPUÉS de la referencia catastral',
        recuadro > tabla05 && tabla05 > ap05, true);
});

// ─── 10. El enlace a la sede ─────────────────────────────────────────────────
// Es el destino de todo el borrador: lo que se copia se pega ahí. Va en el
// popup como botón y DENTRO del PDF como hipervínculo — un borrador impreso o
// reenviado por correo tiene que llevar consigo a dónde se lleva.
test('El trámite se abre desde el propio borrador', () => {
    const b = buildBorradorCee(CTX, { fase: 'inicial', hoy: '2026-09-14' });
    eq('la sede viaja en el borrador (no la cablea la pantalla)',
        b.sede, 'https://www.jccm.es/sede/tramite/JM3');

    const html = buildBorradorCeeHtml(b);
    eq('en el PDF es un <a> de verdad, no texto suelto',
        /<a href="https:\/\/www\.jccm\.es\/sede\/tramite\/JM3">/.test(html), true);
    eq('y se dice qué es', /Sede electrónica de la JCCM/.test(html), true);
    // La ficha del procedimiento es OTRO enlace y sigue en el pie: es donde están
    // los requisitos y los modelos, no donde se presenta.
    eq('la ficha del procedimiento también es enlace',
        /<a href="https:\/\/www\.jccm\.es\/tramites\/1002560">/.test(html), true);
    eq('y no se confunde con la sede', /Requisitos y modelos/.test(html), true);

    // Fuera de CLM no hay borrador, así que tampoco botón que lleve a la sede de
    // otra comunidad.
    const fuera = JSON.parse(JSON.stringify(CTX));
    fuera.expediente.cee.cee_inicial.identificacion.provincia = 'VALENCIA';
    fuera.cliente.provincia = 'VALENCIA';
    fuera.cliente.codigo_postal = '46001';
    eq('sin borrador no hay sede', buildBorradorCee(fuera, { fase: 'inicial' }).sede, undefined);
});

// ─── 8.b Un CEE DIRECTO ──────────────────────────────────────────────────────
// Esa tabla no tiene `instalacion` ni oportunidad detrás: la dirección vive en
// COLUMNAS PROPIAS (`direccion`, `municipio`, `provincia`, `codigo_postal`). Sin
// leerlas, el apartado 05 salía entero en blanco en los CEE sueltos.
test('CEE directo: la dirección sale de sus columnas propias', () => {
    const directo = {
        numero_expediente: '2026CEE_60',
        direccion: 'CL CALVARIO 20', municipio: 'TOMELLOSO',
        provincia: 'CIUDAD REAL', codigo_postal: '13700',
        ref_catastral: '7642502XJ6474D0001WP',
        cee: {
            fecha_firma_cee_inicial: '2026-09-10',
            fecha_visita_cee_inicial: '2026-09-09',
            cee_inicial: { epnrLetra: 'D', emisionesLetra: 'D', tipoEdificio: 'ViviendaIndividualEnBloque' },
        },
    };
    const b = buildBorradorCee(
        { expediente: directo, cliente: { nombre_razon_social: 'ANA', apellidos: 'GIL SANZ', dni: '11111111H' } },
        { fase: 'inicial', hoy: '2026-09-15' });
    eq('se genera y sitúa la comunidad', [b.aplica, b.ccaa], [true, 'CASTILLA-LA MANCHA']);
    eq('vía troceada de la columna propia',
        [campo(b, '05', 'Tipo vía'), campo(b, '05', 'Nombre de la vía'), campo(b, '05', 'N.º Calle')],
        ['Calle', 'CALVARIO', '20']);
    eq('población y CP de sus columnas',
        [campo(b, '05', 'Población'), campo(b, '05', 'Código Postal')], ['TOMELLOSO', '13700']);
    eq('referencia catastral de su columna',
        campo(b, '05', 'Referencia catastral'), '7642502XJ6474D0001WP');
    // Un CEE suelto de alcance ÚNICO no tiene fase final: sus ficheros son los del
    // inicial y su nombre canónico, con el NIF del titular delante.
    eq('ficheros del CEE suelto', b.ficheros[0].nombreRegistro, '11111111H_2026CEE_60 – CEE INICIAL_fdo.pdf');
});

// ─── 9. Las dos letras, leídas del .xml SIN DOM ──────────────────────────────
// El backend no tiene DOMParser, así que los certificados ya subidos —que no
// guardan `emisionesLetra`— se releen del XML crudo con el lector de texto. El
// tramo es el REAL de 26RES060_186, en MAYÚSCULAS como lo deja `normalizeData`.
const XML_REAL = `<?XML VERSION="1.0" ENCODING="UTF-8"?>
<DATOSENERGETICOSDELEDIFICIO>
  <EMISIONESCO2>
    <CONSUMOELECTRICO>2.78</CONSUMOELECTRICO>
    <CALEFACCION>407.90</CALEFACCION>
    <GLOBAL>462.85</GLOBAL>
    <ACS>52.17</ACS>
  </EMISIONESCO2>
  <CALIFICACION>
    <DEMANDA><CALEFACCION>G</CALEFACCION><REFRIGERACION>C</REFRIGERACION></DEMANDA>
    <ENERGIAPRIMARIANORENOVABLE>
      <CALEFACCION>G</CALEFACCION><ACS>G</ACS><GLOBAL>G</GLOBAL>
      <ESCALAGLOBAL><A>54.20</A><B>87.80</B><C>136.10</C></ESCALAGLOBAL>
    </ENERGIAPRIMARIANORENOVABLE>
    <EMISIONESCO2>
      <CALEFACCION>G</CALEFACCION><REFRIGERACION>B</REFRIGERACION>
      <ACS>G</ACS><GLOBAL>F</GLOBAL>
      <ESCALAGLOBAL><A>12.20</A><B>19.90</B><C>30.80</C></ESCALAGLOBAL>
    </EMISIONESCO2>
  </CALIFICACION>
</DATOSENERGETICOSDELEDIFICIO>`;

test('leerCalificacionesDeTexto — el rescate del backend', () => {
    const r = leerCalificacionesDeTexto(XML_REAL);
    // La de emisiones se ha puesto a F a propósito: si saliera G podría estar
    // copiándose de la de energía primaria sin que nadie lo notara.
    eq('lee las DOS letras, y son distintas', r, { epnrLetra: 'G', emisionesLetra: 'F' });

    // Fuera de <Calificacion> hay otro <EMISIONESCO2> con un <GLOBAL> que es un
    // NÚMERO (462.85). Ése no puede colarse como letra.
    eq('no confunde el bloque de kgCO2 con el de la calificación',
        r.emisionesLetra !== null && /^[A-G]$/.test(r.emisionesLetra), true);

    // Y dentro de cada indicador, <ESCALAGLOBAL> trae sus propios <A>…<C>: el
    // <Global> que vale es el DIRECTO.
    eq('no coge la letra de la escala', r.epnrLetra, 'G');

    eq('un XML sin calificación no inventa nada',
        leerCalificacionesDeTexto('<X><Y>1</Y></X>'), { epnrLetra: null, emisionesLetra: null });
    eq('nada que leer devuelve vacío sin lanzar',
        leerCalificacionesDeTexto(null), { epnrLetra: null, emisionesLetra: null });
});

console.log(`\n${'─'.repeat(60)}\n${ok} correctos, ${fail} fallidos\n`);
process.exit(fail ? 1 : 0);
