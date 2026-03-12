import { useMemo, useRef, useState } from "react";
import type { Cliente } from "../clientes/clienteTipos";
import type { Modalidade, NovoEmprestimoPayload } from "./emprestimoTipos";
import { useClientesStore } from "../../store/useClientesStore";
import { useEmprestimosStore } from "../../store/useEmprestimosStore";
import { supabase } from "../../lib/supabaseClient";

type RowIn = {
  cliente: string;
  contato: string;
  modalidade: Modalidade;
  status: string;
  valorEmprestado: number;
  totalReceber: number;
  parcelas: number;
  valorParcela: number;
  dataContrato: string;
  primeiraParcela: string;
  proximoVencimento?: string;
  parcelasEmAberto: number;
  parcelasEmAtraso: number;
  emAtraso: boolean;
  quitadoEm?: string;
  criadoEm?: string;
};

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseCsvLine(line: string, separator: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === separator && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cols.push(current.trim());
  return cols;
}

function parseDatePtBr(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseNumber(value: string): number {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return 0;
  if (raw.includes(",") && raw.includes(".")) {
    return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (raw.includes(",")) {
    return Number(raw.replace(",", ".")) || 0;
  }
  return Number(raw) || 0;
}

function parseInteger(value: string): number {
  return Math.max(0, Math.trunc(parseNumber(value)));
}

function normalizePhone(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeModalidade(value: string): Modalidade {
  const raw = normalizeText(value).replace(/\s+/g, "_");
  if (raw === "diario") return "diario";
  if (raw === "semanal") return "semanal";
  if (raw === "quinzenal") return "quinzenal";
  if (raw === "tabela_price" || raw === "price") return "tabela_price";
  return "parcelado_mensal";
}

function parseBoolean(value: string) {
  const raw = normalizeText(value);
  return raw === "sim" || raw === "true" || raw === "1" || raw === "yes";
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function generateVencimentos(primeiraParcela: string, parcelas: number, modalidade: Modalidade) {
  const total = Math.max(1, parcelas);
  const base = primeiraParcela || new Date().toISOString().slice(0, 10);
  const vencimentos: string[] = [];

  for (let i = 0; i < total; i++) {
    if (modalidade === "diario") {
      vencimentos.push(addDays(base, i));
      continue;
    }
    if (modalidade === "semanal") {
      vencimentos.push(addDays(base, i * 7));
      continue;
    }
    if (modalidade === "quinzenal") {
      vencimentos.push(addDays(base, i * 14));
      continue;
    }
    vencimentos.push(addMonths(base, i));
  }

  return vencimentos;
}

function getPrimeiroVencimentoAtual(e: any): string {
  const parcelas = Array.isArray(e?.parcelasDb) ? [...e.parcelasDb] : [];
  if (parcelas.length > 0) {
    parcelas.sort((a: any, b: any) => Number(a?.numero ?? 0) - Number(b?.numero ?? 0));
    const fromParcelas = String(parcelas[0]?.vencimento ?? "").trim();
    if (fromParcelas) return fromParcelas;
  }

  const fromVencimentos = Array.isArray(e?.vencimentos) ? String(e.vencimentos[0] ?? "").trim() : "";
  if (fromVencimentos) return fromVencimentos;
  return String(e?.primeiraParcela ?? "").trim();
}

function buildLoanKey(row: { cliente: string; contato: string; valorEmprestado: number; dataContrato: string; primeiraParcela: string }) {
  return [
    normalizeText(row.cliente),
    normalizePhone(row.contato),
    row.valorEmprestado.toFixed(2),
    row.dataContrato,
    row.primeiraParcela,
  ].join("|");
}

function parseCsv(text: string): RowIn[] {
  const raw = text.replace(/\r/g, "").trim();
  if (!raw) return [];

  const lines = raw.split("\n").filter(Boolean);
  if (!lines.length) return [];

  const headerLine = lines[0];
  const sep = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
  const headers = parseCsvLine(headerLine, sep).map((h) => normalizeText(h));

  const idxCliente = headers.findIndex((h) => h === "cliente");
  const idxContato = headers.findIndex((h) => h === "contato");
  const idxModalidade = headers.findIndex((h) => h === "modalidade");
  const idxStatus = headers.findIndex((h) => h === "status");
  const idxValor = headers.findIndex((h) => h === "valor emprestado");
  const idxTotalReceber = headers.findIndex((h) => h === "total a receber");
  const idxParcelas = headers.findIndex((h) => h === "parcelas");
  const idxValorParcela = headers.findIndex((h) => h === "valor da parcela");
  const idxDataContrato = headers.findIndex((h) => h === "data do contrato");
  const idxPrimeiraParcela = headers.findIndex((h) => h === "primeiro vencimento");
  const idxProximoVencimento = headers.findIndex((h) => h === "proximo vencimento");
  const idxParcelasEmAberto = headers.findIndex((h) => h === "parcelas em aberto");
  const idxParcelasEmAtraso = headers.findIndex((h) => h === "parcelas em atraso");
  const idxEmAtraso = headers.findIndex((h) => h === "em atraso");
  const idxQuitadoEm = headers.findIndex((h) => h === "quitado em");
  const idxCriadoEm = headers.findIndex((h) => h === "criado em");

  if (
    idxCliente < 0 ||
    idxContato < 0 ||
    idxModalidade < 0 ||
    idxStatus < 0 ||
    idxValor < 0 ||
    idxTotalReceber < 0 ||
    idxParcelas < 0 ||
    idxValorParcela < 0 ||
    idxDataContrato < 0 ||
    idxPrimeiraParcela < 0
  ) {
    throw new Error("Cabecalho invalido. Use o CSV exportado pela aba Emprestimos.");
  }

  const out: RowIn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const cliente = cols[idxCliente] ?? "";
    if (!cliente.trim()) continue;

    out.push({
      cliente: cliente.trim(),
      contato: normalizePhone(cols[idxContato] ?? ""),
      modalidade: normalizeModalidade(cols[idxModalidade] ?? ""),
      status: String(cols[idxStatus] ?? "ativo").trim().toLowerCase() || "ativo",
      valorEmprestado: parseNumber(cols[idxValor] ?? ""),
      totalReceber: parseNumber(cols[idxTotalReceber] ?? ""),
      parcelas: Math.max(1, parseInteger(cols[idxParcelas] ?? "1")),
      valorParcela: parseNumber(cols[idxValorParcela] ?? ""),
      dataContrato: parseDatePtBr(cols[idxDataContrato] ?? ""),
      primeiraParcela: parseDatePtBr(cols[idxPrimeiraParcela] ?? ""),
      proximoVencimento: idxProximoVencimento >= 0 ? parseDatePtBr(cols[idxProximoVencimento] ?? "") : "",
      parcelasEmAberto: idxParcelasEmAberto >= 0 ? parseInteger(cols[idxParcelasEmAberto] ?? "0") : 0,
      parcelasEmAtraso: idxParcelasEmAtraso >= 0 ? parseInteger(cols[idxParcelasEmAtraso] ?? "0") : 0,
      emAtraso: idxEmAtraso >= 0 ? parseBoolean(cols[idxEmAtraso] ?? "") : false,
      quitadoEm: idxQuitadoEm >= 0 ? parseDatePtBr(cols[idxQuitadoEm] ?? "") : "",
      criadoEm: idxCriadoEm >= 0 ? parseDatePtBr(cols[idxCriadoEm] ?? "") : "",
    });
  }

  return out;
}

export default function ImportarEmprestimosModal({
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
  const [skipCount, setSkipCount] = useState(0);
  const { clientes, saveCliente, fetchClientes } = useClientesStore();
  const { emprestimos, criarEmprestimo, fetchEmprestimos } = useEmprestimosStore();

  const canImport = preview.length > 0 && !busy;

  const sampleCsv = useMemo(
    () =>
      [
        "Cliente,Contato,Modalidade,Status,Valor emprestado,Total a receber,Parcelas,Valor da parcela,Data do contrato,Primeiro vencimento,Proximo vencimento,Parcelas em aberto,Parcelas em atraso,Em atraso,Quitado em,Criado em",
        '"Maria Souza","11999999999","parcelado_mensal","ativo","1000.00","1500.00","3","500.00","01/03/2026","01/04/2026","01/04/2026","3","0","Nao","-","01/03/2026"',
      ].join("\n"),
    []
  );

  if (!open) return null;

  async function onPickFile(file: File) {
    setError(null);
    setOkCount(0);
    setFailCount(0);
    setSkipCount(0);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error("Nenhum registro encontrado no CSV.");
    setPreview(rows);
  }

  async function ensureCliente(row: RowIn, cache: Map<string, Cliente>) {
    const key = `${normalizeText(row.cliente)}|${normalizePhone(row.contato)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const found = clientes.find((cliente) => {
      const samePhone = normalizePhone(cliente.telefone ?? "") === normalizePhone(row.contato);
      const sameName = normalizeText(cliente.nomeCompleto) === normalizeText(row.cliente);
      return samePhone ? sameName || samePhone : sameName;
    });

    if (found) {
      cache.set(key, found);
      return found;
    }

    const nowIso = new Date().toISOString();
    const created = await saveCliente({
      id: uid(),
      nomeCompleto: row.cliente,
      telefone: row.contato || undefined,
      tipoCliente: "emprestimo",
      ativo: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (!created) {
      throw new Error(`Falha ao criar cliente ${row.cliente}.`);
    }

    cache.set(key, created);
    return created;
  }

  async function aplicarStatusImportado(
    emprestimoId: string,
    status: string,
    parcelas: number,
    parcelasEmAberto: number,
    valorParcela: number,
    quitadoEm?: string
  ) {
    const abertas = Math.max(0, Math.min(parcelas, parcelasEmAberto));
    const pagas = Math.max(0, parcelas - abertas);

    const { data: parcelasDb, error: parcelasError } = await supabase
      .from("parcelas")
      .select("id, numero, vencimento")
      .eq("emprestimo_id", emprestimoId)
      .order("numero", { ascending: true });
    if (parcelasError) throw parcelasError;

    const parcelasIds = (parcelasDb ?? []).slice(0, pagas).map((parcela) => parcela.id);
    if (parcelasIds.length > 0) {
      const paidAt = quitadoEm || (parcelasDb?.[parcelasIds.length - 1]?.vencimento ?? null);
      const { error: updParcelaError } = await supabase
        .from("parcelas")
        .update({
          pago: true,
          valor_pago: valorParcela,
          valor_pago_acumulado: 0,
          saldo_restante: 0,
          pago_em: paidAt,
        })
        .in("id", parcelasIds);
      if (updParcelaError) throw updParcelaError;
    }

    const nextStatus = status || "ativo";
    if (nextStatus !== "ativo") {
      const updatePayload: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "quitado" && quitadoEm) {
        updatePayload.quitado_em = `${quitadoEm}T00:00:00`;
      }
      const { error: updEmprestimoError } = await supabase
        .from("emprestimos")
        .update(updatePayload)
        .eq("id", emprestimoId);
      if (updEmprestimoError) throw updEmprestimoError;
    }
  }

  async function importar() {
    setBusy(true);
    setError(null);
    setOkCount(0);
    setFailCount(0);
    setSkipCount(0);

    try {
      const clientCache = new Map<string, Cliente>();
      const existingKeys = new Set(
        emprestimos.map((emprestimo) =>
          buildLoanKey({
            cliente: emprestimo.clienteNome,
            contato: emprestimo.clienteContato ?? "",
            valorEmprestado: Number(emprestimo.valor ?? 0),
            dataContrato: String(emprestimo.dataContrato ?? ""),
            primeiraParcela: getPrimeiroVencimentoAtual(emprestimo),
          })
        )
      );

      let ok = 0;
      let fail = 0;
      let skipped = 0;

      for (const row of preview) {
        try {
          const rowKey = buildLoanKey(row);
          if (existingKeys.has(rowKey)) {
            skipped += 1;
            setSkipCount(skipped);
            continue;
          }

          const cliente = await ensureCliente(row, clientCache);
          const primeiraParcela = row.primeiraParcela || row.proximoVencimento || row.dataContrato || new Date().toISOString().slice(0, 10);
          const dataContrato = row.dataContrato || primeiraParcela;
          const vencimentos = generateVencimentos(primeiraParcela, row.parcelas, row.modalidade);
          const valorParcela = row.valorParcela > 0 ? row.valorParcela : row.totalReceber / Math.max(1, row.parcelas);
          const taxaJuros = row.valorEmprestado > 0 ? Number((((row.totalReceber - row.valorEmprestado) / row.valorEmprestado) * 100).toFixed(2)) : 0;

          const payload: NovoEmprestimoPayload & {
            valorParcela: number;
            totalReceber: number;
            createdAtImport?: string;
          } = {
            clienteId: cliente.id,
            valor: row.valorEmprestado,
            taxaJuros,
            jurosAplicado: "fixo",
            modalidade: row.modalidade,
            parcelas: row.parcelas,
            dataContrato,
            primeiraParcela,
            vencimentos,
            parcelasPersonalizadas: vencimentos.map((vencimento, index) => ({
              numero: index + 1,
              vencimento,
              valor: valorParcela,
            })),
            valorParcela,
            totalReceber: row.totalReceber,
            observacoes: `Importado via CSV. Status original: ${row.status}.`,
            createdAtImport: row.criadoEm || undefined,
          };

          const created = await criarEmprestimo(payload, cliente);
          if (!created?.id) {
            throw new Error(`Falha ao criar emprestimo de ${row.cliente}.`);
          }

          await aplicarStatusImportado(
            created.id,
            row.status,
            row.parcelas,
            row.parcelasEmAberto,
            valorParcela,
            row.quitadoEm
          );

          existingKeys.add(rowKey);
          ok += 1;
          setOkCount(ok);
        } catch (rowError) {
          fail += 1;
          setFailCount(fail);
          console.error("Falha ao importar emprestimo:", rowError);
        }
      }

      await fetchClientes();
      await fetchEmprestimos();
      onImported?.();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao importar emprestimos.");
    } finally {
      setBusy(false);
    }
  }

  function baixarModelo() {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Emprestimos_MODELO_IMPORTACAO.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-100">Importar Emprestimos (CSV)</div>
            <div className="mt-1 text-xs text-slate-400">
              Use o CSV exportado pela aba Emprestimos. Clientes ausentes serao criados automaticamente.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            title="Fechar"
          >
            x
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
                  setError(err?.message ?? "CSV invalido");
                } finally {
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
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
                  <div key={`${r.cliente}-${idx}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-sm font-semibold text-white">{r.cliente}</div>
                    <div className="mt-1 text-xs text-white/60">
                      {r.modalidade} - R$ {r.valorEmprestado.toFixed(2)} - {r.parcelas}x de R$ {r.valorParcela.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
              Selecione um arquivo CSV para ver a previa antes de importar.
            </div>
          )}

          {(okCount > 0 || failCount > 0 || skipCount > 0) && (
            <div className="text-xs text-white/70">
              Importados: <span className="font-semibold text-emerald-200">{okCount}</span> - Ignorados: {skipCount} - Falhas: {failCount}
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
            {busy ? "Importando..." : "Importar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}
