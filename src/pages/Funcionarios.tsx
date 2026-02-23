import { useEffect, useMemo, useState } from "react";
import {
  createStaff,
  listStaff,
  resetStaffPassword,
  updateStaff,
  deactivateStaff,
  type StaffMember,
  type StaffRole,
} from "../services/funcionarios.service";

type PermKey =
  | "clients_view"
  | "clients_create"
  | "clients_edit"
  | "loans_view"
  | "loans_create"
  | "loans_edit"
  | "payments_manage"
  | "reports_view"
  | "profit_view"
  | "export_csv"
  | "whatsapp_manage"
  | "settings_manage"
  | "staff_manage";

const PERMISSIONS: { key: PermKey; label: string }[] = [
  { key: "clients_view", label: "Ver clientes" },
  { key: "clients_create", label: "Cadastrar clientes" },
  { key: "clients_edit", label: "Editar clientes" },

  { key: "loans_view", label: "Ver empréstimos" },
  { key: "loans_create", label: "Cadastrar empréstimos" },
  { key: "loans_edit", label: "Editar empréstimos" },

  { key: "payments_manage", label: "Registrar pagamentos/baixas" },

  { key: "reports_view", label: "Ver relatórios" },
  { key: "profit_view", label: "Ver lucro e indicadores" },

  { key: "export_csv", label: "Exportar dados (CSV)" },
  { key: "whatsapp_manage", label: "Gerenciar WhatsApp/Automação" },

  { key: "settings_manage", label: "Gerenciar configurações" },
  { key: "staff_manage", label: "Gerenciar funcionários" },
];

function makeAllPermissions(value: boolean) {
  return PERMISSIONS.reduce((acc, p) => {
    acc[p.key] = value;
    return acc;
  }, {} as Record<string, boolean>);
}

export default function Funcionarios() {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<StaffMember[]>([]);
  const [openNew, setOpenNew] = useState(false);

  // form
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [commissionPct, setCommissionPct] = useState<number>(0);

  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => makeAllPermissions(false));

  // modal reset password
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUserId, setPwUserId] = useState<string>("");
  const [pwEmail, setPwEmail] = useState<string>("");
  const [pwNew, setPwNew] = useState<string>("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listStaff();
      setRows(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao carregar funcionários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const canCreate = useMemo(() => {
    if (!nome.trim()) return false;
    if (!email.trim()) return false;
    if (!senha.trim()) return false;
    return true;
  }, [nome, email, senha]);

  const togglePerm = (k: string) => {
    setPermissions((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const onToggleAdmin = (v: boolean) => {
    setIsAdmin(v);
    setPermissions(makeAllPermissions(v));
  };

  const resetForm = () => {
    setNome("");
    setEmail("");
    setSenha("");
    setCommissionPct(0);
    setIsAdmin(false);
    setPermissions(makeAllPermissions(false));
  };

  const handleCreate = async () => {
    try {
      setError(null);

      // validações
      const n = nome.trim();
      const e = email.trim().toLowerCase();
      const s = senha.trim();

      if (!n) return setError("Informe o nome.");
      if (!e) return setError("Informe o e-mail.");
      if (!s) return setError("Informe a senha.");

      const pct = Number(commissionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return setError("Comissão deve ser um número entre 0 e 100.");
      }

      setCreating(true);

      await createStaff({
        nome: n,
        email: e,
        password: s,
        role: (isAdmin ? "admin" : "staff") as StaffRole,
        permissions,
        commission_pct: pct,
      });

      // refresh list
      await load();

      // close modal
      setOpenNew(false);
      resetForm();
    } catch (e: any) {
      console.error("createStaff failed:", e);
      setError(e?.message || "Falha ao criar acesso do funcionário.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (auth_user_id: string) => {
    try {
      setError(null);
      setLoading(true);
      await deactivateStaff(auth_user_id);
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao desativar funcionário.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (r: StaffMember) => {
    try {
      setError(null);
      setLoading(true);
      await updateStaff({
        auth_user_id: r.auth_user_id,
        active: !r.active,
      });
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao atualizar status.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetAdmin = async (r: StaffMember, admin: boolean) => {
    try {
      setError(null);
      setLoading(true);
      await updateStaff({
        auth_user_id: r.auth_user_id,
        role: admin ? "admin" : "staff",
        permissions: admin ? makeAllPermissions(true) : (r.permissions ?? {}),
      });
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao atualizar cargo/permissões.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCommission = async (r: StaffMember, pct: number) => {
    try {
      setError(null);
      const v = Number(pct);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return setError("Comissão deve ser um número entre 0 e 100.");
      }
      setLoading(true);
      await updateStaff({
        auth_user_id: r.auth_user_id,
        commission_pct: v,
      });
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao salvar comissão.");
    } finally {
      setLoading(false);
    }
  };

  const openResetPw = (r: StaffMember) => {
    setPwUserId(r.auth_user_id);
    setPwEmail(r.email);
    setPwNew("");
    setPwOpen(true);
  };

  const handleResetPw = async () => {
    try {
      setError(null);
      if (!pwUserId) return;
      if (!pwNew.trim()) return setError("Informe a nova senha.");
      setLoading(true);
      await resetStaffPassword(pwUserId, pwNew.trim());
      setPwOpen(false);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao resetar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">Funcionários</h1>
          <p className="text-white/70 text-sm">Gerencie acessos, permissões e comissão.</p>
        </div>

        <button
          onClick={() => {
            setError(null);
            resetForm();
            setOpenNew(true);
          }}
          className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
        >
          Novo Funcionário
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white font-semibold">Lista</div>
          {loading ? <div className="text-white/60 text-sm">Carregando…</div> : null}
        </div>

        <div className="divide-y divide-white/10">
          {rows.length === 0 && !loading ? (
            <div className="p-4 text-white/70">Nenhum funcionário cadastrado.</div>
          ) : (
            rows.map((r) => (
              <div key={r.auth_user_id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <div className="text-white font-semibold">{r.nome || "Sem nome"}</div>
                  <div className="text-white/70 text-sm">{r.email}</div>
                  <div className="mt-1 text-xs text-white/60">
                    Cargo: <span className="text-white/80">{r.role}</span> • Status:{" "}
                    <span className={r.active ? "text-emerald-300" : "text-red-300"}>
                      {r.active ? "ativo" : "inativo"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-white/70 text-sm">Comissão</span>
                    <input
                      defaultValue={Number(r.commission_pct ?? 0)}
                      onBlur={(ev) => handleSaveCommission(r, Number(ev.target.value))}
                      className="w-16 bg-transparent text-white outline-none text-sm text-right"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                    />
                    <span className="text-white/70 text-sm">%</span>
                  </div>

                  <button
                    onClick={() => openResetPw(r)}
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    Reset senha
                  </button>

                  <button
                    onClick={() => handleSetAdmin(r, r.role !== "admin")}
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    {r.role === "admin" ? "Tirar admin" : "Tornar admin"}
                  </button>

                  <button
                    onClick={() => handleToggleActive(r)}
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </button>

                  <button
                    onClick={() => handleDeactivate(r.auth_user_id)}
                    className="px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                    title="Desativar definitivamente"
                  >
                    Bloquear
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL NOVO FUNCIONÁRIO */}
      {openNew && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="w-full max-w-[520px] rounded-2xl border border-white/10 bg-[#0B1220] shadow-xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-semibold">Novo Funcionário</div>
              <button
                onClick={() => setOpenNew(false)}
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-white/70 text-sm mb-1">Nome</div>
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    placeholder="Ex: João"
                  />
                </label>

                <label className="block">
                  <div className="text-white/70 text-sm mb-1">E-mail (login)</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    placeholder="ex: joao@email.com"
                  />
                </label>

                <label className="block">
                  <div className="text-white/70 text-sm mb-1">Senha</div>
                  <input
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    placeholder="********"
                    type="password"
                  />
                </label>

                <label className="block">
                  <div className="text-white/70 text-sm mb-1">Comissão sobre lucro (%)</div>
                  <input
                    value={String(commissionPct)}
                    onChange={(e) => setCommissionPct(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">Acesso total (Admin)</div>
                    <div className="text-white/60 text-sm">
                      Marca todas as permissões e permite gerenciar funcionários/configurações.
                    </div>
                  </div>

                  <button
                    onClick={() => onToggleAdmin(!isAdmin)}
                    className={`w-14 h-8 rounded-full border border-white/10 transition relative ${
                      isAdmin ? "bg-emerald-500/80" : "bg-white/10"
                    }`}
                    aria-label="toggle admin"
                  >
                    <span
                      className={`absolute top-1 w-6 h-6 rounded-full bg-white transition ${
                        isAdmin ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-center justify-between gap-3">
                      <span className="text-white/80 text-sm">{p.label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(permissions[p.key])}
                        onChange={() => togglePerm(p.key)}
                        className="w-5 h-5 accent-emerald-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpenNew(false)}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                disabled={creating}
              >
                Cancelar
              </button>

              <button
                onClick={handleCreate}
                disabled={creating || !canCreate}
                className={`px-4 py-2 rounded-xl font-semibold ${
                  creating || !canCreate
                    ? "bg-emerald-500/30 text-black/60 cursor-not-allowed"
                    : "bg-emerald-500 text-black hover:bg-emerald-400"
                }`}
              >
                {creating ? "Criando..." : "Criar acesso"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESET SENHA */}
      {pwOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0B1220] shadow-xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-semibold">Resetar senha</div>
              <button
                onClick={() => setPwOpen(false)}
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <div className="text-white/70 text-sm">Usuário:</div>
              <div className="text-white font-semibold">{pwEmail}</div>

              <label className="block mt-3">
                <div className="text-white/70 text-sm mb-1">Nova senha</div>
                <input
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
                  type="password"
                  placeholder="********"
                />
              </label>
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setPwOpen(false)}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetPw}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}