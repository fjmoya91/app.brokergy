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
         setUser(prev => ({ ...session.user, ...prev })); // Mergea datos base primero
         fetchBusinessProfile(session);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBusinessProfile = async (sessionData) => {
    try {
        // En lugar de leer a pelo, llamamos al backend que es el punto real de acceso con el rol decodificado
        const res = await axios.get('/api/usuarios/me');
        if (res.data) {
           setUser(prev => ({
              ...sessionData.user, // Siempre mantener lo base as-is
              businessProfile: res.data.perfilCompleto,
              rol: res.data.rol_nombre,
              id_usuario: res.data.id_usuario,
              prescriptor_id: res.data.prescriptor_id,
              razon_social: res.data.razon_social
           }));
        }
    } catch (e) {
        console.error("Error de catch cargando perfil desde backend", e.response?.data || e.message);
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
      // Necesita configuración de URLs en dashboard
      return supabase.auth.resetPasswordForEmail(email);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, resetPassword }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
