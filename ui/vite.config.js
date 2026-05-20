import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/reactflow")) {
            return "reactflow";
          }

          if (
            id.includes("node_modules/@radix-ui/react-accordion")
            || id.includes("node_modules/@radix-ui/react-dialog")
            || id.includes("node_modules/@radix-ui/react-select")
            || id.includes("node_modules/@radix-ui/react-tabs")
          ) {
            return "radix";
          }

          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react";
          }

          if (
            id.includes("node_modules/@monaco-editor/react")
            || id.includes("node_modules/monaco-editor")
          ) {
            return "monaco";
          }

          return undefined;
        },
      },
    },
  },
});
