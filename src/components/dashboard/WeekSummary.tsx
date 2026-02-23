import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

type Card = { label: string; value: string | number; hint: string };

function cardTone(label: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("em atraso")) return "border-red-500/25 bg-red-500/10";
  if (l.includes("vence hoje")) return "border-amber-500/25 bg-amber-500/10";
  if (l.includes("vence amanhã") || l.includes("vence amanha")) return "border-sky-500/25 bg-sky-500/10";
  return "border-emerald-500/15 bg-white/5";
}

function cardPulse(label: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("em atraso") || l.includes("vence hoje")) return "motion-safe:animate-pulse";
  return "";
}

function routeForLabel(label: string): string | null {
  const l = (label || "").toLowerCase().trim();

  if (l.includes("em atraso")) return "/parcelas/atrasadas";
  if (l.includes("vence hoje")) return "/calendario";
  if (l.includes("vence amanhã") || l.includes("vence amanha")) return "/calendario";

  if (l.includes("cobran")) return "/calendario";

  if (l.includes("emprést") || l.includes("emprest")) return "/emprestimos";
  if (l.includes("capital")) return "/emprestimos";
  if (l.includes("contrat")) return "/emprestimos";

  if (l.includes("cliente")) return "/clientes";

  if (l.includes("juros")) return "/relatorio-operacional";
  if (l === "recebido") return "/relatorio-operacional";

  if (l.includes("produt")) return "/vendas";
  if (l.includes("veícul") || l.includes("veicul")) return "/veiculos";

  return null;
}

export default function WeekSummary({ cards }: { cards: Card[] }) {
  const navigate = useNavigate();

  const mapped = useMemo(() => {
    return cards.map((c) => ({ ...c, route: routeForLabel(c.label) }));
  }, [cards]);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-white/80">Resumo da Semana</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {mapped.map((c, i) => {
          const clickable = Boolean(c.route);

          const base =
            `rounded-2xl border p-4 text-left transition ` +
            `${cardTone(c.label)} ${cardPulse(c.label)} ` +
            `focus:outline-none focus:ring-2 focus:ring-emerald-400/40`;

          const hover =
            clickable
              ? "cursor-pointer hover:scale-[1.01] hover:bg-white/10 active:scale-[0.99]"
              : "opacity-90";

          const Comp: any = clickable ? "button" : "div";

          return (
            <Comp
              key={`${c.label}-${i}`}
              className={`${base} ${hover}`}
              onClick={
                clickable
                  ? () => navigate(String(c.route))
                  : undefined
              }
              type={clickable ? "button" : undefined}
              aria-label={clickable ? `Abrir ${c.label}` : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-white/60">{c.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{c.value}</div>
                  <div className="mt-1 text-xs text-white/40">{c.hint}</div>
                </div>

                {clickable ? (
                  <div className="text-xs text-emerald-200/80 mt-0.5">Abrir ›</div>
                ) : null}
              </div>
            </Comp>
          );
        })}
      </div>
    </div>
  );
}
