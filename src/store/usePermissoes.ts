import { useMemo } from "react";
import { useAuthStore } from "./useAuthStore";

/**
 * Permissões efetivas do usuário logado.
 * - Owner (auth.uid === tenantId) sempre tem acesso total.
 * - Staff recebe permissões por app_metadata.permissions.
 */
export function usePermissoes() {
  const user = useAuthStore((s) => s.user);
  const tenantId = useAuthStore((s) => s.tenantId);
  const role = useAuthStore((s) => s.role);
  const perms = useAuthStore((s) => s.permissions);

  return useMemo(() => {
    const isOwner = Boolean(user?.id && tenantId && user.id === tenantId);
    const isAdmin = isOwner || role === "admin";

        const can = (key: string) => Boolean(isAdmin || perms?.[key]);

    const canManageStaff = can("staff_manage");
    const canManageClients = can("clients_create") || can("clients_edit");
    const canViewClients = can("clients_view") || canManageClients;
    const canViewAll = can("profit_view") || can("reports_view");
    const canManageLoans = can("loans_create") || can("loans_edit");
    const canViewLoans = can("loans_view") || canManageLoans;
    const canManagePayments = can("payments_manage");
    const canManageWhatsapp = can("whatsapp_manage");
    const canExportCSV = can("export_csv");
    const canManageSettings = can("settings_manage");
    const canViewReports = can("reports_view");
    const canViewProfit = can("profit_view");

    return {
      tenantId,
      role,
      isOwner,
      isAdmin,
      can,
      // atalhos usados no app (compat)
      canManageStaff,
      canManageClients,
      canViewClients,
      canViewAll,
      canManageLoans,
      canViewLoans,
      canManagePayments,
      canManageWhatsapp,
      canExportCSV,
      canManageSettings,
      canViewReports,
      canViewProfit,
    };
  }, [user?.id, tenantId, role, perms]);
}
