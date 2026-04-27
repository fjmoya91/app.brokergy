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

    // Helper para buscar nodos de forma robusta e insensible a mayúsculas
    const findNode = (parent, tag) => {
        const exact = parent.getElementsByTagName(tag);
        if (exact.length > 0) return exact[0];
        const all = parent.getElementsByTagName('*');
        const search = tag.toLowerCase();
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName.toLowerCase() === search) return all[i];
        }
        return null;
    };

    // Helper para buscar la mejor coincidencia de fecha (robusto)
    const getBestDate = (searchTags) => {
        const allElements = xmlDoc.getElementsByTagName('*');
        const normalizedTags = searchTags.map(t => t.toLowerCase());
        
        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            if (normalizedTags.includes(el.localName.toLowerCase())) {
                const text = el.textContent.trim();
                if (text && text.length >= 8 && text.includes('/') || text.includes('-')) {
                    return text;
                }
            }
        }
        return null;
    };

    const result = {
        demandaCalefaccion: null,    // kWh/m²·año
        demandaACS: null,            // kWh/m²·año
        demandaRefrigeracion: null,  // kWh/m²·año
        demandaGlobal: null,         // kWh/m²·año
        emisionesCalefaccion: null,  // kgCO2/m²·año
        emisionesACS: null,          // kgCO2/m²·año
        emisionesRefrigeracion: null,// kgCO2/m²·año
        superficieHabitable: null,   // m²
        zonaClimatica: null,
        identificacion: null,
        fechaFirma: null,            // YYYY-MM-DD (de <Fecha>)
        fechaVisita: null,           // YYYY-MM-DD (de <FechaVisita>)
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

    // Intentar extraer datos de <EmisionesCO2>
    const emisionesNodes = xmlDoc.getElementsByTagName('EmisionesCO2');
    if (emisionesNodes.length > 0) {
        const emisionesNode = emisionesNodes[0];
        result.emisionesCalefaccion = getValidNumber(emisionesNode, 'Calefaccion');
        result.emisionesACS = getValidNumber(emisionesNode, 'ACS');
        result.emisionesRefrigeracion = getValidNumber(emisionesNode, 'Refrigeracion');
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

    const rawFechaFirma = getBestDate(['Fecha', 'FechaCertificado', 'FechaFirma']);
    if (rawFechaFirma) result.fechaFirma = parseDMY(rawFechaFirma);

    const rawFechaVisita = getBestDate(['FechaVisita', 'FechaInspeccion']);
    if (rawFechaVisita) result.fechaVisita = parseDMY(rawFechaVisita);

    // Intentar extraer vectores energéticos (combustibles)
    const thermalNodes = xmlDoc.getElementsByTagName('InstalacionesTermicas');
    if (thermalNodes.length > 0) {
        const thermal = thermalNodes[0];
        
        // Calefacción
        const cal = thermal.getElementsByTagName('GeneradoresDeCalefaccion');
        if (cal.length > 0) {
            const vector = cal[0].getElementsByTagName('VectorEnergetico');
            if (vector.length > 0) result.combustibleCalefaccion = mapVectorEnergetico(vector[0].textContent.trim());
        }

        // ACS
        const acs = thermal.getElementsByTagName('InstalacionesACS');
        if (acs.length > 0) {
            const vector = acs[0].getElementsByTagName('VectorEnergetico');
            if (vector.length > 0) result.combustibleACS = mapVectorEnergetico(vector[0].textContent.trim());
        }
    }


    // Huecos
    const allElements = xmlDoc.getElementsByTagName('Elemento');
    result.huecos = [];
    for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const tipo = findNode(el, 'Tipo')?.textContent?.trim()?.toLowerCase();
        if (tipo === 'hueco') {
            result.huecos.push({
                nombre: findNode(el, 'Nombre')?.textContent?.trim() || 'Desconocido',
                superficie: getValidNumber(el, 'Superficie'),
                transmitancia: getValidNumber(el, 'Transmitancia'),
                factorSolar: getValidNumber(el, 'FactorSolar'),
                orientacion: findNode(el, 'Orientacion')?.textContent?.trim() || 'Desconocida'
            });
        }
    }

    // Opacos
    const opaqueNode = findNode(xmlDoc, 'CerramientosOpacos');
    result.opacos = [];
    if (opaqueNode) {
        const elements = opaqueNode.getElementsByTagName('Elemento');
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            result.opacos.push({
                nombre: findNode(el, 'Nombre')?.textContent?.trim() || 'Desconocido',
                tipo: findNode(el, 'Tipo')?.textContent?.trim() || 'Desconocido',
                superficie: getValidNumber(el, 'Superficie'),
                transmitancia: getValidNumber(el, 'Transmitancia'),
                orientacion: findNode(el, 'Orientacion')?.textContent?.trim() || 'Desconocida'
            });
        }
    }

    // Validar que al menos tenemos la demanda de calefacción
    if (result.demandaCalefaccion === null) {
        throw new Error('No se ha encontrado el dato de demanda de calefacción en el XML. Asegúrate de que el archivo es un Certificado de Eficiencia Energética válido.');
    }

    return result;
}

/**
 * Mapea el VectorEnergetico del XML a los nombres internos de FACTORES_PASO
 */
function mapVectorEnergetico(xmlValue) {
    if (!xmlValue) return null;
    const map = {
        'GasoleoC': 'Gasoleo Calefacción',
        'GasNatural': 'Gas Natural',
        'ElectricidadPeninsular': 'Electricidad peninsular',
        'ElectricidadBaleares': 'Electricidad peninsular', // Simplificado
        'ElectricidadCanarias': 'Electricidad peninsular', // Simplificado
        'ElectricidadCeutaMelilla': 'Electricidad peninsular', // Simplificado
        'Butano': 'GLP',
        'Propano': 'GLP',
        'BiomasaPellete': 'Biomasa densificada (pelets)',
        'BiomasaOtros': 'Biomasa no densificada',
        'Carbon': 'Carbón',
        'Gasoil': 'Gasoleo Calefacción',
        'Diesel': 'Gasoleo Calefacción'
    };
    return map[xmlValue] || xmlValue;
}

/**
 * Convierte fecha DD/MM/YYYY a YYYY-MM-DD para inputs HTML tipo date
 */
function parseDMY(str) {
    if (!str) return null;
    // Soporta / - y . como separadores
    const parts = str.split(/[\/\-\.]/);
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    if (!d || !m || !y) return null;
    const fullYear = y.length === 4 ? y : y.length === 2 ? `20${y}` : null;
    if (!fullYear) return null;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Extrae un valor numérico válido de un nodo XML
 * Ignora valores comodín como 99999999.99
 */
function getValidNumber(parentNode, tagName) {
    const findNode = (parent, tag) => {
        const exact = parent.getElementsByTagName(tag);
        if (exact.length > 0) return exact[0];
        const all = parent.getElementsByTagName('*');
        const search = tag.toLowerCase();
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName.toLowerCase() === search) return all[i];
        }
        return null;
    };

    const node = findNode(parentNode, tagName);
    if (!node) return null;

    const text = node.textContent?.trim()?.replace(',', '.') || '';
    const val = parseFloat(text);
    if (isNaN(val) || val >= 9999999) return null; // Los 99999999.99 son placeholders
    return val;
}
