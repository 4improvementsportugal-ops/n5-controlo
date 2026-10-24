import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18221e",
        muted: "#5a6863",
        line: "#d9e0dc",
        surface: "#ffffff",
        canvas: "#f4f6f4",
        accent: { DEFAULT: "#0e6a5a", soft: "#e0efea" },
        good: "#1d7a3b",
        warn: "#a96200",
        bad: "#b0281f",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
