import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BadgePercent,
  Wallet,
  FileText,
  Settings,
  Shield,
  Smartphone,
  ShoppingCart,
  CalendarDays,
  Calculator,
  Car,
  TrendingUp,
  CreditCard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useEmprestimosStore } from "../store/useEmprestimosStore";

type NavItem = { to: string; label: string; icon: React.ReactNode };

const menu: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { to: "/clientes", label: "Clientes", icon: <Users size={16} /> },
  { to: "/score-clientes", label: "Score de Clientes", icon: <BadgePercent size={16} /> },
  { to: "/emprestimos", label: "Empréstimos", icon: <Wallet size={16} /> },
  { to: "/relatorio-operacional", label: "Relatório de Empréstimos", icon: <FileText size={16} /> },
  { to: "/calendario", label: "Calendário de Cobranças", icon: <CalendarDays size={16} /> },
  { to: "/desconto-cheque", label: "Desconto de Cheque", icon: <CreditCard size={16} /> },
  { to: "/vendas", label: "Vendas de Produtos", icon: <ShoppingCart size={16} /> },
  { to: "/veiculos", label: "Veículos Registrados", icon: <Car size={16} /> },
  { to: "/rel-vendas", label: "Rel. Vendas", icon: <TrendingUp size={16} /> },
  { to: "/simulador", label: "Simulador", icon: <Calculator size={16} /> },
  { to: "/funcionarios", label: "Funcionários", icon: <Shield size={16} /> },
  { to: "/config", label: "Configurações", icon: <Settings size={16} /> },
];

function NavItemLink({ to, icon, label }: NavItem) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        [
          "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left transition border",
          isActive
            ? "bg-emerald-500/10 border-emerald-500/20 shadow-glow"
            : "hover:bg-white/5 border-transparent",
        ].join(" ")
      }
    >
      <span className="text-slate-400">{icon}</span>
      <span className="text-sm text-slate-200/90">{label}</span>
      <span className="ml-auto text-slate-600">›</span>
    </NavLink>
  );
}

function SidebarContent({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore((s) => s.user);
  const startRealtime = useEmprestimosStore((s) => s.startRealtime);
  const stopRealtime = useEmprestimosStore((s) => s.stopRealtime);

  // Mantém o realtime do painel ativo enquanto o layout estiver montado.
  useEffect(() => {
    startRealtime?.();
    return () => {
      stopRealtime?.();
    };
  }, [startRealtime, stopRealtime]);

  return (
    <>
      <div className="h-14 px-3 sm:px-4 flex items-center gap-2 border-b border-emerald-500/10">
        <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/25 shadow-glow" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Conexão Painel</div>
          <div className="text-[11px] text-slate-400">Gestão Financeira</div>
        </div>
      </div>

      <div className="p-3">
        <div className="rounded-xl border border-emerald-500/15 bg-slate-950/30 p-3">
          <div className="text-xs text-slate-300">Minha conta</div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {user?.email ?? "—"}
          </div>

          <button
            onClick={onLogout}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs hover:bg-emerald-500/20"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>

        <div className="mt-4">
          <div className="text-[11px] text-slate-500 px-1 mb-2">MENU</div>
          <div className="space-y-1">
            {menu.map((it) => (
              <NavItemLink key={it.to} {...it} />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-slate-950/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone size={16} className="text-emerald-300" />
            <span>Instale o App</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Acesso rápido no celular</div>
          <button className="mt-3 w-full rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs hover:bg-emerald-500/20">
            Como instalar
          </button>
        </div>

        <div className="mt-4 text-[11px] text-slate-600 px-1">
          © {new Date().getFullYear()} Conexão Painel
        </div>
      </div>
    </>
  );
}

export default function AppLayout() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const startRealtime = useEmprestimosStore((s) => s.startRealtime);
  const stopRealtime = useEmprestimosStore((s) => s.stopRealtime);
  const signOut = useAuthStore((s) => s.signOut);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    startRealtime();
    return () => {
      stopRealtime();
    };
  }, [user?.id]);


  async function onLogout() {
    await signOut();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[260px] shrink-0 border-r border-emerald-500/15 bg-slate-950/60">
          <SidebarContent onLogout={onLogout} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-[280px] max-w-[85vw] border-r border-emerald-500/15 bg-slate-950 overflow-y-auto">
              <div className="flex items-center justify-between h-14 px-3 sm:px-4 border-b border-emerald-500/10">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 border border-emerald-500/25 shadow-glow" />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">Conexão Painel</div>
                    <div className="text-[11px] text-slate-400">Gestão Financeira</div>
                  </div>
                </div>
                <button
                  className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fechar menu"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3">
                <div className="rounded-xl border border-emerald-500/15 bg-slate-950/30 p-3">
                  <div className="text-xs text-slate-300">Minha conta</div>
                  <div className="mt-1 text-[11px] text-slate-400 truncate">
                    {user?.email ?? "—"}
                  </div>

                  <button
                    onClick={async () => {
                      setMobileOpen(false);
                      await onLogout();
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs hover:bg-emerald-500/20"
                  >
                    <LogOut size={14} />
                    Sair
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] text-slate-500 px-1 mb-2">MENU</div>
                  <div className="space-y-1">
                    {menu.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end={it.to === "/"}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          [
                            "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left transition border",
                            isActive
                              ? "bg-emerald-500/10 border-emerald-500/20 shadow-glow"
                              : "hover:bg-white/5 border-transparent",
                          ].join(" ")
                        }
                      >
                        <span className="text-slate-400">{it.icon}</span>
                        <span className="text-sm text-slate-200/90">{it.label}</span>
                        <span className="ml-auto text-slate-600">›</span>
                      </NavLink>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-500/15 bg-slate-950/30 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Smartphone size={16} className="text-emerald-300" />
                    <span>Instale o App</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">Acesso rápido no celular</div>
                  <button className="mt-3 w-full rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-3 py-2 text-xs hover:bg-emerald-500/20">
                    Como instalar
                  </button>
                </div>

                <div className="mt-4 text-[11px] text-slate-600 px-1">
                  © {new Date().getFullYear()} Conexão Painel
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        <main className="flex-1 min-w-0">
          <div className="h-14 border-b border-emerald-500/10 bg-slate-950/30 flex items-center gap-3 px-3 sm:px-6">
            <button
              className="md:hidden rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={16} />
            </button>
            <div className="text-sm text-slate-300">Painel</div>
          </div>

          {/* ✅ AQUI está a correção: espaço extra pro BottomNavigation no mobile */}
          <div className="w-full max-w-none px-2 sm:px-6 py-3 sm:py-6 pb-24 md:pb-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
