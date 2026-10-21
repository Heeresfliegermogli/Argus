// Asset-Quelle der Offline-Datei (Variante C): Bilder und JSON werden beim Bauen eingebettet
// (Bilder als data:-Adressen), weil eine per Doppelklick geöffnete Datei nichts nachladen darf.
// Nicht eingebettet: die Luftbild-Kacheln (0,25 m/px) und die beschriftete Vorschau-Lagekarte.
import type { AssetManifest } from "./typen";

export const assetQuelle = "eingebettet" as const;

const bilder = import.meta.glob(
  ["/public/assets/**/*.webp", "/public/assets/**/*.png", "!/public/assets/karte/kacheln/**", "!/public/assets/karte/lagekarte_beschriftet.webp"],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
const json = import.meta.glob("/public/assets/**/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export function assetUrl(pfad: string): string {
  const url = bilder[`/public/assets/${pfad}`];
  if (url === undefined) throw new Error(`assets/${pfad} ist nicht in die Offline-Datei eingebettet`);
  return url;
}

export async function holeManifest(): Promise<AssetManifest> {
  const m = json["/public/assets/manifest.json"];
  if (m === undefined) throw new Error("assets/manifest.json ist nicht eingebettet");
  return structuredClone(m) as AssetManifest;
}

export async function holeJsonAsset(pfad: string): Promise<unknown> {
  const j = json[`/public/assets/${pfad}`];
  if (j === undefined) throw new Error(`assets/${pfad} ist nicht eingebettet`);
  return structuredClone(j);
}
