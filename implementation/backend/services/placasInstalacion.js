'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Lo leído de las PLACAS de la obra, puesto en la INSTALACIÓN del expediente.
//
// Es la lógica del botón «✨ Leer placas» de Instalación
// (`POST /api/expedientes/:id/placas/ocr`), sacada aquí para que la use también
// la skill `generar-cee-inicial`: al preparar el CEE inicial ya ha leído la placa
// de la caldera que se retira y —si existe— la de la bomba de calor, y esos datos
// tienen que quedar escritos en la app con las MISMAS reglas que el botón. Con
// dos copias, una placa leída por la skill y otra por el botón acabarían
// escribiendo distinto el mismo campo del CIFO.
//
// Recibe la LECTURA ya hecha (la del popup revisado, la recién leída o la del
// plan de la skill) y devuelve qué escribiría; con `aplicar` lo escribe.
//
// REGLAS (las del botón, sin cambios — ver CLAUDE.md, regla 27.e):
// · Solo se rellenan HUECOS. Lo escrito lo puso una persona con el aparato
//   delante: lo que difiere sale como CONFLICTO y no se toca.
// · El EQUIPO lo decide el catálogo (`casarConCatalogo`), y el SCOP las MISMAS
//   funciones del desplegable (`getScopFromModel` / `getScopSeason`).
// · Un nº de serie DUDOSO (dos lecturas que no coinciden) no se escribe solo.
// · Un CONJUNTO con depósito resuelve su bloque de ACS entero (regla 49).
//
// `simular`: compone la instalación resultante SIN escribirla (la skill la usa
// en seco para que el .cex que enseña sea el que saldría).
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('./supabaseClient');
const placaEquipoOcr = require('./placaEquipoOcrService');
const { contrastarPlacaConRendimiento } = require('../utils/combustibleCaldera');

/**
 * @param {object} p
 * @param {object} p.exp       expediente con `id` e `instalacion`
 * @param {string} p.zona      zona climática (para el SCOP)
 * @param {object} p.caldera   { leido, potencia_kw, potencia_base, sin_fotos, fotos, avisos }
 * @param {object} p.equipos   { unidades: { exterior, interior }, fotos, avisos, sin_fotos }
 * @param {boolean} [p.aplicar]        escribir en `expedientes.instalacion`
 * @param {boolean} [p.simular]        componer la instalación sin escribirla
 * @param {*}       [p.equipoId]       candidato elegido por una persona
 * @param {object}  [p.seriesElegidas] { 'caldera.numero_serie': '…' } entre las dos lecturas
 * @param {boolean} [p.ponerEquipo]    false = no sustituir/poner el equipo del catálogo
 * @param {string}  [p.por]            quién lo hace (email o 'skill …')
 * @param {string}  [p.origen]         de dónde sale la lectura (va a la huella)
 */
async function proponerPlacas({
    exp, zona = 'D3', caldera = {}, equipos = {}, aplicar = false, simular = false,
    equipoId = null, seriesElegidas = {}, ponerEquipo = true, por = null, origen = null,
}) {
    const avisos = [...(caldera.avisos || []), ...(equipos.avisos || [])];

    // La placa de la caldera frente a la FILA de rendimiento del expediente (año
    // y combustible). De esa fila salen el η y el ahorro que firma el CIFO: si la
    // placa la contradice se AVISA, nunca se corrige (regla 27.d).
    const filaId = exp.instalacion?.caldera_antigua_cal?.rendimiento_id;
    if (filaId && (caldera.leido?.anio || caldera.leido?.combustible)) {
        try {
            const { pathToFileURL } = require('url');
            const path = require('path');
            const calc = await import(pathToFileURL(
                path.join(__dirname, '../../frontend/src/features/calculator/logic/calculation.js')).href);
            const etiqueta = (calc.BOILER_EFFICIENCIES || []).find((b) => b.id === filaId)?.label || null;
            avisos.push(...contrastarPlacaConRendimiento(filaId, caldera.leido, etiqueta));
        } catch { /* sin contraste: no tumba la lectura */ }
    }

    // Lo que el expediente declara hoy. Se lee AQUÍ —antes de resolver el
    // catálogo— porque de ello depende qué equipo está vigente y si el bloque de
    // ACS sigue vacío.
    const inst = exp.instalacion || {};
    const aero = { ...(inst.aerotermia_cal || {}) };
    const acsNodoPrevio = inst.aerotermia_acs || {};

    // ── Qué equipo del catálogo dicen las placas ──────────────────────────
    const ext = equipos.unidades?.exterior || null;
    const int = equipos.unidades?.interior || null;
    let catalogo = { modelo: null, por: null, candidatos: [], aviso: null };
    if (ext || int) {
        catalogo = await placaEquipoOcr.casarConCatalogo(ext, int).catch((e) => ({
            modelo: null, por: null, candidatos: [],
            aviso: `No se ha podido consultar el catálogo: ${e.message}`,
        }));

        // Si el equipo YA consta y está entre los candidatos, la placa lo
        // CONFIRMA: no hay ambigüedad que resolver. Sin esto, el popup pedía
        // «elige cuál es» de un equipo que ya había elegido una persona — un
        // aviso que no se puede atender es ruido, y el ruido enseña a no leer
        // los avisos.
        if (!catalogo.modelo && aero.aerotermia_db_id) {
            const consta = (catalogo.candidatos || [])
                .find((c) => String(c.id) === String(aero.aerotermia_db_id));
            if (consta) {
                catalogo = {
                    ...catalogo, modelo: consta, candidatos: [],
                    por: 'la placa confirma el equipo que ya consta', aviso: null,
                };
            }
        }
        if (catalogo.aviso) avisos.push(catalogo.aviso);
    }

    // Una misma unidad exterior se vende con varias interiores, así que a veces
    // el código casa con más de un equipo y no se elige ninguno (es lo correcto:
    // de un modelo cuelgan el SCOP y la ficha técnica). Ahí la elección la hace
    // una PERSONA sobre los candidatos, y llega por `equipo_id` — pero solo se
    // acepta uno de LOS CANDIDATOS: un id cualquiera del catálogo no lo respalda
    // ninguna placa.
    const elegido = equipoId;
    let loHaElegidoUnaPersona = false;
    if (elegido != null && !catalogo.modelo) {
        const cand = (catalogo.candidatos || []).find((c) => String(c.id) === String(elegido));
        if (cand) {
            catalogo = { ...catalogo, modelo: cand, por: 'la elección del usuario entre los candidatos', aviso: null };
            loHaElegidoUnaPersona = true;
        }
    }

    // La fila COMPLETA del equipo casado. El barrido del catálogo pide solo los
    // campos con los que se empareja (regla 22: son 490 filas), pero para
    // resolver el ACS hacen falta sus datos de ACS, sus litros y sus enlaces —
    // una consulta puntual por id, no 490 filas más anchas.
    // ⚠️ EL EQUIPO VIGENTE PUEDE SER EL QUE YA CONSTA. Si el expediente ya
    // tiene su `aerotermia_db_id` puesto, no hay nada que casar —pero el bloque
    // de ACS sí puede seguir vacío, que es justo lo que pasa cuando el equipo se
    // eligió a mano desde el desplegable de calefacción. Sin esto, el botón no
    // proponía nada en ese expediente: «el equipo ya es ese» apagaba también el
    // ACS. Medido en 26RES060_167.
    const idVigente = catalogo.modelo?.id ?? (aero.aerotermia_db_id || null);
    let modeloCompleto = catalogo.modelo;
    if (idVigente != null) {
        const { data: fila } = await supabase
            .from('aerotermia')
            // ⚠️ Con las columnas del SCOP de CALEFACCIÓN: sin ellas
            // `getScopFromModel` cae a su reserva (4,5 a 35 °C, 3,2 a 55 °C) y
            // escribe en el expediente un SCOP «medio» que no es el de la ficha
            // (26RES060_143: 4,5 donde la ficha dice 5,75).
            .select('id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, '
                + 'modelo_ud_interior, potencia_calefaccion, tipo, deposito_acs_incluido, '
                + 'scop_cal_calido_35, scop_cal_calido_55, scop_cal_medio_35, scop_cal_medio_55, '
                + 'eta_calida_35, eta_calida_55, eta_media_35, eta_media_55, '
                + 'litros_acs, scop_dhw_medio, scop_dhw_calido, eta_acs_media, eta_acs_calida, '
                + 'cop_a7_55, eprel, ficha_tecnica, url_keymark')
            .eq('id', idVigente).maybeSingle();
        if (fila) modeloCompleto = fila;
    }

    // El SCOP del modelo casado, con las MISMAS funciones del desplegable.
    let scopCatalogo = null;
    let scopTemporada = null;
    // Y, si el equipo trae el depósito dentro, el nodo de ACS entero: es UNA
    // máquina que hace las dos cosas (regla 49). Lo resuelve `acsCatalogo.js`,
    // el mismo módulo que usa el desplegable de Instalación.
    let acsConjunto = null;
    let acsCat = null;
    if (modeloCompleto) {
        try {
            const { pathToFileURL } = require('url');
            const path = require('path');
            const calc = await import(pathToFileURL(
                path.join(__dirname, '../../frontend/src/features/calculator/logic/calculation.js')).href);
            const cifoDoc = await import(pathToFileURL(
                path.join(__dirname, '../../frontend/src/features/expedientes/logic/cifoDoc.js')).href);
            const temp = cifoDoc.getEmitterTemp(exp.instalacion?.tipo_emisor);
            const metodo = exp.instalacion?.aerotermia_cal?.metodo_scop || 'ficha';
            scopCatalogo = calc.getScopFromModel(modeloCompleto, zona, temp, metodo) ?? null;
            scopTemporada = calc.getScopSeason(modeloCompleto, zona, temp, metodo) ?? null;

            acsCat = await import(pathToFileURL(
                path.join(__dirname, '../../frontend/src/features/expedientes/logic/acsCatalogo.js')).href);
            const mAcs = acsCat.metodoAcsDelModelo(modeloCompleto, zona);
            // Solo un CONJUNTO resuelve el ACS por sí mismo, y solo si el ACS
            // entra en el alcance de la actuación. Sin método no se toca nada:
            // el catálogo no puede justificar su SCOP_dhw y lo dice el aviso.
            // Y solo si el bloque de ACS no está YA resuelto con ese mismo
            // equipo: si lo está, no hay hueco que rellenar y proponerlo sería
            // ofrecer rehacer algo que está bien (y de paso pisar un SCOP_dhw
            // que puede haber ajustado una persona).
            const acsYaResuelto = String(acsNodoPrevio.aerotermia_db_id || '') === String(modeloCompleto.id);
            if (mAcs.conjunto && mAcs.metodo && !acsYaResuelto && exp.instalacion?.cambio_acs !== false) {
                acsConjunto = {
                    metodo: mAcs.metodo,
                    // ⚠️ El SCOP_dhw es PROPIO: la misma bomba rinde mucho menos
                    // calentando agua a 55-60° que dando calefacción, y heredar el
                    // de calefacción es el fallo que la regla 49 vino a arreglar.
                    scop: calc.getScopAcsFromModel(modeloCompleto, zona, mAcs.metodo) ?? null,
                    litros: acsCat.litrosAcsCatalogo(modeloCompleto) ?? null,
                    justifica: mAcs.justifica,
                    motivo: mAcs.motivo,
                };
            } else if (mAcs.conjunto && !mAcs.metodo && exp.instalacion?.cambio_acs !== false) {
                avisos.push(`El equipo trae el depósito de ACS dentro, pero ${mAcs.motivo} `
                    + 'El bloque de ACS se queda sin rellenar: complétalo desde el catálogo.');
            }
        } catch (e) {
            avisos.push('El equipo se ha reconocido en el catálogo pero no se ha podido resolver '
                + `su SCOP (${e.message}): elígelo en el desplegable.`);
        }
    }

    // ── Qué se escribiría: solo los huecos ────────────────────────────────
    const cal = { ...(inst.caldera_antigua_cal || {}) };
    const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

    const propuesta = [];
    const conflictos = [];
    const proponer = (nodo, campo, etiqueta, actual, nuevo) => {
        if (vacio(nuevo)) return;
        if (vacio(actual)) propuesta.push({ nodo, campo, etiqueta, valor: nuevo });
        else if (String(actual).trim().toUpperCase() !== String(nuevo).trim().toUpperCase()) {
            conflictos.push({ nodo, campo, etiqueta, actual, leido: nuevo });
        }
    };

    // ── El Nº DE SERIE, que puede venir DUDOSO ─────────────────────────────
    // Cada placa se lee con dos modelos distintos (utils/serieDePlaca). Si sus
    // nºs de serie no coinciden, ninguno se escribe solo: se enseñan los dos en
    // `dudosos` y lo elige una persona mirando la foto. La elección vuelve en
    // `series_elegidas` y SOLO se acepta una de las dos leídas — un valor
    // cualquiera no lo respalda ninguna placa (mismo criterio que `equipo_id`).
    // Y se compara sin separadores: «2-93-00577» y «29300577» son el mismo dato.
    const { norm: normSerie } = require('../utils/serieDePlaca');
    const elecciones = (seriesElegidas && typeof seriesElegidas === 'object') ? seriesElegidas : {};
    const dudosos = [];
    const proponerSerie = (nodo, campo, etiqueta, actual, lectura) => {
        if (!lectura?.numero_serie) return;
        if (!lectura.serie_dudosa) {
            if (!vacio(actual) && normSerie(actual) === normSerie(lectura.numero_serie)) return;
            return proponer(nodo, campo, etiqueta, actual, lectura.numero_serie);
        }
        const alts = (lectura.serie_alternativas || []).map((a) => a?.serie).filter(Boolean);
        if (!vacio(actual)) {
            // Lo escrito es una de las dos lecturas: no hay nada que decir.
            if (alts.some((a) => normSerie(a) === normSerie(actual))) return;
            conflictos.push({ nodo, campo, etiqueta, actual, leido: alts.join(' / ') });
            return;
        }
        const clave = `${nodo}.${campo}`;
        const elegida = elecciones[clave];
        if (elegida && alts.includes(elegida)) {
            propuesta.push({ nodo, campo, etiqueta, valor: elegida });
            return;
        }
        dudosos.push({ nodo, campo, clave, etiqueta, alternativas: lectura.serie_alternativas });
    };

    // Caldera que se retira.
    const leidoCal = caldera.leido || {};
    proponer('caldera', 'marca', 'Caldera · Marca', cal.marca, leidoCal.marca);
    proponer('caldera', 'modelo', 'Caldera · Modelo', cal.modelo, leidoCal.modelo);
    proponerSerie('caldera', 'numero_serie', 'Caldera · Nº de serie', cal.numero_serie, leidoCal);
    // Un CERO no es una potencia: `potencia_caldera` nace en '' y se guarda como
    // 0 en cuanto alguien abre y guarda Instalación sin tocarlo. Si contara como
    // valor puesto, saldría un «conflicto» contra un dato que no existe.
    const potActual = [inst.potencia_caldera_kw, inst.potencia_caldera]
        .map(Number).find((n) => n > 0) || null;
    proponer('caldera', 'potencia_caldera_kw', 'Caldera · Potencia (kW)', potActual, caldera.potencia_kw);

    // Bomba de calor instalada. El nº de serie que el expediente guarda en el
    // nodo de CALEFACCIÓN —y el que imprimen el CIFO y el Anexo I como «nº de
    // serie ud. exterior»— es el de la UNIDAD EXTERIOR, y solo ése: el de la
    // interior es de otro aparato y ponerlo ahí sería declarar una máquina por
    // otra. Si falta la foto de la exterior, ese hueco se queda sin rellenar y
    // lo dice el aviso — que es lo correcto, no rellenarlo con lo que haya.
    proponer('aerotermia', 'marca', 'Equipo nuevo · Marca', aero.marca, ext?.marca || int?.marca);
    proponerSerie('aerotermia', 'numero_serie', 'Equipo nuevo · Nº de serie (ud. exterior)', aero.numero_serie, ext);
    proponer('aerotermia', 'modelo_ud_exterior', 'Equipo nuevo · Modelo ud. exterior', aero.modelo_ud_exterior, ext?.modelo);
    proponer('aerotermia', 'modelo_ud_interior', 'Equipo nuevo · Modelo ud. interior', aero.modelo_ud_interior, int?.modelo);

    // ── El nº de serie de la UNIDAD INTERIOR ──────────────────────────────
    // Un bibloc son DOS aparatos atornillados en sitios distintos, cada uno con
    // su placa y su nº de serie —por eso se piden las dos fotos—, y que el
    // catálogo los venda como una fila no los convierte en una sola máquina.
    //
    // Su sitio es el nodo de ACS, y no por convención: en un conjunto, la unidad
    // de dentro ES la que calienta y acumula el agua, y es la que el CIFO declara
    // en «Nº serie equipo ACS» (`acsNuSerieEx`, fila aparte de la de la unidad
    // exterior). Sin esto, esa fila del CIFO salía «—» teniendo el dato leído.
    //
    // De quién es la placa lo dice el MODELO leído, no el slot: si coincide con
    // la ud. interior del equipo, es la del conjunto; si es otro aparato —en
    // 26RES080_64 el slot traía un termo ARISTON «NUOS PRIMO 200 HC A+»—, es un
    // equipo de ACS distinto, y su serie es suya igualmente.
    const esLaInteriorDelEquipo = int?.modelo && (
        placaEquipoOcr.casan(int.modelo, aero.modelo_ud_interior)
        || placaEquipoOcr.casan(int.modelo, modeloCompleto?.modelo_ud_interior)
    );
    // Con el ACS fuera del alcance ese nodo no describe nada de esta obra, así
    // que el dato se guarda como REGISTRO junto al modelo del mismo aparato.
    if (esLaInteriorDelEquipo && inst.cambio_acs === false) {
        proponerSerie('aerotermia', 'numero_serie_ud_interior', 'Equipo nuevo · Nº de serie ud. interior',
            aero.numero_serie_ud_interior, int);
    }

    // ── El nodo de ACS ────────────────────────────────────────────────────
    // El nº de serie de la UNIDAD INTERIOR se leía y no iba a ninguna parte: el
    // nodo de calefacción no es su sitio, y el expediente no tiene un campo
    // propio para él. Pero sí lo tiene el nodo de ACS, que es el aparato de
    // dentro —el hidrokit o el acumulador— cuando la actuación toca el agua
    // caliente. Medido en 26RES060_167: la placa estaba, se leyó «MFG.NO. :
    // 5601076» y el expediente se quedó sin ese dato.
    //
    // Se PROPONE como una línea más, rotulada con todas las letras, y solo si:
    //   · el ACS entra en el alcance de la actuación, y
    //   · el nodo de ACS no tiene ya un nº de serie escrito.
    // Con el ACS fuera de alcance no se toca: ahí ese nodo no describe ninguna
    // máquina de la obra.
    const acsNodo = acsNodoPrevio;
    // Con un CONJUNTO no se toca nada aquí: el nodo entero lo resuelve
    // `acsConjunto` más abajo, con el MISMO modelo y las mismas referencias de
    // placa que el de calefacción. Escribir además campos sueltos dejaría el
    // nodo a medias —con nº de serie y sin equipo—, y entonces `mismaMaquina()`
    // no reconoce la firma y la app pasa a leer DOS máquinas donde hay una.
    //
    // El caso de abajo es el contrario: el ACS lo hace OTRO aparato que el
    // expediente ya declara aparte. Ahí el nº de serie de la ud. interior sí es
    // suyo, y es el único sitio del expediente donde ese dato cabe.
    // El nº de serie del aparato que hace el ACS, sea la unidad interior del
    // conjunto o un equipo distinto: en los dos casos es el que el CIFO declara
    // en «Nº serie equipo ACS». Se propone también cuando el bloque de ACS lo
    // acaba de resolver `acsConjunto` —ése copia el nodo de calefacción, cuya
    // serie es la de la unidad EXTERIOR, y dejaría esta fila vacía—.
    // ⚠️ Y solo si el equipo TIENE unidad interior. En un MONOBLOC hay un solo
    // aparato: su serie es la de la unidad exterior, y escribir ahí la de una
    // foto del slot «ud. interior» le diría al verificador que hay dos equipos
    // donde hay uno. Medido: de los 43 conjuntos con las dos series puestas, 16
    // de 18 biblocs las tienen distintas y 18 de 25 monoblocs la misma.
    const hayUdInterior = !!(aero.modelo_ud_interior || modeloCompleto?.modelo_ud_interior);
    const acsAparte = inst.misma_aerotermia_acs === false;
    if (inst.cambio_acs !== false && (acsAparte || acsConjunto)
        && (hayUdInterior || !acsConjunto) && int?.numero_serie) {
        proponerSerie('acs', 'numero_serie', 'Equipo de ACS · Nº de serie (ud. interior)',
            acsNodo.numero_serie, int);
        // ⚠️ NI MARCA NI `modelo`: los dos entran en la firma con la que
        // `mismaMaquina()` decide si el ACS es una SEGUNDA máquina, y de ese
        // veredicto cuelgan qué SCOP_dhw se declara y qué equipos imprime el
        // CIFO. Rellenar un hueco no puede cambiar de paso lo que el expediente
        // dice que hay instalado. `modelo_ud_interior` es descriptivo y no entra
        // en esa firma, así que sí: es el nombre del aparato de dentro.
        if (!acsConjunto) {
            proponer('acs', 'modelo_ud_interior', 'Equipo de ACS · Modelo ud. interior',
                acsNodo.modelo_ud_interior, int.modelo);
        }
    }

    // El equipo del catálogo entra como UNA propuesta: arrastra consigo el
    // modelo comercial, el id y el SCOP, que no se pueden aplicar por separado
    // —un SCOP sin su modelo no lo puede reproducir nadie—.
    const yaEsEseModelo = String(aero.aerotermia_db_id || '') === String(catalogo.modelo?.id || '');
    const equipoCatalogo = (catalogo.modelo && !yaEsEseModelo) ? {
        id: catalogo.modelo.id,
        marca: catalogo.modelo.marca,
        modelo: catalogo.modelo.modelo_comercial || catalogo.modelo.modelo_conjunto || '',
        modelo_ud_exterior: catalogo.modelo.modelo_ud_exterior || '',
        modelo_ud_interior: catalogo.modelo.modelo_ud_interior || '',
        potencia: catalogo.modelo.potencia_calefaccion || 0,
        scop: scopCatalogo,
        scop_temporada: scopTemporada,
        por: catalogo.por,
        // Sustituir un equipo YA elegido es una decisión, no un hueco: se
        // ofrece desmarcado y diciendo cuál consta ahora.
        sustituye: aero.aerotermia_db_id ? (aero.modelo || 'otro equipo') : null,
        // El equipo trae el depósito dentro y resuelve él solo el ACS: va con el
        // equipo, no como una casilla aparte. Son la misma máquina, y un bloque
        // de ACS sin su equipo no lo puede justificar nadie.
        acs: acsConjunto,
    } : null;

    // ── Aplicar ───────────────────────────────────────────────────────────
    // ⚠️ ELEGIR UN CANDIDATO ES AUTORIZARLO. `aplicar_equipo` lo manda el popup
    // desde su casilla, y esa casilla nace apagada justo cuando hay varios
    // candidatos —porque entonces no hay ningún equipo propuesto que marcar—,
    // así que sin esta salida la elección del usuario llegaba y se descartaba:
    // medido en 26RES060_167, que eligió el id 238 y se guardó sin equipo.
    const aplicarEquipo = equipoCatalogo
        && (loHaElegidoUnaPersona || ponerEquipo !== false);
    // El bloque de ACS de un conjunto es un HUECO como los demás, así que se
    // rellena. Va con el equipo cuando hay que cambiarlo —poner el ACS de una
    // máquina que no se aplica sería declarar dos cosas distintas— y va SOLO
    // cuando el equipo ya consta y lo único que falta es esto.
    const aplicarAcs = !!acsConjunto && (aplicarEquipo || !equipoCatalogo);
    const escrito = [];
    let nueva = null;
    if ((aplicar || simular) && (propuesta.length || aplicarEquipo || aplicarAcs)) {
        nueva = { ...inst };
        const nuevaCal = { ...cal };
        const nuevaAero = { ...aero };
        const nuevaAcs = { ...acsNodo };

        for (const p of propuesta) {
            if (p.nodo === 'caldera') {
                if (p.campo === 'potencia_caldera_kw') {
                    nueva.potencia_caldera_kw = p.valor;
                    // `potencia_caldera` es el MISMO número (la nominal de la
                    // caldera existente, la del C_b de un RES093 por caldera):
                    // si está vacía o a 0 se rellena también, igual que hace
                    // `expedienteService` al heredar la placa de la oportunidad.
                    if (!(Number(inst.potencia_caldera) > 0)) nueva.potencia_caldera = p.valor;
                }
                else nuevaCal[p.campo] = p.valor;
            } else if (p.nodo === 'acs') {
                nuevaAcs[p.campo] = p.valor;
            } else {
                nuevaAero[p.campo] = p.valor;
            }
            escrito.push(`${p.nodo}.${p.campo}`);
        }
        // El nodo de ACS solo se toca si se ha escrito algo en él: montarlo
        // siempre dejaría un objeto vacío donde no había ninguno, y de que ese
        // nodo tenga datos propios depende que la app lo lea como OTRA máquina
        // (regla 12.c).
        if (propuesta.some((p) => p.nodo === 'acs')) nueva.aerotermia_acs = nuevaAcs;

        if (aplicarEquipo) {
            nuevaAero.aerotermia_db_id = equipoCatalogo.id;
            nuevaAero.marca = equipoCatalogo.marca || nuevaAero.marca;
            nuevaAero.modelo = equipoCatalogo.modelo;
            // El modelo se acaba de escribir desde el catálogo, así que puede traer
            // ya dentro la referencia de la ud. exterior: se marca para que la
            // celda "Modelo" del CIFO no la repita detrás (ver `refExtVisible`).
            nuevaAero.modelo_sin_repetir = true;
            nuevaAero.modelo_ud_exterior = equipoCatalogo.modelo_ud_exterior || nuevaAero.modelo_ud_exterior || '';
            nuevaAero.modelo_ud_interior = equipoCatalogo.modelo_ud_interior || nuevaAero.modelo_ud_interior || '';
            nuevaAero.modelo_conjunto = catalogo.modelo.modelo_conjunto || '';
            if (equipoCatalogo.potencia) nuevaAero.potencia = equipoCatalogo.potencia;
            // El SCOP solo se escribe si se ha podido resolver: un equipo con el
            // id del catálogo y el SCOP del anterior es peor que uno sin id.
            if (equipoCatalogo.scop != null) {
                nuevaAero.scop = equipoCatalogo.scop;
                nuevaAero.scop_temporada = equipoCatalogo.scop_temporada;
            }
            escrito.push('aerotermia.equipo_catalogo');

        }

        // ── El ACS de un CONJUNTO ─────────────────────────────────────────
        // FUERA del bloque del equipo: el ACS puede ser lo ÚNICO que falte
        // cuando el equipo de calefacción ya se eligió a mano en su desplegable
        // —que es como llegó 26RES060_167—. Va después de escribir el nodo de
        // calefacción porque copia de él el modelo y las referencias ya
        // actualizadas, y lo hace con `nodoAcsDesdeConjunto`, la MISMA función
        // que usa Instalación: un conjunto rellenado por la placa y otro
        // elegido a mano tienen que quedar idénticos.
        if (aplicarAcs && acsCat) {
            const nodo = acsCat.nodoAcsDesdeConjunto(nuevaAero, modeloCompleto, acsConjunto);
            // Rellenar no puede BORRAR: si el nodo de calefacción tiene un hueco
            // (aquí falta el nº de serie, porque no hay foto de la ud. exterior)
            // y el de ACS ya traía ese dato escrito, se conserva.
            for (const [k, v] of Object.entries(nuevaAcs)) {
                if (vacio(nodo[k]) && !vacio(v)) nodo[k] = v;
            }
            nueva.aerotermia_acs = nodo;
            // El flag baja a false a propósito: los dos nodos llevan el mismo
            // modelo y la misma serie, pero el SCOP_dhw es PROPIO y con el flag
            // activo la app clonaría el de calefacción (regla 49). Que sean UNA
            // máquina lo decide `mismaMaquina()` por el modelo, no este flag
            // (regla 12.c).
            nueva.misma_aerotermia_acs = false;
            escrito.push('acs.equipo_conjunto');
        }

        nueva.caldera_antigua_cal = nuevaCal;
        nueva.aerotermia_cal = nuevaAero;

        // La app CLONA la caldera de calefacción en la de ACS mientras sea la
        // misma: si no se hiciera aquí, el CIFO imprimiría la marca en un
        // servicio y un hueco en el otro.
        if (inst.misma_caldera_acs !== false) {
            const acs = { ...(inst.caldera_antigua_acs || {}) };
            for (const p of propuesta) {
                if (p.nodo === 'caldera' && p.campo !== 'potencia_caldera_kw' && vacio(acs[p.campo])) {
                    acs[p.campo] = p.valor;
                }
            }
            nueva.caldera_antigua_acs = acs;
        }

        // Huella de qué leyó la máquina y de dónde. Solo metadatos (regla 21):
        // una comprobación que se ve una vez y se pierde al cerrar el popup no
        // sirve de nada. Aquí queda además el nº de serie de la unidad INTERIOR,
        // que no tiene campo propio en el expediente pero sí se ha leído.
        nueva.placas_ocr = {
            at: new Date().toISOString(),
            por: por || null,
            ...(origen ? { origen } : {}),
            caldera: leidoCal,
            potencia_caldera_kw: caldera.potencia_kw ?? null,
            unidad_exterior: ext,
            unidad_interior: int,
            catalogo: catalogo.modelo
                ? { id: catalogo.modelo.id, modelo: catalogo.modelo.modelo_comercial, por: catalogo.por }
                : null,
            fotos: [...(caldera.fotos || []).map((f) => f.name), ...(equipos.fotos || []).map((f) => f.name)],
            escrito,
        };

        if (aplicar) {
            const { error: upErr } = await supabase
                .from('expedientes')
                .update({ instalacion: nueva, updated_at: new Date().toISOString() })
                .eq('id', exp.id);
            if (upErr) {
                const e = new Error(`No se pudo guardar en el expediente: ${upErr.message}`);
                e.status = 500;
                throw e;
            }
        }
    }


    return {
        caldera: {
            leido: caldera.leido || null,
            potencia_kw: caldera.potencia_kw ?? null,
            potencia_base: caldera.potencia_base ?? null,
            sin_fotos: !!caldera.sin_fotos,
        },
        unidad_exterior: ext,
        unidad_interior: int,
        equipo_catalogo: equipoCatalogo,
        // El bloque de ACS que resolvería el conjunto, también cuando el equipo
        // de calefacción ya consta y no hay `equipo_catalogo` que enseñar: ahí
        // es lo ÚNICO que se va a escribir, así que tiene que verse.
        acs_conjunto: acsConjunto && !equipoCatalogo ? { ...acsConjunto, equipo: modeloCompleto?.modelo_comercial || '' } : null,
        catalogo_candidatos: catalogo.candidatos || [],
        fotos: [...(caldera.fotos || []), ...(equipos.fotos || [])],
        propuesta, conflictos, dudosos,
        escrito: aplicar ? escrito : [],
        // Lo que se escribe (o se escribiría, con `simular`); null si nada.
        instalacion: nueva,
        avisos,
    };
}

module.exports = { proponerPlacas };
