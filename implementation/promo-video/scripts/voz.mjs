// Genera la voz en off con Gemini TTS: un WAV por segmento de src/locucion.js.
//   node scripts/voz.mjs                       → public/voz/<id>.wav con la voz de locucion.js
//   node scripts/voz.mjs --voz Sulafat --out out/voces/Sulafat   → para comparar voces
//   node scripts/voz.mjs --solo 4-ia           → rehace un segmento
// La clave: GEMINI_API_KEY del entorno o, si no, la del .env del backend del
// checkout principal. Nunca se imprime ni va a git.
import fs from 'fs';
import path from 'path';
import { ESTILO, MODELO_TTS, SEGMENTOS, VOZ } from '../src/locucion.js';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const MODELO = arg('modelo') || MODELO_TTS;
const OIDO = 'gemini-3.8-flash';
const estilo = arg('estilo') ?? ESTILO;
const voz = arg('voz') || VOZ;
const out = path.resolve(arg('out') || 'public/voz');
const solo = arg('solo');

function clave() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    for (const p of ['../backend/.env', 'C:/Proyectos/app.brokergy/implementation/backend/.env']) {
        if (!fs.existsSync(p)) continue;
        const m = fs.readFileSync(p, 'utf8').match(/^GEMINI_API_KEY=(.*)$/m);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
    throw new Error('Falta GEMINI_API_KEY');
}

/* Gemini devuelve PCM de 16 bits, mono, 24 kHz, sin cabecera. */
function wav(pcm, hz = 24000) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(hz, 24); h.writeUInt32LE(hz * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}

async function decir(texto, key) {
    for (let intento = 1; ; intento++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents: [{ parts: [{ text: estilo + texto }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
            }),
        });
        const j = await r.json();
        const b64 = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (b64) {
            // A veces lee también un trozo de la etiqueta de estilo («…como hablando con
            // un compañero») o repite la frase: se escucha la toma y se repite si sobra.
            const pcm = recortar(Buffer.from(b64, 'base64'));
            const oido = await escuchar(pcm, key);
            const sobra = palabras(oido) - palabras(texto);
            console.log(`  [${intento}] ${(pcm.length / 48000).toFixed(2)} s «${oido}»`);
            if (sobra <= 2 && sobra >= -4) return pcm;
            if (intento >= 6) throw new Error('El TTS no dice el texto limpio');
            continue;
        }
        if (intento >= 6 || ![429, 500, 503].includes(r.status)) throw new Error(`TTS ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
        // 429: pocas peticiones por minuto (se espera) y 100 al día por modelo en el
        // nivel 1 (cada toma son 1–4 peticiones; si se acaba, hasta mañana).
        if (JSON.stringify(j).includes('PerDay')) throw new Error(`Cuota diaria de ${MODELO} agotada (100 al día): mañana`);
        const espera = Math.min(90, Number(JSON.stringify(j).match(/"retryDelay":"(\d+)/)?.[1] || 10 * intento));
        console.log(`  ${r.status}, reintento en ${espera} s`);
        await new Promise(res => setTimeout(res, (espera + 1) * 1000));
    }
}

/* gemini-3.8-flash-tts mete un pitido corto (~0,1 s) al principio y al final,
   separado de la voz por un silencio. Se quitan esas «islas» cortas y se recorta
   el silencio, dejando 80 ms delante y 150 ms detrás (la última sílaba se apaga
   despacio) y un fundido de 10 ms a cada lado. */
function recortar(pcm, hz = 24000) {
    const m = pcm.length / 2, win = hz / 50; // ventanas de 20 ms
    const s = (i) => pcm.readInt16LE(i * 2);
    const act = [];
    for (let w = 0; w * win < m; w++) {
        let e = 0; const a = w * win, b = Math.min(m, a + win);
        for (let i = a; i < b; i++) e += s(i) ** 2;
        act.push(Math.sqrt(e / (b - a)) > 250);
    }
    const islas = [];
    act.forEach((on, w) => { if (!on) return; const u = islas.at(-1); if (u && w - u[1] <= 5) u[1] = w; else islas.push([w, w]); });
    const corta = ([a, b]) => b - a + 1 <= 12; // ≤ 240 ms
    if (islas.length > 1 && corta(islas[0])) islas.shift();
    if (islas.length > 1 && corta(islas.at(-1))) islas.pop();
    const ini = Math.max(0, islas[0][0] * win - hz * 0.08), fin = Math.min(m, (islas.at(-1)[1] + 1) * win + hz * 0.15);
    const outp = Buffer.from(pcm.subarray(ini * 2, fin * 2));
    const n = outp.length / 2, fade = hz / 100;
    for (let i = 0; i < fade; i++) {
        outp.writeInt16LE(Math.round(outp.readInt16LE(i * 2) * i / fade), i * 2);
        outp.writeInt16LE(Math.round(outp.readInt16LE((n - 1 - i) * 2) * i / fade), (n - 1 - i) * 2);
    }
    return outp;
}

/* Gemini (texto) transcribe la toma, para saber si ha dicho solo lo que tocaba. */
async function escuchar(pcm, key) {
    for (let intento = 1; ; intento++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${OIDO}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({ contents: [{ parts: [
                { inlineData: { mimeType: 'audio/wav', data: wav(pcm).toString('base64') } },
                { text: 'Transcribe literalmente este audio en español. Devuelve solo el texto, sin comentarios.' },
            ] }] }),
        });
        const j = await r.json();
        if (r.ok) return (j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '').trim();
        if (intento >= 4) throw new Error(`Transcripción ${r.status}`);
        await new Promise(res => setTimeout(res, 15000 * intento));
    }
}
const palabras = (t) => t.toLowerCase().replace(/\bpunto\b/g, ' ').replace(/ce ?3 ?x|ce tres equis/g, 'cex').replace(/c\.? ?e\.? ?e\.?|ce, e, e,?/g, 'cee').split(/[^a-z0-9áéíóúñü]+/).filter(Boolean).length;

const key = clave();
fs.mkdirSync(out, { recursive: true });
/* Lo que dura cada segmento ya recortado: con esto Promo.jsx reparte los tiempos. */
const fDur = path.join(out, 'duraciones.json');
const duraciones = (fs.existsSync(fDur) && JSON.parse(fs.readFileSync(fDur, 'utf8')).segundos) || {};
for (const s of SEGMENTOS) {
    if (solo && s.id !== solo) continue;
    const pcm = await decir(s.texto, key);
    fs.writeFileSync(path.join(out, `${s.id}.wav`), wav(pcm));
    duraciones[s.id] = Math.round(pcm.length / 48) / 1000;
    console.log(`${voz} ${s.id}: ${duraciones[s.id].toFixed(2)} s`);
    fs.writeFileSync(fDur, JSON.stringify({ voz, modelo: MODELO, segundos: duraciones }, null, 2) + '\n');
}
