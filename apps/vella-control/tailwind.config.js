/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./styles/**/*.css",
  ],
  theme: {
    extend: {
      colors: {
        vc: {
          bg: "var(--vc-bg)",
          surface: "var(--vc-surface)",
          surfaceMuted: "var(--vc-surface-muted)",
          border: "var(--vc-border-subtle)",
          text: "var(--vc-text-primary)",
          muted: "var(--vc-text-muted)",
          accent: "var(--vc-accent)",
          sidebar: "var(--vc-sidebar-bg)",
        },
      },
      borderRadius: {
        card: "var(--vc-radius-card)",
      },
      boxShadow: {
        soft: "var(--vc-shadow-soft)",
      },
    },
  },
  plugins: [],
};


