import { createClient } from "@supabase/supabase-js";

/**
 * IMPORTANTE (Vercel):
 * As variáveis abaixo PRECISAM existir em produção:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 *
 * Se estiverem ausentes, o bundle pode quebrar em runtime (antes mesmo de renderizar),
 * dependendo da versão do supabase-js e do minificador.
 *
 * Este arquivo faz fallback seguro para evitar crash imediato e deixar um erro claro no console.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[Supabase] Variáveis de ambiente ausentes. Configure no provedor de deploy (Vercel): " +
      "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY."
  );
}

/**
 * Fallback:
 * - se faltar URL/KEY, usamos strings vazias (ou placeholders) para não quebrar o JS ao importar.
 * - As chamadas ao Supabase vão falhar, mas a UI consegue subir e mostrar o erro.
 */
export const supabase = createClient(
  supabaseUrl || "http://localhost:54321",
  supabaseAnonKey || "invalid-anon-key",
  {
    auth: {
      persistSession: true,
      /**
       * IMPORTANTE:
       * Se o projeto Supabase estiver com CORS bloqueando o endpoint /auth/v1/token
       * (ex.: domínio Vercel não está em "CORS allowed origins" no painel do Supabase),
       * o autoRefresh gera erro de CORS e pode travar a experiência de login.
       *
       * Mantemos DESLIGADO por padrão para evitar o travamento.
       * Depois de liberar o domínio no Supabase (Project Settings > API > CORS allowed origins),
       * você pode ligar novamente.
       */
      autoRefreshToken:
        String(import.meta.env.VITE_SUPABASE_DISABLE_AUTO_REFRESH ?? "0") !== "1",
      detectSessionInUrl: true,
    },
  }
);
