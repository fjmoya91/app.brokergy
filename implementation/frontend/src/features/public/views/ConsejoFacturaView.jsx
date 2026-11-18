/**
 * ConsejoFacturaView — /consejo-factura/:expedienteId?token=
 *
 * El TEXTO RECOMENDADO para la factura del instalador, con un botón para copiarlo
 * (Fran, 11/11/2026, caso 26RES060_194). Llega por el botón «Copiar el concepto»
 * del email y por el enlace del WhatsApp cuando se le pide la factura o cuando la
 * que mandó tiene una incidencia GRAVE que tumba la auditoría.
 *   1. Qué corregir de la factura que hay (solo si es por una GRAVE).
 *   2. A nombre de / NIF / obra / quién la emite.
 *   3. El concepto, línea a línea, con «Copiar el concepto» (y cada línea suelta).
 *   4. «Para que no la rechacen»: las cinco reglas.
 *
 * Los TEXTOS salen del backend (utils/consejoFactura.js, fuente única con el
 * WhatsApp y el email): la página no compone nada.
 *
 * Token: el `upload_token` de la oportunidad (el mismo del enlace de subida
 * /subir-docs que ya tiene el instalador). Lleva el NIF del titular: sin token, 403.
 *
 * DISEÑO: registro «carta de pago» (regla 164), prefijo `.cf-`, mobile first.
 * Si el instalador tiene su plantilla de factura en la app (`facturaApp`), una tarjeta
 * «Hazla aquí, en tu plantilla» lleva a /factura-obra (FacturaObraView).
 * /consejo-factura/demo — datos de MENTIRA, sin API (`?hibridacion`, `?grave`, `?huecos`, `?app`).
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';

/** Partes de una frase con *negritas*: [{ t, b }]. (Misma que logic/esperaFm.js.) */
const partesNegrita = (s) => String(s || '').split('*').map((t, i) => ({ t, b: i % 2 === 1 })).filter((p) => p.t);

const API = '/api/public';
const DEMO = 'demo';

const REGLAS_DEMO = (instalador, fecha) => [
    `La emite *${instalador}*, la misma empresa que firma el certificado de la instalación${fecha ? `, con fecha posterior al ${fecha}` : ''}.`,
    'Marca, modelo y nº de serie, los de la placa del equipo instalado.',
    'Nada de radiadores, suelo radiante ni otros emisores nuevos: la ayuda es por el generador y no admite cambiar los emisores.',
    'Si en la misma factura van placas solares, un termo u otra cosa, en líneas aparte con su importe (o en otra factura).',
    'Si hubo anticipo o factura del material, con este mismo concepto.',
];

const vistaDemo = () => {
    const q = new URLSearchParams(window.location.search);
    const hib = q.has('hibridacion');
    const huecos = q.has('huecos');
    const instalador = 'INSTALACIONES DEMO, S.L.';
    const lineas = hib
        ? [
            `Suministro e instalación de bomba de calor aire-agua (aerotermia) marca ${huecos ? '[MARCA]' : 'SH'}, modelo ${huecos ? '[MODELO]' : 'MASTER 14'}, nº de serie ${huecos ? '[Nº DE SERIE]' : 'GF003SM0000DEMO'}, de ${huecos ? '[XX]' : '14'} kW, para calefacción, en HIBRIDACIÓN con la caldera existente DOMUSA D-4 (nº de serie 000000), que se mantiene como apoyo, conectada a los radiadores existentes de la vivienda.`,
            'Regulación y control para el funcionamiento conjunto de la bomba de calor y la caldera.',
            'Material auxiliar, conexionado hidráulico y eléctrico a la instalación existente, puesta en marcha y pruebas.',
        ]
        : [
            `Suministro e instalación de bomba de calor aire-agua (aerotermia) marca ${huecos ? '[MARCA]' : 'HAIER'}, modelo ${huecos ? '[MODELO]' : 'MONO GT 16kW'}, nº de serie ${huecos ? '[Nº DE SERIE]' : 'AE1F58DEMO'}, de ${huecos ? '[XX]' : '16'} kW, para calefacción, en sustitución de la caldera existente RIMA SF-05 (nº de serie 000000), conectada a los radiadores existentes de la vivienda.`,
            'Desmontaje y retirada de la caldera existente.',
            'Material auxiliar, conexionado hidráulico y eléctrico, puesta en marcha y pruebas.',
        ];
    const grave = q.has('grave');
    return {
        numero_expediente: hib ? '26RES093_000' : '26RES060_000',
        consejo: {
            hibridacion: hib,
            titular: 'ANTONIO GARCÍA LÓPEZ',
            nif: '00000000T',
            direccion: 'CL MAYOR 1, 13000 CIUDAD REAL (CIUDAD REAL)',
            instalador,
            lineas,
            pie: 'Cada línea con su importe; base imponible e IVA desglosados.',
            aviso: hib ? '*Importante:* no pongas «sustitución» ni «desmontaje de la caldera». En una hibridación la caldera se queda.' : null,
            reglas: REGLAS_DEMO(instalador, '11/10/2026'),
            conHuecos: huecos,
        },
        copiar: lineas.join('\n'),
        // `?app`: el instalador tiene su plantilla de factura en la app.
        facturaApp: q.has('app') ? '/factura-obra/demo' : null,
        facturaWord: q.has('app') ? '#word' : null,
        motivo: grave ? 'GRAVE' : 'FALTA',
        correcciones: grave
            ? [{ factura: 'F26-0001', puntos: ['Tiene que ir a nombre de *ANTONIO GARCÍA LÓPEZ* (NIF 00000000T), el titular del expediente.', 'El nº de serie no es el del equipo instalado: tiene que ser el de su placa.'] }]
            : [],
    };
};

/* ── Estilos ───────────────────────────────────────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.cf{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.cf *{box-sizing:border-box}
.cf b{color:var(--tinta);font-weight:700}
.cf-filete-top{height:4px;background:var(--filete)}
.cf-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.cf-col{position:relative;max-width:460px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.cf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.cf-logo{height:26px;width:auto;display:block}
.cf-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em}
.cf-stack > * + *{margin-top:14px}
.cf-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden}
.cf-pad{padding:22px 20px}
.cf-eyebrow{display:block;font-size:11px;line-height:1.45;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.cf-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.cf-h1{font-size:40px;line-height:1.08;margin:10px 0 0}
.cf-h3{font-size:22px;line-height:1.12;margin:0}
.cf-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .1em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.cf-sub{font-size:15px;line-height:1.58;color:var(--gris);margin:10px 0 0}
.cf-filete{height:6px;background:var(--filete)}
/* datos */
.cf-datos{display:grid;gap:0;margin:14px 0 0}
.cf-dato{display:grid;grid-template-columns:96px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--linea);font-size:14px;line-height:1.4}
.cf-dato:last-child{border-bottom:0}
.cf-dato .k{color:var(--gris);font-size:12.5px;font-weight:600}
.cf-dato .v{font-weight:700;word-break:break-word}
/* concepto */
.cf-concepto{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:10px}
.cf-linea{display:flex;gap:10px;align-items:flex-start;padding:12px 12px 12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.cf-linea .n{flex:none;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:20px;line-height:1.1;color:var(--naranja-txt);min-width:16px}
.cf-linea .t{flex:1;min-width:0;font:500 14.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#2a2c31;user-select:all;-webkit-user-select:all;word-break:break-word}
.cf-hueco{background:#ffe9bd;color:#7a4b00;border-radius:4px;padding:0 3px}
.cf-mini{flex:none;appearance:none;border:1px solid rgba(20,17,17,.14);background:#fff;border-radius:10px;width:36px;height:36px;display:grid;place-items:center;cursor:pointer;color:var(--gris);-webkit-tap-highlight-color:transparent}
.cf-mini.ok{color:var(--verde-txt);border-color:var(--verde)}
.cf-mini:focus-visible,.cf-btn:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.cf-pie{font-size:13px;color:var(--gris2);line-height:1.5;margin:12px 2px 0}
.cf-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;margin-top:16px;padding:0 18px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75);transition:transform .12s ease}
.cf-btn:active{transform:scale(.98)}
.cf-btn.ok{background:var(--verde);box-shadow:none}
.cf-btn.sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.18);box-shadow:none;margin-top:10px}
.cf-pnota{font-size:13px;color:var(--gris2);text-align:center;margin:10px 0 0;line-height:1.5}
/* ámbar */
.cf-ambar{padding:16px;border-radius:18px;background:#fff7e6;border:1px solid #f6dca4;color:#5c4100;font-size:14.5px;line-height:1.55}
.cf-ambar b{color:#3d2a00}
.cf-ambar h2{margin:0;font-size:16px;font-weight:700;color:#3d2a00}
.cf-ambar ul{margin:8px 0 0;padding:0 0 0 18px;list-style:disc}
.cf-ambar li + li{margin-top:6px}
.cf-ambar .fac{margin-top:10px;font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7a4b00}
/* reglas */
.cf-lista{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:12px}
.cf-lista li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.5;color:#3b3e45}
.cf-lista svg{flex:none;margin-top:2px;color:var(--verde-txt)}
/* firma */
.cf-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.cf-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.cf-firma b{display:block;font-size:15px}
.cf-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.cf-piepag{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.cf-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:cf-shim 1.3s linear infinite;border-radius:24px}
.cf-in{animation:cf-up .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes cf-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes cf-shim{to{background-position:-200% 0}}
@media (max-width:360px){.cf-h1{font-size:34px}.cf-dato{grid-template-columns:84px 1fr}}
@media (min-width:768px){.cf-col{padding-top:40px}.cf-pad{padding:26px}}
@media (prefers-reduced-motion:reduce){.cf-in,.cf-sk{animation:none}.cf-btn{transition:none}}
`;

/* ── Piezas ────────────────────────────────────────────────────────────────── */

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoCopiar = (p) => <Ico {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Ico>;

/** Una frase con *negritas*. */
const Texto = ({ s }) => partesNegrita(s).map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <React.Fragment key={i}>{p.t}</React.Fragment>));

/** Los huecos [MARCA], [Nº DE SERIE]… resaltados para que se vea qué completar. */
const ConHuecos = ({ s }) => String(s || '').split(/(\[[^\]]+\])/).map((t, i) => (
    /^\[[^\]]+\]$/.test(t) ? <span key={i} className="cf-hueco">{t}</span> : <React.Fragment key={i}>{t}</React.Fragment>
));

/**
 * Copiar al portapapeles: `navigator.clipboard` (pide HTTPS, que lo hay) y, si el
 * navegador lo niega (WebView de WhatsApp, iOS antiguo), el textarea oculto con
 * `execCommand('copy')`. Devuelve si se pudo.
 */
async function copiarTexto(texto) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch { /* cae al plan B */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, texto.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
    } catch {
        return false;
    }
}

function Marco({ children, numero }) {
    return (
        <div className="cf">
            <style>{CSS}</style>
            <div className="cf-filete-top" />
            <div className="cf-halo" />
            <main className="cf-col">
                <header className="cf-head">
                    <img className="cf-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="cf-exp" aria-label={`Expediente ${numero}`}>{numero}</span>}
                </header>
                {children}
            </main>
        </div>
    );
}

function Firma() {
    return (
        <footer>
            <div className="cf-firma">
                <img className="cf-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                <div>
                    <b>Fran Moya</b>
                    <span>CEO de BROKERGY</span>
                    <span>Ingeniero colegiado nº 1779 · COGITI</span>
                </div>
            </div>
            <p className="cf-piepag">BROKERGY · Ingeniería Energética</p>
        </footer>
    );
}

export function ConsejoFacturaView({ expedienteId, token }) {
    const demo = expedienteId === DEMO;
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    // 'todo' | índice de línea | null — lo último copiado, para el ✓.
    const [copiado, setCopiado] = useState(null);
    const [sinCopiar, setSinCopiar] = useState(false);

    // La página es CLARA: el body de la app es oscuro y asomaría al estirar el scroll.
    useEffect(() => {
        const b = document.body.style;
        const prev = { bg: b.background, color: b.color, scheme: document.documentElement.style.colorScheme };
        b.background = '#faf9f7';
        b.color = '#141111';
        document.documentElement.style.colorScheme = 'light';
        return () => { b.background = prev.bg; b.color = prev.color; document.documentElement.style.colorScheme = prev.scheme; };
    }, []);

    useEffect(() => {
        if (demo) { setInfo(vistaDemo()); return; }
        axios.get(`${API}/consejo-factura/${expedienteId}?token=${encodeURIComponent(token || '')}`)
            .then((r) => setInfo(r.data))
            .catch((e) => setError(e.response?.data?.error || 'No hemos podido abrir esta página. Escríbenos por WhatsApp y te lo pasamos.'));
    }, [demo, expedienteId, token]);

    const copiar = async (texto, cual) => {
        const ok = await copiarTexto(texto);
        if (ok) {
            setSinCopiar(false);
            setCopiado(cual);
            setTimeout(() => setCopiado((c) => (c === cual ? null : c)), 2500);
        } else {
            setSinCopiar(true);
        }
    };

    if (error) {
        return (
            <Marco>
                <div className="cf-card cf-pad cf-in" role="alert">
                    <h1 className="cf-display cf-h3">Algo no ha ido bien</h1>
                    <p className="cf-sub" style={{ marginTop: 6 }}>{error}</p>
                </div>
                <Firma />
            </Marco>
        );
    }

    if (!info) {
        return (
            <Marco>
                <div aria-busy="true" aria-label="Cargando">
                    <div className="cf-sk" style={{ height: 18, width: 120, borderRadius: 8, marginBottom: 14 }} />
                    <div className="cf-sk" style={{ height: 420 }} />
                    <div className="cf-sk" style={{ height: 220, marginTop: 14 }} />
                </div>
            </Marco>
        );
    }

    const c = info.consejo || {};
    const grave = info.motivo === 'GRAVE' && (info.correcciones || []).length > 0;
    const textoCopiar = info.copiar || (c.lineas || []).join('\n');

    return (
        <Marco numero={info.numero_expediente}>
            <div className="cf-stack">
                <section className="cf-card cf-in">
                    <div className="cf-pad">
                        <span className="cf-eyebrow">Factura de la obra</span>
                        <h1 className="cf-display cf-h1">El texto que te <span className="cf-mark">recomendamos</span></h1>
                        <p className="cf-sub">
                            {grave
                                ? 'La factura que nos mandaste no pasaría la auditoría del CAE tal como está. Para rehacerla, este es el concepto que te recomendamos.'
                                : 'Para que la factura pase la auditoría del CAE a la primera, este es el concepto que te recomendamos. Cópialo tal cual.'}
                            {c.conHuecos && ' Completa lo que va entre corchetes con los datos de la placa del equipo.'}
                        </p>

                        {grave && (
                            <div className="cf-ambar" style={{ marginTop: 16 }}>
                                <h2>Qué hay que corregir</h2>
                                {info.correcciones.map((g, i) => (
                                    <div key={i}>
                                        {g.factura && <p className="fac">Factura {g.factura}</p>}
                                        <ul>{g.puntos.map((t, j) => <li key={j}><Texto s={t} /></li>)}</ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="cf-datos">
                            <div className="cf-dato"><span className="k">A nombre de</span><span className="v"><ConHuecos s={c.titular} /></span></div>
                            <div className="cf-dato"><span className="k">NIF</span><span className="v"><ConHuecos s={c.nif} /></span></div>
                            <div className="cf-dato"><span className="k">Obra</span><span className="v"><ConHuecos s={c.direccion} /></span></div>
                            <div className="cf-dato"><span className="k">La emite</span><span className="v"><ConHuecos s={c.instalador} /></span></div>
                        </div>
                    </div>
                    <div className="cf-filete" />
                </section>

                {info.facturaApp && (
                    // Su plantilla está en la app: la factura se la damos hecha (FacturaObraView).
                    <section className="cf-card cf-pad cf-in" aria-labelledby="cf-app-t">
                        <span className="cf-eyebrow">Más rápido</span>
                        <h2 id="cf-app-t" className="cf-display cf-h3" style={{ marginTop: 6 }}>Hazla aquí, en tu plantilla</h2>
                        <p className="cf-sub" style={{ marginTop: 6 }}>
                            Te la damos ya escrita con tu diseño: pones el número, la fecha y los precios, y te llevas el PDF. Nos queda guardada, no hace falta que la mandes.
                        </p>
                        <a className="cf-btn" href={info.facturaApp} style={{ textDecoration: 'none' }}>Hacer la factura aquí</a>
                        {info.facturaWord && (
                            // Su plantilla en Word, ya escrita: solo le faltan el número, la fecha y los importes.
                            <a className="cf-btn sec" href={info.facturaWord} download style={{ textDecoration: 'none' }}>Descargar mi factura en Word</a>
                        )}
                        <p className="cf-pnota">
                            {info.facturaWord
                                ? 'El Word va ya con el cliente y el concepto: pones el número, la fecha y los importes. Si prefieres tu programa, copia el concepto de abajo.'
                                : 'Si prefieres hacerla en tu programa, copia el concepto de abajo.'}
                        </p>
                    </section>
                )}

                <section className="cf-card cf-pad cf-in" aria-labelledby="cf-concepto-t">
                    <span className="cf-eyebrow">Concepto para copiar</span>
                    <h2 id="cf-concepto-t" className="cf-display cf-h3" style={{ marginTop: 6 }}>
                        {c.hibridacion ? 'Hibridación con la caldera' : 'Sustitución de la caldera'}
                    </h2>
                    <ol className="cf-concepto">
                        {(c.lineas || []).map((l, i) => (
                            <li key={i} className="cf-linea">
                                <span className="n">{i + 1}</span>
                                <span className="t"><ConHuecos s={l} /></span>
                                <button type="button" className={`cf-mini${copiado === i ? ' ok' : ''}`}
                                    onClick={() => copiar(l, i)} aria-label={`Copiar la línea ${i + 1}`}>
                                    {copiado === i ? <IcoCheck size={17} sw={2.6} /> : <IcoCopiar size={17} />}
                                </button>
                            </li>
                        ))}
                    </ol>
                    {c.pie && <p className="cf-pie">{c.pie}</p>}
                    <button type="button" className={`cf-btn${copiado === 'todo' ? ' ok' : ''}`} onClick={() => copiar(textoCopiar, 'todo')}>
                        {copiado === 'todo' ? <><IcoCheck size={20} sw={2.6} />Copiado</> : <><IcoCopiar size={20} />Copiar el concepto</>}
                    </button>
                    <p className="cf-pnota" role="status" aria-live="polite">
                        {sinCopiar
                            ? 'Tu navegador no deja copiar desde aquí: mantén pulsado el texto de cada línea y elige «Copiar».'
                            : copiado === 'todo' ? 'Ya lo tienes en el portapapeles: pégalo en el concepto de la factura.' : 'Copia las tres líneas de una vez, o cada una con su botón.'}
                    </p>
                    {c.aviso && (
                        <div className="cf-ambar" style={{ marginTop: 14 }}><Texto s={c.aviso} /></div>
                    )}
                </section>

                <section className="cf-card cf-pad cf-in" aria-labelledby="cf-reglas-t">
                    <span className="cf-eyebrow">Antes de emitirla</span>
                    <h2 id="cf-reglas-t" className="cf-display cf-h3" style={{ marginTop: 6 }}>Para que no la rechacen</h2>
                    <ul className="cf-lista">
                        {(c.reglas || []).map((r, i) => (
                            <li key={i}><IcoCheck size={18} sw={2.6} /><span><Texto s={r} /></span></li>
                        ))}
                    </ul>
                </section>
            </div>
            <Firma />
        </Marco>
    );
}

export default ConsejoFacturaView;
