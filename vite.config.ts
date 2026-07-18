import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
// Production is served from a subpath on GitHub Pages (/project-tracker/), while
// local dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/project-tracker/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
