import { waSend } from "./whatsappConnector";

/**
 * Envio simples pelo WhatsApp do usuário logado.
 * (cada usuário tem sua própria sessão, identificada pelo user.id na Edge Function)
 */
export async function sendWhatsAppFromPanel(params: { to: string; message: string }) {
  const { to, message } = params;
  return waSend(to, message);
}
