import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    holdUntilCrawlEnd: false,
    include: ["phaser"],
    noDiscovery: true,
    rolldownOptions: {
      // Phaser's unminified development bundle is more than 20 MB. Parsing it
      // again on every document reload can starve the game loop and even crash
      // constrained browser renderers. Keep the development dependency cache
      // compact; application source still retains normal Vite HMR semantics.
      output: { minify: true },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    warmup: {
      clientFiles: ["./src/main.ts", "./src/render/scenes/AlpineScene.ts"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
});
