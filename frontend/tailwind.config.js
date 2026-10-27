/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05060b",
        panel: "#0c0e16",
        panel2: "#12151f",
        line: "#1f2333",
        ink: "#eef0f7",
        muted: "#8b91a8",
        brand: "#8b7bff", // primary — violet
        speak: "#38bdf8", // agent speaking — sky
        good: "#34d399", // success / booked
        warn: "#fbbf24",
        danger: "#fb7185",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,123,255,0.35), 0 8px 40px -8px rgba(139,123,255,0.45)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 40px -16px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
