// ─── HostInstalador — la app del instalador con la sesión de verdad ──────────
// Une `AppInstalador` (que no sabe de sesiones ni de modales) con lo que ya
// existe: su API, su ficha de empresa (`PrescriptorDetailModal`, como en
// DashboardLayout) y los modales de alta y edición de clientes de
// features/clientes/components. Los modales van PORTALEADOS a `body` (29.b):
// son del CRM oscuro y no deben heredar nada del papel crema de la cáscara.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import AppInstalador, { apiReal } from './AppInstalador';
import { PrescriptorDetailModal } from '../admin/views/PrescriptorDetailModal';
import { ClienteFormModal } from '../clientes/components/ClienteFormModal';
import { ClienteDetailModal } from '../clientes/components/ClienteDetailModal';
import { nombrePropio } from './ui/piezas';

// Fase 5: `direccion` y `fichaEnHistorial` son la dirección y el historial con los
// que se CARGÓ la página (App.jsx los guarda antes de que su propio efecto de la URL
// los toque): así recargar o un enlace directo abren donde tocaba. Su color de marca
// sale de su ficha (`landing_color_primary`, el mismo de su landing).
export default function HostInstalador({ user, signOut, onNueva, onAbrirOportunidad, externo, onCerrarExterno, direccion, fichaEnHistorial }) {
    const api = useMemo(() => apiReal(axios), []);
    const [nonce, setNonce] = useState(0);
    const [miEmpresa, setMiEmpresa] = useState(null);
    const [verPerfil, setVerPerfil] = useState(false);
    const [altaCliente, setAltaCliente] = useState(false);
    const [clienteId, setClienteId] = useState(null);

    // MI ficha se pide POR SU ID (como DashboardLayout: nunca buscándola en el listado).
    useEffect(() => {
        if (!user?.prescriptor_id) return;
        axios.get(`/api/prescriptores/${user.prescriptor_id}`).then((r) => setMiEmpresa(r.data || null)).catch(() => setMiEmpresa(null));
    }, [user?.prescriptor_id]);

    const empresa = miEmpresa?.acronimo || user?.acronimo || miEmpresa?.razon_social || user?.razon_social || '';
    // «Hola, Ramón»: el nombre de pila de quien entra; sin él, el de la empresa.
    const saludo = nombrePropio(String(user?.nombre || '').trim().split(/\s+/)[0] || '') || user?.acronimo || 'de nuevo';
    const recargar = () => setNonce((n) => n + 1);

    return (
        <>
            <AppInstalador
                api={api}
                nonce={nonce}
                saludo={saludo}
                empresa={empresa}
                logo={user?.logo_empresa || miEmpresa?.logo_empresa || null}
                colorMarca={miEmpresa?.landing_color_primary || null}
                asistente={!!user?.asistente_instalador}
                direccion={direccion}
                fichaEnHistorial={fichaEnHistorial}
                onNueva={onNueva}
                onAbrirOportunidad={onAbrirOportunidad}
                onPerfil={miEmpresa ? () => setVerPerfil(true) : null}
                onSalir={signOut}
                onNuevoCliente={() => setAltaCliente(true)}
                onCambiarCliente={(c) => setClienteId(c.id_cliente)}
                externo={externo}
                onCerrarExterno={() => { onCerrarExterno?.(); recargar(); }}
            />
            {createPortal(
                <>
                    {verPerfil && miEmpresa && (
                        <PrescriptorDetailModal isOpen={verPerfil} prescriptor={miEmpresa} onClose={() => setVerPerfil(false)}
                            onUpdated={(p) => setMiEmpresa(p)} onSignOut={signOut} />
                    )}
                    <ClienteFormModal isOpen={altaCliente} onClose={() => setAltaCliente(false)}
                        onSuccess={() => { setAltaCliente(false); recargar(); }} />
                    {clienteId && (
                        <ClienteDetailModal isOpen={!!clienteId} clienteId={clienteId}
                            onClose={() => { setClienteId(null); recargar(); }} onUpdated={recargar} />
                    )}
                </>,
                document.body,
            )}
        </>
    );
}
