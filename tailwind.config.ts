import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        campground: {
          50: "#fefaf5",
          100: "#fef3e6",
          500: "#f97316"
        },
        meadow: {
          500: "#22c55e"
        }
      }
    }
  },
  plugins: []
};

export default config;
