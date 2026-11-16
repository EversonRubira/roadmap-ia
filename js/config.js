// Configuração pública do frontend. Estes dois valores SÃO públicos por desenho:
// a chave "publishable" só funciona dentro dos limites da Row Level Security.
// NUNCA colocar aqui: service_role, ANTHROPIC_API_KEY, tokens do GitHub ou passwords.
export const CONFIG = {
  SUPABASE_URL: "",              // ex.: https://abcdefgh.supabase.co
  SUPABASE_PUBLISHABLE_KEY: "",  // ex.: sb_publishable_...
  APP_VERSION: "2.1.0",
};
export const isConfigured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CONFIG.SUPABASE_URL) && CONFIG.SUPABASE_PUBLISHABLE_KEY.length > 20;
