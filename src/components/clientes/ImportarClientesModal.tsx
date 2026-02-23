import { useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type RowIn = {
  nome: string;
  cpf: string;
  telefone: string;
};

function parseCsv(text: string): RowIn[] {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return [];

  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  // aceita , ou ;
  const headerLine = lines[0];
  const sep = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
  const headers = headerLine
    .split(sep)
    .map((h) => h.trim().toLowerCase());

  const idxNome = headers.findIndex((h) => ["nome completo", "nome", "nome_completo"].includes(h));
  const idxCpf = headers.findIndex((h) => ["cpf"].includes(h));
  const idxTel = headers.findIndex((h) => ["telefone", "phone", "celular"].includes(h));

  if (idxNome < 0 || idxCpf < 0 || idxTel < 0) {
    throw new Error(
      "Cabeçalho inválido. Use: Nome Completo,Cpf,Telefone (pode ser separado por vírgula ou ponto-e-vírgula)."
    );
  }

  const out: RowIn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim());
    const nome = cols[idxNome] ?? "";
    const cpf = (cols[idxCpf] ?? "").replace(/\D/g, "");
    const telefone = (cols[idxTel] ?? "").replace(/\D/g, "");
    if (!nome) continue;
    out.push({ nome, cpf, telefone });
  }
  return out;
}

export default function ImportarClientesModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RowIn[]>([]);
  const [okCount, setOkCount] = useState(0);
  const [failCount, setFailCount] = useState(0);

  const canImport = preview.length > 0 && !busy;

  const sampleCsv = useMemo(() => {
    return [
      "Nome Completo,Cpf,Telefone",
      "João da Silva,12345678909,11999999999",
      "Maria Souza,98765432100,21988888888",
    ].join("\n");
  }, []);

  if (!open) return null;

  async function onPickFile(file: File) {
    setError(null);
    setOkCount(0);
    setFailCount(0);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error("Nenhum registro encontrado no CSV.");
    setPreview(rows);
  }

  async function importar() {
    setBusy(true);
    setError(null);
    setOkCount(0);
    setFailCount(0);

    try {
      // insere em lotes para evitar payload grande
      const batchSize = 200;
      let ok = 0;
      let fail = 0;

      for (let i = 0; i < preview.length; i += batchSize) {
        const chunk = preview.slice(i, i + batchSize);
        const payload = chunk.map((r) => ({
          nome: r.nome,
          cpf: r.cpf || null,
          telefone: r.telefone || null,
        }));

        const { error: insErr } = await supabase.from("clientes").insert(payload);
        if (insErr) {
          fail += chunk.length;
          // tenta continuar nos próximos lotes
          console.error("Falha ao importar lote:", insErr);
        } else {
          ok += chunk.length;
        }
        setOkCount(ok);
        setFailCount(fail);
      }

      onImported?.();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  function baixarModelo() {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Clientes_MODELO_IMPORTACAO.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-100">Importar Clientes (CSV)</div>
            <div className="mt-1 text-xs text-slate-400">
              Colunas obrigatórias: <span className="text-slate-200">Nome Completo, Cpf, Telefone</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await onPickFile(f);
                } catch (err: any) {
                  setPreview([]);
                  setError(err?.message ?? "CSV inválido");
                } finally {
                  // permite selecionar o mesmo arquivo novamente
                  if (e.currentTarget) e.currentTarget.value = "";
                }
              }}
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (busy
                  ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
              }
            >
              Selecionar CSV
            </button>

            <button
              type="button"
              onClick={baixarModelo}
              disabled={busy}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (busy
                  ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
              }
            >
              Baixar modelo
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {preview.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white/80">
                  Registros prontos: <span className="font-semibold text-white">{preview.length}</span>
                </div>
                <div className="text-xs text-white/50">Mostrando os 5 primeiros</div>
              </div>
              <div className="mt-2 space-y-2">
                {preview.slice(0, 5).map((r, idx) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-sm font-semibold text-white">{r.nome}</div>
                    <div className="mt-1 text-xs text-white/60">
                      CPF: {r.cpf || "(vazio)"} · Telefone: {r.telefone || "(vazio)"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
              Selecione um arquivo CSV para ver a prévia antes de importar.
            </div>
          )}

          {(okCount > 0 || failCount > 0) && (
            <div className="text-xs text-white/70">
              Importados: <span className="text-emerald-200 font-semibold">{okCount}</span> · Falhas: {failCount}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={importar}
            disabled={!canImport}
            className={
              "rounded-xl px-4 py-2 text-sm font-semibold transition " +
              (canImport ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-emerald-500/20 text-white/40 cursor-not-allowed")
            }
          >
            {busy ? "Importando…" : "Importar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}
