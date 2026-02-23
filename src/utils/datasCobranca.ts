import feriados2026 from "../data/feriadosBR-2026.json";

export function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fromISODate(iso: string) {
  // evita bug de fuso: cria como "meio-dia" local
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function addMonthsKeepingDay(base: Date, monthsToAdd: number) {
  const d = new Date(base.getTime());
  const originalDay = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() + monthsToAdd);

  // último dia do mês alvo
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));

  return d;
}

function buildFeriadosSet(): Set<string> {
  return new Set((feriados2026 ?? []) as string[]);
}

export const feriadosSet = buildFeriadosSet();

export function isWeekend(date: Date) {
  const day = date.getDay(); // 0 dom, 6 sab
  return day === 0 || day === 6;
}

export function isFeriadoISO(iso: string) {
  return feriadosSet.has(iso);
}

export function ajustarParaDiaCobravel(params: {
  dataISO: string;
  cobrarSabado: boolean;
  cobrarDomingo: boolean;
  cobrarFeriados: boolean;
}) {
  let d = fromISODate(params.dataISO);

  while (true) {
    const iso = toISODate(d);
    const dia = d.getDay();

    const ehSab = dia === 6;
    const ehDom = dia === 0;
    const ehFer = feriadosSet.has(iso);

    if (ehSab && !params.cobrarSabado) {
      d.setDate(d.getDate() + 1);
      continue;
    }
    if (ehDom && !params.cobrarDomingo) {
      d.setDate(d.getDate() + 1);
      continue;
    }
    if (ehFer && !params.cobrarFeriados) {
      d.setDate(d.getDate() + 1);
      continue;
    }

    return toISODate(d);
  }
}

export function gerarVencimentosParcelas(params: {
  primeiraParcelaISO: string;
  numeroParcelas: number;
  cobrarSabado: boolean;
  cobrarDomingo: boolean;
  cobrarFeriados: boolean;
  // default: mensal
  modalidade?: "mensal" | "quinzenal" | "semanal" | "diario";
  // Se informado (0-6), tenta alinhar a parcela ao dia da semana.
  // Útil para modalidades semanal/quinzenal com "dia fixo".
  diaFixoSemana?: number;
  // Carência em dias adicionada antes de gerar o cronograma.
  carenciaDias?: number;
}) {
  const base = fromISODate(params.primeiraParcelaISO);
  const carencia = Math.max(0, Number(params.carenciaDias ?? 0));
  if (carencia > 0) base.setDate(base.getDate() + carencia);
  const n = Math.max(1, params.numeroParcelas);

  const vencimentos: string[] = [];

  function alinharAoDiaFixo(d: Date) {
    const target = Number(params.diaFixoSemana);
    if (!Number.isFinite(target)) return d;
    const day = d.getDay();
    const delta = (target - day + 7) % 7; // sempre pra frente
    if (delta === 0) return d;
    d.setDate(d.getDate() + delta);
    return d;
  }

  const mod = params.modalidade ?? "mensal";

  // Alinha a base primeiro (para semanal/quinzenal)
  if (mod === "semanal" || mod === "quinzenal") {
    alinharAoDiaFixo(base);
  }

  for (let i = 0; i < n; i++) {
    const alvo = new Date(base.getTime());
    if (mod === "diario") {
      alvo.setDate(alvo.getDate() + i);
    } else if (mod === "semanal") {
      alvo.setDate(alvo.getDate() + i * 7);
    } else if (mod === "quinzenal") {
      alvo.setDate(alvo.getDate() + i * 14);
    } else {
      // mensal
      const m = addMonthsKeepingDay(base, i);
      alvo.setTime(m.getTime());
    }
    const iso = toISODate(alvo);

    const ajustada = ajustarParaDiaCobravel({
      dataISO: iso,
      cobrarSabado: params.cobrarSabado,
      cobrarDomingo: params.cobrarDomingo,
      cobrarFeriados: params.cobrarFeriados,
    });

    vencimentos.push(ajustada);
  }

  return vencimentos;
}
