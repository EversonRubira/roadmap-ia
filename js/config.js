// Valores PÚBLICOS: o URL do projeto Supabase e a chave publicável (sb_publishable_...). Não são segredos:
// sem sessão do proprietário não dão acesso a nada (RLS). A chave da Groq NUNCA entra aqui: vive só na Edge Function.
export const CONFIG = {
  APP_VERSION: "3.1.0",
  SUPABASE_URL: "",
  SUPABASE_KEY: "",
};
export const advisorEnabled = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
