import { useState } from 'react';
import { Ico, DialogoFx, useToastFx } from '../estilo';
import { EmisoresModal } from './EmisoresModal';
import { ImportarAppsheet } from './ImportarAppsheet';

// ─────────────────────────────────────────────────────────────────────────────
// ⚙ Ajustes de Facturación (solo ADMIN): lo que se toca de higos a brevas y no merece sitio
// en la cabecera. Un diálogo crema con dos entradas que abren los suyos:
//   - Emisores: los datos fiscales de BROKERGY (ING) y de Fran (FML). Viven en
//     `facturacion_emisores`, nunca en el código (repo público, regla 166).
//   - Importar de AppSheet: trae lo emitido en el libro de AppSheet (en seco primero).
// Mientras uno de los dos está abierto, este se esconde: dos diálogos a la vez se pisan el Esc.
// ─────────────────────────────────────────────────────────────────────────────

export function AjustesFacturacion({ onClose }) {
    const [que, setQue] = useState(null);   // null | 'emisores' | 'importar'
    const [toast, avisar] = useToastFx();

    if (que === 'emisores') {
        return (<>
            <EmisoresModal isOpen onClose={() => setQue(null)} onSaved={() => avisar('Datos del emisor guardados')} />
            {toast}
        </>);
    }
    if (que === 'importar') {
        return (<>
            <ImportarAppsheet onClose={() => setQue(null)} onHecho={() => avisar('Importación de AppSheet terminada')} />
            {toast}
        </>);
    }
    return (<>
        <DialogoFx antetitulo="Facturación" titulo="Ajustes" onClose={onClose}>
            <button type="button" className="fx-ajuste" onClick={() => setQue('emisores')} data-autofoco>
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="recibo" size={22} /></span>
                <div>
                    <b>Emisores</b>
                    <small>Los datos fiscales de BROKERGY (serie ING) y de Fran, autónomo (serie FML): NIF, domicilio, IBAN, IRPF y observaciones por defecto.</small>
                </div>
                <Ico n="derecha" size={18} />
            </button>
            <button type="button" className="fx-ajuste" onClick={() => setQue('importar')}>
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="tabla" size={22} /></span>
                <div>
                    <b>Importar de AppSheet</b>
                    <small>Trae a la app lo emitido en el libro de facturas de AppSheet. Primero enseña lo que traería, sin escribir.</small>
                </div>
                <Ico n="derecha" size={18} />
            </button>
            <p className="fx-nombre-fiscal">Solo el administrador ve estos ajustes.</p>
        </DialogoFx>
        {toast}
    </>);
}

export default AjustesFacturacion;
