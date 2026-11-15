// ─── BorrarObra — «Borrar esta obra» al pie de la ficha (solo en BORRADOR) ───
// Fran (30/10/2026): «que el certificador pueda borrar uno de sus expedientes;
// ahora mismo no encuentro la forma». DELETE /api/certapp/obras/:id
// (services/certapp/obras.js → borrar): solo un borrador sin crédito gastado; la
// carpeta de Drive va a la papelera. Pedida la obra, el botón no sale (y el
// servidor responde 409 OBRA_CERRADA). Un encargo de BROKERGY no se borra: se
// rechaza (obra/Encargo.jsx; el servidor responde 409 ENCARGO_CRM).
import { useState } from 'react';
import axios from 'axios';
import { API, mensajeError } from '../api';
import { navegar } from '../router';
import { Hoja, useToast } from '../ui/piezas';
import { IcoPapelera, Spinner } from '../ui/Iconos';

/** @param {{ obra: object }} p */
export function BorrarObra({ obra }) {
    const toast = useToast();
    const [abierta, setAbierta] = useState(false);
    const [borrando, setBorrando] = useState(false);
    const [error, setError] = useState(null);
    if (obra.estado !== 'BORRADOR' || obra.credito_consumido || obra.crm) return null;

    const nombre = obra.numero_expediente || 'esta obra';
    const borrar = async () => {
        setBorrando(true); setError(null);
        try {
            await axios.delete(`${API}/obras/${obra.id}`);
            toast(`${nombre} borrada.`);
            navegar('/panel');
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido borrar la obra.'));
            setBorrando(false);
        }
    };

    return (
        <>
            <p style={{ textAlign: 'center', margin: '18px 0 0' }}>
                <button type="button" className="ca-btn-borrar" onClick={() => setAbierta(true)}>
                    <IcoPapelera size={16} /> Borrar esta obra
                </button>
            </p>
            <Hoja abierta={abierta} titulo="¿Borrar la obra?" onCerrar={() => !borrando && setAbierta(false)}
                pie={(
                    <div className="ca-btns ca-btns-2">
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => setAbierta(false)} disabled={borrando}>Cancelar</button>
                        <button type="button" className="ca-btn ca-btn-peligro" onClick={borrar} disabled={borrando}>
                            {borrando ? <Spinner /> : <IcoPapelera />} Borrar la obra
                        </button>
                    </div>
                )}>
                <div className="ca-stack">
                    <p className="ca-txt" style={{ margin: 0 }}>
                        Se borra <b>{nombre}</b> con todo lo que tiene: los datos de la vivienda y del titular, las respuestas y las fotos subidas.
                        El enlace que le diste al propietario deja de funcionar.
                    </p>
                    <p className="ca-peq" style={{ margin: 0 }}>No se puede deshacer desde la app. No gasta ningún certificado: esta obra aún no estaba pedida.</p>
                    {error && <p className="ca-peq ca-falta" role="alert" style={{ margin: 0 }}>{error}</p>}
                </div>
            </Hoja>
        </>
    );
}

export default BorrarObra;
