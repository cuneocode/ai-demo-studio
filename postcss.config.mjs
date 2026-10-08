import tailwind from "@tailwindcss/postcss";
import lightTheme from "./scripts/postcss-light-theme.mjs";

const config = {
  plugins: [tailwind(), lightTheme()],
};

export default config;
