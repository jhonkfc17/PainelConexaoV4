import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Ative sourcemaps em produção para conseguir rastrear erros minificados no Vercel
 * (ex.: "L is not a function") até o arquivo/linha real do TypeScript.
 *
 * Depois que estabilizar, você pode desativar se quiser.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
  },
});
