// ─────────────────────────────────────────────────────────────────────────────
// EL PAQUETE DE CADA ACTUACIÓN — renombrar los documentos del expediente a
// "E{n}-…" y dejar su ZIP listo para subir.
//
// Se hacía a mano: bajar de Drive los ~20 documentos de cada expediente,
// renombrarlos uno a uno con su código del índice y comprimirlos. Cinco veces por
// lote. La nomenclatura sale de los lotes YA ENVIADOS (medida sobre LOTE-2025-002,
// 003 y 2026-004, que coinciden entre sí) y es la que el verificador y la Gestora
// de Ahorros ya han aceptado: aquí no se inventa, se reproduce.
//
// DOS PAQUETES, porque se pueden armar en dos momentos distintos (y por eso dos
// botones):
//   · `expediente` → la carpeta "E{n}" DENTRO del expediente, sin el dictamen ni
//     los escritos del lote. Se puede montar en cuanto el informe de verificación
//     numera las actuaciones, que es semanas antes de que llegue el dictamen.
//   · `gestor`     → "{LOTE} - ENVIO GESTOR/E{n}" en la carpeta del lote: lo mismo
//     MÁS el dictamen favorable (E-2) y los escritos del lote (E-5-x). Es el que se
//     sube a MITECO, y hasta que no hay dictamen no existe.
//
// Los dos exigen el Nº DE ACTUACIÓN (`instalacion.verificacion.orden_actuacion`),
// que lo asigna el informe de verificación: es lo que nombra cada fichero y el ZIP,
// y deducirlo de otra cosa haría que los adjuntos dejaran de casar con el anexo que
// los cita (misma regla que el anexo del MITECO).
//
// REGLA — los ficheros se COPIAN, nunca se mueven. El original sigue en su carpeta
// de siempre ("6. ANEXOS CAE", "5. FACTURAS", "1. CEE/…"), que es la que audita
// todo lo demás. El paquete es una vista derivada: se puede regenerar cuantas
// veces haga falta y lo que reemplaza lo borra, no lo archiva, porque nunca es la
// única copia de nada.
//
// REGLA — lo IMPRESCINDIBLE bloquea; lo leve avisa. Un paquete al que le falta el
// justificante de registro del CEE se presenta igual de bien que uno completo y el
// requerimiento llega tres semanas después; uno sin la etiqueta energética no.
// Cada pieza declara su `obligatorio` y esa es la única fuente del corte.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const { scanCeeSection } = require('./ceeUploadService');
const { carpetaDeExpediente } = require('./expedienteFolderSync');
const { crearZip } = require('../utils/zipStore');
const { fichaFromNumero } = require('../utils/fichas');
const { unirAnexos, fetchAnnexBuffers } = require('./pdfService');
const path = require('path');
const { pathToFileURL } = require('url');

// Los dos módulos ESM del frontend que deciden QUÉ fichas técnicas lleva el
// expediente y en qué orden y con qué recorte de páginas. Se cargan por import()
// dinámico, igual que hace `cifoService` (ver [[project_backend_importa_frontend_esm]]):
// son la MISMA fuente que el modal del CIFO, y con una copia aquí el fichero
// suelto y el bloque de anexos del certificado divergirían.
let _ftPromise = null;
function loadFichasTecnicas() {
    if (!_ftPromise) {
        _ftPromise = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')).href);
    }
    return _ftPromise;
}
let _annexPromise = null;
function loadAnnexPrefs() {
    if (!_annexPromise) {
        _annexPromise = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/annexPrefs.js')).href);
    }
    return _annexPromise;
}

// Código del CERTIFICADO RITE dentro del grupo 3.
//
// En los lotes ya enviados comparte el "3-6" con el justificante de registro del
// CEE final —los dos ficheros llevan el mismo código— y el 3-2 está libre en todos
// ellos. Se le da el 3-2, que es el único hueco del grupo y deja el orden de
// lectura correcto (ficha · RITE · facturas · fotos · certificado…). Si alguna vez
// el índice del gestor reserva ese número para otra cosa, se cambia AQUÍ y en
// ningún otro sitio.
const COD_RITE = '3-2';

const CARPETA_GESTOR = (codigo) => `${codigo || 'LOTE'} - ENVIO GESTOR`;

// ─── Utilidades ──────────────────────────────────────────────────────────────
const driveIdDe = (link) => {
    if (!link) return null;
    const s = String(link);
    const m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/)
        || s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[-\w]{25,}/);
    return m ? (m[1] || m[0]) : null;
};

const limpio = (s) => String(s || '').replace(/[\\/<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim();

// Marca con la que se nombra al S.O. en el convenio ("BROKERGY-INTERALCO").
const marcaSo = (so) => limpio(so?.acronimo || so?.razon_social || 'SUJETO OBLIGADO').toUpperCase();

// Ficha de un expediente por su número ({AA}RES060_12 → RES060). La lista sale de
// la fuente única `utils/fichas.js`: una copia aquí se quedaría atrás al entrar
// una ficha nueva y devolvería RES060 en silencio.
function fichaDe(numero) {
    return fichaFromNumero(numero) || 'RES060';
}

// ─── El ÍNDICE del paquete ───────────────────────────────────────────────────
// Una entrada por documento. `cod` es su número en el índice, `nombre` el nombre
// canónico DENTRO del paquete (sin el prefijo "E{n}-{cod} - ", que se compone
// aparte) y `de` dice de dónde se saca el fichero. `soloGestor` marca lo que no
// existe todavía cuando el lote se manda al verificador.
//
// El ORDEN de esta lista es el orden del paquete. No es cosmético: es el orden en
// el que lo lee quien lo revisa.
const INDICE = [
    // El anexo del MITECO conserva SU nombre (lo genera /anexos-actuacion y así se
    // llama en los lotes ya presentados): no lleva el prefijo del índice.
    // Obligatorio SOLO en el paquete del gestor: para rellenarlo hacen falta el nº
    // de dictamen y su fecha, así que a la hora de subir a beCAE todavía no existe
    // y exigirlo bloquearía el paquete entero por un papel que no puede estar.
    { cod: null, etiqueta: 'Anexo de la actuación (MITECO)', obligatorioEn: ['gestor'], de: 'anexo_miteco', sinPrefijo: true,
      motivoExenta: 'todavía no existe: se rellena con el nº y la fecha del dictamen' },

    { cod: '1',   etiqueta: 'Convenio CAE con el Sujeto Obligado', obligatorio: true,  de: 'convenio_so',
      nombreDe: (ctx) => `CONVENIO CAE BROKERGY-${marcaSo(ctx.so)}` },
    { cod: '1-1', etiqueta: 'Anexo I · Listado de Cesión (lote)', obligatorio: true,  de: 'lote_doc', key: 'anexo_i',           nombre: 'ANEXO I LISTADO CESION_fdo', ambito: 'lote' },
    { cod: '1-2', etiqueta: 'Anexo Cesión de Ahorro del titular', obligatorio: true,  de: 'doc_exp',  campo: 'anexo_cesion_signed_link', nombre: 'ANEXO CESION AHORRO_fdo' },
    { cod: '2',   etiqueta: 'Dictamen favorable',                 obligatorio: true,  de: 'lote_doc', key: 'dictamen_favorable', nombre: 'DICTAMEN FAVORABLE', ambito: 'lote', soloGestor: true },

    { cod: '3-1', etiqueta: 'Ficha RES firmada por el S.O.',      obligatorio: true,  de: 'ficha_res',
      nombreDe: (ctx) => `Ficha ${fichaDe(ctx.exp.numero_expediente)}_fdo`,
      // Respaldo: es donde `guardarDocFirmado` deja las fichas que firma el S.O.
      // Hace falta para los lotes cuyo `documentos_so` se regeneró en un reenvío.
      respaldo: { carpeta: '10. EXPEDIENTE CAE', incluye: ['ficha'], sufijoFdo: true } },
    { cod: COD_RITE, etiqueta: 'Certificado RITE',                obligatorio: true,  de: 'doc_exp',  campo: 'cert_rite_drive_link',     nombre: 'CERTIFICADO RITE' },
    { cod: '3-3', etiqueta: 'Facturas de la obra (PDF único)',    obligatorio: true,  de: 'facturas', nombre: 'FACTURAS' },
    { cod: '3-4', etiqueta: 'Anexo fotográfico firmado',          obligatorio: true,  de: 'doc_exp',  campo: 'anexo_fotografico_signed_link', nombre: 'ANEXO FOTOGRAFICO_fdo' },
    { cod: '3-5', etiqueta: 'Certificado de fin de obra (CIFO)',  obligatorio: true,  de: 'cifo',
      // En un RES080 el mismo slot guarda el Certificado de Reforma, que es
      // otro documento y se llama por su nombre.
      nombreDe: (ctx) => fichaDe(ctx.exp.numero_expediente) === 'RES080'
          ? 'CERTIFICADO REFORMA RES080_fdo' : 'CERTIFICADO CIFO_fdo' },
    { cod: '3-6', etiqueta: 'CEE final · justificante de registro', obligatorio: true, de: 'cee', fase: 'final',   slot: 'registro', nombre: 'CEE FINAL_REG' },
    { cod: '3-7', etiqueta: 'CEE final · PDF firmado',            obligatorio: true,  de: 'cee', fase: 'final',   slot: 'pdf',      nombre: 'CEE FINAL_fdo' },
    { cod: '3-8', etiqueta: 'CEE final · XML',                    obligatorio: true,  de: 'cee', fase: 'final',   slot: 'xml',      nombre: 'CEE FINAL_XML', ext: '.xml' },
    { cod: '3-9', etiqueta: 'CEE final · etiqueta energética',    obligatorio: false, de: 'cee', fase: 'final',   slot: 'etiqueta', nombre: 'CEE FINAL_ETQ' },

    { cod: '4-1', etiqueta: 'Fichas técnicas de los equipos',     obligatorio: true,  de: 'fichas_tecnicas', nombre: 'FICHAS TECNICAS' },
    { cod: '4-2', etiqueta: 'CEE inicial · PDF firmado',          obligatorio: true,  de: 'cee', fase: 'inicial', slot: 'pdf',      nombre: 'CEE INICIAL_fdo' },
    // Solo BLOQUEA si consta que el CEE inicial se REGISTRÓ. Hay actuaciones cuyo
    // CEE inicial es una SIMULACIÓN —no se registra, así que no hay justificante que
    // pedir—: 5 de las 20 de los lotes con dictamen favorable van sin este fichero,
    // y las cinco obtuvieron dictamen favorable. La señal es la fecha de registro
    // del expediente, que es lo que se sella al subir el justificante (regla 27.c):
    // las dos cosas se mueven juntas, así que exigir el papel sin tener la fecha es
    // bloquear sobre una suposición. Sin ella se AVISA, que es lo que corresponde.
    { cod: '4-3', etiqueta: 'CEE inicial · justificante de registro', obligatorio: true, de: 'cee', fase: 'inicial', slot: 'registro', nombre: 'CEE INICIAL_REG',
      exenta: (ctx) => !ctx.doc?.fecha_registro_cee_inicial,
      motivoExenta: 'no consta fecha de registro del CEE inicial (¿es una simulación?)' },
    { cod: '4-4', etiqueta: 'CEE inicial · etiqueta energética',   obligatorio: false, de: 'cee', fase: 'inicial', slot: 'etiqueta', nombre: 'CEE INICIAL_ETQ' },
    { cod: '4-5', etiqueta: 'Anexo I firmado por el titular',     obligatorio: true,  de: 'doc_exp',  campo: 'anexo_i_signed_link', nombre: 'ANEXO I_fdo' },
    { cod: '4-6', etiqueta: 'CEE inicial · XML',                  obligatorio: true,  de: 'cee', fase: 'inicial', slot: 'xml',      nombre: 'CEE INICIAL_XML', ext: '.xml' },
    // Este papel NO es del proceso: se escribe para contestar a una inexactitud
    // concreta. Apareció UNA vez en las 20 actuaciones ya presentadas —LOTE-2025-003,
    // actuación 3, cuando el verificador objetó que el emisor de la factura no era
    // quien firmaba el certificado del instalador (el caso de la firma delegada ante
    // Industria, regla 26.b)—. Por eso va `soloSiExiste`: si está, entra en el
    // paquete; si no está, no se dice nada. Echarlo de menos en cada lote es mandar
    // a buscar un documento que no debería existir.
    // ⚠️ En LOTE-2026-004 el código 4-7 lo ocupa otro documento distinto
    // ("DECLARACION RESPONSABLE INVERSION"): el índice del gestor reutiliza ese hueco
    // para lo que haga falta responder.
    { cod: '4-7', etiqueta: 'Declaración responsable del instalador', obligatorio: false, soloSiExiste: true, de: 'suelto_lote', patron: 'declaracion_responsable_instalador', porExpediente: true, nombre: 'DECLARACION RESPONSABLE INSTALADOR' },

    // Los escritos del lote solo existen si hubo requerimiento. Van marcados como
    // NO obligatorios a propósito: se localizan por el nombre del fichero en la
    // carpeta del lote, y un fallo de esa búsqueda no puede parar el paquete.
    // Solo existe si hubo requerimiento (2 de los 4 lotes presentados), así que su
    // ausencia es lo normal y no se anuncia. La del HUSO sí: está en los tres últimos
    // lotes, o sea que ya es parte del envío, y que falte merece el aviso.
    { cod: '5-1', etiqueta: 'Escrito de respuesta al requerimiento', obligatorio: false, soloSiExiste: true, de: 'suelto_lote', patron: 'escrito de respuesta|informe respuesta|informe_subsanacion', nombre: 'ESCRITO DE RESPUESTA', ambito: 'lote', soloGestor: true },
    { cod: '5-2', etiqueta: 'Declaración responsable del huso',      obligatorio: false, de: 'suelto_lote', patron: 'declaracion_responsable_huso', nombre: 'DECLARACION RESPONSABLE HUSO_fdo', ambito: 'lote', soloGestor: true },
];

// ─── Las fichas técnicas del expediente, como las lleva el CIFO ──────────────
// Devuelve [{ driveId, excludedPages? }] en el orden final. Respaldo: si los
// módulos del frontend no se pueden cargar o el expediente no declara equipos, se
// barren los `ft_*_link` de `documentacion` — es lo que se hacía antes, y perder
// las fichas técnicas por no poder leer una preferencia sería peor que ignorarla.
async function anexosFichaTecnica(ctx) {
    const doc = ctx.doc || {};
    try {
        const { resolveAllFichaSlots, ftDocFields } = await loadFichasTecnicas();
        const { readAnnexPrefs, buildAnnexPayload } = await loadAnnexPrefs();
        // `resolveAllFichaSlots` = los huecos de la bomba de calor (uno por MODELO)
        // MÁS los del marco y el vidrio, que en un RES080 con sustitución de ventanas
        // también van dentro del certificado. Medido sobre el fichero presentado de
        // 26RES080_53: sus 55 páginas son las dos aerotermias, la memoria de
        // transmitancias, el marco, el vidrio y la lana mineral. Con solo la
        // aerotermia el documento suelto se quedaba en 6.
        const slots = resolveAllFichaSlots(ctx.exp);
        const tieneAcs = slots.some(sl => sl.cubreAcs);
        const attachments = [];
        for (const sl of slots) {
            const campos = ftDocFields(sl.type);
            const id = doc[campos.id] || driveIdDe(doc[campos.link]);
            if (id) attachments.push({ id: sl.id, label: sl.label, file: { driveId: id } });
        }
        // Y los anexos SUELTOS que se le añadieron al certificado a mano: en el
        // fichero presentado son fichas de materiales, así que forman parte de lo
        // que hay que entregar aparte.
        for (const ex of (Array.isArray(doc.cifo_extra_annexes) ? doc.cifo_extra_annexes : [])) {
            const id = ex.driveId || driveIdDe(ex.link);
            if (id) attachments.push({ id: `extra_${id}`, label: ex.label || 'Documento anexo', file: { driveId: id } });
        }
        const payload = buildAnnexPayload(attachments, readAnnexPrefs(doc), { tieneAcs });
        if (payload.length) return payload;
    } catch (e) {
        console.warn('[envioGestor] fichas técnicas por anexos del CIFO:', e.message);
    }
    const ids = [];
    for (const k of Object.keys(doc).sort()) {
        if (!/^ft_.*_link$/.test(k)) continue;
        const id = driveIdDe(doc[k]);
        if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.map(driveId => ({ driveId }));
}

// ─── Resolución de cada pieza ────────────────────────────────────────────────
// Devuelve { fileId } | { buffer, mime } | null. NUNCA lanza por una pieza que no
// esté: eso lo decide `obligatorio`, no una excepción.
async function resolverPieza(pieza, ctx) {
    const { exp, doc, lote, docsSo, so, driveFolderId, carpetaE, sueltosLote, n } = ctx;
    try {
        switch (pieza.de) {
            case 'anexo_miteco': {
                if (!carpetaE) return null;
                const files = await driveService.listFiles(carpetaE);
                const f = (files || []).find(x => new RegExp(`AnexoE${n}\\.pdf$`, 'i').test(x.name));
                return f ? { fileId: f.id, nombreLiteral: f.name } : null;
            }
            case 'convenio_so': {
                const id = driveIdDe(so?.convenio_cae_link);
                if (!id) return null;
                const marca = limpio(so?.acronimo || so?.razon_social || 'S.O.').toUpperCase();
                return { fileId: id, nombreLiteral: null, nombre: `CONVENIO CAE BROKERGY-${marca}` };
            }
            case 'lote_doc': {
                const d = (docsSo || []).find(x => x && x.key === pieza.key);
                // El firmado si lo hay; si no, el borrador (el dictamen no se firma).
                const id = driveIdDe(d?.signed_link) || driveIdDe(d?.draft_link) || d?.signed_file_id || d?.draft_file_id;
                return id ? { fileId: id } : null;
            }
            case 'ficha_res': {
                // La ficha que vale es la que FIRMÓ el S.O. en el lote; el
                // `ficha_res060_signed_link` del expediente es el respaldo de los
                // lotes anteriores a la firma en cadena.
                const d = (docsSo || []).find(x => x && x.key === `ficha_${exp.id}`);
                const id = driveIdDe(d?.signed_link) || d?.signed_file_id || driveIdDe(doc.ficha_res060_signed_link);
                return id ? { fileId: id, nombre: `Ficha ${fichaDe(exp.numero_expediente)}_fdo` } : null;
            }
            case 'doc_exp': {
                const id = driveIdDe(doc[pieza.campo]);
                return id ? { fileId: id } : null;
            }
            case 'facturas': {
                // `facturas_unificadas_link` es la clave que traen los expedientes
                // migrados; la que escribe la app hoy es `facturas_combined_link`.
                const id = driveIdDe(doc.facturas_combined_link) || driveIdDe(doc.facturas_unificadas_link);
                return id ? { fileId: id, nombre: 'FACTURAS' } : null;
            }
            case 'cifo': {
                const id = driveIdDe(doc.cert_cifo_signed_link);
                if (!id) return null;
                const esRes080 = fichaDe(exp.numero_expediente) === 'RES080';
                return { fileId: id, nombre: esRes080 ? 'CERTIFICADO REFORMA RES080_fdo' : 'CERTIFICADO CIFO_fdo' };
            }
            case 'cee': {
                const seccion = ctx.cee[pieza.fase] || {};
                const id = driveIdDe(seccion[pieza.slot]?.link);
                return id ? { fileId: id } : null;
            }
            case 'fichas_tecnicas': {
                // La ficha técnica va DOS veces al verificador: dentro del CIFO —como
                // anexo— y SUELTA, porque nos la piden además como documento externo.
                // Las dos tienen que ser LA MISMA: si el fichero suelto llevara otra
                // ficha, u otras páginas, la contradicción está en el mismo paquete.
                //
                // Así que se arma con la misma decisión que el bloque de anexos del
                // certificado: `resolveFichaSlots` dice QUÉ fichas lleva el expediente
                // (una por MODELO distinto, no una por hueco — regla 8.b) y
                // `buildAnnexPayload` las ORDENA, deduplica por fichero y aplica el
                // recorte de páginas que se dejó guardado en el gestor de anexos.
                const anexos = await anexosFichaTecnica(ctx);
                if (!anexos.length) return null;

                // Una sola, sin recorte, se copia tal cual: no hay nada que unir y
                // así el paquete conserva el fichero original de Drive.
                if (anexos.length === 1 && !(anexos[0].excludedPages || []).length) {
                    return { fileId: anexos[0].driveId, nombre: 'FICHAS TECNICAS' };
                }
                // En seco no se baja nada: la comprobación solo necesita saber que las
                // fichas ESTÁN. Pero armando el ZIP de verdad hay que unirlas — con el
                // atajo puesto, el paquete salía SIN las fichas técnicas y sin decirlo.
                if (ctx.dryRun && !ctx.zipEnMemoria) return { fusion: anexos.length, nombre: 'FICHAS TECNICAS' };
                const bufs = await fetchAnnexBuffers(anexos);
                const unido = await unirAnexos(bufs);
                if (!unido) return null;
                return { buffer: unido, mime: 'application/pdf', nombre: 'FICHAS TECNICAS' };
            }
            case 'suelto_lote': {
                // Documentos que viven sueltos en la carpeta del lote (los escritos y
                // las declaraciones responsables): se localizan por su nombre y se
                // prefiere el firmado (`_fdo`) cuando hay las dos versiones.
                const re = new RegExp(pieza.patron, 'i');
                let cand = (sueltosLote || []).filter(f => re.test(f.name.replace(/_/g, '_')));
                if (pieza.porExpediente) {
                    const num = String(exp.numero_expediente || '').replace(/[^A-Za-z0-9]/g, '');
                    cand = cand.filter(f => f.name.replace(/[^A-Za-z0-9]/g, '').includes(num));
                }
                if (!cand.length) return null;
                const fdo = cand.find(f => /_fdo\.pdf$/i.test(f.name));
                return { fileId: (fdo || cand[0]).id };
            }
            default:
                return null;
        }
    } catch (e) {
        console.warn(`[envioGestor] pieza ${pieza.cod || 'anexo'} (${exp?.numero_expediente}):`, e.message);
        return null;
    }
}

// ─── Respaldos en Drive ──────────────────────────────────────────────────────
// Un documento puede estar en Drive y no estar apuntado en la base de datos (un
// firmado que llegó por email y se guardó a mano, un expediente migrado). Regla
// 20: si Drive lo tiene, tiene que aparecer. Por eso cada pieza puede declarar
// dónde buscarse, y NUNCA se busca "algo parecido": se exige que el nombre
// contenga todas las palabras de `incluye` y ninguna de `excluye`.
async function buscarEnCarpeta(driveFolderId, respaldo) {
    if (!driveFolderId || !respaldo) return null;
    const sub = await driveService.findSubfolderByName(driveFolderId, respaldo.carpeta);
    if (!sub) return null;
    const files = (await driveService.listFiles(sub) || [])
        .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    const norm = (x) => String(x).toLowerCase();
    let cand = files.filter(f => {
        const nom = norm(f.name);
        if ((respaldo.incluye || []).some(w => !nom.includes(norm(w)))) return false;
        if ((respaldo.excluye || []).some(w => nom.includes(norm(w)))) return false;
        return true;
    });
    // Con `sufijoFdo` solo vale el FIRMADO: el borrador con el mismo nombre no
    // sirve de respaldo de un documento que el paquete necesita firmado.
    if (respaldo.sufijoFdo) cand = cand.filter(f => /_fdo\.pdf$/i.test(f.name));
    if (!cand.length) return null;
    return { fileId: cand[0].id, respaldo: true };
}

// Lo que YA está colocado en la carpeta del paquete con su código cuenta como
// presente. Es lo que hace que regenerar sea idempotente y —sobre todo— que el
// documento que alguien puso ahí a mano no desaparezca del ZIP por no estar
// apuntado en la base de datos.
async function piezaYaColocada(carpetas, pieza, n) {
    const prefijo = pieza.sinPrefijo ? null : `E${n}-${pieza.cod} `;
    for (const c of carpetas.filter(Boolean)) {
        const files = (await driveService.listFiles(c) || [])
            .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        const f = prefijo
            ? files.find(x => x.name.startsWith(prefijo) || x.name.startsWith(prefijo.trim() + ' -'))
            : files.find(x => new RegExp(`AnexoE${n}\\.pdf$`, 'i').test(x.name));
        if (f) return { fileId: f.id, nombreLiteral: f.name, yaColocada: true, carpeta: c };
    }
    return null;
}

// Nombre final del fichero dentro del paquete.
function nombreFinal(pieza, resuelto, ctx) {
    if (pieza.sinPrefijo) return limpio(resuelto.nombreLiteral || `${ctx.exp.numero_expediente} - AnexoE${ctx.n}`);
    // Lo que YA está en la carpeta con su código no se renombra: ese nombre es el
    // que el verificador ha visto en los lotes anteriores (con su "_rev1", su
    // "_fdo_fdo" y sus mayúsculas), y cambiarlo por el canónico solo generaría una
    // segunda copia del mismo papel con otro nombre.
    if (resuelto.yaColocada && resuelto.nombreLiteral
        && resuelto.nombreLiteral.startsWith(`E${ctx.n}-${pieza.cod} `)) {
        return limpio(resuelto.nombreLiteral);
    }
    const ext = pieza.ext || '.pdf';
    // El nombre lo decide la PIEZA, no quien la encontró: un documento que aparece
    // por el respaldo tiene que llamarse igual que si hubiera salido del expediente.
    const base = (pieza.nombreDe ? pieza.nombreDe(ctx) : null) || pieza.nombre || resuelto.nombre || pieza.etiqueta;
    const sujeto = pieza.ambito === 'lote' ? (ctx.lote.codigo || 'LOTE')
        : (pieza.de === 'convenio_so' ? null : ctx.exp.numero_expediente);
    const partes = [`E${ctx.n}-${pieza.cod}`, sujeto, base].filter(Boolean);
    return limpio(partes.join(' - ')) + ext;
}

// ─── ¿Esta pieza BLOQUEA? ────────────────────────────────────────────────────
// Tres respuestas, no dos, y la tercera es la que evita los falsos bloqueos:
//   · obligatoria → sin ella no se arma el paquete;
//   · leve        → avisa y se arma igual;
//   · NO PROCEDE  → este expediente no tiene por qué tenerla (`exenta`), así que no
//     cuenta como falta ni siquiera leve. Se DICE, con el motivo: un documento que
//     desaparece de la lista sin explicación se lee como un olvido.
//
// `obligatorioEn` acota la obligatoriedad a unos modos: el anexo del MITECO solo
// puede exigirse en el paquete del gestor.
function exigencia(pieza, modo, ctx) {
    // `soloSiExiste`: la pieza entra en el paquete si está, y si no está NO SE DICE.
    // Es para los papeles que solo nacen de un requerimiento: echarlos de menos en
    // todos los lotes es mandar a buscar algo que no debería existir, y un aviso que
    // sale siempre y nunca hay que atender es el que enseña a ignorar la lista.
    if (pieza.soloSiExiste) return 'silenciosa';
    if (typeof pieza.exenta === 'function') {
        try { if (pieza.exenta(ctx)) return 'no_procede'; } catch (_) { /* ante la duda, se exige */ }
    }
    // Una pieza que solo se exige en ciertos modos NO SE ESPERA en los demás: si
    // faltara, avisar de ella sería ruido en el único sitio donde hay que mirar.
    // El anexo del MITECO en el paquete de beCAE es exactamente ese caso.
    if (pieza.obligatorioEn) {
        return pieza.obligatorioEn.includes(modo) ? 'obligatoria' : 'no_procede';
    }
    return pieza.obligatorio ? 'obligatoria' : 'leve';
}

// ─── El paquete de UNA actuación ─────────────────────────────────────────────
async function paqueteDeActuacion(ctx, { modo, dryRun, zipEnMemoria = false }) {
    const { exp, n } = ctx;
    const piezas = INDICE.filter(p => modo === 'gestor' || !p.soloGestor);

    // Carpeta destino. En modo `expediente` es la propia "E{n}" del expediente (la
    // que ya usa el anexo del MITECO); en modo `gestor`, una copia completa dentro
    // de "{LOTE} - ENVIO GESTOR". Se resuelve ANTES de buscar las piezas porque es
    // uno de los sitios donde una pieza puede estar ya colocada.
    ctx.destino = (modo === 'gestor' && !zipEnMemoria)
        ? (ctx.carpetaGestor ? await driveService.getOrCreateSubfolder(ctx.carpetaGestor, `E${n}`) : null)
        : ctx.carpetaE;

    const resueltas = [];
    // Carpetas donde puede estar ya colocada una pieza: la del paquete que se está
    // armando y la "E{n}" del expediente (de donde salió el paquete anterior).
    const carpetasColocadas = [ctx.destino, ctx.carpetaE];
    for (const pieza of piezas) {
        let r = await resolverPieza(pieza, ctx);
        if (!r && pieza.respaldo) r = await buscarEnCarpeta(ctx.driveFolderId, pieza.respaldo);
        if (!r && pieza.cod !== null) r = await piezaYaColocada(carpetasColocadas, pieza, ctx.n);
        resueltas.push({ pieza, r, nombre: r ? nombreFinal(pieza, r, ctx) : null });
    }

    for (const x of resueltas) x.exigencia = exigencia(x.pieza, modo, ctx);
    const faltanObligatorias = resueltas.filter(x => !x.r && x.exigencia === 'obligatoria').map(x => x.pieza.etiqueta);
    const faltanLeves = resueltas.filter(x => !x.r && x.exigencia === 'leve').map(x => x.pieza.etiqueta);
    // 'silenciosa' no aparece en ninguna lista: ni falta, ni leve, ni "no procede".
    const noProceden = resueltas.filter(x => !x.r && x.exigencia === 'no_procede')
        .map(x => `${x.pieza.etiqueta} — ${x.pieza.motivoExenta || 'no procede en este expediente'}`);

    const salida = {
        n,
        expediente_id: exp.id,
        numero_expediente: exp.numero_expediente,
        ficha: fichaDe(exp.numero_expediente),
        // La pieza `silenciosa` que NO está no sale ni en el listado: si apareciera
        // como una fila más —aunque fuese en gris— seguiría siendo una línea que hay
        // que leer y descartar en cada lote. Encontrada sí sale, como cualquier otra.
        piezas: resueltas.filter(x => x.r || x.exigencia !== 'silenciosa').map(x => ({
            cod: x.pieza.cod, etiqueta: x.pieza.etiqueta, obligatorio: x.exigencia === 'obligatoria',
            // `manual` = estaba en la carpeta del paquete pero la app no lo tiene
            // apuntado. Cuenta como presente y se DICE: es lo que hay que registrar
            // en el expediente para que el siguiente lote no dependa de una copia.
            estado: !x.r ? (x.exigencia === 'no_procede' ? 'no_procede' : 'falta')
                : (x.r.yaColocada ? 'manual' : (x.r.respaldo ? 'drive' : 'ok')),
            nombre: x.nombre,
        })),
        faltan_obligatorias: faltanObligatorias,
        faltan_leves: faltanLeves,
        no_proceden: noProceden,
        n_ficheros: resueltas.filter(x => x.r).length,
        ok: faltanObligatorias.length === 0,
        carpeta_link: null,
        zip: null,
    };
    if (!salida.ok || (dryRun && !zipEnMemoria)) return salida;

    // Carpeta destino. En modo `expediente` es la propia "E{n}" del expediente (la
    // que ya usa el anexo del MITECO); en modo `gestor`, una copia completa dentro
    // de "{LOTE} - ENVIO GESTOR".
    // Armando el ZIP EN MEMORIA no hay destino: no se escribe en Drive, así que la
    // carpeta "E{n}" puede no existir todavía —y no existe en un lote que aún no ha
    // llegado a presentarse, que es justo el que se quiere comprobar.
    const destino = ctx.destino;
    if (!destino && !zipEnMemoria) throw new Error(`No se pudo preparar la carpeta E${n}`);

    const entradasZip = [];
    for (const x of resueltas) {
        if (!x.r) continue;

        // La pieza que YA está EN EL DESTINO con este mismo nombre no se toca: solo
        // se lee para el ZIP. Va ANTES del borrado del duplicado — si no, el
        // borrado se llevaría justo el fichero que se iba a reutilizar, que en un
        // documento colocado a mano puede ser la única copia.
        //
        // Se comprueba la CARPETA, no solo el nombre: en modo `gestor` la pieza casi
        // siempre está en la "E{n}" del expediente y desde allí SÍ hay que copiarla
        // al paquete del gestor. Comparando solo el nombre se colaba en el ZIP y no
        // llegaba nunca a la carpeta que se sube.
        if (x.r.yaColocada && x.r.carpeta === destino && x.nombre === x.r.nombreLiteral) {
            const b = await driveService.getFileContent(x.r.fileId);
            if (b && b.length) entradasZip.push({ name: x.nombre, data: b });
            continue;
        }

        // Modo de prueba (`zipEnMemoria`): se arma el ZIP de verdad —bajando los
        // ficheros y con sus nombres definitivos— pero no se escribe NADA en Drive.
        // Es lo que permite comprobar el paquete de un lote ya presentado sin tocar
        // una sola carpeta suya.
        if (zipEnMemoria) {
            const b = x.r.buffer || (x.r.fileId ? await driveService.getFileContent(x.r.fileId) : null);
            if (b && b.length) entradasZip.push({ name: x.nombre, data: b });
            continue;
        }

        // Reemplazar en vez de duplicar: Drive admite dos ficheros con el mismo
        // nombre, y en un paquete eso son dos versiones del mismo papel sin forma
        // de saber cuál mira el revisor. Se borra la anterior porque esto es una
        // COPIA: el original sigue en su carpeta.
        try {
            const previos = await driveService.findFilesByName(destino, x.nombre);
            for (const p of (previos || [])) await driveService.deleteFile(p);
        } catch (_) { /* no bloqueante */ }

        let bytes = x.r.buffer || null;
        if (x.r.fileId) {
            // El fichero se BAJA una vez (hace falta para el ZIP) y se COPIA en
            // Drive del lado del servidor: no se vuelve a subir el contenido.
            bytes = await driveService.getFileContent(x.r.fileId);
            await driveService.copyFile(x.r.fileId, destino, x.nombre);
        } else if (bytes) {
            await driveService.saveFileToFolder(destino, x.nombre, x.r.mime || 'application/pdf', bytes);
        }
        if (bytes && bytes.length) entradasZip.push({ name: x.nombre, data: bytes });
    }

    if (!zipEnMemoria) {
        try { salida.carpeta_link = await driveService.getWebViewLink(destino); } catch (_) { /* noop */ }
    }

    // El ZIP se guarda JUNTO a la carpeta E{n} (no dentro: si no, al regenerarlo se
    // incluiría a sí mismo). Nombre: "E{n}.zip" en el paquete del expediente y
    // "ActuacionE{n}.zip" en el del gestor, que es como lo espera el MITECO.
    if (entradasZip.length) {
        const zipName = modo === 'gestor' ? `ActuacionE${n}.zip` : `E${n}.zip`;
        const carpetaZip = modo === 'gestor' ? ctx.carpetaGestor : ctx.driveFolderId;
        const buf = crearZip(entradasZip);
        if (zipEnMemoria) {
            salida.zip = { nombre: zipName, link: null, bytes: buf.length, buffer: buf };
            return salida;
        }
        try {
            const previos = await driveService.findFilesByName(carpetaZip, zipName);
            for (const p of (previos || [])) await driveService.deleteFile(p);
        } catch (_) { /* no bloqueante */ }
        const saved = await driveService.saveFileToFolder(carpetaZip, zipName, 'application/zip', buf);
        salida.zip = { nombre: zipName, link: saved?.link || null, bytes: buf.length };
    }
    return salida;
}

/**
 * Arma el paquete de TODAS las actuaciones del lote.
 *
 * `soloActuacion` arma UNA sola (por su nº E{n}). Generar las cinco de un tirón
 * son varios minutos —~18 ficheros por actuación que se bajan, se copian y se
 * comprimen— y eso no cabe en el plazo de un proxy: se cortaba la respuesta y la
 * pantalla decía "no se pudo preparar el paquete" mientras el servidor seguía
 * escribiendo los ZIP y los terminaba. Pidiéndolas de una en una, cada petición
 * dura lo que dura una actuación y además se puede decir por dónde va.
 *
 * @param {string} loteId
 * @param {{ modo?: 'expediente'|'gestor', dryRun?: boolean, soloActuacion?: number, usuario?: string }} opts
 * @returns {Promise<object>} informe por actuación (nunca lanza por un expediente
 *          incompleto: lo devuelve en `bloqueados`).
 */
async function construirPaquete(loteId, { modo = 'expediente', dryRun = false, zipEnMemoria = false, soloActuacion = null, usuario = 'SISTEMA' } = {}) {
    const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', loteId).maybeSingle();
    if (error) throw error;
    if (!lote) throw new Error('Lote no encontrado');
    if (!lote.drive_folder_id) throw new Error('El lote no tiene carpeta de Drive');

    const { data: exps } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, documentacion, instalacion')
        .eq('lote_id', lote.id)
        .order('numero_expediente', { ascending: true });
    if (!exps || !exps.length) throw new Error('El lote no tiene expedientes');

    let so = null;
    if (lote.sujeto_obligado_id) {
        const { data } = await supabase.from('prescriptores')
            .select('razon_social, acronimo, convenio_cae_link, convenio_cae_nombre')
            .eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();
        so = data || null;
    }

    // Los documentos sueltos de la carpeta del lote (escritos, declaraciones
    // responsables) se listan UNA vez: son los mismos para las cinco actuaciones.
    let sueltosLote = [];
    try {
        sueltosLote = (await driveService.listFiles(lote.drive_folder_id) || [])
            .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    } catch (_) { sueltosLote = []; }

    const carpetaGestor = (modo === 'gestor' && !dryRun && !zipEnMemoria)
        ? await driveService.getOrCreateSubfolder(lote.drive_folder_id, CARPETA_GESTOR(lote.codigo))
        : null;

    const actuaciones = [];
    const bloqueados = [];
    for (const exp of exps) {
        const doc = exp.documentacion || {};
        const n = Number(exp.instalacion?.verificacion?.orden_actuacion) || null;
        if (!n) {
            bloqueados.push(`${exp.numero_expediente}: sin nº de actuación — registra antes los ahorros del informe de verificación`);
            continue;
        }
        // Pedida UNA actuación, las demás no se tocan ni se cuentan como bloqueadas:
        // no se ha intentado armarlas.
        if (soloActuacion && n !== Number(soloActuacion)) continue;
        const driveFolderId = await carpetaDeExpediente(exp);
        if (!driveFolderId) {
            bloqueados.push(`E${n} · ${exp.numero_expediente}: el expediente no tiene carpeta en Drive`);
            continue;
        }
        // "E{n}" del expediente: la crea /anexos-actuacion al dejar ahí su anexo.
        const carpetaE = dryRun
            ? await driveService.findSubfolderByName(driveFolderId, `E${n}`)
            : await driveService.getOrCreateSubfolder(driveFolderId, `E${n}`);

        const cee = {
            inicial: await scanCeeSection(driveFolderId, 'inicial'),
            final: await scanCeeSection(driveFolderId, 'final'),
        };
        const ctx = {
            exp, doc, lote, so, n, driveFolderId, carpetaE, carpetaGestor, dryRun, zipEnMemoria,
            docsSo: Array.isArray(lote.documentos_so) ? lote.documentos_so : [],
            sueltosLote, cee,
        };
        const r = await paqueteDeActuacion(ctx, { modo, dryRun, zipEnMemoria });
        actuaciones.push(r);
        if (!r.ok) {
            bloqueados.push(`E${n} · ${exp.numero_expediente}: falta ${r.faltan_obligatorias.join(', ')}`);
        }
    }

    let destinoLink = null;
    if (carpetaGestor) {
        try { destinoLink = await driveService.getWebViewLink(carpetaGestor); } catch (_) { /* noop */ }
    }

    return {
        modo,
        dryRun: !!dryRun,
        solo_actuacion: soloActuacion ? Number(soloActuacion) : null,
        codigo: lote.codigo,
        destino: modo === 'gestor'
            ? { nombre: CARPETA_GESTOR(lote.codigo), link: destinoLink }
            : { nombre: 'la carpeta E{n} de cada expediente', link: null },
        convenio_so: so?.convenio_cae_link ? (so.convenio_cae_nombre || 'Convenio CAE') : null,
        actuaciones,
        generados: actuaciones.filter(a => a.ok && !dryRun),
        bloqueados,
    };
}

module.exports = {
    INDICE,
    COD_RITE,
    CARPETA_GESTOR,
    fichaDe,
    construirPaquete,
};
