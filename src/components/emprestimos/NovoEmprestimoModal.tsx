import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { calcularTotais } from "./emprestimoCalculos";
import type { JurosAplicado, JurosAtrasoTipo, Modalidade, NovoEmprestimoPayload } from "./emprestimoTipos";

import type { Cliente } from "../clientes/clienteTipos";
import { useClientesStore } from "../../store/useClientesStore";
import { getClienteById } from "../../services/clientes.service";
import { ajustarParaDiaCobravel, fromISODate, gerarVencimentosParcelas, toISODate } from "../../utils/datasCobranca";

import { SelectPremium } from "../ui/SelectPremium";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: NovoEmprestimoPayload) => void;
  prefillClienteId?: string;
};

function hojeISO() {
  return toISODate(new Date());
}

function sanitizeMoneyInput(str: string) {
  return String(str ?? "").replace(/[^0-9.,]/g, "");
}

function parseNumeroBR(str: string) {
  const raw = String(str ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function fmt2(n: number) {
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function labelCliente(c: any) {
  const nome = c?.nomeCompleto ?? "Sem nome";
  const cpf = c?.cpf ? ` • ${c.cpf}` : "";
  return `${nome}${cpf}`;
}

/**
 * Resolve taxa (%) a partir do total e valor
 * - Tabela Price: busca binária
 * - Outras: por_parcela ou fixo
 */
function resolverTaxaPorTotal(params: {
  valor: number;
  total: number;
  parcelas: number;
  jurosAplicado: JurosAplicado;
  modalidade: Modalidade;
}) {
  const valor = Number(params.valor ?? 0);
  const total = Number(params.total ?? 0);
  const parcelas = Math.max(1, Number(params.parcelas ?? 1));

  if (valor <= 0 || total <= 0) return 0;

  if (params.modalidade === "tabela_price") {
    const targetParcela = total / parcelas;

    const parcelaParaTaxa = (taxa: number) => {
      const i = taxa / 100;
      if (i <= 0) return valor / parcelas;
      const pow = Math.pow(1 + i, parcelas);
      return (valor * i * pow) / (pow - 1);
    };

    let lo = 0;
    let hi = 500;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const p = parcelaParaTaxa(mid);
      if (p > targetParcela) hi = mid;
      else lo = mid;
    }
    return Number(((lo + hi) / 2).toFixed(6));
  }

  const ratio = total / valor;
  let t = 0;

  if (params.jurosAplicado === "por_parcela") {
    t = (ratio - 1) / parcelas;
  } else {
    t = ratio - 1;
  }

  if (!Number.isFinite(t)) return 0;
  return Number((t * 100).toFixed(6));
}

export function NovoEmprestimoModal({ open, onClose, onCreate, prefillClienteId }: Props) {
  const navigate = useNavigate();
  const clientes = useClientesStore((s) => s.clientes);
  const fetchClientes = useClientesStore((s) => s.fetchClientes);
  const saveCliente = useClientesStore((s) => s.saveCliente);

  // Cliente
  const [clienteId, setClienteId] = useState(prefillClienteId ?? "");
  const [clienteLoading, setClienteLoading] = useState(false);
  const [clienteEncontrado, setClienteEncontrado] = useState<Cliente | null>(null);

  // Busca do cliente (combobox)
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const blurCloseTimer = useRef<number | null>(null);
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [novoClienteEndereco, setNovoClienteEndereco] = useState("");
  const [novoClienteObs, setNovoClienteObs] = useState("");
  const [salvandoNovoCliente, setSalvandoNovoCliente] = useState(false);

  // Valores
  const [valor, setValor] = useState(0);
  const [valorInput, setValorInput] = useState("0,00");
  const valorEditingRef = useRef(false);
  const [parcelas, setParcelas] = useState(1);

  const [modalidade, setModalidade] = useState<Modalidade>("parcelado_mensal");
  const [jurosAplicado, setJurosAplicado] = useState<JurosAplicado>("por_parcela");

  const [taxaJuros, setTaxaJuros] = useState(0);

  // Total manual (habilita campo "Total a Receber" editável)
  const [usarTotalManual, setUsarTotalManual] = useState(false);
  const [totalManual, setTotalManual] = useState(0);
  const [totalManualInput, setTotalManualInput] = useState("0,00");
  const totalManualEditingRef = useRef(false);

  // Datas / Regras
  const [dataContrato, setDataContrato] = useState(hojeISO());
  const [prazoDias, setPrazoDias] = useState(30);

  const [cobrarSabado, setCobrarSabado] = useState(true);
  const [cobrarDomingo, setCobrarDomingo] = useState(true);
  const [cobrarFeriados, setCobrarFeriados] = useState(true);

  // semanal/quinzenal: dia fixo (opcional)
  const [usarDiaFixoSemana, setUsarDiaFixoSemana] = useState(false);
  const [diaSemanaCobranca, setDiaSemanaCobranca] = useState(1);

  // Outros
  const [observacoes, setObservacoes] = useState("");
  const [notificarWhatsapp, setNotificarWhatsapp] = useState(false);

  const [aplicarJurosAtraso, setAplicarJurosAtraso] = useState(false);
  const [jurosAtrasoTipo, setJurosAtrasoTipo] = useState<JurosAtrasoTipo>("valor_por_dia");
  const [jurosAtrasoTaxa, setJurosAtrasoTaxa] = useState(0);

  // Cronograma manual (edição de cada parcela)
  const [editarCronograma, setEditarCronograma] = useState(false);
  const [cronogramaManual, setCronogramaManual] = useState<
    { numero: number; vencimento: string; valor: number }[]
  >([]);

  // evita loop total<->taxa
  const lastEditRef = useRef<"taxa" | "total" | null>(null);

  // Carrega clientes quando abrir
  useEffect(() => {
    if (!open) return;
    fetchClientes();
  }, [open, fetchClientes]);

  useEffect(() => {
    if (!open) {
      resetNovoClienteInline();
    }
  }, [open]);

  // Mantém os inputs de moeda editáveis (sem formatar a cada tecla)
  useEffect(() => {
    if (!open) return;
    valorEditingRef.current = false;
    totalManualEditingRef.current = false;
    setValorInput(fmt2(valor));
    setTotalManualInput(fmt2(totalManual));
  }, [open]);

  useEffect(() => {
    if (valorEditingRef.current) return;
    setValorInput(fmt2(valor));
  }, [valor]);

  useEffect(() => {
    if (totalManualEditingRef.current) return;
    setTotalManualInput(fmt2(totalManual));
  }, [totalManual]);

  // Prefill cliente
  useEffect(() => {
    if (prefillClienteId) setClienteId(prefillClienteId);
  }, [prefillClienteId]);

  // Carrega cliente por id
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!clienteId) {
        setClienteEncontrado(null);
        return;
      }
      setClienteLoading(true);
      try {
        const c = await getClienteById(clienteId);
        if (!alive) return;
        setClienteEncontrado(c ?? null);
      } finally {
        if (alive) setClienteLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [clienteId]);

  // Sempre que achar o cliente selecionado, preenche o texto do campo (para manter “seleção— visível)
  useEffect(() => {
    if (!open) return;
    if (!clienteId) return;

    const local = clientes.find((c: any) => c.id === clienteId);
    if (local) {
      setClienteQuery(labelCliente(local));
      return;
    }
    if (clienteEncontrado) {
      setClienteQuery(labelCliente(clienteEncontrado));
    }
  }, [open, clienteId, clientes, clienteEncontrado]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 50);

    const pick = (c: any) =>
      [
        c?.nomeCompleto ?? "",
        c?.cpf ?? "",
        c?.telefone ?? "",
        c?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();

    return clientes
      .filter((c: any) => pick(c).includes(q))
      .slice(0, 50);
  }, [clientes, clienteQuery]);

  const selecionarCliente = (c: any) => {
    setClienteId(c.id);
    setClienteQuery(labelCliente(c));
    setClienteDropdownOpen(false);
  };

  const onClienteFocus = () => {
    if (blurCloseTimer.current) window.clearTimeout(blurCloseTimer.current);
    setClienteDropdownOpen(true);
  };

  const onClienteBlur = () => {
    // delay para permitir click no item
    blurCloseTimer.current = window.setTimeout(() => {
      setClienteDropdownOpen(false);
      // se apagou e saiu, não muda o cliente automaticamente
      // se quiser “limpar seleção— quando vazio:
      // if (!clienteQuery.trim()) setClienteId("");
    }, 120);
  };

  function resetNovoClienteInline() {
    setNovoClienteAberto(false);
    setNovoClienteNome("");
    setNovoClienteTelefone("");
    setNovoClienteEndereco("");
    setNovoClienteObs("");
    setSalvandoNovoCliente(false);
  }

  async function criarNovoClienteInline() {
    if (!novoClienteNome.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }

    const novoId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `cli-${Date.now()}`;

    const agora = new Date().toISOString();
    const payloadCliente: Cliente = {
      id: novoId,
      nomeCompleto: novoClienteNome.trim(),
      telefone: novoClienteTelefone.trim() || undefined,
      observacoes: novoClienteObs.trim() || undefined,
      endereco: novoClienteEndereco.trim() ? { rua: novoClienteEndereco.trim() } : undefined,
      tipoCliente: "emprestimo",
      ativo: true,
      createdAt: agora,
      updatedAt: agora,
    };

    try {
      setSalvandoNovoCliente(true);
      const saved = await saveCliente(payloadCliente);
      if (!saved) {
        alert("Não foi possível criar o cliente.");
        return;
      }

      setClienteId(saved.id);
      setClienteEncontrado(saved);
      setClienteQuery(labelCliente(saved));
      setClienteDropdownOpen(false);
      resetNovoClienteInline();
    } finally {
      setSalvandoNovoCliente(false);
    }
  }

  // Primeira parcela automática
  const primeiraParcela = useMemo(() => {
    const base = fromISODate(dataContrato || hojeISO());
    base.setDate(base.getDate() + Math.max(0, Number(prazoDias ?? 0)));
    const iso = toISODate(base);
    return ajustarParaDiaCobravel({
      dataISO: iso,
      cobrarSabado,
      cobrarDomingo,
      cobrarFeriados,
    });
  }, [dataContrato, prazoDias, cobrarSabado, cobrarDomingo, cobrarFeriados]);


  // Referência (sem ajuste): usada quando NÃO escolher dia fixo na semana.
  // Assim, as próximas parcelas seguem a data do contrato + prazo, mesmo que a 1ª parcela
  // seja ajustada por fim de semana/feriado.
  const primeiraParcelaReferencia = useMemo(() => {
    const base = fromISODate(dataContrato || hojeISO());
    base.setDate(base.getDate() + Math.max(0, Number(prazoDias ?? 0)));
    return toISODate(base);
  }, [dataContrato, prazoDias]);

  // Totais calculados (padrão)
  const totais = useMemo(() => {
    return calcularTotais({
      valor,
      taxaJuros,
      parcelas,
      jurosAplicado,
      modalidade,
    });
  }, [valor, taxaJuros, parcelas, jurosAplicado, modalidade]);

  const totalAReceber = useMemo(() => {
    return usarTotalManual ? totalManual : totais.totalAReceber;
  }, [usarTotalManual, totalManual, totais.totalAReceber]);

  // taxa -> total
  useEffect(() => {
    if (!usarTotalManual) return;
    if (lastEditRef.current !== "taxa") return;

    const next = calcularTotais({
      valor,
      taxaJuros,
      parcelas,
      jurosAplicado,
      modalidade,
    }).totalAReceber;

    setTotalManual(next);
  }, [usarTotalManual, valor, taxaJuros, parcelas, jurosAplicado, modalidade]);

  // total -> taxa
  useEffect(() => {
    if (!usarTotalManual) return;
    if (lastEditRef.current !== "total") return;

    const nextTaxa = resolverTaxaPorTotal({
      valor,
      total: totalManual,
      parcelas,
      jurosAplicado,
      modalidade,
    });
    setTaxaJuros(nextTaxa);
  }, [usarTotalManual, valor, totalManual, parcelas, jurosAplicado, modalidade]);

  // Ao ligar o manual, inicializa
  useEffect(() => {
    if (!usarTotalManual) return;
    if (totalManual <= 0) setTotalManual(totais.totalAReceber);
  }, [usarTotalManual]);

  // Vencimentos
  const vencimentos = useMemo(() => {
    const mod =
      modalidade === "parcelado_mensal"
        ? "mensal"
        : modalidade === "semanal"
          ? "semanal"
          : modalidade === "quinzenal"
            ? "quinzenal"
            : modalidade === "diario"
              ? "diario"
              : "mensal";

    return gerarVencimentosParcelas({
      // Se não usar dia fixo (semanal/quinzenal), usa a referência do contrato + prazo
      // para manter o espaçamento coerente, mesmo quando a 1ª parcela foi ajustada.
      primeiraParcelaISO:
        (mod === "semanal" || mod === "quinzenal") && !usarDiaFixoSemana
          ? primeiraParcelaReferencia
          : primeiraParcela,
      numeroParcelas: parcelas,
      cobrarSabado,
      cobrarDomingo,
      cobrarFeriados,
      modalidade: mod,
      diaFixoSemana:
        (mod === "semanal" || mod === "quinzenal") && usarDiaFixoSemana ? diaSemanaCobranca : undefined,
    });
  }, [primeiraParcela, parcelas, cobrarSabado, cobrarDomingo, cobrarFeriados, modalidade, diaSemanaCobranca]);

  const valorParcela = useMemo(() => {
    const n = Math.max(1, Number(parcelas ?? 1));
    return totalAReceber / n;
  }, [totalAReceber, parcelas]);

  const cronogramaFinal = useMemo(() => {
    const base = vencimentos.map((v, idx) => ({
      numero: idx + 1,
      vencimento: v,
      valor: valorParcela,
    }));

    if (!editarCronograma) return base;

    return base.map((row, idx) => {
      const custom = cronogramaManual[idx];
      const valorCustom = Number(custom?.valor ?? NaN);
      return {
        numero: idx + 1,
        vencimento: custom?.vencimento || row.vencimento,
        valor: Number.isFinite(valorCustom) ? valorCustom : row.valor,
      };
    });
  }, [vencimentos, valorParcela, editarCronograma, cronogramaManual]);

  useEffect(() => {
    if (!editarCronograma) return;
    setCronogramaManual((prev) => {
      return vencimentos.map((v, idx) => {
        const atual = prev[idx];
        const valorCustom = Number(atual?.valor ?? NaN);
        return {
          numero: idx + 1,
          vencimento: atual?.vencimento || v,
          valor: Number.isFinite(valorCustom) ? valorCustom : valorParcela,
        };
      });
    });
  }, [editarCronograma, vencimentos, valorParcela]);

  const totalCronograma = useMemo(() => {
    return cronogramaFinal.reduce((acc, p) => acc + Number(p.valor ?? 0), 0);
  }, [cronogramaFinal]);

  const parcelaResumo = useMemo(() => {
    if (cronogramaFinal.length === 0) return valorParcela;
    const primeiro = Number(cronogramaFinal[0]?.valor ?? valorParcela);
    const todosIguais = cronogramaFinal.every((p) => Number(p.valor ?? 0) === primeiro);
    if (todosIguais) return primeiro;
    return totalCronograma / cronogramaFinal.length;
  }, [cronogramaFinal, valorParcela, totalCronograma]);

  const totalResumoContrato = useMemo(
    () => (editarCronograma ? totalCronograma : totalAReceber),
    [editarCronograma, totalCronograma, totalAReceber]
  );

  const parcelaResumoContrato = useMemo(
    () => (editarCronograma ? parcelaResumo : valorParcela),
    [editarCronograma, parcelaResumo, valorParcela]
  );

  const totalManualValido = useMemo(() => {
    if (!usarTotalManual) return true;
    if (valor <= 0) return false;
    return totalManual >= valor;
  }, [usarTotalManual, totalManual, valor]);

  const toggleEditarCronograma = () => {
    setEditarCronograma((prev) => {
      const next = !prev;
      if (next) {
        setCronogramaManual(
          vencimentos.map((v, idx) => ({
            numero: idx + 1,
            vencimento: v,
            valor: valorParcela,
          }))
        );
      } else {
        setCronogramaManual([]);
      }
      return next;
    });
  };

  const atualizarVencimentoParcela = (idx: number, novoVencimento: string) => {
    setCronogramaManual((prev) => {
      const arr = [...prev];
      const base = arr[idx] ?? cronogramaFinal[idx] ?? { numero: idx + 1, vencimento: novoVencimento, valor: valorParcela };
      arr[idx] = { ...base, vencimento: novoVencimento };
      return arr;
    });
  };

  const atualizarValorParcelaManual = (idx: number, raw: string) => {
    const parsed = parseNumeroBR(sanitizeMoneyInput(raw));
    setCronogramaManual((prev) => {
      const arr = [...prev];
      const base =
        arr[idx] ?? cronogramaFinal[idx] ?? { numero: idx + 1, vencimento: vencimentos[idx] ?? primeiraParcela, valor: valorParcela };
      arr[idx] = { ...base, valor: parsed };
      return arr;
    });
  };

  const resetCronogramaManual = () => {
    setCronogramaManual(
      vencimentos.map((v, idx) => ({
        numero: idx + 1,
        vencimento: v,
        valor: valorParcela,
      }))
    );
  };

  const handleCriar = () => {
    if (!clienteId) {
      alert("Selecione um cliente.");
      return;
    }
    if (valor <= 0) {
      alert("Informe o valor do empréstimo.");
      return;
    }
    if (!totalManualValido) {
      alert("O total a receber não pode ser menor que o valor emprestado.");
      return;
    }

    const cronogramaParaSalvar = cronogramaFinal;
    const vencimentosParaSalvar = cronogramaParaSalvar.map((p) => p.vencimento);

    const faltaVencimento = cronogramaParaSalvar.some((p) => !p.vencimento);
    const valorInvalido = cronogramaParaSalvar.some((p) => !(Number(p.valor ?? 0) > 0));

    if (faltaVencimento) {
      alert("Preencha o vencimento de todas as parcelas.");
      return;
    }

    if (valorInvalido) {
      alert("Todas as parcelas precisam ter valor maior que zero.");
      return;
    }

    const totalContrato = totalCronograma || totalAReceber;
    if (!(totalContrato >= valor)) {
      alert("O total das parcelas não pode ser menor que o valor emprestado.");
      return;
    }

    const payload: NovoEmprestimoPayload = {
      clienteId,
      valor,
      taxaJuros,
      jurosAplicado,
      modalidade,
      parcelas,
      dataContrato,
      primeiraParcela,
      prazoDias,
      prazo_dias: prazoDias,
      observacoes: observacoes?.trim() ? observacoes.trim() : undefined,
      cobrarSabado,
      cobrarDomingo,
      cobrarFeriados,
      usarDiaFixoSemana,
      usar_dia_fixo_semana: usarDiaFixoSemana,
      diaSemanaCobranca: usarDiaFixoSemana ? diaSemanaCobranca : undefined,
      dia_semana_cobranca: usarDiaFixoSemana ? diaSemanaCobranca : undefined,
      aplicarJurosAtraso: aplicarJurosAtraso || undefined,
      notificarWhatsapp: notificarWhatsapp || undefined,
      jurosAtrasoTipo: aplicarJurosAtraso ? jurosAtrasoTipo : undefined,
      jurosAtrasoTaxa: aplicarJurosAtraso ? Number(jurosAtrasoTaxa ?? 0) : undefined,
      vencimentos: vencimentosParaSalvar,
      parcelasPersonalizadas: editarCronograma ? cronogramaParaSalvar : undefined,
    };

    onCreate(payload);
    onClose();
    navigate("/emprestimos");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-2">
      <div className="w-full max-w-[420px] rounded-2xl border border-slate-700/50 bg-gradient-to-b from-slate-950 to-slate-950/80 shadow-2xl max-h-[90vh] flex flex-col backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent">
          <div>
            <div className="text-lg font-semibold text-white">Novo Empréstimo</div>
            <div className="text-xs text-white/50">Configure o empréstimo e confira o cronograma antes de criar.</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-white/80 hover:bg-slate-800/60 hover:border-slate-600/60 transition"
          >
            Fechar
          </button>
        </div>

        {/* Body (scroll) */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* ✅ UMA COLUNA SEMPRE */}
          <div className="grid grid-cols-1 gap-6">
            {/* Cliente */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]">
              <div className="mb-3 text-xs font-semibold text-white">Cliente</div>

              <button
                type="button"
                onClick={() => {
                  setNovoClienteAberto((v) => !v);
                  setClienteDropdownOpen(false);
                }}
                className="mb-3 w-full rounded-lg border border-dashed border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15"
              >
                {novoClienteAberto ? "Cancelar cadastro de cliente" : "+ Cadastrar novo cliente"}
              </button>

              {novoClienteAberto ? (
                <div className="mb-3 rounded-lg border border-emerald-500/20 bg-slate-950/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-200">Novo Cliente</div>
                    <button
                      type="button"
                      onClick={resetNovoClienteInline}
                      className="text-[11px] text-slate-300 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-white/70">Nome completo *</label>
                      <input
                        value={novoClienteNome}
                        onChange={(e) => setNovoClienteNome(e.target.value)}
                        placeholder="Nome do cliente"
                        className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-white/70">Telefone</label>
                      <input
                        value={novoClienteTelefone}
                        onChange={(e) => setNovoClienteTelefone(e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-white/70">Endereço</label>
                      <input
                        value={novoClienteEndereco}
                        onChange={(e) => setNovoClienteEndereco(e.target.value)}
                        placeholder="Endereço completo"
                        className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-white/70">Observações</label>
                      <textarea
                        value={novoClienteObs}
                        onChange={(e) => setNovoClienteObs(e.target.value)}
                        placeholder="Observações sobre o cliente"
                        className="h-20 w-full resize-none rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={criarNovoClienteInline}
                    disabled={salvandoNovoCliente}
                    className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {salvandoNovoCliente ? "Criando..." : "Criar Cliente"}
                  </button>
                </div>
              ) : null}


              {!novoClienteAberto ? (
                <>
              {/* ✅ Combobox com busca */}
              <div className="relative">
                <input
                  value={clienteQuery}
                  onChange={(e) => {
                    setClienteQuery(e.target.value);
                    setClienteDropdownOpen(true);
                  }}
                  onFocus={onClienteFocus}
                  onBlur={onClienteBlur}
                  className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                  placeholder="Buscar cliente por nome, telefone ou CPF..."
                />

                {clienteDropdownOpen ? (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950/95 shadow-2xl backdrop-blur">
                    <div className="max-h-64 overflow-y-auto">
                      {clientesFiltrados.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-white/60">Nenhum cliente encontrado.</div>
                      ) : (
                        clientesFiltrados.map((c: any) => (
                          <button
                            type="button"
                            key={c.id}
                            onMouseDown={(e) => e.preventDefault()} // mantém foco para permitir click
                            onClick={() => selecionarCliente(c)}
                            className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-800/50 ${
                              c.id === clienteId ? "bg-emerald-500/10" : ""
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-white/90">{c.nomeCompleto ?? "Sem nome"}</div>
                              <div className="truncate text-[11px] text-white/50">
                                {c.cpf ? `CPF: ${c.cpf}` : ""}{" "}
                                {c.telefone ? `• Tel: ${c.telefone}` : ""}{" "}
                                {c.email ? `• ${c.email}` : ""}
                              </div>
                            </div>
                            {c.id === clienteId ? (
                              <div className="text-[11px] font-semibold text-emerald-300">Selecionado</div>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

                </>
              ) : null}
              <div className="mt-3 text-xs text-white/60">
                {clienteLoading ? (
                  "Carregando..."
                ) : clienteEncontrado ? (
                  <>
                    <div>
                      <span className="text-white/70">Nome:</span> {clienteEncontrado.nomeCompleto}
                    </div>
                    {clienteEncontrado.telefone ? (
                      <div>
                        <span className="text-white/70">Telefone:</span> {clienteEncontrado.telefone}
                      </div>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>

            {/* Valores */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-white">Valores</div>

                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={usarTotalManual}
                    onChange={(e) => setUsarTotalManual(e.target.checked)}
                  />
                  Total manual
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-white/60">Valor emprestado (R$)</div>
                  <input
                    value={valorInput}
                    onChange={(e) => {
                      valorEditingRef.current = true;
                      setValorInput(sanitizeMoneyInput(e.target.value));
                    }}
                    onBlur={() => {
                      const n = parseNumeroBR(valorInput);
                      valorEditingRef.current = false;
                      setValor(n);
                      setValorInput(fmt2(n));
                    }}
                    onFocus={() => {
                      valorEditingRef.current = true;
                    }}
                    className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">Parcelas</div>
                  <input
                    type="number"
                    min={1}
                    value={parcelas}
                    onChange={(e) => setParcelas(clamp(Number(e.target.value), 1, 999))}
                    className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">Taxa de juros (%)</div>
                  <input
                    value={String(taxaJuros)}
                    onChange={(e) => {
                      lastEditRef.current = "taxa";
                      setTaxaJuros(parseNumeroBR(e.target.value));
                    }}
                    className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">Total a receber (R$)</div>
                  <input
                    value={usarTotalManual ? totalManualInput : fmt2(totalAReceber)}
                    onChange={(e) => {
                      if (!usarTotalManual) return;
                      lastEditRef.current = "total";
                      totalManualEditingRef.current = true;
                      setTotalManualInput(sanitizeMoneyInput(e.target.value));
                    }}
                    onBlur={() => {
                      if (!usarTotalManual) return;
                      const n = parseNumeroBR(totalManualInput);
                      totalManualEditingRef.current = false;
                      lastEditRef.current = "total";
                      setTotalManual(n);
                      setTotalManualInput(fmt2(n));
                    }}
                    onFocus={() => {
                      if (!usarTotalManual) return;
                      totalManualEditingRef.current = true;
                    }}
                    disabled={!usarTotalManual}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                      usarTotalManual
                        ? "border-slate-700/60 bg-slate-950/60 text-white"
                        : "cursor-not-allowed border-slate-800/60 bg-slate-950/30 text-white/40"
                    }`}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                  {!totalManualValido ? (
                    <div className="text-[11px] text-rose-300">Total deve ser ≥ valor emprestado.</div>
                  ) : null}
                  {!usarTotalManual ? (
                    <div className="text-[11px] text-white/40">Calculado automaticamente pela taxa.</div>
                  ) : (
                    <div className="text-[11px] text-white/40">Ao editar o total, a taxa é recalculada (e vice-versa).</div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-white/60">Modalidade</div>
                  <SelectPremium
                    value={modalidade}
                    onChange={(v) => setModalidade(v as Modalidade)}
                    options={[
                      { value: "parcelado_mensal", label: "Mensal" },
                      { value: "quinzenal", label: "Quinzenal" },
                      { value: "semanal", label: "Semanal" },
                      { value: "diario", label: "Diário" },
                      { value: "tabela_price", label: "Tabela Price" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">Juros aplicado</div>
                  <SelectPremium
                    value={jurosAplicado}
                    onChange={(v) => setJurosAplicado(v as JurosAplicado)}
                    disabled={modalidade === "tabela_price"}
                    options={[
                      { value: "por_parcela", label: "Por parcela" },
                      { value: "fixo", label: "Fixo (no total)" },
                    ]}
                  />
                </div>

                {(modalidade === "semanal" || modalidade === "quinzenal") && (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                      <span>Usar dia fixo na semana</span>
                      <input
                        type="checkbox"
                        checked={usarDiaFixoSemana}
                        onChange={(e) => setUsarDiaFixoSemana(e.target.checked)}
                      />
                    </label>

                    {usarDiaFixoSemana ? (
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">Dia fixo da semana</div>
                        <SelectPremium
                          value={String(diaSemanaCobranca)}
                          onChange={(v) => setDiaSemanaCobranca(Number(v))}
                          options={[
                            { value: "0", label: "Domingo" },
                            { value: "1", label: "Segunda" },
                            { value: "2", label: "Terça" },
                            { value: "3", label: "Quarta" },
                            { value: "4", label: "Quinta" },
                            { value: "5", label: "Sexta" },
                            { value: "6", label: "Sábado" },
                          ]}
                        />
                        <div className="text-[11px] text-white/40">
                          Se desativado, as próximas parcelas seguem a referência da data do contrato + prazo.
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-white/70">
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                  <div className="text-white/50">Juros total</div>
                  <div className="font-semibold text-white">R$ {fmt2(Math.max(0, totalResumoContrato - valor))}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                  <div className="text-white/50">Total a receber</div>
                  <div className="font-semibold text-white">R$ {fmt2(totalResumoContrato)}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                  <div className="text-white/50">Parcela</div>
                  <div className="font-semibold text-white">R$ {fmt2(parcelaResumoContrato)}</div>
                </div>
              </div>
            </div>

            {/* Datas */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]">
              <div className="mb-3 text-xs font-semibold text-white">Datas</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-white/60">Data do contrato</div>
                  <input
                    type="date"
                    value={dataContrato}
                    onChange={(e) => setDataContrato(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">Prazo (dias) até 1ª parcela</div>
                  <input
                    type="number"
                    min={0}
                    value={prazoDias}
                    onChange={(e) => setPrazoDias(clamp(Number(e.target.value), 0, 3650))}
                    className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                  <span>Cobrar no sábado</span>
                  <input type="checkbox" checked={cobrarSabado} onChange={(e) => setCobrarSabado(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                  <span>Cobrar no domingo</span>
                  <input type="checkbox" checked={cobrarDomingo} onChange={(e) => setCobrarDomingo(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                  <span>Cobrar em feriados</span>
                  <input
                    type="checkbox"
                    checked={cobrarFeriados}
                    onChange={(e) => setCobrarFeriados(e.target.checked)}
                  />
                </label>

                <div className="mt-2 text-xs text-white/60">
                  Primeira parcela (automática): <span className="font-semibold text-white">{primeiraParcela}</span>
                </div>
              </div>
            </div>

            {/* Cronograma */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-white">Cronograma</div>
                <div className="flex items-center gap-2">
                  {editarCronograma ? (
                    <button
                      type="button"
                      onClick={resetCronogramaManual}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/15"
                    >
                      Recalcular padrão
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleEditarCronograma}
                    className="rounded-lg border border-slate-600/60 bg-slate-800/50 px-3 py-1.5 text-[11px] font-semibold text-white hover:border-emerald-400/60 hover:text-emerald-100"
                  >
                    {editarCronograma ? "Usar automático" : "Editar manualmente"}
                  </button>
                </div>
              </div>

              <div className="mb-4 text-xs text-white/60">
                Mostrando as {parcelas} parcelas.{" "}
                {editarCronograma ? "Edite datas e valores diretamente na tabela." : "(A 1ª parcela aparece apenas aqui.)"}
              </div>

              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-700/60">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-950/95 backdrop-blur">
                    <tr className="text-xs text-white/60">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Vencimento</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronogramaFinal.map((p, i) => (
                      <tr key={`${p.vencimento}-${i}`} className="border-t border-slate-700/60 text-white/80">
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">
                          {editarCronograma ? (
                            <input
                              type="date"
                              value={p.vencimento}
                              onChange={(e) => atualizarVencimentoParcela(i, e.target.value)}
                              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/30"
                            />
                          ) : (
                            p.vencimento
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editarCronograma ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-[11px] text-white/50">R$</span>
                              <input
                                inputMode="decimal"
                                value={fmt2(Number(p.valor ?? 0))}
                                onChange={(e) => atualizarValorParcelaManual(i, e.target.value)}
                                className="w-28 rounded-lg border border-slate-700/60 bg-slate-950/70 px-2 py-1 text-right text-sm text-white outline-none focus:border-emerald-400/60 focus:ring-1 focus:ring-emerald-400/30"
                              />
                            </div>
                          ) : (
                            <>R$ {fmt2(p.valor)}</>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/70">
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                  <div className="text-white/50">Total</div>
                  <div className="font-semibold text-white">
                    R$ {fmt2(totalCronograma)}
                    {editarCronograma ? <span className="ml-1 text-[11px] text-emerald-200">(manual)</span> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
                  <div className="text-white/50">{editarCronograma ? "Parcela (média)" : "Parcela"}</div>
                  <div className="font-semibold text-white">R$ {fmt2(parcelaResumo)}</div>
                </div>
              </div>
            </div>

            {/* Dicas */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)] text-xs text-white/60">
              <div className="font-semibold text-white/80 mb-1">Dicas</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Use “Total manual” quando quiser digitar o total e deixar a taxa calcular sozinha.</li>
                <li>Prazo (dias) calcula a 1ª parcela automaticamente com as regras de cobrança.</li>
                <li>Semanal/quinzenal: use dia fixo para alinhar os vencimentos.</li>
              </ul>
            </div>

            {/* Configurações */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]">
              <div className="mb-3 text-xs font-semibold text-white">Configurações</div>

              <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                <span>Notificar WhatsApp</span>
                <input type="checkbox" checked={notificarWhatsapp} onChange={(e) => setNotificarWhatsapp(e.target.checked)} />
              </label>

              <div className="mt-3">
                <label className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-white/80">
                  <span>Aplicar juros por atraso</span>
                  <input
                    type="checkbox"
                    checked={aplicarJurosAtraso}
                    onChange={(e) => setAplicarJurosAtraso(e.target.checked)}
                  />
                </label>

                {aplicarJurosAtraso ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs text-white/60">Tipo</div>
                      <SelectPremium
                        value={jurosAtrasoTipo}
                        onChange={(v) => setJurosAtrasoTipo(v as JurosAtrasoTipo)}
                        options={[
                          { value: "valor_por_dia", label: "Valor por dia (R$)" },
                          { value: "percentual_por_dia", label: "Percentual por dia (%)" },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-white/60">Taxa</div>
                      <input
                        value={String(jurosAtrasoTaxa)}
                        onChange={(e) => setJurosAtrasoTaxa(parseNumeroBR(e.target.value))}
                        className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 space-y-1">
                <div className="text-xs text-white/60">Observações</div>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="h-24 w-full resize-none rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition"
                  placeholder="Opcional..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-700/50 px-4 py-3 bg-slate-950/40">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-2 text-sm text-white/80 hover:bg-slate-800/60 hover:border-slate-600/60 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCriar}
            disabled={!totalManualValido}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-black transition ${
              totalManualValido ? "bg-emerald-500 hover:bg-emerald-400" : "cursor-not-allowed bg-emerald-500/40"
            }`}
          >
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

export default NovoEmprestimoModal;
