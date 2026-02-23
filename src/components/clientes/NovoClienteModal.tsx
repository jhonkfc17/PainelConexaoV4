// src/components/clientes/NovoClienteModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cliente, DocumentoCliente, EnderecoCliente, TipoCliente } from "./clienteTipos";
import { SelectPremium } from "../ui/SelectPremium";

type Props = {
  open: boolean;
  onClose: () => void;

  // agora serve tanto para criar quanto editar (upsert)
  onCreate: (payload: Partial<Cliente>) => void;

  // quando editar
  initialData?: Cliente;
};

type Step = "dados" | "endereco" | "documentos";

function hojeISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file: File, opts?: { maxSize?: number; quality?: number }): Promise<string> {
  const maxSize = opts?.maxSize ?? 512; // px
  const quality = opts?.quality ?? 0.82;

  const src = await fileToDataUrl(file);

  // Se não for imagem, retorna vazio
  if (!src.startsWith("data:image/")) return "";

  // Carrega em um elemento Image
  const img = new Image();
  img.src = src;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  // calcula resize mantendo proporção
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;

  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.drawImage(img, 0, 0, nw, nh);

  // sempre exporta JPEG para reduzir tamanho
  return canvas.toDataURL("image/jpeg", quality);
}

export default function NovoClienteModal({ open, onClose, onCreate, initialData }: Props) {
  const [step, setStep] = useState<Step>("dados");

  // Dados pessoais
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [fotoDataUrl, setFotoDataUrl] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fotoErro, setFotoErro] = useState<string>("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [profissao, setProfissao] = useState("");
  const [indicacao, setIndicacao] = useState("");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("emprestimo");
  const [ativo, setAtivo] = useState(true);
  const [observacoes, setObservacoes] = useState("");

  // Endereço
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  // Documentos
  const [docDescricao, setDocDescricao] = useState("");
  const [docs, setDocs] = useState<DocumentoCliente[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const avatar = useMemo(() => iniciais(nomeCompleto || "CL"), [nomeCompleto]);

  // ✅ quando abrir em modo edição, preenche
  useEffect(() => {
    if (!open) return;

    if (initialData) {
      setStep("dados");

      setNomeCompleto(initialData.nomeCompleto ?? "");
      setCpf(initialData.cpf ?? "");
      setRg(initialData.rg ?? "");
      setEmail(initialData.email ?? "");
      setTelefone(initialData.telefone ?? "");
      setInstagram(initialData.instagram ?? "");
      setFacebook(initialData.facebook ?? "");
      setProfissao(initialData.profissao ?? "");
      setIndicacao(initialData.indicacao ?? "");
      setTipoCliente(initialData.tipoCliente ?? "emprestimo");
      setAtivo(Boolean(initialData.ativo));
      setObservacoes(initialData.observacoes ?? "");

      setCep(initialData.endereco?.cep ?? "");
      setRua(initialData.endereco?.rua ?? "");
      setNumero(initialData.endereco?.numero ?? "");
      setComplemento(initialData.endereco?.complemento ?? "");
      setBairro(initialData.endereco?.bairro ?? "");
      setCidade(initialData.endereco?.cidade ?? "");
      setUf(initialData.endereco?.uf ?? "");

      setDocs(initialData.documentos ?? []);
    } else {
      // modo novo
      resetAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id]);

  function resetAll() {
    setStep("dados");

    setNomeCompleto("");
    setCpf("");
    setRg("");
    setEmail("");
    setTelefone("");
    setInstagram("");
    setFacebook("");
    setProfissao("");
    setIndicacao("");
    setTipoCliente("emprestimo");
    setAtivo(true);
    setObservacoes("");

    setCep("");
    setRua("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setUf("");

    setDocDescricao("");
    setDocs([]);
    setLoadingDocs(false);
  }

  function close() {
    onClose();
    resetAll();
  }

  function nextFromDados() {
    if (!nomeCompleto.trim()) {
      alert("Informe o nome completo.");
      return;
    }
    setStep("endereco");
  }

  function nextFromEndereco() {
    setStep("documentos");
  }

  // ✅ AGORA salva imagens + PDF em dataUrl
  async function addDocs(files: FileList | null) {
    if (!files || files.length === 0) return;

    const arr = Array.from(files);

    // só imagens + PDF
    const validos = arr.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (validos.length !== arr.length) {
      alert("Apenas imagens e PDF são permitidos.");
    }
    if (validos.length === 0) return;

    setLoadingDocs(true);
    try {
      const now = new Date().toISOString();

      const novos: DocumentoCliente[] = await Promise.all(
        validos.map(async (f, i) => {
          const dataUrl = await fileToDataUrl(f);
          return {
            id: `${Date.now()}-${i}`,
            descricao: docDescricao?.trim() || undefined,
            nomeArquivo: f.name,
            mimeType: f.type,
            dataUrl,
            createdAt: now,
          };
        })
      );

      setDocs((prev) => [...prev, ...novos]);
      setDocDescricao("");
    } catch {
      alert("Falha ao carregar arquivos.");
    } finally {
      setLoadingDocs(false);
    }
  }

  function concluir() {
    const endereco: EnderecoCliente = {
      cep,
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    };

    // ✅ o payload é parcial: o Clientes.tsx decide id/createdAt (novo) ou mantém (edit)
    const payload: Partial<Cliente> = {
      nomeCompleto: nomeCompleto.trim(),
      cpf: cpf.trim(),
      rg: rg.trim(),
      email: email.trim(),
      telefone: telefone.trim(),
      instagram: instagram.trim(),
      facebook: facebook.trim(),
      profissao: profissao.trim(),
      indicacao: indicacao.trim(),
      tipoCliente,
      ativo,
      observacoes: observacoes.trim(),
      endereco,
      documentos: docs,
      updatedAt: new Date().toISOString(),
      // createdAt é mantido no upsert do Clientes.tsx (se novo, ele cria)
      createdAt: initialData?.createdAt ?? hojeISO(),
    };

    onCreate(payload);
    resetAll();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={close} />

      <div className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-emerald-500/15 bg-slate-950/90 shadow-2xl max-h-[90vh]">
        <div className="flex items-start justify-between px-6 pt-5">
          <div>
            <div className="text-lg font-semibold text-slate-100">{initialData ? "Editar Cliente" : "Novo Cliente"}</div>
            <div className="text-xs text-slate-400">Cadastro em 3 etapas</div>
          </div>

          <button
            type="button"
            onClick={close}
            className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-800/60"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-emerald-500/10 bg-slate-900/25 p-2 text-xs">
            <button
              type="button"
              onClick={() => setStep("dados")}
              className={`rounded-lg px-3 py-2 text-left ${
                step === "dados" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              Dados Pessoais
            </button>

            <button
              type="button"
              onClick={() => setStep("endereco")}
              className={`rounded-lg px-3 py-2 text-left ${
                step === "endereco" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              Endereço
            </button>

            <button
              type="button"
              onClick={() => setStep("documentos")}
              className={`rounded-lg px-3 py-2 text-left ${
                step === "documentos" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              Documentos
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 pr-3">
          {step === "dados" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                {fotoDataUrl ? (
                  <img
                    src={fotoDataUrl}
                    alt={nomeCompleto || "Foto do cliente"}
                    className="h-14 w-14 rounded-full border border-emerald-500/30 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20 font-bold text-emerald-200">
                    {avatar}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    className="w-full sm:w-auto rounded-lg border border-emerald-500/20 bg-slate-900/30 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/50"
                    onClick={() => fileRef.current?.click()}
                  >
                    {fotoDataUrl ? "Trocar foto" : "Adicionar foto"}
                  </button>
                  {fotoDataUrl ? (
                    <button
                      type="button"
                      className="w-full sm:w-auto rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15"
                      onClick={() => {
                        setFotoDataUrl("");
                        setFotoErro("");
                      }}
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    // IMPORTANTE: capture o input antes do await.
                    // Em alguns cenários, o SyntheticEvent pode perder a referência e
                    // e.currentTarget vira null no finally, causando:
                    // "Cannot set properties of null (setting 'value')"
                    const inputEl = e.currentTarget as HTMLInputElement;
                    const f = e.target.files?.[0];
                    if (!f) return;

                    if (!f.type.startsWith("image/")) {
                      setFotoErro("Selecione um arquivo de imagem.");
                      inputEl.value = "";
                      return;
                    }

                    // limite simples (5MB) para evitar travar
                    if (f.size > 5 * 1024 * 1024) {
                      setFotoErro("Imagem muito grande. Use até 5MB.");
                      inputEl.value = "";
                      return;
                    }

                    try {
                      setFotoErro("");
                      const data = await compressImageToDataUrl(f, { maxSize: 640, quality: 0.82 });
                      setFotoDataUrl(data || "");
                    } catch {
                      setFotoErro("Falha ao carregar a imagem.");
                    } finally {
                      // permite selecionar o mesmo arquivo novamente
                      inputEl.value = "";
                    }
                  }}
                />

                <div className="text-[11px] text-slate-500">A foto será enviada ao salvar o cliente</div>
                {fotoErro ? <div className="text-[11px] text-red-300">{fotoErro}</div> : null}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Nome Completo *</label>
                <input
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">CPF</label>
                  <input
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">RG</label>
                  <input
                    value={rg}
                    onChange={(e) => setRg(e.target.value)}
                    placeholder="00.000.000-0"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">E-mail</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Telefone</label>
                  <input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Instagram</label>
                  <input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@usuario"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Facebook</label>
                  <input
                    value={facebook}
                    onChange={(e) => setFacebook(e.target.value)}
                    placeholder="Nome ou URL do perfil"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Profissão</label>
                <input
                  value={profissao}
                  onChange={(e) => setProfissao(e.target.value)}
                  placeholder="Ex: Eletricista, Comerciante..."
                  className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Cliente veio por indicação</label>
                <input
                  value={indicacao}
                  onChange={(e) => setIndicacao(e.target.value)}
                  placeholder="Nome de quem indicou"
                  className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Tipo de Cliente *</label>
                  <SelectPremium
                    value={tipoCliente}
                    onChange={(v) => setTipoCliente(v as TipoCliente)}
                    className="rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                    options={[
                      { value: "emprestimo", label: "Empréstimo" },
                      { value: "produto", label: "Produto" },
                      { value: "geral", label: "Geral" },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Cliente Ativo</label>
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2">
                    <div>
                      <div className="text-sm text-slate-100">Ativo</div>
                      <div className="text-[11px] text-slate-500">Este cliente pode receber novos empréstimos</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAtivo((v) => !v)}
                      className={`h-6 w-11 rounded-full border transition ${
                        ativo ? "border-emerald-500/40 bg-emerald-500/40" : "border-rose-500/40 bg-rose-500/30"
                      }`}
                      aria-label="Alternar ativo"
                    >
                      <span
                        className={`block h-5 w-5 translate-y-[1px] rounded-full bg-slate-950 transition ${
                          ativo ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="h-24 w-full resize-none rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={nextFromDados}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Próximo: Endereço →
                </button>
              </div>
            </div>
          )}

          {step === "endereco" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs text-slate-300">CEP</label>
                  <input
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    placeholder="00000-000"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => alert("Busca por CEP: implementar depois (mock).")}
                    className="w-full rounded-xl border border-emerald-500/20 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/50"
                  >
                    Buscar
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Rua / Logradouro</label>
                <input
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  placeholder="Preenchido automaticamente pelo CEP"
                  className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Número</label>
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Complemento</label>
                  <input
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Bairro</label>
                  <input
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    placeholder="Preenchido automaticamente pelo CEP"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Cidade</label>
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Preenchido automaticamente"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300">Estado (UF)</label>
                  <input
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                    placeholder="UF"
                    className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("dados")}
                    className="w-1/2 rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={nextFromEndereco}
                    className="w-1/2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Próximo: Documentos →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "documentos" && (
            <div className="space-y-4">
              <div className="text-sm text-slate-200">Documentos (imagens + PDF)</div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Descrição do Documento (opcional)</label>
                <input
                  value={docDescricao}
                  onChange={(e) => setDocDescricao(e.target.value)}
                  placeholder="Ex: RG, CPF, Comprovante..."
                  className="w-full rounded-xl border border-emerald-500/15 bg-slate-900/25 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="rounded-xl border border-emerald-500/15 bg-slate-900/25 p-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-500/20 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/50">
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => addDocs(e.target.files)}
                  />
                  📎 Selecionar Arquivos
                </label>

                <div className="mt-2 text-[11px] text-slate-500">
                  {loadingDocs ? "Carregando arquivos..." : "Aceita imagens e PDF. Você pode selecionar múltiplos."}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-slate-300">Documentos Salvos ({docs.length})</div>
                <div className="rounded-xl border border-emerald-500/10 bg-slate-900/20 p-3">
                  {docs.length === 0 ? (
                    <div className="text-sm text-slate-500">Nenhum documento enviado para este cliente.</div>
                  ) : (
                    <ul className="space-y-2">
                      {docs.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center justify-between rounded-lg border border-emerald-500/10 bg-slate-900/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-100">{d.nomeArquivo}</div>
                            <div className="text-[11px] text-slate-500">
                              {d.mimeType === "application/pdf" ? "PDF" : "Imagem"} • {d.descricao ? d.descricao : "Sem descrição"}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setDocs((prev) => prev.filter((x) => x.id !== d.id))}
                            className="rounded-lg px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep("endereco")}
                  className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
                >
                  ← Voltar
                </button>

                <button
                  type="button"
                  onClick={concluir}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-b-2xl border-t border-emerald-500/10 bg-slate-950/60 px-6 py-3 text-[11px] text-slate-500">
          Dica: você pode navegar entre as abas acima.
        </div>
      </div>
    </div>
  );
}
