// Programmstand aktuell? (Liste L, L4.1) Der Build legt version.json (Commit + Zeit) neben index.html. Jedes Fenster fragt alle 60 s
// nach (ohne Zwischenspeicher) und wenn der Tab wieder in den Vordergrund kommt. Ist der Stand dort ein anderer als der eigene:
// Banner „Neue Version – bitte neu laden“; Startseite und Lobby laden selbst neu. Offline-Datei: keine Abfrage.
// Anlass: Am 12.11. rechneten wiederhergestellte Tabs mit altem Code weiter, ohne dass es jemand sah.
import { useEffect, useState } from "preact/hooks";

const TAKT_MS = 60000;
let neu: string | null = null;
let gestartet = false;
const hoerer = new Set<() => void>();

async function pruefe(): Promise<void> {
  try {
    // ohne Zwischenspeicher – auch nicht den des Servers davor (GitHub Pages hält Dateien bis zu 10 min)
    const adresse = new URL("version.json", document.baseURI);
    adresse.searchParams.set("t", String(Date.now()));
    const antwort = await fetch(adresse, { cache: "no-store" });
    if (!antwort.ok) return;
    const d = (await antwort.json()) as { commit?: unknown };
    const commit = typeof d.commit === "string" ? d.commit : null;
    const jetztNeu = commit && commit !== __ARGUS_COMMIT__ ? commit : null;
    if (jetztNeu !== neu) {
      neu = jetztNeu;
      hoerer.forEach((cb) => cb());
    }
  } catch {
    /* kein Netz, Entwicklungsserver ohne version.json */
  }
}

function starte(): void {
  if (gestartet || __ARGUS_OFFLINE__ || typeof window === "undefined" || location.protocol === "file:") return;
  gestartet = true;
  setInterval(() => void pruefe(), TAKT_MS);
  window.addEventListener("focus", () => void pruefe());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pruefe(); });
  setTimeout(() => void pruefe(), 4000);
}

/** Commit der neueren Version auf dem Server, sonst null. */
export function useNeueVersion(): string | null {
  const [, setN] = useState(0);
  useEffect(() => {
    starte();
    const cb = () => setN((n) => n + 1);
    hoerer.add(cb);
    return () => { hoerer.delete(cb); };
  }, []);
  return neu;
}

/**
 * Startseite und Lobby: von selbst neu laden, sobald es eine neue Version gibt – je Version höchstens einmal (liefert der Server
 * danach noch die alte Seite aus dem Zwischenspeicher, bleibt es beim Banner statt einer Schleife).
 */
export function useSelbstNeuLaden(): string | null {
  const v = useNeueVersion();
  useEffect(() => {
    if (!v) return;
    try {
      if (sessionStorage.getItem("argus:neugeladen") === v) return;
      sessionStorage.setItem("argus:neugeladen", v);
    } catch {
      return;
    }
    location.reload();
  }, [v]);
  return v;
}
