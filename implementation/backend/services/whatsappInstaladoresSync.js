/**
 * whatsappInstaladoresSync — la BBDD y WhatsApp, hablando del mismo instalador.
 *
 * Un instalador vive en dos sitios: su ficha en `prescriptores` y su chat en
 * WhatsApp. Hasta ahora no había nada que los uniera, así que en el móvil los
 * instaladores eran números sueltos mezclados con clientes, y la etiqueta
 * `INSTALADORES` la ponía alguien a mano cuando se acordaba (26 chats de 71
 * fichas el 09/09/2026).
 *
 * Esto lo cierra por los dos lados:
 *   · al dar de alta o editar un instalador, se etiqueta su chat solo;
 *   · y `sincronizar()` repasa toda la cartera para ponerse al día.
 *
 * ─── LAS TRES REGLAS QUE LO GOBIERNAN ────────────────────────────────────────
 *
 * REGLA — la etiqueta se AÑADE, nunca se sustituye la lista. `poner()` deja el
 * chat con exactamente las etiquetas que se le pasan, así que aquí siempre se
 * manda lo que ya tenía MÁS la nuestra. Un instalador puede estar además en
 * "EN CURSO" o "Pagado", que es trabajo de otra persona.
 *
 * REGLA — un nombre ya guardado en la agenda NO se toca (ver
 * `whatsappContactos.guardarSiFalta`). Solo se le pone nombre a quien entra
 * como número suelto.
 *
 * REGLA — esto NUNCA tumba lo que lo llamó. El alta de un instalador no puede
 * fallar porque WhatsApp esté desconectado: el enganche va en `setImmediate` y
 * traga sus errores. La ficha es el dato bueno; la etiqueta es una comodidad.
 *
 * ⚠️ Y el freno de siempre: esto habla con la sesión REAL de WhatsApp del VPS,
 * la misma de la que dependen el parte diario, los encargos al certificador y
 * la entrega de los CEE. Por eso va apagado por defecto (`WA_SYNC_INSTALADORES`)
 * y con pausa entre chats: una ráfaga de 90 operaciones contra ese Chrome es
 * justo lo que no conviene hacerle.
 */

const supabase = require('./supabaseClient');
const waLabels = require('./whatsappLabels');
const waContactos = require('./whatsappContactos');

const ETIQUETA = process.env.WA_SYNC_ETIQUETA_INSTALADORES || 'INSTALADORES';
const PAUSA_MS = Number(process.env.WA_SYNC_PAUSA_MS || 1500);
// El enganche automático del alta/edición. Apagado por defecto: en LOCAL
// tocaría la agenda del teléfono de verdad (mismo criterio que
// CEE_ENTREGA_AUTO y BOT_WHATSAPP_ENABLED).
const AUTO = process.env.WA_SYNC_INSTALADORES === 'true';
// Si la sesión se cae a mitad, no tiene sentido seguir llamando: se corta.
const FALLOS_SEGUIDOS_MAX = Number(process.env.WA_SYNC_FALLOS_MAX || 3);

const COLUMNAS = 'id_empresa, razon_social, es_autonomo, tipo_empresa, tlf, tlf_responsable, '
    + 'nombre_responsable, apellidos_responsable, contactos_notificacion';

const espera = (ms) => new Promise(r => setTimeout(r, ms));

/** Sin tildes y en minúsculas, para comparar nombres de etiqueta. */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Los 9 dígitos finales: es lo que identifica al mismo teléfono escrito de seis maneras. */
function nueveDigitos(tlf) {
    const d = String(tlf || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
}

/**
 * TODOS los teléfonos que constan de un instalador, con el nombre que le
 * correspondería en la agenda.
 *
 * Se incluyen los contactos de notificación porque en 20 de las 71 fichas el
 * teléfono por el que de verdad se habla con la obra es el del jefe de obra o
 * el de administración, no el de la empresa: etiquetar solo el principal
 * dejaría fuera justo el chat que usas.
 *
 * Se deduplica por los 9 dígitos y MANDA EL PRIMERO, que es el de la empresa:
 * si el responsable repite el teléfono de la empresa, el nombre que se guardaría
 * es la razón social, no la persona.
 */
function telefonosDeInstalador(p) {
    const razon = (p.razon_social || '').trim();
    const persona = [p.nombre_responsable, p.apellidos_responsable]
        .filter(Boolean).join(' ').trim();
    // La razón social va detrás del nombre de la persona, que es lo que hace
    // útil el contacto: "Jefe de obra" a secas, en una agenda con cientos de
    // números, no dice de qué obra ni de quién. Se calla cuando sería una
    // repetición — un autónomo, donde la persona ES la empresa.
    const coletilla = (nombre) => (!razon || norm(nombre) === norm(razon)) ? '' : `(${razon})`;

    const salida = [];
    const vistos = new Set();
    const añade = (tlf, nombre, apellido, origen) => {
        const nueve = nueveDigitos(tlf);
        if (!nueve || vistos.has(nueve)) return;
        if (!nombre) return;                      // sin nombre no hay nada que guardar
        vistos.add(nueve);
        salida.push({ nueve, e164: `34${nueve}`, nombre, apellido, origen });
    };

    añade(p.tlf, razon, '', 'empresa');
    if (persona) añade(p.tlf_responsable, persona, coletilla(persona), 'responsable');
    else añade(p.tlf_responsable, razon, '', 'responsable');

    for (const c of (Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion : [])) {
        const nombre = (c && c.nombre || '').trim() || razon;
        añade(c && c.tlf, nombre, coletilla(nombre), 'contacto');
    }
    return salida;
}

/** El id de la etiqueta configurada, buscándola por NOMBRE. */
async function idEtiqueta() {
    const etiquetas = await waLabels.listar();
    const hit = etiquetas.find(l => norm(l.name) === norm(ETIQUETA));
    if (!hit) {
        // No se puede crear desde aquí (WhatsApp no expone la creación de
        // etiquetas y la librería tiene rota toda esa familia), así que se dice
        // qué hay que hacer en vez de fallar con un id vacío.
        const e = new Error(`No existe la etiqueta "${ETIQUETA}" en WhatsApp. `
            + `Créala desde el móvil (Ajustes → Herramientas para empresas → Etiquetas) `
            + `o cambia WA_SYNC_ETIQUETA_INSTALADORES. Hay: ${etiquetas.map(l => l.name).join(', ')}`);
        e.datoInvalido = true;
        throw e;
    }
    return hit.id;
}

/**
 * Sincroniza UN teléfono: lo guarda en la agenda si hace falta y le añade la
 * etiqueta conservando las que ya tuviera.
 */
async function sincronizarTelefono(tel, labelId, { dryRun = false } = {}) {
    // Resuelve el id real del chat. Vale también para saber si ese número
    // tiene WhatsApp: si no lo tiene, `widDeTelefono` lanza.
    const chatId = await waLabels.widDeTelefono(tel.e164);
    const actuales = await waLabels.deChat(chatId);
    const contacto = await waContactos.datos(chatId);

    const faltaEtiqueta = !actuales.includes(String(labelId));
    const faltaNombre = !(contacto.enAgenda || contacto.nombre);

    if (dryRun) {
        return {
            chatId, accionEtiqueta: faltaEtiqueta ? 'añadiría' : 'ya_la_tenía',
            accionContacto: faltaNombre ? 'guardaría' : 'ya_estaba',
            nombreEnAgenda: contacto.nombre, etiquetasActuales: actuales,
        };
    }

    let accionContacto = 'ya_estaba';
    if (faltaNombre) {
        const r = await waContactos.guardarSiFalta(chatId, tel.e164, tel.nombre, tel.apellido);
        accionContacto = r.accion;
    }

    let accionEtiqueta = 'ya_la_tenía';
    if (faltaEtiqueta) {
        await waLabels.poner(chatId, [...actuales, String(labelId)]);
        accionEtiqueta = 'añadida';
    }

    return { chatId, accionEtiqueta, accionContacto, nombreEnAgenda: contacto.nombre, etiquetasActuales: actuales };
}

/**
 * Repasa la cartera de instaladores (o solo los `ids` que se pidan).
 *
 * `dryRun` recorre y consulta pero no escribe nada: es como se comprueba antes
 * de tocar la agenda de un teléfono de verdad.
 */
async function sincronizar({ dryRun = true, ids = null, pausaMs = PAUSA_MS } = {}) {
    const labelId = await idEtiqueta();

    let q = supabase.from('prescriptores').select(COLUMNAS).eq('tipo_empresa', 'INSTALADOR');
    if (ids && ids.length) q = q.in('id_empresa', ids);
    const { data, error } = await q;
    if (error) throw new Error(`No se han podido leer los instaladores: ${error.message}`);

    const informe = {
        etiqueta: ETIQUETA, labelId, dryRun,
        instaladores: data.length,
        telefonos: 0, etiquetados: 0, yaEtiquetados: 0,
        contactosGuardados: 0, sinTelefono: [], sinWhatsapp: [], errores: [], detalle: [],
    };

    let fallosSeguidos = 0;
    for (const p of data) {
        const telefonos = telefonosDeInstalador(p);
        if (!telefonos.length) {
            informe.sinTelefono.push(p.razon_social);
            continue;
        }
        for (const tel of telefonos) {
            informe.telefonos++;
            try {
                const r = await sincronizarTelefono(tel, labelId, { dryRun });
                fallosSeguidos = 0;
                if (r.accionEtiqueta === 'añadida' || r.accionEtiqueta === 'añadiría') informe.etiquetados++;
                else informe.yaEtiquetados++;
                if (r.accionContacto === 'guardado' || r.accionContacto === 'guardaría') informe.contactosGuardados++;
                informe.detalle.push({
                    instalador: p.razon_social, tlf: tel.e164, origen: tel.origen,
                    nombrePropuesto: [tel.nombre, tel.apellido].filter(Boolean).join(' '),
                    ...r,
                });
            } catch (err) {
                const fila = { instalador: p.razon_social, tlf: tel.e164, error: err.message };
                // "No tiene WhatsApp" es una respuesta, no una avería: se separa
                // para que no ensucie la lista de cosas que hay que mirar.
                if (/no tiene whatsapp/i.test(err.message)) informe.sinWhatsapp.push(fila);
                else informe.errores.push(fila);

                fallosSeguidos = err.plazoAgotado ? fallosSeguidos + 1 : 0;
                if (fallosSeguidos >= FALLOS_SEGUIDOS_MAX) {
                    informe.abortado = `${fallosSeguidos} tiempos de espera seguidos: la sesión de WhatsApp no responde. `
                        + 'Se corta para no seguir insistiendo; vuelve a lanzarlo cuando esté conectada.';
                    return informe;
                }
            }
            if (pausaMs) await espera(pausaMs);
        }
    }
    return informe;
}

/**
 * Enganche del alta/edición de un instalador. Se llama en `setImmediate` y
 * NUNCA lanza: si WhatsApp está caído, el instalador queda dado de alta igual y
 * la etiqueta la pondrá el siguiente repaso.
 */
function sincronizarEnDiferido(idEmpresa, { motivo = 'alta' } = {}) {
    if (!AUTO || !idEmpresa) return;
    setImmediate(async () => {
        try {
            const r = await sincronizar({ dryRun: false, ids: [idEmpresa] });
            console.log(`[wa-sync] Instalador ${idEmpresa} (${motivo}): `
                + `${r.etiquetados} etiquetados, ${r.contactosGuardados} contactos guardados, `
                + `${r.errores.length} errores.`);
        } catch (err) {
            console.warn(`[wa-sync] No se ha podido etiquetar al instalador ${idEmpresa}: ${err.message}`);
        }
    });
}

module.exports = {
    sincronizar, sincronizarEnDiferido, sincronizarTelefono,
    telefonosDeInstalador, idEtiqueta, ETIQUETA, AUTO,
};
