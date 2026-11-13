// El EQUIPO DE VERIFICACIÓN del lote: quién lo verifica y cómo se le contacta.
// Sale del plan de verificación (PDF) y de las copias del correo con el que llega
// (backend: services/equipoVerificacion.js). Ver
// docs/conocimiento/lotes/el-equipo-de-verificacion-del-lote.md.
//
// Va en el desplegable «+» de la fila del verificador de la ficha del lote, en el papel crema
// (`.fx-`/`.lt-`, loteFichaEstilo.js): el email y el teléfono se pulsan.
import React, { useState } from 'react';
import axios from 'axios';
import { Ico } from '../../facturacion/estilo';

const ICO_CORREO = 'M4 6h16v12H4z M4 7l8 6 8-6';
const ICO_TEL = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2';

const fmtTel = (t) => {
    const d = String(t || '').replace(/\D/g, '');
    return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : t;
};

function Persona({ rol, p }) {
    return (
        <div className="lt-persona">
            <span className="fx-kpi-k">{rol}</span>
            {p?.nombre
                ? <b title={p.nombre}>{p.nombre}</b>
                : <b className="lt-contacto-no">Sin nombre en el plan</b>}
            {p?.email
                ? <a className="lt-contacto" href={`mailto:${p.email}`} title={`Escribir a ${p.email}`}><Ico d={ICO_CORREO} size={16} />{p.email}</a>
                : <span className="lt-contacto lt-contacto-no"><Ico d={ICO_CORREO} size={16} />Sin email</span>}
            {p?.telefono
                ? <a className="lt-contacto" href={`tel:${p.telefono}`} title={`Llamar al ${fmtTel(p.telefono)}`}><Ico d={ICO_TEL} size={16} />{fmtTel(p.telefono)}</a>
                : <span className="lt-contacto lt-contacto-no"><Ico d={ICO_TEL} size={16} />Sin teléfono</span>}
        </div>
    );
}

export function EquipoVerificacion({ lote, onLote }) {
    const [leyendo, setLeyendo] = useState(false);
    const [error, setError] = useState(null);
    const plan = (lote?.documentos_so || []).find(d => d?.key === 'plan_verificacion') || null;
    const eq = plan?.equipo || null;
    // Antes de que el verificador mande el plan no hay nada que enseñar.
    const estadosConPlan = !['BORRADOR', 'SOLICITADO PRESUPUESTO A VERIFICADOR', 'PTE. FIRMA S.O.', 'PTE. OFERTA VERIFICADOR', 'PTE. FIRMA OFERTA S.O.']
        .includes(lote?.estado);
    if (!eq && !plan && !estadosConPlan) return null;

    const leer = async () => {
        setLeyendo(true); setError(null);
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/plan-verificacion/leer`);
            if (data?.lote) onLote?.(data.lote);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setLeyendo(false);
        }
    };

    const fuente = eq?.fuentes?.length
        ? eq.fuentes.map(f => (f === 'plan' ? 'del plan' : f === 'correo' ? 'del correo que lo trae' : `de ${f}`)).join(' y ')
        : null;

    return (
        <div>
            <div className="fx-bloque-cab" style={{ margin: 0 }}>
                <span className="lt-sec" style={{ margin: 0 }}>Equipo de verificación</span>
                <button type="button" className="fx-link" onClick={leer} disabled={leyendo}
                    title="Busca el correo del plan en el buzón y lee el PDF">
                    {leyendo ? <><Ico n="reintentar" size={16} className="fx-spin" />Leyendo…</> : eq ? 'Volver a leer' : 'Leer del plan'}
                </button>
            </div>
            {eq ? (
                <>
                    <div className="lt-personas" style={{ marginTop: 8 }}>
                        <Persona rol="Verificador jefe" p={eq.verificador_jefe} />
                        <Persona rol="Revisor técnico" p={eq.revisor_tecnico} />
                    </div>
                    {fuente && <p className="lt-nota">Leído {fuente}{eq.expediente_cae ? ` · ${eq.expediente_cae}` : ''}.</p>}
                </>
            ) : (
                <p className="lt-nota" style={{ marginTop: 4 }}>
                    {plan
                        ? 'El plan de verificación está subido, pero aún no se ha leído quién verifica.'
                        : 'Aún no ha llegado el plan de verificación. Cuando llegue, aquí saldrán el verificador jefe y el revisor técnico, con su email y teléfono.'}
                </p>
            )}
            {error && <p className="lt-msg lt-msg-ambar" style={{ marginTop: 8 }}>{error}</p>}
        </div>
    );
}
