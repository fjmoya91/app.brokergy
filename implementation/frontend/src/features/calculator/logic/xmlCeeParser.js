/**
 * Parser para ficheros XML de Certificados de Eficiencia Energética (CEE)
 * Extrae los datos de demanda del nodo <Demanda><EdificioObjeto>
 * 
 * Estructura esperada del XML:
 * <Demanda>
 *   <EdificioObjeto>
 *     <Calefaccion>176.32</Calefaccion>   ← kWh/m²·año
 *     <ACS>25.11</ACS>                    ← kWh/m²·año
 *     <Refrigeracion>20.92</Refrigeracion>← kWh/m²·año
 *     <Global>222.35</Global>             ← kWh/m²·año
 *   </EdificioObjeto>
 * </Demanda>
 */

/**
 * Parsea un string XML de un CEE y extrae los datos de demanda
 * @param {string} xmlString - Contenido del fichero XML
 * @returns {Object} Datos extraídos del certificado
 */
export function parseCeeXml(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Comprobar si hay errores de parseo
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
        throw new Error('El archivo XML no tiene un formato válido.');
    }

    const result = {
        demandaCalefaccion: null,    // kWh/m²·año
        demandaACS: null,            // kWh/m²·año
        demandaRefrigeracion: null,  // kWh/m²·año
        demandaGlobal: null,         // kWh/m²·año
        superficieHabitable: null,   // m²
        zonaClimatica: null,
        identificacion: null,
    };

    // Intentar extraer datos de <Demanda><EdificioObjeto>
    const demandaNodes = xmlDoc.getElementsByTagName('Demanda');
    if (demandaNodes.length > 0) {
        const demandaNode = demandaNodes[0];
        const edificioObjeto = demandaNode.getElementsByTagName('EdificioObjeto');
        
        if (edificioObjeto.length > 0) {
            const edificio = edificioObjeto[0];
            
            result.demandaCalefaccion = getValidNumber(edificio, 'Calefaccion');
            result.demandaACS = getValidNumber(edificio, 'ACS');
            result.demandaRefrigeracion = getValidNumber(edificio, 'Refrigeracion');
            result.demandaGlobal = getValidNumber(edificio, 'Global');
        }
    }

    // Intentar extraer superficie habitable
    const supNodes = xmlDoc.getElementsByTagName('SuperficieHabitable');
    if (supNodes.length > 0) {
        const val = parseFloat(supNodes[0].textContent);
        if (!isNaN(val) && val > 0 && val < 99999) {
            result.superficieHabitable = val;
        }
    }

    // Intentar extraer zona climática
    const zonaNodes = xmlDoc.getElementsByTagName('ZonaClimatica');
    if (zonaNodes.length > 0) {
        result.zonaClimatica = zonaNodes[0].textContent.trim();
    }

    // Intentar extraer identificación del edificio
    const idNodes = xmlDoc.getElementsByTagName('IdentificacionEdificio');
    if (idNodes.length > 0) {
        const idNode = idNodes[0];
        const nombre = idNode.getElementsByTagName('NombreDelEdificio');
        const direccion = idNode.getElementsByTagName('Direccion');
        const municipio = idNode.getElementsByTagName('Municipio');
        const provincia = idNode.getElementsByTagName('Provincia');
        const refCatastral = idNode.getElementsByTagName('ReferenciaCatastral');

        result.identificacion = {
            nombre: nombre.length > 0 ? nombre[0].textContent.trim() : null,
            direccion: direccion.length > 0 ? direccion[0].textContent.trim() : null,
            municipio: municipio.length > 0 ? municipio[0].textContent.trim() : null,
            provincia: provincia.length > 0 ? provincia[0].textContent.trim() : null,
            refCatastral: refCatastral.length > 0 ? refCatastral[0].textContent.trim() : null,
        };
    }

    // Validar que al menos tenemos la demanda de calefacción
    if (result.demandaCalefaccion === null) {
        throw new Error('No se ha encontrado el dato de demanda de calefacción en el XML. Asegúrate de que el archivo es un Certificado de Eficiencia Energética válido.');
    }

    return result;
}

/**
 * Extrae un valor numérico válido de un nodo XML
 * Ignora valores comodín como 99999999.99
 */
function getValidNumber(parentNode, tagName) {
    const nodes = parentNode.getElementsByTagName(tagName);
    if (nodes.length === 0) return null;

    const val = parseFloat(nodes[0].textContent);
    if (isNaN(val) || val >= 9999999) return null; // Los 99999999.99 son placeholders
    return val;
}
