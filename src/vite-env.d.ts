/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;

  // WhatsApp / Socket / integrações (opcionais)
  readonly VITE_WHATSAPP_API_URL?: string;
  readonly VITE_WHATSAPP_TOKEN?: string;
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
