import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Almacenamiento persistente de sesión EXPLÍCITO.
// En el PWA de iOS (WebView "standalone") supabase-js a veces no detecta
// localStorage al arrancar y cae a almacenamiento en MEMORIA → la sesión se
// pierde al cerrar la app y pide login cada vez. Forzar window.localStorage +
// autoRefreshToken mantiene la sesión entre lanzamientos.
// NOTA: no cambiamos storageKey (default) para no invalidar sesiones ya activas.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
