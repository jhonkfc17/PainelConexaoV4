// src/utils/whatsapp.ts

/**
 * Normaliza telefone para wa.me
 * Aceita: +55, (11) 9xxxx-xxxx, 119xxxxxxx, etc.
 */
export function normalizarTelefoneBR(telefone?: string) {
  if (!telefone) return "";
  const digits = String(telefone).replace(/\D/g, "");
  if (!digits) return "";

  // Se já vier com 55 (Brasil)
  if (digits.length >= 12 && digits.startsWith("55")) return digits;

  // Se vier com 10/11 dígitos (DDD + número)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  // fallback
  return digits;
}

/**
 * Monta link WhatsApp com texto opcional
 */
export function montarLinkWhatsApp(telefone?: string, mensagem?: string) {
  const tel = normalizarTelefoneBR(telefone);
  if (!tel) return "";
  const base = `https://wa.me/${tel}`;
  if (!mensagem?.trim()) return base;
  return `${base}?text=${encodeURIComponent(mensagem.trim())}`;
}

/**
 * Abre WhatsApp em nova aba
 */
export function abrirWhatsApp(telefone?: string, mensagem?: string) {
  const url = montarLinkWhatsApp(telefone, mensagem);

  if (!url) {
    alert("Cliente sem telefone cadastrado.");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
