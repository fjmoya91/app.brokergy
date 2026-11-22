// ─── asistente.js — lo puro de la pantalla del asistente (fase 6) ────────────
// Sin React: lo prueba scripts/test_asistente_instalador.js.

/** La memoria que devuelve el servidor se FUNDE: una clave a null la borra. */
export function fundirMemoria(antes, ev) {
    const out = { ...(antes || {}) };
    for (const [k, v] of Object.entries(ev || {})) {
        if (v == null) delete out[k]; else out[k] = v;
    }
    return out;
}

/** El historial que se manda: solo texto, sin los turnos vacíos. */
export function historialPara(mensajes) {
    return (mensajes || []).filter((m) => (m.texto || '').trim()).map((m) => ({ role: m.role, content: m.texto }));
}

/** Lee una respuesta NDJSON línea a línea; cada línea, un evento. Un HTTP de error, una excepción con su `code`. */
export async function leerNdjson(promesa, onEvento = () => {}) {
    const r = await promesa;
    if (!r.ok) {
        let j = null;
        try { j = await r.json(); } catch { /* sin cuerpo */ }
        const err = new Error(j?.error || `HTTP ${r.status}`);
        err.status = r.status; err.code = j?.code || null;
        throw err;
    }
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let resto = '';
    const una = (l) => { if (l.trim()) { try { onEvento(JSON.parse(l)); } catch { /* línea rota: se ignora */ } } };
    for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split(/\r?\n/);
        resto = lineas.pop();
        lineas.forEach(una);
    }
    una(resto);
}
