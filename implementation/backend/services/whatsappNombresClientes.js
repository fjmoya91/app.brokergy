/**
 * whatsappNombresClientes — el nombre del cliente en la AGENDA, con su nº de obra.
 *
 * "RES080 Irene Lopez (Gonzagarri)" pasa a "RES080_87 Irene Lopez (Gonzagarri)":
 * con expediente, su número; sin él, su oportunidad (RES060_OP246). La decisión
 * es de `utils/nombreContactoCliente`; aquí se lee la agenda, se casa cada
 * contacto con su cliente y se escribe.
 *
 * ─── REGLAS ───────────────────────────────────────────────────────────────────
 *
 * REGLA — es la EXCEPCIÓN a `guardarSiFalta`. Allí un nombre ya guardado no se
 * toca nunca; aquí se toca SOLO el prefijo que la propia casa escribe delante
 * ("RES080 ", "CEE ") y lo de detrás se conserva letra a letra. Un contacto sin
 * ese prefijo no se renombra.
 *
 * REGLA — se casa por TELÉFONO contra el titular, su persona de contacto y sus
 * copropietarios (el contacto guardado es muchas veces el hijo que lleva la
 * obra). Un número que está en VARIOS clientes no se toca: se dice.
 *
 * REGLA — con varias obras posibles del mismo cliente, se desempata por la
 * ficha que ya dice el nombre; si aun así quedan varias, se pregunta.
 *
 * ⚠️ Habla con la sesión REAL del VPS: `dryRun` por defecto, a TROZOS (nginx
 * corta al minuto), con pausa entre contactos, y se corta tras varios tiempos de
 * espera seguidos. Nada de `getChatById`/`sendSeen` (regla 39).
 */

const supabase = require('./supabaseClient');
const whatsappService = require('./whatsappService');
const contactos = require('./whatsappContactos');
const { _conPlazo: conPlazo } = require('./whatsappLabels');
const { cargarRelaciones } = require('./clientesRelaciones');
const { leerPrefijo, obraDelContacto, nombreNuevo } = require('../utils/nombreContactoCliente');

const PAUSA_MS = Number(process.env.WA_SYNC_PAUSA_MS || 1500);
const FALLOS_SEGUIDOS_MAX = Number(process.env.WA_SYNC_FALLOS_MAX || 3);
const LIMITE = Number(process.env.WA_SYNC_LIMITE || 12);
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const nueve = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

/** Contactos de la agenda con prefijo de la casa: [{ numero, nombre }]. UNA evaluación. */
async function agendaConPrefijo() {
    const client = whatsappService.getClient?.();
    if (!client) {
        const e = new Error('WhatsApp no está conectado. Conéctalo desde el panel y vuelve a intentarlo.');
        e.datoInvalido = true;
        throw e;
    }
    const todos = await conPlazo(client.pupPage.evaluate(() => {
        const C = window.require('WAWebCollections');
        // Solo @c.us: el mismo contacto aparece también bajo su @lid, y el
        // guardado va por número, así que con uno basta.
        return C.Contact.getModelsArray()
            .filter(c => c.name && (c.isAddressBookContact || c.isMyContact) && c.id?.server === 'c.us')
            .map(c => ({ numero: c.id.user, nombre: c.name }));
    }), 30_000, 'leer la agenda');
    return todos.filter(c => leerPrefijo(c.nombre));
}

/** Índice teléfono (9 dígitos) → clientes que lo tienen. */
async function indiceTelefonos() {
    const { data, error } = await supabase.from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, tlf, persona_contacto_tlf, copropietarios');
    if (error) throw new Error(`No se han podido leer los clientes: ${error.message}`);
    const idx = new Map();
    for (const c of data || []) {
        const vias = [['titular', c.tlf], ['persona de contacto', c.persona_contacto_tlf],
            ...(Array.isArray(c.copropietarios) ? c.copropietarios.map(x => ['copropietario', x?.tlf]) : [])];
        const vistos = new Set();
        for (const [via, t] of vias) {
            const n = nueve(t);
            if (!n || vistos.has(n)) continue;
            vistos.add(n);
            if (!idx.has(n)) idx.set(n, []);
            idx.get(n).push({ ...c, via });
        }
    }
    return idx;
}

/** El plan entero: qué contacto pasa a llamarse cómo. No escribe nada. */
async function planificar({ agenda: dada, incluirCambioFicha = false } = {}) {
    // `agenda` inyectable: así se prueba el plan con una copia leída de la agenda real.
    const agenda = dada ? dada.filter(c => leerPrefijo(c.nombre)) : await agendaConPrefijo();
    const idx = await indiceTelefonos();

    const informe = {
        contactos: agenda.length, cambios: [], revisar: [], yaAlDia: 0,
        sinCliente: [], variosClientes: [], sinObra: [], ambiguos: [],
    };
    const porCasar = [];
    for (const c of agenda) {
        const clis = idx.get(nueve(c.numero)) || [];
        if (!clis.length) { informe.sinCliente.push({ nombre: c.nombre, tlf: c.numero }); continue; }
        if (clis.length > 1) {
            informe.variosClientes.push({ nombre: c.nombre, tlf: c.numero,
                clientes: clis.map(x => `${x.nombre_razon_social || ''} ${x.apellidos || ''}`.trim()) });
            continue;
        }
        porCasar.push({ ...c, cliente: clis[0] });
    }
    const rel = await cargarRelaciones([...new Set(porCasar.map(c => c.cliente.id_cliente))], { internos: true });
    for (const c of porCasar) {
        const { ficha } = leerPrefijo(c.nombre);
        const obra = obraDelContacto(rel.get(c.cliente.id_cliente), ficha);
        const cli = `${c.cliente.nombre_razon_social || ''} ${c.cliente.apellidos || ''}`.trim();
        if (!obra) { informe.sinObra.push({ nombre: c.nombre, tlf: c.numero, cliente: cli }); continue; }
        if (obra.ambiguo) { informe.ambiguos.push({ nombre: c.nombre, tlf: c.numero, cliente: cli, obras: obra.ambiguo }); continue; }
        const nuevo = nombreNuevo(c.nombre, obra.codigo);
        if (!nuevo || nuevo === c.nombre) { informe.yaAlDia++; continue; }
        const cambio = { tlf: c.numero, antes: c.nombre, despues: nuevo, cliente: cli, via: c.cliente.via, origen: obra.origen };
        // Si el nombre dice RES080 y la única obra de ese cliente es un RES060,
        // o está mal casado (el teléfono es de OTRA persona de la ficha) o la
        // obra se reclasificó. Eso lo decide una persona: no entra por defecto.
        const cambiaFicha = ficha !== 'CEE' && !obra.codigo.startsWith(ficha);
        if (cambiaFicha && !incluirCambioFicha) informe.revisar.push({ ...cambio, motivo: `el nombre dice ${ficha}` });
        else informe.cambios.push(cambio);
    }
    // Orden por TELÉFONO: es el cursor con el que se sigue a trozos.
    informe.cambios.sort((a, b) => a.tlf.localeCompare(b.tlf));
    informe.revisar.sort((a, b) => a.despues.localeCompare(b.despues));
    return informe;
}

/**
 * Renombra a trozos. `despuesDe` = último teléfono ya tratado (cursor); devuelve
 * `siguiente` hasta que es null. Un cursor y no un índice: lo ya renombrado sale
 * del plan en la vuelta siguiente y un índice se saltaría contactos.
 * En seco devuelve el plan entero de una vez.
 */
async function renombrar({ dryRun = true, despuesDe = null, incluirCambioFicha = false,
    limite = LIMITE, pausaMs = PAUSA_MS } = {}) {
    const plan = await planificar({ incluirCambioFicha });
    const informe = { ...plan, dryRun, renombrados: 0, errores: [], siguiente: null };
    if (dryRun) return informe;

    let fallosSeguidos = 0;
    const pendientes = plan.cambios.filter(c => !despuesDe || c.tlf > despuesDe);
    const tanda = pendientes.slice(0, limite);
    informe.pendientes = pendientes.length;
    for (const c of tanda) {
        try {
            await contactos.guardar(c.tlf, c.despues, '');
            fallosSeguidos = 0;
            informe.renombrados++;
        } catch (err) {
            informe.errores.push({ tlf: c.tlf, antes: c.antes, error: err.message });
            fallosSeguidos = err.plazoAgotado ? fallosSeguidos + 1 : 0;
            if (fallosSeguidos >= FALLOS_SEGUIDOS_MAX) {
                informe.abortado = `${fallosSeguidos} tiempos de espera seguidos: la sesión de WhatsApp no responde.`;
                return informe;
            }
        }
        if (pausaMs) await espera(pausaMs);
    }
    informe.siguiente = pendientes.length > tanda.length ? tanda[tanda.length - 1].tlf : null;
    return informe;
}

module.exports = { planificar, renombrar };
