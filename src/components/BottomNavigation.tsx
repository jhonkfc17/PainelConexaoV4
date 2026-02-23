import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, CreditCard, Settings } from "lucide-react";

export default function BottomNavigation() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 flex justify-around items-center h-16 z-50 pb-safe">
      <NavLink to="/" className="flex flex-col items-center text-xs">
        <LayoutDashboard size={20} />
        Dashboard
      </NavLink>

      <NavLink to="/clientes" className="flex flex-col items-center text-xs">
        <Users size={20} />
        Clientes
      </NavLink>

      <NavLink to="/emprestimos" className="flex flex-col items-center text-xs">
        <CreditCard size={20} />
        Empréstimos
      </NavLink>

      <NavLink to="/config" className="flex flex-col items-center text-xs">
        <Settings size={20} />
        Config
      </NavLink>
    </div>
  );
}
