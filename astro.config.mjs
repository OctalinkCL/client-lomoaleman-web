// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel({ maxDuration: 60 }),
  integrations: [tailwind()],
  redirects: {
    "/locales/menu-ruta-litoral": "/menu",
  },
  build: {
    assets: "_astro",
  },
});
