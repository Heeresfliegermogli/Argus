// Asset-Quelle der Webseite: Dateien liegen unter assets/ neben der Seite (GitHub Pages).
import type { AssetManifest } from "./typen";

export const assetQuelle = "netz" as const;

export function assetUrl(pfad: string): string {
  return new URL(`assets/${pfad}`, document.baseURI).href;
}

export async function holeManifest(): Promise<AssetManifest> {
  const antwort = await fetch(assetUrl("manifest.json"), { cache: "no-cache" });
  if (!antwort.ok) throw new Error(`assets/manifest.json: HTTP ${antwort.status}`);
  return antwort.json() as Promise<AssetManifest>;
}

export async function holeJsonAsset(pfad: string): Promise<unknown> {
  const antwort = await fetch(assetUrl(pfad));
  if (!antwort.ok) throw new Error(`assets/${pfad}: HTTP ${antwort.status}`);
  return antwort.json();
}
