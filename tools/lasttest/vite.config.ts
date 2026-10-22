// Baut die Lasttest-Seite als eine einzige HTML-Datei nach public/lasttest.html. Der normale Build der Spielseite
// (npm run build, GitHub Actions) kopiert public/ unverändert nach dist/ – so liegt die Seite ohne Änderung an
// Build oder Workflow unter …/Argus/lasttest.html. Inhalte (Szenario, Karte, Kataloge) lädt sie zur Laufzeit aus
// ./daten/ wie die Spielseite.
//
// Neu bauen nach Änderungen an Engine, Sitzung, Sync oder Szenario:
//   npx vite build --config tools/lasttest/vite.config.ts
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Plugin, defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const hier = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const ZIEL = hier("../../public/lasttest.html");

function gitStand(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "lokal";
  }
}

/** Nur die Angaben aus tests/referenz_durchlauf.json, die der Plan braucht (statt 76 KB in der Seite). */
function laeufe(): Plugin {
  const id = "virtual:argus-laeufe";
  return {
    name: "argus-laeufe",
    resolveId: (x) => (x === id ? `\0${id}` : null),
    load(x) {
      if (x !== `\0${id}`) return null;
      const ref = JSON.parse(readFileSync(hier("../../tests/referenz_durchlauf.json"), "utf-8")) as {
        zeiten: unknown; reihenfolge_wirkmittel: unknown; laeufe: { team: string; einspielen: Record<string, number> }[];
      };
      const auszug = { zeiten: ref.zeiten, reihenfolge_wirkmittel: ref.reihenfolge_wirkmittel, laeufe: ref.laeufe.map((l) => ({ team: l.team, einspielen: l.einspielen })) };
      return `export default ${JSON.stringify(auszug)};`;
    },
  };
}

function nachPublic(): Plugin {
  return {
    name: "lasttest-nach-public",
    apply: "build",
    closeBundle(fehler?: Error) {
      if (fehler || !existsSync(hier("dist/lasttest.html"))) return;
      copyFileSync(hier("dist/lasttest.html"), ZIEL);
      console.log("public/lasttest.html geschrieben");
    },
  };
}

const paket = JSON.parse(readFileSync(hier("../../package.json"), "utf-8")) as { version: string };

export default defineConfig({
  root: hier("."),
  base: "./",
  publicDir: false,
  plugins: [laeufe(), viteSingleFile(), nachPublic()],
  resolve: {
    alias: {
      "@quelle": hier("../../src/inhalte/quelle-fetch.ts"),
      "@assetquelle": hier("../../src/assets/quelle-netz.ts"),
    },
  },
  define: {
    __ARGUS_VERSION__: JSON.stringify(paket.version),
    __ARGUS_STAND__: JSON.stringify(`${gitStand()} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`),
    __ARGUS_OFFLINE__: JSON.stringify(false),
  },
  build: {
    outDir: hier("dist"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: hier("lasttest.html") },
  },
});
