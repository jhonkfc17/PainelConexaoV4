import React, { useEffect, useState } from "react";
import { getTheme, setTheme, styles } from "./ui";

export default function TopBar({ email, onRefresh, refreshing, onExportCsv, onSignOut }) {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") || getTheme();
    setTheme(saved);
    setThemeState(saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
    localStorage.setItem("theme", next);
  }

  return (
    <div style={{ ...styles.card, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 900, letterSpacing: -0.3, fontSize: 18 }}>💸 Minhas Carteira</div>
          <div style={{ ...styles.muted, fontSize: 13 }}>{email ? `Logado como: ${email}` : ""}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={styles.btnGhost} type="button" onClick={toggleTheme}>
            {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
          </button>
          <button style={styles.btnGhost} type="button" onClick={onExportCsv}>
            Exportar CSV
          </button>
          <button style={styles.btnGhost} type="button" onClick={onRefresh}>
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
          <button style={styles.btn} type="button" onClick={onSignOut}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
