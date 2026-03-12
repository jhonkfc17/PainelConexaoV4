import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { usePermissoes } from "../../store/usePermissoes";

export default function RequireStaffManage({ children }: { children: React.ReactNode }) {
  const loading = useAuthStore((s) => s.loading);
  const { isAdmin } = usePermissoes();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="rounded-xl border border-emerald-500/20 bg-slate-950/40 p-6 shadow-glow">
          <div className="text-sm text-slate-200">Carregando...</div>
          <div className="mt-1 text-xs text-slate-400">Validando permissões</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
