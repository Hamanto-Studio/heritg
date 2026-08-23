import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import packageJson from "./package.json";

const buildEnvironment = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const useExcalidrawFallback = buildEnvironment?.HERITG_CANVAS_RENDERER === "excalidraw" ||
  buildEnvironment?.VITE_HERITG_CANVAS_RENDERER === "excalidraw";
const debugContextEnabled = buildEnvironment?.HERITG_DEBUG_CONTEXT === "1";
const revenueCatPublicApiKey = buildEnvironment?.HERITG_REVENUECAT_PUBLIC_API_KEY ?? "";
const familyEnabled = buildEnvironment?.HERITG_FAMILY_ENABLED === "true";
const deploymentEnvironment = buildEnvironment?.HERITG_DEPLOYMENT_ENV === "staging"
  ? "staging"
  : "production";
const isStaging = deploymentEnvironment === "staging";
const debugContextPath = new URL("./.heritg-debug-context.json", import.meta.url);
const debugContextTemporaryPath = new URL("./.heritg-debug-context.tmp", import.meta.url);

const readRequestBody = async (request: IncomingMessage) => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.length;
    if (size > 10 * 1024 * 1024) throw new Error("Debug context exceeds 10 MiB.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const activeFamilyDebugPlugin = (): Plugin => ({
  name: "heritg-active-family-debug-context",
  apply: "serve",
  configureServer(server) {
    if (!debugContextEnabled) return;

    let writeQueue = rm(debugContextPath, { force: true });
    server.middlewares.use(async (request, response, next) => {
      if (request.url !== "/__heritg/debug-context") {
        next();
        return;
      }
      const remoteAddress = request.socket.remoteAddress;
      if (remoteAddress !== "127.0.0.1" && remoteAddress !== "::1" && remoteAddress !== "::ffff:127.0.0.1") {
        response.statusCode = 403;
        response.end();
        return;
      }
      if (request.method !== "POST" || request.headers["content-type"] !== "application/json") {
        response.statusCode = 405;
        response.end();
        return;
      }

      try {
        const context = JSON.parse(await readRequestBody(request)) as unknown;
        writeQueue = writeQueue.then(async () => {
          await writeFile(debugContextTemporaryPath, `${JSON.stringify(context, null, 2)}\n`, {
            mode: 0o600
          });
          await rename(debugContextTemporaryPath, debugContextPath);
        });
        await writeQueue;
        response.statusCode = 204;
        response.end();
      } catch (error) {
        server.config.logger.error(`Unable to write family debug context: ${String(error)}`);
        response.statusCode = 400;
        response.end();
      }
    });
  }
});

const deploymentBrandPlugin = (): Plugin => ({
  name: "heritg-deployment-brand",
  transformIndexHtml(html) {
    if (!isStaging) return html;
    return html
      .replace("<title>Heritg</title>", "<title>Heritg Staging | Test Data Only</title>")
      .replace('<meta name="theme-color" content="#f7f3ec" />', '<meta name="theme-color" content="#4c1d95" />');
  }
});

export default defineConfig({
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __SHARING_ENABLED__: JSON.stringify(buildEnvironment?.HERITG_SHARING_ENABLED !== "false"),
    __EXCALIDRAW_FALLBACK__: JSON.stringify(useExcalidrawFallback),
    __DEBUG_CONTEXT_ENABLED__: JSON.stringify(debugContextEnabled),
    __DEPLOYMENT_ENV__: JSON.stringify(deploymentEnvironment),
    __GOOGLE_CLIENT_ID__: JSON.stringify(buildEnvironment?.HERITG_GOOGLE_CLIENT_ID ?? ""),
    __FAMILY_ENABLED__: JSON.stringify(familyEnabled),
    __PRO_ENABLED__: JSON.stringify(familyEnabled),
    __REVENUECAT_PUBLIC_API_KEY__: JSON.stringify(revenueCatPublicApiKey)
  },
  plugins: [
    react(),
    deploymentBrandPlugin(),
    activeFamilyDebugPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: isStaging ? "Heritg Staging - Test Data Only" : "Heritg Family Tree",
        short_name: isStaging ? "Heritg Staging" : "Heritg",
        description: isStaging
          ? "Temporary Heritg staging environment for synthetic test data only."
          : "Private, offline family trees stored on your device.",
        theme_color: isStaging ? "#4c1d95" : "#f7f3ec",
        background_color: isStaging ? "#f3e8ff" : "#f5f5f3",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        globIgnores: ["**/Purchases.es-*.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/(?:api\/|health$|ready$)/, /^\/auth\/email\/?$/],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\//,
            handler: "NetworkOnly"
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
    include: useExcalidrawFallback ? ["@excalidraw/excalidraw"] : []
  },
  test: {
    environment: "jsdom"
  }
});
