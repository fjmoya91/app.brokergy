import { useState, useEffect } from 'react';
import axios from 'axios';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { SERIES, validarNif, MAX_OBS_FACTURA } from '../logic/factura';
import { Dialogo } from './PresupuestoModal';
import { Ico, AvisoFx } from '../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// Los EMISORES de las facturas: quién factura en cada serie (⚙ Ajustes, solo ADMIN).
//
// ING es BROKERGY (la sociedad); FML, Fran como profesional (con retención de
// IRPF y sin la marca). Sus datos viven en la tabla `facturacion_emisores`, no
// en el código (el repo es público y aquí va un IBAN): este diálogo es la única
// forma de darlos de alta o cambiarlos, y solo para ADMIN (lo corta también el
// backend). Sin la fila de su serie, una factura no se emite.
//
// Lo que se cambia aquí vale para las facturas que se emitan DESPUÉS: cada
// factura emitida guarda la foto del emisor de ese día.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion';

const vacio = (serie) => ({
    serie, razon_social: '', nif: '', direccion: '', cp: '', municipio: '', provincia: '', tlf: '', email: '',
    banco: '', iban: '', irpf_pct: SERIES[serie]?.irpfPct ?? 0, observaciones: '', persona_fisica: serie === 'FML', activo: true,
});

const deFila = (f) => ({
    ...vacio(f.serie),
    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v == null ? (k === 'irpf_pct' ? 0 : '') : v])),
    persona_fisica: !!f.persona_fisica,
    activo: f.activo !== false,
});

/** IBAN con su dígito de control (ISO 13616, módulo 97). Solo AVISA: no bloquea. */
function ibanValido(iban) {
    const s = String(iban || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const reord = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let resto = 0;
    for (const d of reord) resto = (resto * 10 + Number(d)) % 97;
    return resto === 1;
}

export function EmisoresModal({ isOpen, onClose, serieInicial = 'ING', onSaved }) {
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);
    const [serie, setSerie] = useState(SERIES[serieInicial] ? serieInicial : 'ING');
    // Un formulario por serie: cambiar de serie no pierde lo tecleado.
    const [forms, setForms] = useState(() => Object.fromEntries(Object.keys(SERIES).map(s => [s, vacio(s)])));
    const [existe, setExiste] = useState({});
    const [sucio, setSucio] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        let vivo = true;
        setCargando(true);
        axios.get(`${API}/emisores`).then(({ data }) => {
            if (!vivo) return;
            const filas = Array.isArray(data) ? data : [];
            setForms(fs => {
                const out = { ...fs };
                for (const f of filas) if (SERIES[f.serie]) out[f.serie] = deFila(f);
                return out;
            });
            setExiste(Object.fromEntries(filas.map(f => [f.serie, true])));
            setErrorCarga(null);
        }).catch(err => {
            if (!vivo) return;
            const m = err.response?.data?.error || '';
            setErrorCarga(/facturacion_emisores|does not exist|schema cache/i.test(m)
                ? 'Falta aplicar el esquema de facturas en Supabase (scripts/facturacion_schema.sql).'
                : err.response?.status === 503 ? 'La base de datos no responde ahora mismo: no se pueden leer los emisores.'
                    : (m || 'No se pudieron leer los emisores.'));
        }).finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [isOpen]);

    if (!isOpen) return null;

    const f = forms[serie];
    const algoSucio = Object.values(sucio).some(Boolean);
    const cambiar = (patch) => {
        setForms(fs => ({ ...fs, [serie]: { ...fs[serie], ...patch } }));
        setSucio(s => ({ ...s, [serie]: true }));
        setMsg(null);
    };
    const campo = (k, etiqueta, extra = {}) => (
        <label className="fx-campo" style={extra.style}>
            <span>{etiqueta}</span>
            <input value={f[k] ?? ''} onChange={e => cambiar({ [k]: extra.mayus ? e.target.value.toUpperCase() : e.target.value })}
                placeholder={extra.placeholder || ''} type={extra.type || 'text'} inputMode={extra.inputMode} autoComplete="off"
                className={`fx-input${extra.mono ? ' fx-mono' : ''}${extra.minus ? ' no-uppercase' : ''}${extra.mal ? ' fx-mal' : ''}`} />
        </label>
    );

    const nif = validarNif(f.nif);
    const avisoNif = f.nif.trim() && !nif.valido ? 'Ese NIF no cuadra (letra o dígito de control): el servidor no lo aceptará.' : null;
    const avisoIban = f.iban.trim() && !ibanValido(f.iban) ? 'El IBAN no cuadra con su dígito de control. Revísalo antes de guardar: sale en cada factura.' : null;
    const falta = !f.razon_social.trim() ? 'Falta la razón social' : !f.nif.trim() ? `Falta el ${f.persona_fisica ? 'NIF' : 'CIF'}` : !nif.valido ? 'Revisa el NIF' : null;

    const guardar = async () => {
        setGuardando(true); setMsg(null);
        try {
            const { data } = await axios.put(`${API}/emisores/${serie}`, {
                razon_social: f.razon_social.trim(), nif: f.nif.trim(), direccion: f.direccion.trim(), cp: f.cp.trim(),
                municipio: f.municipio.trim(), provincia: f.provincia.trim(), tlf: f.tlf.trim(), email: f.email.trim(),
                banco: f.banco.trim(), iban: f.iban.trim(), irpf_pct: Number(f.irpf_pct) || 0,
                observaciones: f.observaciones, persona_fisica: !!f.persona_fisica, activo: f.activo !== false,
            });
            setForms(fs => ({ ...fs, [serie]: deFila(data) }));
            setExiste(x => ({ ...x, [serie]: true }));
            setSucio(s => ({ ...s, [serie]: false }));
            setMsg({ ok: true, texto: `Emisor de ${serie} guardado. Vale para las facturas que se emitan desde ahora.` });
            onSaved?.(data);
        } catch (err) {
            setMsg({ ok: false, texto: err.response?.data?.error || 'No se pudo guardar el emisor.' });
        } finally {
            setGuardando(false);
        }
    };

    const pie = (cargando || errorCarga) ? (
        <button type="button" className="fx-btn fx-btn-sec" onClick={onClose}>Cerrar</button>
    ) : (
        <>
            <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={guardando}>Cerrar</button>
            <button type="button" className="fx-btn fx-btn-pri" onClick={guardar} disabled={guardando || !!falta || !sucio[serie]}>
                {guardando ? 'Guardando…' : falta && sucio[serie] ? falta : <><Ico n="check" size={18} />Guardar {serie}</>}
            </button>
        </>
    );

    return (
        <Dialogo antetitulo="Ajustes · solo administración" titulo="Emisores" ancho cerrarFuera={!algoSucio}
            subtitulo="Quién factura en cada serie. Cada factura emitida guarda la foto de estos datos."
            onClose={onClose} ocupado={guardando} pie={pie}>
            <div className="fx-seg" role="tablist" aria-label="Serie" style={{ width: '100%', gridAutoColumns: '1fr' }}>
                {Object.keys(SERIES).map(s => (
                    <button key={s} type="button" role="tab" aria-selected={s === serie} aria-pressed={s === serie}
                        onClick={() => { setSerie(s); setMsg(null); }}>
                        {s} · {SERIES[s].nombre}
                        {sucio[s] && <span className="fx-dot" style={{ '--c': '#e39a12' }} title="Sin guardar" />}
                        {!existe[s] && !cargando && !errorCarga && <small style={{ color: 'var(--ambar-txt)', fontWeight: 600 }}>sin datos</small>}
                    </button>
                ))}
            </div>

            {cargando ? (
                <div className="fx-cargando"><Ico n="reloj" size={26} className="fx-spin" />Leyendo los emisores…</div>
            ) : errorCarga ? (
                <AvisoFx tono="ambar">{errorCarga}</AvisoFx>
            ) : (
                <>
                    <p className="fx-ayuda">{SERIES[serie].descripcion}.{!existe[serie] && <b> Todavía no tiene datos: sin ellos, las facturas de esta serie no se pueden emitir.</b>}</p>

                    <div className="fx-fila2">
                        {campo('razon_social', 'Razón social o nombre', { placeholder: serie === 'FML' ? 'Nombre y apellidos' : 'Sociedad' })}
                        <label className="fx-campo">
                            <span>{f.persona_fisica ? 'NIF' : 'CIF'}{f.nif.trim() && nif.valido ? ` · ${nif.tipo} correcto` : ''}</span>
                            <input value={f.nif} onChange={e => cambiar({ nif: e.target.value.toUpperCase() })} autoComplete="off"
                                className={`fx-input fx-mono${avisoNif ? ' fx-mal' : ''}`} />
                        </label>
                    </div>
                    {avisoNif && <p className="fx-error"><Ico n="alerta" size={15} />{avisoNif}</p>}

                    <label className="fx-check" style={{ border: '1px solid var(--linea)', borderRadius: 14, background: '#fff' }}>
                        <input type="checkbox" checked={!!f.persona_fisica} onChange={e => cambiar({ persona_fisica: e.target.checked })} />
                        <span>Persona física<small>En el PDF pone «NIF» en vez de «CIF».</small></span>
                    </label>

                    {campo('direccion', 'Dirección')}
                    <div className="fx-fila2">
                        {campo('cp', 'CP', { inputMode: 'numeric' })}
                        {campo('municipio', 'Municipio')}
                        {campo('provincia', 'Provincia')}
                    </div>
                    <div className="fx-fila2">
                        {campo('tlf', 'Teléfono', { type: 'tel' })}
                        {campo('email', 'Email', { type: 'email', minus: true })}
                    </div>
                    <div className="fx-fila2">
                        {campo('banco', 'Banco')}
                        {campo('iban', 'IBAN · sale en la factura y en el mensaje', { mono: true, mayus: true, placeholder: 'ES00 0000 0000 0000 0000 0000', mal: !!avisoIban })}
                    </div>
                    {avisoIban && <p className="fx-error"><Ico n="alerta" size={15} />{avisoIban}</p>}

                    <label className="fx-campo" style={{ maxWidth: 220 }}>
                        <span>IRPF por defecto (%)</span>
                        <CampoDecimal valor={f.irpf_pct} onCambio={n => cambiar({ irpf_pct: Math.min(100, n) })} alVaciar={() => cambiar({ irpf_pct: 0 })} className="fx-input fx-num" />
                    </label>

                    <label className="fx-campo">
                        <span>Observaciones por defecto · cada factura nueva de la serie nace con ellas</span>
                        <textarea value={f.observaciones || ''} rows={3} maxLength={MAX_OBS_FACTURA}
                            onChange={e => cambiar({ observaciones: e.target.value })} className="fx-area no-uppercase" />
                    </label>

                    {msg && <AvisoFx tono={msg.ok ? 'ok' : 'ambar'} role="status">{msg.texto}</AvisoFx>}
                </>
            )}
        </Dialogo>
    );
}

export default EmisoresModal;
