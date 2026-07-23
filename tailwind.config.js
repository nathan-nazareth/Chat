/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "#0a0a0c",
          raised: "rgba(24, 24, 27, 0.6)",
          overlay: "rgba(39, 39, 42, 0.8)",
        },
        accent: {
          DEFAULT: "#818cf8",
          hover: "#a5b4fc",
          muted: "rgba(129, 140, 248, 0.15)",
          glow: "rgba(129, 140, 248, 0.08)",
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(129, 140, 248, 0.15)",
        "glow-lg": "0 0 40px rgba(129, 140, 248, 0.2)",
        soft: "0 4px 24px rgba(0, 0, 0, 0.4)",
        elevated: "0 8px 32px rgba(0, 0, 0, 0.5)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
