// ─── Pregunta — cómo se pinta cada pregunta del cuestionario ────────────────
// Una sola pieza para el móvil (una pregunta por pantalla, en grande; tocar una
// opción AVANZA) y el ordenador (todas las del paso en su tarjeta, sin avanzar).
// Las opciones salen de logic/cuestionario.js a través de obra/pasos.js.
import { MEDIDAS, medidasSugeridas } from '../logic/cuestionario';
import { Campo } from '../ui/piezas';
import { IcoCheck } from '../ui/Iconos';
import { valorDe } from './pasos';
import { SlotsDeEquipos } from './Fotos';

/** Botón de una opción (radio o casilla). */
export function Opcion({ sel, onClick, label, sub, cuadrada, extra, disabled }) {
    return (
        <button type="button" className={`ca-opt${sel ? ' ca-opt-sel' : ''}`} onClick={onClick} disabled={disabled}
            role={cuadrada ? 'checkbox' : 'radio'} aria-checked={!!sel}>
            <span className={`ca-opt-marca${cuadrada ? ' ca-opt-cuad' : ''}`} aria-hidden="true">{sel && <IcoCheck size={15} strokeWidth={3} />}</span>
            <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
            {extra}
        </button>
    );
}

const soloNumero = (v, decimal) => {
    let s = String(v ?? '').replace(decimal ? /[^\d.,]/g : /\D/g, '');
    if (decimal) s = s.replace('.', ',').replace(/,(?=.*,)/g, '');
    return s.slice(0, 10);
};

/**
 * @param p        la pregunta (pasos.js)
 * @param pasoId   el paso en el que se enseña (para las fotos de los equipos)
 * @param ctx      { form, setCampo, setC, setTitular, setDecision, obra, slots, subir, quitar, subiendo, editable }
 * @param grande   true en el móvil (una por pantalla)
 * @param onElegido  se llama tras elegir una opción única (el móvil avanza)
 */
export function Pregunta({ p, ctx, pasoId, grande = false, onElegido }) {
    const { form, setCampo, setC, editable } = ctx;
    const c = form.cuestionario;
    const v = valorDe(p, form);
    const poner = (val) => (p.obra ? setCampo(p.k, val) : setC(p.k, val));
    const ayuda = p.ayudaFn ? p.ayudaFn(c) || p.ayuda : p.ayuda;
    const dis = !editable;

    let control = null;
    switch (p.tipo) {
        case 'opciones':
            control = (
                <div className={`ca-opts${grande ? '' : ' ca-opts-pc2'}`} role="radiogroup" aria-label={p.titulo}>
                    {p.lista.map(o => (
                        <Opcion key={o.value} sel={v === o.value} label={o.label} sub={o.sub} disabled={dis}
                            onClick={() => { poner(o.value); onElegido?.(); }} />
                    ))}
                </div>
            );
            break;
        case 'sino':
            control = (
                <div className="ca-opts ca-opts-2" role="radiogroup" aria-label={p.titulo}>
                    {[{ value: true, label: 'Sí' }, { value: false, label: 'No' }].map(o => (
                        <button key={String(o.value)} type="button" disabled={dis} role="radio" aria-checked={v === o.value}
                            className={`ca-opt ca-opt-centro${v === o.value ? ' ca-opt-sel' : ''}`}
                            onClick={() => { poner(o.value); onElegido?.(); }}>
                            <b>{o.label}</b>
                        </button>
                    ))}
                </div>
            );
            break;
        case 'multi': {
            const lista = Array.isArray(v) ? v : [];
            control = (
                <div className={`ca-opts${grande ? '' : ' ca-opts-pc2'}`} role="group" aria-label={p.titulo}>
                    {p.lista.map(o => {
                        const sel = lista.includes(o.value);
                        return (
                            <Opcion key={o.value} cuadrada sel={sel} label={o.label} sub={o.sub} disabled={dis}
                                onClick={() => poner(sel ? lista.filter(x => x !== o.value) : [...lista, o.value])} />
                        );
                    })}
                </div>
            );
            break;
        }
        case 'chips':
            control = (
                <div className="ca-chips" role="radiogroup" aria-label={p.titulo}>
                    {p.lista.map(o => (
                        <button key={o.value} type="button" disabled={dis} role="radio" aria-checked={v === o.value}
                            className={`ca-chipbtn${v === o.value ? ' ca-chipbtn-sel' : ''}`}
                            onClick={() => { poner(v === o.value ? '' : o.value); if (v !== o.value) onElegido?.(); }}>
                            {o.label}
                        </button>
                    ))}
                </div>
            );
            break;
        case 'numero':
            control = (
                <Campo sufijo={p.sufijo}>
                    <input className="ca-input" inputMode={p.decimal ? 'decimal' : 'numeric'} autoComplete="off" disabled={dis}
                        value={v ?? ''} placeholder={p.placeholder} aria-label={p.titulo}
                        onChange={e => poner(soloNumero(e.target.value, p.decimal))}
                        onKeyDown={e => { if (e.key === 'Enter' && grande) { e.preventDefault(); onElegido?.(); } }} />
                </Campo>
            );
            break;
        case 'texto':
            control = (
                <input className="ca-input" autoComplete="off" disabled={dis} value={v ?? ''} placeholder={p.placeholder} aria-label={p.titulo}
                    maxLength={120} onChange={e => poner(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && grande) { e.preventDefault(); onElegido?.(); } }} />
            );
            break;
        case 'textarea':
            control = (
                <textarea className="ca-input" rows={grande ? 6 : 4} disabled={dis} value={v ?? ''} placeholder={p.placeholder} aria-label={p.titulo}
                    maxLength={p.k === 'notas' ? 2000 : 600} onChange={e => poner(e.target.value)} />
            );
            break;
        case 'inmueble':
            control = <Inmueble ctx={ctx} />;
            break;
        case 'titular':
            control = <Titular ctx={ctx} />;
            break;
        case 'medidas':
            control = <Medidas ctx={ctx} grande={grande} />;
            break;
        case 'equipos':
            control = <SlotsDeEquipos ctx={ctx} paso={pasoId} />;
            break;
        default:
            control = null;
    }

    return (
        <div className="ca-preg">
            {grande
                ? <h2 className="ca-display ca-pregunta">{p.titulo}</h2>
                : <h3 className="ca-preg-tit">{p.titulo}{p.opcional && <span className="ca-opcional"> · opcional</span>}</h3>}
            {ayuda && <p className="ca-preg-ayuda">{ayuda}</p>}
            <div style={{ marginTop: grande ? 20 : 12 }}>{control}</div>
        </div>
    );
}

/* ── El inmueble (lo del Catastro, corregible) ───────────────────────────── */
function Inmueble({ ctx }) {
    const { form, setCampo, obra, editable } = ctx;
    const dis = !editable;
    const campo = (k, etiqueta, extra = {}) => (
        <Campo etiqueta={etiqueta} sufijo={extra.sufijo} ayuda={extra.ayuda}>
            <input className="ca-input" disabled={dis} value={form[k] ?? ''} inputMode={extra.inputMode} autoComplete="off"
                placeholder={extra.placeholder} maxLength={extra.max || 200}
                onChange={e => setCampo(k, extra.limpiar ? extra.limpiar(e.target.value) : e.target.value)} />
        </Campo>
    );
    return (
        <div>
            <dl className="ca-dl ca-crema" style={{ padding: '6px 14px', borderRadius: 16, marginBottom: 16 }}>
                <div><dt>Referencia catastral</dt><dd className="ca-mono">{obra?.ref_catastral || '—'}</dd></div>
                <div><dt>Zona climática</dt><dd>{obra?.zona_climatica || '—'}</dd></div>
                {obra?.uso && <div><dt>Uso</dt><dd>{obra.uso}</dd></div>}
            </dl>
            {campo('direccion', 'Dirección', { placeholder: 'Calle, número, piso y puerta', ayuda: 'Añade el piso y la puerta si faltan.' })}
            <div className="ca-grid2">
                {campo('codigo_postal', 'Código postal', { inputMode: 'numeric', max: 5, limpiar: s => s.replace(/\D/g, '').slice(0, 5) })}
                {campo('municipio', 'Municipio', { max: 80 })}
            </div>
            {campo('provincia', 'Provincia', { max: 60 })}
            <div className="ca-grid2">
                {campo('superficie_catastro', 'Superficie', { sufijo: 'm²', inputMode: 'decimal', limpiar: s => soloNumero(s, true) })}
                {campo('anio_construccion', 'Año de construcción', { inputMode: 'numeric', limpiar: s => s.replace(/\D/g, '').slice(0, 4) })}
            </div>
        </div>
    );
}

/* ── El titular del certificado ─────────────────────────────────────────── */
function Titular({ ctx }) {
    const { form, setTitular, editable } = ctx;
    const t = form.titular || {};
    const dis = !editable;
    const campo = (k, etiqueta, extra = {}) => (
        <Campo etiqueta={etiqueta} opcional={extra.opcional}>
            <input className={`ca-input${extra.mayus ? ' ca-input-mayus' : ''}`} disabled={dis} value={t[k] ?? ''}
                type={extra.type || 'text'} inputMode={extra.inputMode} autoComplete={extra.ac || 'off'} maxLength={extra.max || 160}
                onChange={e => setTitular(k, extra.mayus ? e.target.value.toUpperCase() : e.target.value)} />
        </Campo>
    );
    return (
        <div>
            <div className="ca-grid2">
                {campo('nombre', 'Nombre', { max: 120 })}
                {campo('apellidos', 'Apellidos', { max: 160 })}
            </div>
            {campo('nif', 'NIF o NIE', { mayus: true, max: 20, opcional: true })}
            <div className="ca-grid2">
                {campo('telefono', 'Teléfono', { type: 'tel', inputMode: 'tel', max: 30, opcional: true })}
                {campo('email', 'Email', { type: 'email', inputMode: 'email', max: 160, opcional: true })}
            </div>
            <p className="ca-peq" style={{ marginTop: 4 }}>Solo para el certificado: no le escribimos al titular.</p>
        </div>
    );
}

/* ── Medidas de mejora (las sugeridas, marcadas y cambiables) ───────────── */
function Medidas({ ctx, grande }) {
    const { form, setC, editable } = ctx;
    const c = form.cuestionario;
    const sugeridas = medidasSugeridas(c, form.proposito);
    // Sin elegir nada, se ven marcadas las sugeridas (y es lo que se pondrá). Al
    // tocar una por primera vez, se parte de ellas: no se escribe nada solo por abrir.
    const elegidas = Array.isArray(c.medidas) && c.medidas.length ? c.medidas : null;
    const marcadas = elegidas || sugeridas;
    const tocar = (m) => {
        const base = elegidas || sugeridas;
        const nueva = base.includes(m) ? base.filter(x => x !== m) : [...base, m];
        // Vacío = «las sugeridas» (así lo leen el barrido y la IA): al menos una.
        if (nueva.length) setC('medidas', nueva);
    };
    return (
        <div>
            <div className={`ca-opts${grande ? '' : ' ca-opts-pc2'}`} role="group" aria-label="Medidas de mejora">
                {MEDIDAS.map(m => (
                    <Opcion key={m.value} cuadrada sel={marcadas.includes(m.value)} label={m.label} disabled={!editable}
                        onClick={() => tocar(m.value)}
                        extra={sugeridas.includes(m.value) ? <span className="ca-chip ca-chip-lima ca-opt-sug">Sugerida</span> : null} />
                ))}
            </div>
            {elegidas && editable && (
                <button type="button" className="ca-link ca-link-gris" style={{ marginTop: 12 }} onClick={() => setC('medidas', [])}>
                    Volver a las sugeridas
                </button>
            )}
        </div>
    );
}

export default Pregunta;
