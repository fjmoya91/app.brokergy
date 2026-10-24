// ─── Landing — cee.brokergy.es/ sin sesión ───────────────────────────────────
// Qué es, cómo funciona, qué entrega, para quién y las dudas, con la llamada a
// apuntarse a la beta. Sin testimonios, cifras ni logos inventados: lo que se
// dice aquí es lo que la app hace (docs/conocimiento/certificadores-app/).
import { useState } from 'react';
import { Enlace } from '../router';
import { CabeceraPublica, Firma, Papel } from '../ui/piezas';
import { IcoAbajo, IcoCheck, IcoChispa, IcoEscudo, IcoFlecha, IcoUsuario, IcoCasa, IcoLista } from '../ui/Iconos';

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
        a: 'Durante la beta es gratis: cada cuenta tiene unos certificados de prueba. El precio de después aún no está decidido; te lo contaremos antes de que tengas que pagar nada.',
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

export default function Landing() {
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica derecha={<Enlace to="/entrar" className="ca-link">Entrar</Enlace>} />

                <section className="ca-hero ca-in">
                    <p className="ca-eyebrow">Beta para certificadores energéticos</p>
                    <h1 className="ca-display ca-h1">Tu CEE inicial, preparado por IA. Tú lo <span className="ca-mark">revisas</span> y lo firmas.</h1>
                    <p className="ca-sub">
                        Metes la referencia catastral, contestas un cuestionario corto y subes las fotos de la visita.
                        Te devolvemos el <b>.cex de CE3X 3.2</b> hecho, con su XML, su PDF y el croquis, para que lo revises.
                    </p>
                    <div className="ca-btns">
                        <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri">Apuntarme a la beta <IcoFlecha /></Enlace>
                        <Enlace to="/entrar" className="ca-btn ca-btn-sec">Ya tengo cuenta</Enlace>
                    </div>
                    <p className="ca-peq" style={{ margin: '12px 4px 0', textAlign: 'center' }}>Beta gratuita, con certificados de prueba.</p>
                </section>

                <h2 className="ca-sec">Cómo funciona</h2>
                <ol className="ca-pasos3 ca-in ca-in-2">
                    <li>
                        <span className="ca-num3">1</span>
                        <div>
                            <b>La referencia catastral</b>
                            <p>O la dirección, el mapa o el GPS del móvil. Del Catastro sale la superficie, el año, el uso y el plano de la vivienda.</p>
                        </div>
                    </li>
                    <li>
                        <span className="ca-num3">2</span>
                        <div>
                            <b>El cuestionario y las fotos</b>
                            <p>Lo que la IA no puede ver: con qué linda la vivienda, la calefacción, el agua caliente, las ventanas. En la visita, foto a foto con el móvil; sin visita, le mandas un enlace al propietario.</p>
                        </div>
                    </li>
                    <li>
                        <span className="ca-num3">3</span>
                        <div>
                            <b>Revisas y firmas</b>
                            <p>Te avisamos por WhatsApp y email cuando está listo. Lo abres en CE3X, lo revisas, lo cambias si hace falta y lo firmas tú.</p>
                        </div>
                    </li>
                </ol>

                <h2 className="ca-sec">Qué te entregamos</h2>
                <div className="ca-card ca-pad ca-in ca-in-3">
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

                <h2 className="ca-sec">Para quién es</h2>
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

                <h2 className="ca-sec">Dudas</h2>
                <div>
                    {FAQS.map(f => <Duda key={f.q} {...f} />)}
                </div>

                <div className="ca-card ca-pad" style={{ marginTop: 24 }}>
                    <div className="ca-filete" />
                    <h2 className="ca-display ca-h2">¿Te <span className="ca-mark">apuntas</span>?</h2>
                    <p className="ca-txt">Son unas preguntas sobre cómo trabajas. Abrimos plazas poco a poco y te escribimos cuando tengas la tuya.</p>
                    <div className="ca-btns">
                        <Enlace to="/beta?origen=landing" className="ca-btn ca-btn-pri">Apuntarme a la beta <IcoFlecha /></Enlace>
                    </div>
                </div>

                <Firma />
            </div>
        </Papel>
    );
}
