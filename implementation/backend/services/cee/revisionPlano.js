// ─────────────────────────────────────────────────────────────────────────────
// «ASÍ ES COMO ESTÁ»: la revisión HUMANA del plano de la envolvente.
//
// POR QUÉ EXISTE. El CEE inicial lo prepara la IA con Catastro y las fotos, y
// quien conoce la vivienda ve a veces que el plano no es la realidad: un
// tabique que no está, una medianera que da a un patio, una ventana que no se
// ve en ninguna foto. Lo corrige en la PIZARRA del plano (ver
// `cee-envolvente/logic/pizarra.js`) y pulsa «✓ Así es como está». Desde ese
// momento el plano lo manda una persona, y lo que queda es que la IA REHAGA el
// CEE sobre él: midiendo lo que falte, sin volver a cambiar lo que se dibujó.
//
// Aquí se hace lo que ese botón significa, y nada más:
//   1. se SELLA la revisión —quién, cuándo, su nota y la lista de cambios en
//      palabras— en `cee.envolvente_revision` (clave aparte del trabajo: el
//      trabajo lo reemplaza entero el navegador cada 1,2 s);
//   2. se anota en el HISTORIAL del expediente;
//   3. al AGENTE IA, si es él quien preparó ese CEE, se le marca que tiene que
//      rehacerlo (`cee.agente_ia[fase].rehacer`) — lo dice su cola;
//   4. si se pide, se avisa a CLAUDE (el asistente del VPS) para que lo rehaga
//      ya, con una tarea que lleva el expediente, la fase y la nota.
//
// El trabajo NO se guarda aquí: lo guarda la ventana justo antes de llamar.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('../supabaseClient');
const cex = require('../ceeEnvolventeCex');

const CAMPO = 'envolvente_revision';
const MAX_CAMBIOS = 80;
const MAX_ANTERIORES = 10;

const recortar = (s, n) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v || ''));

/** La lista de cambios, saneada: solo texto, con tope (regla 21). */
function limpiarCambios(lista) {
    return (Array.isArray(lista) ? lista : []).slice(-MAX_CAMBIOS)
        .map(c => (typeof c === 'string' ? { texto: c } : c))
        .filter(c => c && c.texto)
        .map(c => ({ at: /^\d{4}-\d\d-\d\dT/.test(String(c.at || '')) ? String(c.at) : null,
                     texto: recortar(c.texto, 240) }));
}

/**
 * La TAREA que se le pasa a Claude. Va en palabras porque es lo que recibe: el
 * mismo texto que si Fran se lo escribiera por WhatsApp, con lo que ha
 * cambiado y lo que NO puede hacer.
 */
function textoParaClaude({ numero, origen, fase, nota, cambios, por = '' }) {
    const que = origen === 'op' ? `de la oportunidad ${numero}` : `del expediente ${numero}`;
    const quien = por && !/^(sistema|equipo|administrador)$/i.test(por) ? ` (lo ha hecho ${por})` : '';
    const lineas = [
        `Se ha corregido a mano el plano de la envolvente ${que} (CEE ${fase}) en la PIZARRA de la app`
        + `${quien} y se ha pulsado «Así es como está». Rehaz el CEE sobre esos cambios.`,
    ];
    if (nota) lineas.push(`Su nota: «${nota}».`);
    if (cambios.length) {
        lineas.push('Lo que ha cambiado:');
        for (const c of cambios.slice(-25)) lineas.push(`- ${c.texto}`);
        if (cambios.length > 25) lineas.push(`- … y ${cambios.length - 25} cambios más (en la revisión).`);
    } else {
        lineas.push('No ha dibujado cambios: da el plano por bueno tal y como está.');
    }
    lineas.push(
        `Usa la skill generar-cee-inicial: \`cee_inicial.js rehacer ${numero}\` (primero en seco, después --escribir). `
        + 'Lo dibujado a mano MANDA: no quites ni muevas lo que él ha puesto, no le cambies el tipo a una pared que '
        + 'ha tocado; lo que nace «por confirmar» (las ventanas y puertas dibujadas) mídelo con las fotos y ponle la '
        + 'medida con «medir» del plan. Cuando termines, dile qué has medido y qué no has podido.');
    return lineas.join('\n');
}

async function filaOportunidad(clave) {
    const { data } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, rev:datos_calculo->envolvente_cee->envolvente_revision')
        .eq(esUuid(clave) ? 'id' : 'id_oportunidad', clave)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data || null;
}

async function filaCee(tabla, clave) {
    const { data } = await supabase.from(tabla)
        .select('id, numero_expediente, rev:cee->envolvente_revision, agente_ia:cee->agente_ia')
        .eq(esUuid(clave) ? 'id' : 'numero_expediente', clave).maybeSingle();
    return data || null;
}

/** Una línea en el historial del negocio que toque. Nunca lanza. */
async function anotar(origen, id, texto, por) {
    try {
        if (origen === 'op') {
            // Dentro de `datos_calculo`, sin RPC: se relee justo antes de
            // escribir (mismo patrón que `anotarOportunidad` del Agente IA,
            // pero firmado por quien lo ha revisado).
            const { data } = await supabase.from('oportunidades')
                .select('datos_calculo').eq('id', id).maybeSingle();
            const dc = data?.datos_calculo || {};
            const hist = Array.isArray(dc.historial) ? dc.historial : [];
            hist.push({ id: `${Date.now()}_plano_revisado`, tipo: 'comentario', texto,
                        fecha: new Date().toISOString(), usuario: por || 'Sistema' });
            await supabase.from('oportunidades')
                .update({ datos_calculo: { ...dc, historial: hist } }).eq('id', id);
            return;
        }
        if (origen === 'cee') {
            await require('../ceeDirectoService').anotarHistorial(id, {
                tipo: 'COMENTARIO', usuario: por || 'Sistema', texto: texto.toUpperCase() });
            return;
        }
        const { data } = await supabase.from('expedientes').select('documentacion').eq('id', id).maybeSingle();
        const doc = data?.documentacion || {};
        const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
        historial.push({ id: `${Date.now()}_plano_revisado`, tipo: 'comentario', usuario: por || 'Sistema',
                         fecha: new Date().toISOString(), texto });
        await supabase.from('expedientes')
            .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e) {
        console.warn(`[revisionPlano] historial ${id}: ${e.message}`);
    }
}

/**
 * Registra «Así es como está».
 *
 * @returns {{ ok, revision, claude: { pedido, motivo? }, agente: boolean }}
 */
async function registrar({ clave, origen = 'cae', fase = 'inicial', nota = '', cambios = [],
                           por = '', avisarClaude = false }) {
    const o = cex.origenNorm(origen);
    const f = String(fase || '').toLowerCase() === 'final' ? 'final' : 'inicial';
    const fila = o === 'op' ? await filaOportunidad(clave)
        : await filaCee(o === 'cee' ? 'cee_directos' : 'expedientes', clave);
    if (!fila) {
        const e = new Error(o === 'op' ? 'Esa oportunidad no existe.' : 'Ese expediente no existe.');
        e.status = 404;
        throw e;
    }
    const numero = o === 'op' ? fila.id_oportunidad : fila.numero_expediente;
    const previa = fila.rev && typeof fila.rev === 'object' ? fila.rev : null;
    const ahora = new Date().toISOString();
    const lista = limpiarCambios(cambios);
    const notaLimpia = recortar(nota, 1000);

    const revision = {
        n: (Number(previa?.n) || 0) + 1,
        at: ahora, por: recortar(por, 80) || 'Sistema', fase: f,
        nota: notaLimpia || null,
        cambios: lista,
        estado: avisarClaude ? 'PEDIDO' : 'CONFIRMADO',
        claude: null, rehecho_at: null,
        // Las anteriores, en resumen: cuándo, quién y cuántos cambios. La lista
        // entera de cada una ya está en el historial del expediente.
        anteriores: [
            ...(Array.isArray(previa?.anteriores) ? previa.anteriores : []),
            ...(previa ? [{ n: previa.n, at: previa.at, por: previa.por,
                            cambios: (previa.cambios || []).length,
                            nota: previa.nota ? recortar(previa.nota, 160) : null }] : []),
        ].slice(-MAX_ANTERIORES),
    };

    // 4. Claude. Se pide ANTES de sellar para que el sello diga si llegó.
    let claude = { pedido: false };
    if (avisarClaude) {
        const { pedirTarea } = require('../asistenteCanal');
        const r = await pedirTarea({
            clave: `plano:${o}:${fila.id}:${f}`,
            texto: textoParaClaude({ numero, origen: o, fase: f, nota: notaLimpia, cambios: lista, por }),
            acuse: `Me pongo a rehacer el CEE ${f} de ${numero} con tus cambios del plano.`,
        });
        claude = r.ok ? { pedido: true, at: ahora } : { pedido: false, motivo: r.motivo };
        revision.claude = claude;
        if (!r.ok) revision.estado = 'CONFIRMADO';
    }

    // 1. El sello.
    const stub = { id: fila.id, es_cee_directo: o === 'cee', es_oportunidad: o === 'op' };
    await cex.setCeeField(stub, CAMPO, revision);

    // 2. El historial.
    const resumen = lista.length
        ? `${lista.length} ${lista.length === 1 ? 'cambio' : 'cambios'} dibujado${lista.length === 1 ? '' : 's'} a mano`
        : 'sin cambios dibujados';
    await anotar(o, fila.id,
        `✏️ Plano de la envolvente revisado a mano (CEE ${f}): «Así es como está» · ${resumen}`
        + (notaLimpia ? ` · Nota: ${recortar(notaLimpia, 300)}` : '')
        + (claude.pedido ? ' · Pedido a Claude que rehaga el CEE.' : ''), por);

    // 3. El Agente IA, si ese CEE es suyo.
    let agente = false;
    if (o !== 'op' && fila.agente_ia?.[f]) {
        try {
            const sello = { ...fila.agente_ia };
            sello[f] = { ...sello[f], rehacer: { at: ahora, por: revision.por, n: revision.n,
                                                 nota: notaLimpia ? recortar(notaLimpia, 300) : null } };
            await cex.setCeeField(stub, 'agente_ia', sello);
            agente = true;
        } catch (e) {
            console.warn(`[revisionPlano] agente ${numero}: ${e.message}`);
        }
    }

    return { ok: true, revision, claude, agente };
}

/**
 * Lo marca la skill cuando ha REHECHO el CEE sobre la revisión: la ventana
 * deja de decir «Claude lo está rehaciendo». Nunca lanza.
 */
async function marcarRehecho({ clave, origen = 'cae', fichero = null }) {
    try {
        const o = cex.origenNorm(origen);
        const fila = o === 'op' ? await filaOportunidad(clave)
            : await filaCee(o === 'cee' ? 'cee_directos' : 'expedientes', clave);
        if (!fila?.rev) return false;
        const stub = { id: fila.id, es_cee_directo: o === 'cee', es_oportunidad: o === 'op' };
        await cex.setCeeField(stub, CAMPO, { ...fila.rev, estado: 'REHECHO',
                                             rehecho_at: new Date().toISOString(),
                                             ...(fichero ? { fichero: recortar(fichero, 200) } : {}) });
        return true;
    } catch (e) {
        console.warn(`[revisionPlano] rehecho ${clave}: ${e.message}`);
        return false;
    }
}

/** La revisión vigente de un expediente, para quien la lea (la skill). */
async function leer({ clave, origen = 'cae' }) {
    const o = cex.origenNorm(origen);
    const fila = o === 'op' ? await filaOportunidad(clave)
        : await filaCee(o === 'cee' ? 'cee_directos' : 'expedientes', clave);
    return fila?.rev || null;
}

module.exports = { CAMPO, registrar, marcarRehecho, leer, textoParaClaude, limpiarCambios };
