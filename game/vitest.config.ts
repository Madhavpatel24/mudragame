import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@switcher": path.resolve(__dirname, "../switcher/src/index.ts"),
      "@asamyukta": path.resolve(__dirname, "../asamyukta/frontend/lib"),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
})
