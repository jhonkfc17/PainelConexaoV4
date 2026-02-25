// src/services/whatsappDispatch.ts

import { waSend, waStatus } from "./whatsappConnector";

/**
 * Normaliza telefone para formato aceito pelo connector (apenas dígitos).
 * - Se vier com 10/11 dígitos (DDD + número), prefixa 55
 * - Se já vier com 55, mantém
 */
export function normalizeToE164BR(raw: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

type SendOpts = {
  tenant_id: string;
  to: string; // raw phone (any format) OR already-sanitized digits
  message: string;
  /**
   * Se true, não faz chamada extra para /status antes de enviar.
   * (default: false)
   */
  skipStatusCheck?: boolean;
};

/**
 * Envio direto pelo WhatsApp Connector (sem abrir WhatsApp Web).
 * - Valida tenant_id
 * - Normaliza telefone
 * - Confere se o tenant está "ready" antes de enviar
 */
export async function sendWhatsAppFromPanel(opts: SendOpts) {
  const tenant_id = String(opts.tenant_id ?? "").trim();
  if (!tenant_id) throw new Error("Tenant não identificado. Faça login novamente.");

  const message = String(opts.message ?? "").trim();
  if (!message) throw new Error("Mensagem vazia.");

  const to = normalizeToE164BR(opts.to);
  if (!to || to.length < 12) {
    throw new Error("Número inválido. Envie com DDD (ex: 5599999999999)");
  }

  if (!opts.skipStatusCheck) {
    const st = await waStatus();
    if (st.status !== "ready") {
      throw new Error(
        `WhatsApp não está pronto para enviar (status: ${st.status}). Vá em Configurações > WhatsApp e conecte o QR.`
      );
    }
  }

  return waSend(to, message);
}
