/** @type {import('tailwindcss').Config} */
// Colours point at the CSS variables in src/index.css, so they follow the
// light/dark theme.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        card: "var(--card)",
        line: "var(--line)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        accent: "var(--accent)",
        green: "var(--green)",
        amber: "var(--amber)",
        red: "var(--red)",
        blue: "var(--blue)",
        purple: "var(--purple)",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "-apple-system", '"Segoe UI"', "Helvetica", "Arial", "sans-serif"],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
