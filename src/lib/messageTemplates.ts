// src/lib/messageTemplates.ts
export type MessageTemplateKey =
  | "novo_contrato"
  | "cobranca_mensal"
  | "cobranca_semanal"
  | "atraso_mensal"
  | "atraso_semanal"
  | "vence_hoje"
  | "antecipada";

function lsGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Chaves no localStorage:
 * - cfg_tpl_<key>
 */
export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  novo_contrato: [
    "✅ *Olá {CLIENTE}!*",
    "",
    "Seu empréstimo foi registrado com sucesso.",
    "",
    "💰 *Valor emprestado:* {VALOR_EMPRESTADO}",
    "📈 *Total a receber:* {TOTAL}",
    "🧾 *Parcelas:* {PARCELAS}x de {VALOR_PARCELA}",
    "🗒 *Contrato:* {DATA_CONTRATO}",
    "📆 *1º vencimento:* {PRIMEIRO_VENCIMENTO}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  // Mensal usa o mesmo texto do semanal por padrão
  cobranca_mensal: [
    "📄 *Olá {CLIENTE}!*",
    "",
    "Passando para lembrar da sua parcela (semanal).",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  cobranca_semanal: [
    "📄 *Olá {CLIENTE}!*",
    "",
    "Passando para lembrar da sua parcela (semanal).",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  atraso_mensal: [
    "⚠️ *Atenção {CLIENTE}*",
    "",
    "🎯 *PARCELA EM ATRASO (MENSAL)*",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "⏱ *Dias em Atraso:* {DIAS_ATRASO}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  atraso_semanal: [
    "⚠️ *Atenção {CLIENTE}*",
    "",
    "🎯 *PARCELA EM ATRASO (SEMANAL)*",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "⏱ *Dias em Atraso:* {DIAS_ATRASO}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  vence_hoje: [
    "📄 *Olá {CLIENTE}!*",
    "",
    "Hoje é o vencimento da sua parcela.",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),

  antecipada: [
    "✅ *Olá {CLIENTE}!*",
    "",
    "Passando para lembrar que sua parcela vence em breve.",
    "",
    "💰 *Valor:* {VALOR}",
    "📆 *Parcela:* {PARCELA}",
    "🗓 *Vencimento:* {DATA}",
    "⏳ *Dias para Vencer:* {DIAS_PARA_VENCER}",
    "",
    "{PIX}",
    "",
    "{ASSINATURA}",
  ].join("\n"),
};

export const MESSAGE_TEMPLATE_VARIABLES = [
  "{CLIENTE}",
  "{VALOR}",
  "{VALOR_EMPRESTADO}",
  "{VALOR_PARCELA}",
  "{TOTAL}",
  "{PARCELAS}",
  "{PARCELA}",
  "{DATA}",
  "{DATA_CONTRATO}",
  "{PRIMEIRO_VENCIMENTO}",
  "{PROX_VENCIMENTO}",
  "{DIAS_ATRASO}",
  "{DIAS_PARA_VENCER}",
  "{MULTA}",
  "{JUROS}",
  "{PROGRESSO}",
  "{PIX}",
  "{ASSINATURA}",
] as const;

export function getMessageTemplate(key: MessageTemplateKey) {
  return lsGet(`cfg_tpl_${key}`, DEFAULT_MESSAGE_TEMPLATES[key]);
}

export function setMessageTemplate(key: MessageTemplateKey, value: string) {
  lsSet(`cfg_tpl_${key}`, value);
}

export function getAllMessageTemplates(): Record<MessageTemplateKey, string> {
  return {
    novo_contrato: getMessageTemplate("novo_contrato"),
    cobranca_mensal: getMessageTemplate("cobranca_mensal"),
    cobranca_semanal: getMessageTemplate("cobranca_semanal"),
    atraso_mensal: getMessageTemplate("atraso_mensal"),
    atraso_semanal: getMessageTemplate("atraso_semanal"),
    vence_hoje: getMessageTemplate("vence_hoje"),
    antecipada: getMessageTemplate("antecipada"),
  };
}

export function setAllMessageTemplates(v: Record<MessageTemplateKey, string>) {
  (Object.keys(v) as MessageTemplateKey[]).forEach((k) => setMessageTemplate(k, v[k]));
}

/**
 * Substitui {VAR} por valores fornecidos.
 * - Variáveis não fornecidas ficam em branco.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
) {
  return template.replace(/\{[A-Z0-9_]+\}/g, (token) => {
    const key = token.slice(1, -1);
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}
