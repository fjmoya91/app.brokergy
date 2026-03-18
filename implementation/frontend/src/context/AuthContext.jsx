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
      // Guardamos solo los campos necesarios para la UI (no toda la sesión Supabase)
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
  // Si hay un perfil cacheado, lo usamos como estado inicial → render instantáneo
  const [user, setUser] = useState(cachedProfile);
  const [session, setSession] = useState(null);
  // Si ya tenemos caché, no bloqueamos el render
  const [loading, setLoading] = useState(!cachedProfile);
  const profileFetched = useRef(false);

  // Wrapper para setUser que también actualiza la caché
  const setUserAndCache = (updater) => {
    setUser(prev => {
      const newUser = typeof updater === 'function' ? updater(prev) : updater;
      setCachedProfile(newUser);
      return newUser;
    });
  };

  // Almacenar el JWT en Axios automáticamente
  const setAxiosAuth = (token) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  useEffect(() => {
    // 1. Obtener la sesión actual inicialmente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAxiosAuth(session?.access_token);
      
      if (session?.user) {
        // Si tenemos caché, el user ya está mostrado. Solo enriquecemos.
        if (!cachedProfile) {
          setUser({ ...session.user });
        }
        fetchBusinessProfile(session);
      } else {
        // No hay sesión: limpiar todo
        setUserAndCache(null);
        setLoading(false);
      }
    });

    // 2. Escuchar cambios de estado
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAxiosAuth(session?.access_token);
      
      if (session?.user) {
         // No machacamos el user cacheado con datos parciales de auth
         if (!user?.rol) {
           setUser(session.user);
         }
         fetchBusinessProfile(session);
      } else {
        setUserAndCache(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBusinessProfile = async (sessionData = session) => {
    if (!sessionData || profileFetched.current) return;
    profileFetched.current = true;

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
                logo_empresa: logo,
                email: sessionData.user?.email,
            };

            setUserAndCache(enrichedUser);
        }
    } catch (e) {
        console.error("Error cargando perfil:", e.response?.data || e.message);
    } finally {
        setLoading(false);
        profileFetched.current = false;
    }
  };

  const signIn = async (email, password) => {
      return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => {
      setCachedProfile(null); // Limpiar caché al salir
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
