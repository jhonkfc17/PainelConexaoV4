import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Log completo no console para debug em produção
    console.error("[UI Crash] ErrorBoundary capturou um erro:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg =
      this.state.error instanceof Error
        ? this.state.error.message
        : String(this.state.error ?? "Erro desconhecido");

    return (
      <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          Ocorreu um erro no carregamento
        </h1>
        <p style={{ marginBottom: 12 }}>
          Abra o console (F12) para ver detalhes. Se isso estiver no Vercel,
          verifique também as variáveis <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <pre
          style={{
            background: "rgba(0,0,0,0.06)",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </pre>
      </div>
    );
  }
}
