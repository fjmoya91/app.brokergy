/**
 * RecibidoCobroView — /cobro/:expedienteId/recibido?token=
 *
 * La página del RECORDATORIO que sale a los 2 días hábiles de la carta de pago
 * (24/10/2026): un flujo cerrado para que el cliente acabe contento y deje reseña.
 *   1. ¿Te ha llegado el ingreso? — «Sí» / «Todavía no» (avisa al equipo).
 *   2. La reseña en Google, con el porqué (textoPeticionResena).
 *   3. Su documentación: el portal, con la guía para la Renta.
 *
 * DISEÑO (24/10/2026): el registro de la CARTA DE PAGO que el cliente acaba de recibir
 * (crema, tinta, tarjetas blancas, Antonio + Inter, filete de eficiencia naranja→verde,
 * banda lima en UNA palabra), no el CRM oscuro. Un paso protagonista a la vez: al abrir,
 * el importe y «¿Te ha llegado?»; tras «Sí», un check que se dibuja y la reseña delante.
 * Sin emojis: iconos SVG de trazo. Móvil primero (390 px), toques de 48 px.
 *
 * REGLA — la reseña NO es la llave de los documentos (Google lo prohíbe y son
 * suyos): la documentación está SIEMPRE a la vista, debajo.
 *
 * REGLA — la API se pide en RELATIVO: la abre el cliente con el MÓVIL desde un
 * WhatsApp (mismo motivo que ConfirmarCobroView).
 *
 * /cobro/demo/recibido — con datos de MENTIRA, sin llamar a la API.
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { eurEs, textoPeticionResena } from '../logic/cobroForm';

const API = '/api/public';
const DEMO = 'demo';

const vistaDemo = () => ({
    numero_expediente: '26RES060_000',
    saludo: 'María',
    tercero: false,
    importe: 3030.62,
    fecha_transferencia: '2026-10-22',
    cuentas: ['1234'],
    carta: 'CP-2026-0001',
    recepcion: null,
    resena_declarada: false,
    resena: { url: 'https://search.google.com/local/writereview?placeid=ChIJW00n1QqKXGMRLwQXmfKJU-U', ...textoPeticionResena() },
    portal: '/portal',
    familias_cobradas: 120,
});

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'AAAA-MM-DD' o ISO → «22 de octubre de 2026» (sin pasar por Date: nada de husos). */
const fechaLarga = (v) => {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const mes = MESES[Number(s.slice(5, 7)) - 1];
    return mes ? `${Number(s.slice(8, 10))} de ${mes} de ${s.slice(0, 4)}` : null;
};

/** «3.030,62 €» → ['3.030', ',62 €']: los euros en grande y los céntimos más pequeños. */
const partesImporte = (n) => {
    const t = eurEs(n);
    const i = t.lastIndexOf(',');
    return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i)];
};

const reduceMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/* ── Estilos: el registro de la carta de pago ─────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.rc{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.rc *{box-sizing:border-box}
.rc-filete-top{height:4px;background:var(--filete)}
.rc-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.rc-col{position:relative;max-width:440px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.rc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.rc-logo{height:26px;width:auto;display:block}
.rc-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em}
.rc-hola{font-size:15px;color:var(--gris);margin:0 2px}
.rc-stack > .rc-hola + *{margin-top:12px}
.rc-hola b{color:var(--tinta);font-weight:600}
.rc-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden}
.rc-stack > * + *{margin-top:14px}
.rc-pad{padding:22px 20px}
.rc-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.rc-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.rc-chip-verde{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.rc-chip-lima{background:var(--lima);color:var(--tinta);padding:0 10px}
.rc-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.rc-importe{font-size:76px;line-height:.95;margin:14px 0 0;display:flex;align-items:baseline;white-space:nowrap}
.rc-cent{font-size:36px;margin-left:2px}
.rc-meta{margin:12px 0 0;font-size:14px;color:var(--gris);line-height:1.5}
.rc-meta b{color:var(--tinta);font-weight:600}
.rc-filas{margin:16px 0 0;border-top:1px solid var(--linea)}
.rc-fila{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--linea);font-size:14px}
.rc-fila:last-child{border-bottom:0}
.rc-fila dt{color:var(--gris)}
.rc-fila dd{margin:0;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.rc-filete{height:6px;background:var(--filete)}
.rc-pregunta{padding:22px 20px 20px;border-top:1px solid var(--linea);background:linear-gradient(180deg,#fff, #fffdf8)}
.rc-h1{font-size:42px;line-height:1.2;margin:0}
.rc-h2{font-size:30px;line-height:1.05;margin:0}
.rc-h3{font-size:24px;line-height:1.08;margin:0}
.rc-mark{display:inline-block;line-height:1.02;background:var(--lima);padding:.04em .1em 0;border-radius:5px;white-space:nowrap;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.rc-sub{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.rc-btns{display:grid;gap:10px;margin-top:18px}
.rc-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,filter .2s ease}
.rc-btn:active{transform:scale(.98)}
.rc-btn:disabled{opacity:.55;cursor:default;transform:none}
.rc-btn:focus-visible,.rc-link:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.rc-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.rc-btn-pri:hover{filter:brightness(1.04)}
.rc-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.rc-btn-sec:hover{border-color:rgba(20,17,17,.3)}
.rc-btn-tinta{background:var(--tinta);color:#fff;min-height:54px;font-size:15.5px}
.rc-btn-tinta:hover{background:#2a2626}
.rc-link{appearance:none;background:none;border:0;cursor:pointer;min-height:44px;padding:0 4px;font:600 14.5px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px}
.rc-link:disabled{opacity:.55}
.rc-nota{font-size:13px;color:var(--gris2);text-align:center;margin:12px 0 0;line-height:1.5}
/* confirmado */
.rc-ok{display:flex;align-items:center;gap:16px}
.rc-ok-txt{min-width:0}
.rc-ok-tit{font-size:34px;line-height:1;margin:10px 0 0;white-space:nowrap}
.rc-ok-tit2{display:block;font-size:24px;line-height:1.15;margin-top:4px}
.rc-ok-sub{font-size:13.5px;color:var(--gris);margin:6px 0 0}
.rc-check{flex:none;width:60px;height:60px}
.rc-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:rc-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.rc-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:rc-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.rc-check svg{display:block;animation:rc-pop .45s cubic-bezier(.2,1.4,.4,1) .55s both}
/* reseña */
.rc-res-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.rc-stars{display:flex;gap:3px;color:var(--naranja)}
.rc-cuerpo{font-size:15.5px;line-height:1.6;color:#3b3e45;margin:12px 0 0}
.rc-prueba{display:flex;align-items:center;gap:12px;margin:16px 0 0;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:14px;line-height:1.45;color:#3b3e45}
.rc-prueba b{color:var(--tinta);font-weight:700}
.rc-prueba-ico{flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:rgba(177,209,62,.2);color:var(--verde-txt)}
.rc-res-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}
.rc-res-pie span{font-size:13px;color:var(--gris2)}
.rc-gracias{display:flex;align-items:flex-start;gap:14px;margin-top:2px}
.rc-gracias-ico{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:rgba(177,209,62,.2);color:var(--verde-txt)}
.rc-gracias p{margin:0;font-size:15px;color:var(--gris);line-height:1.5}
/* todavía no */
.rc-ambar{margin-top:2px;padding:16px;border-radius:18px;background:#fff7e6;border:1px solid #f6dca4}
.rc-ambar-top{display:flex;gap:12px;align-items:flex-start}
.rc-ambar-ico{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#ffe9bd;color:#7a4b00}
.rc-ambar h2{margin:2px 0 0;font-size:16px;font-weight:700;color:#3d2a00}
.rc-ambar p{margin:6px 0 0;font-size:14.5px;line-height:1.55;color:#5c4100}
/* documentación */
.rc-doc-top{display:flex;gap:14px;align-items:center}
.rc-doc-ico{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.rc-lista{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:10px}
.rc-lista li{display:flex;align-items:center;gap:10px;font-size:14.5px;color:#3b3e45}
.rc-lista svg{flex:none;color:var(--verde-txt)}
/* firma */
.rc-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.rc-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.rc-firma b{display:block;font-size:15px;font-weight:700}
.rc-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.rc-firma span + span{margin-top:0}
.rc-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
/* esqueleto */
.rc-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:rc-shim 1.3s linear infinite;border-radius:24px}
.rc-spin{animation:rc-rot .8s linear infinite}
/* entradas */
.rc-in{animation:rc-up .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes rc-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes rc-draw{to{stroke-dashoffset:0}}
@keyframes rc-pop{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes rc-shim{to{background-position:-200% 0}}
@keyframes rc-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.rc-importe{font-size:64px}.rc-cent{font-size:30px}.rc-h1{font-size:34px}.rc-h2{font-size:27px}}
@media (min-width:768px){.rc-col{padding-top:40px}.rc-pad{padding:26px 26px}.rc-pregunta{padding:24px 26px 24px}}
@media (prefers-reduced-motion:reduce){
  .rc-in,.rc-check svg,.rc-sk,.rc-spin{animation:none}
  .rc-check circle,.rc-check path{animation:none;stroke-dashoffset:0}
  .rc-btn{transition:none}
}
`;

/* ── Iconos (trazo, 24×24) ─────────────────────────────────────────────────── */

const Ico = ({ d, size = 20, sw = 2, children, ...p }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
        {d ? <path d={d} /> : children}
    </svg>
);
const IcoCheck = (p) => <Ico d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
const IcoFlecha = (p) => <Ico d="M5 12h14M13 6l6 6-6 6" {...p} />;
const IcoExterna = (p) => <Ico {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Ico>;
const IcoReloj = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>;
const IcoCarpeta = (p) => <Ico {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><path d="M3 10h18" /></Ico>;
const IcoFamilias = (p) => <Ico {...p}><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Ico>;
const IcoCorazon = (p) => <Ico {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></Ico>;
const Estrella = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" />
    </svg>
);
const Spinner = () => (
    <svg className="rc-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** El check que se DIBUJA: primero el círculo, luego la palomita (CSS, sin librerías). */
const CheckDibujado = () => (
    <div className="rc-check">
        <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
            <circle cx="30" cy="30" r="26.5" pathLength="100" />
            <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
        </svg>
    </div>
);

/* ── Piezas ────────────────────────────────────────────────────────────────── */

function Marco({ children, numero }) {
    return (
        <div className="rc">
            <style>{CSS}</style>
            <div className="rc-filete-top" />
            <div className="rc-halo" />
            <main className="rc-col">
                <header className="rc-head">
                    <img className="rc-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="rc-exp" aria-label={`Expediente ${numero}`}>{numero}</span>}
                </header>
                {children}
            </main>
        </div>
    );
}

function Firma() {
    return (
        <footer>
            <div className="rc-firma">
                <img className="rc-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                <div>
                    <b>Fran Moya</b>
                    <span>CEO de BROKERGY</span>
                    <span>Ingeniero colegiado nº 1779 · COGITI</span>
                </div>
            </div>
            <p className="rc-pie">BROKERGY · Ingeniería Energética</p>
        </footer>
    );
}

function PruebaSocial({ n }) {
    if (!(Number(n) > 0)) return null;
    return (
        <div className="rc-prueba">
            <span className="rc-prueba-ico"><IcoFamilias size={19} /></span>
            <span>Más de <b>{Number(n).toLocaleString('es-ES')} familias</b> ya han cobrado su Bono CAE con BROKERGY.</span>
        </div>
    );
}

export function RecibidoCobroView({ expedienteId, token }) {
    const demo = expedienteId === DEMO;
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [enviando, setEnviando] = useState(null);
    const resenaRef = useRef(null);
    const recienRespondido = useRef(false);

    // La página es CLARA: el body de la app es oscuro y asomaría al estirar el scroll.
    useEffect(() => {
        const b = document.body.style;
        const prev = { bg: b.background, color: b.color, scheme: document.documentElement.style.colorScheme };
        const meta = document.querySelector('meta[name="theme-color"]');
        const prevMeta = meta?.getAttribute('content');
        b.background = '#faf9f7';
        b.color = '#141111';
        document.documentElement.style.colorScheme = 'light';
        meta?.setAttribute('content', '#faf9f7');
        return () => {
            b.background = prev.bg;
            b.color = prev.color;
            document.documentElement.style.colorScheme = prev.scheme;
            if (meta && prevMeta != null) meta.setAttribute('content', prevMeta);
        };
    }, []);

    useEffect(() => {
        if (demo) { setInfo(vistaDemo()); return; }
        axios.get(`${API}/cobro/${expedienteId}/recibido?token=${encodeURIComponent(token || '')}`)
            .then(r => setInfo(r.data))
            .catch(e => setError(e.response?.data?.error || 'No hemos podido abrir esta página. Escríbenos por WhatsApp y lo vemos.'));
    }, [demo, expedienteId, token]);

    // Tras «Sí, me ha llegado», la reseña pasa a ser lo protagonista: arriba y con el foco.
    useEffect(() => {
        if (!recienRespondido.current || info?.recepcion !== 'recibido') return;
        recienRespondido.current = false;
        window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
        resenaRef.current?.focus({ preventScroll: true });
    }, [info?.recepcion]);

    const accion = async (a) => {
        setEnviando(a);
        try {
            if (a === 'recibido') recienRespondido.current = true;
            if (demo) {
                await new Promise(r => setTimeout(r, 450));
                setInfo(i => (a === 'resena' ? { ...i, resena_declarada: true } : { ...i, recepcion: a }));
            } else {
                const { data } = await axios.post(`${API}/cobro/${expedienteId}/recibido`, { token, accion: a });
                setInfo(data);
            }
        } catch (e) {
            recienRespondido.current = false;
            setError(e.response?.data?.error || 'No se ha podido guardar. Prueba otra vez.');
        } finally {
            setEnviando(null);
        }
    };

    if (error) {
        return (
            <Marco>
                <div className="rc-card rc-pad rc-in" role="alert">
                    <div className="rc-ambar-top">
                        <span className="rc-ambar-ico" style={{ background: '#fde8e6', color: '#9b1c1c' }}><IcoAlerta size={20} /></span>
                        <div>
                            <h1 className="rc-display rc-h3">Algo no ha ido bien</h1>
                            <p className="rc-sub" style={{ marginTop: 6 }}>{error}</p>
                        </div>
                    </div>
                </div>
                <Firma />
            </Marco>
        );
    }
    if (!info) {
        return (
            <Marco>
                <div aria-busy="true" aria-label="Cargando">
                    <div className="rc-sk" style={{ height: 18, width: 120, borderRadius: 8, marginBottom: 14 }} />
                    <div className="rc-sk" style={{ height: 420 }} />
                    <div className="rc-sk" style={{ height: 180, marginTop: 14 }} />
                </div>
            </Marco>
        );
    }

    const v = info.tercero;   // le hablamos a la persona de contacto («os»)
    const fecha = fechaLarga(info.fecha_transferencia);
    const cuentas = info.cuentas || [];
    const r = info.resena;
    const recibido = info.recepcion === 'recibido';
    const noLlegado = info.recepcion === 'no_llegado';
    const [euros, cent] = info.importe != null ? partesImporte(info.importe) : ['—', ''];

    return (
        <Marco numero={info.numero_expediente}>
            <div className="rc-stack">
                {/* 1 · ¿Te ha llegado? — el importe es el héroe hasta que contesta «Sí» */}
                {recibido ? (
                    <section className="rc-card rc-pad rc-in" role="status" aria-live="polite">
                        <div className="rc-ok">
                            <CheckDibujado />
                            <div className="rc-ok-txt">
                                <div className="rc-chip rc-chip-verde"><IcoCheck size={13} sw={3.2} />Confirmado</div>
                                <h1 className="rc-display rc-ok-tit">
                                    {info.importe != null ? eurEs(info.importe) : `${v ? 'Vuestro' : 'Tu'} Bono CAE`}
                                    <span className="rc-ok-tit2">ya está <span className="rc-mark">en {v ? 'vuestra' : 'tu'} cuenta</span></span>
                                </h1>
                                <p className="rc-ok-sub">Gracias por confirmarlo{info.saludo ? `, ${info.saludo}` : ''}.</p>
                            </div>
                        </div>
                    </section>
                ) : (
                    <>
                        <p className="rc-hola rc-in">Hola{info.saludo ? <>, <b>{info.saludo}</b></> : ''}</p>
                        <section className="rc-card rc-in" style={{ animationDelay: '60ms' }} aria-labelledby="rc-pregunta">
                            <div className="rc-pad" style={{ paddingBottom: 18 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <span className="rc-eyebrow">{v ? 'Vuestro' : 'Tu'} Bono CAE</span>
                                    <span className="rc-chip rc-chip-verde"><IcoCheck size={13} sw={3.2} />Transferido</span>
                                </div>
                                <div className="rc-display rc-importe" aria-label={info.importe != null ? eurEs(info.importe) : undefined}>
                                    <span>{euros}</span><span className="rc-cent">{cent}</span>
                                </div>
                                <p className="rc-meta">{fecha ? <>Transferencia del <b>{fecha}</b></> : 'Transferencia realizada'}</p>
                                {(cuentas.length > 0 || info.carta) && (
                                    <dl className="rc-filas">
                                        {cuentas.length > 0 && (
                                            <div className="rc-fila"><dt>Cuenta</dt><dd>{cuentas.map(c => `···· ${c}`).join(' y ')}</dd></div>
                                        )}
                                        {info.carta && <div className="rc-fila"><dt>Carta de pago</dt><dd>{info.carta}</dd></div>}
                                    </dl>
                                )}
                            </div>
                            <div className="rc-filete" />
                            <div className="rc-pregunta">
                                {noLlegado ? (
                                    <div className="rc-ambar" role="status" aria-live="polite">
                                        <div className="rc-ambar-top">
                                            <span className="rc-ambar-ico"><IcoReloj size={20} /></span>
                                            <div>
                                                <h2 id="rc-pregunta">Gracias por avisar</h2>
                                                <p>Lo estamos mirando ya y {v ? 'os' : 'te'} escribimos enseguida. A veces el banco tarda uno o dos días hábiles en reflejarlo.</p>
                                            </div>
                                        </div>
                                        <div className="rc-btns" style={{ marginTop: 14 }}>
                                            <button type="button" className="rc-btn rc-btn-sec" disabled={!!enviando} onClick={() => accion('recibido')}>
                                                {enviando === 'recibido' ? <><Spinner />Guardando…</> : <><IcoCheck size={18} sw={2.6} />Ya me ha llegado</>}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h1 id="rc-pregunta" className="rc-display rc-h1">¿{v ? 'Os' : 'Te'} ha llegado el <span className="rc-mark">ingreso</span>?</h1>
                                        <p className="rc-sub">Confírmanoslo con un toque y nos quedamos tranquilos.</p>
                                        <div className="rc-btns">
                                            <button type="button" className="rc-btn rc-btn-pri" disabled={!!enviando} onClick={() => accion('recibido')}>
                                                {enviando === 'recibido' ? <><Spinner />Guardando…</> : <><IcoCheck size={20} sw={2.8} />Sí, me ha llegado</>}
                                            </button>
                                            <button type="button" className="rc-btn rc-btn-sec" disabled={!!enviando} onClick={() => accion('no_llegado')}>
                                                {enviando === 'no_llegado' ? <><Spinner />Guardando…</> : 'Todavía no'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    </>
                )}

                {/* 2 · La reseña — protagonista tras «Sí» (nunca la llave de los documentos) */}
                {r && (recibido || info.resena_declarada) && (
                    <section className="rc-card rc-in" style={{ animationDelay: recibido ? '180ms' : '0ms' }} aria-labelledby="rc-resena">
                        <div className="rc-pad">
                            {info.resena_declarada ? (
                                <div className="rc-gracias" role="status" aria-live="polite">
                                    <span className="rc-gracias-ico"><IcoCorazon size={22} /></span>
                                    <div>
                                        <h2 id="rc-resena" ref={resenaRef} tabIndex={-1} className="rc-display rc-h3" style={{ outline: 'none' }}>{r.gracias}</h2>
                                        <p style={{ marginTop: 4 }}>Lo que {v ? 'contáis' : 'cuentas'} ayuda a otras familias a dar el paso.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="rc-res-top">
                                        <span className="rc-chip rc-chip-lima">{v ? 'Vuestra' : 'Tu'} opinión suma</span>
                                        <span className="rc-stars" aria-label="5 estrellas"><Estrella /><Estrella /><Estrella /><Estrella /><Estrella /></span>
                                    </div>
                                    <h2 id="rc-resena" ref={resenaRef} tabIndex={-1} className="rc-display rc-h2" style={{ outline: 'none' }}>{r.titulo}</h2>
                                    <p className="rc-cuerpo">{r.cuerpo}</p>
                                    <PruebaSocial n={info.familias_cobradas} />
                                    <div className="rc-btns">
                                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="rc-btn rc-btn-pri">
                                            <Estrella size={19} />{r.boton}<IcoExterna size={17} />
                                        </a>
                                    </div>
                                    <div className="rc-res-pie">
                                        <span>{r.pie}</span>
                                        <button type="button" className="rc-link" disabled={!!enviando} onClick={() => accion('resena')}>
                                            {enviando === 'resena' ? 'Guardando…' : r.hecho}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                )}

                {/* 3 · Su documentación — SIEMPRE a la vista */}
                {info.portal && (
                    <section className="rc-card rc-pad rc-in" style={{ animationDelay: '240ms' }} aria-labelledby="rc-doc">
                        <div className="rc-doc-top">
                            <span className="rc-doc-ico"><IcoCarpeta size={22} sw={1.8} /></span>
                            <h2 id="rc-doc" className="rc-display rc-h3" style={{ minWidth: 0 }}>{v ? 'Vuestra' : 'Tu'} documentación, siempre a mano</h2>
                        </div>
                        <p className="rc-sub" style={{ marginTop: 12, fontSize: 14.5 }}>Para la declaración de la Renta y para cuando la {v ? 'necesitéis' : 'necesites'}. Guarda el enlace: {v ? 'tendréis' : 'tendrás'} acceso siempre.</p>
                        <ul className="rc-lista">
                            <li><IcoCheck size={17} sw={2.6} />Certificados energéticos y etiqueta</li>
                            <li><IcoCheck size={17} sw={2.6} />Facturas de la obra</li>
                            <li><IcoCheck size={17} sw={2.6} />Guía con los datos que pide Renta Web</li>
                        </ul>
                        <div className="rc-btns">
                            <a href={info.portal} target="_blank" rel="noopener noreferrer" className="rc-btn rc-btn-tinta">
                                {v ? 'Abrir el espacio del expediente' : 'Abrir mi espacio'}<IcoFlecha size={18} />
                            </a>
                        </div>
                    </section>
                )}

                {!r && <PruebaSocial n={info.familias_cobradas} />}
            </div>
            <Firma />
        </Marco>
    );
}

export default RecibidoCobroView;
