import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Defense-in-depth Content-Security-Policy, injected into the built index.html
// only (dev/HMR needs a looser policy). The app makes no network calls and has
// no external scripts; styles/fonts come from Google Fonts. `script-src` keeps
// 'unsafe-inline' for the small inline theme + SPA-restore scripts (a future
// hardening is to pin those by hash and drop 'unsafe-inline').
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function cspPlugin(enabled: boolean): Plugin {
  return {
    name: "inject-csp",
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  };
}

// https://vitejs.dev/config/
// Production is served from a subpath on GitHub Pages (/project-tracker/), while
// local dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/project-tracker/" : "/",
  plugins: [react(), cspPlugin(command === "build")],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
