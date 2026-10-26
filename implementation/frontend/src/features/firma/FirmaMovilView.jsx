import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SignaturePad from './SignaturePad';

/**
 * Lo que ve el TELÉFONO: firmar y devolver la firma al ordenador.
 *
 * Port de `ScannerApp/src/renderer/views/PhoneSign.tsx`. Aquí NO se ve el
 * documento, a propósito: el PDF no sale de la sesión del ordenador y solo sube
 * el PNG de la firma. De paso evita pedirle a nadie que busque el "Fdo." dando
 * pellizcos a una pantalla de seis pulgadas — eso ya lo ha leído en el PC, que
 * es donde el documento se ve entero.
 *
 * La hoja es el MISMO `SignaturePad` del ordenador, así que la tinta es idéntica
 * — y en un móvil sale ganando: un lápiz (Apple Pencil, S Pen) entrega PRESIÓN
 * de verdad, que un ratón no puede dar.
 *
 * Las pantallas de alrededor (abrir, enviar, enviada, enlace no válido y el
 * aviso de girar) van con el estilo «carta de pago» (regla 164, prefijo `.fm-`,
 * 24/10/2026); la hoja no se toca. Demo: /firma-movil/demo — no llama a la API.
 */

/**
 * RELATIVA, también en desarrollo.
 *
 * El resto de vistas públicas apuntan a `http://localhost:3000` cuando se
 * trabaja en local, y les vale porque se abren en el mismo ordenador que corre
 * el backend. Esta se abre en el TELÉFONO, y ahí `localhost` es el propio
 * teléfono: la firma no llegaría a ninguna parte. En relativo la sirve el mismo
 * origen del que vino la página — el proxy de Vite en desarrollo, el propio
 * servidor en producción.
 */
const API_URL = '/api/public';
const DEMO_TOKEN = 'demo';

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.fm{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;position:relative;overflow:hidden}
.fm *{box-sizing:border-box}
.fm-fijo{position:fixed;inset:0;z-index:90}
.fm-filete-top{height:4px;flex:none;background:var(--filete)}
.fm-halo{position:absolute;inset:0 0 auto 0;height:420px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.fm-col{position:relative;flex:1;width:100%;max-width:420px;margin:0 auto;padding:18px 24px calc(28px + env(safe-area-inset-bottom));display:flex;flex-direction:column}
.fm-logo{height:24px;width:auto;display:block;margin:6px 0 0;align-self:flex-start}
.fm-centro{flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px 0}
.fm-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.fm-h1{font-size:40px;line-height:1.16;margin:18px 0 0}
.fm-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.fm-txt{font-size:16px;line-height:1.55;color:var(--gris);margin:12px 0 0}
.fm-txt b{color:var(--tinta);font-weight:700}
.fm-espera{display:flex;align-items:center;gap:12px;font-size:15px;font-weight:600;color:var(--gris)}
.fm-spin{animation:fm-rot .8s linear infinite;color:var(--naranja)}
.fm-tile{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:#ffe9bd;color:#7a4b00}
.fm-aviso{position:fixed;top:0;left:0;right:0;z-index:95;margin:12px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:#fff7e6;border:1px solid #f6dca4;color:#5c4100;font:500 14px/1.45 'Inter',sans-serif;box-shadow:0 8px 24px -12px rgba(20,17,17,.25)}
.fm-aviso svg{flex:none;margin-top:1px}
.fm-aviso{cursor:pointer}
.fm-aviso-x{flex:none;border:0;background:transparent;color:#5c4100;font:600 22px/1 'Inter',sans-serif;padding:0 2px;margin:-3px -2px 0 0;cursor:pointer}
.fm-girar{width:96px;height:96px;border-radius:28px;display:grid;place-items:center;background:rgba(255,160,0,.14);color:#8a4b00}
.fm-girar svg{animation:fm-gira 2.4s cubic-bezier(.65,0,.35,1) infinite}
.fm-salida{appearance:none;background:none;border:0;cursor:pointer;margin-top:22px;min-height:44px;padding:0;font:700 14px 'Inter',sans-serif;color:var(--gris);text-decoration:underline;text-underline-offset:3px;align-self:flex-start}
.fm-check{width:72px;height:72px}
.fm-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:100;stroke-dashoffset:100;animation:fm-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.fm-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:fm-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.fm-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:0;font-weight:700}
@keyframes fm-rot{to{transform:rotate(360deg)}}
@keyframes fm-draw{to{stroke-dashoffset:0}}
@keyframes fm-gira{0%,20%{transform:rotate(0)}50%,70%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@media (max-width:360px){.fm-h1{font-size:34px}}
@media (orientation:landscape) and (max-height:500px){.fm-centro{padding:8px 0}.fm-h1{font-size:32px;margin-top:10px}}
@media (prefers-reduced-motion:reduce){.fm-spin,.fm-girar svg{animation:none}.fm-check circle,.fm-check path{animation:none;stroke-dashoffset:0}}
`;

const Ico = ({ size = 22, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
// Un teléfono de pie que se tumba.
const IcoMovil = (p) => <Ico {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></Ico>;

const Spinner = ({ size = 22 }) => (
    <svg className="fm-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** El check que se DIBUJA: primero el círculo, luego la palomita. */
const CheckDibujado = () => (
    <svg className="fm-check" viewBox="0 0 60 60" width="72" height="72" aria-hidden="true">
        <circle cx="30" cy="30" r="26.5" pathLength="100" />
        <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
    </svg>
);

/** El papel crema con el logo arriba y el pie abajo. `fijo`: por encima de la hoja. */
const Pantalla = ({ children, fijo = false }) => (
    <div className={`fm ${fijo ? 'fm-fijo' : ''}`}>
        <style>{CSS}</style>
        <div className="fm-filete-top" />
        <div className="fm-halo" />
        <main className="fm-col">
            <img className="fm-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="120" height="24" />
            <div className="fm-centro">{children}</div>
            <p className="fm-pie">BROKERGY · Ingeniería Energética</p>
        </main>
    </div>
);

export function FirmaMovilView({ token }) {
    const esDemo = token === DEMO_TOKEN;
    const [info, setInfo] = useState(() => (esDemo ? { etiqueta: 'Firma del Anexo I (prueba)', caja: null } : null));
    const [paso, setPaso] = useState(esDemo ? 'firmando' : 'cargando'); // cargando|firmando|enviando|hecho|error
    const [error, setError] = useState(null);
    const [vertical, setVertical] = useState(false);
    const [firmarIgual, setFirmarIgual] = useState(false);

    useEffect(() => {
        if (esDemo) return;
        axios.get(`${API_URL}/firma-movil/${token}`)
            .then(r => {
                setInfo(r.data);
                setPaso(r.data.yaFirmada ? 'hecho' : 'firmando');
            })
            .catch(e => {
                setError(e.response?.data?.error || 'No se ha podido abrir el enlace.');
                setPaso('error');
            });
    }, [token, esDemo]);

    /**
     * Se mira la FORMA de la pantalla, no la orientación del aparato: una tableta
     * de pie es más ancha que muchos móviles tumbados, y ahí no hay nada que
     * pedirle a nadie.
     */
    useEffect(() => {
        const mirar = () => setVertical(window.innerHeight > window.innerWidth);
        mirar();
        window.addEventListener('resize', mirar);
        window.addEventListener('orientationchange', mirar);
        return () => {
            window.removeEventListener('resize', mirar);
            window.removeEventListener('orientationchange', mirar);
        };
    }, []);

    // El aviso de un envío fallido va fijo arriba, ENCIMA del título de la hoja
    // («Firma del Anexo I»): se quita al tocarlo y solo a los 8 s, para que no
    // tape qué se está firmando mientras se vuelve a pulsar «Enviar firma».
    useEffect(() => {
        if (!error || paso !== 'firmando') return undefined;
        const t = setTimeout(() => setError(null), 8000);
        return () => clearTimeout(t);
    }, [error, paso]);

    const enviar = async (ink) => {
        setPaso('enviando');
        setError(null);
        if (esDemo) { setTimeout(() => setPaso('hecho'), 700); return; }
        try {
            await axios.post(`${API_URL}/firma-movil/${token}`, { dataUrl: ink.dataUrl });
            setPaso('hecho');
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo enviar la firma. Comprueba la conexión.');
            setPaso('firmando');
        }
    };

    if (paso === 'cargando') {
        return (
            <Pantalla>
                <p className="fm-espera"><Spinner /> Abriendo la hoja de firma…</p>
            </Pantalla>
        );
    }

    if (paso === 'error') {
        return (
            <Pantalla>
                <span className="fm-tile"><IcoAlerta size={30} /></span>
                <h1 className="fm-display fm-h1">Este enlace no <span className="fm-mark">funciona</span></h1>
                <p className="fm-txt">{error}</p>
                <p className="fm-txt">El enlace sirve una vez y dura unos minutos. Vuelve al ordenador y pulsa <b>«Generar otro enlace»</b> para escanear un código nuevo.</p>
            </Pantalla>
        );
    }

    if (paso === 'hecho') {
        return (
            <Pantalla>
                <CheckDibujado />
                <h1 className="fm-display fm-h1">Firma <span className="fm-mark">enviada</span></h1>
                <p className="fm-txt">
                    Ya puedes dejar el teléfono. <b>Sigue en el ordenador</b>, que allí continúa el proceso.
                </p>
            </Pantalla>
        );
    }

    // «Enviando» va ENCIMA de la hoja, no en su lugar: si el envío falla, la
    // firma sigue dibujada y basta con volver a pulsar (antes había que repetirla).
    return (
        <>
            <style>{CSS}</style>
            {/* Portaleado, como la hoja: dentro de `#root` quedaba DEBAJO de ella. */}
            {error && createPortal(
                <div className="fm-aviso" role="alert" onClick={() => setError(null)}>
                    <IcoAlerta size={19} />
                    <p style={{ margin: 0, flex: 1 }}>{error}</p>
                    <button type="button" className="fm-aviso-x" aria-label="Cerrar aviso">×</button>
                </div>,
                document.body,
            )}

            {/* La hoja se monta YA, aunque el teléfono esté de pie: así, al
                girarlo, aparece hecha y con su tamaño. El aviso va encima. */}
            <SignaturePad
                titulo={info?.etiqueta}
                caja={info?.caja}
                textoAceptar="Enviar firma"
                onAccept={enviar}
            />

            {paso === 'enviando' && createPortal(
                <Pantalla fijo>
                    <p className="fm-espera"><Spinner /> Enviando la firma…</p>
                </Pantalla>,
                document.body,
            )}

            {/* Portaleado, como el propio `SignaturePad`: la hoja se monta en
                `document.body` y esto vivía dentro de `#root`, que apila ANTES —
                así que el aviso quedaba DEBAJO de la hoja y no se veía, por mucho
                z-index que llevara. Medido en un teléfono de 375x812. */}
            {vertical && !firmarIgual && createPortal(
                <Pantalla fijo>
                    <span className="fm-girar"><IcoMovil size={46} sw={1.6} /></span>
                    <h1 className="fm-display fm-h1">Gira el <span className="fm-mark">teléfono</span></h1>
                    <p className="fm-txt">
                        En horizontal tienes toda la pantalla para firmar, y la firma sale mucho mejor.
                    </p>
                    {/* Salida discreta: en una tableta grande, o con el bloqueo de
                        rotación puesto, firmar de pie es razonable y no hay que
                        dejar a nadie encerrado. */}
                    <button type="button" onClick={() => setFirmarIgual(true)} className="fm-salida">
                        Firmar así igualmente
                    </button>
                </Pantalla>,
                document.body,
            )}
        </>
    );
}

export default FirmaMovilView;
