export const dashboardMock = {
  user: {
    name: "Bem-vindo de volta!",
    roleLabel: "Dono (acesso total)",
    subtitle: "Gerencie seu sistema financeiro",
  },

  installBanner: {
    title: "Instale o CobraFácil no seu celular",
    desc: "Tenha acesso rápido direto do seu celular. Indicado p/ offline e como um app nativo!",
    button: "Ver instruções",
  },

  upgradeBanner: {
    title: "Expanda seu Negócio!",
    desc:
      "Adicione funcionários para ajudar no dia a dia. A partir de R$ 25,00/mês.\n" +
      "✓ Controle total de permissões  ✓ Acompanhamento de produtividade  ✓ Notificações via WhatsApp  ✓ Relatórios por funcionário",
    button: "Ver Funcionários",
  },

  weekSummary: {
    cards: [
      { label: "Cobranças", value: 0, hint: "esta semana" },
      { label: "Recebido", value: "R$ 0,00", hint: "esta semana" },
      { label: "Vence hoje", value: 0, hint: "cobranças" },

      { label: "Empréstimos", value: 0, hint: "esta semana" },
      { label: "Produtos", value: 0, hint: "esta semana" },
      { label: "Previsão de Lucro", value: "R$ 0,00", hint: "valor a receber - capital" },
      { label: "Contratos", value: 0, hint: "esta semana" },

      { label: "Juros a receber", value: "R$ 0,00", hint: "últimos 6 meses" },
      { label: "Recebido", value: "R$ 0,00", hint: "total recebido" },
      { label: "Capital em mão", value: "R$ 0,00", hint: "capital emprestado" },
      { label: "Juros recebidos", value: "R$ 0,00", hint: "últimos pagamentos" },

      { label: "Clientes", value: 0, hint: "cadastrados" },
    ],
  },

  charts: {
    evolucao: {
      title: "Evolução Financeira (últimos 6 meses)",
      labels: ["Ago", "Set", "Out", "Nov", "Dez", "Jan"],
      emprestado: [0, 0, 0, 0, 0, 0],
      recebido: [0, 0, 0, 0, 0, 0],
    },
    juros: {
      title: "Tendência de Juros Recebidos",
      labels: ["Ago", "Set", "Out", "Nov", "Dez", "Jan"],
      jurosMes: [0, 0, 0, 0, 0, 0],
      jurosAcumulado: [0, 0, 0, 0, 0, 0],
    },
  },

  health: {
    score: 80,
    status: "Excelente",
    desc:
      "Baseado em sua taxa de recebimento, inadimplência e liquidez em caixa.",
    bars: [
      { label: "Taxa de recebimento", value: "100.0%" },
      { label: "Inadimplência", value: "0.0%" },
      { label: "Recebido", value: "R$ 0,00" },
      { label: "Em atraso", value: "R$ 0,00" },
    ],
    noteTitle: "Tudo em ordem!",
    noteDesc: "Nenhum alerta no momento. Continue assim!",
  },
};
