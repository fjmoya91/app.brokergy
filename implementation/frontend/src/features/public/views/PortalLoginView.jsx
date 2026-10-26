/**
 * PortalLoginView — acceso del cliente a "Mi expediente".
 * URL: /portal (o /mi-expediente sin token)
 *
 * Login de baja fricción, estilo JCCM: nº de expediente + DNI. Si valida,
 * redirige a /mi-expediente/:uuid?token= (mismo token que /subir-docs).
 *
 * Registro «carta de pago» (24/10/2026), el MISMO del portal al que da paso
 * (MiExpedienteView): crema, tarjeta blanca, Antonio para el titular, UNA palabra
 * en lima y la acción en naranja. El error va en ámbar, nunca en rojo. Prefijo `.pl-`.
 */
import React, { useState } from 'react';
import axios from 'axios';

// En RELATIVO, como las demás páginas del cliente: se abre con el MÓVIL, y en
// desarrollo `localhost` sería el teléfono (lo resuelve el proxy de Vite).
const API = '/api/public/portal';
const WHATSAPP_CONTACTO = '34623926179'; // el de BROKERGY (el mismo del portal)

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.pl{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.pl *{box-sizing:border-box}
.pl-filete-top{height:4px;background:var(--filete)}
.pl-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.pl-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.pl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 30px}
.pl-logo{height:26px;width:auto;display:block}
.pl-pill{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.pl-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0 2px}
.pl-h1{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;font-size:42px;line-height:1.1;margin:8px 2px 0}
.pl-mark{background:var(--lima);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.pl-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.pl-sub b{color:var(--tinta);font-weight:600}
.pl-card{margin-top:22px;background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:26px 20px 22px}
.pl-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.pl-campo + .pl-campo{margin-top:16px}
.pl-label{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:0 2px 8px}
.pl-input{appearance:none;display:block;width:100%;height:56px;padding:0 16px;border-radius:16px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:600 17px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em;text-transform:uppercase;transition:border-color .2s ease,box-shadow .2s ease}
.pl-input::placeholder{color:#a3a5aa;font-weight:500;text-transform:none}
.pl-input:hover{border-color:rgba(20,17,17,.28)}
.pl-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.pl-ayuda{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:7px 2px 0}
.pl-aviso{display:flex;gap:12px;align-items:flex-start;margin-top:18px;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5;background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.pl-aviso b{font-weight:700}
.pl-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.pl-aviso .pl-ico-tile{background:#ffe9bd;color:#7a4b00}
.pl-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.pl-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;margin-top:20px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75);
  transition:transform .12s ease,filter .2s ease}
.pl-btn:hover{filter:brightness(1.04)}
.pl-btn:active{transform:scale(.98)}
.pl-btn:disabled{opacity:.7;cursor:default;transform:none}
.pl-btn:focus-visible,.pl-link:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.pl-extra{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:14px;border-radius:16px;background:#fff;border:1px solid var(--linea);font-size:14px;line-height:1.5;color:#3b3e45}
.pl-extra b{color:var(--tinta);font-weight:700}
.pl-link{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-top:2px;font:700 14px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px}
.pl-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.pl-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.pl-firma b{display:block;font-size:15px;font-weight:700}
.pl-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.pl-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.pl-spin{animation:pl-rot .8s linear infinite}
.pl-in{animation:pl-up .55s cubic-bezier(.2,.8,.2,1) both}
.pl-in-2{animation-delay:.08s}
.pl-in-3{animation-delay:.16s}
.pl-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes pl-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pl-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.pl-h1{font-size:36px}}
@media (min-width:768px){.pl-col{padding-top:40px}.pl-card{padding:30px 26px 26px}.pl-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){.pl-in,.pl-spin{animation:none}.pl-btn{transition:none}}
`;

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoFlecha = (p) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoCandado = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Ico>;
const IcoChat = (p) => <Ico {...p}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" /><path d="M8.5 10.5h7M8.5 13.5h4.5" /></Ico>;

const Spinner = ({ size = 18 }) => (
    <svg className="pl-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

export function PortalLoginView() {
    const [numeroExpediente, setNumeroExpediente] = useState('');
    const [dni, setDni] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setError(null);
        setLoading(true);
        try {
            const { data } = await axios.post(`${API}/login`, {
                numeroExpediente: numeroExpediente.trim(),
                dni: dni.trim(),
            });
            if (data?.token && data?.uuid) {
                window.location.href = `/mi-expediente/${data.uuid}?token=${data.token}`;
            } else {
                setError('No se pudo acceder. Revisa los datos.');
                setLoading(false);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo acceder. Inténtalo de nuevo.');
            setLoading(false);
        }
    };

    return (
        <div className="pl">
            <style>{CSS}</style>
            <div className="pl-filete-top" />
            <div className="pl-halo" />
            <main className="pl-col">
                <header className="pl-head pl-in">
                    <img className="pl-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    <span className="pl-pill">Mi expediente</span>
                </header>

                <div className="pl-in">
                    <p className="pl-eyebrow">Área del cliente</p>
                    <h1 className="pl-h1">Mira cómo va <span className="pl-mark">lo tuyo</span></h1>
                    <p className="pl-sub">
                        Entra con tu <b>nº de expediente</b> y tu <b>DNI</b>: verás en qué punto está, tus documentos y lo que necesitas para la Renta.
                    </p>
                </div>

                <form onSubmit={submit} className="pl-card pl-in pl-in-2" noValidate>
                    <div className="pl-filete-fino" />
                    <div className="pl-campo">
                        <label className="pl-label" htmlFor="pl-exp">Nº de expediente</label>
                        <input
                            id="pl-exp"
                            className="pl-input"
                            type="text"
                            value={numeroExpediente}
                            onChange={e => setNumeroExpediente(e.target.value)}
                            placeholder="Ej.: 26RES060_118"
                            autoCapitalize="characters"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        <p className="pl-ayuda">Viene en los mensajes que te hemos enviado.</p>
                    </div>

                    <div className="pl-campo">
                        <label className="pl-label" htmlFor="pl-dni">DNI</label>
                        <input
                            id="pl-dni"
                            className="pl-input"
                            type="text"
                            value={dni}
                            onChange={e => setDni(e.target.value)}
                            placeholder="Ej.: 12345678Z"
                            autoCapitalize="characters"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        <p className="pl-ayuda">El del titular de la vivienda.</p>
                    </div>

                    {error && (
                        <div className="pl-aviso" role="alert">
                            <span className="pl-ico-tile"><IcoAlerta /></span>
                            <div><b>{error}</b><br />Comprueba que están igual que en nuestros mensajes.</div>
                        </div>
                    )}

                    <button type="submit" className="pl-btn" disabled={loading}>
                        {loading ? <><Spinner /> Entrando…</> : <>Entrar <IcoFlecha /></>}
                    </button>
                </form>

                <div className="pl-extra pl-in pl-in-3">
                    <span className="pl-ico-tile pl-tile-crema"><IcoCandado /></span>
                    <div>
                        <b>Tu DNI solo sirve para comprobar que eres tú.</b> No se guarda en este dispositivo.
                    </div>
                </div>
                <div className="pl-extra pl-in pl-in-3">
                    <span className="pl-ico-tile pl-tile-crema"><IcoChat /></span>
                    <div>
                        <b>¿No encuentras tu nº de expediente?</b>
                        <br />
                        <a className="pl-link" href={`https://wa.me/${WHATSAPP_CONTACTO}`} target="_blank" rel="noopener noreferrer">
                            Escríbenos por WhatsApp
                        </a>
                    </div>
                </div>

                <footer>
                    <div className="pl-firma">
                        <img className="pl-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                        <div>
                            <b>Fran Moya</b>
                            <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                        </div>
                    </div>
                    <p className="pl-pie">BROKERGY · Ingeniería Energética</p>
                </footer>
                <span className="pl-sr" aria-live="polite">{loading ? 'Entrando' : ''}</span>
            </main>
        </div>
    );
}

export default PortalLoginView;
