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
      const toCache = {
        nombre: profile.nombre,
        apellidos: profile.apellidos,
        rol: profile.rol,
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
  const [loading, setLoading] = useState(!cachedProfile);
  
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

            const enrichedUser = {
                ...sessionData.user,
                nombre: res.data.perfilCompleto?.nombre || sessionData.user?.user_metadata?.nombre,
                apellidos: res.data.perfilCompleto?.apellidos || sessionData.user?.user_metadata?.apellidos,
                businessProfile: res.data.perfilCompleto,
                rol: res.data.rol_nombre,
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

