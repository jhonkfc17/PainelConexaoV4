import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePermissoes } from "../store/usePermissoes";

import EmprestimosHeader from "../components/emprestimos/EmprestimosHeader";
import EmprestimosTabs, { type EmprestimosTab } from "../components/emprestimos/EmprestimosTabs";
import EmprestimosToolbar from "../components/emprestimos/EmprestimosToolbar";
import EmprestimosLista from "../components/emprestimos/EmprestimosLista";
import NovoEmprestimoModal from "../components/emprestimos/NovoEmprestimoModal";
import ComprovanteModal from "../components/emprestimos/ComprovanteModal";
import RegistrarPagamentoModal from "../components/emprestimos/RegistrarPagamentoModal";
import { supabase } from "../lib/supabaseClient";

import type { NovoEmprestimoPayload } from "../components/emprestimos/emprestimoTipos";
import type { Emprestimo } from "@/store/useEmprestimosStore";

import BuscarClienteModal from "../components/modals/BuscarClienteModal";
import { useUIStore } from "../store/useUIStore";
import { useClientesStore } from "../store/useClientesStore";
import { useEmprestimosStore } from "../store/useEmprestimosStore";

function fmtDateBR(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getPrimeiroVencimentoAtual(e: any): string {
  const parcelas = Array.isArray(e?.parcelasDb) ? [...e.parcelasDb] : [];
  if (parcelas.length > 0) {
    parcelas.sort((a: any, b: any) => {
      const na = Number(a?.numero ?? 0);
      const nb = Number(b?.numero ?? 0);
      if (na !== nb) return na - nb;
      return String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? ""));
    });
    const fromParcelas = String(parcelas[0]?.vencimento ?? "").trim();
    if (fromParcelas) return fromParcelas;
  }

  const fromVencimentos = Array.isArray(e?.vencimentos) ? String(e.vencimentos[0] ?? "").trim() : "";
  if (fromVencimentos) return fromVencimentos;
  return String(e?.primeiraParcela ?? "").trim();
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export default function Emprestimos() {
  const { canManageLoans, canExportCSV, isAdmin, isOwner } = usePermissoes();
  const { isBuscarClienteOpen, closeBuscarCliente } = useUIStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState<EmprestimosTab>("emprestimos");
  const [busca, setBusca] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "atrasado" | "hoje" | "amanha">("todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      const v = localStorage.getItem("rc_emprestimos_view");
      return v === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [modalNovo, setModalNovo] = useState(false);
  const [prefillClienteId, setPrefillClienteId] = useState<string | undefined>(undefined);

  const [confirmacaoOpen, setConfirmacaoOpen] = useState(false);
  const [confirmacaoLinhas, setConfirmacaoLinhas] = useState<string[]>([]);
  const [confirmacaoPhone, setConfirmacaoPhone] = useState<string | undefined>(undefined);

  const [pagarOpen, setPagarOpen] = useState(false);
  const [emprestimoSelecionado, setEmprestimoSelecionado] = useState<Emprestimo | null>(null);

  const { clientes, fetchClientes } = useClientesStore();
  const { emprestimos, fetchEmprestimos, criarEmprestimo, removerEmprestimo, mudarStatus } =
    useEmprestimosStore();
  const [pagamentosMapa, setPagamentosMapa] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const idSel = emprestimoSelecionado?.id;
    if (!idSel) return;
    const atual = emprestimos.find((e) => e.id === idSel) ?? null;
    if (atual) setEmprestimoSelecionado(atual);
  }, [emprestimos, emprestimoSelecionado?.id]);

  useEffect(() => {
    void fetchClientes();
    void fetchEmprestimos();
  }, [fetchClientes, fetchEmprestimos]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!emprestimos.length) {
        setPagamentosMapa({});
        return;
      }
      try {
        const ids = emprestimos.map((e) => e.id).filter(Boolean);
        const { data, error } = await supabase
          .from("pagamentos")
          .select("id, emprestimo_id, valor, juros_atraso, estornado_em")
          .in("emprestimo_id", ids)
          .is("estornado_em", null);
        if (error) throw error;
        const map: Record<string, any[]> = {};
        for (const p of data ?? []) {
          const k = (p as any).emprestimo_id;
          if (!map[k]) map[k] = [];
          map[k].push(p as any);
        }
        if (alive) setPagamentosMapa(map);
      } catch (e) {
        console.error("Falha ao carregar pagamentos para cards:", e);
        if (alive) setPagamentosMapa({});
      }
    })();
    return () => {
      alive = false;
    };
  }, [emprestimos]);

  useEffect(() => {
    const novo = searchParams.get("novo");
    if (novo !== "1") return;

    const cid = searchParams.get("cliente") ?? undefined;
    setPrefillClienteId(cid ?? undefined);
    setModalNovo(true);

    const next = new URLSearchParams(searchParams);
    next.delete("novo");
    next.delete("cliente");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const emprestimosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let lista = emprestimos;

    const isQuitadoOuRecebido = (e: Emprestimo) => {
      const status = String((e as any)?.status ?? "").toLowerCase();
      if (status === "quitado" || status === "arquivado") return true;
      const parcelas = Array.isArray((e as any).parcelasDb) ? (e as any).parcelasDb : [];
      if (parcelas.length > 0 && parcelas.every((p: any) => p?.pago === true)) return true;
      return false;
    };

    if (tab === "recebimentos") {
      lista = lista.filter(isQuitadoOuRecebido);
    } else {
      lista = lista.filter((e) => !isQuitadoOuRecebido(e));

      if (tab === "diario") {
        lista = lista.filter((e) => e.modalidade === "diario");
      } else if (tab === "tabela_price") {
        lista = lista.filter((e) => e.modalidade === "tabela_price");
      } else {
        lista = lista.filter((e) => e.modalidade !== "diario" && e.modalidade !== "tabela_price");
      }
    }

    if (!q) return lista;
    return lista.filter((e) => (e.clienteNome ?? "").toLowerCase().includes(q));
  }, [emprestimos, tab, busca]);

  const contadores = useMemo(() => {
    const isQuitadoOuRecebido = (e: Emprestimo) => {
      const status = String((e as any)?.status ?? "").toLowerCase();
      if (status === "quitado" || status === "arquivado") return true;
      const parcelas = Array.isArray((e as any).parcelasDb) ? (e as any).parcelasDb : [];
      return parcelas.length > 0 && parcelas.every((p: any) => p?.pago === true);
    };

    const ativos = emprestimos.filter((e) => !isQuitadoOuRecebido(e));
    const mensal = ativos.filter((e) => e.modalidade !== "diario" && e.modalidade !== "tabela_price").length;
    const diario = ativos.filter((e) => e.modalidade === "diario").length;
    return { emprestimos: mensal, diario };
  }, [emprestimos]);

  function getDueStatus(e: Emprestimo): "atrasado" | "hoje" | "amanha" | "ok" {
    const emAtraso = Boolean((e as any).emAtraso ?? (e as any).em_atraso ?? false);
    if (emAtraso) return "atrasado";

    const prox = String((e as any).proximoVencimentoEmAberto ?? (e as any).proximo_vencimento_em_aberto ?? "").trim();

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    if (prox) {
      const venc = new Date(prox + "T00:00:00");
      venc.setHours(0, 0, 0, 0);
      if (!Number.isNaN(venc.getTime())) {
        if (venc.getTime() === hoje.getTime()) return "hoje";
        if (venc.getTime() === amanha.getTime()) return "amanha";
      }
    }

    const parcelas = Array.isArray((e as any).parcelasDb) ? (e as any).parcelasDb : [];
    const abertas = parcelas.filter((p: any) => !p?.pago);

    let hasHoje = false;
    let hasAmanha = false;

    for (const p of abertas) {
      const v = String(p?.vencimento ?? "");
      if (!v) continue;

      const venc = new Date(v + "T00:00:00");
      venc.setHours(0, 0, 0, 0);
      if (Number.isNaN(venc.getTime())) continue;

      if (venc < hoje) return "atrasado";
      if (venc.getTime() === hoje.getTime()) hasHoje = true;
      if (venc.getTime() === amanha.getTime()) hasAmanha = true;
    }

    if (hasHoje) return "hoje";
    if (hasAmanha) return "amanha";
    return "ok";
  }

  const contadoresStatus = useMemo(() => {
    const base = emprestimosFiltrados;
    const counts = { atrasado: 0, hoje: 0, amanha: 0, total: base.length };
    for (const e of base) {
      const s = getDueStatus(e);
      if (s === "atrasado") counts.atrasado += 1;
      if (s === "hoje") counts.hoje += 1;
      if (s === "amanha") counts.amanha += 1;
    }
    return counts;
  }, [emprestimosFiltrados]);

  const emprestimosFiltradosFinal = useMemo(() => {
    if (statusFiltro === "todos") return emprestimosFiltrados;
    return emprestimosFiltrados.filter((e) => getDueStatus(e) === statusFiltro);
  }, [emprestimosFiltrados, statusFiltro]);

  const canExport = Boolean(emprestimosFiltradosFinal.length) && Boolean(isOwner || isAdmin || canManageLoans || canExportCSV);

  function abrirComprovanteEmprestimo(e: Emprestimo) {
    const linhas = [
      "Raposacobra - Comprovante de Emprestimo",
      "",
      `Cliente: ${e.clienteNome}`,
      `Data do contrato: ${fmtDateBR(e.dataContrato)}`,
      `Valor emprestado: R$ ${e.valor.toFixed(2)}`,
      `Total a receber: R$ ${e.totalReceber.toFixed(2)}`,
      `Parcelas: ${e.numeroParcelas}x de R$ ${e.valorParcela.toFixed(2)}`,
      `1o vencimento: ${fmtDateBR(getPrimeiroVencimentoAtual(e))}`,
      "",
      "Obrigado!",
    ];
    setConfirmacaoLinhas(linhas);
    const phone = (e.clienteContato ?? "").replace(/\D/g, "");
    setConfirmacaoPhone(phone ? `55${phone}` : undefined);
    setConfirmacaoOpen(true);
  }

  function exportarEmprestimosCsv() {
    if (!emprestimosFiltradosFinal.length) return;

    const rows = [
      [
        "Cliente",
        "Contato",
        "Modalidade",
        "Status",
        "Valor emprestado",
        "Total a receber",
        "Parcelas",
        "Valor da parcela",
        "Data do contrato",
        "Primeiro vencimento",
        "Proximo vencimento",
        "Parcelas em aberto",
        "Parcelas em atraso",
        "Em atraso",
        "Quitado em",
        "Criado em",
      ].join(","),
      ...emprestimosFiltradosFinal.map((emprestimo) =>
        [
          csvCell(emprestimo.clienteNome),
          csvCell(emprestimo.clienteContato),
          csvCell(emprestimo.modalidade),
          csvCell(emprestimo.status),
          csvCell(Number(emprestimo.valor ?? 0).toFixed(2)),
          csvCell(Number(emprestimo.totalReceber ?? 0).toFixed(2)),
          csvCell(emprestimo.numeroParcelas),
          csvCell(Number(emprestimo.valorParcela ?? 0).toFixed(2)),
          csvCell(fmtDateBR(emprestimo.dataContrato)),
          csvCell(fmtDateBR(getPrimeiroVencimentoAtual(emprestimo))),
          csvCell(fmtDateBR(emprestimo.proximoVencimentoEmAberto)),
          csvCell(emprestimo.parcelasEmAberto ?? 0),
          csvCell(emprestimo.parcelasEmAtraso ?? 0),
          csvCell(emprestimo.emAtraso ? "Sim" : "Nao"),
          csvCell(fmtDateBR(emprestimo.quitadoEm)),
          csvCell(fmtDateBR(emprestimo.createdAt)),
        ].join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `emprestimos_export_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function criar(payload: NovoEmprestimoPayload) {
    const cliente = clientes.find((c) => c.id === payload.clienteId) ?? null;

    const novo = await criarEmprestimo(payload, cliente);
    if (!novo) return;

    const linhas = [
      "Raposacobra - Comprovante de Emprestimo",
      "",
      `Cliente: ${novo.clienteNome}`,
      `Data do contrato: ${fmtDateBR(novo.dataContrato)}`,
      `Valor emprestado: R$ ${novo.valor.toFixed(2)}`,
      `Total a receber: R$ ${novo.totalReceber.toFixed(2)}`,
      `Parcelas: ${novo.numeroParcelas}x de R$ ${novo.valorParcela.toFixed(2)}`,
      `1o vencimento: ${fmtDateBR(getPrimeiroVencimentoAtual(novo))}`,
      "",
      "Obrigado!",
    ];
    setConfirmacaoLinhas(linhas);
    setConfirmacaoPhone(cliente?.telefone ? cliente.telefone.replace(/\D/g, "") : undefined);
    setConfirmacaoOpen(true);
  }

  async function remover(id: string) {
    if (!confirm("Remover este emprestimo?")) return;
    await removerEmprestimo(id);
  }

  async function onMudarStatus(id: string, status: Emprestimo["status"]) {
    await mudarStatus(id, status);
  }

  function abrirPagamento(e: Emprestimo) {
    setEmprestimoSelecionado(e);
    setPagarOpen(true);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 sm:p-0 sm:p-2 overflow-x-hidden">
      <EmprestimosHeader
        onClickTutorial={() => alert("Tutorial: em breve")}
        onClickBaixarRelatorio={() => alert("Relatorio: em breve")}
        onClickExportarCsv={canExport ? exportarEmprestimosCsv : undefined}
        canExport={canExport}
      />

      <div className="mt-4">
        <EmprestimosTabs
          tab={tab}
          onChange={(t) => {
            if (t === "calendario") {
              navigate("/calendario");
              return;
            }
            setTab(t);
          }}
          contadores={contadores}
        />
      </div>

      <div className="mt-4">
        <EmprestimosToolbar
          busca={busca}
          onBuscaChange={setBusca}
          filtrosAbertos={filtrosAbertos}
          onToggleFiltros={() => setFiltrosAbertos((v) => !v)}
          onNovoEmprestimo={() => setModalNovo(true)}
          statusFiltro={statusFiltro}
          onStatusFiltroChange={setStatusFiltro}
          contadoresStatus={contadoresStatus}
          viewMode={viewMode}
          onViewModeChange={(m) => {
            setViewMode(m);
            try {
              localStorage.setItem("rc_emprestimos_view", m);
            } catch {
              // ignore
            }
          }}
        />
      </div>

      <div className="mt-6">
        <EmprestimosLista
          viewMode={viewMode}
          lista={emprestimosFiltradosFinal}
          onRemover={remover}
          onMudarStatus={onMudarStatus}
          onPagar={abrirPagamento}
          onComprovante={abrirComprovanteEmprestimo}
          pagamentosMapa={pagamentosMapa}
        />
      </div>

      {emprestimosFiltrados.length > 0 && (
        <div className="mt-4 text-xs text-white/40">Dica: abra um emprestimo para pagar parcelas e gerar comprovantes.</div>
      )}

      <NovoEmprestimoModal
        open={modalNovo}
        onClose={() => {
          setModalNovo(false);
          setPrefillClienteId(undefined);
        }}
        onCreate={criar}
        prefillClienteId={prefillClienteId}
      />

      <ComprovanteModal
        open={confirmacaoOpen}
        onClose={() => setConfirmacaoOpen(false)}
        title="Comprovante"
        linhas={confirmacaoLinhas}
        whatsappPhone={confirmacaoPhone}
      />

      <RegistrarPagamentoModal
        open={pagarOpen}
        onClose={() => {
          setPagarOpen(false);
          fetchEmprestimos();
        }}
        onSaved={() => fetchEmprestimos()}
        emprestimo={emprestimoSelecionado}
      />

      <BuscarClienteModal open={isBuscarClienteOpen} onClose={closeBuscarCliente} />
    </div>
  );
}
