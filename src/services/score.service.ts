import { supabase } from "../lib/supabaseClient";
import type { Cliente } from "../components/clientes/clienteTipos";
import { listClientes } from "./clientes.service";

type ParcelaRow = {
  id: number;
  emprestimo_id: string;
  numero: number;
  vencimento: string; // YYYY-MM-DD
  valor: number;
  pago: boolean;
  pago_em: string | null;
  valor_pago: number | null;
  juros_atraso: number | null;
  emprestimos?: {
    cliente_id: string;
  } | null;
};

export type ClienteScore = {
  clienteId: string;
  nome: string;
  telefone?: string;
  email?: string;

  score: number; // 0-1000
  faixa: "A" | "B" | "C" | "D";

  totalParcelas: number;
  totalVencidasAteHoje: number;
  pagasEmDia: number;
  pagasEmAtraso: number;
  emAtrasoNaoPagas: number;

  taxaEmDia: number; // 0-1
};

function endOfDay(dateYYYYMMDD: string) {
  // Vencimento é DATE (sem timezone). Considera final do dia local.
  return new Date(`${dateYYYYMMDD}T23:59:59.999`);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function faixa(score: number): ClienteScore["faixa"] {
  if (score >= 900) return "A";
  if (score >= 750) return "B";
  if (score >= 600) return "C";
  return "D";
}

function calcularScore(m: {
  totalVencidasAteHoje: number;
  pagasEmDia: number;
  pagasEmAtraso: number;
  emAtrasoNaoPagas: number;
}) {
  const total = Math.max(0, m.totalVencidasAteHoje);
  const emDia = Math.max(0, m.pagasEmDia);
  const atrasoPago = Math.max(0, m.pagasEmAtraso);
  const atrasoAberto = Math.max(0, m.emAtrasoNaoPagas);

  // Regra simples, explicável e consistente:
  // - Base 350
  // - Bônus por taxa em dia até 700 pontos
  // - Penaliza atrasos pagos e, mais forte, atrasos em aberto
  const taxaEmDia = total ? emDia / total : 1;
  const bruto = 350 + taxaEmDia * 650 - atrasoPago * 15 - atrasoAberto * 30;
  return clamp(Math.round(bruto), 0, 1000);
}

export async function listarScoreClientes(clientesInput?: Cliente[]): Promise<ClienteScore[]> {
  const clientes = clientesInput ?? (await listClientes());

  // Puxa todas as parcelas do usuário, trazendo cliente_id via join com emprestimos.
  // Observação: o join depende das FK e do relacionamento no Supabase.
  const { data, error } = await supabase
    .from("parcelas")
    .select("id, emprestimo_id, numero, vencimento, valor, pago, pago_em, valor_pago, valor_pago_acumulado, juros_atraso, emprestimos(cliente_id)")
    .order("vencimento", { ascending: true });

  if (error) throw error;

  const parcelas = ((data ?? []) as any[]).map((r) => ({
    ...r,
    valor_pago: r.valor_pago ?? r.valor_pago_acumulado ?? null,
  })) as ParcelaRow[];
  const today0 = startOfToday();

  const byCliente = new Map<string, {
    totalParcelas: number;
    totalVencidasAteHoje: number;
    pagasEmDia: number;
    pagasEmAtraso: number;
    emAtrasoNaoPagas: number;
  }>();

  for (const p of parcelas) {
    const clienteId = p.emprestimos?.cliente_id;
    if (!clienteId) continue;

    const vencEnd = endOfDay(p.vencimento);
    const vencidaAteHoje = vencEnd.getTime() < today0.getTime();

    const cur = byCliente.get(clienteId) ?? {
      totalParcelas: 0,
      totalVencidasAteHoje: 0,
      pagasEmDia: 0,
      pagasEmAtraso: 0,
      emAtrasoNaoPagas: 0,
    };

    cur.totalParcelas += 1;

    if (vencidaAteHoje) {
      cur.totalVencidasAteHoje += 1;

      if (p.pago) {
        const pagoEm = p.pago_em ? new Date(p.pago_em) : null;
        if (pagoEm && pagoEm.getTime() <= vencEnd.getTime()) cur.pagasEmDia += 1;
        else cur.pagasEmAtraso += 1;
      } else {
        cur.emAtrasoNaoPagas += 1;
      }
    } else {
      // Ainda não venceu até hoje: não conta para taxa "em dia".
      // Mas mantém totalParcelas.
    }

    byCliente.set(clienteId, cur);
  }

  const out: ClienteScore[] = clientes.map((c: Cliente) => {
    const m = byCliente.get(c.id) ?? {
      totalParcelas: 0,
      totalVencidasAteHoje: 0,
      pagasEmDia: 0,
      pagasEmAtraso: 0,
      emAtrasoNaoPagas: 0,
    };

    const total = Math.max(0, m.totalVencidasAteHoje);
    const taxaEmDia = total ? m.pagasEmDia / total : 1;
    const score = calcularScore(m);

    return {
      clienteId: c.id,
      nome: c.nomeCompleto || "(Sem nome)",
      telefone: c.telefone || undefined,
      email: c.email || undefined,

      score,
      faixa: faixa(score),

      totalParcelas: m.totalParcelas,
      totalVencidasAteHoje: m.totalVencidasAteHoje,
      pagasEmDia: m.pagasEmDia,
      pagasEmAtraso: m.pagasEmAtraso,
      emAtrasoNaoPagas: m.emAtrasoNaoPagas,

      taxaEmDia,
    };
  });

  // Ordena: melhor score primeiro, depois nome.
  out.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome));

  return out;
}
