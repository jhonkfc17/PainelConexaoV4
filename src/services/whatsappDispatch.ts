import { waSend } from "./whatsappConnector";

const MANUAL_KEY = "wa_manual_mode";

export function sanitizeOutgoingWhatsAppText(raw: string) {
  let txt = String(raw ?? "").normalize("NFC");

  const commonFixes: Array<[string, string]> = [
    ["ðŸ“„", "\u{1F4C4}"], // 📄
    ["ðŸ’°", "\u{1F4B0}"], // 💰
    ["ðŸ“†", "\u{1F4C6}"], // 📆
    ["ðŸ—“", "\u{1F5D3}"], // 🗓
    ["âœ…", "\u{2705}"], // ✅
    ["âš ï¸", "\u{26A0}\u{FE0F}"], // ⚠️
    ["ðŸŽ¯", "\u{1F3AF}"], // 🎯
    ["â±", "\u{23F1}"], // ⏱
    ["â³", "\u{23F3}"], // ⏳
  ];

  for (const [bad, good] of commonFixes) {
    if (txt.includes(bad)) txt = txt.split(bad).join(good);
  }

  txt = txt
    .split("\n")
    .map((line) => {
      if (!line.includes("\uFFFD")) return line;
      const lower = line.toLowerCase();
      let emoji = "\u{1F4CC}"; // 📌 fallback
      if (lower.includes("olá") || lower.includes("ola")) emoji = "\u{1F4C4}";
      if (lower.includes("nome")) emoji = "\u{1F464}"; // 👤
      if (lower.includes("valor")) emoji = "\u{1F4B0}";
      if (lower.includes("parcela")) emoji = "\u{1F4C6}";
      if (lower.includes("vencimento")) emoji = "\u{1F5D3}";
      if (lower.includes("pix")) emoji = "\u{1F511}"; // 🔑
      return line.replace(/^(\s*)\uFFFD+/, `$1${emoji}`);
    })
    .join("\n");

  return txt.replace(/\uFFFD+/g, "");
}

/**
 * Envio pelo WhatsApp do usuário logado (Cloud API). Se o modo manual estiver
 * ativo, abre o WhatsApp Web com o texto preenchido.
 */
export async function sendWhatsAppFromPanel(params: { to: string; message: string }) {
  const { to, message } = params;
  const cleanMessage = sanitizeOutgoingWhatsAppText(message);

  try {
    const manual = localStorage.getItem(MANUAL_KEY) === "1";
    if (manual && typeof window !== "undefined") {
      const url = `https://wa.me/${encodeURIComponent(to)}?text=${encodeURIComponent(cleanMessage)}`;
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
