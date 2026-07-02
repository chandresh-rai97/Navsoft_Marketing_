/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151a21",
        "ink-2": "#212934",
        paper: "#f6f5f1",
        "paper-2": "#edeae2",
        card: "#ffffff",
        line: "#e0ddd4",
        muted: "#6b7280",
        "muted-2": "#8b8f98",
        accent: "#0f7b6c",
        green: "#0f7b6c",
        amber: "#c8790f",
        red: "#b23a3a",
        blue: "#2f6db3",
        purple: "#6b4fa3",
      },
      fontFamily: {
        sans: ['"Inter"', '"Helvetica Neue"', "Arial", "sans-serif"],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
