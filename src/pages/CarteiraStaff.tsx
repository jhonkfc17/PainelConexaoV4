import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, RefreshCcw, Shield, Wallet } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { usePermissoes } from "@/store/usePermissoes";
import {
  createStaffWalletPayout,
  getMyStaffWallet,
  listMyStaffWalletPayouts,
  listStaffWalletPayouts,
  listStaffWallets,
  updateStaffWalletPayout,
  voidStaffWalletPayout,
  type StaffWallet,
  type StaffWalletPayout,
} from "@/services/staffWallet.service";

type PayoutFormState = {
  staff_member_id: string;
  valor: string;
  paid_at: string;
  notes: string;
  comprovante_data_url: string | null;
  comprovante_nome: string;
  comprovante_mime_type: string;
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "-";
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString("pt-BR");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao ler o comprovante."));
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName || "comprovante";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.click();
}

function shouldHideInactive(wallet: StaffWallet) {
  return !wallet.active;
}

export default function CarteiraStaff() {
  const { isAdmin, isOwner } = usePermissoes();
  const canSeeTeamWallet = isOwner;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<StaffWallet[]>([]);
  const [payouts, setPayouts] = useState<StaffWalletPayout[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<StaffWalletPayout | null>(null);
  const [form, setForm] = useState<PayoutFormState>({
    staff_member_id: "",
    valor: "",
    paid_at: todayISO(),
    notes: "",
    comprovante_data_url: null,
    comprovante_nome: "",
    comprovante_mime_type: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [walletRows, payoutRows] = canSeeTeamWallet
        ? await Promise.all([listStaffWallets(), listStaffWalletPayouts()])
        : await Promise.all([
            getMyStaffWallet().then((wallet) => (wallet ? [wallet] : [])),
            listMyStaffWalletPayouts(),
          ]);
      const visibleWalletRows = walletRows.filter((wallet) => !shouldHideInactive(wallet));
      const visibleWalletIds = new Set(visibleWalletRows.map((wallet) => wallet.staff_member_id));
      const visiblePayoutRows = payoutRows.filter((payout) => visibleWalletIds.has(payout.staff_member_id));
      setWallets(visibleWalletRows);
      setPayouts(visiblePayoutRows);
      setSelectedStaffId((current) => {
        if (current && visibleWalletRows.some((wallet) => wallet.staff_member_id === current)) return current;
        const preferred = canSeeTeamWallet
          ? visibleWalletRows.find((wallet) => wallet.available_balance > 0) ?? visibleWalletRows[0]
          : visibleWalletRows[0];
        return preferred?.staff_member_id ?? "";
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao carregar carteira dos funcionários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canSeeTeamWallet]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 250);
    };

    const channel = supabase
      .channel("staff-wallet-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_members" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "emprestimos" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_profit_payouts" }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.staff_member_id === selectedStaffId) ?? null,
    [wallets, selectedStaffId]
  );

  const payoutsById = useMemo(() => {
    return new Map(wallets.map((wallet) => [wallet.staff_member_id, wallet]));
  }, [wallets]);

  const selectedPayouts = useMemo(() => {
    if (!selectedStaffId) return payouts;
    return payouts.filter((payout) => payout.staff_member_id === selectedStaffId);
  }, [payouts, selectedStaffId]);

  const totals = useMemo(() => {
    return wallets.reduce(
      (acc, wallet) => {
        acc.realized += wallet.realized_profit;
        acc.commission += wallet.commission_profit;
        acc.paid += wallet.paid_total;
        acc.available += wallet.available_balance;
        if (wallet.available_balance > 0.00001) acc.withBalance += 1;
        return acc;
      },
      { realized: 0, commission: 0, paid: 0, available: 0, withBalance: 0 }
    );
  }, [wallets]);

  const modalWallet = useMemo(
    () => wallets.find((wallet) => wallet.staff_member_id === form.staff_member_id) ?? null,
    [wallets, form.staff_member_id]
  );

  const modalHeadroom = useMemo(() => {
    if (!editingPayout || editingPayout.staff_member_id !== form.staff_member_id || editingPayout.estornado_em) return 0;
    return editingPayout.valor;
  }, [editingPayout, form.staff_member_id]);

  const modalAvailable = useMemo(() => {
    return (modalWallet?.available_balance ?? 0) + modalHeadroom;
  }, [modalWallet, modalHeadroom]);

  const openCreateModal = (staffMemberId?: string) => {
    const fallbackId = staffMemberId ?? selectedWallet?.staff_member_id ?? wallets[0]?.staff_member_id ?? "";
    setEditingPayout(null);
    setForm({
      staff_member_id: fallbackId,
      valor: "",
      paid_at: todayISO(),
      notes: "",
      comprovante_data_url: null,
      comprovante_nome: "",
      comprovante_mime_type: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (payout: StaffWalletPayout) => {
    setEditingPayout(payout);
    setForm({
      staff_member_id: payout.staff_member_id,
      valor: String(payout.valor),
      paid_at: payout.paid_at,
      notes: payout.notes ?? "",
      comprovante_data_url: payout.comprovante_data_url,
      comprovante_nome: payout.comprovante_nome ?? "",
      comprovante_mime_type: payout.comprovante_mime_type ?? "",
    });
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingPayout(null);
  };

  const handleSavePayout = async () => {
    try {
      setError(null);
      if (!form.staff_member_id) {
        setError("Selecione o funcionário.");
        return;
      }

      const amount = num(form.valor);
      if (!(amount > 0)) {
        setError("Informe um valor de repasse válido.");
        return;
      }

      if (!form.paid_at) {
        setError("Informe a data do repasse.");
        return;
      }

      if (amount > modalAvailable + 0.00001) {
        setError("O valor informado ultrapassa o saldo disponível deste funcionário.");
        return;
      }

      setSaving(true);

      if (editingPayout) {
        await updateStaffWalletPayout({
          id: editingPayout.id,
          staff_member_id: form.staff_member_id,
          valor: amount,
          paid_at: form.paid_at,
          notes: form.notes,
          comprovante_data_url: form.comprovante_data_url,
          comprovante_nome: form.comprovante_nome || null,
          comprovante_mime_type: form.comprovante_mime_type || null,
        });
      } else {
        await createStaffWalletPayout({
          staff_member_id: form.staff_member_id,
          valor: amount,
          paid_at: form.paid_at,
          notes: form.notes,
          comprovante_data_url: form.comprovante_data_url,
          comprovante_nome: form.comprovante_nome || null,
          comprovante_mime_type: form.comprovante_mime_type || null,
        });
      }

      setModalOpen(false);
      setEditingPayout(null);
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao salvar repasse.");
    } finally {
      setSaving(false);
    }
  };

  const handleVoidPayout = async (payout: StaffWalletPayout) => {
    const motivo = window.prompt("Informe o motivo do estorno:", payout.estornado_motivo ?? "");
    if (motivo === null) return;

    try {
      setError(null);
      setSaving(true);
      await voidStaffWalletPayout({ id: payout.id, motivo });
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao estornar repasse.");
    } finally {
      setSaving(false);
    }
  };

  const handleReceiptChange = async (file: File | null) => {
    try {
      if (!file) {
        setForm((current) => ({
          ...current,
          comprovante_data_url: null,
          comprovante_nome: "",
          comprovante_mime_type: "",
        }));
        return;
      }

      if (file.size > 4 * 1024 * 1024) {
        setError("O comprovante deve ter no máximo 4MB.");
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({
        ...current,
        comprovante_data_url: dataUrl,
        comprovante_nome: file.name,
        comprovante_mime_type: file.type || "application/octet-stream",
      }));
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao anexar comprovante.");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-semibold text-white">Carteira Staff</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              {canSeeTeamWallet ? "Owner" : isAdmin ? "Admin" : "Staff"}
            </span>
          </div>
          {canSeeTeamWallet ? <p className="mt-1 text-sm text-white/70">
            Saldo de lucro realizado por funcionário, já considerando o percentual configurado e os repasses efetuados.
          </p> : <p className="mt-1 text-sm text-white/70">Acompanhe seu saldo atual e o histórico de repasses registrados pelo admin.</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
          >
            <RefreshCcw size={16} />
            Atualizar
          </button>
          {canSeeTeamWallet ? (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
              disabled={wallets.length === 0}
            >
              <CircleDollarSign size={16} />
              Registrar repasse
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <Wallet size={16} />
            Saldo disponível
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-200">{brl(totals.available)}</div>
          <div className="mt-1 text-[11px] text-white/50">Carteira líquida após repasses</div>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-slate-950/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
            <CircleDollarSign size={16} />
            Lucro comissionável
          </div>
          <div className="mt-2 text-2xl font-extrabold text-sky-200">{brl(totals.commission)}</div>
          <div className="mt-1 text-[11px] text-white/50">Lucro realizado x percentual de cada staff</div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-slate-950/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <Shield size={16} />
            Repassado
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-200">{brl(totals.paid)}</div>
          <div className="mt-1 text-[11px] text-white/50">Pagamentos já registrados na carteira</div>
        </div>

        <div className="rounded-2xl border border-purple-500/20 bg-slate-950/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
            <Wallet size={16} />
            Staff com saldo
          </div>
          <div className="mt-2 text-2xl font-extrabold text-purple-200">{totals.withBalance}</div>
          <div className="mt-1 text-[11px] text-white/50">Funcionários com valor disponível para repasse</div>
        </div>
      </div>

      {canSeeTeamWallet ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-white font-semibold">Resumo por funcionário</div>
          {loading ? <div className="text-sm text-white/60">Carregando...</div> : null}
        </div>

        {wallets.length === 0 && !loading ? (
          <div className="p-4 text-white/70">Nenhum funcionário encontrado para a carteira.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {wallets.map((wallet) => {
              const isSelected = wallet.staff_member_id === selectedStaffId;
              return (
                <button
                  key={wallet.staff_member_id}
                  type="button"
                  onClick={() => setSelectedStaffId(wallet.staff_member_id)}
                  className={`grid w-full grid-cols-1 gap-3 px-4 py-4 text-left transition md:grid-cols-[1.7fr_repeat(5,minmax(0,1fr))_auto] ${
                    isSelected ? "bg-emerald-500/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{wallet.nome || wallet.email}</div>
                    <div className="truncate text-sm text-white/60">{wallet.email}</div>
                    <div className="mt-1 text-xs text-white/50">
                      {wallet.role} • {wallet.active ? "ativo" : "inativo"} • {wallet.commission_pct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50">Lucro realizado</div>
                    <div className="mt-1 font-semibold text-white">{brl(wallet.realized_profit)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50">Carteira</div>
                    <div className="mt-1 font-semibold text-sky-200">{brl(wallet.commission_profit)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50">Repassado</div>
                    <div className="mt-1 font-semibold text-amber-200">{brl(wallet.paid_total)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50">Disponível</div>
                    <div className={`mt-1 font-semibold ${wallet.available_balance >= 0 ? "text-emerald-200" : "text-red-200"}`}>
                      {brl(wallet.available_balance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/50">Último repasse</div>
                    <div className="mt-1 font-semibold text-white">{formatDate(wallet.last_payout_at)}</div>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/60">
                      {wallet.payout_count} repasses
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div> : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold">{canSeeTeamWallet ? "Funcionário selecionado" : "Sua carteira"}</div>
              <div className="mt-1 text-sm text-white/60">{canSeeTeamWallet ? "Resumo operacional da carteira individual." : "Seu resumo operacional de repasses."}</div>
            </div>
            {canSeeTeamWallet ? (
              <button
                type="button"
                onClick={() => openCreateModal(selectedWallet?.staff_member_id)}
                disabled={!selectedWallet}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-black/60"
              >
                Novo repasse
              </button>
            ) : null}
          </div>

          {!selectedWallet ? (
            <div className="mt-4 text-sm text-white/60">Selecione um funcionário para ver os detalhes.</div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-lg font-semibold text-white">{selectedWallet.nome || selectedWallet.email}</div>
                <div className="mt-1 text-sm text-white/60">{selectedWallet.email}</div>
                <div className="mt-2 text-xs text-white/50">
                  Comissão: {selectedWallet.commission_pct.toFixed(1)}% • Cargo: {selectedWallet.role} •{" "}
                  {selectedWallet.active ? "Ativo" : "Inativo"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] text-white/50">Lucro realizado bruto</div>
                  <div className="mt-2 text-xl font-bold text-white">{brl(selectedWallet.realized_profit)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] text-white/50">Lucro da carteira</div>
                  <div className="mt-2 text-xl font-bold text-sky-200">{brl(selectedWallet.commission_profit)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] text-white/50">Já repassado</div>
                  <div className="mt-2 text-xl font-bold text-amber-200">{brl(selectedWallet.paid_total)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] text-white/50">Saldo atual</div>
                  <div className={`mt-2 text-xl font-bold ${selectedWallet.available_balance >= 0 ? "text-emerald-200" : "text-red-200"}`}>
                    {brl(selectedWallet.available_balance)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-white font-semibold">Histórico de repasses</div>
              <div className="mt-1 text-sm text-white/60">
                {selectedWallet ? `Somente ${selectedWallet.nome || selectedWallet.email}` : "Todos os funcionários"}
              </div>
            </div>
          </div>

          {selectedPayouts.length === 0 ? (
            <div className="p-4 text-white/60">Nenhum repasse registrado para o filtro atual.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {selectedPayouts.map((payout) => {
                const wallet = payoutsById.get(payout.staff_member_id);
                const isVoided = Boolean(payout.estornado_em);
                return (
                  <div key={payout.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))_auto]">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{wallet?.nome || wallet?.email || "Funcionário"}</div>
                      <div className="mt-1 text-sm text-white/60">{payout.notes || "Sem observação"}</div>
                      <div className="mt-1 text-xs text-white/50">
                        Criado em {formatDateTime(payout.created_at)}
                        {isVoided ? ` • Estornado em ${formatDateTime(payout.estornado_em)}` : ""}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Valor</div>
                      <div className={`mt-1 font-semibold ${isVoided ? "text-white/40 line-through" : "text-emerald-200"}`}>
                        {brl(payout.valor)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Data do repasse</div>
                      <div className="mt-1 font-semibold text-white">{formatDate(payout.paid_at)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Status</div>
                      <div className={`mt-1 font-semibold ${isVoided ? "text-red-200" : "text-white"}`}>
                        {isVoided ? "Estornado" : "Ativo"}
                      </div>
                      {payout.comprovante_nome ? (
                        <div className="mt-1 text-xs text-white/60">Comprovante: {payout.comprovante_nome}</div>
                      ) : null}
                      {isVoided && payout.estornado_motivo ? (
                        <div className="mt-1 text-xs text-red-200/80">{payout.estornado_motivo}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {payout.comprovante_data_url ? (
                        <>
                          <button
                            type="button"
                            onClick={() => window.open(payout.comprovante_data_url ?? "", "_blank", "noopener,noreferrer")}
                            className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
                          >
                            Ver comprovante
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadDataUrl(payout.comprovante_data_url ?? "", payout.comprovante_nome ?? "comprovante")}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                          >
                            Baixar
                          </button>
                        </>
                      ) : null}
                      {canSeeTeamWallet ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(payout)}
                            disabled={saving || isVoided}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/40"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleVoidPayout(payout)}
                            disabled={saving || isVoided}
                            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:text-red-100/40"
                          >
                            Estornar
                          </button>
                        </>
                      ) : (
                        <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                          Visualização
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canSeeTeamWallet && modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <div className="w-full max-w-[560px] rounded-2xl border border-white/10 bg-[#0B1220] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="text-white font-semibold">{editingPayout ? "Editar repasse" : "Novo repasse"}</div>
              <button
                type="button"
                onClick={closeModal}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-4">
              <label className="block">
                <div className="mb-1 text-sm text-white/70">Funcionário</div>
                <select
                  value={form.staff_member_id}
                  onChange={(event) => setForm((current) => ({ ...current, staff_member_id: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                >
                  <option value="">Selecione</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.staff_member_id} value={wallet.staff_member_id}>
                      {wallet.nome || wallet.email} ({wallet.commission_pct.toFixed(1)}%)
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-sm text-white/70">Valor do repasse</div>
                  <input
                    value={form.valor}
                    onChange={(event) => setForm((current) => ({ ...current, valor: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    type="number"
                    min={0}
                    step={0.01}
                  />
                </label>

                <label className="block">
                  <div className="mb-1 text-sm text-white/70">Data do repasse</div>
                  <input
                    value={form.paid_at}
                    onChange={(event) => setForm((current) => ({ ...current, paid_at: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    type="date"
                  />
                </label>
              </div>

              <label className="block">
                <div className="mb-1 text-sm text-white/70">Observação</div>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-[96px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                  placeholder="Ex: repasse referente ao fechamento da semana"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-sm text-white/70">Comprovante do repasse</div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => void handleReceiptChange(event.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                  <span>{form.comprovante_nome ? `Arquivo atual: ${form.comprovante_nome}` : "Aceita imagem ou PDF até 4MB."}</span>
                  {form.comprovante_data_url ? (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          comprovante_data_url: null,
                          comprovante_nome: "",
                          comprovante_mime_type: "",
                        }))
                      }
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-100 hover:bg-red-500/20"
                    >
                      Remover comprovante
                    </button>
                  ) : null}
                </div>
              </label>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Saldo disponível para este lançamento: <span className="font-semibold">{brl(modalAvailable)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSavePayout()}
                className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-black/60"
                disabled={saving}
              >
                {saving ? "Salvando..." : editingPayout ? "Salvar alterações" : "Registrar repasse"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
