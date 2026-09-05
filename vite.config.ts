// The shared vite-tanstack-config preset already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * iOS AR Quick Look refuses a .usdz that is not served as `model/vnd.usd+zip`,
 * and Vite's static middleware does not know the extension. Production is
 * handled by `public/_headers`; this covers `vite dev` and `vite preview`.
 */
function usdzMimeType(): Plugin {
  const setType = (
    req: { url?: string | undefined },
    res: { setHeader: (k: string, v: string) => void },
  ) => {
    if (req.url?.split("?")[0]?.endsWith(".usdz")) {
      res.setHeader("Content-Type", "model/vnd.usd+zip");
    }
  };
  return {
    name: "usdz-mime-type",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        setType(req, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        setType(req, res);
        next();
      });
    },
  };
}

export default defineConfig({
  // Keep a single three.js instance across three / fiber / drei / xr.
  vite: {
    plugins: [usdzMimeType()],
    resolve: { dedupe: ["three"] },
    // USDZ is a zip container — recompressing it gains nothing and Quick Look
    // needs the bytes served verbatim.
    assetsInclude: ["**/*.usdz"],
    server: {
      // Allow all hosts (ngrok, remote preview, local network, etc.)
      // `true` disables the host allowlist check.
      allowedHosts: true,
      host: true,
      port: 8080,
      strictPort: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
