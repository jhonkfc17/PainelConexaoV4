import { waSend } from "./whatsappConnector";

const MANUAL_KEY = "wa_manual_mode";

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferEmojiByContent(line: string) {
  const lower = stripDiacritics(line.toLowerCase());
  if (lower.includes("nome")) return "\u{1F464}";
  if (lower.includes("valor") || lower.includes("pagamento")) return "\u{1F4B0}";
  if (lower.includes("parcela")) return "\u{1F4C6}";
  if (lower.includes("vencimento")) return "\u{1F5D3}";
  if (lower.includes("pix") || lower.includes("chave")) return "\u{1F511}";
  if (lower.includes("atencao") || lower.includes("atraso") || lower.includes("juros")) return "\u{26A0}\u{FE0F}";
  if (lower.includes("ola")) return "\u{1F4C4}";
  return "\u{1F4CC}";
}

function repairBrokenGlyphsOnly(raw: string) {
  return String(raw ?? "")
    .normalize("NFC")
    .split("\n")
    .map((line) => {
      const hasBrokenPrefix = /^\s*(?:\uFFFD|ï¿½|�)+\s*/.test(line);
      if (!hasBrokenPrefix && !line.includes("\uFFFD")) return line;
      const normalized = line.replace(/^\s*(?:\uFFFD|ï¿½|�)+\s*/g, "").replace(/\uFFFD+/g, "");
      const emoji = inferEmojiByContent(normalized);
      return `${emoji} ${normalized}`.trimEnd();
    })
    .join("\n");
}

function finalizeManualWhatsAppText(raw: string) {
  const cleaned = repairBrokenGlyphsOnly(raw)
    .replace(/\uFFFD+/g, "📌")
    .replace(/ï¿½|�/g, "📌")
    .replace(/\u0000/g, "")
    .normalize("NFC");

  // Failsafe extra: remove qualquer prefixo inválido em linhas de rótulo
  // (Nome/Valor/Pagamento/Vencimento/Juros/PIX), mantendo o conteúdo da linha.
  return cleaned.replace(
    /(^|\n)\s*[^A-Za-z0-9À-ÿ*{(]+(?=\s*\*?\s*(?:Nome|Valor|Pagamento|Vencimento|Juros|Chave|Pix|PagSeguro))/gim,
    "$1📌 "
  );
}

export function buildWhatsAppWebUrl(to: string, message: string) {
  // IMPORTANTE:
  // - Sempre use encodeURIComponent APENAS UMA VEZ no texto.
  // - Evite o encurtador/redirect do wa.me, porque em alguns browsers ele
  //   pode reescrever a URL e exibir caracteres unicode "quebrados" (ex: �)
  //   na barra de endereços.
  // Usando diretamente api.whatsapp.com com o texto url-encoded preserva emojis.

  const safeTo = String(to ?? "").trim().replace(/\D/g, "");
  const safeMessage = finalizeManualWhatsAppText(message);
  return `https://api.whatsapp.com/send/?phone=${safeTo}&text=${encodeURIComponent(safeMessage)}`;
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

  txt = txt
    .split("\n")
    .map((line) => {
      const hasBrokenPrefix = /^\s*(?:\uFFFD|ï¿½|�|\?)+\s*/.test(line);
      if (hasBrokenPrefix) {
        const emoji = inferEmojiByContent(line);
        return line.replace(/^\s*(?:\uFFFD|ï¿½|�|\?)+\s*/, `${emoji} `);
      }

      if (line.includes("\uFFFD")) {
        const emoji = inferEmojiByContent(line);
        return line.replace(/\uFFFD+/g, emoji);
      }

      const lower = stripDiacritics(line.toLowerCase());
      const isLabelLine =
        lower.includes("nome") ||
        lower.includes("valor") ||
        lower.includes("pagamento") ||
        lower.includes("vencimento") ||
        lower.includes("parcela") ||
        lower.includes("juros") ||
        lower.includes("pix") ||
        lower.includes("chave") ||
        lower.includes("pagseguro");
      const hasKnownEmojiPrefix = /^\s*(?:📄|💰|📆|🗓|🔑|⚠️|👤|📌)/.test(line);
      if (isLabelLine && !hasKnownEmojiPrefix) {
        const emoji = inferEmojiByContent(line);
        const normalized = line.replace(/^\s*[^A-Za-z0-9À-ÿ]*\s*/u, "");
        return `${emoji} ${normalized}`;
      }

      return line;
    })
    .join("\n");

  return txt.replace(/\uFFFD+/g, "");
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

