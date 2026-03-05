import { waSend } from "./whatsappConnector";

const MANUAL_KEY = "wa_manual_mode";

/**
 * No modo manual (WhatsApp Web), NÃO tente "corrigir" emojis substituindo caracteres
 * quebrados por um emoji genérico (ex: 📌). Isso causava exatamente o problema reportado:
 * todas as linhas acabavam com o mesmo emoji.
 */
function finalizeManualWhatsAppText(raw: string) {
  return String(raw ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .normalize("NFC");
}

export function buildWhatsAppWebUrl(to: string, message: string) {
  const safeTo = String(to ?? "").trim();
  const safeMessage = finalizeManualWhatsAppText(message);
  // Use o endpoint oficial do WhatsApp para evitar reescritas/redirects que quebram Unicode.
  // `encodeURIComponent` deve ser aplicado UMA única vez.
  return `https://api.whatsapp.com/send/?phone=${encodeURIComponent(safeTo)}&text=${encodeURIComponent(safeMessage)}`;
}

export function sanitizeOutgoingWhatsAppText(raw: string) {
  let txt = String(raw ?? "").normalize("NFC");

  const commonFixes: Array<[string, string]> = [
    ["Ã°Å¸â€œâ€ž", "\u{1F4C4}"], // ðŸ“„
    ["Ã°Å¸â€™Â°", "\u{1F4B0}"], // ðŸ’°
    ["Ã°Å¸â€œâ€ ", "\u{1F4C6}"], // ðŸ“†
    ["Ã°Å¸â€”â€œ", "\u{1F5D3}"], // ðŸ—“
    ["Ã¢Å“â€¦", "\u{2705}"], // âœ…
    ["Ã¢Å¡Â Ã¯Â¸Â", "\u{26A0}\u{FE0F}"], // âš ï¸
    ["Ã°Å¸Å½Â¯", "\u{1F3AF}"], // ðŸŽ¯
    ["Ã¢ÂÂ±", "\u{23F1}"], // â±
    ["Ã¢ÂÂ³", "\u{23F3}"], // â³
  ];

  for (const [bad, good] of commonFixes) {
    if (txt.includes(bad)) txt = txt.split(bad).join(good);
  }

  // Não prefixe linhas com emojis automaticamente. Apenas remova caracteres claramente quebrados.
  return txt
    .replace(/\uFFFD+/g, "")
    .replace(/ï¿½|�/g, "")
    .replace(/^\s*(?:\?)+\s*/gm, "");
}

/**
 * Envio pelo WhatsApp do usuÃ¡rio logado (Cloud API). Se o modo manual estiver
 * ativo, abre o WhatsApp Web com o texto preenchido.
 */
export async function sendWhatsAppFromPanel(params: { to: string; message: string }) {
  const { to, message } = params;
  const cleanMessage = sanitizeOutgoingWhatsAppText(message);
  const manualMessage = finalizeManualWhatsAppText(message);

  try {
    const manual = localStorage.getItem(MANUAL_KEY) === "1";
    if (manual && typeof window !== "undefined") {
      // No modo manual (WhatsApp Web), preserve o texto exatamente como digitado
      // para não corromper emojis personalizados do template.
      const url = buildWhatsAppWebUrl(to, manualMessage);
      window.open(url, "_blank", "noreferrer");
      return { ok: true, manual: true };
    }
  } catch {
    // fallback para envio normal
  }

  return waSend(to, cleanMessage);
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

