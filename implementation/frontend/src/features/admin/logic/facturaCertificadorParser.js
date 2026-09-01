// ─────────────────────────────────────────────────────────────────────────────
// Parser de las facturas que los CERTIFICADORES pasan a Brokergy.
//
// Cada certificador usa su propia plantilla y no se parecen en nada:
//
//   Lanuza   "CEE inicial y CEE final registrados. C/ Dalí 4, 13150 Carrión…  1  60,00 €  60,00 €"
//   Moncayo  "- (26RES060_160) VIVIENDA UNIFAMILIAR EN QUINTANAR DE LA ORDEN…  1  60,00 €"
//
// Lo único que comparten es la COLA de la línea: cantidad seguida de uno o dos
// importes. Por eso no se analiza la tabla por columnas —cada plantilla las
// coloca a su manera— sino que se busca ese patrón al final de cada línea. Todo
// lo demás de la línea es la descripción.
//
// Con UN importe, ése es el total de la línea (Moncayo escribe "2  32,78 €",
// que son las dos tasas ya sumadas). Con DOS, el primero es el precio unitario
// y el segundo el total (Lanuza escribe "2  16,39 €  32,78 €").
//
// IMPORTANTE: se trabaja sobre LÍNEAS VISUALES, no sobre los fragmentos sueltos
// que devuelve pdf.js. pdf.js parte los textos por donde le conviene ("FACTURA
// Nº AP0"·"3"·"0"·"7"…, "3"·"0"·"/06/2026") y solo se recomponen al unir la
// línea entera.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };

// Cola de un concepto: <cantidad> <importe> [€] [<importe> [€]].
// Llega de dos formas según la plantilla: pegada a la descripción en la misma
// línea (Moncayo, y los trabajos de Lanuza) o sola en su línea, con la
// descripción en las anteriores (los suplidos de Lanuza, que ocupan dos líneas).
const RE_CONCEPTO = /^(.*?[^\d\s])\s+(\d{1,3})\s+([\d.]+,\d{2})\s*€?(?:\s+([\d.]+,\d{2})\s*€?)?\s*$/;
const RE_COLA_SOLA = /^(\d{1,3})\s+([\d.]+,\d{2})\s*€?(?:\s+([\d.]+,\d{2})\s*€?)?\s*$/;

// Cabecera de la tabla: no es descripción, y si se acumulara acabaría pegada al
// primer concepto.
// El título del bloque de trabajos va ANCLADO y solo: la línea de Lanuza
// empieza con ese mismo texto ("CEE inicial y CEE final registrados. C/ Dalí
// 4…") pero sigue con la dirección y su cola, y esa SÍ es un concepto.
const RE_CABECERA_TABLA = /^(Descripci|CONCEPTOS|Unidades|Precio)|^CEE INICIAL Y CEE FINAL\s*$/i;

// Líneas de totales: llevan importe pero no son conceptos.
const RE_TOTALES = /^\s*[-–*]?\s*(TOTAL|IVA|RETENCI[ÓO]N|IRPF|BASE|IMPORTE TOTAL|Asciende)/i;

// Totales que la propia factura DECLARA, cuando van con su etiqueta en la misma
// línea ("TOTAL SUPLIDOS 147,51 €.-"). Sirven para comprobar que el desglose
// leído suma lo que dice el pie: si no cuadra, o falta una línea o sobra.
const RE_TOTAL_DECLARADO = /^\s*[-–*]?\s*TOTAL\s*(\(?\s*BASE[^)]*\)?|SUPLIDOS|A\s+INGRESAR|FACTURA|DE\s+LOS\s+SUPLIDOS)\s*[.:]?\s*\+?([\d.]+,\d{2})/i;

const CLAVE_TOTAL = (etiqueta) => {
    const e = etiqueta.toUpperCase();
    if (e.includes('BASE')) return 'base';
    if (e.includes('SUPLIDOS')) return 'suplidos';
    if (e.includes('INGRESAR')) return 'total';
    if (e.includes('FACTURA')) return 'trabajos';
    return null;
};

// Arranque del bloque de suplidos, en cualquiera de sus redacciones.
const RE_SUPLIDOS = /IMPORTES\s+SUPLIDOS/i;

// Pie legal y datos del emisor: nunca son conceptos.
const RE_PIE = /^\s*\*|^conforme al art|^En Tomelloso|^Estos pagos|^\(NIF|^MAIL|^TLF|^Col\.|^Facturar|^N[ºo] de afiliaci/i;

// NIF/CIF que aparecen en el documento, normalizados a "70590504P" / "B19350222".
// Cada plantilla los escribe a su manera: "(NIF/CIF):70590504 P", "D.N.I. 71355161 F",
// "NIF: 71355161-F". Sirven para comprobar que la factura es DEL certificador cuya
// ficha está abierta: subirla en la ficha equivocada emparejaría contra los
// expedientes de otro.
const nifsDe = (lineas) => {
    const texto = lineas.join(' \n ').toUpperCase();
    const encontrados = new Set();
    // DNI: la letra puede ir separada ("70590504 P", "71355161-F").
    for (const m of texto.matchAll(/\b(\d{8})\s*[-.]?\s*([A-Z])\b/g)) encontrados.add(`${m[1]}${m[2]}`);
    // CIF: la letra va pegada o con guion. NO se admite espacio, o "D.N.I. 71355161"
    // produciría el NIF fantasma "I71355161".
    for (const m of texto.matchAll(/\b([A-Z])-?(\d{8})\b/g)) encontrados.add(`${m[1]}${m[2]}`);
    return [...encontrados];
};

const aNumero = (s) => {
    const n = parseFloat(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

// La fecha no se escribe igual en todas: "31-jul.-26", "30/06/2026"…
const leerFecha = (txt) => {
    const t = String(txt || '');
    const conMes = t.match(/\b(\d{1,2})-(\w{3})\.?-(\d{2,4})\b/);
    if (conMes) {
        const mes = MESES[conMes[2].slice(0, 3).toLowerCase()];
        if (mes) {
            const anio = conMes[3].length === 2 ? `20${conMes[3]}` : conMes[3];
            return `${anio}-${String(mes).padStart(2, '0')}-${String(Number(conMes[1])).padStart(2, '0')}`;
        }
    }
    const numerica = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (numerica) return `${numerica[3]}-${String(Number(numerica[2])).padStart(2, '0')}-${String(Number(numerica[1])).padStart(2, '0')}`;
    // Con todas las letras, al pie del documento: "Bellver de Cerdanya, a 31 de
    // Agosto de 2026". Es la ÚNICA fecha de la plantilla de Moncayo, y sin fecha
    // no se puede sellar: había que teclearla a mano teniéndola delante.
    const literal = t.match(/\b(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]{3,})\s+de\s+(\d{4})\b/i);
    if (literal) {
        const mes = MESES[literal[2].slice(0, 3).toLowerCase()];
        if (mes) return `${literal[3]}-${String(mes).padStart(2, '0')}-${String(Number(literal[1])).padStart(2, '0')}`;
    }
    return null;
};

/**
 * Extrae el texto de un PDF con pdf.js, UNA CADENA POR LÍNEA VISUAL.
 * Se acumulan los fragmentos hasta el `hasEOL` que marca pdf.js.
 */
export async function extraerLineasPdf(pdfjsLib, arrayBuffer) {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const lineas = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        let actual = '';
        for (const item of content.items) {
            actual += item.str || '';
            if (item.hasEOL) { if (actual.trim()) lineas.push(actual.trim()); actual = ''; }
        }
        if (actual.trim()) lineas.push(actual.trim());
    }
    try { await doc.destroy(); } catch { /* si no se puede cerrar, da igual */ }
    return lineas;
}

/**
 * Convierte las líneas de una factura en cabecera + conceptos.
 * @returns {{ numero, fecha, items: Array<{tipo,descripcion,unidades,precio_unitario,importe}>, totales }}
 */
export function parsearFacturaCertificador(entrada) {
    const lineas = (Array.isArray(entrada) ? entrada : entrada?.lineas || []).map(l => String(l || '').trim());

    let numero = null;
    let fecha = null;
    for (const l of lineas) {
        if (!numero) {
            // Serie + correlativo: "AP232026", "AP03072026". El sufijo forma
            // PARTE del número y se conserva: "AP02082026MOD" es la factura
            // MODIFICADA de "AP02082026", y truncarlo dejaría a las dos con el
            // mismo sello, indistinguibles en el histórico de lo pagado.
            const m = l.match(/\b([A-Z]{2,3}\d{6,10}[A-Z]*)/);
            if (m) numero = m[1];
        }
        if (!fecha) fecha = leerFecha(l);
    }

    const items = [];
    const declarados = { base: null, suplidos: null, trabajos: null, total: null };
    let enSuplidos = false;
    // Texto visto que aún no tiene cola: es la descripción del concepto que
    // vendrá. Se limita a las últimas líneas para que un despiste no arrastre
    // media factura dentro de una descripción.
    let pendiente = [];

    const anota = (descripcion, unidades, primero, segundo) => {
        items.push({
            tipo: enSuplidos ? 'suplido' : 'trabajo',
            // El guion de viñeta de algunas plantillas no aporta nada.
            descripcion: descripcion.replace(/^\s*[-–•]\s*/, '').replace(/\s+/g, ' ').trim(),
            unidades,
            // El ÚLTIMO importe es siempre el total de la línea; si solo hay uno,
            // ése es el total y el unitario se deduce.
            precio_unitario: segundo !== null ? primero : (unidades ? Math.round((primero / unidades) * 100) / 100 : primero),
            importe: segundo !== null ? segundo : primero,
        });
    };

    for (const l of lineas) {
        if (!l) continue;
        if (RE_SUPLIDOS.test(l)) { enSuplidos = true; pendiente = []; continue; }
        if (RE_TOTALES.test(l) || RE_PIE.test(l) || RE_CABECERA_TABLA.test(l)) {
            const td = l.match(RE_TOTAL_DECLARADO);
            if (td) {
                const clave = CLAVE_TOTAL(td[1]);
                if (clave && declarados[clave] === null) declarados[clave] = aNumero(td[2]);
            }
            pendiente = [];
            continue;
        }

        const sola = l.match(RE_COLA_SOLA);
        if (sola) {
            if (pendiente.length) {
                anota(pendiente.join(' '), Number(sola[1]), aNumero(sola[2]), sola[3] ? aNumero(sola[3]) : null);
                pendiente = [];
            }
            continue;
        }

        const m = l.match(RE_CONCEPTO);
        if (m) {
            anota([...pendiente, m[1]].join(' '), Number(m[2]), aNumero(m[3]), m[4] ? aNumero(m[4]) : null);
            pendiente = [];
            continue;
        }

        pendiente.push(l);
        if (pendiente.length > 3) pendiente.shift();
    }

    const suma = (t) => Math.round(items.filter(i => i.tipo === t).reduce((s, i) => s + (i.importe || 0), 0) * 100) / 100;
    const base = suma('trabajo');
    const suplidos = suma('suplido');

    // Descuadres entre lo que suma el desglose y lo que la factura declara en su
    // pie. Pasa de verdad: la factura AP03072026 lista dos veces el suplido de
    // Los Carrascales pero su TOTAL SUPLIDOS solo lo cuenta una vez.
    const descuadres = [];
    const casi = (a, b) => Math.abs(a - b) < 0.02;
    // Formato español: en pantalla se compara contra la factura, que va en comas.
    const eur = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    if (declarados.base !== null && !casi(base, declarados.base)) {
        descuadres.push(`El desglose de trabajos suma ${eur(base)} y la factura declara ${eur(declarados.base)}.`);
    }
    if (declarados.suplidos !== null && !casi(suplidos, declarados.suplidos)) {
        descuadres.push(`El desglose de suplidos suma ${eur(suplidos)} y la factura declara ${eur(declarados.suplidos)}.`);
    }

    return { numero, fecha, items, totales: { base, suplidos }, declarados, descuadres, nifs: nifsDe(lineas) };
}

export default parsearFacturaCertificador;
