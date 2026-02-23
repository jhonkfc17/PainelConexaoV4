import React, { useEffect, useMemo, useRef, useState } from "react";
import WhatsAppConnectorCard from "../components/WhatsAppConnectorCard";
import {
  Building2,
  Save,
  User,
  BellRing,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
  FileText,
  ReceiptText,
  CalendarDays,
  ClipboardCopy,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  getAllMessageTemplates,
  MESSAGE_TEMPLATE_VARIABLES,
  type MessageTemplateKey,
  setAllMessageTemplates,
  fillTemplate,
} from "../lib/messageTemplates";

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

export default function Configuracoes() {
  const user = useAuthStore((s) => s.user);
  const tenantId = useAuthStore((s) => s.tenantId);

  // profile
  const [nomeCompleto, setNomeCompleto] = useState(() => lsGet("cfg_nome_completo", ""));
  const [whatsapp, setWhatsapp] = useState(() => lsGet("cfg_whatsapp", ""));
  const [empresaNome, setEmpresaNome] = useState(() => lsGet("cfg_empresa_nome", ""));

  // defaults for templates
  const [pixPadrao, setPixPadrao] = useState(() => lsGet("cfg_pix", ""));
  const [assinaturaPadrao, setAssinaturaPadrao] = useState(() => lsGet("cfg_assinatura", ""));

  // automations
  const [autoEnabled, setAutoEnabled] = useState(() => lsGet("cfg_auto_enabled", "0") === "1");
  const [autoTime, setAutoTime] = useState(() => lsGet("cfg_auto_time", "08:00"));
  const [autoVenceHoje, setAutoVenceHoje] = useState(() => lsGet("cfg_auto_vence_hoje", "1") === "1");
  const [autoAtraso, setAutoAtraso] = useState(() => lsGet("cfg_auto_atraso", "1") === "1");
  const [autoAntecipada, setAutoAntecipada] = useState(() => lsGet("cfg_auto_antecipada", "0") === "1");

  // templates
  const [tab, setTab] = useState<MessageTemplateKey>("cobranca_mensal");
  const [templates, setTemplates] = useState<Record<MessageTemplateKey, string>>(() => getAllMessageTemplates());

  const perfilCompleto = useMemo(() => {
    const okNome = nomeCompleto.trim().length >= 3;
    const okWpp = whatsapp.replace(/\D/g, "").length >= 10;
    return okNome && okWpp;
  }, [nomeCompleto, whatsapp]);

  // anchors
  const refPerfil = useRef<HTMLDivElement | null>(null);
  const refEmpresa = useRef<HTMLDivElement | null>(null);
  const refAuto = useRef<HTMLDivElement | null>(null);
  const refTemplates = useRef<HTMLDivElement | null>(null);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveAll() {
    lsSet("cfg_nome_completo", nomeCompleto);
    lsSet("cfg_whatsapp", whatsapp);
    lsSet("cfg_empresa_nome", empresaNome);

    lsSet("cfg_pix", pixPadrao);
    lsSet("cfg_assinatura", assinaturaPadrao);

    lsSet("cfg_auto_enabled", autoEnabled ? "1" : "0");
    lsSet("cfg_auto_time", autoTime);
    lsSet("cfg_auto_vence_hoje", autoVenceHoje ? "1" : "0");
    lsSet("cfg_auto_atraso", autoAtraso ? "1" : "0");
    lsSet("cfg_auto_antecipada", autoAntecipada ? "1" : "0");

    setAllMessageTemplates(templates);

    const el = document.getElementById("cfg_saved");
    if (el) {
      el.classList.remove("opacity-0");
      setTimeout(() => el.classList.add("opacity-0"), 1400);
    }
  }

  function resetTemplates() {
    setTemplates({ ...DEFAULT_MESSAGE_TEMPLATES });
  }

  // persist live
  useEffect(() => lsSet("cfg_nome_completo", nomeCompleto), [nomeCompleto]);
  useEffect(() => lsSet("cfg_whatsapp", whatsapp), [whatsapp]);
  useEffect(() => lsSet("cfg_empresa_nome", empresaNome), [empresaNome]);

  useEffect(() => lsSet("cfg_pix", pixPadrao), [pixPadrao]);
  useEffect(() => lsSet("cfg_assinatura", assinaturaPadrao), [assinaturaPadrao]);

  useEffect(() => lsSet("cfg_auto_enabled", autoEnabled ? "1" : "0"), [autoEnabled]);
  useEffect(() => lsSet("cfg_auto_time", autoTime), [autoTime]);
  useEffect(() => lsSet("cfg_auto_vence_hoje", autoVenceHoje ? "1" : "0"), [autoVenceHoje]);
  useEffect(() => lsSet("cfg_auto_atraso", autoAtraso ? "1" : "0"), [autoAtraso]);
  useEffect(() => lsSet("cfg_auto_antecipada", autoAntecipada ? "1" : "0"), [autoAntecipada]);

  useEffect(() => setAllMessageTemplates(templates), [templates]);

  const badgeStatus = autoEnabled ? "Ativo" : "Inativo";
  const badgeClass = autoEnabled
    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
    : "bg-white/5 border-white/10 text-slate-400";

  const templateTabs: Array<{
    key: MessageTemplateKey;
    title: string;
    icon: React.ReactNode;
    hint: string;
  }> = [
    { key: "novo_contrato", title: "Novo contrato", icon: <FileText size={14} />, hint: "Usado ao registrar um novo empréstimo." },

    { key: "cobranca_mensal", title: "Cobrança (mensal)", icon: <ReceiptText size={14} />, hint: "Cobrança padrão para empréstimos mensais." },
    { key: "cobranca_semanal", title: "Cobrança (semanal)", icon: <ReceiptText size={14} />, hint: "Cobrança padrão para empréstimos semanais." },

    { key: "atraso_mensal", title: "Atraso (mensal)", icon: <BellRing size={14} />, hint: "Mensagem quando a parcela mensal está em atraso." },
    { key: "atraso_semanal", title: "Atraso (semanal)", icon: <BellRing size={14} />, hint: "Mensagem quando a parcela semanal está em atraso." },

    { key: "vence_hoje", title: "Vence hoje", icon: <CalendarDays size={14} />, hint: "Lembrete quando vence hoje." },
    { key: "antecipada", title: "Antecipada", icon: <CalendarDays size={14} />, hint: "Lembrete com antecedência." },
  ];

  function insertVar(v: string) {
    setTemplates((prev) => {
      const next = { ...prev };
      const current = next[tab] ?? "";
      next[tab] = current.length ? `${current}\n${v}` : v;
      return next;
    });
  }

  const previewVars = useMemo(() => {
    return {
      CLIENTE: "João da Silva",
      VALOR: "R$ 150,00",
      VALOR_EMPRESTADO: "R$ 1.000,00",
      VALOR_PARCELA: "R$ 150,00",
      TOTAL: "R$ 1.200,00",
      PARCELAS: "8",
      PARCELA: "3/8",
      DATA: "2026-03-10",
      DATA_CONTRATO: "2026-02-16",
      PRIMEIRO_VENCIMENTO: "2026-02-24",
      PROX_VENCIMENTO: "2026-03-10",
      DIAS_ATRASO: "4",
      DIAS_PARA_VENCER: "2",
      MULTA: "",
      JUROS: "",
      PROGRESSO: "",
      PIX: pixPadrao || "🔑 Chave PIX: (preencha em Configurações)",
      ASSINATURA: assinaturaPadrao || "—\n*Sua Empresa*",
    } as Record<string, string>;
  }, [pixPadrao, assinaturaPadrao]);

  const previewText = useMemo(() => {
    const tpl = templates[tab] ?? "";
    return fillTemplate(tpl, previewVars);
  }, [templates, tab, previewVars]);

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(previewText);
      const el = document.getElementById("cfg_copied");
      if (el) {
        el.classList.remove("opacity-0");
        setTimeout(() => el.classList.add("opacity-0"), 1200);
      }
    } catch {
      alert("Não foi possível copiar. Seu navegador bloqueou a área de transferência.");
    }
  }

  return (
    <div className="w-full max-w-full sm:max-w-5xl sm:mx-auto p-3 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Configurações</div>
          <div className="text-sm text-slate-400 mt-1">Gerencie seu perfil e preferências</div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs " +
              (perfilCompleto
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-400")
            }
          >
            <CheckCircle2 size={14} />
            {perfilCompleto ? "Perfil Completo" : "Perfil Incompleto"}
          </div>

          <button
            onClick={saveAll}
            className="rounded-xl bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-semibold hover:opacity-95"
          >
            <span className="inline-flex items-center gap-2">
              <Save size={16} />
              Salvar
            </span>
          </button>
        </div>
      </div>

      {/* mini menu */}
      <div className="mt-4 sticky top-0 z-10">
        <div className="rounded-2xl border border-emerald-500/15 bg-slate-950/70 backdrop-blur-md px-2 py-2 flex gap-2 overflow-x-auto no-scrollbar -mx-1 sm:mx-0 sm:px-3 sm:flex-wrap">
          <button
            onClick={() => scrollTo(refPerfil)}
            className="px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-200 text-xs hover:bg-emerald-500/15"
          >
            Perfil
          </button>
          <button
            onClick={() => scrollTo(refEmpresa)}
            className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border border-emerald-500/15 bg-slate-950/40 text-slate-200/90 text-xs hover:bg-white/5"
          >
            Empresa
          </button>
          <button
            onClick={() => scrollTo(refAuto)}
            className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border border-emerald-500/15 bg-slate-950/40 text-slate-200/90 text-xs hover:bg-white/5"
          >
            Cobrança Automática
          </button>
          <button
            onClick={() => scrollTo(refTemplates)}
            className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border border-emerald-500/15 bg-slate-950/40 text-slate-200/90 text-xs hover:bg-white/5"
          >
            Mensagens
          </button>

          <div id="cfg_saved" className="ml-auto text-xs text-emerald-300 opacity-0 transition-opacity">
            Alterações salvas ✅
          </div>
        </div>
      </div>

      {/* PERFIL */}
      <div
        ref={refPerfil}
        className="mt-5 rounded-2xl border border-emerald-500/15 bg-slate-950/35 shadow-glow backdrop-blur-md p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
            <User size={18} className="text-emerald-300" />
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">Perfil</div>
            <div className="text-sm text-slate-400">Informações pessoais da sua conta</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <div className="text-sm font-medium">Nome Completo *</div>
                <input
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  placeholder="Seu nome completo"
                  className="mt-2 w-full rounded-xl border border-emerald-500/15 bg-slate-950/50 px-4 py-3 text-sm outline-none focus:border-emerald-500/35"
                />
              </div>

              <div>
                <div className="text-sm font-medium">Email</div>
                <input
                  value={user?.email || ""}
                  readOnly
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 outline-none"
                />
              </div>

              <div>
                <div className="text-sm font-medium">WhatsApp *</div>
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="mt-2 w-full rounded-xl border border-emerald-500/15 bg-slate-950/50 px-4 py-3 text-sm outline-none focus:border-emerald-500/35"
                />
                <div className="text-xs text-slate-400 mt-2">
                  Esse número será usado como remetente do WhatsApp conectado.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EMPRESA */}
      <div
        ref={refEmpresa}
        className="mt-4 rounded-2xl border border-emerald-500/15 bg-slate-950/35 shadow-glow backdrop-blur-md p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
            <Building2 size={18} className="text-emerald-300" />
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">Empresa</div>
            <div className="text-sm text-slate-400">Informações da sua empresa (opcional)</div>

            <div className="mt-4">
              <div className="text-sm font-medium">Nome da Empresa</div>
              <input
                value={empresaNome}
                onChange={(e) => setEmpresaNome(e.target.value)}
                placeholder="Minha Empresa Ltda"
                className="mt-2 w-full rounded-xl border border-emerald-500/15 bg-slate-950/50 px-4 py-3 text-sm outline-none focus:border-emerald-500/35"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ✅ WHATSAPP CONNECTOR */}
      <div className="mt-4">
        <WhatsAppConnectorCard tenantId={tenantId ?? undefined} />
      </div>

      {/* COBRANÇA AUTOMÁTICA */}
      <div
        ref={refAuto}
        className="mt-4 rounded-2xl border border-emerald-500/15 bg-slate-950/35 shadow-glow backdrop-blur-md p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <BellRing size={18} className="text-emerald-300" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-xl font-semibold">Cobrança automática</div>
                <span className={"rounded-full border px-3 py-1 text-xs " + badgeClass}>{badgeStatus}</span>
              </div>
              <div className="text-sm text-slate-400">Controle do disparo automático de mensagens (em breve)</div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Ativar
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="text-sm font-medium">Horário</div>
            <div className="text-xs text-slate-400 mt-1">Horário do disparo diário (futuro)</div>
            <input
              type="time"
              value={autoTime}
              onChange={(e) => setAutoTime(e.target.value)}
              className="mt-3 w-full min-h-[140px] rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm outline-none focus:border-emerald-500/35"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="text-sm font-medium">Tipos de mensagens</div>
            <div className="text-xs text-slate-400 mt-1">Quais mensagens devem ser consideradas</div>

            <div className="mt-3 grid gap-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-200/90">Vence hoje</span>
                <input
                  type="checkbox"
                  checked={autoVenceHoje}
                  onChange={(e) => setAutoVenceHoje(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-200/90">Atraso</span>
                <input
                  type="checkbox"
                  checked={autoAtraso}
                  onChange={(e) => setAutoAtraso(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-200/90">Antecipada</span>
                <input
                  type="checkbox"
                  checked={autoAntecipada}
                  onChange={(e) => setAutoAntecipada(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* MENSAGENS */}
      <div
        ref={refTemplates}
        className="mt-4 rounded-2xl border border-emerald-500/15 bg-slate-950/35 shadow-glow backdrop-blur-md p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquare size={18} className="text-emerald-300" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold">Mensagens (WhatsApp)</div>
                <div className="text-sm text-slate-400">Personalize os textos enviados ao cliente</div>
              </div>

              <button
                onClick={resetTemplates}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <RotateCcw size={16} />
                  Restaurar padrão
                </span>
              </button>
            </div>

            {/* defaults */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="text-sm font-semibold">PIX padrão</div>
                <div className="mt-1 text-xs text-slate-400">
                  Isso entra automaticamente na variável <b>{"{PIX}"}</b>.
                </div>
                <textarea
                  value={pixPadrao}
                  onChange={(e) => setPixPadrao(e.target.value)}
                  rows={6}
                  placeholder={"Ex:\n🔑 Chave PIX: 000.000.000-00\n📲 Banco: ...\n\nOu cole o copia e cola"}
                  className="mt-3 w-full min-h-[140px] rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm outline-none focus:border-emerald-500/35"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="text-sm font-semibold">Assinatura padrão</div>
                <div className="mt-1 text-xs text-slate-400">
                  Isso entra automaticamente na variável <b>{"{ASSINATURA}"}</b>.
                </div>
                <textarea
                  value={assinaturaPadrao}
                  onChange={(e) => setAssinaturaPadrao(e.target.value)}
                  rows={6}
                  placeholder={"Ex:\n—\n*Raposacobra*\n(11) 99999-9999"}
                  className="mt-3 w-full min-h-[140px] rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm outline-none focus:border-emerald-500/35"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {/* tabs */}
              <div className="flex flex-wrap gap-2">
                {templateTabs.map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition " +
                        (active
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-white/5 text-slate-200/90 hover:bg-white/10")
                      }
                      title={t.hint}
                    >
                      {t.icon}
                      {t.title}
                    </button>
                  );
                })}
              </div>

              <div className="text-xs text-slate-400">{templateTabs.find((t) => t.key === tab)?.hint}</div>

              {/* editor + preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">Template: {templateTabs.find((t) => t.key === tab)?.title}</div>
                    <div className="text-xs text-slate-400">
                      Use variáveis (ex: {"{CLIENTE}"}) para preencher automaticamente.
                    </div>
                  </div>

                  <textarea
                    value={templates[tab] ?? ""}
                    onChange={(e) => setTemplates((prev) => ({ ...prev, [tab]: e.target.value }))}
                    rows={12}
                    className="mt-3 w-full min-h-[140px] rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm outline-none focus:border-emerald-500/35"
                    placeholder="Digite sua mensagem..."
                  />

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {MESSAGE_TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVar(v)}
                        className="w-full truncate rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-200/90 hover:bg-white/10 sm:w-auto sm:py-1"
                        title="Adicionar variável ao final"
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                    <div className="text-xs font-semibold text-emerald-200">Dicas</div>
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-300/90 space-y-1">
                      <li>Use *asteriscos* para negrito no WhatsApp.</li>
                      <li>Quebras de linha são preservadas.</li>
                      <li>
                        Se <b>{"{PIX}"}</b> / <b>{"{ASSINATURA}"}</b> estiverem vazios, preencha acima em “Mensagens”.
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Preview</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Exemplo preenchido automaticamente (não envia nada).
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div id="cfg_copied" className="text-xs text-emerald-300 opacity-0 transition-opacity">
                        Copiado ✅
                      </div>
                      <button
                        onClick={copyPreview}
                        className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                        title="Copiar preview"
                      >
                        <span className="inline-flex items-center gap-2">
                          <ClipboardCopy size={14} />
                          Copiar
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <pre className="whitespace-pre-wrap text-[13px] leading-5 text-slate-100/90 font-mono">
{previewText}
                    </pre>
                  </div>

                  <div className="mt-3 text-xs text-slate-400">
                    Você pode usar as variáveis acima. O sistema troca pelos dados do cliente/parcelas na hora do envio.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-20" />
    </div>
  );
}
