import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation() as any;

  const { user, loading, error, signInWithPassword, signUpWithPassword } = useAuthStore();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const redirectTo = useMemo(() => loc?.state?.from ?? "/", [loc?.state?.from]);

  useEffect(() => {
    if (user) nav(redirectTo, { replace: true });
  }, [user, nav, redirectTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) return;

    if (mode === "login") {
      await signInWithPassword(email, senha);
    } else {
      await signUpWithPassword(email, senha);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-0 sm:p-2">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-slate-950/40 shadow-glow backdrop-blur-md p-0 sm:p-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/25 shadow-glow" />
          <div>
            <div className="text-lg font-semibold">Conexão Painel</div>
            <div className="text-xs text-slate-400">Acesse sua conta</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm border",
              mode === "login"
                ? "bg-emerald-500/15 border-emerald-500/25"
                : "border-transparent hover:bg-white/5",
            ].join(" ")}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm border",
              mode === "signup"
                ? "bg-emerald-500/15 border-emerald-500/25"
                : "border-transparent hover:bg-white/5",
            ].join(" ")}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <div className="text-sm text-slate-300">E-mail</div>
            <input
              className="rc-input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm text-slate-300">Senha</div>
            <input
              className="rc-input w-full"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="rc-btn-primary w-full"
            disabled={loading || !email || !senha}
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <div className="text-xs text-slate-400">
            {mode === "signup"
              ? "Ao criar conta, você terá acesso aos seus próprios dados (seguro por usuário)."
              : "Entre para acessar seus dados."}
          </div>
        </form>
      </div>
    </div>
  );
}
