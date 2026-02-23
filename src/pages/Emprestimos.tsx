import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import EmprestimosHeader from "../components/emprestimos/EmprestimosHeader";
import EmprestimosTabs, { type EmprestimosTab } from "../components/emprestimos/EmprestimosTabs";
import EmprestimosToolbar from "../components/emprestimos/EmprestimosToolbar";
import EmprestimosLista from "../components/emprestimos/EmprestimosLista";
import NovoEmprestimoModal from "../components/emprestimos/NovoEmprestimoModal";
import ComprovanteModal from "../components/emprestimos/ComprovanteModal";
import RegistrarPagamentoModal from "../components/emprestimos/RegistrarPagamentoModal";

import type { NovoEmprestimoPayload } from "../components/emprestimos/emprestimoTipos";
import type { Emprestimo } from "@/store/useEmprestimosStore";

import BuscarClienteModal from "../components/modals/BuscarClienteModal";
import { useUIStore } from "../store/useUIStore";
import { useClientesStore } from "../store/useClientesStore";
import { useEmprestimosStore } from "../store/useEmprestimosStore";

export default function Emprestimos() {
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

  // ✅ mantém o empréstimo selecionado sincronizado com o store (atualiza totais após pagamentos)
  useEffect(() => {
    const idSel = emprestimoSelecionado?.id;
    if (!idSel) return;
    const atual = emprestimos.find((e) => e.id === idSel) ?? null;
    if (atual) setEmprestimoSelecionado(atual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emprestimos]);

  const { clientes, fetchClientes } = useClientesStore();
  const { emprestimos, fetchEmprestimos, criarEmprestimo, removerEmprestimo, mudarStatus } =
    useEmprestimosStore();

  useEffect(() => {
    void fetchClientes();
    void fetchEmprestimos();
  }, [fetchClientes, fetchEmprestimos]);

  // Abre "Novo empréstimo" já com o cliente preenchido quando vier do perfil do cliente
  useEffect(() => {
    const novo = searchParams.get("novo");
    if (novo !== "1") return;

    const cid = searchParams.get("cliente") ?? undefined;
    setPrefillClienteId(cid ?? undefined);
    setModalNovo(true);

    // limpa a query para evitar reabrir ao atualizar
    const next = new URLSearchParams(searchParams);
    next.delete("novo");
    next.delete("cliente");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emprestimosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let lista = emprestimos;

    // tab -> modalidade
    if (tab === "diario") {
      lista = lista.filter((e) => e.modalidade === "diario");
    } else if (tab === "tabela_price") {
      lista = lista.filter((e) => e.modalidade === "tabela_price");
    } else {
      // "emprestimos" => todos (exceto recebimentos)
      lista = lista.filter((e) => e.modalidade !== "diario" && e.modalidade !== "tabela_price");
    }

    if (!q) return lista;
    return lista.filter((e) => (e.clienteNome ?? "").toLowerCase().includes(q));
  }, [emprestimos, tab, busca]);

  const contadores = useMemo(() => {
    const mensal = emprestimos.filter((e) => e.modalidade === "mensal").length;
    const diario = emprestimos.filter((e) => e.modalidade === "diario").length;
    return { emprestimos: mensal, diario };
  }, [emprestimos]);


  function getDueStatus(e: Emprestimo): "atrasado" | "hoje" | "amanha" | "ok" {
    const parcelas = Array.isArray((e as any).parcelasDb) ? (e as any).parcelasDb : [];
    const abertas = parcelas.filter((p: any) => !p.pago);
    if (abertas.length === 0) return "ok";

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    // prioridade: atrasado > hoje > amanhã
    for (const p of abertas) {
      const venc = new Date(String(p.vencimento) + "T00:00:00");
      venc.setHours(0, 0, 0, 0);
      if (venc < hoje) return "atrasado";
    }
    for (const p of abertas) {
      const venc = new Date(String(p.vencimento) + "T00:00:00");
      venc.setHours(0, 0, 0, 0);
      if (venc.getTime() === hoje.getTime()) return "hoje";
    }
    for (const p of abertas) {
      const venc = new Date(String(p.vencimento) + "T00:00:00");
      venc.setHours(0, 0, 0, 0);
      if (venc.getTime() === amanha.getTime()) return "amanha";
    }
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

  function abrirComprovanteEmprestimo(e: Emprestimo) {
    const linhas = [
      `Raposacobra - Comprovante de Empréstimo`,
      "",
      `Cliente: ${e.clienteNome}`,
      `Data do contrato: ${e.dataContrato}`,
      `Valor emprestado: R$ ${e.valor.toFixed(2)}`,
      `Total a receber: R$ ${e.totalReceber.toFixed(2)}`,
      `Parcelas: ${e.numeroParcelas}x de R$ ${e.valorParcela.toFixed(2)}`,
      `1º vencimento: ${e.vencimentos?.[0] || e.primeiraParcela}`,
      "",
      "Obrigado!",
    ];
    setConfirmacaoLinhas(linhas);
    const phone = (e.clienteContato ?? "").replace(/\D/g, "");
    setConfirmacaoPhone(phone ? `55${phone}` : undefined);
    setConfirmacaoOpen(true);
  }

  async function criar(payload: NovoEmprestimoPayload) {
    const cliente = clientes.find((c) => c.id === payload.clienteId) ?? null;

    const novo = await criarEmprestimo(payload, cliente);
    if (!novo) return;

    // comprovante (como no vídeo)
    const linhas = [
      `Raposacobra - Comprovante de Empréstimo`,
      "",
      `Cliente: ${novo.clienteNome}`,
      `Data do contrato: ${novo.dataContrato}`,
      `Valor emprestado: R$ ${novo.valor.toFixed(2)}`,
      `Total a receber: R$ ${novo.totalReceber.toFixed(2)}`,
      `Parcelas: ${novo.numeroParcelas}x de R$ ${novo.valorParcela.toFixed(2)}`,
      `1º vencimento: ${novo.vencimentos?.[0] || novo.primeiraParcela}`,
      "",
      "Obrigado!",
    ];
    setConfirmacaoLinhas(linhas);
    setConfirmacaoPhone(cliente?.telefone ? cliente.telefone.replace(/\D/g, "") : undefined);
    setConfirmacaoOpen(true);
  }

  async function remover(id: string) {
    if (!confirm("Remover este empréstimo?")) return;
    await removerEmprestimo(id);
  }

  async function onMudarStatus(id: string, status: Emprestimo["status"]) {
    await mudarStatus(id, status);
  }

  function abrirPagamento(e: Emprestimo) {
    setEmprestimoSelecionado(e);
    setPagarOpen(true);
  }

  // Pagamentos (parcela, parcial/adiantamento, quitação total e estorno)
  // Pagamentos agora são registrados pelo modal "RegistrarPagamento".

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 sm:p-0 sm:p-2 overflow-x-hidden">
      <EmprestimosHeader
        onClickTutorial={() => alert("Tutorial: em breve")}
        onClickBaixarRelatorio={() => alert("Relatório: em breve")}
      />

      <div className="mt-4">
        <EmprestimosTabs tab={tab} onChange={(t) => {
              if (t === "calendario") {
                navigate("/calendario");
                return;
              }
              setTab(t);
            }} contadores={contadores} />
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
        />
      </div>

      {emprestimosFiltrados.length > 0 && (
        <div className="mt-4 text-xs text-white/40">Dica: abra um empréstimo para pagar parcelas e gerar comprovantes.</div>
      )}

      {/* Modal novo */}
      <NovoEmprestimoModal
        open={modalNovo}
        onClose={() => {
          setModalNovo(false);
          setPrefillClienteId(undefined);
        }}
        onCreate={criar}
        prefillClienteId={prefillClienteId}
      />

      {/* Modal comprovante */}
      <ComprovanteModal
        open={confirmacaoOpen}
        onClose={() => setConfirmacaoOpen(false)}
        title="Comprovante"
        linhas={confirmacaoLinhas}
        whatsappPhone={confirmacaoPhone}
      />

      {/* Modal Registrar Pagamento */}
      <RegistrarPagamentoModal open={pagarOpen} onClose={() => { setPagarOpen(false); fetchEmprestimos(); }} onSaved={() => fetchEmprestimos()} emprestimo={emprestimoSelecionado} />

      {/* Modal Buscar Cliente */}
      <BuscarClienteModal open={isBuscarClienteOpen} onClose={closeBuscarCliente} />
    </div>
  );
}
