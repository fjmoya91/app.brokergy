// ─── Documentos — lo que hay en «1. CEE» de la obra, con su visor de PDF ────
// Fran (26/10/2026): «un apartado para ver los documentos, un visor de PDF para
// ver el certificado, y que el mismo visor ya me permita darle a firmar… y subir
// el .cex nuevo o la última versión… para el certificador e incluso nosotros
// como admin». Lo usan ObraCerrada (el certificador) y ObraAdmin (BROKERGY).
//
//   · useDocumentos   (documentosComun.js) GET …/obras/:id/documentos
//                     (services/certapp/documentos.js): lo actual de cada clase,
//                     las versiones anteriores y los .cex del certificador en
//                     cuarentena, con descargas firmadas.
//   · ListaDocumentos el apartado: certificado (firmado o no), XML, .cex, croquis,
//                     «Subir versión nueva», sus .cex y «Versiones anteriores».
//   · VisorPdf        (obra/VisorPdf.jsx) pantalla completa con el visor de pdf.js
//                     (páginas, miniaturas, buscar, zoom, descargar) y un
//                     pie que pone quien lo abre: el «Firmar con AutoFirma».
//   · «Presentación en el Registro» (28/10/2026): el justificante y la etiqueta, y
//     «Otros» (la tasa, las resoluciones…). El certificador los suelta en su zona
//     (arrastrando o al tocarla): POST …/obras/:id/documentos/:clase
//     (services/certapp/presentacion.js). El admin los ve, sin subir.
//
// REGLA — el PDF se pinta AQUÍ, nunca abriendo la descarga en otra pestaña: /fichero
// sale con `CSP: sandbox` (services/certapp/tipos.js) y Chrome no deja pintar un PDF
// así (ERR_BLOCKED_BY_CLIENT, la 2026EXT_1). El visor pide los BYTES y pdf.js los
// pinta; los botones de «Descargar» llevan `download`.
// pdf.js pesa: se carga al abrir el visor, como el modal de firma.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { fecha, urlDe } from '../api';
import { Aviso, ErrorRed, Esqueleto } from '../ui/piezas';
import {
    IcoCarpeta, IcoDescarga, IcoDoc, IcoMas, IcoMenos, IcoPlano, IcoSello, IcoSubir, Spinner,
} from '../ui/Iconos';
import { CLASES, autorTxt } from './documentosComun';

const pesoTxt = (b) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/* ── Una fila ─────────────────────────────────────────────────────────────── */
function FilaDoc({ ico, tile = 'ca-tile-crema', titulo, detalle, chip, children }) {
    return (
        <li className="ca-doc">
            <span className={`ca-ico-tile ${tile}`} aria-hidden="true">{ico}</span>
            <span className="ca-doc-txt">
                <b>{titulo}</b>
                {detalle && <small>{detalle}</small>}
                {chip && <span className="ca-doc-chip">{chip}</span>}
            </span>
            <span className="ca-doc-acc">{children}</span>
        </li>
    );
}

const Descargar = ({ doc, etiqueta = 'Descargar', sec = true }) => (
    <a className={`ca-btn ${sec ? 'ca-btn-sec' : 'ca-btn-pri'}`} href={urlDe(doc.url)} download={doc.nombre} aria-label={`Descargar ${doc.nombre}`}>
        <IcoDescarga size={16} /> {etiqueta}
    </a>
);
const EnDrive = ({ doc }) => (doc.drive ? (
    <a className="ca-icobtn" href={doc.drive} target="_blank" rel="noreferrer" title="Abrir en Drive (solo ADMIN)" aria-label="Abrir en Drive"><IcoCarpeta size={16} /></a>
) : null);

/**
 * Una zona donde soltar un archivo (o tocarla para elegirlo).
 * @param {(f: File) => void} onFichero
 */
function ZonaSoltar({ id, titulo, detalle, acepta, ocupado, onFichero, children }) {
    const [sobre, setSobre] = useState(false);
    const input = useRef(null);
    const soltar = (e) => {
        e.preventDefault(); setSobre(false);
        const f = e.dataTransfer?.files?.[0];
        if (f && !ocupado) onFichero(f);
    };
    return (
        <div id={id} className={`ca-soltar${sobre ? ' ca-soltar-sobre' : ''}${ocupado ? ' ca-soltar-ocupado' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!sobre) setSobre(true); }}
            onDragLeave={() => setSobre(false)} onDrop={soltar}>
            <button type="button" className="ca-soltar-boton" disabled={ocupado} onClick={() => input.current?.click()}>
                <span className="ca-ico-tile ca-tile-crema" aria-hidden="true">{ocupado ? <Spinner size={18} /> : <IcoSubir />}</span>
                <span><b>{ocupado ? 'Subiendo…' : titulo}</b><small>{sobre ? 'Suéltalo aquí' : detalle}</small></span>
            </button>
            {children}
            <input ref={input} type="file" hidden accept={acepta}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFichero(f); }} />
        </div>
    );
}

/** Lo que devuelve el Registro y «Otros». `registro` (solo el certificador): `{ subir(clase, f, nombre?), subiendo, error }`. */
function DelRegistro({ d, onVer, registro }) {
    const [nombre, setNombre] = useState('');
    const { justificante, etiqueta, otros = [], registro: reg } = d;
    const subiendo = registro?.subiendo;
    const verODescargar = (doc) => (doc.pdf
        ? <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(doc)}>Ver</button>
        : <Descargar doc={doc} />);
    if (!registro && !justificante && !etiqueta && !otros.length) return null;
    return (
        <div id="registro" style={{ marginTop: 18 }}>
            <p className="ca-docs-sub">Presentación en el Registro</p>
            <ul className="ca-docs">
                {justificante && (
                    <FilaDoc ico={<IcoSello />} tile="ca-tile-verde" titulo={CLASES.justificante}
                        detalle={reg?.fecha ? `Registrado el ${fecha(reg.fecha)}${reg.leida ? '' : ' (fecha de la subida: no se pudo leer)'}${reg.numero ? ` · Nº ${reg.numero}` : ''}` : fecha(justificante.fecha, true)}
                        chip={<span className="ca-chip ca-chip-verde">Registrado</span>}>
                        {verODescargar(justificante)}<EnDrive doc={justificante} />
                    </FilaDoc>
                )}
                {etiqueta && (
                    <FilaDoc ico={<IcoDoc />} tile="ca-tile-verde" titulo={CLASES.etiqueta} detalle={fecha(etiqueta.fecha, true)}>
                        {verODescargar(etiqueta)}<EnDrive doc={etiqueta} />
                    </FilaDoc>
                )}
            </ul>
            {registro && (
                <div className="ca-soltar-par">
                    <ZonaSoltar id="soltar-justificante" titulo={justificante ? 'Sustituir el justificante' : 'Justificante de registro'}
                        detalle="El PDF que da la sede al presentarlo. Leemos su fecha." acepta=".pdf,application/pdf"
                        ocupado={subiendo === 'justificante'} onFichero={(f) => registro.subir('justificante', f)} />
                    <ZonaSoltar id="soltar-etiqueta" titulo={etiqueta ? 'Sustituir la etiqueta' : 'Etiqueta energética'}
                        detalle="Cuando te llegue de la JCCM, en PDF." acepta=".pdf,application/pdf,image/jpeg,image/png"
                        ocupado={subiendo === 'etiqueta'} onFichero={(f) => registro.subir('etiqueta', f)} />
                </div>
            )}

            {(registro || otros.length > 0) && <p className="ca-docs-sub">Otros</p>}
            {otros.length > 0 && (
                <ul className="ca-docs">
                    {otros.map(doc => (
                        <FilaDoc key={doc.id} ico={<IcoDoc />} titulo={doc.nombre.replace(/^.*? - /, '').replace(/\.[a-z0-9]+$/i, '')}
                            detalle={`${fecha(doc.fecha, true)} · ${pesoTxt(doc.bytes)}`}>
                            {verODescargar(doc)}<EnDrive doc={doc} />
                        </FilaDoc>
                    ))}
                </ul>
            )}
            {registro && (
                <ZonaSoltar id="soltar-otros" titulo="Subir otro documento" detalle="La tasa, una resolución, un requerimiento… En PDF o foto."
                    acepta=".pdf,application/pdf,image/*" ocupado={subiendo === 'otros'}
                    onFichero={async (f) => { if (await registro.subir('otros', f, nombre)) setNombre(''); }}>
                    <label className="ca-soltar-nombre">
                        <span className="ca-label">Nombre <small>· opcional; si no, el del archivo</small></span>
                        <input className="ca-input" value={nombre} maxLength={80} onChange={e => setNombre(e.target.value)} placeholder="Por ejemplo: TASA" />
                    </label>
                </ZonaSoltar>
            )}
            {registro?.error && <p className="ca-error" role="alert">{registro.error}</p>}
        </div>
    );
}

/**
 * El apartado «Documentos».
 * @param {object}   d         lo que devuelve useDocumentos
 * @param {(doc, opciones?) => void} onVer   abre el visor (`{ firmar: true }` en el certificado sin firmar)
 * @param {boolean}  admin
 * @param {boolean}  puedeFirmar  el certificador, con la obra entregada
 * @param {object}   [subida]  `{ subir(fichero), subiendo, error }` (solo el certificador)
 * @param {object}   [registro] `{ subir(clase, fichero, nombre?) → Promise<boolean>, subiendo: clase|null, error }` (solo el certificador)
 */
export function ListaDocumentos({ d, cargando, error, recargar, onVer, admin = false, puedeFirmar = false, subida = null, registro = null }) {
    const [verOld, setVerOld] = useState(false);
    const input = useRef(null);
    if (cargando && !d) return <Esqueleto alto={68} n={3} />;
    if (error && !d) return <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido leer los documentos" compacto />;
    if (!d) return null;

    const { certificado, firmado, xml, cex, croquis, anteriores = [], cuarentena = [], firma, firma_anterior: firmaAnterior, xml_resumen: xr } = d;
    const quien = (doc) => `${fecha(doc.fecha, true)} · ${autorTxt(doc.autor, admin)}`;

    return (
        <div>
            {!d.hay && <p className="ca-txt ca-txt-peq" style={{ marginTop: 10 }}>Todavía no hay documentos en la carpeta del certificado.</p>}
            <ul className="ca-docs">
                {(firmado || certificado) && (
                    <FilaDoc
                        ico={firmado ? <IcoSello /> : <IcoDoc />}
                        tile={firmado ? 'ca-tile-verde' : 'ca-tile-naranja'}
                        titulo="Certificado energético"
                        detalle={firmado
                            ? `Firmado${firma?.firmante ? ` por ${firma.firmante}` : ''} el ${fecha(firma?.at || firmado.fecha, true)}${admin && firma?.coincide === false ? ' · ⚠ no parece el certificador' : ''}`
                            : `Sin firmar · versión del ${fecha(certificado.fecha, true)}`}
                        chip={firmado
                            ? <span className="ca-chip ca-chip-verde">Firmado</span>
                            : <span className="ca-chip ca-chip-naranja">{firmaAnterior ? 'Nuevo: firmaste una versión anterior' : 'Sin firmar'}</span>}
                    >
                        {!firmado && puedeFirmar
                            ? <button type="button" className="ca-btn ca-btn-pri" onClick={() => onVer(certificado, { firmar: true })}><IcoSello size={16} /> Ver y firmar</button>
                            : <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(firmado || certificado)}>Ver</button>}
                        <EnDrive doc={firmado || certificado} />
                    </FilaDoc>
                )}
                {firmado && certificado && (
                    <li style={{ margin: '-2px 0 0 4px' }}>
                        <button type="button" className="ca-link ca-txt-peq" onClick={() => onVer(certificado)}>Ver el original sin firmar ({fecha(certificado.fecha, true)})</button>
                    </li>
                )}
                {xml && (
                    <FilaDoc ico={<IcoDoc />} titulo={CLASES.xml}
                        detalle={[xr && (xr.consumo || xr.emisiones) ? `${xr.consumo || '—'} en consumo · ${xr.emisiones || '—'} en emisiones` : null,
                            xr?.consumo_kwh_m2 != null ? `${String(xr.consumo_kwh_m2).replace('.', ',')} kWh/m²·año` : null,
                            quien(xml)].filter(Boolean).join(' · ')}>
                        <Descargar doc={xml} /><EnDrive doc={xml} />
                    </FilaDoc>
                )}
                {cex && (
                    <FilaDoc ico={<IcoDescarga />} titulo={CLASES.cex} detalle={`Para abrirlo en CE3X 3.2 · ${quien(cex)}`}>
                        <Descargar doc={cex} /><EnDrive doc={cex} />
                    </FilaDoc>
                )}
                {croquis && (
                    <FilaDoc ico={<IcoPlano />} titulo={CLASES.croquis} detalle={quien(croquis)}>
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(croquis)}>Ver</button><EnDrive doc={croquis} />
                    </FilaDoc>
                )}
            </ul>

            {subida && (
                <div style={{ marginTop: 18 }}>
                    <p className="ca-docs-sub">¿Lo has terminado en tu CE3X?</p>
                    <p className="ca-txt ca-txt-peq" style={{ margin: '6px 0 0' }}>
                        Sube el <b>XML</b> o el <b>PDF</b> (firmado o no): pasa a ser el actual y lo anterior queda en «Versiones anteriores».
                        Tu <b>.cex</b> se guarda aparte, como copia tuya: no lo abrimos ni sustituye al nuestro.
                    </p>
                    <input ref={input} type="file" hidden accept=".xml,.pdf,.cex,application/pdf,text/xml,application/xml"
                        onChange={(e) => { subida.subir(e.target.files?.[0]); e.target.value = ''; }} />
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-sec" disabled={subida.subiendo} onClick={() => input.current?.click()}>
                            {subida.subiendo ? <Spinner /> : <IcoSubir />} {subida.subiendo ? 'Subiendo…' : 'Subir versión nueva'}
                        </button>
                    </div>
                    {subida.error && <p className="ca-error" role="alert">{subida.error}</p>}
                </div>
            )}

            <DelRegistro d={d} onVer={onVer} registro={registro} />

            {cuarentena.length > 0 && (
                <>
                    <p className="ca-docs-sub">{admin ? '.cex que ha subido el certificador' : 'Tus .cex guardados'}</p>
                    {admin && (
                        <Aviso tono="ambar" titulo="No abrir con CE3X sin revisarlo" className="ca-stack">
                            Vienen de fuera: un .cex ejecuta lo que lleva al abrirlo. Se guardan como copia del certificador y nada de la app los abre.
                        </Aviso>
                    )}
                    <ul className="ca-docs ca-docs-old">
                        {cuarentena.map(doc => (
                            <FilaDoc key={doc.id} ico={<IcoDescarga />} titulo={doc.nombre} detalle={`${fecha(doc.fecha, true)} · ${pesoTxt(doc.bytes)}`}>
                                <Descargar doc={doc} /><EnDrive doc={doc} />
                            </FilaDoc>
                        ))}
                    </ul>
                </>
            )}

            {anteriores.length > 0 && (
                <>
                    <button type="button" className="ca-docs-mas" aria-expanded={verOld} onClick={() => setVerOld(v => !v)}>
                        {verOld ? <IcoMenos size={14} /> : <IcoMas size={14} />} Versiones anteriores ({anteriores.length})
                    </button>
                    {verOld && (
                        <ul className="ca-docs ca-docs-old">
                            {anteriores.map(doc => (
                                <FilaDoc key={doc.id} ico={doc.clase === 'firmado' ? <IcoSello /> : <IcoDoc />} titulo={CLASES[doc.clase] || doc.nombre}
                                    detalle={`${quien(doc)}${admin ? ` · ${doc.nombre}` : ''}`}>
                                    {doc.pdf
                                        ? <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(doc)}>Ver</button>
                                        : <Descargar doc={doc} />}
                                    <EnDrive doc={doc} />
                                </FilaDoc>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
