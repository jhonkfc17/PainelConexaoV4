import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Cliente } from "../components/clientes/clienteTipos";
import { getClienteById } from "../services/clientes.service";
import { type ParcelaInfo, type PagamentoDb } from "../services/emprestimos.service";
import { listarScoreClientes, type ClienteScore } from "../services/score.service";
import { supabase } from "../lib/supabaseClient";

import EmprestimosLista from "../components/emprestimos/EmprestimosLista";
import RegistrarPagamentoModal from "../components/emprestimos/RegistrarPagamentoModal";
import ComprovanteModal from "../components/emprestimos/ComprovanteModal";
import { useEmprestimosStore } from "../store/useEmprestimosStore";

function Badge({ faixa, score }: { faixa: string; score: number | null }) {
  const cls =
    faixa === "A"
      ? "border-emerald-500/40 text-emerald-200"
      : faixa === "B"
        ? "border-sky-500/40 text-sky-200"
        : faixa === "C"
          ? "border-amber-500/40 text-amber-200"
          : faixa === "D"
            ? "border-rose-500/40 text-rose-200"
            : "border-slate-700/70 text-slate-200";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border bg-slate-900/40 px-3 py-1 text-xs ${cls}`}>
      <span className="font-semibold">{faixa}</span>
      <span className="opacity-80">{score === null ? "—" : score}</span>
    </span>
  );
}

type Tab = "visao_geral" | "emprestimos" | "historico";

export default function ClienteDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();

  const [tab, setTab] = useState<Tab>("visao_geral");
  const [histFiltro, setHistFiltro] = useState<"todas" | "pagas" | "abertas" | "atrasadas">("todas");
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [score, setScore] = useState<ClienteScore | null>(null);

  const [pagarOpen, setPagarOpen] = useState(false);
  const [emprestimoSelecionado, setEmprestimoSelecionado] = useState<any | null>(null);

  const { emprestimos, fetchEmprestimos, removerEmprestimo, mudarStatus, pagamentosByEmprestimo } = useEmprestimosStore();
  const [empLoading, setEmpLoading] = useState(false);
  const [pagamentosCliente, setPagamentosCliente] = useState<PagamentoDb[]>([]);
  const [pagLoading, setPagLoading] = useState(false);

  // ✅ mantém o empréstimo selecionado sincronizado com o store (para atualizar totais após pagamentos)
  useEffect(() => {
    const idSel = emprestimoSelecionado?.id;
    if (!idSel) return;
    const atual = emprestimos.find((e: any) => e.id === idSel);
    if (atual) setEmprestimoSelecionado(atual);
  }, [emprestimos]);

  const [confirmacaoOpen, setConfirmacaoOpen] = useState(false);
  const [confirmacaoLinhas, setConfirmacaoLinhas] = useState<string[]>([]);
  const [confirmacaoPhone, setConfirmacaoPhone] = useState<string | undefined>(undefined);

  function abrirPagamento(e: any) {
    setEmprestimoSelecionado(e);
    setPagarOpen(true);
  }

  function abrirComprovanteEmprestimo(e: any) {
    const linhas = [
      `Raposacobra - Comprovante de Empréstimo`,
      "",
      `Cliente: ${e.clienteNome ?? e.cliente_nome ?? ""}`,
      `Data do contrato: ${e.dataContrato ?? e.created_at ?? ""}`,
      `Valor emprestado: R$ ${Number(e.valor ?? 0).toFixed(2)}`,
      `Total a receber: R$ ${Number(e.totalReceber ?? 0).toFixed(2)}`,
      `Parcelas: ${Number(e.numeroParcelas ?? 0)}x de R$ ${Number(e.valorParcela ?? 0).toFixed(2)}`,
      `1º vencimento: ${(e.vencimentos?.[0] ?? e.primeiraParcela ?? "")}`,
      "",
      "Obrigado!",
    ];
    setConfirmacaoLinhas(linhas);
    const phone = String(e.clienteContato ?? e.cliente_contato ?? "").replace(/\D/g, "");
    setConfirmacaoPhone(phone ? `55${phone}` : undefined);
    setConfirmacaoOpen(true);
  }

  async function remover(id: string) {
    const ok = window.confirm("Tem certeza que deseja excluir este empréstimo?");
    if (!ok) return;
    await removerEmprestimo(id);
  }

  async function onMudarStatus(id: string, status: string) {
    await mudarStatus(id, status);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (!id) return;

        const c = await getClienteById(id);
        if (!alive) return;
        setCliente(c);

        const scores = await listarScoreClientes([c]);
        if (!alive) return;
        setScore(scores?.[0] ?? null);
      } catch (e) {
        console.error(e);
        setCliente(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setEmpLoading(true);
        await fetchEmprestimos();
      } catch (e) {
        console.error("Falha ao carregar empréstimos:", e);
      } finally {
        if (alive) setEmpLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchEmprestimos]);

  const emprestimosCliente = useMemo(() => {
    if (!id) return [];
    return (emprestimos ?? []).filter((e: any) => String((e as any).cliente_id ?? (e as any).clienteId ?? "") === String(id));
  }, [emprestimos, id]);

  const pagamentosMapa = useMemo(() => {
    const map: Record<string, PagamentoDb[]> = {};
    for (const p of pagamentosCliente ?? []) {
      const k = (p as any).emprestimo_id;
      if (!map[k]) map[k] = [];
      map[k].push(p);
    }
    return map;
  }, [pagamentosCliente]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!emprestimosCliente.length) {
        setPagamentosCliente([]);
        return;
      }
      try {
        setPagLoading(true);
        const ids = emprestimosCliente.map((e: any) => e.id).filter(Boolean);
        const { data, error } = await supabase
          .from("pagamentos")
          .select("id, emprestimo_id, valor, juros_atraso, estornado_em, flags, tipo")
          .in("emprestimo_id", ids)
          .is("estornado_em", null);
        if (error) throw error;
        if (alive) setPagamentosCliente((data ?? []) as any);
      } catch (e) {
        console.error("Falha ao carregar pagamentos do cliente:", e);
        if (alive) setPagamentosCliente([]);
      } finally {
        if (alive) setPagLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [emprestimosCliente]);

  const parcelasFlat: ParcelaInfo[] = useMemo(() => {
    const out: ParcelaInfo[] = [];
    for (const emp of emprestimosCliente) {
      const parcelas = Array.isArray((emp as any).parcelasDb) ? (emp as any).parcelasDb : (Array.isArray((emp as any).parcelas) ? (emp as any).parcelas : []);
      for (const p of parcelas) out.push({ ...p, emprestimoId: emp.id, clienteId: id! });
    }
    // ordena por vencimento desc
    out.sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
    return out;
  }, [emprestimos, id]);

  const hojeISO = new Date().toISOString().slice(0, 10);

  const parcelasHistorico = useMemo(() => {
    if (histFiltro === "todas") return parcelasFlat;
    if (histFiltro === "pagas") return parcelasFlat.filter((p) => p.pago);
    if (histFiltro === "atrasadas") return parcelasFlat.filter((p) => !p.pago && p.vencimento < hojeISO);
    // "abertas"
    return parcelasFlat.filter((p) => !p.pago && p.vencimento >= hojeISO);
  }, [parcelasFlat, histFiltro, hojeISO]);

  const resumo = useMemo(() => {
    const totalEmp = emprestimos.length;
    const totalParcelas = parcelasFlat.length;

    const pagas = parcelasFlat.filter((p) => p.pago).length;
    const abertas = parcelasFlat.filter((p) => !p.pago).length;
    const atrasadas = parcelasFlat.filter((p) => !p.pago && p.vencimento < hojeISO).length;

    const totalValorParcelas = parcelasFlat.reduce((s, p) => s + (Number(p.valor) || 0), 0);

    const totalValorPago = pagamentosCliente.reduce(
      (s, p) => s + Number((p as any).valor ?? 0) + Number((p as any).juros_atraso ?? 0),
      0
    );

    const isLucroDireto = (p: PagamentoDb) => {
      const flags: any = (p as any).flags ?? {};
      const modo = String(flags.modo ?? "");
      return Boolean(
        flags?.contabilizar_como_lucro ||
          modo === "JUROS" ||
          flags?.juros_composto ||
          (p.tipo === "ADIANTAMENTO_MANUAL" && Number((p as any).juros_atraso ?? 0) > 0)
      );
    };

    const lucroRealizado = emprestimosCliente.reduce((acc, e) => {
      const valorEmprestado = Number((e as any).valor ?? (e.payload as any)?.valorEmprestado ?? 0);
      const pagosEmp = pagamentosCliente.filter((p) => p.emprestimo_id === e.id && !p.estornado_em);

      const totalRecebido = pagosEmp.reduce(
        (s, p) => s + Number((p as any).valor ?? 0) + Number((p as any).juros_atraso ?? 0),
        0
      );

      const totalQueRecuperaPrincipal = pagosEmp
        .filter((p) => !isLucroDireto(p))
        .reduce((s, p) => s + Number((p as any).valor ?? 0), 0);

      const principalRecuperado = Math.min(totalQueRecuperaPrincipal, valorEmprestado);
      const lucro = totalRecebido - principalRecuperado;
      return acc + Math.max(lucro, 0);
    }, 0);

    return { totalEmp, totalParcelas, pagas, abertas, atrasadas, totalValorParcelas, totalValorPago, lucroRealizado };
  }, [emprestimos, emprestimosCliente, parcelasFlat, hojeISO, pagamentosCliente]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Carregando cliente…</div>;
  }

  if (!cliente) {
    return (
      <div className="p-6">
        <div className="rc-card p-6">
          <div className="text-lg font-semibold">Cliente não encontrado</div>
          <button className="rc-btn-outline mt-4" onClick={() => nav("/clientes")}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const faixa = score?.faixa ?? "—";
  const scoreVal = score?.score ?? null;

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <button type="button" className="rc-btn-outline" onClick={() => nav("/clientes")}>
            ← Voltar
          </button>
          <div className="text-2xl font-bold text-slate-100">{cliente.nomeCompleto}</div>
          <div className="text-sm text-slate-400">
            {cliente.cpf ? `CPF: ${cliente.cpf}` : "Sem CPF"} {cliente.telefone ? `• ${cliente.telefone}` : ""}{" "}
            {cliente.email ? `• ${cliente.email}` : ""}
          </div>
        </div>

        <div className="space-y-2 min-w-[260px]">
          <button
            type="button"
            className="rc-btn-primary w-full"
            onClick={() => nav(`/emprestimos?novo=1&cliente=${cliente.id}`)}
          >
            + Novo empréstimo para este cliente
          </button>

          <div className="rc-card p-4">
          <div className="text-xs text-slate-400">Score</div>
          <div className="mt-2">
            <Badge faixa={faixa} score={scoreVal} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-2">
              <div className="text-slate-400">Pagas</div>
              <div className="text-slate-100 font-semibold">{resumo.pagas}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-2">
              <div className="text-slate-400">Abertas</div>
              <div className="text-slate-100 font-semibold">{resumo.abertas}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-2">
              <div className="text-slate-400">Atrasadas</div>
              <div className="text-slate-100 font-semibold">{resumo.atrasadas}</div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={tab === "visao_geral" ? "rc-btn-primary" : "rc-btn-outline"} onClick={() => setTab("visao_geral")}>
          Visão geral
        </button>
        <button type="button" className={tab === "emprestimos" ? "rc-btn-primary" : "rc-btn-outline"} onClick={() => setTab("emprestimos")}>
          Empréstimos
        </button>
        <button type="button" className={tab === "historico" ? "rc-btn-primary" : "rc-btn-outline"} onClick={() => setTab("historico")}>
          Histórico de pagamentos
        </button>
      </div>

      {tab === "visao_geral" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rc-card p-5 lg:col-span-2">
            <div className="text-lg font-semibold">Resumo</div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Empréstimos</div>
                <div className="text-slate-100 font-semibold">{resumo.totalEmp}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Parcelas</div>
                <div className="text-slate-100 font-semibold">{resumo.totalParcelas}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Total (parcelas)</div>
                <div className="text-slate-100 font-semibold">R$ {resumo.totalValorParcelas.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Total pago</div>
                <div className="text-slate-100 font-semibold">R$ {resumo.totalValorPago.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-slate-400 text-xs">Lucro realizado</div>
                <div className="text-emerald-300 font-semibold">R$ {resumo.lucroRealizado.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Dica: o score considera parcelas vencidas e comportamento de pagamento (em dia / atraso / em aberto).
            </div>
          </div>

          <div className="rc-card p-5">
            <div className="text-lg font-semibold">Dados</div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div><span className="text-slate-400">Status:</span> {cliente.ativo ? "Ativo" : "Inativo"}</div>
              <div><span className="text-slate-400">Tipo:</span> {cliente.tipoCliente}</div>
              <div><span className="text-slate-400">Profissão:</span> {cliente.profissao || "—"}</div>
              <div><span className="text-slate-400">Indicação:</span> {cliente.indicacao || "—"}</div>
              <div><span className="text-slate-400">Observações:</span> {cliente.observacoes || "—"}</div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "emprestimos" ? (
        <div className="rc-card p-5">
          <div className="text-lg font-semibold">Empréstimos do cliente</div>
          {empLoading ? (
            <div className="mt-3 text-sm text-slate-400">Carregando…</div>
          ) : emprestimosCliente.length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">Nenhum empréstimo encontrado.</div>
          ) : (
            <div className="mt-4">
              <EmprestimosLista
                viewMode="grid"
                lista={emprestimosCliente as any}
                onRemover={remover}
                onMudarStatus={onMudarStatus as any}
                onPagar={abrirPagamento as any}
                onComprovante={abrirComprovanteEmprestimo as any}
                pagamentosMapa={pagamentosMapa as any}
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "historico" ? (
        <div className="rc-card p-5">
          <div className="text-lg font-semibold">Histórico de pagamentos</div>
          <div className="mt-2 text-xs text-slate-500">
            Filtre as parcelas do cliente (ordenadas por vencimento).
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={histFiltro === "todas" ? "rc-btn-primary" : "rc-btn-outline"}
              onClick={() => setHistFiltro("todas")}
            >
              Todas ({parcelasFlat.length})
            </button>
            <button
              type="button"
              className={histFiltro === "pagas" ? "rc-btn-primary" : "rc-btn-outline"}
              onClick={() => setHistFiltro("pagas")}
            >
              Pagas
            </button>
            <button
              type="button"
              className={histFiltro === "abertas" ? "rc-btn-primary" : "rc-btn-outline"}
              onClick={() => setHistFiltro("abertas")}
            >
              Em aberto
            </button>
            <button
              type="button"
              className={histFiltro === "atrasadas" ? "rc-btn-primary" : "rc-btn-outline"}
              onClick={() => setHistFiltro("atrasadas")}
            >
              Atrasadas
            </button>
          </div>

          <div className="mt-4 overflow-auto">
            <div className="min-w-[860px] grid grid-cols-[120px_90px_140px_140px_140px_140px] gap-2 text-xs text-slate-400 border-b border-emerald-500/10 pb-2">
              <div>Empréstimo</div>
              <div>#</div>
              <div>Vencimento</div>
              <div>Valor</div>
              <div>Status</div>
              <div>Pago em</div>
            </div>

            <div className="mt-2 space-y-2">
              {parcelasHistorico.map((p) => {
                const atrasada = !p.pago && p.vencimento < hojeISO;
                return (
                  <div key={`${p.emprestimoId}-${p.id}`} className="min-w-[860px] grid grid-cols-[120px_90px_140px_140px_140px_140px] gap-2 text-sm">
                    <div className="text-slate-200">#{String(p.emprestimoId).slice(0, 8)}</div>
                    <div className="text-slate-200">{p.numero}</div>
                    <div className="text-slate-200">{String(p.vencimento).split("-").reverse().join("/")}</div>
                    <div className="text-slate-200">R$ {Number(p.valor || 0).toFixed(2)}</div>
                    <div className="text-slate-200">
                      {p.pago ? (
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                          Pago
                        </span>
                      ) : atrasada ? (
                        <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                          Atrasada
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-xs text-slate-200">
                          Em aberto
                        </span>
                      )}
                    </div>
                    <div className="text-slate-200">{p.pago_em ? String(p.pago_em).slice(0, 10).split("-").reverse().join("/") : "—"}</div>
                  </div>
                );
              })}
              {parcelasHistorico.length === 0 ? (
                <div className="text-sm text-slate-400">Nenhuma parcela encontrada.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
        onSaved={() => {
          fetchEmprestimos();
        }}
        emprestimo={emprestimoSelecionado}
      />
    </div>
  );
}
