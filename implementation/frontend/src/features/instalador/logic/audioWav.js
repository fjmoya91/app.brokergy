// ─── audioWav.js — la nota de voz del asistente, a WAV mono de 16 kHz ─────────
// El móvil graba en lo que sabe (webm/opus en Android, mp4/aac en el iPhone). Para
// que el servidor reciba SIEMPRE lo mismo, el navegador lo decodifica y lo vuelve a
// muestrear a 16 kHz mono, y lo manda como `audio/wav` (32 KB por segundo: dos
// minutos caben de sobra en los 8 MB de la ruta). Lo transcribe el backend.

/** ¿Se puede grabar aquí? (navegador con micrófono y MediaRecorder). */
export function grabadoraDisponible() {
    return typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator?.mediaDevices?.getUserMedia;
}

/** Muestras en coma flotante (−1…1) → un Blob WAV PCM de 16 bits. Puro: lo prueba el test. */
export function wavDe(muestras, hz = 16000) {
    const n = muestras.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE');
    txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
        const s = Math.max(-1, Math.min(1, muestras[i] || 0));
        v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
}

/** Lo grabado (cualquier formato que el navegador sepa leer) → WAV mono a `hz`. */
export async function aWav(blob, hz = 16000) {
    const bytes = await blob.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let audio;
    try {
        // Safari antiguo solo acepta las devoluciones de llamada.
        audio = await new Promise((ok, ko) => {
            const p = ctx.decodeAudioData(bytes, ok, ko);
            if (p && typeof p.then === 'function') p.then(ok, ko);
        });
    } finally { try { ctx.close(); } catch { /* */ } }
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(1, Math.max(1, Math.ceil(audio.duration * hz)), hz);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start(0);
    const hecho = await new Promise((ok, ko) => {
        off.oncomplete = (e) => ok(e.renderedBuffer);
        const p = off.startRendering();
        if (p && typeof p.then === 'function') p.then(ok, ko);
    });
    return wavDe(hecho.getChannelData(0), hz);
}
