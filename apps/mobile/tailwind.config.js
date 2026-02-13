/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        osu: {
          scarlet: "#BB0000",
          dark: "#222222",
          light: "#F7F7F7",
        },
      },
    },
  },
  plugins: [],
};
