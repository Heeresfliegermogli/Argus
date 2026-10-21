// Zugriff auf die Assets (Karte, Drohnenbilder, Sprites, Effekte) über das Manifest.
// Die Quelle (Netz oder in die Offline-Datei eingebettet) wählt der Build über den Alias @assetquelle.
import { assetUrl, holeJsonAsset, holeManifest } from "@assetquelle";
import type { AssetManifest, Drohnenbild } from "./typen";

export { assetUrl };
export type { AssetManifest, Drohnenbild };

let laden: Promise<AssetManifest> | null = null;

/** Manifest einmal laden (alle Aufrufer teilen sich dieselbe Anfrage). */
export function ladeManifest(): Promise<AssetManifest> {
  laden ??= holeManifest().catch((e) => {
    laden = null;
    throw e;
  });
  return laden;
}

/** Drohnenbild einer Meldung (oder eines Zielbilds der Spielleitung). */
export function drohnenbild(man: AssetManifest, id: string): Drohnenbild | null {
  return man.drohne[id] ?? man.zielbilder[id] ?? null;
}

/** Spritesheet-Daten eines Atlas: JSON (PixiJS-Format) und Adresse des Bildes. */
export async function atlas(man: AssetManifest, welcher: "fahrzeuge" | "effekte"): Promise<{ json: unknown; bildUrl: string }> {
  const a = man[welcher];
  return { json: await holeJsonAsset(a.json), bildUrl: assetUrl(a.bild) };
}

const vorgeladen = new Set<string>();

/** Bilder im Hintergrund laden, damit sie beim Anzeigen sofort da sind. */
export function vorladen(pfade: string[]): void {
  if (typeof Image === "undefined") return;
  for (const p of pfade) {
    if (vorgeladen.has(p)) continue;
    vorgeladen.add(p);
    const img = new Image();
    img.decoding = "async";
    img.src = assetUrl(p);
  }
}
