// ─── Presentar — el borrador para inscribir el CEE en el Registro (CLM) ──────
// Fran (28/10/2026): «que haya un botón para presentar el certificado y que genere
// un borrador con los datos de la presentación, de momento de Castilla-La Mancha,
// como el borrador que tenemos».
//
// GET …/obras/:id/presentar (services/certapp/presentacion.js) → { borrador, html }:
// el MISMO borrador del CRM (features/expedientes/logic/borradorCee.js) con los
// datos de la obra y de su perfil. Aquí se enseña para copiar casilla a casilla
// mientras se rellena la sede, con los cuatro ficheros que se anexan para bajarlos,
// el enlace a la sede y el PDF (GET …/presentar/pdf). Fuera de CLM, `aplica: false`
// y se dice. Después, el justificante y la etiqueta se suben en «Documentos».
import { useState } from 'react';
import axios from 'axios';
import { API, alPortapapeles, fecha, mensajeError, urlDe, useCarga } from '../api';
import { Aviso, ErrorRed, Esqueleto, Hoja, useToast } from '../ui/piezas';
import { IcoCopiar, IcoDescarga, IcoEnlace, IcoSubir, Spinner } from '../ui/Iconos';

// «Marca **Inscripción**» → «Marca <b>Inscripción</b>».
function ConNegrita({ t }) {
    return String(t || '').split(/\*\*(.+?)\*\*/g).map((s, i) => (i % 2 ? <b key={i}>{s}</b> : s));
}

function Campo({ c }) {
    const toast = useToast();
    const copiar = async () => { if (await alPortapapeles(c.valor)) toast(`${c.campo}: copiado.`); };
    return (
        <li className={`ca-pres-campo${c.valor ? '' : ' ca-pres-vacio'}`}>
            <span className="ca-pres-k">{c.campo}</span>
            <span className="ca-pres-v">
                {c.valor || (c.hueco ? 'Se rellena al pagar' : 'En blanco')}
                {c.nota && <small>{c.nota}</small>}
            </span>
            {c.valor && (
                <button type="button" className="ca-icobtn" onClick={copiar} aria-label={`Copiar ${c.campo}`} title="Copiar"><IcoCopiar size={16} /></button>
            )}
        </li>
    );
}

/**
 * La hoja «Presentar en el Registro».
 * @param {{ obra: object, abierta: boolean, onCerrar: () => void, onSubirJustificante: () => void }} p
 */
export function HojaPresentar({ obra, abierta, onCerrar, onSubirJustificante }) {
    const toast = useToast();
    const [bajando, setBajando] = useState(false);
    // Se pide cada vez que se abre: el perfil o el XML pueden haber cambiado.
    const { datos, error, cargando, recargar } = useCarga(async () => {
        if (!abierta) return null;
        return (await axios.get(`${API}/obras/${obra.id}/presentar`)).data;
    }, [obra.id, abierta]);

    const b = datos?.borrador;
    const bajarPdf = async () => {
        setBajando(true);
        try {
            const r = await axios.get(`${API}/obras/${obra.id}/presentar/pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${obra.numero_expediente || 'CEE'} - BORRADOR PRESENTACIÓN.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (err) {
            toast(mensajeError(err, 'No se ha podido preparar el PDF.'));
        } finally { setBajando(false); }
    };

    return (
        <Hoja abierta={abierta} titulo="Presentar en el Registro" onCerrar={onCerrar} ancho={760}
            pie={b?.aplica ? (
                <div className="ca-btns ca-btns-2">
                    <a className="ca-btn ca-btn-pri" href={b.sede} target="_blank" rel="noreferrer"><IcoEnlace /> Abrir la sede de la JCCM</a>
                    <button type="button" className="ca-btn ca-btn-sec" onClick={bajarPdf} disabled={bajando}>
                        {bajando ? <Spinner /> : <IcoDescarga />} Borrador en PDF
                    </button>
                </div>
            ) : null}>
            {cargando && !datos ? (
                <Esqueleto alto={60} n={4} />
            ) : error && !datos ? (
                <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido preparar el borrador" compacto />
            ) : !b ? null : !b.aplica ? (
                <Aviso tono="ambar" titulo="Solo hay borrador para Castilla-La Mancha">
                    {b.motivo || 'Este certificado se inscribe en otra comunidad.'}
                </Aviso>
            ) : (
                <div className="ca-stack ca-pres">
                    <p className="ca-txt ca-txt-peq" style={{ margin: 0 }}>
                        Es la guía de lo que va en cada casilla del trámite de la JCCM, en su orden: ábrelo en la sede y ve copiando.
                        Los apartados 03 y el de protección de datos los rellena la propia sede.
                    </p>
                    {b.registro && (
                        <Aviso tono="ok" titulo={`Ya está registrado${b.registro.fecha ? ` (${fecha(b.registro.fecha)})` : ''}`}>
                            El justificante está en «Documentos».
                        </Aviso>
                    )}
                    {b.avisos?.length > 0 && (
                        <Aviso tono="ambar" titulo="Antes de presentar">
                            <ul className="ca-pres-avisos">{b.avisos.map(a => <li key={a}>{a}</li>)}</ul>
                        </Aviso>
                    )}

                    {b.apartados.map(ap => (
                        <section key={ap.id} className="ca-pres-ap">
                            <h3 className="ca-sec">{ap.titulo}</h3>
                            {ap.nota && <p className="ca-peq" style={{ margin: '0 0 6px' }}>{ap.nota}</p>}
                            {ap.instrucciones?.map(i => <p key={i} className="ca-pres-instr"><ConNegrita t={i} /></p>)}
                            {ap.campos?.length > 0 && <ul className="ca-pres-campos">{ap.campos.map(c => <Campo key={c.campo} c={c} />)}</ul>}
                            {ap.instruccionesFinal?.map(i => <p key={i} className="ca-pres-instr"><ConNegrita t={i} /></p>)}
                            {ap.original && <p className="ca-peq" style={{ margin: '6px 0 0' }}>Dirección guardada: {ap.original}</p>}
                        </section>
                    ))}

                    <section className="ca-pres-ap">
                        <h3 className="ca-sec">Los documentos que se anexan</h3>
                        <p className="ca-peq" style={{ margin: '0 0 6px' }}>Bájalos y súbelos en el 07.3 con el NIF del titular delante del nombre.</p>
                        <ul className="ca-pres-campos">
                            {b.ficheros.map(f => (
                                <li key={f.clave} className={`ca-pres-campo${f.presente ? '' : ' ca-pres-vacio'}`}>
                                    <span className="ca-pres-k">{f.titulo}</span>
                                    <span className="ca-pres-v">
                                        {f.presente ? f.nombreRegistro : 'No está en la carpeta del certificado'}
                                        {f.nota && <small>{f.nota}</small>}
                                    </span>
                                    {f.presente && f.url
                                        ? <a className="ca-icobtn" href={urlDe(f.url)} download={f.nombreRegistro} aria-label={`Descargar ${f.titulo}`} title="Descargar"><IcoDescarga size={16} /></a>
                                        : <span className="ca-icobtn" aria-hidden="true" />}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="ca-pres-ap ca-pres-fin">
                        <p className="ca-txt" style={{ margin: 0 }}>
                            Cuando lo presentes, sube aquí el <b>justificante</b> (leemos su fecha) y, cuando llegue, la <b>etiqueta</b>.
                            La tasa y las resoluciones, en «Otros».
                        </p>
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={onSubirJustificante}><IcoSubir /> Subir el justificante</button>
                        </div>
                    </section>
                </div>
            )}
        </Hoja>
    );
}

export default HojaPresentar;
