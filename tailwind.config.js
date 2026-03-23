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
    },
  },
  plugins: [],
};
