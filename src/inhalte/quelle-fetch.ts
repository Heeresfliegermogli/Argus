// Quelle für die Webseite: lädt die JSON-Dateien zur Laufzeit aus ./daten/.
// So lassen sich Szenario, Karte und Kataloge auf dem Server austauschen, ohne neu zu bauen.

export const quelleArt = "netz" as const;

export async function holeJson(name: string): Promise<unknown> {
  const url = new URL(`daten/${name}`, document.baseURI);
  const antwort = await fetch(url, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(`${name}: HTTP ${antwort.status}`);
  return antwort.json();
}
