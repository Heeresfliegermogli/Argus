// Quelle für die Offline-Datei (Variante C): Die JSON-Dateien werden beim Bauen eingebettet,
// weil eine per Doppelklick geöffnete Datei (file://) keine anderen Dateien nachladen darf.

export const quelleArt = "eingebettet" as const;

const dateien = import.meta.glob("/public/daten/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export async function holeJson(name: string): Promise<unknown> {
  const inhalt = dateien[`/public/daten/${name}`];
  if (inhalt === undefined) throw new Error(`${name} ist nicht in die Offline-Datei eingebettet`);
  return structuredClone(inhalt);
}
