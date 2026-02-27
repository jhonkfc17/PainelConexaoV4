import { waSend } from "./whatsappConnector";

const MANUAL_KEY = "wa_manual_mode";

/**
 * Envio pelo WhatsApp do usuário logado (Cloud API). Se o modo manual estiver
 * ativo, abre o WhatsApp Web com o texto preenchido.
 */
export async function sendWhatsAppFromPanel(params: { to: string; message: string }) {
  const { to, message } = params;

  try {
    const manual = localStorage.getItem(MANUAL_KEY) === "1";
    if (manual && typeof window !== "undefined") {
      const url = `https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noreferrer");
      return { ok: true, manual: true };
    }
  } catch {
    // fallback para envio normal
  }

  return waSend(to, message);
}

export function setWhatsAppManualMode(on: boolean) {
  try {
    localStorage.setItem(MANUAL_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

export function isWhatsAppManualMode(): boolean {
  try {
    return localStorage.getItem(MANUAL_KEY) === "1";
  } catch {
    return false;
  }
}
