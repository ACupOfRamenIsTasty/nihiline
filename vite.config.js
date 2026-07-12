import { defineConfig } from "vite"

export default defineConfig({
  // Use relative asset paths so the built site works when hosted under a
  // subpath (e.g. GitHub Pages at /nihiline/).
  base: "./",
  server: {
    host: true,
  },
})
