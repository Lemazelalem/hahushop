/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lemon: "rgb(180 255 120)",
        softblue: "rgb(120 190 255)",
      },
      keyframes: {
        "btn-glow": {
          "0%, 100%": { boxShadow: "0 4px 14px rgba(255,0,80,0.4)" },
          "50%":       { boxShadow: "0 4px 28px rgba(255,0,80,0.75), 0 0 0 4px rgba(255,0,80,0.12)" },
        },
        "usd-glow": {
          "0%, 100%": { boxShadow: "0 0 0px rgba(238,130,238,0)" },
          "50%":       { boxShadow: "0 0 10px rgba(238,130,238,0.8)" },
        },
      },
      animation: {
        "btn-glow":  "btn-glow 2s ease-in-out infinite",
        "usd-glow":  "usd-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
