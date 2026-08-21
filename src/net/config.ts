/* =========================================================================
   Rift Dodge — hálózati konfiguráció (Supabase Realtime)
   A Supabase anon kulcs *nyilvános* (kliensbe szánt) — biztonságos beégetni.
   Felülírható a build-időben Vite env-változókkal, ha valaki saját
   projektet szeretne használni:
     VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   ========================================================================= */

const FALLBACK_URL = "https://jzefdwshnvjazllgorlw.supabase.co";
const FALLBACK_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZWZkd3NobnZqYXpsbGdvcmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMTUyODQsImV4cCI6MjEwMjg5MTI4NH0.TOSduKNsOtlPuzGoWXAEva8rl4Nxo0BXdrWEqFPNhms";

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON;

/** Van-e egyáltalán bekötött realtime backend (mindig igaz a beégetett alappal). */
export const NET_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
