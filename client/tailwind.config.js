/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors based on README
        // Background: very light gray
        // Surfaces: white cards
        // Primary accent: soft blue
        // Secondary accent: teal/emerald
        // Text: slate-900, slate-500/600
        // Status: red-500/600, amber-500, blue-500
      },
    },
  },
  plugins: [],
}
