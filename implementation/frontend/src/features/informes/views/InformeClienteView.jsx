/**
 * InformeClienteView — /informe/:token
 *
 * El enlace del CLIENTE de un informe técnico (2026INF_n): la memoria para el
 * Ayuntamiento, una legalización, un informe… Todo el circuito en una página:
 *   1. En qué punto está (los pasos, con UNO protagonista).
 *   2. Mientras se redacta: la documentación que nos tiene que pasar, cada cosa con su botón.
 *   3. Con la factura: el importe y «Subir el justificante» (NO cobra: lo confirmamos nosotros).
 *   4. Cobrado: «Descargar el informe firmado» (solo el firmado, y solo cobrado).
 *      En un CIT ({AAAA}CIT_{n}, el RITE suelto) lo que se descarga es el
 *      CERTIFICADO OFICIAL de eDICE, y solo cuando ya está presentado.
 *
 * DISEÑO: estilo «carta de pago» (regla 164): crema, tarjetas blancas, Antonio + Inter,
 * UNA acción principal naranja por tarjeta, avisos en ámbar, firma de Fran, móvil primero.
 * CSS propio con prefijo `.ic-`.
 *
 * REGLA — la API se pide en RELATIVO: lo abre el cliente con el móvil desde un WhatsApp.
 *
 * /informe/demo — con datos de MENTIRA, sin llamar a la API ni subir nada.
 */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API = '/api/public/informe';
const DEMO = 'demo';
const DEMO_CIT = 'demo-cit';

const vistaDemo = () => ({
    numero: '2026INF_0', titulo: 'MEMORIA TECNICA AYUNTAMIENTO', tipo: 'Memoria técnica (Ayuntamiento)',
    organismo: 'Ayuntamiento de Valdepeñas', inmueble: 'C/ Ejemplo 12, Valdepeñas', cliente: { nombre: 'María Ejemplo' },
    estado: 'PTE. PAGO', paso: 'pago', anulado: false,
    pasos: [
        { id: 'aceptacion', titulo: 'Presupuesto aceptado', hecho: true },
        { id: 'redaccion', titulo: 'Redacción', hecho: true },
        { id: 'firma', titulo: 'Firma del técnico', hecho: true },
        { id: 'factura', titulo: 'Factura', hecho: true },
        { id: 'pago', titulo: 'Pago', hecho: false, actual: true },
        { id: 'entrega', titulo: 'Entrega del informe firmado', hecho: false },
    ],
    pideDocumentacion: false,
    documentacion: [
        { id: 'PRESUPUESTO_INSTALADOR', etiqueta: 'Presupuesto del instalador', ayuda: 'El de la instalación (placas, aerotermia…).', subido: { at: '2026-11-02T10:00:00Z' } },
    ],
    factura: { numero: '26ING_00', total: 181.5, pagada: false },
    justificante: null, puedeSubirJustificante: true, cobrado: false, entregado: null, puedeDescargar: false,
});
const vistaDemoCit = () => ({
    ...vistaDemo(),
    numero: '2026CIT_0', linea: 'CIT', titulo: 'MEMORIA TECNICA RITE', tipo: 'Certificado de instalación térmica (RITE)',
    organismo: null, entregaEtiqueta: 'el certificado de instalación térmica',
    pasos: [
        { id: 'aceptacion', titulo: 'Presupuesto aceptado', hecho: true },
        { id: 'redaccion', titulo: 'Memoria técnica', hecho: true },
        { id: 'firma', titulo: 'Firma de la memoria', hecho: true },
        { id: 'presentacion', titulo: 'Presentación en Industria (eDICE)', hecho: true },
        { id: 'factura', titulo: 'Factura', hecho: true },
        { id: 'pago', titulo: 'Pago', hecho: false, actual: true },
        { id: 'entrega', titulo: 'Entrega del certificado', hecho: false },
    ],
    documentacion: [
        { id: 'FACTURA_INSTALACION', etiqueta: 'Factura o presupuesto de la instalación', subido: { at: '2026-11-02T10:00:00Z' } },
        { id: 'FOTOS_PLACAS', etiqueta: 'Fotos de las placas de los equipos', subido: { at: '2026-11-02T10:05:00Z' } },
    ],
});

const fmtEur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} de ${MESES[d.getMonth()]}`;
};
const primerNombre = (s) => {
    const p = String(s || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
/** «Memoria para el Ayuntamiento» → «memoria para el Ayuntamiento» (el resto, tal cual). */
const minusculaInicial = (s) => { const t = String(s || ''); return t.charAt(0).toLowerCase() + t.slice(1); };

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.ic{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.ic *{box-sizing:border-box}
.ic-filete-top{height:4px;background:var(--filete)}
.ic-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.ic-col{position:relative;max-width:440px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.ic-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.ic-logo{height:26px;width:auto;display:block}
.ic-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px}
.ic-hola{font-size:15px;color:var(--gris);margin:0 2px}
.ic-stack > * + *{margin-top:14px}
.ic-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden}
.ic-pad{padding:22px 20px}
.ic-filete{height:6px;background:var(--filete)}
.ic-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.ic-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.ic-h2{font-size:30px;line-height:1.08;margin:8px 0 0}
.ic-mark{display:inline-block;line-height:1.02;background:var(--lima);padding:.04em .1em 0;border-radius:5px}
.ic-sub{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.ic-importe{font-size:64px;line-height:.95;margin:12px 0 0}
.ic-pasos{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:8px}
.ic-paso{display:flex;align-items:center;gap:10px;font-size:14.5px;color:var(--gris2)}
.ic-paso i{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid rgba(20,17,17,.15);display:grid;place-items:center}
.ic-paso.hecho{color:var(--tinta)}
.ic-paso.hecho i{background:rgba(177,209,62,.22);border-color:var(--verde);color:var(--verde-txt)}
.ic-paso.actual{color:var(--tinta);font-weight:700}
.ic-paso.actual i{border-color:var(--naranja);background:rgba(255,160,0,.12)}
.ic-docs{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:10px}
.ic-doc{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:16px;border:1px solid var(--linea);background:var(--crema)}
.ic-doc b{display:block;font-size:14.5px;font-weight:600}
.ic-doc span{display:block;font-size:12.5px;color:var(--gris2);margin-top:2px;line-height:1.4}
.ic-ok{font-size:12.5px;font-weight:700;color:var(--verde-txt);white-space:nowrap}
.ic-btns{display:grid;gap:10px;margin-top:18px}
.ic-btn{appearance:none;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;transition:transform .12s ease,filter .2s ease}
.ic-btn:active{transform:scale(.98)}
.ic-btn:disabled{opacity:.55;cursor:default;transform:none}
.ic-btn:focus-visible,.ic-mini:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.ic-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.ic-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.ic-mini{appearance:none;flex:none;min-height:44px;padding:0 14px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);background:#fff;font:700 13.5px 'Inter',sans-serif;color:var(--tinta);cursor:pointer}
.ic-mini:disabled{opacity:.55}
.ic-ambar{padding:14px 16px;border-radius:18px;background:#fff7e6;border:1px solid #f6dca4;font-size:14.5px;line-height:1.5;color:#5c4100}
.ic-verde{padding:14px 16px;border-radius:18px;background:rgba(177,209,62,.14);border:1px solid rgba(177,209,62,.45);font-size:14.5px;line-height:1.5;color:#33480a}
.ic-nota{font-size:13px;color:var(--gris2);text-align:center;margin:12px 0 0;line-height:1.5}
.ic-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.ic-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.ic-firma b{display:block;font-size:15px;font-weight:700}
.ic-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.ic-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.ic-demo{margin-bottom:14px;padding:10px 14px;border-radius:14px;background:#fff;border:1px dashed rgba(20,17,17,.25);font-size:13px;color:var(--gris)}
.ic-sk{height:180px;background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:ic-shim 1.3s linear infinite;border-radius:24px}
.ic-in{animation:ic-up .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes ic-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes ic-shim{to{background-position:-200% 0}}
@media (max-width:360px){.ic-importe{font-size:54px}.ic-h2{font-size:26px}}
@media (prefers-reduced-motion:reduce){.ic-in,.ic-sk{animation:none}.ic-btn{transition:none}}
`;

const Check = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

function Marco({ numero, children }) {
    return (
        <div className="ic">
            <style>{CSS}</style>
            <div className="ic-filete-top" />
            <div className="ic-halo" />
            <main className="ic-col">
                <header className="ic-head">
                    <img className="ic-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="ic-exp">{numero}</span>}
                </header>
                {children}
                <footer>
                    <div className="ic-firma">
                        <img className="ic-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                        <div>
                            <b>Fran Moya</b>
                            <span>CEO de BROKERGY</span>
                            <span>Ingeniero colegiado nº 1779 · COGITI</span>
                        </div>
                    </div>
                    <p className="ic-pie">BROKERGY · Ingeniería Energética</p>
                </footer>
            </main>
        </div>
    );
}

export function InformeClienteView({ token }) {
    const esDemo = token === DEMO || token === DEMO_CIT;
    const [v, setV] = useState(esDemo ? (token === DEMO_CIT ? vistaDemoCit() : vistaDemo()) : null);
    const [error, setError] = useState(null);
    const [subiendo, setSubiendo] = useState(null);
    const [aviso, setAviso] = useState(null);
    const input = useRef(null);
    const destino = useRef(null);

    useEffect(() => {
        if (esDemo) return;
        let vivo = true;
        axios.get(`${API}/${token}`)
            .then(r => { if (vivo) setV(r.data); })
            .catch(err => { if (vivo) setError(err.response?.status === 404 ? 'Este enlace no existe o ya no es válido.' : 'Ahora mismo no podemos abrirlo. Prueba dentro de un rato.'); });
        return () => { vivo = false; };
    }, [token, esDemo]);

    const elegir = (que) => {
        destino.current = que;
        input.current.value = '';
        input.current.click();
    };
    const alElegir = async (e) => {
        const f = e.target.files?.[0];
        const que = destino.current;
        if (!f || !que) return;
        setAviso(null);
        if (esDemo) { setAviso({ tono: 'verde', texto: 'En la prueba no se sube nada.' }); return; }
        setSubiendo(que);
        try {
            const fd = new FormData();
            fd.append('file', f);
            const url = que === 'JUSTIFICANTE' ? `${API}/${token}/justificante` : `${API}/${token}/documentacion/${que}`;
            const { data } = await axios.post(url, fd);
            setV(data);
            setAviso({ tono: 'verde', texto: que === 'JUSTIFICANTE'
                ? `¡Recibido! Lo comprobamos y te enviamos ${v?.linea === 'CIT' ? 'el certificado' : 'el documento firmado'}.`
                : '¡Recibido, gracias!' });
        } catch (err) {
            setAviso({ tono: 'ambar', texto: err.response?.data?.error || 'No se ha podido subir. Prueba otra vez.' });
        } finally { setSubiendo(null); }
    };

    if (error) return <Marco><div className="ic-ambar ic-in">{error}</div></Marco>;
    if (!v) return <Marco><div className="ic-sk" /></Marco>;

    const nombre = primerNombre(v.cliente?.nombre);
    const faltan = (v.documentacion || []).filter(d => !d.subido && !d.opcional);
    const quien = v.organismo ? <> para el <b>{v.organismo}</b></> : null;
    const cit = v.linea === 'CIT';
    const loQueRecibe = cit ? 'el certificado' : 'el documento firmado';

    // Lo PROTAGONISTA, según el paso.
    let principal;
    if (v.anulado) {
        principal = <div className="ic-ambar">Este encargo está cerrado. Si necesitas algo, escríbenos y lo vemos contigo.</div>;
    } else if (v.puedeDescargar) {
        principal = (
            <section className="ic-card ic-in">
                <div className="ic-filete" />
                <div className="ic-pad">
                    <p className="ic-eyebrow">Ya lo tienes</p>
                    {cit ? <>
                        <h1 className="ic-display ic-h2">Tu certificado <span className="ic-mark">registrado</span></h1>
                        <p className="ic-sub">Es el certificado de instalación térmica presentado en Industria (Junta de Comunidades de Castilla-La Mancha). Guárdalo junto a la documentación de tu instalación: te lo pueden pedir la compañía eléctrica, una ayuda o una inspección.</p>
                    </> : <>
                        <h1 className="ic-display ic-h2">Tu documento <span className="ic-mark">firmado</span></h1>
                        <p className="ic-sub">Es la versión con la firma electrónica del técnico: la que vale ante la Administración{v.organismo ? `. Preséntala en el ${v.organismo}` : ''}.</p>
                    </>}
                    <div className="ic-btns">
                        <a className="ic-btn ic-btn-pri" href={esDemo ? undefined : `${API}/${token}/firmado`}>{cit ? 'Descargar el certificado' : 'Descargar el documento firmado'}</a>
                        <a className="ic-btn ic-btn-sec" href={esDemo ? undefined : `${API}/${token}/firmado?ver=1`} target="_blank" rel="noopener noreferrer">Verlo</a>
                    </div>
                    {v.entregado && <p className="ic-nota">Te lo enviamos también el {fechaLarga(v.entregado.at)}.</p>}
                </div>
            </section>
        );
    } else if (v.factura && !v.cobrado) {
        principal = (
            <section className="ic-card ic-in">
                <div className="ic-filete" />
                <div className="ic-pad">
                    <p className="ic-eyebrow">Factura {v.factura.numero}</p>
                    <p className="ic-display ic-importe">{fmtEur(v.factura.total)}</p>
                    {v.justificante ? (
                        <>
                            <div className="ic-verde" style={{ marginTop: 16 }}>Justificante recibido el {fechaLarga(v.justificante.at)}. Lo comprobamos y te enviamos {loQueRecibe}.</div>
                            <div className="ic-btns"><button className="ic-btn ic-btn-sec" disabled={!!subiendo} onClick={() => elegir('JUSTIFICANTE')}>Subir otro justificante</button></div>
                        </>
                    ) : (
                        <>
                            <p className="ic-sub">{cit ? 'Tu certificado ya está presentado en Industria.' : 'Tu documento ya está terminado y firmado.'} Por política de empresa, te lo enviamos una vez abonada la factura: cuando hagas la transferencia, sube aquí el justificante.</p>
                            <div className="ic-btns">
                                <button className="ic-btn ic-btn-pri" disabled={!!subiendo} onClick={() => elegir('JUSTIFICANTE')}>
                                    {subiendo === 'JUSTIFICANTE' ? 'Subiendo…' : 'Subir el justificante de pago'}
                                </button>
                            </div>
                            <p className="ic-nota">Una foto o el PDF del banco. Los datos de la cuenta van en la factura que te enviamos.</p>
                        </>
                    )}
                </div>
            </section>
        );
    } else if (v.cobrado) {
        principal = <div className="ic-verde ic-in">Pago recibido, ¡gracias! Te enviamos {loQueRecibe} en cuanto esté listo.</div>;
    } else {
        principal = (
            <section className="ic-card ic-in">
                <div className="ic-filete" />
                <div className="ic-pad">
                    <p className="ic-eyebrow">{v.tipo}</p>
                    <h1 className="ic-display ic-h2">Estamos <span className="ic-mark">con ello</span></h1>
                    <p className="ic-sub">{cit
                        ? 'Preparamos la memoria técnica de tu instalación y la presentamos en Industria. Te avisamos en cuanto tengas el certificado.'
                        : <>Preparamos tu documento{quien}. Te avisamos en cuanto esté terminado y firmado.</>}</p>
                </div>
            </section>
        );
    }

    return (
        <Marco numero={v.numero}>
            <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.docx,.xlsx" hidden onChange={alElegir} />
            {esDemo && <div className="ic-demo"><b>Modo prueba</b> · así lo ve el cliente. No se sube ni se envía nada.</div>}
            <div className="ic-stack">
                <p className="ic-hola">¡Hola{nombre ? <> <b>{nombre}</b></> : ''}! Aquí ves cómo va tu {cit ? 'certificado de instalación térmica' : minusculaInicial(v.tipo || 'informe')}{v.inmueble ? <> de <b>{v.inmueble}</b></> : null}.</p>

                {aviso && <div className={aviso.tono === 'verde' ? 'ic-verde' : 'ic-ambar'} role="status">{aviso.texto}</div>}

                {principal}

                {v.pideDocumentacion && v.documentacion?.length > 0 && (
                    <section className="ic-card ic-in">
                        <div className="ic-pad">
                            <p className="ic-eyebrow">Tu documentación</p>
                            <p className="ic-sub" style={{ marginTop: 6 }}>
                                {faltan.length ? 'Para prepararlo necesitamos esto. Puedes subirlo poco a poco:' : 'Gracias: ya tenemos lo necesario. Si tienes algo más, súbelo aquí.'}
                            </p>
                            <ul className="ic-docs">
                                {v.documentacion.map(d => (
                                    <li key={d.id} className="ic-doc">
                                        <div style={{ minWidth: 0 }}>
                                            <b>{d.etiqueta}{d.opcional ? ' (si lo tienes)' : ''}</b>
                                            {d.ayuda && <span>{d.ayuda}</span>}
                                        </div>
                                        {d.subido ? <span className="ic-ok">✓ Recibido</span> : (
                                            <button className="ic-mini" disabled={!!subiendo} onClick={() => elegir(d.id)}>{subiendo === d.id ? 'Subiendo…' : 'Subir'}</button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                )}

                <section className="ic-card ic-in">
                    <div className="ic-pad">
                        <p className="ic-eyebrow">En qué punto está</p>
                        <ol className="ic-pasos">
                            {(v.pasos || []).map(p => (
                                <li key={p.id} className={`ic-paso ${p.hecho ? 'hecho' : p.actual ? 'actual' : ''}`}>
                                    <i>{p.hecho ? <Check /> : null}</i>{p.titulo}
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            </div>
        </Marco>
    );
}

export default InformeClienteView;
