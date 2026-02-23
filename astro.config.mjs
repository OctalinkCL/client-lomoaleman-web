// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/serverless";

// https://astro.build/config
export default defineConfig({
  output: "hybrid",
  adapter: vercel({ maxDuration: 60 }),
  integrations: [tailwind()],
  redirects: {
    "/locales/menu-ruta-litoral": "/menu",
  },
  build: {
    assets: "_astro",
  },
});
