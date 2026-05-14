import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import axios from 'axios';

const AuthContext = createContext({});
const PROFILE_CACHE_KEY = 'brokergy_user_profile';

export const useAuth = () => useContext(AuthContext);

// Leer perfil cacheado del localStorage (síncrono, instantáneo)
const getCachedProfile = () => {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* silently fail */ }
  return null;
};

const setCachedProfile = (profile) => {
  try {
    if (profile) {
      const normalizedRol = (profile.rol || '').toUpperCase();
      const toCache = {
        nombre: profile.nombre,
        apellidos: profile.apellidos,
        rol: normalizedRol,
        id_rol: profile.id_rol ? Number(profile.id_rol) : null, // Guardar ID como número
        id_usuario: profile.id_usuario,
        prescriptor_id: profile.prescriptor_id,
        razon_social: profile.razon_social,
        logo_empresa: profile.logo_empresa,
        email: profile.email,
      };
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(toCache));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch (e) { /* silently fail */ }
};

export const AuthProvider = ({ children }) => {
  const cachedProfile = getCachedProfile();
  const [user, setUser] = useState(cachedProfile);
  const [session, setSession] = useState(null);
  // Siempre arrancamos en loading=true para esperar a que Supabase confirme la
  // sesión. Sin esto, el cache de localStorage hace que la app pinte el
  // Dashboard antes de saber si el token es válido, generando 401 cuando la
  // sesión está caducada (caso típico: link "Aceptar Encargo" desde email).
  const [loading, setLoading] = useState(true);
  
  // Refs para controlar el flujo sin depender de closures obsoletas
  const hasRichProfile = useRef(!!cachedProfile?.rol);
  const profileFetchInProgress = useRef(false);

  const setAxiosAuth = (token) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Interceptor global de respuestas 401: si una request falla por sesión
    // caducada/no presente, limpiamos el perfil cacheado y la cookie de
    // Authorization para que la app muestre el login en vez de seguir
    // intentando renderizar el dashboard con datos stale.
    // Excluye /cert-ack y /aceptar-propuesta (rutas públicas que pueden 401
    // por token de negocio inválido, no por sesión).
    const axiosInterceptor = axios.interceptors.response.use(
      r => r,
      (error) => {
        const status = error?.response?.status;
        const url = error?.config?.url || '';
        const isPublicEndpoint = url.includes('/cert-ack') || url.includes('/aceptar-propuesta') || url.includes('/subir-cifo');
        if (status === 401 && !isPublicEndpoint) {
          hasRichProfile.current = false;
          setCachedProfile(null);
          setAxiosAuth(null);
          setUser(null);
        }
        return Promise.reject(error);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setAxiosAuth(session?.access_token);
      
      if (session?.user) {
        // SOLO establecer usuario base si NO tenemos datos ricos (de caché o fetch previo)
        if (!hasRichProfile.current) {
          setUser({ ...session.user });
        }
        fetchBusinessProfile(session);
      } else {
        // Sin sesión → limpiar todo (incluida la caché)
        hasRichProfile.current = false;
        setCachedProfile(null);
        setUser(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setAxiosAuth(session?.access_token);
      
      if (session?.user) {
        // NUNCA sobreescribir si ya tenemos perfil rico (caché o API)
        if (!hasRichProfile.current) {
          setUser({ ...session.user });
        }
        // Solo fetchear si no hay ya un fetch en curso
        if (!profileFetchInProgress.current) {
          fetchBusinessProfile(session);
        }
      } else {
        hasRichProfile.current = false;
        setCachedProfile(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      axios.interceptors.response.eject(axiosInterceptor);
    };
  }, []);

  const fetchBusinessProfile = async (sessionData) => {
    if (!sessionData || profileFetchInProgress.current) return;
    profileFetchInProgress.current = true;

    try {
        const res = await axios.get('/api/usuarios/me');
        if (res.data) {
            let logo = res.data.logo_empresa;
            if (!logo && res.data.prescriptor_id) {
                try {
                    const presRes = await axios.get('/api/prescriptores');
                    const miPrescriptor = presRes.data.find(p => p.id_empresa === res.data.prescriptor_id);
                    if (miPrescriptor?.logo_empresa) {
                        logo = miPrescriptor.logo_empresa;
                    }
                } catch (err) {
                    console.error('Error al recuperar logo de respaldo:', err);
                }
            }

            const roleName = (res.data.rol_nombre || '').toUpperCase();
            const enrichedUser = {
                ...sessionData.user,
                nombre: res.data.perfilCompleto?.nombre || sessionData.user?.user_metadata?.nombre,
                apellidos: res.data.perfilCompleto?.apellidos || sessionData.user?.user_metadata?.apellidos,
                businessProfile: res.data.perfilCompleto,
                rol: roleName,
                id_rol: res.data.id_rol ? Number(res.data.id_rol) : null, // Asegurar ID numérico
                id_usuario: res.data.id_usuario,
                prescriptor_id: res.data.prescriptor_id,
                razon_social: res.data.razon_social,
                acronimo: res.data.acronimo,
                logo_empresa: logo,
                email: sessionData.user?.email,
            };

            hasRichProfile.current = true;
            setCachedProfile(enrichedUser);
            setUser(enrichedUser);
        }
    } catch (e) {
        console.error("Error cargando perfil:", e.response?.data || e.message);
    } finally {
        setLoading(false);
        profileFetchInProgress.current = false;
    }
  };

  const signIn = async (email, password) => {
      return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => {
      hasRichProfile.current = false;
      setCachedProfile(null);
      return supabase.auth.signOut();
  };

  const resetPassword = (email) => {
      return supabase.auth.resetPasswordForEmail(email);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, resetPassword, refreshProfile: fetchBusinessProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

