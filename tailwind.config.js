/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(16,185,129,.35), 0 0 20px rgba(16,185,129,.10)",
      },
    },
  },
  plugins: [],
};
