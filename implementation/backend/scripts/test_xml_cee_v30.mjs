// ─── test_xml_cee_v30.mjs ────────────────────────────────────────────────────
// Los lectores del .xml del CEE con el esquema NUEVO (v3.0, el de CE3X 3.1) y la
// garantía de que el v2.0 (CE3X 2.3) sigue dando EXACTAMENTE lo mismo.
//
//   node implementation/backend/scripts/test_xml_cee_v30.mjs
//   node implementation/backend/scripts/test_xml_cee_v30.mjs --regenerar
//        (rehace la huella del v2.0: SOLO si se ha cambiado a propósito lo que
//         devuelve un lector con un .xml v2.0)
//
// Cuatro bloques:
//   A) v3.0 con un certificado construido A MANO (datos ficticios): cada regla
//      de traducción al idioma del v2.0, una a una. Corre siempre.
//   A') v3.0 con los ejemplos de CE3X 3.1: los de la carpeta de Drive
//      «5. EJEMPLOS CE3X 3.1» (o CEE_EJEMPLOS_V30) y los de xmlcert que trae la
//      instalación de CE3X 3.1 (o CEE_XMLCERT_V30). Si no están, se salta.
//   B) v2.0 — la HUELLA de lo que devuelven TODOS los lectores sobre los 462
//      certificados reales de `data/real_cases_xml` (o CEE_CORPUS_V20; también
//      en MAYÚSCULAS, que es como vuelven de la BD), comparada con la que se tomó
//      ANTES de añadir el v3.0. La huella es un hash: el repo es público y aquí
//      no puede viajar nada de un certificado real. Si el corpus no está, se
//      salta con aviso.
//   C) El par v2.0 / v3.0 del MISMO edificio, exportado con las dos versiones:
//      opcional, con CEE_PAR_V20 y CEE_PAR_V30 apuntando a los dos ficheros (no
//      se copian al repo: son de un cliente).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');                       // implementation/
const CORPUS = process.env.CEE_CORPUS_V20
    || path.resolve(RAIZ, '../.claude/worktrees/epic-hugle-450032/data/real_cases_xml');
const HUELLA = path.join(AQUI, 'test_xml_cee_v30.huella.json');
const REGENERAR = process.argv.includes('--regenerar');
const EJEMPLOS_V30 = [
    process.env.CEE_EJEMPLOS_V30 || 'C:/Users/Usuario/Mi unidad/26. CERTIF. EFICIENCIA ENER/5. EJEMPLOS CE3X 3.1',
    process.env.CEE_XMLCERT_V30 || 'C:/Program Files (x86)/CE3Xv3.1/moduloXML/xmlcert_20260703/examples',
];

let ok = 0, fail = 0, saltados = 0;
const bien = (cond, nombre, extra) => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}${extra !== undefined ? `  — ${extra}` : ''}`); }
    else { fail++; console.log(`  ✗ ${nombre}${extra !== undefined ? `  — ${extra}` : ''}`); }
};
const eq = (nombre, real, esperado) => {
    const a = JSON.stringify(real), b = JSON.stringify(esperado);
    if (a === b) { ok++; console.log(`  ✓ ${nombre}`); }
    else { fail++; console.log(`  ✗ ${nombre}\n      esperado: ${b}\n      real:     ${a}`); }
};
const salta = (motivo) => { saltados++; console.log(`  ⚠ ${motivo}`); };
const info = (texto) => console.log(`    i ${texto}`);
const titulo = (t) => console.log(`\n${t}`);

// ─── DOMParser para Node ─────────────────────────────────────────────────────
// `parseCeeXml`, `parseEpnrFromXml` y `parseEmisionesTotalesFromXml` van con el
// DOMParser del navegador, que en Node no existe. Se emula con @xmldom/xmldom
// (está en frontend/node_modules) y con el `querySelector('parsererror')` que
// mira `parseCeeXml`: xmldom LANZA ante un XML roto, el navegador devuelve un
// documento con <parsererror>. Sin xmldom, esa parte del test se salta.
function instalarDomParser() {
    if (globalThis.DOMParser) return true;
    let xmldom;
    try { xmldom = require(path.join(RAIZ, 'frontend/node_modules/@xmldom/xmldom')); }
    catch { return false; }
    const conQuery = (doc) => {
        doc.querySelector = (sel) => (sel === 'parsererror' ? (doc.getElementsByTagName('parsererror')[0] || null) : null);
        return doc;
    };
    globalThis.DOMParser = class {
        parseFromString(s, tipo) {
            const p = new xmldom.DOMParser({ onError: () => {} });
            try { return conQuery(p.parseFromString(s, tipo)); }
            catch { return conQuery(p.parseFromString('<parsererror>XML mal formado</parsererror>', 'text/xml')); }
        }
    };
    return true;
}
const HAY_DOM = instalarDomParser();

// ─── Los lectores ────────────────────────────────────────────────────────────
const parser = await import(pathToFileURL(path.join(RAIZ, 'frontend/src/features/calculator/logic/xmlCeeParser.js')).href);
const V30 = await import(pathToFileURL(path.join(RAIZ, 'frontend/src/features/calculator/logic/xmlCeeV30.js')).href);
const V30cjs = require(path.join(RAIZ, 'backend/services/cee/xmlCeeV30.js'));
const { radiografiaXml, compararEnvolventes } = require(path.join(RAIZ, 'backend/services/cee/radiografiaCee.js'));
const { revisarCee } = require(path.join(RAIZ, 'backend/services/cee/revisionCee.js'));

/** Texto de un .xml de CE3X: UTF-8 estricto y, si no, latin-1 (como `textoDeXml`). */
function textoDe(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return buf.toString('latin1'); }
}
/** Lo que devuelve un lector, sin que una excepción tumbe el recorrido. */
const captura = (f) => { try { return f(); } catch (e) { return { __error: String(e?.message || e) }; } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** La copia de la BD: `normalizeData` deja el .xml entero así. */
const comoEnBd = (t) => String(t).trim().toUpperCase();
/** Igual salvo mayúsculas: lo que vuelve de la BD solo cambia en los TEXTOS. */
const igualSinMayusculas = (a, b) => JSON.stringify(a).toLowerCase() === JSON.stringify(b).toLowerCase();

/**
 * Las claves de `parseCeeXml` con un .xml v2.0, EN SU ORDEN. Es el contrato con
 * los consumidores: el v3.0 tiene que devolver exactamente éstas.
 *
 * ⚠️ `combustibleCalefaccion` y `combustibleACS` ya eran CONDICIONALES en el
 * v2.0: solo aparecen si el certificado declara un generador de ese servicio
 * (3 de los 462 no tienen calefacción). `clavesParseValidas` lo tiene en cuenta.
 */
const CLAVES_PARSE = [
    'demandaCalefaccion', 'demandaACS', 'demandaRefrigeracion', 'demandaGlobal',
    'emisionesCalefaccion', 'emisionesACS', 'emisionesRefrigeracion',
    'emisionesConsumoElectrico', 'emisionesConsumoOtros', 'emisionesTotalElectrico', 'emisionesTotalOtros',
    'superficieHabitable', 'zonaClimatica', 'tipoEdificio', 'identificacion', 'fechaFirma', 'fechaVisita',
    'acsLitrosDia', 'rendimientoCalefaccion', 'rendimientoACS', 'rendimientoRefrigeracion',
    'combustibleRefrigeracion', 'combustibleOtros', 'energiaFinalVectores',
    'epnrConsumo', 'epnrLetra', 'epnrEscala', 'emisionesLetra', 'emisionesEscala',
    'combustibleCalefaccion', 'combustibleACS', 'huecos', 'opacos',
];
const CLAVES_CONDICIONALES = new Set(['combustibleCalefaccion', 'combustibleACS']);
/** ¿Son las claves del v2.0, en su orden, con o sin las condicionales? */
const clavesParseValidas = (claves) =>
    JSON.stringify(claves) === JSON.stringify(CLAVES_PARSE.filter((k) => !CLAVES_CONDICIONALES.has(k) || claves.includes(k)));

/** La FORMA de la radiografía del v2.0 (claves de cada nivel). */
const FORMA_RX = {
    raiz: ['fichero', 'certificador', 'fechas', 'identificacion', 'geometria', 'demanda', 'generadores', 'acumulacion_acs', 'calificacion', 'medidas', 'envolvente'],
    generador: ['servicio', 'nombre', 'tipo', 'tipo_conocido', 'familia', 'es_combustion', 'vector', 'combustible', 'potencia_kw', 'rendimiento_pct', 'modo_obtencion'],
    hueco: ['nombre', 'tipo', 'superficie', 'transmitancia', 'orientacion', 'modo_obtencion', 'transmitancia_conocida', 'factor_solar', 'modo_factor_solar'],
    opaco: ['nombre', 'tipo', 'superficie', 'transmitancia', 'orientacion', 'modo_obtencion', 'transmitancia_conocida'],
    puente: ['nombre', 'tipo', 'superficie', 'transmitancia', 'orientacion', 'modo_obtencion', 'transmitancia_conocida', 'longitud'],
    medida: ['nombre', 'descripcion', 'coste_estimado', 'demanda_global', 'epnr_global'],
    identificacion: ['ref_catastral', 'direccion', 'municipio', 'provincia', 'ccaa', 'codigo_postal', 'zona_climatica', 'tipo_edificio', 'normativa', 'anio_construccion'],
};
/** ¿La radiografía tiene la forma de la del v2.0? Devuelve la primera discrepancia. */
function formaRx(rx) {
    const mismas = (o, claves) => JSON.stringify(Object.keys(o)) === JSON.stringify(claves);
    if (!mismas(rx, FORMA_RX.raiz)) return `raíz: ${Object.keys(rx)}`;
    if (!mismas(rx.identificacion, FORMA_RX.identificacion)) return `identificacion: ${Object.keys(rx.identificacion)}`;
    for (const lista of Object.values(rx.generadores)) for (const g of lista) if (!mismas(g, FORMA_RX.generador)) return `generador: ${Object.keys(g)}`;
    for (const h of rx.envolvente.huecos) if (!mismas(h, FORMA_RX.hueco)) return `hueco: ${Object.keys(h)}`;
    for (const o of rx.envolvente.opacos) if (!mismas(o, FORMA_RX.opaco)) return `opaco: ${Object.keys(o)}`;
    for (const p of rx.envolvente.puentes) if (!mismas(p, FORMA_RX.puente)) return `puente: ${Object.keys(p)}`;
    for (const m of rx.medidas) if (!mismas(m, FORMA_RX.medida)) return `medida: ${Object.keys(m)}`;
    return null;
}

// ─── A) v3.0: un certificado construido a mano, con datos FICTICIOS ──────────
//
// Cada pieza está puesta para probar UNA regla: las medidas de mejora DELANTE
// (el esquema no fija el orden y traen sus propios indicadores), unos
// <DatosPersonalizados> con una <Demanda> dentro que no se puede colar, un
// <Elemento> inalterable con su <Descripcion>, una provincia distinta en el
// certificador, un hueco con el «-» de CE3X 3.1, un lucernario, un generador
// FICTICIO, la energía del ambiente, dos visitas desordenadas y una
// observación con fecha que no es una visita.
function xmlV30Ficticio() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<DatosEnergeticosDelEdificio version="3.0">
  <MedidasMejora>
    <MedidaMejora>
      <Nombre>Medida ficticia</Nombre>
      <Descripcion><![CDATA[data:text/html,<p>Aislar <b>la cubierta</b></p>]]></Descripcion>
      <CosteEstimado>1000-10000</CosteEstimado>
      <Indicadores>
        <Demanda><Cal>50.00</Cal><Ref>5.00</Ref><Acs>10.00</Acs></Demanda>
        <EnergiaPrimariaNoRenovable><Tot>60.00</Tot><Cal>40.00</Cal><Ref>5.00</Ref><Acs>15.00</Acs></EnergiaPrimariaNoRenovable>
      </Indicadores>
      <Calificacion>
        <EnergiaPrimariaNoRenovable><Tot>B</Tot></EnergiaPrimariaNoRenovable>
        <Emisiones><Tot>B</Tot></Emisiones>
      </Calificacion>
    </MedidaMejora>
  </MedidasMejora>
  <DatosPersonalizados>
    <Aplicacion>Ficticia</Aplicacion>
    <Indicadores><Demanda><Cal>999.00</Cal></Demanda></Indicadores>
  </DatosPersonalizados>
  <DatosEdificio>
    <ElementosInalterables>
      <Elemento><Tipo>Fachada</Tipo><Descripcion>NO ES LA DESCRIPCION DEL EDIFICIO</Descripcion></Elemento>
    </ElementosInalterables>
    <Descripcion>Vivienda ficticia</Descripcion>
    <Direccion>Calle Inventada 1</Direccion>
    <Municipio>Villaficticia</Municipio>
    <Provincia>Ciudad Real</Provincia>
    <ComunidadAutonoma>Castilla - La Mancha</ComunidadAutonoma>
    <CodigoPostal>13000</CodigoPostal>
    <ZonaClimatica>D3</ZonaClimatica>
    <FechaConstruccion>1975</FechaConstruccion>
    <NormativaEdificacion>ANTE_NBE_CT_79</NormativaEdificacion>
    <ReferenciasCatastrales>
      <Registro>DGC</Registro>
      <Ref><Parcela>0000000AA0000A</Parcela><Inmueble>0001AA</Inmueble></Ref>
    </ReferenciasCatastrales>
    <Alcance>Completo</Alcance>
    <Uso>ResidencialPrivado</Uso>
    <SuperficieUtil>100.00</SuperficieUtil>
    <PlantasSobreRasante>2</PlantasSobreRasante>
    <Imagen>data:image/png;base64,AAAA</Imagen>
  </DatosEdificio>
  <DatosCertificado>
    <TipoCertificado>Existente</TipoCertificado>
    <Escala>ViviendaUnifamiliar</Escala>
    <Procedimiento><Nombre>CE3X</Nombre><Version>2026.08.20</Version></Procedimiento>
    <FechaCalificacion>5/9/2026</FechaCalificacion>
    <FechaGeneracion>06/09/2026</FechaGeneracion>
  </DatosCertificado>
  <DatosCertificador>
    <Provincia>Toledo</Provincia>
    <Nif>00000000T</Nif>
    <NifEntidad>B00000000</NifEntidad>
    <NombreApellidos>Técnico Ficticio</NombreApellidos>
    <RazonSocial>Empresa Ficticia SL</RazonSocial>
    <Titulacion>Arquitecto</Titulacion>
  </DatosCertificador>
  <Modelo>
    <Global><DemandaDiariaAcs>112.00</DemandaDiariaAcs></Global>
    <Espacios><Espacio><Nombre>E1</Nombre><Superficie>100.0</Superficie><Volumen>270.0</Volumen></Espacio></Espacios>
    <Opacos>
      <Opaco><Id>OP-1</Id><Nombre>Fachada Sur</Nombre><Tipo>Fachada</Tipo><Orientacion>S</Orientacion><Superficie>20.00</Superficie><Transmitancia>1.69</Transmitancia><Geometria/></Opaco>
      <Opaco><Id>OP-2</Id><Nombre>Medianera</Nombre><Tipo>Adiabatico</Tipo><Orientacion>N</Orientacion><Superficie>30.00</Superficie><Transmitancia>0.00</Transmitancia><PorDefecto>Transmitancia</PorDefecto></Opaco>
      <Opaco><Id>OP-3</Id><Nombre>Cubierta</Nombre><Tipo>Cubierta</Tipo><Orientacion>H</Orientacion><Superficie>48.50</Superficie><Transmitancia>2.10</Transmitancia></Opaco>
    </Opacos>
    <Huecos>
      <Hueco><Id>H-1</Id><Nombre>V1-</Nombre><Tipo>Hueco</Tipo><Opaco>OP-1</Opaco><Construccion>CH-1</Construccion><Orientacion>S</Orientacion><Superficie>2.00</Superficie><Transmitancia>3.08</Transmitancia></Hueco>
      <Hueco><Id>H-2</Id><Nombre>L1</Nombre><Tipo>Lucernario</Tipo><Opaco>OP-3</Opaco><Construccion>CH-1</Construccion><Orientacion>H</Orientacion><Superficie>1.50</Superficie><Transmitancia>3.08</Transmitancia></Hueco>
    </Huecos>
    <PuentesTermicos>
      <PuenteTermico><Nombre>PT1</Nombre><Tipo>Pilar</Tipo><Longitud>5.00</Longitud><Transmitancia>1.05</Transmitancia><PorDefecto>Transmitancia</PorDefecto></PuenteTermico>
    </PuentesTermicos>
    <Construcciones>
      <ConsHueco><Id>CH-1</Id><Marco>M-1</Marco><Vidrio>V-1</Vidrio><Ff>0.2</Ff><FactorSolar>0.75</FactorSolar></ConsHueco>
      <Vidrio><Id>V-1</Id><Transmitancia>3.3</Transmitancia><FactorSolarNormal>0.75</FactorSolarNormal></Vidrio>
      <Marco><Id>M-1</Id><Transmitancia>2.2</Transmitancia><Absortividad>0.75</Absortividad></Marco>
    </Construcciones>
    <Sistemas>
      <Generador><Id>G1</Id><Nombre>Caldera ficticia</Nombre><Tipo>CalderaConvencional</Tipo><Servicio>CAL</Servicio><PotenciaNominal>24.00</PotenciaNominal><RendimientoNominal>0.90</RendimientoNominal><RendimientoEstacional>0.79</RendimientoEstacional><VectorEnergetico>GASOLEO</VectorEnergetico></Generador>
      <Generador><Id>G2</Id><Nombre>Caldera ficticia</Nombre><Tipo>CalderaConvencional</Tipo><Servicio>ACS</Servicio><PotenciaNominal>24.00</PotenciaNominal><RendimientoNominal>0.90</RendimientoNominal><RendimientoEstacional>0.79</RendimientoEstacional><VectorEnergetico>GASOLEO</VectorEnergetico></Generador>
      <Generador><Id>G3</Id><Nombre>Equipo de sustitución</Nombre><Tipo>ExpansionDirectaAireAire</Tipo><Servicio>REF</Servicio><PotenciaNominal>10.00</PotenciaNominal><RendimientoNominal>2.00</RendimientoNominal><RendimientoEstacional>2.00</RendimientoEstacional><VectorEnergetico>ELECTRICIDAD</VectorEnergetico><EsFicticio/></Generador>
      <Acumulador><Id>A1</Id><Nombre>Depósito ficticio</Nombre><Tipo>AcumuladorAguaCaliente</Tipo><Servicio>ACS</Servicio><Volumen>0.15</Volumen><Perdidas>1.50</Perdidas><Temperatura>60.00</Temperatura></Acumulador>
    </Sistemas>
  </Modelo>
  <Indicadores>
    <Demanda><Cal>150.50</Cal><Ref>10.25</Ref><Acs>20.00</Acs></Demanda>
    <EnergiaFinal><Cal>190.00</Cal><Ref>0.00</Ref><Acs>25.00</Acs><Tot>215.00</Tot></EnergiaFinal>
    <EnergiaPrimariaNoRenovable><Cal>200.00</Cal><Ref>0.00</Ref><Acs>26.00</Acs><Ilu>0.00</Ilu><Ven>0.00</Ven><Tot>226.00</Tot></EnergiaPrimariaNoRenovable>
    <Emisiones><Cal>50.00</Cal><Ref>0.00</Ref><Acs>6.50</Acs><Tot>56.50</Tot></Emisiones>
    <EnergiaFinalVectores>
      <Vector><Nombre>GASOLEO</Nombre><Consumo><Cal>190.00</Cal><Ref>0.00</Ref><Acs>25.00</Acs><Ilu>0.00</Ilu><Ven>0.00</Ven><Tot>215.00</Tot></Consumo></Vector>
      <Vector><Nombre>ELECTRICIDAD</Nombre><Consumo><Cal>0.00</Cal><Ref>0.00</Ref><Acs>0.00</Acs><Ilu>0.00</Ilu><Ven>0.00</Ven><Tot>0.00</Tot></Consumo></Vector>
      <Vector><Nombre>MEDIOAMBIENTE</Nombre><Consumo><Cal>5.00</Cal><Ref>0.00</Ref><Acs>0.00</Acs><Tot>5.00</Tot></Consumo></Vector>
    </EnergiaFinalVectores>
  </Indicadores>
  <Tablas>
    <DesgloseEmisiones><ConsumoElectrico>0.00</ConsumoElectrico><ConsumoOtros>56.50</ConsumoOtros><TotalConsumoElectrico>0.00</TotalConsumoElectrico><TotalConsumoOtros>5650.00</TotalConsumoOtros></DesgloseEmisiones>
  </Tablas>
  <Escalas>
    <EnergiaPrimariaNoRenovable><Tot><A>54.20</A><B>87.80</B><C>136.10</C><D>209.30</D><E>375.60</E><F>473.20</F></Tot></EnergiaPrimariaNoRenovable>
    <Emisiones><Tot><A>12.20</A><B>19.90</B><C>30.80</C><D>47.30</D><E>83.70</E><F>100.40</F></Tot></Emisiones>
  </Escalas>
  <Calificacion>
    <EnergiaPrimariaNoRenovable><Cal>E</Cal><Tot>E</Tot></EnergiaPrimariaNoRenovable>
    <Emisiones><Tot>E</Tot></Emisiones>
  </Calificacion>
  <InspeccionesObservaciones>
    <Visita><Fecha>20/8/2026</Fecha><Descripcion><![CDATA[data:text/html,segunda <b>visita</b>]]></Descripcion></Visita>
    <Visita><Fecha>01/08/2026</Fecha><Descripcion><![CDATA[data:text/html,primera]]></Descripcion></Visita>
    <Observacion><Fecha>01/01/2020</Fecha><Descripcion>no es una visita</Descripcion></Observacion>
  </InspeccionesObservaciones>
  <OtrosIndicadores><VersionHE>HE2019</VersionHE><Volumen>270.00</Volumen></OtrosIndicadores>
</DatosEnergeticosDelEdificio>
`;
}

async function bloqueFicticio() {
    titulo('A) v3.0 (CE3X 3.1) — un certificado construido a mano, con datos ficticios');
    const xml = xmlV30Ficticio();

    eq('se reconoce la versión 3.0', [V30.versionXmlCee(xml), V30.esXmlCeeV30(xml)], ['3.0', true]);
    eq('y sin el atributo version, por su estructura', V30.versionXmlCee(xml.replace(' version="3.0"', '')), '3.0');

    // ── El espejo CJS del backend es el MISMO código ─────────────────────────
    const MARCA = '// ─── ¿Qué versión es?';
    //: Sin distinguir el fin de línea: git puede dejar uno en CRLF y otro en LF.
    const esm = fs.readFileSync(path.join(RAIZ, 'frontend/src/features/calculator/logic/xmlCeeV30.js'), 'utf8').replace(/\r\n/g, '\n');
    const cjs = fs.readFileSync(path.join(RAIZ, 'backend/services/cee/xmlCeeV30.js'), 'utf8').replace(/\r\n/g, '\n');
    const cuerpoEsm = esm.slice(esm.indexOf(MARCA)).replace(/^export (function|const) /gm, '$1 ').trim();
    const cuerpoCjs = cjs.slice(cjs.indexOf(MARCA)).replace(/\nmodule\.exports = \{[\s\S]*$/, '').trim();
    bien(esm.includes(MARCA) && cuerpoEsm === cuerpoCjs, 'el espejo CJS (backend/services/cee/xmlCeeV30.js) es el MISMO código que el ESM');
    eq('y exporta lo mismo', Object.keys(V30cjs).sort(), Object.keys(V30).sort());
    bien(igualSinMayusculas(V30cjs.leerXmlCeeV30(xml), V30.leerXmlCeeV30(xml))
        && JSON.stringify(V30cjs.leerXmlCeeV30(xml)) === JSON.stringify(V30.leerXmlCeeV30(xml)), 'y lee lo mismo');

    // ── parseCeeXml ──────────────────────────────────────────────────────────
    if (!HAY_DOM) salta('sin @xmldom/xmldom: parseCeeXml no se comprueba');
    else {
        const p = parser.parseCeeXml(xml);
        eq('parseCeeXml: las MISMAS claves que con un v2.0, y en el mismo orden', Object.keys(p), CLAVES_PARSE);
        eq('la demanda de <Indicadores><Demanda> (no la de la medida ni la de <DatosPersonalizados>)',
            [p.demandaCalefaccion, p.demandaACS, p.demandaRefrigeracion], [150.5, 20, 10.25]);
        eq('demandaGlobal = calefacción + ACS + refrigeración, como el <Global> del v2.0', p.demandaGlobal, 180.75);
        eq('emisiones por servicio y por vector (<Tablas><DesgloseEmisiones>)',
            [p.emisionesCalefaccion, p.emisionesACS, p.emisionesRefrigeracion, p.emisionesConsumoElectrico, p.emisionesConsumoOtros, p.emisionesTotalElectrico, p.emisionesTotalOtros],
            [50, 6.5, 0, 0, 56.5, 0, 5650]);
        eq('superficie, zona y tipo de edificio (con el nombre del v2.0)',
            [p.superficieHabitable, p.zonaClimatica, p.tipoEdificio], [100, 'D3', 'ViviendaUnifamiliar']);
        eq('identificación: la del EDIFICIO (no la provincia del certificador ni el elemento inalterable)', p.identificacion, {
            nombre: 'Vivienda ficticia', direccion: 'Calle Inventada 1', municipio: 'Villaficticia',
            provincia: 'Ciudad Real', refCatastral: '0000000AA0000A0001AA',
        });
        eq('fecha del certificado ← <FechaCalificacion> («5/9/2026» sin ceros)', p.fechaFirma, '2026-09-05');
        eq('fecha de visita ← la PRIMERA visita (no la observación de 2020)', p.fechaVisita, '2026-08-01');
        eq('litros/día de ACS ← <Modelo><Global><DemandaDiariaAcs>', p.acsLitrosDia, 112);
        eq('rendimientos en % y SIN el equipo ficticio de refrigeración',
            [p.rendimientoCalefaccion, p.rendimientoACS, p.rendimientoRefrigeracion, p.combustibleRefrigeracion], [79, 79, null, null]);
        eq('combustibles con los nombres de siempre',
            [p.combustibleCalefaccion, p.combustibleACS, p.combustibleOtros], ['Gasoleo Calefacción', 'Gasoleo Calefacción', 'Gasoleo Calefacción']);
        eq('energía final por vector: solo los que consumen, sin MEDIOAMBIENTE, con el nombre del v2.0', p.energiaFinalVectores, {
            'Gasoleo Calefacción': { nombre: 'Gasoleo Calefacción', vectorXml: 'GasoleoC', esElectrico: false, calefaccion: 190, acs: 25, refrigeracion: 0, iluminacion: 0, global: 215 },
        });
        eq('energía primaria no renovable y calificaciones del EDIFICIO (no las B de la medida)',
            [p.epnrConsumo, p.epnrLetra, p.emisionesLetra, p.epnrEscala.A, p.emisionesEscala.F], [226, 'E', 'E', 54.2, 100.4]);
        eq('huecos: sin el «-» de CE3X 3.1, orientación en palabras, factor solar MODIFICADO, sin el lucernario', p.huecos, [
            { nombre: 'V1', superficie: 2, transmitancia: 3.08, factorSolar: 0.61, orientacion: 'Sur' },
        ]);
        eq('opacos: superficie BRUTA (neta + sus huecos) y la orientación del v2.0', p.opacos, [
            { nombre: 'Fachada Sur', tipo: 'Fachada', superficie: 22, transmitancia: 1.69, orientacion: 'Sur' },
            { nombre: 'Medianera', tipo: 'Adiabatico', superficie: 30, transmitancia: 0, orientacion: 'Desconocida' },
            { nombre: 'Cubierta', tipo: 'Cubierta', superficie: 50, transmitancia: 2.1, orientacion: 'Horizontal' },
        ]);
        eq('un v3.0 roto da el MISMO error que un v2.0 roto',
            captura(() => parser.parseCeeXml('<DatosEnergeticosDelEdificio version="3.0"><DatosEdificio>')),
            { __error: 'El archivo XML no tiene un formato válido.' });
        const demandaEdificio = '<Demanda><Cal>150.50</Cal><Ref>10.25</Ref><Acs>20.00</Acs></Demanda>';
        bien(xml.includes(demandaEdificio), '(el certificado de prueba lleva la demanda que se le va a quitar)');
        eq('y uno sin demanda de calefacción, también el mismo (la de la medida no cuenta)',
            captura(() => parser.parseCeeXml(xml.replace(demandaEdificio, ''))),
            { __error: 'No se ha encontrado el dato de demanda de calefacción en el XML. Asegúrate de que el archivo es un Certificado de Eficiencia Energética válido.' });
    }

    // ── Los lectores de texto (los que corren en el backend) ─────────────────
    const enBd = comoEnBd(xml);
    eq('leerCalificacionesDeTexto', parser.leerCalificacionesDeTexto(xml), { epnrLetra: 'E', emisionesLetra: 'E' });
    eq('leerDatosIrpfDeTexto', parser.leerDatosIrpfDeTexto(xml), {
        epnrConsumo: 226, epnrLetra: 'E', demandaCalefaccion: 150.5, demandaRefrigeracion: 10.25,
        tipoEdificio: 'ViviendaUnifamiliar', fechaFirma: '2026-09-05', refCatastral: '0000000AA0000A0001AA', superficieHabitable: 100,
    });
    eq('parseEpnrFromXml (sin DOM: el v3.0 se lee de texto)', parser.parseEpnrFromXml(xml), {
        epnrConsumo: 226, epnrLetra: 'E',
        epnrEscala: { A: 54.2, B: 87.8, C: 136.1, D: 209.3, E: 375.6, F: 473.2 },
        emisionesLetra: 'E',
        emisionesEscala: { A: 12.2, B: 19.9, C: 30.8, D: 47.3, E: 83.7, F: 100.4 },
        superficieHabitable: 100,
    });
    eq('parseEmisionesTotalesFromXml', parser.parseEmisionesTotalesFromXml(xml), { emisionesTotalElectrico: 0, emisionesTotalOtros: 5650 });
    for (const [nombre, f] of [
        ['leerCalificacionesDeTexto', parser.leerCalificacionesDeTexto], ['leerDatosIrpfDeTexto', parser.leerDatosIrpfDeTexto],
        ['parseEpnrFromXml', parser.parseEpnrFromXml], ['parseEmisionesTotalesFromXml', parser.parseEmisionesTotalesFromXml],
    ]) {
        eq(`${nombre}: lo mismo con la copia de la BD (en MAYÚSCULAS)`, f(enBd), f(xml));
    }

    // ── La radiografía (backend) ─────────────────────────────────────────────
    const rx = radiografiaXml(Buffer.from(xml, 'utf8'));
    const forma = formaRx(rx);
    bien(forma === null, 'radiografiaXml: la MISMA forma que con un v2.0 (claves de cada nivel)', forma || undefined);
    eq('fichero, certificador y fechas', [rx.fichero, rx.certificador, rx.fechas], [
        { procedimiento: 'CE3X 2026.08.20', alcance: 'CertificacionExistente', generado: '2026-09-06' },
        { nif: '00000000T', nif_entidad: 'B00000000', nombre: 'Técnico Ficticio', razon_social: 'Empresa Ficticia SL', titulacion: 'Arquitecto' },
        { certificado: '2026-09-05', visita: '2026-08-01' },
    ]);
    eq('identificación y geometría', [rx.identificacion, rx.geometria], [
        { ref_catastral: '0000000AA0000A0001AA', direccion: 'Calle Inventada 1', municipio: 'Villaficticia', provincia: 'Ciudad Real',
          ccaa: 'Castilla - La Mancha', codigo_postal: '13000', zona_climatica: 'D3', tipo_edificio: 'ViviendaUnifamiliar',
          normativa: 'Anterior', anio_construccion: 1975 },
        { superficie_habitable: 100, volumen: 270, plantas: 2, demanda_diaria_acs_litros: 112 },
    ]);
    eq('generadores: la caldera de combustión, con el vector del v2.0 y sin el equipo ficticio', rx.generadores, {
        calefaccion: [{ servicio: 'calefaccion', nombre: 'Caldera ficticia', tipo: 'CalderaConvencional', tipo_conocido: true, familia: 'caldera',
            es_combustion: true, vector: 'GasoleoC', combustible: 'gasoleo', potencia_kw: 24, rendimiento_pct: 79, modo_obtencion: null }],
        acs: [{ servicio: 'acs', nombre: 'Caldera ficticia', tipo: 'CalderaConvencional', tipo_conocido: true, familia: 'caldera',
            es_combustion: true, vector: 'GasoleoC', combustible: 'gasoleo', potencia_kw: 24, rendimiento_pct: 79, modo_obtencion: null }],
        refrigeracion: [],
    });
    eq('la acumulación de ACS: el v3.0 SÍ la trae (en litros)', rx.acumulacion_acs, [
        { nombre: 'Depósito ficticio', volumen_l: 150, unidades: 1, servicios: ['acs'] },
    ]);
    eq('medidas: el coste es un tramo y el total de la demanda no viene → null', rx.medidas, [
        { nombre: 'Medida ficticia', descripcion: 'Aislar la cubierta', coste_estimado: null, demanda_global: null, epnr_global: 60 },
    ]);
    eq('envolvente: el modo solo se sabe cuando va POR DEFECTO; el lucernario, con los opacos', {
        huecos: rx.envolvente.huecos.map((h) => [h.nombre, h.orientacion, h.superficie, h.modo_obtencion, h.transmitancia_conocida, h.factor_solar]),
        opacos: rx.envolvente.opacos.map((o) => [o.nombre, o.tipo, o.superficie, o.orientacion, o.modo_obtencion, o.transmitancia_conocida]),
        puentes: rx.envolvente.puentes.map((p) => [p.nombre, p.longitud, p.modo_obtencion, p.transmitancia_conocida]),
    }, {
        huecos: [['V1', 'Sur', 2, null, null, 0.61]],
        opacos: [
            ['Fachada Sur', 'Fachada', 22, 'Sur', null, null],
            ['Medianera', 'Adiabatico', 30, null, 'PorDefecto', false],
            ['Cubierta', 'Cubierta', 50, 'Horizontal', null, null],
            ['L1', 'Lucernario', 1.5, 'Horizontal', null, null],
        ],
        puentes: [['PT1', 5, 'PorDefecto', false]],
    });
    bien(igualSinMayusculas(radiografiaXml(enBd), rx), 'radiografiaXml: lo mismo con la copia de la BD (en MAYÚSCULAS)');

    // ── El RES080 y el CIFO: la lista de huecos y opacos ─────────────────────
    eq('huecosYOpacosV30: la forma de getHuecosFromXml / parseHuecosFromXmlNode', V30.huecosYOpacosV30(xml), [
        { nombre: 'V1', tipo: 'Hueco', superficie: 2, transmitancia: 3.08, factorSolar: 0.61, orientacion: 'Sur' },
        { nombre: 'Fachada Sur', tipo: 'Fachada', superficie: 22, transmitancia: 1.69, orientacion: 'Sur' },
        { nombre: 'Cubierta', tipo: 'Cubierta', superficie: 50, transmitancia: 2.1, orientacion: 'Horizontal' },
    ]);

    // ── La revisión ve la acumulación en vez de decir que no la puede ver ────
    const res = await revisarCee({
        radiografia: rx, fase: 'inicial',
        expediente: {
            numero_expediente: 'PRUEBA_V30',
            instalacion: { ref_catastral: '0000000AA0000A0001AA', zona_climatica: 'D3', cambio_acs: true, misma_caldera_acs: true,
                caldera_antigua_cal: { rendimiento_id: 'gasoleo_79_97' } },
            cee: { fecha_firma_cee_inicial: '2026-09-05' }, documentacion: {},
            oportunidades: { datos_calculo: { inputs: { fuelType: 'gasoleo' } } },
        },
    });
    const punto = (id) => res.comprobaciones.find((p) => p.id === id) || {};
    eq('revisarCee con un v3.0: la acumulación sale INFORMADA, con sus litros',
        [punto('acumulacion_acs').estado, punto('acumulacion_acs').dice], ['info', 'Depósito ficticio: 150 l']);
    eq('y lee el resto como con un v2.0 (referencia, fechas, generador de combustión)',
        [punto('ref_catastral').estado, punto('fecha_certificado').estado, punto('fecha_visita').estado, punto('generador_inicial').estado],
        ['ok', 'ok', 'ok', 'ok']);
}

// ─── A') v3.0: los ejemplos de CE3X 3.1 ──────────────────────────────────────

async function bloqueEjemplos() {
    titulo("A') v3.0 (CE3X 3.1) — los ejemplos oficiales");
    const ficheros = [];
    for (const dir of EJEMPLOS_V30) {
        if (!fs.existsSync(dir)) { salta(`no está ${dir} — se salta`); continue; }
        for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.xml'))) ficheros.push(path.join(dir, f));
    }
    if (!ficheros.length) return;

    let certificados = 0;
    const malos = (lista) => (lista.length ? lista.slice(0, 5).join(' · ') : undefined);
    const fallos = { version: [], espejo: [], bd: [], claves: [], forma: [], ficticios: [], coherencia: [], huecos: [] };
    for (const f of ficheros) {
        const nombre = path.basename(f);
        const buf = fs.readFileSync(f);
        const xml = textoDe(buf);
        if (V30.versionXmlCee(xml) === null) {
            //: No es un certificado (Ejemplo30_Vacio.xml): la radiografía lo dice.
            bien(/no es el \.xml de un certificado/i.test(captura(() => radiografiaXml(buf)).__error || ''), `${nombre}: no es un certificado y la radiografía lo dice`);
            continue;
        }
        certificados++;
        if (!V30.esXmlCeeV30(xml)) fallos.version.push(nombre);

        const leido = V30.leerXmlCeeV30(xml);
        if (JSON.stringify(V30cjs.leerXmlCeeV30(xml)) !== JSON.stringify(leido)) fallos.espejo.push(nombre);
        const enBd = comoEnBd(xml);
        const bd = [
            [V30.leerXmlCeeV30(enBd), leido],
            [radiografiaXml(enBd), radiografiaXml(buf)],
            [parser.leerCalificacionesDeTexto(enBd), parser.leerCalificacionesDeTexto(xml)],
            [parser.leerDatosIrpfDeTexto(enBd), parser.leerDatosIrpfDeTexto(xml)],
            [parser.parseEpnrFromXml(enBd), parser.parseEpnrFromXml(xml)],
            [parser.parseEmisionesTotalesFromXml(enBd), parser.parseEmisionesTotalesFromXml(xml)],
        ];
        if (!bd.every(([a, b]) => igualSinMayusculas(a, b))) fallos.bd.push(nombre);

        const rx = radiografiaXml(buf);
        const forma = formaRx(rx);
        if (forma) fallos.forma.push(`${nombre} (${forma})`);
        const reales = leido.generadores.filter((g) => !g.ficticio).length;
        const enRx = Object.values(rx.generadores).reduce((s, l) => s + l.length, 0);
        if (reales !== enRx) fallos.ficticios.push(nombre);

        if (HAY_DOM) {
            const p = captura(() => parser.parseCeeXml(xml));
            if (p.__error) {
                //: Sin demanda (el «informe inviable» de xmlcert) da el error de siempre.
                if (leido.demanda.cal !== null || !/demanda de calefacción/.test(p.__error)) fallos.claves.push(`${nombre} (${p.__error})`);
            } else {
                if (!clavesParseValidas(Object.keys(p))) fallos.claves.push(nombre);
                //: Las cinco vías dicen lo mismo del mismo certificado.
                const irpf = parser.leerDatosIrpfDeTexto(xml);
                const epnr = parser.parseEpnrFromXml(xml);
                const calif = parser.leerCalificacionesDeTexto(xml);
                const coherente = p.epnrConsumo === irpf.epnrConsumo && p.epnrConsumo === epnr.epnrConsumo
                    && p.epnrLetra === calif.epnrLetra && p.epnrLetra === rx.calificacion.epnr && p.emisionesLetra === calif.emisionesLetra
                    && p.fechaFirma === irpf.fechaFirma && p.fechaFirma === rx.fechas.certificado
                    && p.superficieHabitable === rx.geometria.superficie_habitable && p.demandaCalefaccion === rx.demanda.calefaccion
                    && p.tipoEdificio === rx.identificacion.tipo_edificio && p.identificacion.refCatastral === rx.identificacion.ref_catastral;
                if (!coherente) fallos.coherencia.push(nombre);
                //: El RES080 y el CIFO ven los mismos huecos que parseCeeXml.
                const hy = V30.huecosYOpacosV30(xml).filter((e) => e.tipo === 'Hueco').map((h) => h.nombre);
                if (JSON.stringify(hy) !== JSON.stringify(p.huecos.map((h) => h.nombre))) fallos.huecos.push(nombre);
            }
        }
    }
    bien(!fallos.version.length, `los ${certificados} certificados se reconocen como v3.0`, malos(fallos.version));
    bien(!fallos.espejo.length, 'el espejo CJS lee lo mismo que el ESM en todos', malos(fallos.espejo));
    bien(!fallos.bd.length, 'la copia de la BD (en MAYÚSCULAS) da lo mismo en todos los lectores de texto', malos(fallos.bd));
    bien(!fallos.forma.length, 'la radiografía tiene la forma de la del v2.0 en todos', malos(fallos.forma));
    bien(!fallos.ficticios.length, 'la radiografía cuenta los generadores REALES (sin los ficticios)', malos(fallos.ficticios));
    if (HAY_DOM) {
        bien(!fallos.claves.length, 'parseCeeXml devuelve las claves del v2.0 (o el error de siempre si no hay demanda)', malos(fallos.claves));
        bien(!fallos.coherencia.length, 'parseCeeXml, los lectores de texto y la radiografía dicen lo mismo', malos(fallos.coherencia));
        bien(!fallos.huecos.length, 'huecosYOpacosV30 ve los mismos huecos que parseCeeXml', malos(fallos.huecos));
    } else salta('sin @xmldom/xmldom: parseCeeXml no se comprueba');

    // ── Dos ejemplos concretos, con valores comprobados a mano ───────────────
    const buscar = (n) => ficheros.find((f) => path.basename(f) === n);
    const viv = buscar('2 Vivienda dentro de bloque.xml');
    if (viv && HAY_DOM) {
        const xml = textoDe(fs.readFileSync(viv));
        const p = parser.parseCeeXml(xml);
        const rx = radiografiaXml(fs.readFileSync(viv));
        eq('«2 Vivienda dentro de bloque»: demanda, EPnr y letras', [p.demandaCalefaccion, p.demandaACS, p.demandaRefrigeracion, p.epnrConsumo, p.epnrLetra, p.emisionesLetra], [125.27, 22.04, 0.86, 196.21, 'E', 'E']);
        eq('  tipo «ViviendaBloque» + «Parte» → ViviendaIndividualEnBloque; referencia de Navarra (RRTN) entera', [p.tipoEdificio, p.identificacion.refCatastral], ['ViviendaIndividualEnBloque', '310000000001550820MA']);
        eq('  el hueco «V1-» es «V1»; «Fachada Norte» 27,57 m² netos = 51 m² brutos', [p.huecos[0].nombre, p.opacos[0].nombre, p.opacos[0].superficie, p.opacos[0].orientacion], ['V1', 'Fachada Norte', 51, 'Norte']);
        eq('  la refrigeración ficticia no cuenta', [p.rendimientoRefrigeracion, p.combustibleRefrigeracion, rx.generadores.refrigeracion.length], [null, null, 0]);
        eq('  dos depósitos de ACS de 1 m³', rx.acumulacion_acs.map((a) => a.volumen_l), [1000, 1000]);
    }
    const inf = buscar('Ejemplo30_Informe.xml');
    if (inf && HAY_DOM) {
        const xml = textoDe(fs.readFileSync(inf));
        const p = parser.parseCeeXml(xml);
        const rx = radiografiaXml(fs.readFileSync(inf));
        eq('«Ejemplo30_Informe» (xmlcert): dos referencias catastrales', p.identificacion.refCatastral, '0011Z00ZZBBZZZ0011XX, 0011Z00ZZBBZZZ0022YY');
        eq('  año «1979-2005» es un tramo → null', rx.identificacion.anio_construccion, null);
        eq('  dos visitas (10/5/2014 y 20/8/2014) → la primera', p.fechaVisita, '2014-05-10');
        eq('  la caldera FICTICIA no cuenta: calefacción por bomba de calor', [p.rendimientoCalefaccion, p.combustibleCalefaccion, rx.generadores.calefaccion.map((g) => g.tipo)], [352, 'Electricidad peninsular', ['ExpansionDirectaAireAire']]);
        eq('  el coste de la medida es un tramo («>100000») → null', rx.medidas.map((m) => m.coste_estimado), [null]);
    }
}

// ─── B) v2.0: la huella ──────────────────────────────────────────────────────
//
// Cada lector se pasa por los 462 certificados TAL CUAL y EN MAYÚSCULAS (es lo
// que hace `normalizeData` con `cee.xml_inicial`/`xml_final`: trim + upper), y
// se resume todo en un hash por lector. Ordenado por el hash del contenido del
// fichero, no por su nombre: el resultado no depende de cómo se llamen.
const LECTORES_V20 = {
    radiografiaXml: (buf, txt, mayus) => radiografiaXml(mayus ? txt : buf),
    leerCalificacionesDeTexto: (buf, txt) => parser.leerCalificacionesDeTexto(txt),
    leerDatosIrpfDeTexto: (buf, txt) => parser.leerDatosIrpfDeTexto(txt),
    parseCeeXml: (buf, txt) => parser.parseCeeXml(txt),
    parseEpnrFromXml: (buf, txt) => parser.parseEpnrFromXml(txt),
    parseEmisionesTotalesFromXml: (buf, txt) => parser.parseEmisionesTotalesFromXml(txt),
};
const NECESITAN_DOM = new Set(['parseCeeXml', 'parseEpnrFromXml', 'parseEmisionesTotalesFromXml']);

function huellaV20(ficheros) {
    const corpus = sha(ficheros.map((x) => x.h).join('\n'));
    const funciones = {};
    for (const [nombre, lector] of Object.entries(LECTORES_V20)) {
        if (NECESITAN_DOM.has(nombre) && !HAY_DOM) continue;
        const acc = crypto.createHash('sha256');
        for (const { buf } of ficheros) {
            const txt = textoDe(buf);
            const mayus = comoEnBd(txt);
            acc.update(JSON.stringify(captura(() => lector(buf, txt, false))));
            acc.update('\u0000');
            acc.update(JSON.stringify(captura(() => lector(buf, mayus, true))));
            acc.update('\u0001');
        }
        funciones[nombre] = acc.digest('hex');
    }
    return { corpus, archivos: ficheros.length, funciones };
}

function bloqueV20() {
    titulo('B) v2.0 (CE3X 2.3): la salida de los lectores no cambia ni un byte');
    if (!fs.existsSync(CORPUS)) { salta('corpus no disponible aquí — se salta (vive en data/real_cases_xml)'); return; }
    if (!HAY_DOM) salta('sin @xmldom/xmldom: los lectores con DOMParser no se comprueban');
    const t0 = Date.now();
    const ficheros = fs.readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.xml'))
        .map((f) => fs.readFileSync(path.join(CORPUS, f)))
        .map((buf) => ({ buf, h: sha(buf) }))
        .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));

    //: Ninguno se confunde de versión: si alguno se leyera como v3.0, su salida
    //: cambiaría — y la huella lo diría, pero aquí se dice con nombre.
    const mal = ficheros.filter(({ buf }) => {
        const t = textoDe(buf);
        return V30.versionXmlCee(t) !== '2.0' || V30.esXmlCeeV30(t) || V30.esXmlCeeV30(comoEnBd(t));
    });
    bien(!mal.length, `los ${ficheros.length} certificados v2.0 se reconocen como v2.0 (también en MAYÚSCULAS)`, mal.length ? `${mal.length} no` : undefined);

    const actual = huellaV20(ficheros);
    if (REGENERAR) {
        fs.writeFileSync(HUELLA, JSON.stringify(actual, null, 2) + '\n');
        console.log(`  ↻ huella reescrita (${actual.archivos} ficheros, ${Object.keys(actual.funciones).length} lectores) en ${path.basename(HUELLA)}`);
        return;
    }
    if (!fs.existsSync(HUELLA)) { salta(`no existe ${path.basename(HUELLA)}: genérala con --regenerar`); return; }
    const guardada = JSON.parse(fs.readFileSync(HUELLA, 'utf8'));
    if (guardada.corpus !== actual.corpus) {
        salta(`el corpus ha cambiado (${guardada.archivos} → ${actual.archivos} ficheros): la huella no es comparable; regenérala con --regenerar SOBRE EL CÓDIGO ANTERIOR`);
        return;
    }
    for (const [nombre, h] of Object.entries(guardada.funciones)) {
        if (!(nombre in actual.funciones)) { salta(`${nombre}: no se ha podido calcular aquí`); continue; }
        bien(actual.funciones[nombre] === h, `${nombre}: idéntico en los ${actual.archivos} certificados (y en MAYÚSCULAS)`);
    }
    console.log(`    (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ─── C) El mismo edificio, exportado con las dos versiones ───────────────────
//
// Lo que el certificado DECLARA del edificio tiene que salir igual en las dos
// versiones. Lo que depende de la PRODUCCIÓN PROPIA (energía primaria,
// emisiones eléctricas, total del vector electricidad) puede no coincidir, y se
// enseña: NO es el motor, es lo que declara cada fichero. En el par de
// 26RES093_9 las placas van en la 2.3 como contribución renovable (una cifra
// anual) y en la 3.1 se volvieron a meter como «generador eléctrico» de 7 kW con
// su producción mes a mes. El MISMO .cex abierto en CE3X 3.1 sin tocarlo da las
// mismas cifras que en la 2.3 (comprobado con el propio CE3X 3.1).
// Sin valores escritos aquí: se compara una versión contra la otra.
function bloquePar() {
    titulo('C) El MISMO edificio exportado con CE3X 2.3 (v2.0) y con CE3X 3.1 (v3.0)');
    const f20 = process.env.CEE_PAR_V20, f30 = process.env.CEE_PAR_V30;
    if (!f20 || !f30 || !fs.existsSync(f20) || !fs.existsSync(f30)) {
        salta('sin par — para comprobarlo: CEE_PAR_V20=<cee.xml de CE3X 2.3> CEE_PAR_V30=<el mismo, de CE3X 3.1> node …');
        return;
    }
    const b20 = fs.readFileSync(f20), b30 = fs.readFileSync(f30);
    const t20 = textoDe(b20), t30 = textoDe(b30);
    eq('cada uno es de la versión que dice ser', [V30.versionXmlCee(t20), V30.versionXmlCee(t30)], ['2.0', '3.0']);

    if (HAY_DOM) {
        const p20 = parser.parseCeeXml(t20), p30 = parser.parseCeeXml(t30);
        eq('parseCeeXml: las mismas claves y en el mismo orden', Object.keys(p30), Object.keys(p20));
        const IGUALES = ['demandaCalefaccion', 'demandaACS', 'demandaRefrigeracion', 'demandaGlobal',
            'emisionesCalefaccion', 'emisionesACS', 'emisionesRefrigeracion', 'emisionesConsumoOtros', 'emisionesTotalOtros',
            'superficieHabitable', 'zonaClimatica', 'tipoEdificio', 'identificacion', 'fechaFirma', 'fechaVisita', 'acsLitrosDia',
            'rendimientoCalefaccion', 'rendimientoACS', 'rendimientoRefrigeracion', 'combustibleRefrigeracion', 'combustibleOtros',
            'epnrLetra', 'epnrEscala', 'emisionesLetra', 'emisionesEscala', 'combustibleCalefaccion', 'combustibleACS', 'huecos', 'opacos'];
        const distintos = IGUALES.filter((k) => JSON.stringify(p20[k]) !== JSON.stringify(p30[k]));
        bien(!distintos.length, `parseCeeXml: ${IGUALES.length} datos declarados, iguales en las dos versiones`, distintos.length ? distintos.join(', ') : undefined);
        const sinGlobal = (efv) => Object.fromEntries(Object.entries(efv || {}).map(([k, v]) => [k, { ...v, global: undefined }]));
        eq('energía final por vector: mismos vectores y mismos usos', sinGlobal(p30.energiaFinalVectores), sinGlobal(p20.energiaFinalVectores));
        for (const k of ['epnrConsumo', 'emisionesConsumoElectrico', 'emisionesTotalElectrico']) {
            if (p20[k] !== p30[k]) info(`${k}: v2.0 ${p20[k]} · v3.0 ${p30[k]} — depende de la producción propia que declara cada fichero, no es lectura`);
        }
        for (const [k, v] of Object.entries(p20.energiaFinalVectores || {})) {
            const w = (p30.energiaFinalVectores || {})[k];
            if (w && v.global !== w.global) info(`energía final ${k}: total v2.0 ${v.global} · v3.0 ${w.global} — idem`);
        }
    } else salta('sin @xmldom/xmldom: parseCeeXml no se comprueba');

    const r20 = radiografiaXml(b20), r30 = radiografiaXml(b30);
    eq('radiografía: la misma forma', formaRx(r30), formaRx(r20));
    eq('radiografía: misma identificación, superficie, demanda, calificación, certificador y fechas',
        [r30.identificacion, r30.geometria.superficie_habitable, r30.geometria.volumen, r30.geometria.demanda_diaria_acs_litros, r30.demanda, r30.calificacion,
         { ...r30.certificador, titulacion: undefined }, r30.fechas],
        [r20.identificacion, r20.geometria.superficie_habitable, r20.geometria.volumen, r20.geometria.demanda_diaria_acs_litros, r20.demanda, r20.calificacion,
         { ...r20.certificador, titulacion: undefined }, r20.fechas]);
    const gen = (rx) => Object.fromEntries(Object.entries(rx.generadores).map(([s, l]) =>
        [s, l.map((g) => [g.nombre, g.familia, g.es_combustion, g.combustible, g.rendimiento_pct])]));
    eq('radiografía: los mismos generadores, con la misma familia, combustible y rendimiento', gen(r30), gen(r20));
    const cmp = compararEnvolventes(r20, r30);
    const cambios = cmp.huecos.cambiados.length + cmp.opacos.cambiados.length + cmp.huecos.solo_en_inicial.length
        + cmp.huecos.solo_en_posterior.length + cmp.opacos.solo_en_inicial.length + cmp.opacos.solo_en_posterior.length;
    bien(cambios === 0, `compararEnvolventes(v2.0, v3.0): ${r20.envolvente.huecos.length} huecos y ${r20.envolvente.opacos.length} opacos casan por nombre, superficie y U`,
        cambios ? JSON.stringify(cmp).slice(0, 300) : undefined);
}

// ─── Ejecución ───────────────────────────────────────────────────────────────
await bloqueFicticio();
await bloqueEjemplos();
bloqueV20();
bloquePar();

console.log(`\n${'─'.repeat(60)}\n${ok} correctos, ${fail} fallidos${saltados ? `, ${saltados} avisos` : ''}\n`);
process.exit(fail ? 1 : 0);
