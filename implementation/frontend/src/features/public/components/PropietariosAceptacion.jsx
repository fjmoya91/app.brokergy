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
// REGLA — el texto secundario va a /70 como mínimo (se acepta con el móvil).
//
// Lo guarda `clientes.copropietarios` (saneado en backend/utils/normalization.js).
// La lógica (qué falta, qué se manda) vive en logic/propietariosAceptacion.js.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_PROPIETARIOS_EXTRA, propietarioNuevo } from '../logic/propietariosAceptacion';

const INPUT = 'w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium';
const LABEL = 'block text-xs font-black uppercase tracking-widest text-white/50 ml-1';

function Campo({ label, obligatorio, children }) {
    return (
        <div className="space-y-1.5">
            <label className={LABEL}>{label}{obligatorio && <span className="text-brand"> *</span>}</label>
            {children}
        </div>
    );
}

function Opcion({ activo, onClick, children }) {
    return (
        <button type="button" onClick={onClick}
            className={`flex-1 min-h-[48px] px-4 py-3 rounded-xl border text-sm font-bold transition-all ${activo ? 'border-brand bg-brand/10 text-white' : 'border-white/10 bg-bkg-elevated text-white/70 hover:border-white/25'}`}>
            {children}
        </button>
    );
}

function TarjetaPropietario({ p, index, onChange, onRemove, justificante, onJustificante, conJustificante }) {
    const set = (patch) => onChange({ ...p, ...patch });
    return (
        <div className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-widest text-brand">Propietario {index + 2}</p>
                <button type="button" onClick={onRemove}
                    className="text-[11px] font-black uppercase tracking-widest text-red-400/80 hover:text-red-400 px-2 py-1">
                    Quitar
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Nombre" obligatorio>
                    <input className={`${INPUT} uppercase`} value={p.nombre} autoComplete="off"
                        onChange={e => set({ nombre: e.target.value })} />
                </Campo>
                <Campo label="Apellidos">
                    <input className={`${INPUT} uppercase`} value={p.apellidos} autoComplete="off"
                        onChange={e => set({ apellidos: e.target.value })} />
                </Campo>
                <Campo label="DNI / NIE" obligatorio>
                    <input className={`${INPUT} uppercase`} value={p.dni} autoComplete="off"
                        onChange={e => set({ dni: e.target.value })} />
                </Campo>
                <Campo label="Teléfono">
                    <input type="tel" className={INPUT} value={p.tlf} autoComplete="off"
                        onChange={e => set({ tlf: e.target.value })} />
                </Campo>
                <div className="sm:col-span-2">
                    <Campo label="Email">
                        <input type="email" className={`${INPUT} no-uppercase`} value={p.email} autoComplete="off"
                            onChange={e => set({ email: e.target.value.toLowerCase() })} />
                    </Campo>
                </div>
            </div>

            <div className="space-y-2 pt-1">
                <p className="text-sm font-bold text-white">¿Dónde se le ingresa su parte de la ayuda?</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Opcion activo={!p.cuenta_propia} onClick={() => set({ cuenta_propia: false })}>En la cuenta del titular</Opcion>
                    <Opcion activo={!!p.cuenta_propia} onClick={() => set({ cuenta_propia: true })}>En su propia cuenta</Opcion>
                </div>
            </div>

            {p.cuenta_propia && (
                <div className="space-y-4">
                    <Campo label="Cuenta (IBAN)" obligatorio>
                        <input className={`${INPUT} uppercase`} value={p.iban} placeholder="ESXX XXXX ..." autoComplete="off"
                            onChange={e => set({ iban: e.target.value })} />
                    </Campo>
                    {conJustificante && (
                        <div className="space-y-1.5">
                            <label className={LABEL}>
                                Justificante de titularidad <span className="text-white/50 font-normal normal-case tracking-normal">(opcional)</span>
                            </label>
                            {p.tiene_justificante && !justificante ? (
                                <p className="text-[12px] text-emerald-400/90 ml-1">✓ Ya nos lo enviaste. Sube otro solo si la cuenta ha cambiado.</p>
                            ) : null}
                            <div className="relative">
                                <input type="file" accept="image/jpeg,image/png,application/pdf"
                                    onChange={e => onJustificante(e.target.files[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                <div className={`border-2 border-dashed rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all ${justificante ? 'border-brand/40 bg-brand/5' : 'border-white/10 hover:border-brand/30'}`}>
                                    <svg className="w-4 h-4 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    {justificante
                                        ? <span className="text-xs font-bold text-brand truncate">{justificante.name}</span>
                                        : <span className="text-xs text-white/60">Seleccionar archivo (JPG, PNG o PDF)</span>}
                                </div>
                            </div>
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
        <div className="pt-6 border-t border-white/10 space-y-4">
            <div>
                <p className="text-white font-bold text-sm mb-1">¿La vivienda tiene más de un propietario? <span className="text-brand">*</span></p>
                <p className="text-white/70 text-xs leading-relaxed">
                    Cada propietario puede aplicarse su parte de la deducción en la Renta, y para eso necesitamos sus datos.
                    Si la ayuda se os tiene que ingresar por separado, indica también la cuenta de cada uno.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <Opcion activo={mas === false} onClick={() => elegirMas(false)}>No, solo yo</Opcion>
                <Opcion activo={mas === true} onClick={() => elegirMas(true)}>Sí, somos más</Opcion>
            </div>

            {mas === true && (
                <div className="space-y-4">
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
                        <button type="button" onClick={() => setLista([...(lista || []), propietarioNuevo()])}
                            className="w-full min-h-[48px] rounded-xl border border-dashed border-brand/40 text-brand text-xs font-black uppercase tracking-widest hover:bg-brand/5 transition-all">
                            + Añadir datos de otro propietario
                        </button>
                    )}
                    <p className="text-[12px] text-white/60 leading-relaxed">
                        Los documentos (Anexo I y Convenio de Cesión) se emiten a nombre del titular, que es quien los firma.
                    </p>
                </div>
            )}
        </div>
    );
}
