import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import BottomNavigation from "./components/BottomNavigation";
import { useEffect } from "react";

import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import ScoreClientes from "./pages/ScoreClientes";
import Emprestimos from "./pages/Emprestimos";
import EmprestimoDetalhe from "./pages/EmprestimoDetalhe";
import RelatorioOperacional from "./pages/RelatorioOperacional";
import CalendarioVencimentos from "./pages/CalendarioVencimentos";
import VendasProdutos from "./pages/VendasProdutos";
import Simulador from "./pages/Simulador";
import Configuracoes from "./pages/Configuracoes";
import Funcionarios from "./pages/Funcionarios";
import ParcelasAtrasadas from "./pages/ParcelasAtrasadas";

import { useAuthStore } from "./store/useAuthStore";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-6">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-xs text-slate-400 mt-1">Página em construção</div>
    </div>
  );
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/score-clientes" element={<ScoreClientes />} />
          <Route path="/emprestimos" element={<Emprestimos />} />
          <Route path="/emprestimos/:id" element={<EmprestimoDetalhe />} />
          <Route path="/relatorio-operacional" element={<RelatorioOperacional />} />
          <Route path="/calendario" element={<CalendarioVencimentos />} />
          <Route path="/vendas" element={<VendasProdutos />} />
          <Route path="/simulador" element={<Simulador />} />

          {/* ✅ NOVA ROTA */}
          <Route path="/parcelas/atrasadas" element={<ParcelasAtrasadas />} />

          <Route path="/desconto-cheque" element={<Placeholder title="Desconto de Cheque" />} />
          <Route path="/veiculos" element={<Placeholder title="Veículos Registrados" />} />
          <Route path="/rel-vendas" element={<Placeholder title="Rel. Vendas" />} />
          <Route path="/funcionarios" element={<Funcionarios />} />
          <Route path="/config" element={<Configuracoes />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <BottomNavigation />
    </BrowserRouter>
  );
}
