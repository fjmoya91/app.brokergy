// ─── Landing — cee.brokergy.es/ sin sesión ───────────────────────────────────
// Qué es, cómo funciona, qué entrega, para quién y las dudas, con la llamada a
// crear la cuenta (alta al momento, 1 certificado gratis). Sin testimonios, cifras ni logos inventados: lo que se
// dice aquí es lo que la app hace (docs/conocimiento/certificadores-app/).
//
// En el móvil es la columna de siempre. En el ordenador (≥ 1024 px) se abre a
// lo ancho (`.ca-land`): portada a dos columnas con el vídeo promo al lado del
// titular (en el móvil, debajo), pasos en cuatro tarjetas, entrega y destinatarios lado a lado y las
// dudas con su título a la izquierda. Lo que solo se ve en el PC va con
// `.ca-solo-ancho`.
import { useEffect, useRef, useState } from 'react';
import { Enlace } from '../router';
import { CabeceraPublica, Firma, Papel } from '../ui/piezas';
import {
    IcoAbajo, IcoCamara, IcoCheck, IcoChispa, IcoDoc, IcoEscudo, IcoFlecha, IcoLista, IcoMapa,
    IcoRecargar, IcoSello, IcoSilencio, IcoSonido, IcoUsuario, IcoCasa,
} from '../ui/Iconos';

const FAQS = [
    {
        q: '¿Firma la IA el certificado?',
        a: 'No. La IA prepara el borrador del CEE inicial; tú lo revisas, lo cambias si hace falta y lo firmas, porque el técnico competente eres tú. Nada se registra sin ti.',
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

function Duda({ q, a }) {
    const [abierta, setAbierta] = useState(false);
    return (
        <div className={`ca-faq${abierta ? ' ca-faq-abierta' : ''}`}>
            <button type="button" className="ca-faq-q" aria-expanded={abierta} onClick={() => setAbierta(v => !v)}>
                <span>{q}</span><IcoAbajo />
            </button>
            {abierta && <div className="ca-faq-a">{a}</div>}
        </div>
    );
}

const VIDEO_MUDO = '/certificadores/promo-cee.mp4';
const VIDEO_VOZ = '/certificadores/promo-cee-voz.mp4';

/** El vídeo promo de la portada (implementation/promo-video): 30 s sin sonido, en bucle mientras se ve.
 *  Con «reducir movimiento» no arranca solo: se queda el póster y los controles.
 *  «Activar sonido» cambia a la versión CON VOZ (42 s, otro fichero: la voz pide más tiempo) y la pone
 *  desde el principio, una sola vez: al acabar se queda en la llamada final. El cambio de fichero y el
 *  play() van dentro del clic, que es lo que deja al navegador (Safari sobre todo) sonar. */
function VideoPromo() {
    const ref = useRef(null);
    const [quieto] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
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
        <figure className="ca-land-vid ca-in ca-in-2">
            <div className="ca-land-vid-fondo" aria-hidden="true" />
            <video ref={ref} src={VIDEO_MUDO} poster="/certificadores/promo-cee.jpg" width="540" height="960"
                muted loop playsInline preload="auto" controls={quieto} onEnded={() => setAcabado(true)}
                aria-label="Vídeo: metes los datos de la obra, contestas unas preguntas, se lo envías a la IA y revisas el croquis y firmas desde la web" />
            <button type="button" className={`ca-land-vid-sonido${sonido && !acabado ? ' ca-on' : ''}${quieto ? ' ca-con-controles' : ''}`}
                onClick={pulsar}>
                <Icono size={18} sw={2.2} />{etiqueta}
            </button>
        </figure>
    );
}

export default function Landing() {
    return (
        <Papel className="ca-con-land">
            <div className="ca-col ca-land">
                <CabeceraPublica derecha={(
                    <div className="ca-land-nav">
                        <Enlace to="/entrar" className="ca-link">Entrar</Enlace>
                        <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-tinta ca-btn-peq ca-solo-ancho">Crear cuenta</Enlace>
                    </div>
                )} />

                <div className="ca-land-hero">
                    <section className="ca-hero ca-in">
                        <p className="ca-eyebrow">Beta para certificadores energéticos</p>
                        <h1 className="ca-display ca-h1">Tu CEE inicial, preparado por IA. Tú lo <span className="ca-mark">revisas</span> y lo firmas.</h1>
                        <p className="ca-sub">
                            Metes la referencia catastral, contestas un cuestionario corto y subes las fotos de la visita.
                            Te devolvemos el <b>.cex de CE3X 3.2</b> hecho, con su XML, su PDF y el croquis, para que lo revises.
                        </p>
                        <div className="ca-btns">
                            <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri">Crear mi cuenta gratis <IcoFlecha /></Enlace>
                            <Enlace to="/entrar" className="ca-btn ca-btn-sec">Ya tengo cuenta</Enlace>
                        </div>
                        <p className="ca-peq ca-land-nota">Entras al momento, con Google o con tu email. Tu primer certificado es gratis.</p>
                    </section>
                    <VideoPromo />
                </div>

                <ul className="ca-land-hechos ca-solo-ancho ca-in ca-in-2">
                    <li><IcoDoc size={18} /><span><b>CE3X 3.2</b>El .cex que abres en tu programa</span></li>
                    <li><IcoMapa size={18} /><span><b>Desde el Catastro</b>Superficie, año, uso y plano</span></li>
                    <li><IcoCamara size={18} /><span><b>Foto a foto</b>En la visita, con el móvil</span></li>
                    <li><IcoEscudo size={18} /><span><b>Tu firma</b>La IA no firma ni registra</span></li>
                </ul>

                <div className="ca-land-cab">
                    <h2 className="ca-sec">Cómo funciona</h2>
                    <p className="ca-display ca-land-h2 ca-solo-ancho">De la referencia catastral al certificado firmado, en cuatro pasos.</p>
                </div>
                <ol className="ca-pasos3 ca-pasos4 ca-in ca-in-2">
                    <li>
                        <span className="ca-num3">1</span>
                        <div>
                            <b>Metes los datos de la obra</b>
                            <p>La referencia catastral, o la dirección, el mapa o el GPS del móvil. Del Catastro sale la superficie, el año, el uso y el plano de la vivienda.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoMapa /></span>
                    </li>
                    <li>
                        <span className="ca-num3">2</span>
                        <div>
                            <b>Contestas unas preguntas y subes las fotos</b>
                            <p>Lo que la IA no puede ver: con qué linda la vivienda, la calefacción, el agua caliente, las ventanas. En la visita, foto a foto con el móvil; sin visita, le mandas un enlace al propietario.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoCamara /></span>
                    </li>
                    <li>
                        <span className="ca-num3">3</span>
                        <div>
                            <b>Se lo envías a la IA</b>
                            <p>Prepara la envolvente, las instalaciones y las medidas de mejora en CE3X 3.2. Te avisamos por WhatsApp y email cuando está listo.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoChispa /></span>
                    </li>
                    <li>
                        <span className="ca-num3">4</span>
                        <div>
                            <b>Revisas el croquis y lo firmas</b>
                            <p>Te devolvemos el .cex, el XML, el PDF y el croquis. Si el croquis está bien, firmas el PDF desde la web con AutoFirma; si algo no cuadra, lo cambias en la envolvente o en tu CE3X.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoSello /></span>
                    </li>
                </ol>

                <div className="ca-land-dos">
                    <div>
                        <div className="ca-land-cab">
                            <h2 className="ca-sec">Qué te entregamos</h2>
                            <p className="ca-display ca-land-h2 ca-solo-ancho">Todo lo que necesitas para revisar y firmar.</p>
                        </div>
                        <div className="ca-card ca-pad ca-in ca-in-3 ca-land-entrega">
                            <div className="ca-filete" />
                            <div className="ca-fila-top">
                                <p className="ca-eyebrow ca-eyebrow-verde">En tu carpeta de Drive</p>
                                <span className="ca-ico-tile ca-tile-verde"><IcoChispa /></span>
                            </div>
                            <ul className="ca-lista">
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>.cex de CE3X 3.2</b>, con las medidas de mejora.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>XML</b> del certificado y el <b>PDF</b>.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>El <b>croquis</b> de la vivienda, con sus fachadas y sus huecos.</span></li>
                                <li><IcoCheck size={18} sw={2.6} /><span>La <b>envolvente editable</b> en la web: cambias un muro o una ventana y se vuelve a generar.</span></li>
                            </ul>
                            <p className="ca-peq" style={{ marginTop: 10 }}>La carpeta se comparte solo con tu email: dentro van datos de tu cliente.</p>
                        </div>
                    </div>

                    <div>
                        <div className="ca-land-cab">
                            <h2 className="ca-sec">Para quién es</h2>
                            <p className="ca-display ca-land-h2 ca-solo-ancho">Para quien hace los certificados, o los encarga.</p>
                        </div>
                        <div className="ca-para ca-in ca-in-4">
                            <div className="ca-fila" style={{ cursor: 'default' }}>
                                <span className="ca-ico-tile ca-tile-crema"><IcoUsuario /></span>
                                <span><b>Técnicos autónomos</b><small>Haces tú los certificados y quieres quitarte horas de oficina.</small></span>
                            </div>
                            <div className="ca-fila" style={{ cursor: 'default' }}>
                                <span className="ca-ico-tile ca-tile-crema"><IcoCasa /></span>
                                <span><b>Empresas con técnicos</b><small>Repartís el trabajo de gabinete con un mismo criterio.</small></span>
                            </div>
                            <div className="ca-fila" style={{ cursor: 'default' }}>
                                <span className="ca-ico-tile ca-tile-crema"><IcoLista /></span>
                                <span><b>Empresas que encargan los CEE</b><small>Gestionáis muchos certificados y los queréis antes y ordenados.</small></span>
                            </div>
                        </div>

                        <div className="ca-aviso ca-aviso-info" style={{ marginTop: 14 }}>
                            <span className="ca-ico-tile"><IcoEscudo size={18} /></span>
                            <div><b>La IA no firma ni registra nada.</b> Prepara el trabajo de gabinete; el certificado es tuyo.</div>
                        </div>
                    </div>
                </div>

                <div className="ca-land-faq">
                    <div className="ca-land-cab">
                        <h2 className="ca-sec">Dudas</h2>
                        <p className="ca-display ca-land-h2 ca-solo-ancho">Lo que nos preguntan antes de probarlo.</p>
                    </div>
                    <div>
                        {FAQS.map(f => <Duda key={f.q} {...f} />)}
                    </div>
                </div>

                <div className="ca-card ca-pad ca-land-cta">
                    <div className="ca-filete" />
                    <div>
                        <h2 className="ca-display ca-h2">¿Lo <span className="ca-mark">pruebas</span>?</h2>
                        <p className="ca-txt">Contestas unas preguntas sobre cómo trabajas (dos minutos) y entras al momento, con Google o con tu email. Tu primer certificado es gratis.</p>
                    </div>
                    <div className="ca-btns">
                        <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri">Crear mi cuenta gratis <IcoFlecha /></Enlace>
                    </div>
                </div>

                <Firma />
            </div>
        </Papel>
    );
}
