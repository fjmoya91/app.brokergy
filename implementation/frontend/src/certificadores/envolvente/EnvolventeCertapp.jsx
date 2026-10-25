// ─── EnvolventeCertapp.jsx — la ventana de la envolvente, en la app de certificadores ─
// Ruta `/obra/:id/envolvente?origen=ext`. Monta la MISMA ventana del CRM
// (`features/cee-envolvente/views/EnvolventeVentana.jsx`) para la obra de un
// certificador externo (`certapp_obras`): no se copia nada, se ADAPTA la fila
// (`certappObraComoExpediente`) y el origen `ext` viaja en todas las llamadas
// (`apiEnvolvente.js`). docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
//
// REGLA — la sesión es la de la app (`useCertappAuth`), nunca el AuthProvider del
// CRM: su perfil sale de `usuarios` (el certificador externo no tiene) y su
// interceptor cierra la sesión ante cualquier 401. Las piezas del CRM que llaman
// a `useAuth()` reciben aquí un valor COMPATIBLE: el certificador externo va con
// un rol que el CRM no conoce (`CERTIFICADOR_EXTERNO`) y la marca
// `es_certificador_externo`, así que no es ADMIN, ni TRABAJADOR, ni CERTIFICADOR
// de BROKERGY y no ve nada interno (`cee-envolvente/logic/quienMira.js`). Un ADMIN
// de BROKERGY la ve como staff.
//
// REGLA — `?origen=ext` SIEMPRE, y el módulo del origen se lee YA con él. Ese
// módulo fija el origen al EVALUARSE (es la dirección de una ventana propia, en
// el CRM), y aquí se navega sin recargar (pushState): por eso la ventana se carga
// EN DIFERIDO, después de asegurar la dirección, y si aun así el módulo se
// hubiera evaluado antes con otra (algo lo importó al arrancar), se recarga UNA
// vez la página — nunca se abre la envolvente con otro origen.
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { useCertappAuth } from '../auth/CertappAuth';
import Flotantes from '../widgets/Flotantes';

const CLAVE_RECARGA = 'certapp:envolvente-origen-recarga';
const VENTANA_RECARGA_MS = 30_000;

/** Deja `?origen=ext` en la dirección (sin recargar y sin rastro en el historial). */
function asegurarOrigenExt() {
    try {
        const u = new URL(window.location.href);
        if (u.searchParams.get('origen') === 'ext') return;
        u.searchParams.set('origen', 'ext');
        window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* sin History API: el módulo dirá su origen y se para abajo */ }
}

async function cargarVentana() {
    asegurarOrigenExt();
    const [origen, vista] = await Promise.all([
        import('../../features/cee-envolvente/logic/apiEnvolvente'),
        import('../../features/cee-envolvente/views/EnvolventeVentana'),
    ]);
    if (origen.ORIGEN !== 'ext') {
        let reciente = false;
        try {
            reciente = Date.now() - Number(sessionStorage.getItem(CLAVE_RECARGA) || 0) < VENTANA_RECARGA_MS;
            sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
        } catch { /* modo privado: se recarga igual, una vez */ }
        if (!reciente) {
            window.location.reload();
            return new Promise(() => { });      // la página se va: no pintar nada entretanto
        }
        throw new Error(`La envolvente se ha cargado con otro origen («${origen.ORIGEN}»). `
                        + 'Recarga la página para abrirla sobre esta obra.');
    }
    try { sessionStorage.removeItem(CLAVE_RECARGA); } catch { /* noop */ }
    return { default: vista.EnvolventeVentana };
}

const VentanaExt = lazyWithReload(cargarVentana, { name: 'EnvolventeCertapp' });

/**
 * El usuario que verá la ventana del CRM. Sin `prescriptor_id`: el certificador
 * externo no tiene ficha de Prescriptores, así que nunca es «su ficha» de técnico.
 */
function usuarioCompatible({ session, cuenta, esAdmin }) {
    if (!session) return null;
    const base = {
        id: session.user?.id || null,
        email: session.user?.email || cuenta?.email || null,
        nombre: cuenta?.nombre || null,
        apellidos: cuenta?.apellidos || null,
        prescriptor_id: null,
        certapp_cuenta_id: cuenta?.id || null,
    };
    if (esAdmin) return { ...base, rol: 'ADMIN', id_rol: 1 };
    return { ...base, rol: 'CERTIFICADOR_EXTERNO', id_rol: null, es_certificador_externo: true };
}

export default function EnvolventeCertapp({ obraId }) {
    const { session, cuenta, esAdmin, loading, errorMe, signIn, signOut, refrescar } = useCertappAuth();

    const user = useMemo(() => usuarioCompatible({ session, cuenta, esAdmin }),
                         [session, cuenta, esAdmin]);
    // La forma del valor de `AuthProvider` del CRM (lo que leen `useAuth()`).
    const auth = useMemo(() => ({
        user,
        session,
        loading: false,
        profileError: null,
        retryProfile: refrescar,
        refreshProfile: refrescar,
        signIn,
        signOut,
        resetPassword: async () => ({ error: new Error('La contraseña se cambia desde la app.') }),
    }), [user, session, refrescar, signIn, signOut]);

    // De vuelta a SU ficha de obra; un ADMIN sin cuenta de certificador, al admin.
    const volverA = useMemo(() => (esAdmin && !cuenta
        ? { href: '/admin', texto: '← Volver al admin' }
        : { href: `/obra/${encodeURIComponent(obraId || '')}`, texto: '← Volver a la obra' }),
    [esAdmin, cuenta, obraId]);

    if (loading) return <Centro><p className="animate-pulse text-xs font-bold uppercase tracking-widest text-brand">Cargando…</p></Centro>;
    if (!session) {
        return (
            <Centro>
                <p className="text-sm text-white/70">Entra con tu cuenta para abrir la envolvente de esta obra.</p>
                <a href="/entrar" className="mt-3 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-white/80">
                    Entrar
                </a>
            </Centro>
        );
    }
    if (!cuenta && !esAdmin) {
        return (
            <Centro>
                <p className="text-sm text-white/70">
                    {errorMe?.mensaje || 'Esta cuenta no tiene acceso a la app de certificadores.'}
                </p>
                {errorMe && errorMe.status !== 403 && (
                    <button onClick={() => refrescar()}
                            className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-white/80">
                        Reintentar
                    </button>
                )}
            </Centro>
        );
    }
    if (!obraId) return <Centro><p className="text-sm text-white/70">Falta la obra en la dirección.</p></Centro>;

    return (
        <AuthContext.Provider value={auth}>
            <ErrorBoundary>
                <Suspense fallback={<Centro><p className="animate-pulse text-xs font-bold uppercase tracking-widest text-brand">Abriendo la envolvente…</p></Centro>}>
                    {/* `key`: otra obra es otra ventana; nada del plano de la
                        anterior (geometría, selección, deshacer) puede pasar a ésta. */}
                    <VentanaExt key={obraId} expedienteId={obraId} volverA={volverA} />
                </Suspense>
            </ErrorBoundary>
            {/* El asistente, sabiendo que está en el plano (Fran, 25/10/2026). El hueco
                de abajo, para que el botón no tape lo último de la ventana. */}
            {cuenta && <div aria-hidden="true" className="h-20 bg-bkg-base" />}
            {cuenta && <Flotantes obraId={obraId} pantalla="envolvente" soloAsistente />}
        </AuthContext.Provider>
    );
}

function Centro({ children }) {
    return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bkg-base p-6 text-center">
            {children}
        </div>
    );
}
