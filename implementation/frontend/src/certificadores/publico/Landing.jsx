// ─── Landing — cee.brokergy.es/ sin sesión ───────────────────────────────────
// Qué es, cómo funciona, qué entrega, para quién y las dudas, con la llamada a
// crear la cuenta (alta al momento, 1 certificado gratis). Sin testimonios, cifras ni logos inventados: lo que se
// dice aquí es lo que la app hace (docs/conocimiento/certificadores-app/).
//
// Rediseño del 06/11/2026 (Fran: «efecto wow, manteniendo mi estilo y mis colores;
// el vídeo se queda; en la firma, nada de mi nombre: Powered by BROKERGY»). El CSS
// es suyo, con prefijo `.ln-`, en ./landingEstilo.js (allí, qué se mueve y por qué).
// Mobile first: en el móvil todo va en una columna; desde 1024 px la portada va a
// dos columnas con el vídeo a la derecha del titular, los pasos con su título fijo
// a la izquierda y la entrega con las hojas al lado.
import { useEffect, useRef, useState } from 'react';
import { Enlace } from '../router';
import { CabeceraPublica, Papel } from '../ui/piezas';
import {
    IcoCamara, IcoCarpeta, IcoCasa, IcoCheck, IcoDoc, IcoEscudo, IcoFlecha, IcoLista, IcoMapa, IcoMas,
    IcoRecargar, IcoSilencio, IcoSonido, IcoUsuario,
} from '../ui/Iconos';
import { EMAIL_CONTACTO, LOGO_CLARO, NOMBRE_APP, WEB_BROKERGY } from '../marca';
import { CSS_LANDING } from './landingEstilo';

const sinMovimiento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const FAQS = [
    {
        q: '¿Firma la IA el certificado?',
        a: 'No. La IA prepara el borrador del certificado; tú lo revisas, lo cambias si hace falta y lo firmas, porque el técnico competente eres tú. Nada se registra sin ti.',
    },
    {
        q: '¿Sustituye mi trabajo como técnico competente?',
        a: 'No. Es una herramienta para ser más ágil en el trabajo de gabinete. El Real Decreto 390/2021, de 1 de junio, que regula la certificación de la eficiencia energética de los edificios, pone en manos del técnico competente la visita al inmueble, la toma y la comprobación de los datos, el cálculo y la firma del certificado, y todo eso sigue siendo tuyo. Lo que prepara la IA es un borrador que revisas tú; quien firma el certificado responde de él.',
    },
    {
        q: '¿Con qué programa se hace?',
        a: 'Con CE3X 3.2, el procedimiento reconocido para viviendas existentes. Te damos el .cex para que lo abras en tu CE3X, junto con el XML, el PDF y el croquis.',
    },
    {
        q: '¿Cuánto cuesta?',
        a: 'Durante la beta, tu primer certificado es gratis. Los siguientes serán de pago: te diremos el precio antes, y no se te cobra nada que no hayas aceptado.',
    },
    {
        q: '¿Y mis datos y los de mis clientes?',
        a: 'Lo de cada obra va a una carpeta de Drive compartida solo con tu email. Tus obras las ves tú y el equipo de BROKERGY que revisa lo que prepara la IA. Los datos se usan para preparar tus certificados.',
    },
    {
        q: '¿Puedo cambiar lo que ha hecho la IA?',
        a: 'Sí, de dos formas: en la envolvente de la web (cambias un muro o una ventana y se vuelve a generar) o abriendo el .cex en CE3X. Lo que cambies a mano en CE3X no vuelve a la web, y te lo recordamos.',
    },
    {
        q: '¿Funciona en el móvil?',
        a: 'Sí. Está pensada para usarla con una mano durante la visita, foto a foto, y lo que guardas en el móvil lo ves después en el ordenador.',
    },
];

const PASOS = [
    {
        t: 'Metes los datos de la obra',
        p: 'La referencia catastral, o la dirección, el mapa o el GPS del móvil. Del Catastro sale la superficie, el año, el uso y el plano de la vivienda.',
    },
    {
        t: 'Contestas unas preguntas y subes las fotos',
        p: 'Lo que la IA no puede ver: con qué linda la vivienda, la calefacción, el agua caliente, las ventanas. En la visita, foto a foto con el móvil; y si te falta alguna, se la pides al propietario con un enlace.',
    },
    {
        t: 'Se lo envías a la IA',
        p: 'Prepara la envolvente, las instalaciones y las medidas de mejora en CE3X 3.2. Te avisamos por WhatsApp y email cuando está listo.',
    },
    {
        t: 'Revisas el croquis y lo firmas',
        p: 'Te devolvemos el .cex, el XML, el PDF y el croquis. Si el croquis está bien, firmas el PDF desde la web con AutoFirma; si algo no cuadra, lo cambias en la envolvente o en tu CE3X.',
    },
];

/** Al bajar, la cabecera pasa a ser una píldora de cristal que se queda arriba. */
function useNavFlotante() {
    const [flota, setFlota] = useState(false);
    useEffect(() => {
        const mirar = () => setFlota(window.scrollY > 24);
        mirar();
        window.addEventListener('scroll', mirar, { passive: true });
        return () => window.removeEventListener('scroll', mirar);
    }, []);
    return flota;
}

const VIDEO_MUDO = '/certificadores/promo-cee.mp4';
const VIDEO_VOZ = '/certificadores/promo-cee-voz.mp4';
const ESCALA = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** El vídeo promo de la portada (implementation/promo-video): 30 s sin sonido, en bucle mientras se ve.
 *  Con «reducir movimiento» no arranca solo: se queda el póster y los controles.
 *  «Activar sonido» cambia a la versión CON VOZ (42 s, otro fichero: la voz pide más tiempo) y la pone
 *  desde el principio, una sola vez: al acabar se queda en la llamada final. El cambio de fichero y el
 *  play() van dentro del clic, que es lo que deja al navegador (Safari sobre todo) sonar.
 *  Detrás del móvil, la escala A → G de la etiqueta energética (decorado: no dice ninguna calificación);
 *  con ratón, el móvil se inclina un poco hacia él y la escala se desplaza al revés. */
function VideoPromo() {
    const ref = useRef(null);
    const escena = useRef(null);
    const [quieto] = useState(sinMovimiento);
    const [voz, setVoz] = useState(false);       // ya está puesta la versión con voz
    const [sonido, setSonido] = useState(false);
    const [acabado, setAcabado] = useState(false);
    useEffect(() => {
        const v = ref.current;
        if (!v || quieto || !('IntersectionObserver' in window)) return;
        // Al volver a verse sigue, salvo que la versión con voz ya haya terminado: no se repite sola.
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { if (!v.ended) v.play().catch(() => {}); } else v.pause(); }, { threshold: 0.35 });
        io.observe(v);
        return () => io.disconnect();
    }, [quieto]);

    // La inclinación: solo con ratón y sin «reducir movimiento». Va por variables CSS, sin repintar React.
    useEffect(() => {
        const el = escena.current;
        if (!el || quieto || !window.matchMedia?.('(pointer: fine)').matches) return;
        let raf = 0, x = 0, y = 0;
        const aplicar = () => {
            raf = 0;
            const r = el.getBoundingClientRect();
            const dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (window.innerWidth / 2)));
            const dy = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (window.innerHeight / 2)));
            el.style.setProperty('--ry', `${(dx * 7).toFixed(2)}deg`);
            el.style.setProperty('--rx', `${(-dy * 5).toFixed(2)}deg`);
            el.style.setProperty('--bx', `${(-dx * 12).toFixed(1)}px`);
            el.style.setProperty('--by', `${(-dy * 8).toFixed(1)}px`);
        };
        const mover = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(aplicar); };
        window.addEventListener('pointermove', mover, { passive: true });
        return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', mover); };
    }, [quieto]);

    const pulsar = () => {
        const v = ref.current;
        if (!v) return;
        if (!voz || acabado) {
            if (!voz) { v.loop = false; v.src = VIDEO_VOZ; setVoz(true); }
            v.currentTime = 0;
            v.muted = false;
            setSonido(true);
            setAcabado(false);
            v.play().catch(() => {});
            return;
        }
        v.muted = !v.muted;
        setSonido(!v.muted);
    };
    const etiqueta = acabado ? 'Verlo otra vez' : sonido ? 'Quitar sonido' : 'Activar sonido';
    const Icono = acabado ? IcoRecargar : sonido ? IcoSilencio : IcoSonido;

    return (
        <figure className="ln-vid">
            <div className="ln-vid-escena" ref={escena}>
                <div className="ln-escala" aria-hidden="true">
                    {ESCALA.map((l, i) => <span key={l} className="ln-barra" style={{ '--i': i }}><b>{l}</b></span>)}
                </div>
                <div className="ln-vid-in">
                    <video ref={ref} src={VIDEO_MUDO} poster="/certificadores/promo-cee.jpg" width="540" height="960"
                        muted loop playsInline preload="auto" controls={quieto} onEnded={() => setAcabado(true)}
                        aria-label="Vídeo: metes los datos de la obra, contestas unas preguntas, se lo envías a la IA y revisas el croquis y firmas desde la web" />
                </div>
            </div>
            <button type="button" className={`ln-sonido${sonido && !acabado ? ' ca-on' : ''}`} onClick={pulsar}>
                <Icono size={18} sw={2.2} />{etiqueta}
            </button>
        </figure>
    );
}

/** Los cuatro pasos, unidos por una línea que se rellena con el filete conforme se baja: cada
 *  tramo (de un paso al siguiente) lleva su --f de 0 a 1 y el paso alcanzado se enciende (`ln-on`).
 *  Se mide en un rAF por scroll y se escribe directo en el DOM: no repinta React. */
function Pasos() {
    const ref = useRef(null);
    useEffect(() => {
        const ol = ref.current;
        if (!ol) return;
        const items = [...ol.children];
        if (sinMovimiento()) {
            items.forEach(li => { li.style.setProperty('--f', '1'); li.classList.add('ln-on'); });
            return;
        }
        let raf = 0;
        const medir = () => {
            raf = 0;
            const r = ol.getBoundingClientRect();
            const linea = window.innerHeight * 0.6 - r.top;   // hasta dónde ha llegado la línea, en px del <ol>
            items.forEach(li => {
                const centro = li.offsetTop + li.querySelector('.ln-num').offsetHeight / 2;
                li.classList.toggle('ln-on', linea >= centro);
                const f = Math.max(0, Math.min(1, (linea - centro) / Math.max(1, li.offsetHeight)));
                li.style.setProperty('--f', f.toFixed(3));
            });
        };
        const pedir = () => { if (!raf) raf = requestAnimationFrame(medir); };
        medir();
        window.addEventListener('scroll', pedir, { passive: true });
        window.addEventListener('resize', pedir);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', pedir);
            window.removeEventListener('resize', pedir);
        };
    }, []);
    return (
        <ol className="ln-lista-pasos" ref={ref}>
            {PASOS.map((p, i) => (
                <li key={p.t} className="ln-paso">
                    <span className="ln-num" aria-hidden="true">{i + 1}</span>
                    <div>
                        <h3><span className="ca-sr">Paso {i + 1}. </span>{p.t}</h3>
                        <p>{p.p}</p>
                    </div>
                </li>
            ))}
        </ol>
    );
}

/** Lo que te entregamos, dibujado: cuatro hojas que se abren en abanico al verse. Decorado: la lista
 *  de al lado es la que lo dice (ni datos ni una vivienda de verdad dentro). */
function Hojas() {
    const ref = useRef(null);
    // Sin animación (o sin IntersectionObserver), ya abiertas desde el principio.
    const [visto, setVisto] = useState(() => sinMovimiento() || !('IntersectionObserver' in window));
    useEffect(() => {
        const el = ref.current;
        if (!el || visto) return;
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); io.disconnect(); } }, { threshold: 0.4 });
        io.observe(el);
        return () => io.disconnect();
    }, [visto]);
    return (
        <div className={`ln-hojas${visto ? ' ln-visto' : ''}`} ref={ref} aria-hidden="true">
            <div className="ln-hoja">
                <span className="ln-hoja-ext"><small>.</small>XML</span>
                {[[18, 52], [24, 40], [18, 60], [24, 34], [18, 46], [24, 30]].map(([a, b], i) => (
                    <span key={i} className="ln-hoja-cod">
                        <span className={`ln-hoja-l ${i % 2 ? 'ln-v' : 'ln-c'}`} style={{ width: `${a}%` }} />
                        <span className="ln-hoja-l" style={{ width: `${b}%` }} />
                    </span>
                ))}
            </div>
            <div className="ln-hoja">
                <span className="ln-hoja-ext"><small>.</small>CEX</span>
                <span className="ln-hoja-chip">CE3X 3.2</span>
                {[86, 64, 78, 52, 70].map((w, i) => <span key={i} className="ln-hoja-l" style={{ width: `${w}%` }} />)}
            </div>
            <div className="ln-hoja">
                <span className="ln-hoja-ext"><small>.</small>PDF</span>
                <span className="ln-mini">{ESCALA.map(l => <i key={l} />)}</span>
                {[80, 58].map((w, i) => <span key={i} className="ln-hoja-l" style={{ width: `${w}%` }} />)}
            </div>
            <div className="ln-hoja">
                <span className="ln-hoja-ext ln-larga">CROQUIS</span>
                <svg className="ln-plano" viewBox="0 0 100 92" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 8h84v76H8z M8 46h40 M48 8v76 M48 58h44 M70 58v26" stroke="#141111" strokeWidth="3.4" />
                    <path d="M20 8h14 M60 8h18 M92 22v14 M8 62v12 M22 84h12 M76 84h10" stroke="#ffa000" strokeWidth="5" />
                </svg>
            </div>
        </div>
    );
}

function Duda({ q, a, id }) {
    const [abierta, setAbierta] = useState(false);
    return (
        <div className={`ln-duda${abierta ? ' ln-duda-abierta' : ''}`}>
            <button type="button" className="ln-duda-q" aria-expanded={abierta} aria-controls={id} onClick={() => setAbierta(v => !v)}>
                <span>{q}</span>
                <span className="ln-duda-ico" aria-hidden="true"><IcoMas size={16} sw={2.4} /></span>
            </button>
            <div className="ln-duda-a" id={id} inert={!abierta}>
                <div><p>{a}</p></div>
            </div>
        </div>
    );
}

export default function Landing() {
    const flota = useNavFlotante();
    return (
        <Papel className="ln">
            <style>{CSS_LANDING}</style>
            <div className={`ln-nav${flota ? ' ln-nav-on' : ''}`}>
                <div className="ln-wrap">
                    <CabeceraPublica derecha={(
                        <div className="ln-nav-der">
                            <Enlace to="/entrar" className="ca-link">Entrar</Enlace>
                            <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-tinta ca-btn-peq ln-desde-600">Crear cuenta</Enlace>
                        </div>
                    )} />
                </div>
            </div>

            <main className="ln-main">
                <section className="ln-hero">
                    <div className="ln-wrap ln-hero-grid">
                        <div>
                            <p className="ln-beta ca-in"><i aria-hidden="true" />Beta para certificadores energéticos</p>
                            <h1 className="ln-h1 ca-in ca-in-2">Tu certificado de eficiencia energética, preparado por IA. Tú lo <span className="ln-mark">revisas</span> y lo firmas.</h1>
                            <p className="ln-sub ca-in ca-in-3">
                                Metes la referencia catastral, contestas un cuestionario corto y subes las fotos de la visita.
                                Te devolvemos el <b>.cex de CE3X 3.2</b> hecho, con su XML, su PDF y el croquis, para que lo revises.
                            </p>
                            <div className="ln-btns ca-in ca-in-4">
                                <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri ln-brillo">Crear mi cuenta gratis <IcoFlecha /></Enlace>
                                <Enlace to="/entrar" className="ca-btn ca-btn-sec">Ya tengo cuenta</Enlace>
                            </div>
                            <p className="ln-nota ca-in ca-in-4">Entras al momento, con Google o con tu email. Tu primer certificado es gratis.</p>
                        </div>
                        <VideoPromo />
                    </div>
                    <div className="ln-wrap">
                        <ul className="ln-hechos">
                            <li><IcoDoc size={18} /><span><b>CE3X 3.2</b>El .cex que abres en tu programa</span></li>
                            <li><IcoMapa size={18} /><span><b>Desde el Catastro</b>Superficie, año, uso y plano</span></li>
                            <li><IcoCamara size={18} /><span><b>Foto a foto</b>En la visita, con el móvil</span></li>
                            <li><IcoEscudo size={18} /><span><b>Tu firma</b>La IA no firma ni registra</span></li>
                        </ul>
                    </div>
                </section>

                <section className="ln-sec" aria-labelledby="ln-t-pasos">
                    <div className="ln-wrap ln-pasos">
                        <header className="ln-cab">
                            <p className="ln-label">Cómo funciona</p>
                            <h2 id="ln-t-pasos" className="ln-h2">De la referencia catastral al certificado firmado, en cuatro pasos.</h2>
                        </header>
                        <Pasos />
                    </div>
                </section>

                <section className="ln-panel" aria-labelledby="ln-t-entrega">
                    <div className="ln-wrap ln-entrega">
                        <div>
                            <p className="ln-label">Qué te entregamos</p>
                            <h2 id="ln-t-entrega" className="ln-h2">Todo lo que necesitas para revisar y firmar.</h2>
                            <ul className="ln-entrega-lista">
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>.cex de CE3X 3.2</b>, con las medidas de mejora.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>XML</b> del certificado y el <b>PDF</b>.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>croquis</b> de la vivienda, con sus fachadas y sus huecos.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>La <b>envolvente editable</b> en la web: cambias un muro o una ventana y se vuelve a generar.</span></li>
                            </ul>
                            <p className="ln-carpeta"><IcoCarpeta size={18} /><span>Todo, en <b>tu carpeta de Drive</b>. Se comparte solo con tu email: dentro van datos de tu cliente.</span></p>
                        </div>
                        <Hojas />
                    </div>
                </section>

                <section className="ln-sec" aria-labelledby="ln-t-para">
                    <div className="ln-wrap">
                        <p className="ln-manif"><span>La IA no firma ni registra nada.</span> El certificado es tuyo.</p>
                        <p className="ln-manif-sub">
                            <span className="ca-ico-tile ca-tile-verde"><IcoEscudo size={20} /></span>
                            Prepara el trabajo de gabinete; tú lo revisas y lo firmas.
                        </p>

                        <header className="ln-cab" style={{ marginTop: 72 }}>
                            <p className="ln-label">Para quién es</p>
                            <h2 id="ln-t-para" className="ln-h2">Para quien hace los certificados, o los encarga.</h2>
                        </header>
                        <div className="ln-para">
                            <div>
                                <span className="ca-ico-tile ca-tile-crema"><IcoUsuario /></span>
                                <span><b>Técnicos autónomos</b><small>Haces tú los certificados y quieres quitarte horas de oficina.</small></span>
                            </div>
                            <div>
                                <span className="ca-ico-tile ca-tile-crema"><IcoCasa /></span>
                                <span><b>Empresas con técnicos</b><small>Repartís el trabajo de gabinete con un mismo criterio.</small></span>
                            </div>
                            <div>
                                <span className="ca-ico-tile ca-tile-crema"><IcoLista /></span>
                                <span><b>Empresas que encargan los CEE</b><small>Gestionáis muchos certificados y los queréis antes y ordenados.</small></span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="ln-sec" aria-labelledby="ln-t-dudas">
                    <div className="ln-wrap ln-faq">
                        <header className="ln-cab">
                            <p className="ln-label">Dudas</p>
                            <h2 id="ln-t-dudas" className="ln-h2">Lo que nos preguntan antes de probarlo.</h2>
                        </header>
                        <div className="ln-dudas">
                            {FAQS.map((f, i) => <Duda key={f.q} id={`ln-duda-${i}`} {...f} />)}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="ln-panel ln-final">
                <div className="ln-wrap">
                    <div className="ln-cta">
                        <h2 className="ln-cta-h">¿Lo <span className="ln-mark">pruebas</span>?</h2>
                        <p>Contestas unas preguntas sobre cómo trabajas (dos minutos) y entras al momento, con Google o con tu email. Tu primer certificado es gratis.</p>
                        <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri ln-brillo">Crear mi cuenta gratis <IcoFlecha /></Enlace>
                    </div>

                    {/* Descargo de responsabilidad (Fran, 26/10/2026): la herramienta no hace el trabajo que el RD 390/2021 pide al técnico. */}
                    <p className="ln-legal">
                        <b>Aviso.</b> {NOMBRE_APP} es una herramienta de apoyo para agilizar el trabajo de gabinete. No sustituye
                        los trabajos ni las obligaciones que el Real Decreto 390/2021, de 1 de junio, por el que se aprueba el procedimiento básico para la certificación de la eficiencia energética de los edificios atribuye al técnico competente: la visita al inmueble, la toma y
                        la comprobación de los datos, la revisión del cálculo y la firma y el registro del certificado. Lo que prepara
                        la IA es un borrador; el técnico que firma el certificado es el responsable de su contenido.
                    </p>

                    {/* El pie: «Powered by BROKERGY» en lugar de la firma de Fran (Fran, 06/11/2026). */}
                    <div className="ln-pie">
                        <a className="ln-powered" href={WEB_BROKERGY} target="_blank" rel="noopener noreferrer">
                            Powered by <img src={LOGO_CLARO} alt="BROKERGY" width="90" height="18" />
                        </a>
                        <ul className="ln-pie-links">
                            <li><Enlace to="/entrar">Entrar</Enlace></li>
                            <li><Enlace to="/beta?origen=landing">Crear cuenta</Enlace></li>
                            <li><Enlace to="/condiciones">Condiciones</Enlace></li>
                            <li><Enlace to="/privacidad">Privacidad</Enlace></li>
                            <li><a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a></li>
                        </ul>
                        <p className="ln-copy">© {new Date().getFullYear()} BROKERGY · Ingeniería energética</p>
                    </div>
                </div>
                <span className="ln-gigante" aria-hidden="true">{NOMBRE_APP}</span>
            </footer>
        </Papel>
    );
}
