// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  output: "static",
  adapter: vercel(),
  integrations: [tailwind()],
  redirects: {
    "/locales/menu-ruta-litoral": "/menu",
  },
  build: {
    assets: "_astro",
  },
});
