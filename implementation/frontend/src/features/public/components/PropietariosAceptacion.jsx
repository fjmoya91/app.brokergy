// ─── PropietariosAceptacion.jsx ──────────────────────────────────────────────
// En la aceptación de la propuesta (/firma/:id): "¿La vivienda tiene más de un
// propietario?" y, si la tiene, los datos de cada uno — y su cuenta, si su
// parte del bono se le ingresa por separado.
//
// POR QUÉ SE PREGUNTA AQUÍ: para la deducción del IRPF cada propietario se
// aplica la suya y hacen falta su nombre y su DNI; y hay casos en que el bono
// CAE se paga en partidas separadas, una por propietario y cada una a su cuenta.
// Pedirlo el día de pagar es tarde.
//
// REGLA — quien FIRMA los documentos sigue siendo el titular (el de arriba). Se
// dice en pantalla: si no, "¿y quién firma?" se contesta suponiendo.
// REGLA — la pregunta se contesta en NEUTRO (sin preseleccionar), salvo que la
// ficha ya traiga otros propietarios: entonces viene en Sí y rellena.
// REGLA — el texto secundario se tiene que leer en el móvil (se acepta con él).
// Va en el estilo «carta de pago» con las clases `.fp-` de AceptarPropuestaView:
// solo se pinta dentro de esa página (24/10/2026).
//
// Lo guarda `clientes.copropietarios` (saneado en backend/utils/normalization.js).
// La lógica (qué falta, qué se manda) vive en logic/propietariosAceptacion.js.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_PROPIETARIOS_EXTRA, propietarioNuevo, cuotaTitular } from '../logic/propietariosAceptacion';

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoClip = (p) => <Ico {...p}><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.8 7" /></Ico>;

function Campo({ label, obligatorio, opcional, children }) {
    return (
        <label style={{ display: 'block' }}>
            <span className="fp-k">{label}{obligatorio && <i> *</i>}{opcional && <em> (opcional)</em>}</span>
            {children}
        </label>
    );
}

function Opcion({ activo, onClick, children }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={activo}
            className={`fp-elige${activo ? ' fp-elige-sel' : ''}`}>
            {children}
        </button>
    );
}

function TarjetaPropietario({ p, index, onChange, onRemove, justificante, onJustificante, conJustificante }) {
    const set = (patch) => onChange({ ...p, ...patch });
    return (
        <div className="fp-prop">
            <div className="fp-card-head">
                <p className="fp-eyebrow">Propietario {index + 2}</p>
                <button type="button" onClick={onRemove} className="fp-quita-prop">
                    Quitar
                </button>
            </div>

            <div className="fp-campos fp-dos">
                <Campo label="Nombre" obligatorio>
                    <input className="fp-input" value={p.nombre} autoComplete="off"
                        onChange={e => set({ nombre: e.target.value })} />
                </Campo>
                <Campo label="Apellidos">
                    <input className="fp-input" value={p.apellidos} autoComplete="off"
                        onChange={e => set({ apellidos: e.target.value })} />
                </Campo>
                <Campo label="DNI / NIE" obligatorio>
                    <input className="fp-input fp-input-mono" value={p.dni} autoComplete="off"
                        onChange={e => set({ dni: e.target.value })} />
                </Campo>
                <Campo label="Teléfono">
                    <input type="tel" className="fp-input" value={p.tlf} autoComplete="off"
                        onChange={e => set({ tlf: e.target.value })} />
                </Campo>
            </div>
            <div className="fp-campos">
                <Campo label="Email">
                    <input type="email" className="fp-input no-uppercase" value={p.email} autoComplete="off"
                        onChange={e => set({ email: e.target.value.toLowerCase() })} />
                </Campo>
            </div>

            {/* Lo que decide si es CEDENTE: quien paga la obra es el propietario
                del ahorro (RD 36/2023). Quien no paga queda registrado como
                propietario, pero no firma ni cobra. */}
            <p className="fp-prop-q">¿Paga también la obra? <span style={{ color: 'var(--naranja-txt)' }}>*</span></p>
            <p className="fp-ayuda" style={{ marginLeft: 0 }}>
                Si paga parte de la obra, la factura tiene que ir también a su nombre y firmará los documentos de la ayuda.
            </p>
            <div className="fp-elige-par">
                <Opcion activo={p.cedente === true} onClick={() => set({ cedente: true })}>Sí, también paga</Opcion>
                <Opcion activo={p.cedente === false} onClick={() => set({ cedente: false, cuenta_propia: false })}>No, solo es propietario</Opcion>
            </div>

            {p.cedente === true && (
                <>
                    <div className="fp-campos">
                        <Campo label="¿Qué parte de la obra paga? (%)">
                            <input inputMode="decimal" className="fp-input" value={p.cuota_pct ?? ''} placeholder="A partes iguales" autoComplete="off"
                                onChange={e => set({ cuota_pct: e.target.value.replace(/[^\d.,]/g, '') })} />
                        </Campo>
                    </div>
                    <p className="fp-prop-q">¿Dónde se le ingresa su parte de la ayuda?</p>
                    <p className="fp-ayuda" style={{ marginLeft: 0 }}>
                        Lo normal es ingresarla entera en una sola cuenta: ante Hacienda cada uno declara su parte, cobre quien cobre.
                    </p>
                    <div className="fp-elige-par">
                        <Opcion activo={!p.cuenta_propia} onClick={() => set({ cuenta_propia: false })}>En la cuenta del titular</Opcion>
                        <Opcion activo={!!p.cuenta_propia} onClick={() => set({ cuenta_propia: true })}>En su propia cuenta</Opcion>
                    </div>
                </>
            )}

            {p.cedente === true && p.cuenta_propia && (
                <div className="fp-campos">
                    <Campo label="Cuenta (IBAN)" obligatorio>
                        <input className="fp-input fp-input-mono" value={p.iban} placeholder="ESXX XXXX ..." autoComplete="off"
                            onChange={e => set({ iban: e.target.value })} />
                    </Campo>
                    {conJustificante && (
                        <div>
                            <p className="fp-k">Justificante de titularidad <em>(opcional)</em></p>
                            {p.tiene_justificante && !justificante ? (
                                <p className="fp-ayuda" style={{ color: 'var(--verde-txt)', margin: '0 2px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <IcoCheck size={14} sw={3} /> Ya nos lo enviaste. Sube otro solo si la cuenta ha cambiado.
                                </p>
                            ) : null}
                            <label className={`fp-file${justificante ? ' fp-file-ok' : ''}`}>
                                <input type="file" accept="image/jpeg,image/png,application/pdf"
                                    onChange={e => onJustificante(e.target.files[0] || null)} />
                                <span className={`fp-ico-tile ${justificante ? 'fp-tile-verde' : 'fp-tile-crema'}`}>
                                    {justificante ? <IcoCheck size={20} /> : <IcoClip size={20} />}
                                </span>
                                {justificante
                                    ? <span><b>{justificante.name}</b>pulsa para cambiarlo</span>
                                    : <span><b>Adjuntar justificante</b>JPG, PNG o PDF</span>}
                            </label>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * @param {object}   props
 * @param {boolean|null} props.mas         ¿hay más de un propietario? (null = sin contestar)
 * @param {Function} props.setMas
 * @param {Array}    props.lista           los otros propietarios
 * @param {Function} props.setLista
 * @param {object}   [props.justificantes] { [id]: File }
 * @param {Function} [props.setJustificantes]
 * @param {boolean}  [props.conJustificante=true]  ofrecer subir el justificante de su cuenta
 */
export function PropietariosAceptacion({ mas, setMas, lista, setLista, justificantes = {}, setJustificantes, conJustificante = true }) {
    const elegirMas = (v) => {
        setMas(v);
        if (v && (!lista || !lista.length)) setLista([propietarioNuevo()]);
    };
    return (
        <div>
            <p className="fp-sec">Propietarios de la vivienda</p>
            <p className="fp-prop-q" style={{ marginTop: 14 }}>¿La vivienda tiene más de un propietario? <span style={{ color: 'var(--naranja-txt)' }}>*</span></p>
            <p className="fp-ayuda" style={{ marginLeft: 0 }}>
                Cada propietario que paga la obra puede aplicarse su parte de la deducción en la Renta y firma los documentos de la ayuda, así que necesitamos sus datos.
            </p>
            <div className="fp-elige-par">
                <Opcion activo={mas === false} onClick={() => elegirMas(false)}>No, solo yo</Opcion>
                <Opcion activo={mas === true} onClick={() => elegirMas(true)}>Sí, somos más</Opcion>
            </div>

            {mas === true && (
                <div style={{ marginTop: 16 }}>
                    {(lista || []).map((p, i) => (
                        <TarjetaPropietario
                            key={p.id}
                            p={p}
                            index={i}
                            conJustificante={conJustificante}
                            onChange={(next) => setLista((lista || []).map(x => x.id === p.id ? next : x))}
                            onRemove={() => {
                                const resto = (lista || []).filter(x => x.id !== p.id);
                                setLista(resto);
                                if (!resto.length) setMas(false);
                                if (setJustificantes) setJustificantes(prev => { const r = { ...prev }; delete r[p.id]; return r; });
                            }}
                            justificante={justificantes[p.id] || null}
                            onJustificante={(f) => setJustificantes && setJustificantes(prev => ({ ...prev, [p.id]: f }))}
                        />
                    ))}
                    {(lista || []).length < MAX_PROPIETARIOS_EXTRA && (
                        <button type="button" onClick={() => setLista([...(lista || []), propietarioNuevo()])} className="fp-anadir">
                            + Añadir datos de otro propietario
                        </button>
                    )}
                    {(lista || []).some(p => p.cedente === true) && (
                        <div className="fp-extra">
                            <p>
                                Tu parte de la obra: <strong>{String(cuotaTitular(lista)).replace('.', ',')} %</strong>.
                                Firmaréis el Convenio de Cesión todos los que pagáis la obra, y cada uno su propio Anexo I.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
