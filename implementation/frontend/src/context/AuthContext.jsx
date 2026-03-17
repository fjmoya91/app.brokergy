import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import axios from 'axios';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

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
        setUser({
          ...session.user,
        });
        fetchBusinessProfile(session);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    // 2. Escuchar cambios de estado
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAxiosAuth(session?.access_token);
      
      if (session?.user) {
         setUser(session.user); // Establecemos el usuario base de auth
         fetchBusinessProfile(session); // Enriquecemos con el perfil de nuestra DB
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBusinessProfile = async (sessionData = session) => {
    if (!sessionData) return;
    try {
        const res = await axios.get('/api/usuarios/me');
        if (res.data) {
            // Intentar recuperar logo del frontend si el backend no lo incluyó
            let logo = res.data.logo_empresa;
            if (!logo && res.data.prescriptor_id) {
                try {
                    // Usamos el endpoint del backend para recuperar la lista y buscar nuestro logo
                    const presRes = await axios.get('/api/prescriptores');
                    const miPrescriptor = presRes.data.find(p => p.id_empresa === res.data.prescriptor_id);
                    if (miPrescriptor?.logo_empresa) {
                        logo = miPrescriptor.logo_empresa;
                    }
                } catch (err) {
                    console.error('Error al recuperar logo de respaldo:', err);
                }
            }

            setUser(prev => ({
                ...sessionData.user,
                nombre: res.data.perfilCompleto?.nombre || sessionData.user?.user_metadata?.nombre,
                apellidos: res.data.perfilCompleto?.apellidos || sessionData.user?.user_metadata?.apellidos,
                businessProfile: res.data.perfilCompleto,
                rol: res.data.rol_nombre,
                id_usuario: res.data.id_usuario,
                prescriptor_id: res.data.prescriptor_id,
                razon_social: res.data.razon_social,
                logo_empresa: logo
            }));
        }
    } catch (e) {
        console.error("Error cargando perfil:", e.response?.data || e.message);
    } finally {
        setLoading(false);
    }
  };

  const signIn = async (email, password) => {
      return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => {
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
