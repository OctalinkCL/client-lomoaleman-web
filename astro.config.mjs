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
    "/wordpress/wp-content/uploads/2023/12/carta_colon.pdf": "/carta",
  },
  build: {
    assets: "_astro",
  },
});
