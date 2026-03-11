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
    ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u0153\u00E2\u20AC\u017E", "\u{1F4C4}"], // mojibake for 📄
    ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u2122\u00C2\u00B0", "\u{1F4B0}"], // mojibake for 💰
    ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u0153\u00E2\u20AC\u00A0", "\u{1F4C6}"], // mojibake for 📆
    ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u201D\u00E2\u20AC\u0153", "\u{1F5D3}"], // mojibake for 🗓
    ["\u00C3\u00A2\u00C5\u201C\u00E2\u20AC\u00A6", "\u{2705}"], // mojibake for ✅
    ["\u00C3\u00A2\u00C5\u00A1\u00C2\u00A0\u00C3\u00AF\u00C2\u00B8\u00C2\u008F", "\u{26A0}\u{FE0F}"], // mojibake for ⚠️
    ["\u00C3\u00B0\u00C5\u00B8\u00C5\u00BD\u00C2\u00AF", "\u{1F3AF}"], // mojibake for 🎯
    ["\u00C3\u00A2\u00C2\u008F\u00C2\u00B1", "\u{23F1}"], // mojibake for ⏱
    ["\u00C3\u00A2\u00C2\u008F\u00C2\u00B3", "\u{23F3}"], // mojibake for ⏳
  ];

  for (const [bad, good] of commonFixes) {
    if (txt.includes(bad)) txt = txt.split(bad).join(good);
  }

  // Não prefixe linhas com emojis automaticamente. Apenas remova caracteres claramente quebrados.
  return txt
    .replace(/\uFFFD+/g, "")
    .replace(/\u00EF\u00BF\u00BD|\uFFFD/g, "")
    .replace(/^\s*(?:\?)+\s*/gm, "");
}

/**
 * Envio pelo WhatsApp do usuário logado (Cloud API). Se o modo manual estiver
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

