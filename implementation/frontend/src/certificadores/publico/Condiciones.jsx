// ─── Condiciones — las condiciones de uso de la beta (/condiciones) ─────────
// Se aceptan al crear la cuenta (el formulario de la beta) y quedan en
// `certapp_cuentas.prefs.condiciones` con su versión (CONDICIONES_VERSION en
// services/certapp/cuentas.js: si cambia el texto, cambia la versión en los dos).
// Incluye el encargo de tratamiento (art. 28 RGPD) de los datos de los
// titulares y de los inmuebles que sube el certificador.
// El texto (`TextoCondiciones`) se pinta también DENTRO de una ventana
// (LeerLegal.jsx) desde el formulario de la beta y el perfil, para leerlo sin
// salir de la pantalla (Fran, 25/10/2026: antes se abría otra pestaña).
// ⚠️ Texto BÁSICO escrito para la beta (24/10/2026): lo tiene que revisar el
// asesor legal de BROKERGY antes de abrir la beta al público.
import { CabeceraPublica, Firma, Papel } from '../ui/piezas';
import { Enlace } from '../router';
import { EMAIL_CONTACTO, NOMBRE_APP } from '../marca';

export const CONDICIONES_FECHA = '24/10/2026';

function Apartado({ titulo, children }) {
    return (
        <>
            <h2 className="ca-display ca-h3" style={{ marginTop: 22 }}>{titulo}</h2>
            {children}
        </>
    );
}

/**
 * El texto de las condiciones. `onPrivacidad`: dentro de una ventana, el enlace
 * a la privacidad cambia de texto en vez de navegar.
 */
export function TextoCondiciones({ onPrivacidad }) {
    const mail = <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>;
    return (
        <>
            <dl className="ca-dl">
                <div><dt>Quién lo presta</dt><dd>BROKERGY · Ingeniería energética</dd></div>
                <div><dt>Contacto</dt><dd>{mail}</dd></div>
            </dl>

            <Apartado titulo="1. Qué es">
                <p className="ca-txt">
                    {NOMBRE_APP} prepara, con ayuda de inteligencia artificial y revisado por el equipo de BROKERGY, un
                    borrador del certificado de eficiencia energética de un inmueble existente (el .cex de CE3X, su XML, su
                    PDF y el croquis) con los datos, las respuestas y las fotos que tú aportas.
                </p>
            </Apartado>

            <Apartado titulo="2. El certificado es tuyo">
                <p className="ca-txt">
                    El técnico competente eres tú. Lo que te entregamos es un borrador: lo revisas, lo corriges si hace
                    falta, y lo firmas y lo registras tú, con la responsabilidad que te da la normativa de certificación
                    energética. Ni la IA ni BROKERGY firman ni registran nada en tu nombre.
                </p>
            </Apartado>

            <Apartado titulo="3. Es una beta">
                <p className="ca-txt">
                    La app está en pruebas: puede tener errores, cambiar o pararse un tiempo, y los plazos de entrega son
                    orientativos. Para eso está el apartado de incidencias: cuéntanos lo que falle o lo que mejorarías.
                    Podemos usar libremente tus sugerencias para mejorar la app.
                </p>
            </Apartado>

            <Apartado titulo="4. Certificados gratis y precio">
                <p className="ca-txt">
                    Cada cuenta de la beta tiene un certificado gratis. Pedir uno gasta un crédito; si no llegamos a
                    entregártelo, te lo devolvemos. Los siguientes serán de pago: te diremos el precio antes, y no se te
                    cobrará nada que no hayas aceptado.
                </p>
            </Apartado>

            <Apartado titulo="5. Uso correcto">
                <p className="ca-txt">
                    Una cuenta es de una persona: no compartas el acceso. Los datos que aportes tienen que ser ciertos y
                    tienes que contar con el permiso del titular del inmueble para encargar su certificado. Podemos
                    suspender una cuenta que se use para otra cosa o de forma abusiva.
                </p>
            </Apartado>

            <Apartado titulo="6. Los datos de tus clientes (encargo de tratamiento)">
                <p className="ca-txt">
                    De los datos del titular, del inmueble y de las fotos que subes, el responsable eres tú. BROKERGY los
                    trata por encargo tuyo y solo para preparar el certificado que pides: con confidencialidad, con
                    medidas de seguridad adecuadas, sin cederlos a nadie más y avisándote si hubiera un problema de
                    seguridad que les afecte. Para hacerlo usamos proveedores que tratan los datos por cuenta nuestra
                    (almacenamiento en Google Drive, la base de datos y los servicios de inteligencia artificial), con las
                    mismas obligaciones. Te ayudamos a atender los derechos de los titulares, y cuando cierres tu cuenta
                    borramos o te devolvemos sus datos, como prefieras, salvo lo que la ley nos obligue a guardar.
                </p>
            </Apartado>

            <Apartado titulo="7. Tus documentos">
                <p className="ca-txt">
                    Los documentos que te entregamos son para tu trabajo y van a una carpeta de Drive compartida solo con
                    tu email. Podemos usar información agregada y sin datos personales para mejorar el servicio.
                </p>
            </Apartado>

            <Apartado titulo="8. Responsabilidad">
                <p className="ca-txt">
                    Preparamos cada borrador con cuidado, pero no respondemos de lo que resulte de firmar o registrar un
                    certificado sin revisarlo. Nada de esto limita los derechos que te reconozca la ley.
                </p>
            </Apartado>

            <Apartado titulo="9. Baja y cambios">
                <p className="ca-txt">
                    Puedes darte de baja cuando quieras escribiendo a {mail}. Si cambiamos estas condiciones te lo diremos
                    antes de que se apliquen. Se rigen por la ley española.
                </p>
            </Apartado>

            <p className="ca-peq" style={{ marginTop: 22 }}>
                Cómo tratamos tus propios datos:{' '}
                {onPrivacidad
                    ? <button type="button" className="ca-link" style={{ minHeight: 0, fontSize: 13 }} onClick={onPrivacidad}>política de privacidad</button>
                    : <Enlace to="/privacidad">política de privacidad</Enlace>}.
            </p>
        </>
    );
}

export default function Condiciones() {
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <article className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Beta · versión del {CONDICIONES_FECHA}</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8, marginBottom: 16 }}>Condiciones de uso de {NOMBRE_APP}</h1>
                    <TextoCondiciones />
                </article>
                <Firma />
            </div>
        </Papel>
    );
}
