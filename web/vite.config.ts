import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

const buildEnvironment = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

export default defineConfig({
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __SHARING_ENABLED__: JSON.stringify(buildEnvironment?.HERITG_SHARING_ENABLED !== "false")
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Heritg Family Tree",
        short_name: "Heritg",
        description: "Private, offline family trees stored on your device.",
        theme_color: "#f7f3ec",
        background_color: "#f5f5f3",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/(?:api\/|health$|ready$)/],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\//,
            handler: "NetworkOnly",
            method: "POST"
          },
          {
            urlPattern: /^https:\/\/(?:[^/]+\.)?storage\.googleapis\.com\//,
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "es6-promise-pool": new URL("./src/promisePool.ts", import.meta.url).pathname
    }
  },
  optimizeDeps: {
    include: ["@excalidraw/excalidraw"]
  },
  test: {
    environment: "jsdom"
  }
});
