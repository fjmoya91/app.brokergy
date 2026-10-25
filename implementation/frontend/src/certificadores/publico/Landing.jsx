// ─── Landing — cee.brokergy.es/ sin sesión ───────────────────────────────────
// Qué es, cómo funciona, qué entrega, para quién y las dudas, con la llamada a
// crear la cuenta (alta al momento, 1 certificado gratis). Sin testimonios, cifras ni logos inventados: lo que se
// dice aquí es lo que la app hace (docs/conocimiento/certificadores-app/).
//
// En el móvil es la columna de siempre. En el ordenador (≥ 1024 px) se abre a
// lo ancho (`.ca-land`): portada a dos columnas con la maqueta de lo que se
// entrega, pasos en tres tarjetas, entrega y destinatarios lado a lado y las
// dudas con su título a la izquierda. Lo que solo se ve en el PC va con
// `.ca-solo-ancho`; el texto y el orden del móvil no cambian.
import { useState } from 'react';
import { Enlace } from '../router';
import { CabeceraPublica, Firma, Papel } from '../ui/piezas';
import {
    IcoAbajo, IcoCamara, IcoCheck, IcoChispa, IcoDoc, IcoEscudo, IcoFlecha, IcoLista, IcoMapa,
    IcoSello, IcoUsuario, IcoCasa, IcoWhatsApp,
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

/** Croquis de muestra: una planta en L con sus huecos y la orientación de cada fachada. Es ilustrativo. */
function CroquisMuestra() {
    return (
        <svg className="ca-mq-croquis" viewBox="0 0 260 150" role="img" aria-label="Croquis de ejemplo de una vivienda con sus fachadas y sus huecos">
            <defs>
                <pattern id="ca-mq-rejilla" width="13" height="13" patternUnits="userSpaceOnUse">
                    <path d="M13 0H0V13" fill="none" stroke="rgba(20,17,17,.06)" strokeWidth="1" />
                </pattern>
            </defs>
            <rect width="260" height="150" fill="url(#ca-mq-rejilla)" />
            <path d="M70 28H190V82H150V122H70Z" fill="#fff" stroke="#141111" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M120 28V82H70M150 82H120" fill="none" stroke="rgba(20,17,17,.28)" strokeWidth="1.5" strokeDasharray="3 3" />
            {/* huecos */}
            <g stroke="#ffa000" strokeWidth="6" strokeLinecap="butt">
                <path d="M86 28H106" /><path d="M140 28H170" />
                <path d="M190 44V66" />
                <path d="M88 122H112" /><path d="M150 96V112" />
                <path d="M70 52V72" />
            </g>
            <g fontFamily="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fontSize="10" fontWeight="700" fill="#55585f" textAnchor="middle">
                <text x="130" y="16">N</text>
                <text x="130" y="142">S</text>
                <text x="210" y="59">E</text>
                <text x="52" y="66">O</text>
            </g>
        </svg>
    );
}

/** Maqueta de la portada en el PC: lo que recibe el certificador cuando la IA termina. */
function Maqueta() {
    return (
        <div className="ca-mq ca-solo-ancho" aria-hidden="true">
            <div className="ca-mq-fondo" />
            <div className="ca-card ca-mq-card">
                <div className="ca-filete" />
                <div className="ca-fila-top">
                    <p className="ca-eyebrow ca-eyebrow-gris" style={{ margin: 0 }}>CEE inicial</p>
                    <span className="ca-chip ca-chip-verde"><span className="ca-punto" />Listo para revisar</span>
                </div>
                <p className="ca-display ca-mq-tit">Vivienda unifamiliar</p>
                <ul className="ca-mq-pasos">
                    <li><IcoCheck size={15} sw={3} /><span>Catastro: superficie, año y plano</span></li>
                    <li><IcoCheck size={15} sw={3} /><span>Cuestionario y fotos de la visita</span></li>
                    <li><IcoCheck size={15} sw={3} /><span>Envolvente y medidas de mejora</span></li>
                </ul>
                <div className="ca-mq-plano"><CroquisMuestra /></div>
                <div className="ca-mq-ficheros">
                    <span><b>.cex</b>CE3X 3.2</span>
                    <span><b>.xml</b>Certificado</span>
                    <span><b>.pdf</b>Informe</span>
                    <span><b>Croquis</b>Fachadas</span>
                </div>
            </div>
            <div className="ca-mq-aviso">
                <span className="ca-ico-tile ca-tile-verde"><IcoWhatsApp size={18} /></span>
                <span><b>Tu CEE inicial está listo</b><small>Te avisamos por WhatsApp y email</small></span>
            </div>
            <div className="ca-mq-firma">
                <IcoSello size={18} /> Lo firmas tú
            </div>
        </div>
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
                    <Maqueta />
                </div>

                <ul className="ca-land-hechos ca-solo-ancho ca-in ca-in-2">
                    <li><IcoDoc size={18} /><span><b>CE3X 3.2</b>El .cex que abres en tu programa</span></li>
                    <li><IcoMapa size={18} /><span><b>Desde el Catastro</b>Superficie, año, uso y plano</span></li>
                    <li><IcoCamara size={18} /><span><b>Foto a foto</b>En la visita, con el móvil</span></li>
                    <li><IcoEscudo size={18} /><span><b>Tu firma</b>La IA no firma ni registra</span></li>
                </ul>

                <div className="ca-land-cab">
                    <h2 className="ca-sec">Cómo funciona</h2>
                    <p className="ca-display ca-land-h2 ca-solo-ancho">De la referencia catastral al .cex, en tres pasos.</p>
                </div>
                <ol className="ca-pasos3 ca-in ca-in-2">
                    <li>
                        <span className="ca-num3">1</span>
                        <div>
                            <b>La referencia catastral</b>
                            <p>O la dirección, el mapa o el GPS del móvil. Del Catastro sale la superficie, el año, el uso y el plano de la vivienda.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoMapa /></span>
                    </li>
                    <li>
                        <span className="ca-num3">2</span>
                        <div>
                            <b>El cuestionario y las fotos</b>
                            <p>Lo que la IA no puede ver: con qué linda la vivienda, la calefacción, el agua caliente, las ventanas. En la visita, foto a foto con el móvil; sin visita, le mandas un enlace al propietario.</p>
                        </div>
                        <span className="ca-ico-tile ca-tile-crema ca-solo-ancho"><IcoCamara /></span>
                    </li>
                    <li>
                        <span className="ca-num3">3</span>
                        <div>
                            <b>Revisas y firmas</b>
                            <p>Te avisamos por WhatsApp y email cuando está listo. Lo abres en CE3X, lo revisas, lo cambias si hace falta y lo firmas tú.</p>
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
