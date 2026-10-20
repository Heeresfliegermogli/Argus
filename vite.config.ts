// Vite-Konfiguration für ARGUS.
//
// Zwei Builds aus demselben Code:
//   vite build                 → dist/          Webseite (GitHub Pages). Inhalte werden zur Laufzeit
//                                               aus dist/daten/*.json geladen, also ohne Neubau austauschbar.
//   vite build --mode offline  → dist-offline/  eine einzige HTML-Datei mit eingebetteten Inhalten.
//                                               Läuft per Doppelklick (file://), Rückfall Variante C.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

function gitStand(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "lokal";
  }
}

export default defineConfig(({ mode }) => {
  const offline = mode === "offline";
  const quelle = offline ? "./src/inhalte/quelle-eingebettet.ts" : "./src/inhalte/quelle-fetch.ts";
  return {
    base: "./",
    publicDir: offline ? false : "public",
    plugins: [preact(), ...(offline ? [viteSingleFile()] : [])],
    resolve: { alias: { "@quelle": fileURLToPath(new URL(quelle, import.meta.url)) } },
    define: {
      __ARGUS_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
      __ARGUS_STAND__: JSON.stringify(`${gitStand()} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`),
      __ARGUS_OFFLINE__: JSON.stringify(offline),
    },
    build: {
      outDir: offline ? "dist-offline" : "dist",
      emptyOutDir: true,
      target: "es2022",
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup.ts"],
    },
  };
});
