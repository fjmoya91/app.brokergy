// ─── Privacidad — lo que se enlaza desde el consentimiento de la beta ───────
// ⚠️ Texto informativo BÁSICO escrito para la beta: lo tiene que revisar quien
// lleve la protección de datos de BROKERGY antes de abrir la beta al público.
import { CabeceraPublica, Firma, Papel } from '../ui/piezas';
import { EMAIL_CONTACTO, NOMBRE_APP } from '../marca';

export default function Privacidad() {
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <article className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Protección de datos</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Privacidad de {NOMBRE_APP}</h1>
                    <dl className="ca-dl" style={{ marginTop: 16 }}>
                        <div><dt>Responsable</dt><dd>BROKERGY · Ingeniería energética</dd></div>
                        <div><dt>Contacto</dt><dd><a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a></dd></div>
                    </dl>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 22 }}>Lista de espera de la beta</h2>
                    <p className="ca-txt">
                        Con los datos del formulario gestionamos la lista de espera, te escribimos cuando tengas plaza y usamos
                        tus respuestas (sin tu nombre) para decidir cómo preparar la app. La base es tu consentimiento, que
                        puedes retirar cuando quieras. Las novedades de la app solo te llegan si lo marcas.
                    </p>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 22 }}>Tu cuenta y tus obras</h2>
                    <p className="ca-txt">
                        Los datos de cada obra (los del inmueble, los del titular del certificado y las fotos) se usan para
                        preparar el certificado que pides. Se guardan en nuestra base de datos y en una carpeta de Google Drive
                        compartida solo con tu email. Para prepararlos intervienen herramientas de inteligencia artificial y el
                        equipo de BROKERGY que revisa el resultado. Tú eres responsable de tener permiso del titular para
                        tratar sus datos al encargarnos el certificado.
                    </p>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 22 }}>Tus derechos</h2>
                    <p className="ca-txt">
                        Puedes pedir ver, corregir o borrar tus datos, oponerte a su uso o pedir que te los entreguemos,
                        escribiendo a <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>. Si crees que no los tratamos bien,
                        puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
                    </p>
                </article>
                <Firma />
            </div>
        </Papel>
    );
}
