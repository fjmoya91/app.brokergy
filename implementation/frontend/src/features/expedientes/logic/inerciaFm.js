// ============================================================================
// LA INERCIA HIDRÁULICA DE LA VÍA FM — dentro del CIFO (documento 3.c)
// ----------------------------------------------------------------------------
// La RES060_FM (BOE-A-2026-23367, apartado 3, documento 3.c) pide un «Certificado
// de que la instalación dispone de la inercia hidráulica necesaria para garantizar
// el correcto funcionamiento de la bomba de calor en todas las condiciones de
// operación previstas, de acuerdo con las especificaciones del fabricante», con el
// volumen de agua total (litros) y el volumen específico (l/kW). Ya NO hay mínimo
// fijo: los 15 L/kW eran del borrador.
//
// La propia ficha lo cuelga del documento 3 —el certificado de la instalación de
// la empresa habilitada, que es nuestro CIFO—, así que va DENTRO del CIFO, en una
// hoja propia, y no como un papel más que firmar (Fran, 07/11/2026: «así usamos un
// único documento que es el CIFO»). Las hibridaciones (RES09x_FM) no lo piden.
//
// Los litros los declara el instalador y se teclean en Instalación
// (`instalacion.inercia_litros`; el mínimo del fabricante, opcional, en
// `instalacion.inercia_min_fabricante_litros`). El volumen específico NO se teclea:
// se calcula con la potencia nominal TOTAL de la bomba (en cascada, la suma).
// ============================================================================
import { esNumeroFm } from './viaFm.js';
import { potenciaTotal } from './aerotermiaUnits.js';

/** El CIFO de este expediente lleva la hoja de inercia: vía FM y sustitución (no hibridación). */
export function aplicaInerciaFm(numero) {
    return esNumeroFm(numero) && /RES060FM_/i.test(String(numero || ''));
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
};

const es = (n, dec = 0) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/**
 * Lo que imprime el CIFO y lo que se avisa en Instalación.
 * Devuelve { litros, minFabricante, potenciaKw, unidades, especifico,
 *            litrosStr, potenciaStr, especificoStr, minStr, falta[], avisos[] }.
 */
export function inerciaFm(inst = {}) {
    const litros = num(inst?.inercia_litros);
    const minFabricante = num(inst?.inercia_min_fabricante_litros);
    const potenciaKw = potenciaTotal(inst?.aerotermia_cal || {}) || num(inst?.potencia_bomba) || null;
    const unidades = Math.max(1, (inst?.aerotermia_cal?.equipos_extra || []).length + 1);
    const especifico = litros && potenciaKw ? Math.round((litros / potenciaKw) * 10) / 10 : null;

    const falta = [];
    if (!litros) falta.push('Volumen de agua total de la instalación (inercia, vía FM) — en Instalación');
    if (!potenciaKw) falta.push('Potencia nominal de la bomba de calor (para el volumen específico de la inercia)');

    const avisos = [];
    if (litros && minFabricante && litros < minFabricante) {
        avisos.push(`El volumen declarado (${es(litros)} L) es MENOR que el mínimo que pide el fabricante (${es(minFabricante)} L): el certificado afirmaría algo que no se cumple.`);
    }

    return {
        litros, minFabricante, potenciaKw, unidades, especifico,
        litrosStr: litros ? `${es(litros)} litros` : '—',
        potenciaStr: potenciaKw ? `${es(potenciaKw, potenciaKw % 1 ? 1 : 0)} kW${unidades > 1 ? ` (${unidades} unidades en cascada)` : ''}` : '—',
        especificoStr: especifico ? `${es(especifico, 1)} l/kW` : '—',
        minStr: minFabricante ? `${es(minFabricante)} litros` : null,
        falta,
        avisos,
    };
}
